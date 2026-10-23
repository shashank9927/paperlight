import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const assetRoot = resolve('node_modules/pdfjs-dist');
const assetFolders = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];
const securityHeaders = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; font-src 'self' blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Frame-Options': 'DENY',
};

export default defineConfig(({ isSsrBuild }) => ({
  // Worker-only imports are not found by the normal entry-point scan. Include
  // them up front so the first PDF job cannot trigger an optimizer page reload.
  optimizeDeps: {
    include: ['pdf-lib', 'fflate', '@neslinesli93/qpdf-wasm', '@pdf-lib/fontkit', 'pdfjs-dist'],
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'local-pdf-assets',
      configurePreviewServer(server) {
        server.middlewares.use((request, response, next) => {
          const path = (request.url || '').split('?')[0];
          const toolPath = path.match(
            /^\/tools\/(merge|split|compress|organize|rotate|images-to-pdf|pdf-to-images|watermark|page-numbers|protect|unlock|sign)(?:\/|\/index\.html|\.html)?$/,
          );
          if (path === '/index.html' || (toolPath && path !== `/tools/${toolPath[1]}`)) {
            response.statusCode = 308;
            response.setHeader('Location', toolPath ? `/tools/${toolPath[1]}` : '/');
            response.end();
            return;
          }
          if (toolPath) request.url = `/tools/${toolPath[1]}.html`;
          if (
            /^\/(assets|pdf-assets|licenses)\//.test(path) &&
            (!/^\/[A-Za-z0-9_./-]+$/.test(path) ||
              path.includes('..') ||
              !existsSync(resolve('dist', path.slice(1))))
          ) {
            response.statusCode = 404;
            response.end('Asset not found');
            return;
          }
          if (
            path === '/' ||
            path === '/index.html' ||
            path === '/sw.js' ||
            path.startsWith('/tools/')
          )
            response.setHeader('Cache-Control', 'no-cache');
          if (
            path !== '/' &&
            !toolPath &&
            !existsSync(resolve('dist', path.slice(1))) &&
            !path.startsWith('/assets/') &&
            !path.startsWith('/pdf-assets/')
          ) {
            response.statusCode = 404;
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(readFileSync(resolve('dist/404.html')));
            return;
          }
          next();
        });
      },
      configureServer(server) {
        server.middlewares.use('/pdf-assets', (request, response, next) => {
          const path = decodeURIComponent((request.url || '').split('?')[0]);
          const match = path.match(/^\/(cmaps|standard_fonts|wasm|iccs)\/([A-Za-z0-9_.-]+)$/);
          if (!match) return next();
          try {
            response.setHeader(
              'Content-Type',
              path.endsWith('.wasm')
                ? 'application/wasm'
                : path.endsWith('.js')
                  ? 'text/javascript'
                  : 'application/octet-stream',
            );
            response.end(readFileSync(resolve(assetRoot, match[1], match[2])));
          } catch {
            next();
          }
        });
      },
      generateBundle(_options, bundle) {
        if (isSsrBuild) return;
        const allowed = Object.keys(bundle)
          .filter((name) => name.startsWith('assets/'))
          .map((name) => `/${name}`);
        for (const folder of assetFolders)
          for (const name of readdirSync(resolve(assetRoot, folder))) {
            allowed.push(`/pdf-assets/${folder}/${name}`);
            this.emitFile({
              type: 'asset',
              fileName: `pdf-assets/${folder}/${name}`,
              source: readFileSync(resolve(assetRoot, folder, name)),
            });
          }
        const version = createHash('sha256')
          .update(Object.keys(bundle).sort().join('|'))
          .digest('hex')
          .slice(0, 12);
        const shell = Object.keys(bundle)
          .filter((name) => /^assets\/index-.*\.(js|css)$/.test(name))
          .map((name) => `/${name}`);
        this.emitFile({
          type: 'asset',
          fileName: 'sw.js',
          source: `
const CACHE = 'paperlight-pages-v2-${version}';
const SHELL = ${JSON.stringify(['/', '/favicon.svg', ...shell])};
const ASSETS = new Set(${JSON.stringify(['/favicon.svg', ...allowed])});
const TOOLS = new Set(['merge','split','compress','organize','rotate','images-to-pdf','pdf-to-images','watermark','page-numbers','protect','unlock','sign'].map(tool => '/tools/' + tool));
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('paperlight-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.search) return;
  const asset = ASSETS.has(url.pathname);
  const appNavigation = event.request.mode === 'navigate' && (url.pathname === '/' || TOOLS.has(url.pathname));
  if (!asset && !appNavigation) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    if (asset) { const cached = await cache.match(event.request); if (cached) return cached; }
    const key = appNavigation ? url.pathname : event.request;
    try { const response = await fetch(event.request); if (response.ok) await cache.put(key, response.clone()); return response; }
    catch (error) { const cached = await cache.match(key); if (cached) return cached; throw error; }
  }));
});`,
        });
      },
    },
  ],
  // Keep even small font subsets as same-origin files under the strict CSP.
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 650 },
  worker: { format: 'es' },
  server: { host: '0.0.0.0' },
  preview: { headers: securityHeaders },
}));
