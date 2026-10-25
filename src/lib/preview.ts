import type { PDFDocumentProxy, PDFWorker } from 'pdfjs-dist';
import { getPdfJs, pdfOptions } from './pdf-assets';
import { validateKind } from './utils';
import { MAX_PAGES } from './types';
import { imageDimensions } from './limits';
import { admitPdf } from './admission';

export interface PageInfo {
  width: number;
  height: number;
  rotation: number;
}
export interface PreviewFile {
  id: string;
  file: File;
  password?: string;
  document?: PDFDocumentProxy;
  dispose?: () => Promise<void>;
  pages: PageInfo[];
}
// Preview documents share one parser worker, including a large merge batch.
// Individual loading tasks own only their document; the final disposal closes
// the shared worker as well, leaving no retained document-processing context.
let previewPool: { worker: PDFWorker; users: number } | undefined;
export async function inspectFile(
  file: File,
  image: boolean,
  password?: string,
  signal?: AbortSignal,
): Promise<Omit<PreviewFile, 'id'>> {
  signal?.throwIfAborted();
  await validateKind(file, image);
  if (image) {
    await imageDimensions(file);
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const page = { width: bitmap.width, height: bitmap.height, rotation: 0 };
    bitmap.close();
    signal?.throwIfAborted();
    if (page.width * page.height > 16_000_000)
      throw new Error(
        'This image is too large to decode safely. Resize it below 16 megapixels first.',
      );
    return { file, pages: [page] };
  }
  const encrypted = await admitPdf(file, password, signal);
  if (encrypted && password === undefined) password = '';
  const pdfjs = await getPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  signal?.throwIfAborted();
  const pool = previewPool || (previewPool = { worker: new pdfjs.PDFWorker(), users: 0 });
  pool.users++;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    if (--pool.users === 0) {
      pool.worker.destroy();
      if (previewPool === pool) previewPool = undefined;
    }
  };
  const task = pdfjs.getDocument({
    data,
    worker: pool.worker,
    password,
    ...pdfOptions(),
  });
  const abort = () => {
    void task.destroy().catch(() => {});
  };
  signal?.addEventListener('abort', abort, { once: true });
  let timer: number | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      pool.worker.destroy();
      if (previewPool === pool) previewPool = undefined;
      reject(
        new Error(
          'PDF preview exceeded the 30-second safety limit. Try a smaller document. Existing files and settings are still available.',
        ),
      );
    }, 30000);
  });
  try {
    return await Promise.race([
      (async () => {
        const document = await task.promise;
        signal?.throwIfAborted();
        const metadata = await document.getMetadata();
        const info = metadata.info as { EncryptFilterName?: string };
        // Includes permissions-only encryption that opens with an empty user password.
        if (info.EncryptFilterName && password === undefined) password = '';
        if (!document.numPages) {
          throw new Error('This PDF has no pages.');
        }
        if (document.numPages > MAX_PAGES) {
          throw new Error(
            'Choose no more than 500 pages per job. Split this document into smaller batches first.',
          );
        }
        const pages: PageInfo[] = [];
        for (let i = 1; i <= document.numPages; i++) {
          signal?.throwIfAborted();
          const page = await document.getPage(i);
          const viewport = page.getViewport({ scale: 1 });
          pages.push({ width: viewport.width, height: viewport.height, rotation: page.rotate });
        }
        const dispose = async () => {
          try {
            await task.destroy();
          } finally {
            release();
          }
        };
        return { file, password, document, pages, dispose };
      })(),
      deadline,
    ]);
  } catch (error) {
    void task.destroy().catch(() => {});
    release();
    throw error;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
