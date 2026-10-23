import {
  PDFDocument,
  rgb,
  degrees,
  pushGraphicsState,
  popGraphicsState,
  rectangle,
  clip,
  endPath,
} from 'pdf-lib';
import type { PDFPage, PDFFont } from 'pdf-lib';
import { zipSync } from 'fflate';
import type { OutputFile, ProcessingJob, ProcessingResult, WorkerResponse } from './types';
import { MAX_BYTES, MAX_PAGES } from './types';
import { parseRange, safeStem } from './utils';
import { pageNumber, viewToPdf, visibleSize, visibleBox, annotationPosition } from './geometry';
import { qpdfSession } from './qpdf';
import { checkDocument } from './preservation';
import { loadPdfSafely } from './safe-pdf';
import { validatePassword } from './password';
import { validateJob } from './validate-job';
import { validateKind } from './utils';
import { checkCanvas, checkOutput, imageDimensions, MAX_RASTER_PIXELS } from './limits';
import annotationFontUrl from 'pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url';

type Progress = (message: Extract<WorkerResponse, { type: 'progress' }>) => void;
const pdfFile = (name: string, data: Uint8Array): OutputFile => ({
  name,
  data,
  type: 'application/pdf',
});
async function loadFont(document: PDFDocument): Promise<PDFFont> {
  const { default: fontkit } = await import('@pdf-lib/fontkit');
  document.registerFontkit(fontkit);
  const response = await fetch(annotationFontUrl);
  if (!response.ok)
    throw new Error('The local annotation font could not be loaded. Please reload and try again.');
  return document.embedFont(await response.arrayBuffer(), { subset: true });
}

function drawText(
  page: PDFPage,
  text: string,
  font: PDFFont,
  options: ProcessingJob['options'],
  size: number,
  opacity: number,
  angle = 0,
) {
  const box = visibleBox(page.getMediaBox(), page.getCropBox());
  const rotation = page.getRotation().angle;
  const view = visibleSize(box, rotation);
  const supported = font.getCharacterSet();
  if ([...text].some((char) => !supported.includes(char.codePointAt(0)!)))
    throw new Error(
      'This text contains characters that the bundled font cannot display. Try Latin, Greek, or Cyrillic characters.',
    );
  const width = font.widthOfTextAtSize(text, size);
  const theta = (angle * Math.PI) / 180;
  // Center the text baseline in the same visible coordinate system as the preview.
  const { x: cx, y: cy } = annotationPosition(options.x, options.y, view.width, view.height);
  const x = cx - (width / 2) * Math.cos(theta) - size * 0.34 * Math.sin(theta);
  const y = cy - (width / 2) * Math.sin(theta) + size * 0.34 * Math.cos(theta);
  const anchor = viewToPdf(x, y, box, rotation);
  const color = /^#[0-9a-f]{6}$/i.test(options.color) ? options.color : '#7560d5';
  page.drawText(text, {
    ...anchor,
    font,
    size,
    opacity,
    rotate: degrees(rotation - angle),
    color: rgb(
      parseInt(color.slice(1, 3), 16) / 255,
      parseInt(color.slice(3, 5), 16) / 255,
      parseInt(color.slice(5, 7), 16) / 255,
    ),
  });
}

function requireCanvas() {
  if (
    typeof OffscreenCanvas === 'undefined' ||
    typeof OffscreenCanvas.prototype.convertToBlob !== 'function' ||
    typeof createImageBitmap !== 'function'
  )
    throw new Error(
      'This tool needs OffscreenCanvas and image decoding in a worker. Update your browser or use a current desktop browser.',
    );
}

