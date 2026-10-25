import { describe, it, expect, vi } from 'vitest';
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFString,
  endMarkedContent,
  decodePDFRawStream,
  PDFRawStream,
} from 'pdf-lib';
import { structuredPdf } from './preservation-fixtures';
import { featurePdf } from './feature-fixtures';
import { processJob } from '../src/lib/engine';
import { assemblePdf, tagWriter } from '../src/lib/assembly';
import { defaultOptions } from '../src/lib/types';
import { independentPdf } from './independent';
import { MAX_OUTPUT_BYTES, saveBoundedPdf } from '../src/lib/limits';
import { readFile } from 'node:fs/promises';
import { boundaryPdf } from './resource-fixtures';
import { createCanvas, loadImage } from '@napi-rs/canvas';
vi.mock('../src/generated/qpdf.wasm?url', async () => ({
  default: (await import('node:path')).resolve('src/generated/qpdf.wasm'),
}));

describe('preservation-aware assembly', () => {
  it('remaps indirect role and attribute-class references without losing their definitions', async () => {
    const document = await PDFDocument.load(await structuredPdf());
    const root = document.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict);
    const section = document.context.lookup(root.get(PDFName.of('K')), PDFDict);
    const paragraph = section.lookup(PDFName.of('K'), PDFArray).lookup(0, PDFDict);
    paragraph.set(PDFName.of('S'), document.context.register(PDFName.of('SharedRole')));
    paragraph.set(
      PDFName.of('C'),
      document.context.register(
        document.context.obj([document.context.register(PDFName.of('SharedClass')), 0]),
      ),
    );
    root
      .lookup(PDFName.of('RoleMap'), PDFDict)
      .set(PDFName.of('SharedRole'), document.context.register(PDFName.of('P')));
    root.lookup(PDFName.of('RoleMap'), PDFDict).set(PDFName.of('P'), PDFName.of('P'));
    const bytes = await assemblePdf(
      [{ document, name: 'indirect.pdf' }],
      [0, 1].map((index) => ({ source: 0, index, rotation: 0 })),
    );
    const report = await independentPdf(bytes, '.cache/independent/indirect-roles-classes.pdf');
    expect(report.preservation?.tags.classes.map((item) => item.spaceAfter)).toEqual([4, 4]);
    expect(report.preservation?.tags.roles).toContain('/P');
  });
  it('preserves matching ICC output conditions across different stream encodings', async () => {
    const profile = await readFile('node_modules/pdfjs-dist/iccs/CGATS001Compat-v2-micro.icc');
    const documents = await Promise.all(
      [0, 1].map(async (variant) => {
        const document = await PDFDocument.load(await structuredPdf(`COLOR${variant}`));
        const ctx = document.context;
        const stream = variant ? ctx.stream(profile, { N: 4 }) : ctx.flateStream(profile, { N: 4 });
        document.catalog.set(
          PDFName.of('OutputIntents'),
          ctx.obj([
            {
              Type: 'OutputIntent',
              S: 'GTS_PDFX',
              OutputConditionIdentifier: PDFString.of('Coated print'),
              DestOutputProfile: ctx.register(stream),
            },
          ]),
        );
        return document;
      }),
    );
    const output = await assemblePdf(
      documents.map((document, i) => ({ document, name: `${i}.pdf` })),
      [0, 1].flatMap((source) => [0, 1].map((index) => ({ source, index, rotation: 0 }))),
    );
    const parsed = await PDFDocument.load(output);
    const intent = parsed.catalog.lookup(PDFName.of('OutputIntents'), PDFArray).lookup(0, PDFDict);
    expect(
      Buffer.from(
        decodePDFRawStream(intent.lookup(PDFName.of('DestOutputProfile')) as PDFRawStream).decode(),
      ),
    ).toEqual(profile);
    await independentPdf(output, '.cache/independent/profile-merge.pdf');
    documents[1].catalog
      .lookup(PDFName.of('OutputIntents'), PDFArray)
      .lookup(0, PDFDict)
      .set(PDFName.of('OutputConditionIdentifier'), PDFString.of('Different condition'));
    await expect(
      assemblePdf(
        documents.map((document, i) => ({ document, name: `${i}.pdf` })),
        [0, 1].flatMap((source) => [0, 1].map((index) => ({ source, index, rotation: 0 }))),
      ),
    ).rejects.toThrow('output color profiles');
  });
  it('maps declared print ranges and retains extension/version declarations', async () => {
    const document = await PDFDocument.load(await featurePdf('plain'));
    document.catalog.set(
      PDFName.of('ViewerPreferences'),
      document.context.obj({ PrintPageRange: [0, 0] }),
    );
    document.catalog.set(
      PDFName.of('Extensions'),
      document.context.obj({ ADBE: { BaseVersion: '1.7', ExtensionLevel: 8 } }),
    );
    document.catalog.set(PDFName.of('Version'), PDFName.of('2.0'));
    const bytes = await assemblePdf(
      [{ document, name: 'source.pdf' }],
      [1, 0, 0].map((index) => ({ source: 0, index, rotation: 0 })),
    );
    const output = await PDFDocument.load(bytes);
    expect(
      output.catalog
        .lookup(PDFName.of('ViewerPreferences'), PDFDict)
        .lookup(PDFName.of('PrintPageRange'), PDFArray)
        .asArray()
        .map((value) => value.toString()),
    ).toEqual(['1', '2']);
    expect(output.catalog.get(PDFName.of('Version'))).toBe(PDFName.of('2.0'));
    expect(output.catalog.has(PDFName.of('Extensions'))).toBe(true);
  });
  it('organizes a blank page after excluding every page of a form document', async () => {
    const file = new File([await featurePdf('form')], 'unused-form.pdf');
    const result = await processJob({
      tool: 'organize',
      sources: [{ id: 'a', file }],
      pages: [
        {
          id: 'blank',
          sourceId: 'blank',
          index: 0,
          rotation: 0,
          blank: { width: 300, height: 400 },
        },
      ],
      options: { ...defaultOptions },
    });
    const report = await independentPdf(result.files[0].data, '.cache/independent/blank-only.pdf');
    expect(report.count).toBe(1);
    expect(report.fields).toEqual({});
    expect(report.pages[0].media).toEqual([0, 0, 300, 400]);
  });
  it('replaces one of 500 input pages with a blank without counting generated pages as new input', async () => {
    const file = new File([new Uint8Array(boundaryPdf(500))], 'boundary.pdf');
    const pages = Array.from({ length: 499 }, (_, index) => ({
      id: String(index),
      sourceId: 'a',
      index,
      rotation: 0,
    }));
    const result = await processJob({
      tool: 'organize',
      sources: [{ id: 'a', file }],
      pages: [
        ...pages,
        {
          id: 'blank',
          sourceId: 'blank',
          index: 0,
          rotation: 0,
          blank: { width: 300, height: 400 },
        },
      ],
      options: { ...defaultOptions },
    });
    const output = await PDFDocument.load(result.files[0].data);
    expect(output.getPageCount()).toBe(500);
    expect(output.getPage(499).getSize()).toEqual({ width: 300, height: 400 });
  });
  it('rejects repeated large streams before allocating an oversized assembled output', async () => {
    const document = await PDFDocument.create();
    const page = document.addPage();
    page.node.set(
      PDFName.of('PrivateData'),
      document.context.register(document.context.stream(new Uint8Array(64 * 1024 * 1024))),
    );
    await expect(
      assemblePdf(
        [{ document, name: 'large.pdf' }],
        [0, 0, 0].map((index) => ({ source: 0, index, rotation: 0 })),
      ),
    ).rejects.toThrow('128 MB');
  });
  it('rejects serialization before save allocates the complete PDF buffer', async () => {
    const document = await PDFDocument.create();
    document.addPage();
    const stream = document.context.stream(new Uint8Array(MAX_OUTPUT_BYTES + 1));
    document.context.register(stream);
    const save = vi.spyOn(document, 'save');
    await expect(saveBoundedPdf(document)).rejects.toThrow('serialization safety budget');
    expect(save).not.toHaveBeenCalled();
  });
  it('adds semantic marks when the original root children use an indirect array', async () => {
    const document = await PDFDocument.load(await structuredPdf());
    const root = document.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict);
    root.set(
      PDFName.of('K'),
      document.context.register(document.context.obj([root.get(PDFName.of('K'))!])),
    );
    const writer = tagWriter(document)!;
    const page = document.getPage(0);
    page.pushOperators(writer.begin(page, 'Alex', false));
    page.drawText('Alex', { x: 40, y: 60 });
    page.pushOperators(endMarkedContent());
    writer.finish();
    expect(
      root
        .lookup(PDFName.of('K'), PDFArray)
        .asArray()
        .every((ref) => document.context.lookup(ref) instanceof PDFDict),
    ).toBe(true);
    const report = await independentPdf(
      await document.save(),
      '.cache/independent/indirect-tag-array.pdf',
    );
    expect(report.preservation?.tags.valid).toBe(true);
    expect(report.preservation?.tags.roles).toContain('/Span');
  });
  it('preserves a named self-link on each duplicated occurrence without name collisions', async () => {
    const document = await PDFDocument.load(await structuredPdf());
    const annotations = document.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
    const annotation = document.context.lookup(annotations.get(1), PDFDict);
    annotation.lookup(PDFName.of('A'), PDFDict).set(PDFName.of('D'), PDFString.of('chapter'));
    const bytes = await assemblePdf(
      [{ document, name: 'source.pdf' }],
      [0, 1, 0].map((index) => ({ source: 0, index, rotation: 0 })),
    );
    const report = await independentPdf(bytes, '.cache/independent/duplicate-named-self.pdf');
    expect(report.preservation?.internalLinks.map((link) => link.target)).toEqual([1, 0, 1, 2]);
    expect(report.preservation?.destinations).toHaveLength(3);
  });
  it('rejects an empty assembly instead of synthesizing a blank output page', async () => {
    const document = await PDFDocument.load(await structuredPdf());
    await expect(assemblePdf([{ document, name: 'source.pdf' }], [])).rejects.toThrow('1 and 500');
  });
  it.each(['rotate', 'compress', 'protect', 'unlock'] as const)(
    '%s retains populated navigation and accessibility data',
    async (tool) => {
      const file = new File([await structuredPdf()], 'tagged.pdf');
      const options = {
        ...defaultOptions,
        password: 'opening-password',
        confirmPassword: 'opening-password',
      };
      const result = await processJob({
        tool,
        sources: [{ id: 'a', file }],
        pages: [0, 1].map((index) => ({ id: String(index), sourceId: 'a', index, rotation: 0 })),
        options,
      });
      const report = await independentPdf(
        result.files[0].data,
        `.cache/independent/tagged-${tool}.pdf`,
        tool === 'protect' ? options.password : undefined,
      );
      expect(report.preservation?.tags.valid).toBe(true);
      expect(report.preservation?.tags.pages).toEqual([0, 1]);
      expect(report.preservation?.outlines[0].children[0].page).toBe(1);
      expect(report.preservation?.internalLinks.map((link) => link.target)).toEqual([1, 1]);
    },
  );
  it('preserves populated tags, outlines and links generated by Chromium', async () => {
    const bytes = await readFile('tests/fixtures/chromium-tagged.pdf');
    const file = new File([bytes], 'browser-export.pdf');
    const result = await processJob({
      tool: 'merge',
      sources: [0, 1, 2].map((i) => ({ id: String(i), file })),
      pages: [],
      options: { ...defaultOptions },
    });
    const report = await independentPdf(
      result.files[0].data,
      '.cache/independent/chromium-merge.pdf',
    );
    expect(report.count).toBe(6);
    expect(report.preservation?.tags.pages).toEqual([0, 1, 2, 3, 4, 5]);
    expect(
      report.preservation?.tags.alt.filter((value) => value === 'Blue square chart'),
    ).toHaveLength(3);
    expect(report.preservation?.internalLinks.map((link) => link.target)).toEqual([1, 3, 5]);
    expect(report.preservation?.outlines).toHaveLength(3);
  });
  it('merges three populated tagged, bookmarked and internally linked documents', async () => {
    const labels = ['ALPHA', 'BETA', 'GAMMA'];
    const sources = await Promise.all(
      labels.map(async (label, i) => ({
        id: String(i),
        file: new File([await structuredPdf(label, i)], `${label}.pdf`),
      })),
    );
    const job = {
      tool: 'merge' as const,
      sources,
      pages: sources.flatMap((source) =>
        [0, 1].map((index) => ({
          id: `${source.id}-${index}`,
          sourceId: source.id,
          index,
          rotation: 0,
        })),
      ),
      options: { ...defaultOptions },
    };
    const result = await processJob(job);
    const report = await independentPdf(
      result.files[0].data,
      '.cache/independent/three-structured.pdf',
    );
    expect(report.pages.map((page) => page.text.trim())).toEqual(
      labels.flatMap((label) => [`${label} PAGE 1`, `${label} PAGE 2`]),
    );
    expect(
      report.preservation?.outlines.map((item) => [item.title, item.page, item.children[0]?.page]),
    ).toEqual(labels.map((label, i) => [`${label} Document`, i * 2, i * 2 + 1]));
    expect(report.preservation?.destinations).toHaveLength(6);
    expect(report.preservation?.internalLinks.map((link) => link.target)).toEqual([
      1, 1, 3, 3, 5, 5,
    ]);
    expect(report.preservation?.tags.valid).toBe(true);
    expect(report.preservation?.tags.pages).toEqual([0, 1, 2, 3, 4, 5]);
    expect(report.preservation?.tags.alt).toEqual(
      expect.arrayContaining(labels.map((label) => `${label} blue chart`)),
    );
    expect(report.preservation?.tags.languages).toEqual(expect.arrayContaining(['en-US', 'fr-FR']));
    expect(report.preservation?.tags.ids).toHaveLength(6);
    expect(report.preservation?.tags.classes.map((item) => item.spaceAfter)).toEqual([
      4, 4, 5, 5, 6, 6,
    ]);
    expect(new Set(report.preservation?.tags.ids).size).toBe(6);
    // All six output pages must also retain their rendered content. This is
    // independent of the structural assertions and uses Poppler on both sides.
    const pixels = async (path: string) => {
      const image = await loadImage(path);
      const canvas = createCanvas(image.width, image.height);
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return {
        width: image.width,
        height: image.height,
        data: Buffer.from(context.getImageData(0, 0, image.width, image.height).data),
      };
    };
    for (let source = 0; source < sources.length; source++) {
      for (let page = 1; page <= 2; page++) {
        const original = await independentPdf(
          new Uint8Array(await sources[source].file.arrayBuffer()),
          `.cache/independent/three-source-${source}.pdf`,
          undefined,
          page,
        );
        const merged = await independentPdf(
          result.files[0].data,
          '.cache/independent/three-structured.pdf',
          undefined,
          source * 2 + page,
        );
        const expected = await pixels(original.render!);
        const actual = await pixels(merged.render!);
        expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
        expect(actual.data.equals(expected.data), `source ${source + 1}, page ${page}`).toBe(true);
      }
    }
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: result.files[0].data.slice() });
    try {
      const pdf = await task.promise;
      expect((await pdf.getOutline())?.map((item) => item.title)).toEqual(
        labels.map((label) => `${label} Document`),
      );
      for (let i = 1; i <= 6; i++)
        expect(await (await pdf.getPage(i)).getStructTree()).not.toBeNull();
    } finally {
      await task.destroy();
    }
  });
  it('maps duplicated annotations and tag parents independently in reordered pages', async () => {
    const document = await PDFDocument.load(await structuredPdf());
    const bytes = await assemblePdf(
      [{ document, name: 'source.pdf' }],
      [1, 0, 0, 1].map((index) => ({ source: 0, index, rotation: 90 })),
    );
    const report = await independentPdf(bytes, '.cache/independent/structured-duplicates.pdf');
    expect(report.preservation?.tags.valid).toBe(true);
    expect(report.preservation?.tags.pages).toEqual([0, 1, 2, 3]);
    expect(report.pages.every((page) => page.rotation === 90)).toBe(true);
    expect(report.preservation?.internalLinks.map((link) => link.target)).toEqual([0, 0, 0, 0]);
  });
  it('blocks a selection that would leave an internal target outside the output', async () => {
    const document = await PDFDocument.load(await structuredPdf());
    await expect(
      assemblePdf([{ document, name: 'source.pdf' }], [{ source: 0, index: 0, rotation: 0 }]),
    ).rejects.toThrow('source.pdf: This operation cannot safely preserve internal destinations');
  });
  it('preserves harmless empty outline/tag roots without a blanket rejection', async () => {
    for (const kind of ['bookmarks', 'tags'] as const) {
      const file = new File([await featurePdf(kind)], 'empty-structure.pdf');
      const result = await processJob({
        tool: 'merge',
        sources: [
          { id: 'a', file },
          { id: 'b', file },
        ],
        pages: [],
        options: { ...defaultOptions },
      });
      expect((await PDFDocument.load(result.files[0].data)).getPageCount()).toBe(4);
    }
  });
  it('rejects inconsistent parent trees instead of producing apparently tagged output', async () => {
    const document = await PDFDocument.load(await structuredPdf());
    document.getPage(0).node.set(PDFName.of('StructParents'), document.context.obj(99));
    await expect(
      assemblePdf(
        [{ document, name: 'broken.pdf' }],
        [0, 1].map((index) => ({ source: 0, index, rotation: 0 })),
      ),
    ).rejects.toThrow('parent tree');
  });
});
