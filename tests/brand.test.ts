import { it, expect, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { PDFDocument } from 'pdf-lib';
import { brand, legacyPageRedirect, markSvg } from '../src/lib/brand';
import { seoPages, structuredData } from '../src/lib/seo';
import { publicAnalyticsUrl } from '../src/lib/analytics';
import { createBrandAssets } from '../scripts/brand-assets';
import { processJob } from '../src/lib/engine';
import { defaultOptions } from '../src/lib/types';
vi.mock('../src/generated/qpdf.wasm?url', async () => ({
  default: (await import('node:path')).resolve('src/generated/qpdf.wasm'),
}));

it('uses the Havisu product and canonical origin consistently across all public metadata', () => {
  expect(brand.name).toBe('Havisu');
  expect(brand.productName).toBe('Havisu PDF');
  expect(brand.origin).toBe('https://pdf.havisu.com');
  for (const page of seoPages) {
    expect(page.title).toContain(brand.productName);
    expect(JSON.stringify([page, structuredData(page)])).not.toMatch(/Paperlight|paperlight-kappa/);
    expect(JSON.stringify(structuredData(page))).toContain(brand.origin + page.path);
  }
  expect(publicAnalyticsUrl(`https://${brand.legacyHost}/tools/merge`)).toBeNull();
  expect(publicAnalyticsUrl(brand.origin + '/tools/merge?password=secret#signature')).toBe(
    brand.origin + '/tools/merge',
  );
});
it('redirects only legacy public pages and preserves the legacy asset/service origins', async () => {
  const paths = seoPages.map((page) => page.path);
  const config = JSON.parse(await readFile('vercel.json', 'utf8'));
  const redirects = config.redirects.filter((rule: { has?: unknown }) => rule.has);
  expect(redirects).toHaveLength(14);
  for (const path of paths) {
    expect(legacyPageRedirect(brand.legacyHost, path, paths)).toBe(brand.origin + path);
    expect(redirects.find((rule: { source: string }) => rule.source === path)).toMatchObject({
      has: [{ type: 'host', value: brand.legacyHost }],
      destination: brand.origin + path,
      permanent: true,
    });
    expect(legacyPageRedirect('pdf.havisu.com', path, paths)).toBeUndefined();
  }
  expect(legacyPageRedirect(brand.legacyHost, '/tools/merge/index.html?x=1', paths)).toBe(
    brand.origin + '/tools/merge?x=1',
  );
  for (const path of [
    '/assets/old.js',
    '/pdf-assets/abc/wasm/file.wasm',
    '/sw.js',
    '/public-assets.json',
    '/_vercel/insights/view',
    '/tools/missing',
  ])
    expect(legacyPageRedirect(brand.legacyHost, path, paths)).toBeUndefined();
});
it('exports portable outlined wordmarks, transparent marks and a legible small icon', async () => {
  const assets = await createBrandAssets();
  expect(assets).toHaveLength(17);
  expect(markSvg({ variant: 'light' })).toContain(brand.red);
  expect(markSvg({ variant: 'dark' })).toContain('#F1F0EE');
  for (const asset of assets.filter((asset) => asset.name.endsWith('.svg'))) {
    const svg = typeof asset.data === 'string' ? asset.data : Buffer.from(asset.data).toString();
    expect(svg).not.toMatch(/<text\b|<script\b|(?:href|src)=|Paperlight/i);
    expect(svg).toContain('<path');
  }
  const mark = await loadImage(
    Buffer.from(assets.find((asset) => asset.name === 'havisu-mark-light.png')!.data),
  );
  expect([mark.width, mark.height]).toEqual([1024, 1024]);
  const canvas = createCanvas(1024, 1024),
    ctx = canvas.getContext('2d');
  ctx.drawImage(mark, 0, 0);
  expect(ctx.getImageData(0, 0, 1, 1).data[3]).toBe(0);
  const icon = await loadImage(
    Buffer.from(assets.find((asset) => asset.name === 'havisu-icon-32.png')!.data),
  );
  const small = createCanvas(32, 32),
    paint = small.getContext('2d');
  paint.drawImage(icon, 0, 0);
  const pixels = paint.getImageData(0, 0, 32, 32).data;
  let red = 0,
    ink = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] > 180 && pixels[i + 1] < 100 && pixels[i + 2] < 100) red++;
    if (pixels[i] < 80 && pixels[i + 1] < 80 && pixels[i + 2] < 80 && pixels[i + 3] > 128) ink++;
  }
  expect(red).toBeGreaterThan(12);
  expect(ink).toBeGreaterThan(20);
});
it('brands generated output names while keeping names derived from the input file', async () => {
  const document = await PDFDocument.create();
  document.addPage();
  const bytes = await document.save();
  const source = {
    id: 'a',
    file: new File([bytes as Uint8Array<ArrayBuffer>], 'paperlight-invoice.pdf'),
  };
  const sources = [source, { ...source, id: 'b' }];
  const merged = await processJob({
    tool: 'merge',
    sources,
    pages: [],
    options: { ...defaultOptions },
  });
  expect(merged.files[0].name).toBe('havisu-pdf-merged.pdf');
  const rotated = await processJob({
    tool: 'rotate',
    sources,
    pages: [],
    options: { ...defaultOptions },
  });
  expect(rotated.files[0].name).toBe('havisu-pdf-rotate.zip');
  const compressed = await processJob({
    tool: 'compress',
    sources: [source],
    pages: [],
    options: { ...defaultOptions },
  });
  expect(compressed.files[0].name).toBe('paperlight-invoice-original.pdf');
});
