import type { PdfFont, TextStyle, ToolOptions } from './types';
import { pageNumber } from './geometry';
import sans from 'pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url';
import sansBold from 'pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf?url';
import sansItalic from 'pdfjs-dist/standard_fonts/LiberationSans-Italic.ttf?url';
import sansBoldItalic from 'pdfjs-dist/standard_fonts/LiberationSans-BoldItalic.ttf?url';
import serif from '../assets/fonts/LiberationSerif-Regular.ttf?url';
import serifBold from '../assets/fonts/LiberationSerif-Bold.ttf?url';
import serifItalic from '../assets/fonts/LiberationSerif-Italic.ttf?url';
import serifBoldItalic from '../assets/fonts/LiberationSerif-BoldItalic.ttf?url';
import mono from '../assets/fonts/LiberationMono-Regular.ttf?url';
import monoBold from '../assets/fonts/LiberationMono-Bold.ttf?url';
import monoItalic from '../assets/fonts/LiberationMono-Italic.ttf?url';
import monoBoldItalic from '../assets/fonts/LiberationMono-BoldItalic.ttf?url';
const fonts: Record<PdfFont, string[]> = {
  sans: [sans, sansBold, sansItalic, sansBoldItalic],
  serif: [serif, serifBold, serifItalic, serifBoldItalic],
  mono: [mono, monoBold, monoItalic, monoBoldItalic],
  signature: [serifItalic, serifBoldItalic, serifItalic, serifBoldItalic],
};
export function fontAsset(style: Pick<TextStyle, 'fontFamily' | 'bold' | 'italic'>) {
  return fonts[style.fontFamily || 'sans'][(style.bold ? 1 : 0) + (style.italic ? 2 : 0)];
}
export const fontCss = (font: PdfFont = 'sans') =>
  font === 'sans' ? 'Paperlight Annotation' : 'Paperlight ' + font;
export function numberText(options: ToolOptions, ordinal: number, selected: number, total: number) {
  const n = options.startNumber + ordinal,
    end = options.startNumber + selected - 1;
  if (options.numberStyle !== 'custom') return pageNumber(n, end, options.numberStyle);
  return options.numberTemplate.replace(/\{(n|p|r|rf)\}/g, (_, token: string) =>
    String(({ n, p: total, r: selected, rf: end } as Record<string, number>)[token]),
  );
}
export function numberPosition(options: ToolOptions, index: number, width: number, height: number) {
  let x = options.x;
  if (options.facingPages && (index - (options.coverPage ? 1 : 0)) % 2 === 1) x = 1 - x;
  const mx = Math.min(options.numberMargin, width / 3) / width,
    my = Math.min(options.numberMargin, height / 3) / height;
  return { x: Math.max(mx, Math.min(1 - mx, x)), y: Math.max(my, Math.min(1 - my, options.y)) };
}
export function tilePositions(tile: boolean, x: number, y: number) {
  return tile
    ? [0.15, 0.5, 0.85].flatMap((y) => [0.2, 0.5, 0.8].map((x) => ({ x, y })))
    : [{ x, y }];
}
