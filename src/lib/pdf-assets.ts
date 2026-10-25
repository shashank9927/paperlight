import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
export async function getPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  return pdfjs;
}
export function pdfOptions() {
  const origin = globalThis.location.origin;
  const base = `${origin}${import.meta.env.VITE_PDF_ASSET_BASE || '/pdf-assets'}`;
  return {
    cMapUrl: `${base}/cmaps/`,
    cMapPacked: true,
    iccUrl: `${base}/iccs/`,
    standardFontDataUrl: `${base}/standard_fonts/`,
    wasmUrl: `${base}/wasm/`,
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
