import { PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { structuredPdf } from './preservation-fixtures';

export const mediaPayload = new Uint8Array([
  0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50, 0, 0, 0, 0, 109, 112, 52, 50, 105, 115, 111,
  109,
]);

export async function mediaPdf() {
  const document = await PDFDocument.load(await structuredPdf());
  const ctx = document.context,
    n = PDFName.of;
  const data = ctx.register(
    ctx.flateStream(mediaPayload, {
      Type: 'EmbeddedFile',
      Subtype: 'video/mp4',
      Params: { Size: mediaPayload.length },
    }),
  );
  const file = ctx.register(
    ctx.obj({
      Type: 'Filespec',
      F: PDFString.of('clip.mp4'),
      UF: PDFString.of('clip.mp4'),
      EF: { F: data },
      AFRelationship: 'Data',
    }),
  );
  const annotation = ctx.obj({
    Type: 'Annot',
    Subtype: 'Screen',
    Rect: [20, 20, 70, 60],
    P: document.getPage(0).ref,
  });
  const ref = ctx.register(annotation);
  annotation.set(
    n('A'),
    ctx.obj({
      Type: 'Action',
      S: 'Rendition',
      AN: ref,
      OP: 0,
      R: {
        Type: 'Rendition',
        S: 'MR',
        C: { Type: 'MediaClip', S: 'MCD', CT: PDFString.of('video/mp4'), D: file },
      },
    }),
  );
  document.getPage(0).node.addAnnot(ref);
  document.getPage(1).node.addAnnot(
    ctx.register(
      ctx.obj({
        Type: 'Annot',
        Subtype: 'FileAttachment',
        Rect: [20, 20, 35, 35],
        P: document.getPage(1).ref,
        FS: file,
      }),
    ),
  );
  document.catalog.set(
    n('Names'),
    ctx.obj({
      Dests: document.catalog.lookup(n('Names'), PDFDict).get(n('Dests')),
      EmbeddedFiles: { Names: [PDFString.of('clip.mp4'), file] },
    }),
  );
  document.catalog.set(n('AF'), ctx.obj([file]));
  document.catalog.set(
    n('OpenAction'),
    ctx.obj([document.getPage(0).ref, n('XYZ'), null, null, 0]),
  );
  return new Uint8Array(await document.save());
}
export async function formPdf(value = 'Alice') {
  const document = await PDFDocument.create();
  const a = document.addPage([300, 300]),
    b = document.addPage([300, 300]);
  const form = document.getForm();
  const field = form.createTextField('person.name');
  field.setText(value);
  field.addToPage(a, { x: 30, y: 100, width: 150, height: 24 });
  const checkbox = form.createCheckBox('consent');
  checkbox.addToPage(a, { x: 30, y: 50, width: 15, height: 15 });
  checkbox.addToPage(b, { x: 30, y: 50, width: 15, height: 15 });
  checkbox.check();
  return new Uint8Array(await document.save());
}
export async function layeredPdf() {
  const document = await PDFDocument.create();
  const page = document.addPage([300, 300]),
    ctx = document.context,
    n = PDFName.of;
  const visible = ctx.register(ctx.obj({ Type: 'OCG', Name: PDFString.of('Drawing') }));
  const hidden = ctx.register(ctx.obj({ Type: 'OCG', Name: PDFString.of('Notes') }));
  const membership = ctx.register(ctx.obj({ Type: 'OCMD', OCGs: [visible, hidden], P: 'AllOn' }));
  page.node.set(
    n('Resources'),
    ctx.obj({ Properties: { Visible: visible, Hidden: hidden, Membership: membership } }),
  );
  page.node.set(
    n('Contents'),
    ctx.register(
      ctx.flateStream(
        '/OC /Visible BDC\n0 0 1 rg 20 20 80 80 re f\nEMC\n/OC /Hidden BDC\n1 0 0 rg 150 20 80 80 re f\nEMC\n',
      ),
    ),
  );
  document.catalog.set(
    n('OCProperties'),
    ctx.obj({
      OCGs: [visible, hidden],
      D: {
        Name: PDFString.of('Default'),
        BaseState: 'ON',
        OFF: [hidden],
        Order: [visible, hidden],
        Locked: [hidden],
        RBGroups: [[visible, hidden]],
      },
      Configs: [
        {
          Name: PDFString.of('Notes only'),
          BaseState: 'OFF',
          ON: [hidden],
          Order: [visible, hidden],
        },
      ],
    }),
  );
  return new Uint8Array(await document.save());
}
