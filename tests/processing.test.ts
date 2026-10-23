import { beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('../src/generated/qpdf.wasm?url', async () => ({
  default: (await import('node:path')).resolve('src/generated/qpdf.wasm'),
}));
import { processJob } from '../src/lib/engine';
import { defaultOptions } from '../src/lib/types';
import type { ProcessingJob } from '../src/lib/types';
import { parseRange, safeStem, validateKind } from '../src/lib/utils';
import { pageNumber, viewToPdf, visibleSize } from '../src/lib/geometry';
import { inspectPdf, makeFixtures } from './fixtures';
let fixtures: Awaited<ReturnType<typeof makeFixtures>>;
beforeAll(async () => {
  fixtures = await makeFixtures();
});
function job(tool: ProcessingJob['tool']): ProcessingJob {
  return {
    tool,
    sources: [{ id: 'a', file: new File([fixtures.pdf], 'résumé-資料.pdf') }],
    pages: [0, 1, 2].map((index) => ({ id: String(index), sourceId: 'a', index, rotation: 0 })),
    options: { ...defaultOptions },
  };
}
describe('page selection and filenames', () => {
  it('selects all pages and preserves explicit range order without duplicates', () => {
    expect(parseRange('', 4)).toEqual([0, 1, 2, 3]);
    expect(parseRange('3-4, 1, 3', 4)).toEqual([2, 3, 0]);
  });
  it.each(['0', '5', '3-1', 'one', '1,,3', '1-', '-1', '1.5'])(
    'rejects invalid selection %s',
    (value) => expect(() => parseRange(value, 4)).toThrow(),
  );
  it('keeps Unicode filenames and removes unsafe path characters', () => {
    expect(safeStem('résumé-資料.pdf')).toBe('résumé-資料');
    expect(safeStem('../a.pdf')).not.toContain('/');
  });
  it('checks magic bytes rather than trusting the filename', async () => {
    await expect(
      validateKind(new File(['fake'], 'real.pdf', { type: 'application/pdf' }), false),
    ).rejects.toThrow('valid PDF');
    await expect(validateKind(new File([], 'empty.pdf'), false)).rejects.toThrow('empty');
  });
});
describe('annotations on cropped, rotated pages', () => {
  const box = { x: 20, y: 10, width: 550, height: 370 };
  it.each([
    { rotation: 0, point: { x: 20, y: 380 } },
    { rotation: 90, point: { x: 20, y: 10 } },
    { rotation: 180, point: { x: 570, y: 10 } },
    { rotation: 270, point: { x: 570, y: 380 } },
  ])('maps the visible origin at $rotation degrees', ({ rotation, point }) =>
    expect(viewToPdf(0, 0, box, rotation)).toEqual(point),
  );
  it('maps centers consistently at every rotation', () => {
    for (const angle of [0, 90, 180, 270]) {
      const size = visibleSize(box, angle);
      expect(viewToPdf(size.width / 2, size.height / 2, box, angle)).toEqual({ x: 295, y: 195 });
    }
  });
  it('formats page counters', () => {
    expect(pageNumber(4, 9, 'total')).toBe('4 / 9');
    expect(pageNumber(4, 9, 'page')).toBe('Page 4');
  });
});
describe('real PDF processing checked with PDF.js', () => {
  it('merges in file order and keeps original rotations', async () => {
    const input = job('merge');
    input.sources.push({ id: 'b', file: new File([fixtures.tiny], 'last.pdf') });
    const result = await processJob(input);
    const document = await inspectPdf(result.files[0].data);
    expect(document.count).toBe(4);
    expect(document.pages[0].text).toContain('ALPHA FIRST');
    expect(document.pages[1].rotation).toBe(90);
    expect(document.pages[3].text).toContain('GAMMA LAST');
  });
  it('extracts requested pages in their specified order', async () => {
    const input = job('split');
    input.options.range = '2, 1';
    const result = await processJob(input);
    const document = await inspectPdf(result.files[0].data);
    expect(document.count).toBe(2);
    expect(document.pages[0].text).toContain('BETA SECOND');
    expect(document.pages[1].text).toContain('ALPHA FIRST');
  });
  it('reorders, duplicates and rotates pages without affecting the source', async () => {
    const input = job('organize');
    input.pages = [
      { ...input.pages[1], rotation: 90 },
      { ...input.pages[0] },
      { ...input.pages[0], id: 'duplicate' },
    ];
    const result = await processJob(input);
    const document = await inspectPdf(result.files[0].data);
    expect(document.count).toBe(3);
    expect(document.pages[0].text).toContain('BETA SECOND');
    expect(document.pages[0].rotation).toBe(180);
    expect(document.pages[2].text).toContain('ALPHA FIRST');
    expect((await inspectPdf(fixtures.pdf)).pages[1].rotation).toBe(90);
  });
  it('rotates only the requested page', async () => {
    const input = job('rotate');
    input.options.range = '2';
    input.options.angle = 270;
    const result = await processJob(input);
    const document = await inspectPdf(result.files[0].data);
    expect(document.pages.map((page) => page.rotation)).toEqual([0, 0, 0]);
    expect(document.pages[0].text).toContain('ALPHA FIRST');
  });
  it('packs independent split PDFs into a valid ZIP', async () => {
    const { unzipSync } = await import('fflate');
    const input = job('split');
    input.options.splitMode = 'individual';
    const result = await processJob(input);
    const entries = unzipSync(result.files[0].data);
    expect(Object.keys(entries)).toHaveLength(3);
    for (const bytes of Object.values(entries)) expect((await inspectPdf(bytes)).count).toBe(1);
  });
});
