import { beforeAll, expect, it, vi } from 'vitest';
vi.mock('../src/generated/qpdf.wasm?url', async () => ({
  default: (await import('node:path')).resolve('src/generated/qpdf.wasm'),
}));
import { PDFDocument } from 'pdf-lib';
import { unzipSync } from 'fflate';
import { processJob } from '../src/lib/engine';
import { defaultOptions } from '../src/lib/types';
import type { ProcessingJob } from '../src/lib/types';
import { makeFixtures, inspectPdf } from './fixtures';
import { independentPdf } from './independent';
import { numberText, numberPosition } from '../src/lib/annotation-style';
let f: Awaited<ReturnType<typeof makeFixtures>>;
beforeAll(async () => {
  f = await makeFixtures();
});
function job(tool: ProcessingJob['tool']): ProcessingJob {
  return {
    tool,
    sources: [{ id: 'a', file: new File([f.pdf], 'first.pdf') }],
    pages: [0, 1, 2].map((index) => ({ id: String(index), sourceId: 'a', index, rotation: 0 })),
    options: { ...defaultOptions },
  };
}
it('splits custom groups, preserves duplicates between groups, and combines when requested', async () => {
  const j = job('split');
  j.options.splitMode = 'ranges';
  j.options.groups = '2,1; 1,3';
  const outputs = Object.values(unzipSync((await processJob(j)).files[0].data));
  expect(outputs).toHaveLength(2);
  expect((await inspectPdf(outputs[0])).pages[0].text).toContain('BETA');
  expect((await inspectPdf(outputs[1])).count).toBe(2);
  j.options.combineRanges = true;
  const result = await independentPdf(
    (await processJob(j)).files[0].data,
    '.cache/parity/custom.pdf',
  );
  expect(result.count).toBe(4);
  expect(result.pages[2].text).toContain('ALPHA');
});
it('splits fixed groups including the short final group', async () => {
  const j = job('split');
  j.options.splitMode = 'fixed';
  j.options.groupSize = 2;
  const outputs = Object.values(unzipSync((await processJob(j)).files[0].data));
  expect(await Promise.all(outputs.map(async (data) => (await inspectPdf(data)).count))).toEqual([
    2, 1,
  ]);
});
it('enforces actual serialized split sizes and rejects an unsplittable page', async () => {
  const j = job('split');
  j.options.splitMode = 'size';
  j.options.maximumKiB = 800;
  const result = await processJob(j);
  const outputs = result.files[0].name.endsWith('.zip')
    ? Object.values(unzipSync(result.files[0].data))
    : [result.files[0].data];
  expect(outputs.every((o) => o.length <= 800 * 1024)).toBe(true);
  expect(
    (await Promise.all(outputs.map(async (bytes) => (await inspectPdf(bytes)).count))).reduce(
      (a, b) => a + b,
      0,
    ),
  ).toBe(3);
  j.options.maximumKiB = 1;
  await expect(processJob(j)).rejects.toThrow(/Page.*alone exceeds/);
});
it('optimizes embedded images without losing text at each quality preset', async () => {
  for (const quality of [90, 75, 50] as const) {
    const j = job('compress');
    j.options.compression = 'optimized';
    j.options.compressionLevel = quality;
    const out = (await processJob(j)).files[0].data;
    expect(out.length).toBeLessThan(f.pdf.length);
    const report = await independentPdf(out, '.cache/parity/optimized-' + quality + '.pdf');
    expect(report.pages[0].text).toContain('ALPHA');
    expect(report.count).toBe(3);
  }
});
it('organizes imported and blank pages without mutating caller references', async () => {
  const j = job('organize');
  j.sources.push({ id: 'b', file: new File([f.tiny], 'other.pdf') });
  j.pages = [
    { id: 'b', sourceId: 'b', index: 0, rotation: 90 },
    { id: 'blank', sourceId: 'blank', index: 0, rotation: 0, blank: { width: 612, height: 792 } },
    j.pages[0],
  ];
  const result = await independentPdf(
    (await processJob(j)).files[0].data,
    '.cache/parity/organized.pdf',
  );
  expect(result.count).toBe(3);
  expect(result.pages[0].rotation).toBe(90);
  expect(result.pages[1].text.trim()).toBe('');
  expect(result.pages[2].text).toContain('ALPHA');
  expect(j.sources).toHaveLength(2);
  expect(j.pages[1].sourceId).toBe('blank');
});
it('batches sequentially, reports partial failures, and includes only successful outputs', async () => {
  const j = job('rotate');
  j.sources.push(
    { id: 'bad', file: new File(['not a PDF'], 'bad.pdf') },
    { id: 'b', file: new File([f.tiny], 'first.pdf') },
  );
  j.pages.push({ id: 'b', sourceId: 'b', index: 0, rotation: 0 });
  const result = await processJob(j);
  expect(result.entries?.map((e) => e.status)).toEqual(['success', 'failed', 'success']);
  expect(result.note).toContain('Partial');
  const outputs = unzipSync(result.files[0].data);
  expect(Object.keys(outputs)).toHaveLength(2);
  expect(Object.keys(outputs)[0]).not.toBe(Object.keys(outputs)[1]);
});
it('combines individual rotations with orientation-targeted rotation exactly once', async () => {
  const j = job('rotate');
  j.options.rotationTarget = 'landscape';
  j.options.angle = 90;
  j.pages[0].rotation = 180;
  const result = await inspectPdf((await processJob(j)).files[0].data);
  // Second page has a rotated crop that displays in portrait; all three display portrait.
  expect(result.pages.map((p) => p.rotation)).toEqual([180, 90, 0]);
});
it('sets advanced AES-256 permissions, with an independent opening and owner password', async () => {
  const j = job('protect');
  j.options.advancedProtection = true;
  j.options.password = j.options.confirmPassword = 'opening-password';
  j.options.ownerPassword = j.options.confirmOwnerPassword = 'owner-password';
  j.options.permissions = {
    print: false,
    copy: false,
    modify: false,
    annotate: false,
    forms: false,
    assemble: false,
  };
  const result = (await processJob(j)).files[0].data;
  await expect(inspectPdf(result, 'wrong')).rejects.toThrow();
  const report = await independentPdf(result, '.cache/parity/permissions.pdf', 'opening-password');
  expect(report.encrypted).toBe(true);
  expect(report.permissions! & (4 | 8 | 16 | 32 | 256 | 1024)).toBe(0);
  expect((await inspectPdf(result, 'owner-password')).count).toBe(3);
  j.options.restrictAccess = false;
  j.options.password = j.options.confirmPassword = '';
  const permissionOnly = (await processJob(j)).files[0].data;
  expect((await inspectPdf(permissionOnly, '')).count).toBe(3);
});
it('validates custom number tokens and mirrors facing-page placements after a cover', () => {
  const o = {
    ...defaultOptions,
    startNumber: 5,
    numberStyle: 'custom' as const,
    numberTemplate: '{n}/{p}/{r}/{rf}',
    facingPages: true,
    coverPage: true,
    x: 0.85,
  };
  expect(numberText(o, 1, 3, 8)).toBe('6/8/3/7');
  expect(numberPosition(o, 1, 600, 800).x).toBe(0.85);
  expect(numberPosition(o, 2, 600, 800).x).toBeCloseTo(0.15);
});
it('rejects group output page amplification and oversized annotation state', async () => {
  const j = job('split');
  j.options.splitMode = 'ranges';
  j.options.groups = Array(501).fill('1').join(';');
  await expect(processJob(j)).rejects.toThrow(/500 pages/);
  j.options.groups = '1';
  j.options.watermarkImage = new Uint8Array(33 * 1024 * 1024);
  await expect(processJob(j)).rejects.toThrow(/32 MB/);
});
it('keeps the source document bytes unchanged', async () => {
  const j = job('compress');
  j.options.compression = 'optimized';
  await processJob(j);
  expect(new Uint8Array(await j.sources[0].file.arrayBuffer())).toEqual(new Uint8Array(f.pdf));
  expect((await PDFDocument.load(f.pdf)).getPageCount()).toBe(3);
});

it('does not carry hidden lossy compression from size splitting into fixed groups', async () => {
  const j = job('split');
  j.options.splitMode = 'fixed';
  j.options.groupSize = 3;
  const original = (await processJob(j)).files[0].data;
  j.options.splitCompress = true;
  const retained = (await processJob(j)).files[0].data;
  expect(retained.length).toBe(original.length);
  expect((await inspectPdf(retained)).pages[0].text).toContain('ALPHA');
});
