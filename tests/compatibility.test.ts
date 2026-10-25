import { describe, expect, it, vi } from 'vitest';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  decodePDFRawStream,
  PDFString,
  StandardFonts,
} from 'pdf-lib';
import { processJob } from '../src/lib/engine';
import { defaultOptions, type ProcessingJob } from '../src/lib/types';
import { assemblePdf } from '../src/lib/assembly';
import { documentFeaturesSignature } from '../src/lib/document-features';
import { formPdf, layeredPdf, mediaPdf, mediaPayload } from './compatibility-fixtures';
import { structuredPdf } from './preservation-fixtures';
import { independentPdf } from './independent';
import { unzipSync } from 'fflate';
vi.mock('../src/generated/qpdf.wasm?url', async () => ({
  default: (await import('node:path')).resolve('src/generated/qpdf.wasm'),
}));
const n = PDFName.of;
const job = (tool: ProcessingJob['tool'], data: Uint8Array, options = {}) => ({
  tool,
  sources: [{ id: 'a', file: new File([data as Uint8Array<ArrayBuffer>], 'document.pdf') }],
  pages: [],
  options: { ...defaultOptions, ...options },
});

describe('ordinary document compatibility', () => {
  it('retains empty table cells and rows associated with selected or duplicated pages', async () => {
    const document = await PDFDocument.load(await structuredPdf());
    const section = document.catalog.lookup(n('StructTreeRoot'), PDFDict).lookup(n('K'), PDFDict);
    const table = document.context.obj({
      Type: 'StructElem',
      S: 'Table',
      P: document.catalog.lookup(n('StructTreeRoot'), PDFDict).get(n('K')),
      Pg: document.getPage(0).ref,
    });
    const tableRef = document.context.register(table);
    const row = document.context.obj({
      Type: 'StructElem',
      S: 'TR',
      P: tableRef,
      Pg: document.getPage(0).ref,
    });
    const rowRef = document.context.register(row);
    const cell = document.context.register(
      document.context.obj({
        Type: 'StructElem',
        S: 'TD',
        P: rowRef,
        Pg: document.getPage(0).ref,
        K: [],
      }),
    );
    row.set(n('K'), document.context.obj([cell]));
    table.set(n('K'), document.context.obj([rowRef]));
    section.lookup(n('K'), PDFArray).push(tableRef);
    const bytes = await assemblePdf(
      [{ document, name: 'table.pdf' }],
      [0, 0].map((index) => ({ source: 0, index, rotation: 0 })),
      { navigation: 'selected' },
    );
    const report = await independentPdf(bytes, '.cache/independent/empty-table-cells.pdf');
    expect(report.preservation?.tags.roles.filter((role) => role === '/TD')).toHaveLength(2);
    expect(report.preservation?.tags.roles.filter((role) => role === '/TR')).toHaveLength(2);
  });
  it('does not confuse a custom accessibility role with an executable action', async () => {
    const document = await PDFDocument.load(await structuredPdf());
    const tree = document.catalog.lookup(n('StructTreeRoot'), PDFDict);
    const section = tree.lookup(n('K'), PDFDict);
    section.set(n('S'), n('JavaScript'));
    tree.lookup(n('RoleMap'), PDFDict).set(n('JavaScript'), n('Sect'));
    const result = await processJob(job('merge', await document.save()));
    const report = await independentPdf(
      result.files[0].data,
      '.cache/independent/role-not-action.pdf',
    );
    expect(report.preservation?.tags.valid).toBe(true);
    expect(report.preservation?.tags.roles).toContain('/Sect');
  });
  it('keeps headings with retained bookmark children and deactivates only removed-target actions', async () => {
    const document = await PDFDocument.load(await structuredPdf());
    const annotation = document.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [20, 20, 60, 40],
      P: document.getPage(1).ref,
    });
    document.getPage(1).node.addAnnot(document.context.register(annotation));
    annotation.delete(n('Dest'));
    annotation.set(
      n('A'),
      document.context.obj({
        S: 'GoTo',
        D: [document.getPage(0).ref, n('Fit')],
        Next: [
          { S: 'URI', URI: PDFString.of('https://example.com/one') },
          { S: 'URI', URI: PDFString.of('https://example.com/two') },
        ],
      }),
    );
    const bytes = await assemblePdf(
      [{ document, name: 'bookmarks.pdf' }],
      [{ source: 0, index: 1, rotation: 0 }],
      { navigation: 'selected' },
    );
    const report = await independentPdf(bytes, '.cache/independent/retained-heading.pdf');
    expect(report.preservation?.outlines[0].page).toBeNull();
    expect(report.preservation?.outlines[0].children[0].page).toBe(0);
    const output = await PDFDocument.load(bytes);
    const action = output
      .getPage(0)
      .node.lookup(n('Annots'), PDFArray)
      .lookup(0, PDFDict)
      .lookup(n('A'), PDFDict);
    expect(action.get(n('S'))).toBe(n('URI'));
    expect(action.lookup(n('Next'), PDFArray).size()).toBe(1);
  });
  it('remaps conflicting form-font resources without changing their fonts', async () => {
    const documents = await Promise.all(
      [StandardFonts.Helvetica, StandardFonts.Courier].map(async (fontName) => {
        const document = await PDFDocument.load(await formPdf());
        const font = await document.embedFont(fontName);
        document.catalog
          .lookup(n('AcroForm'), PDFDict)
          .set(n('DR'), document.context.obj({ Font: { 'Font Alias': font.ref } }));
        document
          .getForm()
          .getTextField('person.name')
          .acroField.dict.set(n('DA'), PDFString.of('/Font#20Alias 12 Tf 0 g'));
        await document.flush();
        return document;
      }),
    );
    const bytes = await assemblePdf(
      documents.map((document, i) => ({ document, name: `${i}.pdf` })),
      [0, 1].map((source) => ({ source, index: 0, rotation: 0 })),
    );
    const output = await PDFDocument.load(bytes);
    const fonts = output.catalog
      .lookup(n('AcroForm'), PDFDict)
      .lookup(n('DR'), PDFDict)
      .lookup(n('Font'), PDFDict);
    expect(fonts.lookup(n('pl-1-Font Alias'), PDFDict).get(n('BaseFont'))).toBe(n('Helvetica'));
    expect(fonts.lookup(n('pl-2-Font Alias'), PDFDict).get(n('BaseFont'))).toBe(n('Courier'));
    expect(
      output
        .getForm()
        .getTextField('person.name')
        .acroField.dict.lookup(n('DA'), PDFString)
        .decodeText(),
    ).toContain('/pl-1-Font#20Alias');
    await independentPdf(bytes, '.cache/independent/form-fonts.pdf');
  });
  it('rejects cyclic action chains with a useful error', async () => {
    const document = await PDFDocument.load(await structuredPdf());
    const action = document.context.obj({ S: 'GoTo', D: [document.getPage(1).ref, n('Fit')] });
    const ref = document.context.register(action);
    action.set(n('Next'), ref);
    document.getPage(0).node.lookup(n('Annots'), PDFArray).lookup(0, PDFDict).set(n('A'), ref);
    await expect(
      assemblePdf([{ document, name: 'cycle.pdf' }], [{ source: 0, index: 0, rotation: 0 }], {
        navigation: 'selected',
      }),
    ).rejects.toThrow('action chain');
  });
  it('extracts retained tags and bookmarks while pruning excluded destinations and link actions', async () => {
    const result = await processJob(job('split', await structuredPdf(), { range: '1' }));
    const report = await independentPdf(
      result.files[0].data,
      '.cache/independent/selection-pruned.pdf',
    );
    expect(report.count).toBe(1);
    expect(report.pages[0].text).toContain('ALPHA PAGE 1');
    expect(report.preservation?.internalLinks).toEqual([]);
    expect(report.preservation?.tags.pages).toEqual([0]);
    expect(report.preservation?.outlines).toHaveLength(1);
    expect(report.preservation?.outlines[0].children).toEqual([]);
  });
  it.each(['ranges', 'fixed', 'individual', 'size'] as const)(
    'splits bookmarked documents in %s mode',
    async (splitMode) => {
      const result = await processJob(
        job('split', await structuredPdf(), {
          splitMode,
          splitGroups: '1;2',
          splitEvery: 1,
          splitSizeKiB: 128,
        }),
      );
      const pdfs =
        result.files[0].type === 'application/zip'
          ? Object.values(unzipSync(result.files[0].data))
          : result.files.map((file) => file.data);
      for (const [index, pdf] of pdfs.entries()) {
        const report = await independentPdf(
          pdf,
          `.cache/independent/selection-${splitMode}-${index}.pdf`,
        );
        expect(report.preservation?.tags.valid).toBe(true);
      }
      expect(pdfs.length).toBeGreaterThan(0);
    },
  );
  it('retains embedded media, attachment collections and the primary initial view through QPDF', async () => {
    const data = await mediaPdf();
    const input = job('merge', data);
    input.sources.push({ id: 'b', file: new File([data as Uint8Array<ArrayBuffer>], 'other.pdf') });
    const result = await processJob(input);
    const document = await PDFDocument.load(result.files[0].data);
    const names = document.catalog
      .lookup(n('Names'), PDFDict)
      .lookup(n('EmbeddedFiles'), PDFDict)
      .lookup(n('Names'), PDFArray);
    expect(names.size()).toBe(4);
    for (let i = 1; i < names.size(); i += 2) {
      const stream = names
        .lookup(i, PDFDict)
        .lookup(n('EF'), PDFDict)
        .lookup(n('F')) as PDFRawStream;
      expect(decodePDFRawStream(stream).decode()).toEqual(mediaPayload);
    }
    const opening = document.catalog.lookup(n('OpenAction'), PDFArray);
    expect(opening.get(0)).toBe(document.getPage(0).ref);
    const annotations = document.getPage(0).node.lookup(n('Annots'), PDFArray);
    const media = annotations
      .asArray()
      .find((value) => document.context.lookup(value, PDFDict).get(n('Subtype')) === n('Screen'))!;
    expect(document.context.lookup(media, PDFDict).lookup(n('A'), PDFDict).get(n('AN'))).toBe(
      media,
    );
    const report = await independentPdf(
      result.files[0].data,
      '.cache/independent/media-merged.pdf',
    );
    expect(report.embeddedFiles).toHaveLength(2);
    expect(
      report.embeddedFiles?.every((file) => file.payloads['/F'].bytes === mediaPayload.length),
    ).toBe(true);
    expect(report.media?.map((item) => item.page)).toEqual([0, 2]);
  });
  it('extracts a page whose opening view and bookmarks target excluded pages', async () => {
    const result = await processJob(job('split', await mediaPdf(), { range: '2' }));
    const document = await PDFDocument.load(result.files[0].data);
    expect(document.catalog.has(n('OpenAction'))).toBe(false);
    expect(document.getPageCount()).toBe(1);
    await documentFeaturesSignature(document);
    await independentPdf(result.files[0].data, '.cache/independent/media-extracted.pdf');
  });
  it('merges colliding form fields without changing values or widget appearances', async () => {
    const input = job('merge', await formPdf('Alice'));
    input.sources.push({
      id: 'b',
      file: new File([(await formPdf('Bob')) as Uint8Array<ArrayBuffer>], 'bob.pdf'),
    });
    const result = await processJob(input);
    const report = await independentPdf(
      result.files[0].data,
      '.cache/independent/forms-merged.pdf',
    );
    expect(report.fields['person.name']).toBe('Alice');
    expect(report.fields['pl-2-person.name']).toBe('Bob');
    expect(
      report.pages.map((page) => page.annotations.filter((a) => a.type === '/Widget').length),
    ).toEqual([2, 1, 2, 1]);
    expect(
      report.pages
        .flatMap((page) => page.annotations)
        .filter((a) => a.type === '/Widget')
        .every((a) => a.appearance),
    ).toBe(true);
  });
  it('duplicates widgets and keeps independent editable fields, and extracts only retained widgets', async () => {
    const bytes = await formPdf();
    const source = await PDFDocument.load(bytes);
    const data = await assemblePdf(
      [{ document: source, name: 'form.pdf' }],
      [0, 0].map((index) => ({ source: 0, index, rotation: 0 })),
      { navigation: 'selected' },
    );
    const report = await independentPdf(data, '.cache/independent/forms-duplicated.pdf');
    expect(report.fields['person.name']).toBe('Alice');
    expect(report.fields['pl-1-copy-2-person.name']).toBe('Alice');
    const document = await PDFDocument.load(data);
    const a = document.getForm().getTextField('person.name'),
      b = document.getForm().getTextField('pl-1-copy-2-person.name');
    b.setText('Independent');
    expect(a.getText()).toBe('Alice');
    await documentFeaturesSignature(document);
    const result = await processJob(job('split', bytes, { range: '2' }));
    const extracted = await independentPdf(
      result.files[0].data,
      '.cache/independent/forms-extracted.pdf',
    );
    expect(extracted.fields['person.name']).toBeUndefined();
    expect(extracted.fields.consent).toBe('/Yes');
    expect(extracted.pages[0].annotations.filter((a) => a.type === '/Widget')).toHaveLength(1);
  });
  it('merges layers and retains default visibility, alternate configurations and shared membership', async () => {
    const bytes = await layeredPdf();
    const input = job('merge', bytes);
    input.sources.push({
      id: 'b',
      file: new File([bytes as Uint8Array<ArrayBuffer>], 'layered.pdf'),
    });
    const result = await processJob(input);
    const document = await PDFDocument.load(result.files[0].data);
    const layers = document.catalog.lookup(n('OCProperties'), PDFDict);
    expect(layers.lookup(n('OCGs'), PDFArray).size()).toBe(4);
    expect(layers.lookup(n('D'), PDFDict).lookup(n('OFF'), PDFArray).size()).toBe(2);
    expect(layers.lookup(n('Configs'), PDFArray).size()).toBe(2);
    const report = await independentPdf(
      result.files[0].data,
      '.cache/independent/layers-merged.pdf',
    );
    expect(report.layers).toEqual({ groups: 4, defaultOff: 2, configurations: 2 });
    expect(report.count).toBe(2);
    const { pixelBounds } = await import('./independent');
    expect(
      (await pixelBounds(report.render!, (r, g, b) => b > 180 && r < 80 && g < 80)).count,
    ).toBeGreaterThan(6000);
    expect(
      (await pixelBounds(report.render!, (r, g, b) => r > 180 && g < 80 && b < 80)).count,
    ).toBe(0);
    const first = document
      .getPage(0)
      .node.lookup(n('Resources'), PDFDict)
      .lookup(n('Properties'), PDFDict);
    expect(first.lookup(n('Membership'), PDFDict).lookup(n('OCGs'), PDFArray).get(0)).toBe(
      layers.lookup(n('OCGs'), PDFArray).get(0),
    );
  });
  it('detects malformed destinations and orphan widgets rather than silently deleting them', async () => {
    const document = await PDFDocument.load(await structuredPdf());
    document
      .getPage(0)
      .node.lookup(n('Annots'), PDFArray)
      .lookup(0, PDFDict)
      .set(n('Dest'), document.context.obj([PDFNumber.of(999), n('Fit')]));
    await expect(
      assemblePdf([{ document, name: 'broken.pdf' }], [{ source: 0, index: 0, rotation: 0 }], {
        navigation: 'selected',
      }),
    ).rejects.toThrow('destination outside page tree');
    const orphan = await PDFDocument.load(await formPdf());
    orphan.catalog.delete(n('AcroForm'));
    await expect(
      assemblePdf(
        [{ document: orphan, name: 'orphan.pdf' }],
        [{ source: 0, index: 0, rotation: 0 }],
        { navigation: 'selected' },
      ),
    ).rejects.toThrow('widget');
  });
});
