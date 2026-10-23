import { build, loadEnv } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';

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
const template = await readFile('dist/index.html', 'utf8');
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
for (const page of [
  ...seoPages,
  {
    path: '/404',
    title: 'Page not found | Paperlight',
    description: 'Explore Paperlight’s free PDF tools.',
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
      'og:site_name': 'Paperlight',
      'og:url': isPage ? url : '',
      'og:image': `${siteOrigin}/social-card.png`,
      'og:image:width': '1200',
      'og:image:height': '630',
      'og:image:alt': 'Paperlight — free PDF tools, private by design',
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
const digest = createHash('sha256')
  .update(await readFile('dist/index.html'))
  .digest('hex')
  .slice(0, 12);
const worker = await readFile('dist/sw.js', 'utf8');
await writeFile(
  'dist/sw.js',
  worker.replace(/paperlight-pages-v2-[a-f0-9]+/, `paperlight-pages-v2-${digest}`),
);

// Generate share artwork locally from the existing licensed bundled font.
GlobalFonts.registerFromPath(
  'node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf',
  'Paperlight Card',
);
const canvas = createCanvas(1200, 630);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#101114';
ctx.fillRect(0, 0, 1200, 630);
ctx.strokeStyle = '#32343c';
ctx.lineWidth = 2;
ctx.strokeRect(48, 48, 1104, 534);
ctx.fillStyle = '#a9adff';
ctx.font = '30px "Paperlight Card"';
ctx.fillText('PAPERLIGHT', 96, 138);
ctx.fillStyle = '#f3f4f6';
ctx.font = '64px "Paperlight Card"';
ctx.fillText('Free PDF tools.', 96, 270);
ctx.fillText('Private by design.', 96, 350);
ctx.fillStyle = '#c6c8d0';
ctx.font = '27px "Paperlight Card"';
ctx.fillText('Merge · Split · Compress · Convert · Sign', 96, 454);
ctx.font = '23px "Paperlight Card"';
ctx.fillText('Your documents stay on your device.', 96, 510);
await writeFile('dist/social-card.png', canvas.toBuffer('image/png'));
console.log(
  `Generated ${seoPages.length} searchable pages, sitemap, robots, and social artwork. Indexing: ${indexable}; analytics: ${analytics}.`,
);
