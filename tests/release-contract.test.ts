import { expect, it, vi } from 'vitest';
vi.mock('../src/generated/qpdf.wasm?url', async () => ({
  default: (await import('node:path')).resolve('src/generated/qpdf.wasm'),
}));
import { processJob } from '../src/lib/engine';
import { defaultOptions } from '../src/lib/types';
import { makeFixtures, inspectPdf } from './fixtures';
import { PDFDocument } from 'pdf-lib';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { independentPdf } from './independent';
import type { ProcessingJob } from '../src/lib/types';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function numberedJob(tool: ProcessingJob['tool']): Promise<ProcessingJob> {
  const document = await PDFDocument.create();
  for (let i = 0; i < 5; i++) document.addPage([300, 400]).drawText(`PAGE ${i + 1}`);
  return {
    tool,
    sources: [
      {
        id: 'a',
        file: new File([(await document.save()) as Uint8Array<ArrayBuffer>], 'source.pdf'),
      },
    ],
    pages: Array.from({ length: 5 }, (_, index) => ({
      id: String(index),
      sourceId: 'a',
      index,
      rotation: 0,
    })),
    options: { ...defaultOptions },
  };
}

it('deterministic reorder duplicate delete sequences retain exact text, rotation and source bytes', async () => {
  const job = await numberedJob('organize');
  const original = sha(new Uint8Array(await job.sources[0].file.arrayBuffer()));
  let seed = 71231;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  for (let sequence = 0; sequence < 20; sequence++) {
    let order = [0, 1, 2, 3, 4];
    for (let operation = 0; operation < 8; operation++) {
      const from = random() % order.length;
      if (operation % 3 === 0) order.splice(random() % (order.length + 1), 0, order[from]);
      else if (operation % 3 === 1 && order.length > 1) order.splice(from, 1);
      else order = [...order.slice(from), ...order.slice(0, from)];
    }
    job.pages = order.map((index, i) => ({
      id: `${sequence}-${i}`,
      sourceId: 'a',
      index,
      rotation: (i % 4) * 90,
    }));
    const result = await independentPdf(
      (await processJob(job)).files[0].data,
      `.cache/release/sequences/${sequence}.pdf`,
    );
    expect(result.pages.map((p) => p.text.trim())).toEqual(
      order.map((index) => `PAGE ${index + 1}`),
    );
    expect(result.pages.map((p) => p.rotation)).toEqual(job.pages.map((p) => p.rotation));
  }
  expect(sha(new Uint8Array(await job.sources[0].file.arrayBuffer()))).toBe(original);
}, 60000);

it('split then merge and protect then unlock preserve page content and dimensions', async () => {
  const job = await numberedJob('split');
  job.options.splitMode = 'individual';
  const pages = Object.entries(unzipSync((await processJob(job)).files[0].data));
  const merged = await processJob({
    ...job,
    tool: 'merge',
    sources: pages.map(([name, bytes], i) => ({
      id: String(i),
      file: new File([bytes as Uint8Array<ArrayBuffer>], name),
    })),
    pages: pages.map((_, i) => ({ id: String(i), sourceId: String(i), index: 0, rotation: 0 })),
  });
  const protectedResult = await processJob({
    ...job,
    tool: 'protect',
    options: { ...defaultOptions, password: 'round-trip-Δ', confirmPassword: 'round-trip-Δ' },
  });
  const unlocked = await processJob({
    ...job,
    tool: 'unlock',
    sources: [
      {
        id: 'a',
        file: new File([protectedResult.files[0].data as Uint8Array<ArrayBuffer>], 'protected.pdf'),
        password: 'round-trip-Δ',
      },
    ],
  });
  const original = await inspectPdf(new Uint8Array(await job.sources[0].file.arrayBuffer()));
  for (const [index, bytes] of [merged.files[0].data, unlocked.files[0].data].entries()) {
    const actual = await independentPdf(bytes, `.cache/release/roundtrip-${index}.pdf`);
    expect(actual.encrypted).toBe(false);
    expect(actual.pages.map((p) => p.text.trim())).toEqual(
      original.pages.map((p) => p.text.trim()),
    );
    expect(actual.pages.every((p) => p.media.join() === '0,0,300,400')).toBe(true);
  }
});

it('maximum size splitting accepts the measured byte boundary and respects one byte less', async () => {
  const job = await numberedJob('split');
  job.options.splitMode = 'size';
  job.options.maximumKiB = 100;
  const complete = (await processJob(job)).files[0].data;
  expect(complete.length).toBeGreaterThan(1024);
  job.options.maximumKiB = complete.length / 1024;
  expect((await processJob(job)).files[0].data.length).toBe(complete.length);
  job.options.maximumKiB = (complete.length - 1) / 1024;
  const result = (await processJob(job)).files[0];
  const parts = result.name.endsWith('.zip')
    ? Object.values(unzipSync(result.data))
    : [result.data];
  expect(parts.length).toBeGreaterThan(1);
  expect(parts.every((part) => part.length <= complete.length - 1)).toBe(true);
});

it('returns a single successful batch output directly while retaining partial-failure details', async () => {
  const f = await makeFixtures();
  const result = await processJob({
    tool: 'rotate',
    sources: [
      { id: 'good', file: new File([f.tiny], 'good.pdf') },
      { id: 'bad', file: new File(['bad'], 'bad.pdf') },
    ],
    pages: [{ id: 'page', sourceId: 'good', index: 0, rotation: 0 }],
    options: { ...defaultOptions },
  });
  expect(result.entries?.map((entry) => entry.status)).toEqual(['success', 'failed']);
  expect(result.note).toContain('Partial result');
  expect(result.files[0].name).toMatch(/\.pdf$/);
  expect((await inspectPdf(result.files[0].data)).count).toBe(1);
});
