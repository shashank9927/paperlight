import { build, loadEnv } from 'vite';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { brand, markSvg } from '../src/lib/brand.ts';
import { createBrandAssets, registerBrandFont } from './brand-assets.ts';

await build();
await build({ build: { ssr: 'src/entry-server.tsx', outDir: '.cache/ssr', emptyOutDir: true } });
const { render, seoPages, siteOrigin, structuredData } = await import(
  pathToFileURL(resolve('.cache/ssr/entry-server.js')).href
);
const indexable =
  process.env.VERCEL_ENV === 'production' ||
  (!process.env.VERCEL_ENV && process.env.PAPERLIGHT_INDEXABLE === '1');
const analytics = process.env.VERCEL_ENV === 'production';
const verification =
  process.env.GOOGLE_SITE_VERIFICATION ||
  loadEnv('production', process.cwd(), 'GOOGLE_SITE_VERIFICATION').GOOGLE_SITE_VERIFICATION;
const icons = (await readdir('dist/assets')).filter((file) =>
  /^favicon-[a-f0-9]{12}\.svg$/.test(file),
);
if (icons.length !== 1) throw new Error('Expected one bundled Havisu favicon.');
const touchIcon = (await readdir('dist/assets')).find((file) =>
  /^havisu-icon-180-.*\.png$/.test(file),
);
if (!touchIcon) throw new Error('Expected the Havisu touch icon.');
const template = (await readFile('dist/index.html', 'utf8'))
  .replace('href="/favicon.svg"', `href="/assets/${icons[0]}"`)
  .replace('</head>', `<link rel="apple-touch-icon" href="/assets/${touchIcon}">\n</head>`);
