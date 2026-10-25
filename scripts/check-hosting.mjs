import assert from 'node:assert/strict';
const origin = process.argv[2] || 'http://127.0.0.1:4180';
const get = (path) => fetch(origin + path, { signal: AbortSignal.timeout(10000) });
const routes = [
  '/',
  ...[
    'merge',
    'split',
    'compress',
    'organize',
    'rotate',
    'images-to-pdf',
    'pdf-to-images',
    'watermark',
    'page-numbers',
    'protect',
    'unlock',
    'sign',
  ].map((tool) => '/tools/' + tool),
];
let shell;
for (const route of routes) {
  const response = await get(route);
  assert.equal(response.status, 200, route);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(response.headers.get('content-security-policy'), /worker-src 'self'/);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(response.headers.get('cache-control'), /no-cache/);
  shell = await response.text();
}
const script = shell.match(/src="([^\"]+\.js)"/)[1];
const entry = await get(script);
assert.match(entry.headers.get('content-type'), /javascript/);
await entry.body?.cancel();
const sw = await (await get('/sw.js')).text();
const modules = [...sw.matchAll(/"([^\"]+\.(?:js|mjs))"/g)].map((match) => match[1]);
assert.ok(
  modules.some((path) => path.endsWith('.mjs')),
  'PDF.js module worker is cached',
);
for (const path of modules) {
  const response = await get(path);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get('content-type'), /javascript/, path);
  await response.body?.cancel();
}
const wasm = sw.match(/"([^\"]+qpdf[^\"]+\.wasm)"/)[1];
const wasmResponse = await get(wasm);
assert.equal(wasmResponse.headers.get('content-type'), 'application/wasm');
await wasmResponse.body?.cancel();
for (const path of [
  '/assets/missing.js',
  '/pdf-assets/wasm/missing.wasm',
  '/missing/path',
  '/tools',
  '/tools/',
  '/assets/',
  '/licenses/',
]) {
  const response = await get(path);
  assert.equal(response.status, 404, path);
  await response.body?.cancel();
}
console.log(
  JSON.stringify(
    {
      origin,
      routes: routes.length,
      headers: 'passed',
      wasmMime: 'passed',
      javascriptMime: `${modules.length} scripts and module workers passed`,
      static404: 'passed',
      checkedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
