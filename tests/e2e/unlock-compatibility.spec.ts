import { test, expect } from '@playwright/test';
import { featurePdf } from '../feature-fixtures';
import { independentlyEncrypted } from '../encryption-fixtures';
import { finish, pdfInput } from './helpers';
import { inspectPdf } from '../fixtures';
import { independentPdf } from '../independent';

for (const algorithm of ['RC4-40', 'RC4-128', 'AES-128', 'AES-256-R5', 'AES-256'] as const) {
  for (const credential of ['reader', 'owner', 'empty'] as const) {
    test(`unlock independently encrypted ${algorithm} with ${credential} credentials`, async ({
      page,
    }) => {
      const input = await featurePdf('form');
      const encrypted = independentlyEncrypted(
        input,
        algorithm,
        credential === 'empty' ? '' : 'reader-password',
      );
      await page.goto('/tools/unlock');
      await page.getByLabel('Choose files', { exact: true }).setInputFiles(pdfInput(encrypted));
      if (credential !== 'empty') {
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.getByLabel('Current PDF password').fill(`${credential}-password`);
        await page.getByRole('button', { name: /Open PDF locally/ }).click();
      }
      await expect(page.locator('.process-button')).toBeEnabled();
      const output = await finish(page);
      const before = await inspectPdf(input);
      const after = await inspectPdf(output.bytes);
      expect(after.count).toBe(before.count);
      expect(after.pages.map((p) => p.text)).toEqual(before.pages.map((p) => p.text));
      const report = await independentPdf(
        output.bytes,
        test.info().outputPath('unlocked-form.pdf'),
      );
      const original = await independentPdf(input, test.info().outputPath('original-form.pdf'));
      expect(report.encrypted).toBe(false);
      expect(report.fields).toEqual(original.fields);
      expect(report.pages.map((p) => p.annotations)).toEqual(
        original.pages.map((p) => p.annotations),
      );
      await expect(page.getByRole('alert')).toHaveCount(0);
    });
  }
}

test('unavailable PDF engine is not reported as document damage, and retry succeeds', async ({
  browser,
}) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    await context.route('**/qpdf-*.wasm', (route) => route.abort());
    await page.goto('/tools/unlock');
    const file = pdfInput(await featurePdf('plain'));
    await page.getByLabel('Choose files', { exact: true }).setInputFiles(file);
    await expect(page.getByRole('alert')).toContainText('local PDF engine could not load');
    await expect(page.getByRole('alert')).not.toContainText('damaged');
    await context.unroute('**/qpdf-*.wasm');
    await page.getByLabel('Choose files', { exact: true }).setInputFiles(file);
    await expect(page.locator('.process-button')).toBeEnabled();
    await finish(page);
  } finally {
    await context.close();
  }
});
