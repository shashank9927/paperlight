import { loadPdfSafely, checkPreviewImages } from './safe-pdf';
import { qpdfSession, PdfEngineLoadError } from './qpdf';
import { MAX_BYTES } from './types';
import { validatePassword } from './password';

console.log = console.warn = console.error = console.info = console.debug = () => {};
self.onmessage = async ({ data }: MessageEvent<{ file: File; password?: string }>) => {
  const qpdf = qpdfSession();
  try {
    if (data.file.size > MAX_BYTES) throw new Error('This PDF exceeds the 100 MB input limit.');
    let bytes: Uint8Array = new Uint8Array(await data.file.arrayBuffer());
    const encrypted =
      (await qpdf.run([bytes], ['/input.pdf', '--is-encrypted'], 'encryption'))[0] === 1;
    if (encrypted) {
      validatePassword(data.password ?? '');
      bytes = await qpdf.run(
        [bytes],
        [
          '--password=' + (data.password ?? ''),
          '--password-mode=unicode',
          '--decrypt',
          '/input.pdf',
          '/output.pdf',
        ],
      );
    }
    checkPreviewImages(await loadPdfSafely(bytes));
    self.postMessage({ ok: true, encrypted });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const limited = /^(This PDF|Choose 1–500 pages|Image dimensions|Use a password)/.test(message);
    self.postMessage({
      ok: false,
      password: error instanceof Error && error.name === 'PasswordException',
      message:
        limited || error instanceof PdfEngineLoadError
          ? message
          : 'This PDF is damaged or uses an unsupported structure. Open and repair it in a trusted PDF editor first.',
    });
  } finally {
    qpdf.dispose();
  }
};
