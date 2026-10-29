import { checkOutput } from './limits';

export class PdfEngineLoadError extends Error {
  constructor() {
    super(
      'The local PDF engine could not load. Check your connection and retry, or reload the app. Your original file is unchanged.',
    );
    this.name = 'PdfEngineLoadError';
  }
}

type Qpdf = {
  callMain(args: string[]): number;
  FS: {
    writeFile(path: string, bytes: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
    stat(path: string): { size: number };
    write(
      stream: { fd: number; path: string; position: number },
      buffer: Uint8Array,
      offset: number,
      length: number,
      position?: number,
    ): number;
  };
};

// One isolated WASM instance per job; all paths are internal constants, never
// filenames supplied by users. No diagnostics containing PDF content escape.
export function qpdfSession() {
  let module: Qpdf | undefined;
  const paths = new Set<string>();
  let passwordError = false;
  let diagnosticTail = '';
  return {
    async run(input: Uint8Array[], args: string[], mode: 'output' | 'encryption' = 'output') {
      if (!globalThis.crypto?.getRandomValues)
        throw new Error('Secure randomness is unavailable. Use a supported browser over HTTPS.');
      const log = console.log,
        error = console.error;
      passwordError = false;
      diagnosticTail = '';
      console.log = () => {};
      console.error = (...values: unknown[]) => {
        passwordError ||= values.some((value) => /password/i.test(String(value)));
      };
      try {
        if (!module) {
          try {
            const [{ default: init }, { default: wasm }] = await Promise.all([
              import('@neslinesli93/qpdf-wasm'),
              import('../generated/qpdf.wasm?url'),
            ]);
            module = await (init as unknown as (options: object) => Promise<Qpdf>)({
              locateFile: () => wasm,
              noInitialRun: true,
            });
          } catch {
            // No document has been handed to WASM yet. An asset/network/init
            // failure must never tell people their PDF is damaged.
            throw new PdfEngineLoadError();
          }
          const fs = module.FS;
          const write = fs.write;
          fs.write = function (stream, buffer, offset, length, position) {
            // Intercept the actual WASM descriptors, not browser console
            // wrappers: WebKit can retain native console bindings. Keep only
            // an eight-character classifier, never document diagnostics.
            if (stream.fd === 1 || stream.fd === 2) {
              if (stream.fd === 2)
                for (let i = offset; i < offset + length; i++) {
                  diagnosticTail = (diagnosticTail + String.fromCharCode(buffer[i]))
                    .slice(-8)
                    .toLowerCase();
                  passwordError ||= diagnosticTail === 'password';
                }
              return length;
            }
            if (stream.path === '/output.pdf') checkOutput((position ?? stream.position) + length);
            return write.call(this, stream, buffer, offset, length, position);
          };
        }
        input.forEach((bytes, index) => {
          const path = index ? `/input-${index}.pdf` : '/input.pdf';
          paths.add(path);
          module!.FS.writeFile(path, bytes);
        });
        paths.add('/output.pdf');
        let code: number;
        try {
          code = module.callMain(['--suppress-recovery', ...args]);
        } catch (failure) {
          if (failure && typeof failure === 'object' && 'status' in failure)
            code = Number(failure.status);
          else
            throw new Error(
              'The PDF engine could not complete this operation. Try a smaller or repaired document.',
            );
        }
        // This bundled binary reports code 2 plus "invalid password" for some
        // encrypted inputs, despite --is-encrypted's documented special code.
        // Treat that diagnostic as encrypted, never as an unprotected document.
        if (mode === 'encryption' && (code === 0 || code === 2))
          return new Uint8Array([code === 0 || passwordError ? 1 : 0]);
        if (code !== 0) {
          const failure = new Error(
            passwordError
              ? 'That password could not open this PDF. Please check it and try again.'
              : 'The PDF engine reported damage or an unsupported feature. No output was returned; repair the original in a trusted editor first.',
          );
          if (passwordError) failure.name = 'PasswordException';
          throw failure;
        }
        checkOutput(module.FS.stat('/output.pdf').size);
        return module.FS.readFile('/output.pdf');
      } finally {
        for (const path of paths) {
          try {
            module?.FS.unlink(path);
          } catch {
            /* File may not have been created. */
          }
        }
        paths.clear();
        console.log = log;
        console.error = error;
      }
    },
    dispose() {
      module = undefined;
    },
  };
}
