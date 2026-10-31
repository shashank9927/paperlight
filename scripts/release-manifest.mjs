import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

const hash = (data) => createHash('sha256').update(data).digest('hex');
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = `${directory}/${entry.name}`;
      return entry.isDirectory() ? files(path) : [path];
    }),
  );
  return nested.flat().sort();
}
const buildDirectory = process.argv[2] || 'dist';
const assets = await Promise.all(
  (await files(buildDirectory)).map(async (path) => {
    const bytes = await readFile(path);
    return {
      path: path.slice(buildDirectory.length + 1),
      bytes: bytes.length,
      sha256: hash(bytes),
    };
  }),
);
const sourcePaths = execFileSync(
  'git',
  [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    'src',
    'public',
    'deployment',
    'scripts',
    'package.json',
    'package-lock.json',
    'index.html',
    'vite.config.ts',
    'tsconfig.json',
  ],
  { encoding: 'utf8' },
)
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .sort();
const sourceHashes = await Promise.all(
  sourcePaths.map(async (path) => ({ path, sha256: hash(await readFile(path)) })),
);
const report = {
  generatedAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
  sourceTreeSha256: hash(JSON.stringify(sourceHashes)),
  artifactTreeSha256: hash(JSON.stringify(assets)),
  assetCount: assets.length,
  totalBytes: assets.reduce((total, asset) => total + asset.bytes, 0),
  lockfileSha256: hash(await readFile('package-lock.json')),
  assets,
};
await mkdir('.cache', { recursive: true });
await writeFile('.cache/release-manifest.json', JSON.stringify(report, null, 2) + '\n');
const { assets: _, ...summary } = report;
console.log(JSON.stringify(summary, null, 2));
