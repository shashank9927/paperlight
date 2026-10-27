export function serviceWorkerSource(
  cache: string,
  shell: string[],
  assets: string[],
  pages: string[],
) {
  return `
const CACHE = ${JSON.stringify(cache)};
const SHELL = ${JSON.stringify(shell)};
const ASSETS = new Set(${JSON.stringify(assets)});
const PAGES = new Set(${JSON.stringify(pages)});
const PENDING_PAGES = new Map();
let manifestRequest;
const ownedCaches = async () => { try { return (await caches.keys()).filter(name => name.startsWith('paperlight-')); } catch { return []; } };
const openCache = async () => { try { return await caches.open(CACHE); } catch { return null; } };
const match = async (cache, key, options) => { try { return await cache?.match(key, options); } catch { return undefined; } };
const put = async (cache, key, response) => { try { if (cache) await cache.put(key, response); } catch { /* Storage is optional. */ } };
const previous = async key => {
  for (const name of (await ownedCaches()).reverse()) {
    try { const cached = await match(await caches.open(name), key, { ignoreVary: true }); if (cached) return cached; } catch { /* Optional storage. */ }
  }
};
const latestManifest = async expected => {
  if (manifestRequest && expected && (await manifestRequest)?.version !== expected) manifestRequest = undefined;
  if (!manifestRequest) manifestRequest = (async () => {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('/public-assets.json', { credentials: 'omit', cache: 'no-cache', signal: controller.signal });
      if (!response.ok || !response.body) return null;
      const reader = response.body.getReader();
      let body = '', size = 0;
      const decoder = new TextDecoder();
      while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 262144) { await reader.cancel(); return null; } body += decoder.decode(chunk.value, { stream: true }); }
      body += decoder.decode();
      const manifest = JSON.parse(body);
      if (!/^[a-f0-9]{12}$/.test(manifest.version) || !Array.isArray(manifest.assets) || manifest.assets.length > 2000 || !manifest.assets.every(path => typeof path === 'string' && (path === '/favicon.svg' || path === '/manifest.webmanifest' || path === '/install-capture.js' || /^\\/(?:assets\\/[A-Za-z0-9_.-]+|pdf-assets\\/[a-f0-9]{12}\\/(?:cmaps|standard_fonts|wasm|iccs)\\/[A-Za-z0-9_.-]+)$/.test(path)))) return null;
      let cache = null; try { cache = await caches.open('paperlight-pages-v3-' + manifest.version); } catch { /* Online only. */ }
      await put(cache, '/public-assets.json', new Response(body, { headers: { 'content-type': 'application/json' } }));
      return { cache, version: manifest.version, assets: new Set(manifest.assets) };
    } catch { return null; } finally { clearTimeout(deadline); }
  })();
  const result = await manifestRequest;
  if (!result) manifestRequest = undefined;
  return result;
};
const pageCache = async (response, fallback) => {
  try {
    const html = await response.clone().text();
    const version = html.match(/<meta name="paperlight-release" content="([a-f0-9]{12})">/)?.[1];
    if (version && !CACHE.endsWith(version)) { const latest = await latestManifest(version); return latest?.version === version ? latest.cache : null; }
  } catch { /* A response must remain usable when storage or inspection fails. */ }
  return fallback;
};
self.addEventListener('install', event => {
  event.waitUntil((async () => { try { const cache = await openCache(); if (cache) await cache.addAll(SHELL); } catch { /* Online use still works. */ } })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try { const keys = (await caches.keys()).filter(key => key.startsWith('paperlight-') && key !== CACHE); await Promise.all(keys.slice(0, -1).map(key => caches.delete(key))); } catch { /* Optional storage. */ }
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'activate-update') { event.waitUntil(self.skipWaiting()); return; }
  const path = event.data?.path;
  if (event.data?.type !== 'cache-public-page' || !PAGES.has(path)) return;
  let pending = PENDING_PAGES.get(path);
  if (!pending) {
    pending = (async () => {
      const cache = await openCache();
      if (!cache || await match(cache, path)) return;
      try { const response = await fetch(path, { credentials: 'omit', redirect: 'error' }); if (response.ok && response.headers.get('content-type')?.includes('text/html')) await put(await pageCache(response, cache), path, response); } catch { /* Offline use remains available. */ }
    })().finally(() => PENDING_PAGES.delete(path));
    PENDING_PAGES.set(path, pending);
  }
  event.waitUntil(pending);
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.search) return;
  const asset = ASSETS.has(url.pathname);
  const navigation = event.request.mode === 'navigate' && PAGES.has(url.pathname);
  // A newer worker may control an older open tab. Only previously cached,
  // immutable public files may be returned across generations; never fetch or
  // cache an arbitrary asset-like URL.
  const oldAsset = !asset && /^\\/(?:assets\\/[A-Za-z0-9_.-]+|pdf-assets\\/[a-f0-9]{12}\\/(?:cmaps|standard_fonts|wasm|iccs)\\/[A-Za-z0-9_.-]+)$/.test(url.pathname);
  if (!asset && !navigation && !oldAsset) return;
  event.respondWith((async () => {
    const cache = await openCache();
    const key = navigation ? url.pathname : event.request;
    // Unlike content-hashed files, the install manifest can change at the same URL.
    if (asset && url.pathname !== '/manifest.webmanifest' && url.pathname !== '/install-capture.js') { const cached = await match(cache, key, { ignoreVary: true }); if (cached) return cached; }
    if (oldAsset) {
      const cached = await previous(key); if (cached) return cached;
      const manifest = latestManifest();
      const response = await fetch(event.request);
      if (response.ok) { const copy = response.clone(); const save = manifest.then(latest => latest?.assets.has(url.pathname) ? put(latest.cache, key, copy) : undefined).catch(() => {}); if (event.waitUntil) event.waitUntil(save); }
      return response;
    }
    try {
      const response = await fetch(event.request);
      if (response.ok) { const copy = response.clone(); const save = (async () => put(navigation ? await pageCache(response, cache) : cache, key, copy))().catch(() => {}); if (event.waitUntil) event.waitUntil(save); }
      return response;
    } catch (error) { const cached = await match(cache, key, { ignoreVary: asset }) || await previous(key); if (cached) return cached; throw error; }
  })());
});`;
}