const pageDigest = createHash('sha256');
const renderedFiles = [];
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
for (const page of [
  ...seoPages,
  {
    path: '/404',
    title: `Page not found | ${brand.productName}`,
    description: `Explore ${brand.productName}’s free PDF tools.`,
  },
]) {
  const isPage = page.path !== '/404';
  const url = `${siteOrigin}${page.path}`;
  const metadata = [
    `<title>${escape(page.title)}</title>`,
    `<meta name="description" content="${escape(page.description)}">`,
    `<meta name="robots" content="${indexable && isPage ? 'index,follow' : 'noindex,follow'}">`,
    ...(isPage ? [`<link rel="canonical" href="${url}">`] : []),
    ...Object.entries({
      'og:title': page.title,
      'og:description': page.description,
      'og:type': 'website',
      'og:site_name': brand.productName,
      'og:url': isPage ? url : '',
      'og:image': `${siteOrigin}/social-card.png`,
      'og:image:width': '1200',
      'og:image:height': '630',
      'og:image:alt': `${brand.productName} — free PDF tools, private by design`,
    }).map(([property, value]) => `<meta property="${property}" content="${escape(value)}">`),
    ...Object.entries({
      'twitter:card': 'summary_large_image',
      'twitter:title': page.title,
      'twitter:description': page.description,
      'twitter:image': `${siteOrigin}/social-card.png`,
    }).map(([name, value]) => `<meta name="${name}" content="${escape(value)}">`),
    ...(isPage
      ? [
          `<script id="seo-structured-data" type="application/ld+json">${JSON.stringify(structuredData(page)).replace(/</g, '\\u003c')}</script>`,
        ]
      : []),
    ...(verification
      ? [`<meta name="google-site-verification" content="${escape(verification)}">`]
      : []),
  ].join('\n');
  const html = template
    .replace(/<title>[^<]*<\/title>/, '')
    .replace(/<meta\s+name="description"[^>]*>/, '')
    .replace(
      '<html lang="en">',
      `<html lang="en" data-indexable="${indexable}" data-analytics="${analytics}">`,
    )
    .replace('</head>', `${metadata}\n</head>`)
    .replace('<div id="root"></div>', `<div id="root">${await render(page.path)}</div>`);
  const file = page.path === '/' ? 'dist/index.html' : `dist${page.path}.html`;
  await mkdir(resolve(file, '..'), { recursive: true });
  await writeFile(file, html);
  renderedFiles.push(file);
  pageDigest.update(page.path).update(html);
}
await writeFile(
  'dist/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${seoPages.map((page) => `<url><loc>${siteOrigin}${page.path}</loc></url>`).join('')}</urlset>\n`,
);
await writeFile(
  'dist/robots.txt',
  indexable
    ? `User-agent: *\nAllow: /\nSitemap: ${siteOrigin}/sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n',
);

// Invalidate offline HTML whenever page content changes, even if chunk names do not.
const digest = pageDigest.digest('hex').slice(0, 12);
for (const file of renderedFiles) {
  const html = await readFile(file, 'utf8');
  await writeFile(
    file,
    html.replace('</head>', `<meta name="paperlight-release" content="${digest}">\n</head>`),
  );
}
const manifest = JSON.parse(await readFile('dist/public-assets.json', 'utf8'));
manifest.version = digest;
await writeFile('dist/public-assets.json', JSON.stringify(manifest));
const worker = await readFile('dist/sw.js', 'utf8');
await writeFile(
  'dist/sw.js',
  worker.replace(/paperlight-pages-v3-[a-f0-9]+/, `paperlight-pages-v3-${digest}`),
);

// Source and reusable exports stay local; runtime assets are emitted with hashes.
await mkdir('.cache/havisu-brand-kit', { recursive: true });
for (const asset of await createBrandAssets())
  await writeFile(`.cache/havisu-brand-kit/${asset.name}`, asset.data);
await writeFile(
  '.cache/havisu-brand-kit/Inter-OFL.txt',
  await readFile('public/licenses/Inter.txt'),
);
await writeFile(
  '.cache/havisu-brand-kit/README.txt',
  `Havisu brand kit\n\nOriginal refined brush H for Havisu and Havisu PDF.\nUse *-light on light surfaces and *-dark on dark surfaces. SVG wordmarks have outlined Inter lettering; PNG marks and wordmarks have transparent backgrounds.\nThe simplified tiled favicon and 32/180/192/512 px icons work across themes.\nAccent: #E63323. Primary button: #C52B20 with white text.\nCanonical product origin: ${brand.origin}\n\nMaster geometry: src/lib/brand.ts. Rebuild assets: npm run build.\nInter font license is included as Inter-OFL.txt.\n`,
);
registerBrandFont();
const canvas = createCanvas(1200, 630);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#0b0c0e';
ctx.fillRect(0, 0, 1200, 630);
ctx.strokeStyle = '#2c2e33';
ctx.lineWidth = 2;
ctx.strokeRect(48, 48, 1104, 534);
ctx.drawImage(await loadImage(Buffer.from(markSvg({ variant: 'dark' }))), 78, 64, 106, 106);
ctx.fillStyle = '#f1f0ee';
ctx.font = '600 42px "Havisu Inter"';
ctx.fillText(brand.name, 202, 132);
const wordmarkWidth = ctx.measureText(brand.name).width;
ctx.fillStyle = '#a8abb2';
ctx.font = '500 22px "Havisu Inter"';
ctx.fillText('PDF', 202 + wordmarkWidth + 16, 131);
ctx.fillStyle = '#f1f0ee';
ctx.font = '600 68px "Havisu Inter"';
ctx.fillText('Free PDF tools.', 96, 290);
ctx.fillText('Private by design.', 96, 376);
ctx.fillStyle = '#c2c4ca';
ctx.font = '400 25px "Havisu Inter"';
ctx.fillText('Merge · Split · Compress · Convert · Sign', 96, 468);
ctx.fillStyle = '#ff8a7b';
ctx.font = '500 23px "Havisu Inter"';
ctx.fillText(new URL(brand.origin).host, 96, 538);
await writeFile('dist/social-card.png', canvas.toBuffer('image/png'));
console.log(
  `Generated ${seoPages.length} searchable pages, sitemap, robots, and social artwork. Indexing: ${indexable}; analytics: ${analytics}.`,
);