async function bitmap(file: Blob) {
  try {
    await imageDimensions(file);
    const image = await createImageBitmap(file, { imageOrientation: 'from-image' });
    if (image.width * image.height > 16_000_000) {
      image.close();
      throw new Error('Image dimensions exceed the safe limit.');
    }
    return image;
  } catch {
    throw new Error('An image could not be decoded. Try a smaller JPEG, PNG, or WebP file.');
  }
}
async function canvasImage(file: Blob) {
  requireCanvas();
  const image = await bitmap(file);
  const originalWidth = image.width,
    originalHeight = image.height;
  const scale = Math.min(1, 4096 / Math.max(image.width, image.height));
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(image.width * scale)),
    Math.max(1, Math.round(image.height * scale)),
  );
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not create an image canvas.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const result = {
    data: new Uint8Array(await blob.arrayBuffer()),
    width: canvas.width,
    height: canvas.height,
    originalWidth,
    originalHeight,
  };
  canvas.width = canvas.height = 1;
  return result;
}

class OffscreenFactory {
  create(width: number, height: number) {
    checkCanvas(Math.ceil(width), Math.ceil(height));
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.ceil(width)),
      Math.max(1, Math.ceil(height)),
    );
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');
    return { canvas, context };
  }
  reset(target: { canvas: OffscreenCanvas }, width: number, height: number) {
    checkCanvas(width, height);
    target.canvas.width = width;
    target.canvas.height = height;
  }
  destroy(target: { canvas: OffscreenCanvas; context: OffscreenCanvasRenderingContext2D | null }) {
    target.canvas.width = 1;
    target.canvas.height = 1;
    target.context = null;
  }
}
class WorkerFilterFactory {
  private unsupported(): never {
    throw new Error(
      'This PDF uses a special color or transparency filter that cannot be exported safely in a background canvas. The original file has not been changed.',
    );
  }
  addFilter(maps: unknown) {
    return maps ? this.unsupported() : 'none';
  }
  addAlphaFilter(map: unknown) {
    return map ? this.unsupported() : 'none';
  }
  addLuminosityFilter() {
    return this.unsupported();
  }
  addHCMFilter() {
    return 'none';
  }
  addHighlightHCMFilter() {
    return 'none';
  }
  destroy() {
    /* No DOM or retained graphics resources. */
  }
}

async function rasterize(
  data: Uint8Array,
  job: ProcessingJob,
  progress: Progress,
): Promise<OutputFile[]> {
  requireCanvas();
  const { getPdfJs, pdfOptions } = await import('./pdf-assets');
  const pdfjs = await getPdfJs();
  const task = pdfjs.getDocument({
    data,
    ...pdfOptions(),
    useWorkerFetch: true,
    disableFontFace: true,
    useSystemFonts: false,
    CanvasFactory: OffscreenFactory,
    FilterFactory: WorkerFilterFactory,
  });
  try {
    const source = await task.promise;
    const indices =
      job.tool === 'compress'
        ? Array.from({ length: source.numPages }, (_, index) => index)
        : parseRange(job.options.range, source.numPages);
    const output = await PDFDocument.create();
    const files: OutputFile[] = [];
    let accumulated = 0,
      pixels = 0;
    for (let i = 0; i < indices.length; i++) {
      progress({
        type: 'progress',
        message: `Rendering page ${i + 1} of ${indices.length}`,
        completed: i,
        total: indices.length,
      });
      const page = await source.getPage(indices[i] + 1);
      const base = page.getViewport({ scale: 1 });
      const dpi =
        job.tool === 'compress'
          ? job.options.quality >= 0.8
            ? 150
            : job.options.quality >= 0.6
              ? 110
              : 80
          : job.options.dpi;
      const scale = Math.min(dpi / 72, 4096 / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = new OffscreenCanvas(
        Math.max(1, Math.ceil(viewport.width)),
        Math.max(1, Math.ceil(viewport.height)),
      );
      checkCanvas(canvas.width, canvas.height);
      pixels += canvas.width * canvas.height;
      if (pixels > MAX_RASTER_PIXELS)
        throw new Error(
          'Raster output exceeds 120 megapixels per job. Choose fewer pages or lower resolution.',
        );
      const context = canvas.getContext('2d');
      if (!context)
        throw new Error(
          'Your browser does not support local canvas rendering. Try a current version of Chrome, Firefox, or Safari.',
        );
      await page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
        background: 'rgb(255,255,255)',
      }).promise;
      const format = job.tool === 'compress' ? 'jpeg' : job.options.imageFormat;
      const blob = await canvas.convertToBlob({
        type: `image/${format}`,
        quality: job.options.quality,
      });
      accumulated += blob.size;
      checkOutput(accumulated);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (job.tool === 'compress') {
        const image = await output.embedJpg(bytes);
        output
          .addPage([base.width, base.height])
          .drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });
      } else
        files.push({
          name: `${safeStem(job.sources[0].file.name)}-page-${String(indices[i] + 1).padStart(3, '0')}.${format === 'jpeg' ? 'jpg' : 'png'}`,
          data: bytes,
          type: blob.type,
        });
      canvas.width = 1;
      canvas.height = 1;
      page.cleanup();
    }
    return job.tool === 'compress'
      ? [pdfFile(`${safeStem(job.sources[0].file.name)}-compressed.pdf`, await output.save())]
      : files;
  } finally {
    await task.destroy();
  }
}

