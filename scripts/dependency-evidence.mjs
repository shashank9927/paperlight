import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { platform, release } from 'node:os';
const require = createRequire(import.meta.url);
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const packages = Object.fromEntries(
  Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
    .sort()
    .map((name) => [name, lock.packages[`node_modules/${name}`].version]),
);
const upstreamWasm = resolve('node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
const wasm = resolve('src/generated/qpdf.wasm');
const messages = [],
  log = console.log;
console.log = (message) => messages.push(String(message));
try {
  const instance = await require('@neslinesli93/qpdf-wasm')({ locateFile: () => wasm });
  instance.callMain(['--version']);
} finally {
  console.log = log;
}
const glue = readFileSync('node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.js', 'utf8');
const report = {
  node: process.version,
  platform: platform(),
  osRelease: release(),
  packages,
  bundledQpdf: messages,
  wasmSHA256: createHash('sha256').update(readFileSync(wasm)).digest('hex'),
  upstreamWasmSHA256: createHash('sha256').update(readFileSync(upstreamWasm)).digest('hex'),
  wasmMemoryMaximumMiB: 512,
  adapter:
    'scripts/prepare-engine.mjs changes only the memory maximum in the verified QPDF 12.2.0 binary.',
  wasmRandomProvider: {
    referencesGetRandomValues: glue.includes('crypto.getRandomValues'),
    referencesMathRandom: glue.includes('Math.random'),
    note: 'See hardening.test.ts: runtime calls exceed the owner-password calls, and ciphertext varies.',
  },
};
mkdirSync('docs/evidence', { recursive: true });
writeFileSync('docs/evidence/dependencies.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
