import { it, expect, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { processJob } from '../src/lib/engine';
import { defaultOptions } from '../src/lib/types';
vi.mock('../src/generated/qpdf.wasm?url', async () => ({
  default: (await import('node:path')).resolve('src/generated/qpdf.wasm'),
}));
function oracle(mode: string, path: string) {
  const result = spawnSync(
    process.env.PAPERLIGHT_PYTHON || 'python',
    ['scripts/signature-fixture.py', mode, path],
    { encoding: 'utf8', timeout: 30000 },
  );
  if (result.status) throw new Error(result.stderr);
  return JSON.parse(result.stdout);
}
it('independently verifies a real detached signature and demonstrates rewriting invalidates it', async () => {
  const original = resolve('.cache/independent/certificate-original.pdf');
  oracle('create', original);
  expect(oracle('verify', original).integrityValid).toBe(true);
  const bytes = await readFile(original);
  const source = { id: 'a', file: new File([bytes], 'signed.pdf') };
  const pages = [{ id: 'p', sourceId: 'a', index: 0, rotation: 0 }];
  const extracted = await processJob({
    tool: 'split',
    sources: [source],
    pages,
    options: defaultOptions,
  });
  const extractedPath = resolve('.cache/independent/certificate-extracted.pdf');
  await writeFile(extractedPath, extracted.files[0].data);
  expect(oracle('verify', extractedPath).integrityValid).toBe(false);
  const result = await processJob({
    tool: 'rotate',
    sources: [source],
    pages,
    options: defaultOptions,
  });
  const rewritten = resolve('.cache/independent/certificate-rewritten.pdf');
  await writeFile(rewritten, result.files[0].data);
  expect(oracle('verify', rewritten).integrityValid).toBe(false);
});
