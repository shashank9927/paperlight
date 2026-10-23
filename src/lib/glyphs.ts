import { fontAsset } from './annotation-style';
import type { PdfFont } from './types';
const fonts = new Map<string, Promise<{ hasGlyphForCodePoint(code: number): boolean }>>();
export async function validateGlyphs(text: string, family: PdfFont = 'sans') {
  const url = fontAsset({ fontFamily: family, bold: false, italic: family === 'signature' });
  let font = fonts.get(url);
  if (!font) {
    font = (async () => {
      const { default: fontkit } = await import('@pdf-lib/fontkit');
      const response = await fetch(url);
      if (!response.ok) throw new Error('The bundled font could not be loaded.');
      return (
        fontkit as unknown as {
          create(data: Uint8Array): { hasGlyphForCodePoint(code: number): boolean };
        }
      ).create(new Uint8Array(await response.arrayBuffer()));
    })().catch((error) => {
      fonts.delete(url);
      throw error;
    });
    fonts.set(url, font);
  }
  const loaded = await font;
  if ([...text].some((char) => !loaded.hasGlyphForCodePoint(char.codePointAt(0)!)))
    throw new Error(
      'The bundled font cannot display this text. Try Latin, Greek or Cyrillic, or draw/upload your signature.',
    );
}
