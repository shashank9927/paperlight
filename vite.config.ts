import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { serviceWorkerSource } from './scripts/service-worker';
import { seoPages } from './src/lib/seo';
import { createBrandAssets } from './scripts/brand-assets';
import { brand, legacyPageRedirect } from './src/lib/brand';

const assetRoot = resolve('node_modules/pdfjs-dist');
const assetFolders = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];
const pdfDigest = createHash('sha256');
for (const folder of assetFolders)
  for (const name of readdirSync(resolve(assetRoot, folder)))
    pdfDigest.update(folder + '/' + name).update(readFileSync(resolve(assetRoot, folder, name)));
const pdfAssetBase = '/pdf-assets/' + pdfDigest.digest('hex').slice(0, 12);
const appManifest = (icon192: string, icon512: string) =>
  JSON.stringify({
    id: '/',
    name: brand.productName,
    short_name: brand.productName,
    description: 'Private PDF tools that work on your device.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0b0c0e',
    theme_color: '#0b0c0e',
    icons: [
      { src: icon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icon512, sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  });
const securityHeaders = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; font-src 'self' blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Frame-Options': 'DENY',
};

export default defineConfig(({ isSsrBuild }) => ({
  define: { 'import.meta.env.VITE_PDF_ASSET_BASE': JSON.stringify(pdfAssetBase) },
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
          const redirect = legacyPageRedirect(
            request.headers.host,
            request.url || '/',
            seoPages.map((page) => page.path),
          );
          if (redirect) {
            response.statusCode = 308;
            response.setHeader('Location', redirect);
            response.end();
            return;
          }
          const path = (request.url || '').split('?')[0];
          const file = resolve('dist', path.slice(1));
          const isFile = existsSync(file) && statSync(file).isFile();
          const publicPage = seoPages.find(
            (page) =>
              page.path !== '/' &&
              [page.path, page.path + '/', page.path + '/index.html', page.path + '.html'].includes(
                path,
              ),
          );
          if (path === '/index.html' || (publicPage && path !== publicPage.path)) {
            response.statusCode = 308;
            response.setHeader('Location', publicPage?.path || '/');
            response.end();
            return;
          }
          if (publicPage) request.url = publicPage.path + '.html';
          if (
            /^\/(assets|pdf-assets|licenses)\//.test(path) &&
            (!/^\/[A-Za-z0-9_./-]+$/.test(path) || path.includes('..') || !isFile)
          ) {
            response.statusCode = 404;
            response.end('Asset not found');
            return;
          }
          if (
            path === '/' ||
            path === '/index.html' ||
            path === '/sw.js' ||
            path === '/manifest.webmanifest' ||
            path === '/install-capture.js' ||
            !!publicPage
          )
            response.setHeader('Cache-Control', 'no-cache');
          if (
            path !== '/' &&
            !publicPage &&
            !isFile &&
            !path.startsWith('/assets/') &&
            !path.startsWith('/pdf-assets/')
          ) {
            response.statusCode = 404;
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(readFileSync(resolve('dist/404.html')));
            return;
          }
          if (isFile && (/^\/assets\//.test(path) || /^\/pdf-assets\/[a-f0-9]{12}\//.test(path)))
            response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          next();
        });
      },
      configureServer(server) {
        let devAssets: ReturnType<typeof createBrandAssets> | undefined;
        server.middlewares.use((request, response, next) => {
          const path = (request.url || '').split('?')[0];
          if (path === '/manifest.webmanifest') {
            response.setHeader('Content-Type', 'application/manifest+json');
            response.setHeader('Cache-Control', 'no-cache');
            response.end(appManifest('/__havisu-icon-192.png', '/__havisu-icon-512.png'));
            return;
          }
          const match = path.match(/^\/__havisu-icon-(192|512)\.png$/);
          if (!match) return next();
          devAssets ??= createBrandAssets();
          void devAssets
            .then((assets) => {
              const icon = assets.find((asset) => asset.name === `havisu-icon-${match[1]}.png`);
              if (!icon) throw new Error('Missing install icon');
              response.setHeader('Content-Type', 'image/png');
              response.end(icon.data);
            })
            .catch(next);
        });
        server.middlewares.use(pdfAssetBase, (request, response, next) => {
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
      async generateBundle(_options, bundle) {
        if (isSsrBuild) return;
        const branded = await createBrandAssets();
        const brandPaths = branded.map((asset) => {
          const dot = asset.name.lastIndexOf('.');
          const path = `assets/${asset.name.slice(0, dot)}-${createHash('sha256').update(asset.data).digest('hex').slice(0, 12)}${asset.name.slice(dot)}`;
          this.emitFile({ type: 'asset', fileName: path, source: asset.data });
          return '/' + path;
        });
        const faviconPath = brandPaths
          .find((path) => /^\/assets\/favicon-.*\.svg$/.test(path))!
          .slice(1);
        const icon192 = brandPaths.find((path) => /^\/assets\/havisu-icon-192-.*\.png$/.test(path));
        const icon512 = brandPaths.find((path) => /^\/assets\/havisu-icon-512-.*\.png$/.test(path));
        if (!icon192 || !icon512) throw new Error('Missing install icons');
        const installCapture = readFileSync(resolve('public/install-capture.js'));
        const installCapturePath = `assets/install-capture-${createHash('sha256').update(installCapture).digest('hex').slice(0, 12)}.js`;
        this.emitFile({ type: 'asset', fileName: installCapturePath, source: installCapture });
        this.emitFile({
          type: 'asset',
          fileName: 'manifest.webmanifest',
          source: appManifest(icon192, icon512),
        });
        const allowed = Object.keys(bundle)
          .filter((name) => name.startsWith('assets/'))
          .map((name) => `/${name}`);
        if (!allowed.includes(`/${faviconPath}`)) allowed.push(`/${faviconPath}`);
        allowed.push('/manifest.webmanifest');
        if (!allowed.includes('/' + installCapturePath)) allowed.push('/' + installCapturePath);
        for (const path of brandPaths) if (!allowed.includes(path)) allowed.push(path);
        for (const folder of assetFolders)
          for (const name of readdirSync(resolve(assetRoot, folder))) {
            allowed.push(`${pdfAssetBase}/${folder}/${name}`);
            this.emitFile({
              type: 'asset',
              fileName: `${pdfAssetBase.slice(1)}/${folder}/${name}`,
              source: readFileSync(resolve(assetRoot, folder, name)),
            });
          }
        const version = createHash('sha256')
          .update(Object.keys(bundle).sort().join('|'))
          .digest('hex')
          .slice(0, 12);
        const shell = Object.keys(bundle)
          .filter(
            (name) =>
              /^assets\/index-.*\.(js|css)$/.test(name) ||
              /^assets\/inter-latin-wght-normal-.*\.woff2$/.test(name),
          )
          .map((name) => `/${name}`);
        this.emitFile({
          type: 'asset',
          fileName: 'public-assets.json',
          source: JSON.stringify({ version, assets: ['/favicon.svg', ...allowed] }),
        });
        this.emitFile({
          type: 'asset',
          fileName: 'sw.js',
          source: serviceWorkerSource(
            'paperlight-pages-v3-' + version,
            [
              '/',
              '/favicon.svg',
              '/' + faviconPath,
              '/manifest.webmanifest',
              '/' + installCapturePath,
              icon192,
              icon512,
              ...shell,
            ],
            ['/favicon.svg', ...allowed],
            seoPages.map((page) => page.path),
          ),
        });
      },
    },
  ],
  // Keep even small font subsets as same-origin files under the strict CSP.
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 650 },
  worker: { format: 'es' },
  server: { host: '0.0.0.0' },
  preview: { headers: securityHeaders, allowedHosts: [brand.legacyHost] },
}));
