import { spawnSync } from 'node:child_process';

/** Independent producer: do not test QPDF only with QPDF's own encrypted output. */
export function independentlyEncrypted(
  input: Uint8Array,
  algorithm: 'RC4-40' | 'RC4-128' | 'AES-128' | 'AES-256-R5' | 'AES-256',
  user = 'reader-password',
  owner = 'owner-password',
) {
  const script = `
import sys, json, base64, io
from pypdf import PdfReader, PdfWriter
request = json.load(sys.stdin)
writer = PdfWriter(clone_from=PdfReader(io.BytesIO(base64.b64decode(request['pdf']))))
writer.encrypt(request['user'], request['owner'], algorithm=request['algorithm'])
output = io.BytesIO()
writer.write(output)
sys.stdout.write(base64.b64encode(output.getvalue()).decode('ascii'))
`;
  const result = spawnSync(process.env.PAPERLIGHT_PYTHON || 'python', ['-c', script], {
    input: JSON.stringify({ pdf: Buffer.from(input).toString('base64'), algorithm, user, owner }),
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Independent encryption failed: ${result.stderr}`);
  return Buffer.from(result.stdout, 'base64');
}
