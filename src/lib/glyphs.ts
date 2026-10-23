import fontUrl from 'pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url';
let font: Promise<{ hasGlyphForCodePoint(code: number): boolean }> | undefined;
export async function validateGlyphs(text: string) {
  font ??= (async () => {
    const { default: fontkit } = await import('@pdf-lib/fontkit');
    const response = await fetch(fontUrl);
    if (!response.ok) throw new Error('The bundled font could not be loaded.');
    return (
      fontkit as unknown as {
        create(data: Uint8Array): { hasGlyphForCodePoint(code: number): boolean };
      }
    ).create(new Uint8Array(await response.arrayBuffer()));
  })().catch((error) => {
    font = undefined;
    throw error;
  });
  const loaded = await font;
  if ([...text].some((char) => !loaded.hasGlyphForCodePoint(char.codePointAt(0)!)))
    throw new Error(
      'The bundled font cannot display this text. Try Latin, Greek or Cyrillic, or draw/upload your signature.',
    );
}
