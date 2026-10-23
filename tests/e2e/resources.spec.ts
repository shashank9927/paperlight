import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { boundaryPdf, hostilePdf } from '../resource-fixtures';
import { openTool, finish, pdfInput } from './helpers';
import { inspectPdf } from '../fixtures';

test('hostile expansion is rejected during admission; reset accepts a clean document', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/tools/rotate');
  await page
    .getByLabel('Choose files', { exact: true })
    .setInputFiles(pdfInput(hostilePdf('expansion')));
  await expect(page.getByRole('alert')).toContainText('decompression limit');
  await expect(page.locator('.process-button')).toBeDisabled();
  await page.getByLabel('Choose files', { exact: true }).setInputFiles(pdfInput(boundaryPdf(1)));
  const result = await finish(page);
  expect((await inspectPdf(result.bytes)).count).toBe(1);
  expect(errors).toEqual([]);
});

test('500-page job bounds preview canvases, processes all pages, and clears workers', async ({
  page,
}, info) => {
  const input = boundaryPdf(500);
  const start = performance.now();
  await openTool(page, 'rotate', pdfInput(input));
  const previewMs = performance.now() - start;
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(100);
  const pool = await page.locator('.page-preview canvas').evaluateAll((canvases) => ({
    count: canvases.filter((c) => (c as HTMLCanvasElement).width > 1).length,
    pixels: canvases.reduce(
      (n, c) => n + (c as HTMLCanvasElement).width * (c as HTMLCanvasElement).height,
      0,
    ),
  }));
  expect(pool.count).toBeLessThanOrEqual(24);
  expect(pool.pixels).toBeLessThanOrEqual(8_000_000 + 500);
  const processing = performance.now();
  const result = await finish(page);
  const processingMs = performance.now() - processing;
  const report = await inspectPdf(result.bytes);
  expect(report.count).toBe(500);
  expect(report.pages.every((p) => p.rotation === 90)).toBe(true);
  await writeFile(
    info.outputPath('500-pages.json'),
    JSON.stringify({
      browser: info.project.name,
      inputBytes: input.length,
      pages: 500,
      previewMs,
      processingMs,
      pool,
    }),
  );
});

test('100 MiB input boundary completes without document bytes entering requests', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const input = boundaryPdf(1, 100 * 1024 * 1024);
  const start = performance.now();
  const requests: string[] = [];
  page.context().on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method()) || request.postData())
      requests.push(request.method());
  });
  const inputPath = info.outputPath('boundary-input.pdf');
  await writeFile(inputPath, input);
  await page.goto('/tools/rotate');
  await page.getByLabel('Choose files', { exact: true }).setInputFiles(inputPath);
  await expect(page.locator('.process-button')).toBeEnabled({ timeout: 45000 });
  const admittedMs = performance.now() - start;
  const result = await finish(page);
  expect((await inspectPdf(result.bytes)).pages[0].rotation).toBe(90);
  expect(requests).toEqual([]);
  await writeFile(
    info.outputPath('100-mib.json'),
    JSON.stringify({
      browser: info.project.name,
      inputBytes: input.length,
      pages: 1,
      admittedMs,
      totalMs: performance.now() - start,
      outputBytes: result.bytes.length,
      fixture:
        'Synthetic valid auxiliary streams; not a real-world scan or phone-memory qualification.',
    }),
  );
});

test('hung processing is terminated by the deadline and preserves settings', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('processor.worker')) this.postMessage = () => {};
      }
    };
  });
  await openTool(page, 'rotate', pdfInput(boundaryPdf(1)));
  await page.clock.install();
  await page.locator('.process-button').click();
  await page.clock.fastForward(120001);
  await expect(page.getByRole('alert')).toContainText('two-minute safety limit');
  await expect(page.locator('.process-button')).toBeEnabled();
  // Browser debug protocols deliver the worker-close event asynchronously.
  await expect
    .poll(() => page.workers().filter((w) => w.url().includes('processor.worker')).length)
    .toBe(0);
});
