import { createCanvas, loadImage, GlobalFonts, convertSVGTextToPath } from '@napi-rs/canvas';
import { brand, markSvg } from '../src/lib/brand.ts';

export interface BrandAsset {
  name: string;
  data: Uint8Array | string;
}
export const brandFontPath =
  'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2';
export function registerBrandFont() {
  if (!GlobalFonts.registerFromPath(brandFontPath, 'Havisu Inter'))
    throw new Error('The bundled Havisu Inter font could not be loaded.');
}
export async function createBrandAssets(): Promise<BrandAsset[]> {
  registerBrandFont();
  const assets: BrandAsset[] = [
    { name: 'favicon.svg', data: markSvg({ simple: true, tile: true }) },
  ];
  for (const variant of ['light', 'dark'] as const) {
    const svg = markSvg({ variant });
    assets.push({ name: `havisu-mark-${variant}.svg`, data: svg });
    const mark = await loadImage(Buffer.from(svg));
    const canvas = createCanvas(1024, 1024);
    canvas.getContext('2d').drawImage(mark, 0, 0, 1024, 1024);
    assets.push({ name: `havisu-mark-${variant}.png`, data: canvas.toBuffer('image/png') });
    const color = variant === 'dark' ? '#F1F0EE' : '#171717';
    const secondary = variant === 'dark' ? '#A8ABB2' : '#60646C';
    const measure = createCanvas(1, 1).getContext('2d');
    measure.font = '600 86px "Havisu Inter"';
    const width = Math.ceil(measure.measureText(brand.name).width);
    for (const product of [false, true]) {
      const end = 152 + width + (product ? 102 : 24);
      const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${end}" height="160" viewBox="0 0 ${end} 160"><title>${product ? brand.productName : brand.name}</title><g transform="translate(0 16) scale(.8)">${svg.replace(/<\/?svg[^>]*>/g, '').replace(/<title>.*?<\/title>/, '')}</g><text x="152" y="108" fill="${color}" font-family="Havisu Inter" font-size="86" font-weight="600" letter-spacing="-3">Havisu</text>${product ? `<text x="${152 + width + 12}" y="107" fill="${secondary}" font-family="Havisu Inter" font-size="30" font-weight="500">PDF</text>` : ''}</svg>`;
      const outlined = convertSVGTextToPath(Buffer.from(source));
      const name = `havisu-${product ? 'pdf-lockup' : 'wordmark'}-${variant}`;
      assets.push({ name: name + '.svg', data: outlined });
      const image = await loadImage(outlined),
        png = createCanvas(end * 2, 320);
      png.getContext('2d').drawImage(image, 0, 0, end * 2, 320);
      assets.push({ name: name + '.png', data: png.toBuffer('image/png') });
    }
  }
  const icon = await loadImage(Buffer.from(markSvg({ simple: true, tile: true })));
  for (const size of [32, 180, 192, 512]) {
    const canvas = createCanvas(size, size);
    canvas.getContext('2d').drawImage(icon, 0, 0, size, size);
    assets.push({ name: `havisu-icon-${size}.png`, data: canvas.toBuffer('image/png') });
  }
  return assets;
}
