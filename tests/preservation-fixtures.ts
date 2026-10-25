import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames,
  PDFString,
} from 'pdf-lib';
import { createCanvas } from '@napi-rs/canvas';

// Populated, mutually linked documents. Every input deliberately reuses the
// same destination, role, class, ID and parent-tree keys to test collision repair.
export async function structuredPdf(label = 'ALPHA', variant = 0) {
  const doc = await PDFDocument.create(),
    ctx = doc.context,
    n = PDFName.of;
  const pages = [doc.addPage([400, 500]), doc.addPage([600, 400])];
  const tree = ctx.obj({ Type: 'StructTreeRoot' }),
    treeRef = ctx.register(tree);
  const section = ctx.obj({
    Type: 'StructElem',
    S: 'Document',
    P: treeRef,
    T: PDFHexString.fromText(`${label} section`),
  });
  const sectionRef = ctx.register(section);
  const paragraphs = pages.map((page, i) => {
    page.node.set(n('StructParents'), PDFNumber.of(i));
    // PDF permits an inline property dictionary; pdf-lib's operator-argument
    // union omits PDFDict even though its serializer supports it.
    page.pushOperators(
      PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [
        n('P'),
        ctx.obj({ MCID: 0 }) as unknown as PDFString,
      ]),
    );
    page.drawText(`${label} PAGE ${i + 1}`, { x: 20, y: 300 });
    page.pushOperators(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
    const paragraph = ctx.obj({
      Type: 'StructElem',
      S: 'SharedRole',
      P: sectionRef,
      Pg: page.ref,
      K: 0,
      C: 'SharedClass',
      ID: PDFHexString.fromText(`paragraph-${i}`),
      ActualText: PDFHexString.fromText(`${label} accessible ${i + 1}`),
    });
    return ctx.register(paragraph);
  });
  const link = ctx.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [10, 10, 90, 30],
    P: pages[0].ref,
    StructParent: 2,
    Dest: [pages[1].ref, n('Fit')],
  });
  const linkRef = ctx.register(link);
  const namedLink = ctx.register(
    ctx.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [100, 10, 190, 30],
      A: { S: 'GoTo', D: PDFString.of('second') },
    }),
  );
  pages[0].node.set(n('Annots'), ctx.obj([linkRef, namedLink]));
  const linkTag = ctx.register(
    ctx.obj({
      Type: 'StructElem',
      S: 'Link',
      P: sectionRef,
      Pg: pages[0].ref,
      K: { Type: 'OBJR', Obj: linkRef, Pg: pages[0].ref },
      Alt: PDFString.of('Go to second page'),
    }),
  );
  const canvas = createCanvas(12, 12),
    paint = canvas.getContext('2d');
  paint.fillStyle = '#2255cc';
  paint.fillRect(0, 0, 12, 12);
  const image = await doc.embedPng(canvas.toBuffer('image/png'));
  pages[1].pushOperators(
    PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [
      n('Figure'),
      ctx.obj({ MCID: 1 }) as unknown as PDFString,
    ]),
  );
  pages[1].drawImage(image, { x: 30, y: 30, width: 40, height: 40 });
  pages[1].pushOperators(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
  const figure = ctx.register(
    ctx.obj({
      Type: 'StructElem',
      S: 'Figure',
      P: sectionRef,
      Pg: pages[1].ref,
      K: { Type: 'MCR', Pg: pages[1].ref, MCID: 1 },
      Alt: PDFHexString.fromText(`${label} blue chart`),
    }),
  );
  section.set(n('K'), ctx.obj([paragraphs[0], linkTag, paragraphs[1], figure]));
  tree.set(n('K'), sectionRef);
  tree.set(n('RoleMap'), ctx.obj({ SharedRole: variant % 2 ? 'H1' : 'P' }));
  tree.set(n('ClassMap'), ctx.obj({ SharedClass: { O: 'Layout', SpaceAfter: 4 + variant } }));
  tree.set(
    n('ParentTree'),
    ctx.obj({
      Kids: [{ Nums: [0, [paragraphs[0]], 1, [paragraphs[1], figure]] }, { Nums: [2, linkTag] }],
    }),
  );
  tree.set(n('ParentTreeNextKey'), PDFNumber.of(3));
  tree.set(
    n('IDTree'),
    ctx.obj({
      Names: [
        PDFString.of('paragraph-0'),
        paragraphs[0],
        PDFString.of('paragraph-1'),
        paragraphs[1],
      ],
    }),
  );
  doc.catalog.set(n('StructTreeRoot'), treeRef);
  doc.catalog.set(n('MarkInfo'), ctx.obj({ Marked: true }));
  doc.catalog.set(n('Lang'), PDFString.of(variant % 2 ? 'fr-FR' : 'en-US'));
  doc.catalog.set(
    n('Names'),
    ctx.obj({
      Dests: {
        Kids: [
          {
            Names: [
              PDFString.of('chapter'),
              [pages[0].ref, n('Fit')],
              PDFString.of('second'),
              { D: [pages[1].ref, n('XYZ'), 0, 400, null] },
            ],
          },
        ],
      },
    }),
  );
  const outlines = ctx.obj({ Type: 'Outlines', Count: 2 }),
    outlineRef = ctx.register(outlines);
  const heading = ctx.obj({
    Title: PDFHexString.fromText(`${label} Document`),
    Parent: outlineRef,
    Dest: PDFString.of('chapter'),
    Count: -1,
  });
  const headingRef = ctx.register(heading);
  const child = ctx.register(
    ctx.obj({
      Title: PDFHexString.fromText(`${label} Detail`),
      Parent: headingRef,
      Dest: [pages[1].ref, n('Fit')],
      C: [0, 0, 1],
      F: 2,
    }),
  );
  heading.set(n('First'), child);
  heading.set(n('Last'), child);
  outlines.set(n('First'), headingRef);
  outlines.set(n('Last'), headingRef);
  doc.catalog.set(n('Outlines'), outlineRef);
  return Buffer.from(await doc.save());
}