export async function processJob(
  job: ProcessingJob,
  progress: Progress = () => {},
): Promise<ProcessingResult> {
  const { tool, sources, options } = job;
  validateJob(job);
  if (!sources.length) throw new Error('Choose a file to get started.');
  if (sources.reduce((total, source) => total + source.file.size, 0) > MAX_BYTES)
    throw new Error('Keep the combined input below 100 MB.');
  if (job.pages.length > MAX_PAGES) throw new Error('Choose no more than 500 pages per job.');
  progress({ type: 'progress', message: 'Preparing your private workspace…' });
  if (sources.length > MAX_PAGES) throw new Error('Choose no more than 500 pages per job.');
  const qpdf = qpdfSession();
  const runQpdf = (data: Uint8Array, args: string[]) => qpdf.run([data], args);
  try {
    const input: Uint8Array[] = [];
    const documents: PDFDocument[] = [];
    let inputPages = 0;
    for (let i = 0; i < sources.length; i++) {
      await validateKind(sources[i].file, tool === 'images-to-pdf');
      if (tool === 'images-to-pdf') continue;
      let bytes: Uint8Array = new Uint8Array(await sources[i].file.arrayBuffer());
      if (sources[i].password !== undefined) {
        validatePassword(sources[i].password!);
        progress({ type: 'progress', message: 'Opening your protected PDF locally…' });
        bytes = await runQpdf(bytes, [
          `--password=${sources[i].password}`,
          '--password-mode=unicode',
          '--decrypt',
          '/input.pdf',
          '/output.pdf',
        ]);
      }
      const document = await loadPdfSafely(bytes);
      inputPages += document.getPageCount();
      if (!document.getPageCount() || inputPages > MAX_PAGES)
        throw new Error('Choose 1–500 pages per job.');
      checkDocument(document, job);
      documents.push(document);
      input.push(bytes);
    }
    const name = safeStem(sources[0].file.name);
    let files: OutputFile[] = [];
    let note: string | undefined;
    if (tool === 'unlock') {
      files = [
        pdfFile(
          `${name}-unlocked.pdf`,
          await runQpdf(input[0], ['--decrypt', '/input.pdf', '/output.pdf']),
        ),
      ];
      if (sources[0].password === undefined)
        note = 'This PDF already opens without a password. Your unprotected copy is ready.';
    } else if (tool === 'protect') {
      if (!options.password || options.password !== options.confirmPassword)
        throw new Error('Enter matching passwords to protect your PDF.');
      validatePassword(options.password, true);
      const owner = Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) =>
        value.toString(16).padStart(2, '0'),
      ).join('');
      files = [
        pdfFile(
          `${name}-protected.pdf`,
          await runQpdf(input[0], [
            '/input.pdf',
            '--password-mode=unicode',
            '--encrypt',
            `--user-password=${options.password}`,
            `--owner-password=${owner}`,
            '--bits=256',
            '--',
            '/output.pdf',
          ]),
        ),
      ];
    } else if (tool === 'compress' && options.compression === 'lossless') {
      progress({ type: 'progress', message: 'Optimizing PDF objects and streams…' });
      files = [
        pdfFile(
          `${name}-compressed.pdf`,
          await runQpdf(input[0], [
            '/input.pdf',
            '--object-streams=generate',
            '--recompress-flate',
            '--compression-level=9',
            '/output.pdf',
          ]),
        ),
      ];
    } else if (tool === 'pdf-to-images' || (tool === 'compress' && options.compression === 'image'))
      files = await rasterize(input[0], job, progress);
    else if (tool === 'images-to-pdf') {
      const document = await PDFDocument.create();
      let pixels = 0,
        accumulated = 0;
      for (let i = 0; i < sources.length; i++) {
        progress({
          type: 'progress',
          message: `Adding image ${i + 1} of ${sources.length}`,
          completed: i,
          total: sources.length,
        });
        const dimensions = await imageDimensions(sources[i].file);
        pixels += dimensions.width * dimensions.height;
        if (pixels > MAX_RASTER_PIXELS)
          throw new Error('Image input exceeds 120 megapixels per job. Choose fewer images.');
        const png = await canvasImage(sources[i].file);
        accumulated += png.data.length;
        checkOutput(accumulated);
        const image = await document.embedPng(png.data);
        let width = options.pageSize === 'letter' ? 612 : 595.28;
        let height = options.pageSize === 'letter' ? 792 : 841.89;
        if (options.orientation === 'landscape') [width, height] = [height, width];
        if (options.pageSize === 'original') {
          width = png.originalWidth * 0.75;
          height = png.originalHeight * 0.75;
        }
        const page = document.addPage([width, height]);
        const margin = Math.min(options.margin, width / 4, height / 4);
        const availableW = width - 2 * margin;
        const availableH = height - 2 * margin;
        const ratio =
          options.fit === 'cover'
            ? Math.max(availableW / image.width, availableH / image.height)
            : Math.min(availableW / image.width, availableH / image.height);
        page.pushOperators(
          pushGraphicsState(),
          rectangle(margin, margin, availableW, availableH),
          clip(),
          endPath(),
        );
        page.drawImage(image, {
          x: (width - image.width * ratio) / 2,
          y: (height - image.height * ratio) / 2,
          width: image.width * ratio,
          height: image.height * ratio,
        });
        page.pushOperators(popGraphicsState());
      }
      files = [
        pdfFile('paperlight-images.pdf', await document.save({ updateFieldAppearances: false })),
      ];
    } else {
      const count = documents[0].getPageCount();
      const selected = parseRange(options.range, count);
      if (documents.reduce((sum, document) => sum + document.getPageCount(), 0) > MAX_PAGES)
        throw new Error('Choose no more than 500 pages per job.');
      if (tool === 'split' && options.splitMode === 'individual') {
        let accumulated = 0;
        for (const [i, index] of selected.entries()) {
          progress({
            type: 'progress',
            message: `Extracting page ${i + 1} of ${selected.length}`,
            completed: i,
            total: selected.length,
          });
          const data = await runQpdf(input[0], [
            '/input.pdf',
            '--pages',
            '.',
            String(index + 1),
            '--',
            '/output.pdf',
          ]);
          accumulated += data.length;
          checkOutput(accumulated);
          files.push(pdfFile(`${name}-page-${String(index + 1).padStart(3, '0')}.pdf`, data));
        }
      } else if (tool === 'merge' || tool === 'organize' || tool === 'split' || tool === 'rotate') {
        let args: string[] = ['/input.pdf'];
        if (tool === 'rotate')
          args.push(`--rotate=+${options.angle}:${selected.map((i) => i + 1).join(',')}`);
        else {
          args.push('--pages');
          if (tool === 'merge')
            input.forEach((_, i) => args.push(i ? `/input-${i}.pdf` : '.', '1-z'));
          else if (tool === 'split') args.push('.', selected.map((i) => i + 1).join(','));
          else {
            if (!job.pages.length) throw new Error('Keep at least one page in your document.');
            for (const ref of job.pages) {
              const i = sources.findIndex((source) => source.id === ref.sourceId);
              if (
                i < 0 ||
                !Number.isInteger(ref.index) ||
                ref.index < 0 ||
                ref.index >= documents[i].getPageCount()
              )
                throw new Error(
                  'A selected page is no longer available. Please select your file again.',
                );
              args.push(i ? `/input-${i}.pdf` : '.', String(ref.index + 1));
            }
          }
          args.push('--');
          if (tool === 'organize')
            job.pages.forEach((ref, i) => {
              if (ref.rotation) args.push(`--rotate=+${ref.rotation % 360}:${i + 1}`);
            });
        }
        args.push('/output.pdf');
        files = [
          pdfFile(
            tool === 'merge'
              ? 'paperlight-merged.pdf'
              : `${name}-${tool === 'split' ? 'extracted' : tool === 'rotate' ? 'rotated' : 'organized'}.pdf`,
            await qpdf.run(input, args),
          ),
        ];
      } else {
        const document = documents[0];
        const font =
          tool === 'watermark' || tool === 'page-numbers' ? await loadFont(document) : undefined;
        const signature =
          tool === 'sign' && options.signature
            ? await document.embedPng(options.signature)
            : undefined;
        if (tool === 'sign' && !signature)
          throw new Error('Draw, type, or upload your signature first.');
        for (const [i, index] of selected.entries()) {
          const page = document.getPage(index);
          progress({
            type: 'progress',
            message: `Updating page ${i + 1} of ${selected.length}`,
            completed: i,
            total: selected.length,
          });
          if (tool === 'watermark') {
            if (!options.text.trim()) throw new Error('Enter your watermark text.');
            drawText(
              page,
              options.text,
              font!,
              options,
              options.fontSize,
              options.opacity,
              options.textAngle,
            );
          } else if (tool === 'page-numbers')
            drawText(
              page,
              pageNumber(
                options.startNumber + i,
                options.startNumber + selected.length - 1,
                options.numberStyle,
              ),
              font!,
              options,
              options.fontSize,
              1,
            );
          else if (signature) {
            const box = visibleBox(page.getMediaBox(), page.getCropBox());
            const rotation = page.getRotation().angle;
            const view = visibleSize(box, rotation);
            const width = view.width * options.signatureWidth;
            const height = (width * signature.height) / signature.width;
            const center = annotationPosition(options.x, options.y, view.width, view.height);
            const anchor = viewToPdf(center.x - width / 2, center.y + height / 2, box, rotation);
            page.drawImage(signature, { ...anchor, width, height, rotate: degrees(rotation) });
          }
        }
        files = [
          pdfFile(
            `${name}-${tool === 'page-numbers' ? 'numbered' : tool === 'sign' ? 'signed' : 'watermarked'}.pdf`,
            await document.save({ updateFieldAppearances: false }),
          ),
        ];
      }
    }
    if (tool === 'compress' && files[0].data.length >= sources[0].file.size) {
      files = [
        pdfFile(`${name}-original.pdf`, new Uint8Array(await sources[0].file.arrayBuffer())),
      ];
      note =
        'This file is already well optimized. Compression did not make it smaller, so we kept the exact original, including any encryption.';
    }
    checkOutput(files.reduce((total, file) => total + file.data.length, 0));
    if (files.length > 1) {
      progress({ type: 'progress', message: 'Packing your files into a ZIP…' });
      const packed: Record<string, Uint8Array> = {};
      files.forEach((file) => {
        packed[file.name] = file.data;
      });
      note = `${files.length} ${tool === 'split' ? 'PDFs' : 'images'} are included in your ZIP.`;
      files = [
        {
          name: `${name}-${tool === 'split' ? 'pages' : 'images'}.zip`,
          data: zipSync(packed, { level: 1 }),
          type: 'application/zip',
        },
      ];
    }
    checkOutput(files.reduce((total, file) => total + file.data.length, 0));
    return { files, note };
  } finally {
    qpdf.dispose();
  }
}
