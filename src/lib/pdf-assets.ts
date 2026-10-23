import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
export async function getPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  return pdfjs;
}
export function pdfOptions() {
  const origin = globalThis.location.origin;
  return {
    cMapUrl: `${origin}/pdf-assets/cmaps/`,
    cMapPacked: true,
    iccUrl: `${origin}/pdf-assets/iccs/`,
    standardFontDataUrl: `${origin}/pdf-assets/standard_fonts/`,
    wasmUrl: `${origin}/pdf-assets/wasm/`,
    isEvalSupported: false,
    stopAtErrors: true,
    isImageDecoderSupported: false,
    maxImageSize: 16_000_000,
    canvasMaxAreaInBytes: 64 * 1024 * 1024,
    useSystemFonts: false,
    enableXfa: false,
    verbosity: 0,
  };
}
