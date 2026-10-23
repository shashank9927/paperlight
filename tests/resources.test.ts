import { expect, it } from 'vitest';
import { loadPdfSafely, checkPreviewImages } from '../src/lib/safe-pdf';
import { boundaryPdf, hostilePdf, rawPdf } from './resource-fixtures';
import { PDFDocument } from 'pdf-lib';
import { validateKind } from '../src/lib/utils';

it.each(['expansion', 'object-expansion', 'nesting', 'xref', 'cycle', 'object-count'] as const)(
  'rejects hostile %s before unbounded parse/decode',
  async (kind) => {
    const start = performance.now();
    await expect(loadPdfSafely(hostilePdf(kind))).rejects.toThrow(
      'safe document complexity or decompression limit',
    );
    expect(performance.now() - start).toBeLessThan(5000);
    // Failed parse must restore the adapter and permit a later good document.
    expect((await loadPdfSafely(boundaryPdf(1))).getPageCount()).toBe(1);
  },
);
it('rejects oversized embedded images before preview decoding', async () => {
  const doc = await loadPdfSafely(hostilePdf('image'));
  expect(() => checkPreviewImages(doc)).toThrow('16 megapixel');
});
it('accepts the actual 500-page boundary and rejects 501', async () => {
  expect((await loadPdfSafely(boundaryPdf(500))).getPageCount()).toBe(500);
  await expect(loadPdfSafely(boundaryPdf(501))).rejects.toThrow('1–500');
});
it('reads binary WebP signatures without treating the RIFF length as UTF-8 text', async () => {
  const header = Buffer.from(
    '52494646c280000057454250565038580a0000000000000000000000000000',
    'hex',
  );
  await expect(validateKind(new File([header], 'valid.webp'), true)).resolves.toBeUndefined();
});
it.each(['literal', 'hex'] as const)(
  'rejects oversized %s strings before parser string allocation',
  async (kind) => {
    const payload =
      kind === 'literal'
        ? '(' + 'x'.repeat(1024 * 1024 + 1) + ')'
        : '<' + '41'.repeat(600000) + '>';
    await expect(loadPdfSafely(rawPdf([`<< /Type /Catalog /Value ${payload} >>`]))).rejects.toThrow(
      'complexity',
    );
  },
);
it('accepts escaped and nested PDF strings and compressed object streams', async () => {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.setTitle('A (nested) title \\ and Unicode ✓');
  const parsed = await loadPdfSafely(await doc.save());
  expect(parsed.getTitle()).toBe('A (nested) title \\ and Unicode ✓');
});
it.each(['name', 'number'] as const)(
  'rejects oversized %s tokens before string allocation',
  async (kind) => {
    const token = kind === 'name' ? '/' + 'x'.repeat(2048) : '1'.repeat(512);
    await expect(loadPdfSafely(rawPdf([`<< /Type /Catalog /Value ${token} >>`]))).rejects.toThrow(
      'complexity',
    );
  },
);
it('rejects dishonest page-tree counts before PDF.js inspection', async () => {
  const bytes = boundaryPdf(1).toString('latin1').replace('/Count 1', '/Count 9');
  await expect(loadPdfSafely(Buffer.from(bytes, 'latin1'))).rejects.toThrow('complexity');
});
