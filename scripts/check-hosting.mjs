import assert from 'node:assert/strict';
import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
const origin = process.argv[2] || 'http://127.0.0.1:4180';
const get = (path) => fetch(origin + path, { signal: AbortSignal.timeout(10000) });
const legacyGet = (path) =>
  new Promise((resolve, reject) => {
    const request = (origin.startsWith('https:') ? httpsGet : httpGet)(
      origin + path,
      {
        headers: { host: 'paperlight-kappa.vercel.app' },
        signal: AbortSignal.timeout(10000),
      },
      (response) => {
        response.resume();
        response.on('end', () =>
          resolve({ status: response.statusCode, location: response.headers.location }),
        );
        response.on('error', reject);
      },
    );
    request.on('error', reject);
  });
const routes = [
  '/',
  '/alternatives/ilovepdf',
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
assert.match(shell, /rel="manifest" href="\/manifest\.webmanifest"/);
const appManifestResponse = await get('/manifest.webmanifest');
assert.equal(appManifestResponse.status, 200);
assert.match(appManifestResponse.headers.get('content-type'), /application\/manifest\+json/);
assert.match(appManifestResponse.headers.get('cache-control'), /no-cache/);
const appManifest = await appManifestResponse.json();
assert.equal(appManifest.name, 'Havisu PDF');
assert.equal(appManifest.start_url, '/');
assert.equal(appManifest.display, 'standalone');
for (const size of ['192x192', '512x512']) {
  const icon = appManifest.icons.find((item) => item.sizes === size);
  assert.ok(icon && /^\/assets\/havisu-icon-/.test(icon.src));
  const response = await get(icon.src);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /image\/png/);
  await response.body?.cancel();
}
const capturePath = shell.match(/src="(\/assets\/install-capture-[a-f0-9]{12}\.js)"/)[1];
const installCapture = await get(capturePath);
assert.equal(installCapture.status, 200);
assert.match(installCapture.headers.get('content-type'), /javascript/);
assert.match(installCapture.headers.get('cache-control'), /immutable/);
await installCapture.body?.cancel();
const script = shell.match(/src="(\/assets\/index-[^\"]+\.js)"/)[1];
const entry = await get(script);
assert.match(entry.headers.get('content-type'), /javascript/);
assert.match(entry.headers.get('cache-control'), /immutable/);
await entry.body?.cancel();
const sw = await (await get('/sw.js')).text();
const manifestResponse = await get('/public-assets.json');
assert.equal(manifestResponse.status, 200);
const manifest = await manifestResponse.json();
assert.match(manifest.version, /^[a-f0-9]{12}$/);
assert.ok(shell.includes(`name="paperlight-release" content="${manifest.version}"`));
assert.ok(
  manifest.assets.every(
    (path) =>
      path === '/favicon.svg' ||
      path === '/manifest.webmanifest' ||
      /^\/(?:assets\/[A-Za-z0-9_.-]+|pdf-assets\/[a-f0-9]{12}\/(?:cmaps|standard_fonts|wasm|iccs)\/[A-Za-z0-9_.-]+)$/.test(
        path,
      ),
  ),
);
const pdfAsset = await get(
  manifest.assets.find((path) => /^\/pdf-assets\/.+\/wasm\/.+\.wasm$/.test(path)),
);
assert.equal(pdfAsset.status, 200);
assert.equal(pdfAsset.headers.get('content-type'), 'application/wasm');
assert.match(pdfAsset.headers.get('cache-control'), /immutable/);
await pdfAsset.body?.cancel();
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
// Canonical redirects must retain the public origin behind a port mapping/proxy.
let canonicalRedirects = 0;
for (const route of routes) {
  for (const alias of route === '/'
    ? ['/index.html']
    : [route + '/', route + '/index.html', route + '.html']) {
    const response = await fetch(origin + alias + '?source=canonical', {
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, 308, `canonical redirect: ${alias}`);
    assert.equal(
      new URL(response.headers.get('location'), origin).href,
      origin + route + '?source=canonical',
      `canonical origin/path/query: ${alias}`,
    );
    const followed = await get(alias + '?source=canonical');
    assert.equal(followed.status, 200, `canonical destination: ${alias}`);
    await followed.body?.cancel();
    canonicalRedirects++;
  }
}
// Only public pages move origins. Old editing tabs must still load their workers.
for (const route of routes) {
  const response = await legacyGet(route + '?source=legacy');
  assert.ok([301, 308].includes(response.status), `legacy redirect: ${route}`);
  assert.equal(response.location, `https://pdf.havisu.com${route}?source=legacy`);
}
for (const path of [
  script,
  wasm,
  '/sw.js',
  '/public-assets.json',
  '/manifest.webmanifest',
  capturePath,
]) {
  const response = await legacyGet(path);
  assert.equal(response.status, 200, `legacy editing asset: ${path}`);
  assert.equal(response.location, undefined);
}
for (const path of [
  '/assets/missing.js',
  '/pdf-assets/wasm/missing.wasm',
  '/missing/path',
  '/tools',
  '/tools/',
  '/tools/split/indexXhtml',
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
      canonicalRedirects,
      legacyPageRedirects: routes.length,
      legacyEditingAssets: 6,
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
