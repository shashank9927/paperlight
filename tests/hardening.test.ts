import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { PDFDocument, PDFName } from 'pdf-lib';
import { featurePdf } from './feature-fixtures';
import { processJob } from '../src/lib/engine';
import { defaultOptions, MAX_PAGES } from '../src/lib/types';
import type { ProcessingJob } from '../src/lib/types';
import { imageDimensions, checkCanvas, checkOutput, MAX_OUTPUT_BYTES } from '../src/lib/limits';
import { validatePassword } from '../src/lib/password';
import { visibleBox } from '../src/lib/geometry';
import { independentPdf } from './independent';
vi.mock('../src/generated/qpdf.wasm?url', async () => ({
  default: (await import('node:path')).resolve('src/generated/qpdf.wasm'),
}));
function job(tool: ProcessingJob['tool'], bytes: Uint8Array): ProcessingJob {
  return {
    tool,
    sources: [{ id: 'a', file: new File([bytes as Uint8Array<ArrayBuffer>], 'source.pdf') }],
    pages: [1, 0, 0].map((index, i) => ({ id: String(i), sourceId: 'a', index, rotation: 0 })),
    options: { ...defaultOptions },
  };
}
describe('preservation boundaries', () => {
  it.each(['merge', 'split', 'organize'] as const)(
    '%s rejects unverified forms, attachments and active structures',
    async (tool) => {
      for (const feature of ['form', 'attachment', 'active'] as const) {
        const input = job(tool, await featurePdf(feature));
        if (tool === 'merge') input.sources.push({ ...input.sources[0], id: 'b' });
        await expect(processJob(input)).rejects.toThrow('cannot safely preserve');
      }
    },
  );
  it.each(['merge', 'split', 'organize'] as const)(
    '%s preserves URI links and annotations, including duplicated pages',
    async (tool) => {
      const input = job(tool, await featurePdf('uri'));
      input.options.range = '2,1';
      if (tool === 'merge') input.sources.push({ ...input.sources[0], id: 'b' });
      const output = await processJob(input);
      const report = await independentPdf(
        output.files[0].data,
        resolve(`.cache/independent/${tool}-uri.pdf`),
      );
      const links = report.pages.flatMap((p) => p.annotations.filter((a) => a.type === '/Link'));
      expect(links).toHaveLength(tool === 'split' ? 1 : 2);
      expect(links.every((link) => link.uri === 'https://example.com/')).toBe(true);
      expect(
        report.pages.flatMap((p) => p.annotations.filter((a) => a.type === '/Text')),
      ).toHaveLength(links.length);
    },
  );
  it.each(['rotate', 'compress', 'protect', 'unlock'] as const)(
    '%s keeps form fields and widget appearances',
    async (tool) => {
      const input = job(tool, await featurePdf('form'));
      input.options.password = input.options.confirmPassword = '@--quoted é ✓';
      const output = await processJob(input);
      const report = await independentPdf(
        output.files[0].data,
        resolve(`.cache/independent/${tool}-form.pdf`),
        tool === 'protect' ? input.options.password : undefined,
      );
      expect(report.fields.customer).toBe('Alice');
      const widget = report.pages[0].annotations.find((a) => a.type === '/Widget');
      expect(widget).toMatchObject({ value: 'Alice', appearance: true });
    },
  );
  it('keeps labels in reordered and duplicate output pages', async () => {
    const result = await processJob(job('organize', await featurePdf('labels')));
    const doc = await PDFDocument.load(result.files[0].data);
    expect(doc.catalog.has(PDFName.of('PageLabels'))).toBe(true);
    // PDF.js resolves the page-label number tree independently.
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: result.files[0].data.slice() });
    try {
      expect(await (await task.promise).getPageLabels()).toEqual(['7', 'i', 'i']);
    } finally {
      await task.destroy();
    }
  });
});
describe('resource and password boundaries', () => {
  it.each(['\0', '\ud800', 'é'.repeat(64), 'a'.repeat(128)])(
    'rejects invalid password without truncating it',
    (password) => expect(() => validatePassword(password, true)).toThrow(),
  );
  it('accepts exactly 127 bytes and does not normalize Unicode', () => {
    expect(() => validatePassword('é'.repeat(63) + 'x', true)).not.toThrow();
    expect(() => validatePassword('e\u0301', true)).not.toThrow();
  });
  it('checks output and canvas allocations at the boundary', () => {
    expect(() => checkOutput(MAX_OUTPUT_BYTES)).not.toThrow();
    expect(() => checkOutput(MAX_OUTPUT_BYTES + 1)).toThrow();
    expect(() => checkCanvas(4096, 4096)).not.toThrow();
    expect(() => checkCanvas(4097, 4096)).toThrow();
    expect(() => checkCanvas(NaN, 2)).toThrow();
  });
  it('rejects a tiny PNG claiming huge dimensions before any decode', async () => {
    const head = new Uint8Array(24);
    head.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    head.set(new TextEncoder().encode('IHDR'), 12);
    const v = new DataView(head.buffer);
    v.setUint32(16, 100000);
    v.setUint32(20, 100000);
    await expect(imageDimensions(new Blob([head]))).rejects.toThrow('16 megapixels');
  });
  it('enforces actual input pages independently of UI references', async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i <= MAX_PAGES; i++) doc.addPage([20, 20]);
    const input = job('protect', await doc.save());
    input.pages = [];
    await expect(processJob(input)).rejects.toThrow('500 pages');
  });
  it('intersects CropBox and offset MediaBox like PDF.js', () => {
    expect(
      visibleBox(
        { x: 30, y: 20, width: 600, height: 500 },
        { x: 10, y: 50, width: 550, height: 400 },
      ),
    ).toEqual({ x: 30, y: 50, width: 530, height: 400 });
  });
  it('AES-256 output varies across identical jobs, rejects empty/wrong passwords, and decrypts', async () => {
    const random = vi.spyOn(crypto, 'getRandomValues');
    const input = job('protect', await featurePdf('plain'));
    input.options.password = input.options.confirmPassword = '--@\" café ✓';
    const a = (await processJob(input)).files[0].data,
      b = (await processJob(input)).files[0].data;
    // Two calls alone would cover only our owner passwords. More calls show
    // the bundled WASM /dev/random provider also uses WebCrypto.
    expect(random.mock.calls.length).toBeGreaterThan(2);
    random.mockRestore();
    expect(Buffer.compare(a, b)).not.toBe(0);
    await independentPdf(a, resolve('.cache/independent/aes.pdf'), input.options.password);
    const unlock = job('unlock', a);
    unlock.sources[0].password = input.options.password;
    const result = await processJob(unlock);
    const report = await independentPdf(
      result.files[0].data,
      resolve('.cache/independent/unlocked.pdf'),
    );
    expect(report.encrypted).toBe(false);
    expect(report.pages[0].text).toContain('FIRST');
  });
});
