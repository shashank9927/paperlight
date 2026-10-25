import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';

const origin = new URL(process.argv[2] || 'http://127.0.0.1:4180');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname), 'Load verification is restricted to a local host.');
const paths = ['/', '/tools/merge', '/tools/split', '/tools/compress', '/alternatives/ilovepdf', '/favicon.svg'];
const reports = [];
let bytes = 0;
for (const [concurrency, count] of [[1, 30], [10, 100], [50, 250], [100, 400]]) {
  let next = 0;
  const latency = [], errors = [];
  const started = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < count && bytes < 128 * 1024 * 1024) {
      const index = next++, path = paths[index % paths.length], before = performance.now();
      try {
        const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(10000) });
        if (response.status !== 200) errors.push({ path, status: response.status });
        const data = await response.arrayBuffer();
        assert.ok(data.byteLength < 2 * 1024 * 1024, 'Unexpected oversized public response');
        bytes += data.byteLength;
      } catch (error) { errors.push({ path, error: error.message }); }
      latency.push(performance.now() - before);
    }
  }));
  latency.sort((a, b) => a - b);
  reports.push({ concurrency, requests: latency.length, errors, durationMs: Math.round(performance.now() - started), p50Ms: Math.round(latency[Math.floor(latency.length * .5)]), p95Ms: Math.round(latency[Math.floor(latency.length * .95)]), maxMs: Math.round(latency.at(-1)) });
}
const report = { origin: origin.origin, checkedAt: new Date().toISOString(), bytes, reports, limitation: 'Bounded local HTTP concurrency verification; not a global CDN capacity or sustained-traffic guarantee.' };
await mkdir('.cache', { recursive: true });
await writeFile('.cache/static-load-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
assert.ok(reports.every(stage => stage.errors.length === 0), 'Unexpected static-host errors');
