import { it, expect, vi } from 'vitest';
import { qpdfSession } from '../src/lib/qpdf';
import { encryptedFixture, featurePdf } from './feature-fixtures';
vi.mock('../src/generated/qpdf.wasm?url', async () => ({
  default: (await import('node:path')).resolve('src/generated/qpdf.wasm'),
}));
it('identifies encrypted input when the bundled QPDF probe returns an invalid-password exit', async () => {
  const encrypted = await encryptedFixture(await featurePdf('plain'), 'test-password-✓');
  const q = qpdfSession();
  const status = await q.run([encrypted], ['/input.pdf', '--is-encrypted'], 'encryption');
  expect(status[0]).toBe(1);
  await expect(
    q.run(
      [encrypted],
      ['--password=', '--password-mode=unicode', '--decrypt', '/input.pdf', '/output.pdf'],
    ),
  ).rejects.toMatchObject({ name: 'PasswordException' });
  const decrypted = await q.run(
    [encrypted],
    [
      '--password=test-password-✓',
      '--password-mode=unicode',
      '--decrypt',
      '/input.pdf',
      '/output.pdf',
    ],
  );
  expect((await q.run([decrypted], ['/input.pdf', '--is-encrypted'], 'encryption'))[0]).toBe(0);
  q.dispose();
});
