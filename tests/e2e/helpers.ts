import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { independentPdf } from '../independent';
import { unzipSync } from 'fflate';
import { inspectPdf } from '../fixtures';
let outputCounter = 0;
const rasterContexts = new WeakMap<object, boolean>();
export async function requireRaster(page: Page) {
  const known = rasterContexts.get(page.context());
  if (known !== undefined) {
    if (process.env.PAPERLIGHT_STRICT_BROWSERS)
      expect(known, 'Release browsers must support background rendering').toBe(true);
    test.skip(!known, 'Unavailable: this browser build lacks worker OffscreenCanvas rendering.');
    return;
  }
  // Probe outside the production page: production CSP intentionally disallows
  // blob workers. This is test instrumentation only, never shipped code.
  const probe = await page.context().newPage();
  const available = await probe.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const url = URL.createObjectURL(
          new Blob(
            [
              "postMessage(typeof OffscreenCanvas !== 'undefined' && typeof OffscreenCanvas.prototype.convertToBlob === 'function' && typeof createImageBitmap === 'function')",
            ],
            { type: 'text/javascript' },
          ),
        );
        const worker = new Worker(url);
        worker.onmessage = (event) => {
          worker.terminate();
          URL.revokeObjectURL(url);
          resolve(event.data);
        };
        worker.onerror = () => {
          worker.terminate();
          URL.revokeObjectURL(url);
          resolve(false);
        };
      }),
  );
  await probe.close();
  rasterContexts.set(page.context(), available);
  if (process.env.PAPERLIGHT_STRICT_BROWSERS)
    expect(available, 'Release browsers must support background rendering').toBe(true);
  test.skip(
    !available,
    'Unavailable: this browser build lacks worker OffscreenCanvas rendering. This is a release coverage gap, not a passed processing test.',
  );
}
export type Input = { name: string; mimeType: string; buffer: Buffer };
export const pdfInput = (buffer: Buffer, name = 'résumé-資料.pdf'): Input => ({
  name,
  mimeType: 'application/pdf',
  buffer,
});
export async function openTool(page: Page, tool: string, input: Input | Input[]) {
  if (['images-to-pdf', 'pdf-to-images'].includes(tool)) await requireRaster(page);
  await page.goto(`/tools/${tool}`);
  await page.getByLabel('Choose files', { exact: true }).setInputFiles(input);
  const mobileSettings = page.getByRole('button', { name: 'Settings & export', exact: true });
  if (await mobileSettings.isVisible()) await mobileSettings.click();
  await expect(page.locator('.process-button')).toBeEnabled();
}
export async function finish(page: Page, action?: string) {
  const accessControl = page.getByLabel('Require an opening password', { exact: true });
  const permissionOnly = (await accessControl.count()) > 0 && !(await accessControl.isChecked());
  const passwordField = page.getByLabel('New password', { exact: true });
  const password = (await passwordField.count()) ? await passwordField.inputValue() : undefined;
  if (action) await page.getByRole('button', { name: action, exact: true }).click();
  else await page.locator('.process-button').click();
  await expect(page.getByRole('heading', { name: 'Your files are ready.' })).toBeVisible({
    timeout: 45000,
  });
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Download/ }).click();
  const download = await downloaded;
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = new Uint8Array(await readFile(path!));
  const name = download.suggestedFilename();
  const entries = name.endsWith('.zip') ? unzipSync(bytes) : { [name]: bytes };
  for (const [entry, data] of Object.entries(entries)) {
    if (!entry.endsWith('.pdf')) continue;
    const independent = await independentPdf(
      data,
      test.info().outputPath(`document-${++outputCounter}.pdf`),
      password,
      1,
      permissionOnly,
    );
    const pdfjs = await inspectPdf(data, password);
    expect(independent.count).toBe(pdfjs.count);
    expect(independent.pages.map((page) => page.rotation)).toEqual(
      pdfjs.pages.map((page) => page.rotation),
    );
    // Compare independent extractors; whitespace conventions differ.
    expect(independent.pages.map((page) => page.text.replace(/\s/g, ''))).toEqual(
      pdfjs.pages.map((page) => page.text.replace(/\s/g, '')),
    );
  }
  return { bytes, name };
}
