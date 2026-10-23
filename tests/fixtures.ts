import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { independentPdf } from './independent';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function makeFixtures() {
  const canvas = createCanvas(480, 640);
  const context = canvas.getContext('2d');
  const image = context.createImageData(480, 640);
  let state = 9137;
  for (let i = 0; i < image.data.length; i += 4) {
    state = (state * 1664525 + 1013904223) >>> 0;
    image.data[i] = state & 255;
    image.data[i + 1] = (state >> 8) & 255;
    image.data[i + 2] = (state >> 16) & 255;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  context.fillStyle = 'white';
  context.fillRect(20, 30, 440, 90);
  context.fillStyle = '#302b3b';
  context.font = '30px sans-serif';
  context.fillText('A SCANNED PAGE', 50, 88);
  const png = canvas.toBuffer('image/png');
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const first = document.addPage([400, 500]);
  first.drawText('ALPHA FIRST', { x: 40, y: 390, size: 24, font });
  first.drawRectangle({ x: 40, y: 50, width: 100, height: 70, color: rgb(0.45, 0.3, 0.8) });
  const second = document.addPage([600, 400]);
  second.setRotation(degrees(90));
  second.setCropBox(20, 10, 550, 370);
  second.drawText('BETA SECOND', { x: 60, y: 270, size: 24, font });
  const embedded = await document.embedPng(png);
  document.addPage([400, 500]).drawImage(embedded, { x: 0, y: 0, width: 400, height: 500 });
  const pdf = Buffer.from(await document.save({ useObjectStreams: false }));
  const tiny = await PDFDocument.create();
  tiny.addPage([200, 300]).drawText('GAMMA LAST', { x: 20, y: 200, size: 14 });
  const alpha = createCanvas(180, 80);
  const alphaContext = alpha.getContext('2d');
  alphaContext.fillStyle = '#7659d8';
  alphaContext.fillRect(20, 20, 100, 40);
  const webp = canvas.toBuffer('image/webp');
  const jpeg = canvas.toBuffer('image/jpeg');
  const tooMany = await PDFDocument.create();
  for (let i = 0; i < 501; i++) tooMany.addPage([100, 100]);
  return {
    pdf,
    tiny: Buffer.from(await tiny.save()),
    png,
    transparent: alpha.toBuffer('image/png'),
    webp,
    jpeg,
    tooMany: Buffer.from(await tooMany.save()),
  };
}
export async function inspectPdf(buffer: Uint8Array, password?: string) {
  const task = getDocument({
    data: new Uint8Array(buffer),
    password,
    useSystemFonts: true,
  });
  try {
    const document = await task.promise;
    const pages = [];
    for (let i = 1; i <= document.numPages; i++) {
      const page = await document.getPage(i);
      const text = await page.getTextContent();
      pages.push({
        text: text.items.map((item) => ('str' in item ? item.str : '')).join(' '),
        rotation: page.rotate,
        view: page.view,
        viewport: page.getViewport({ scale: 1 }),
      });
    }
    return { count: document.numPages, pages };
  } finally {
    await task.destroy();
  }
}
export async function renderPdf(buffer: Uint8Array, pageNumber: number) {
  const report = await independentPdf(
    buffer,
    resolve(`.cache/renders/${randomUUID()}.pdf`),
    undefined,
    pageNumber,
  );
  const image = await loadImage(report.render!);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  return {
    data: context.getImageData(0, 0, canvas.width, canvas.height).data,
    width: canvas.width,
    height: canvas.height,
  };
}
