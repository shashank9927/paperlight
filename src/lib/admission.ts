export function admitPdf(file: File, password?: string, signal?: AbortSignal): Promise<boolean> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./admission.worker.ts', import.meta.url), {
      type: 'module',
    });
    let settled = false;
    const done = (error?: Error, encrypted = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(encrypted);
    };
    const abort = () => done(new DOMException('File inspection cancelled.', 'AbortError'));
    const timer = window.setTimeout(
      () => done(new Error('This PDF took too long to inspect safely. Try a smaller document.')),
      30_000,
    );
    signal?.addEventListener('abort', abort, { once: true });
    worker.onerror = (event) => {
      event.preventDefault();
      done(
        new Error(
          'This PDF could not be inspected within the device resource limits. Try a smaller document.',
        ),
      );
    };
    worker.onmessageerror = () =>
      done(new Error('The PDF inspection worker returned an unreadable response. Try again.'));
    worker.onmessage = ({ data }) => {
      if (data.ok) done(undefined, data.encrypted);
      else {
        const error = new Error(data.message);
        if (data.password) error.name = 'PasswordException';
        done(error);
      }
    };
    worker.postMessage({ file, password });
  });
}
