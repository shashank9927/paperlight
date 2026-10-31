import { test, expect } from '@playwright/test';
import { openTool, finish, pdfInput } from './helpers';
import { makeFixtures, inspectPdf } from '../fixtures';

for (const tool of [
  'merge',
  'split',
  'compress',
  'organize',
  'rotate',
  'images-to-pdf',
  'pdf-to-images',
  'watermark',
  'page-numbers',
  'protect',
  'unlock',
  'sign',
]) {
  test(`${tool}: invalid admission cancellation stale worker failure and clean retry`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const Original = Worker;
      let jobs = 0;
      window.Worker = class extends Original {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          if (String(url).includes('processor.worker') && ++jobs === 1) {
            this.postMessage = () => {};
            Object.assign(window, {
              releaseAuditStale: () =>
                this.onmessageerror?.call(this, new MessageEvent('messageerror')),
            });
          }
        }
      };
    });
    const f = await makeFixtures();
    await page.goto(`/tools/${tool}`);
    await page.getByLabel('Choose files', { exact: true }).setInputFiles({
      name: 'invalid.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('invalid'),
    });
    await expect(page.getByRole('alert')).toBeVisible();
    const input =
      tool === 'images-to-pdf'
        ? { name: 'image.png', mimeType: 'image/png', buffer: f.transparent }
        : tool === 'merge'
          ? [pdfInput(f.tiny, 'one.pdf'), pdfInput(f.tiny, 'two.pdf')]
          : pdfInput(f.tiny);
    await page.getByLabel('Choose files', { exact: true }).setInputFiles(input);
    await expect(page.locator('.process-button')).toBeEnabled();
    if (tool === 'watermark') await page.getByLabel('Watermark text').fill('AUDIT');
    if (tool === 'protect') {
      await page.getByLabel('New password', { exact: true }).fill('retry-password');
      await page.getByLabel('Confirm password', { exact: true }).fill('retry-password');
    }
    if (tool === 'sign') {
      await page.getByRole('button', { name: 'Type', exact: true }).click();
      await page.getByLabel('Signature name').fill('Test');
      await expect(page.getByAltText('Your signature placement')).toBeVisible();
    }
    await page.locator('.process-button').click();
    await page.getByRole('button', { name: 'Cancel processing', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('cancelled');
    await expect(page.locator('.result-panel')).toHaveCount(0);
    await expect
      .poll(() => page.workers().filter((w) => w.url().includes('processor.worker')).length)
      .toBe(0);
    const out = await finish(page);
    expect(out.bytes.length).toBeGreaterThan(0);
    await page.evaluate(() =>
      (window as unknown as { releaseAuditStale: () => void }).releaseAuditStale(),
    );
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('.result-panel')).toBeVisible();
    await page.getByRole('button', { name: /Start fresh/ }).click();
    await expect.poll(() => page.workers().length).toBe(0);
  });
}

test('organize import is undoable and clears obsolete redo without losing imported pages', async ({
  page,
}) => {
  const f = await makeFixtures();
  await openTool(page, 'organize', pdfInput(f.pdf));
  await page.getByRole('button', { name: 'Add blank page', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page
    .getByLabel('Choose files', { exact: true })
    .setInputFiles(pdfInput(f.tiny, 'import.pdf'));
  await expect(page.locator('.process-button')).toBeEnabled();
  await expect(page.locator('.page-grid .page-card')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.page-grid .page-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  const out = await inspectPdf((await finish(page)).bytes);
  expect(out.count).toBe(4);
  expect(out.pages[3].text).toContain('GAMMA');
});

test('embedded extraction exposes native size instead of an ineffective DPI setting', async ({
  page,
}) => {
  const f = await makeFixtures();
  await openTool(page, 'pdf-to-images', pdfInput(f.pdf));
  await expect(page.getByLabel('Resolution', { exact: true })).toBeVisible();
  await page.getByLabel('Conversion mode').selectOption('extract');
  await expect(page.getByLabel('Resolution', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/native image dimensions/i)).toBeVisible();
  const out = await finish(page);
  expect(out.name).toMatch(/image-001\.png$/);
  const size = await page.evaluate(async (bytes) => {
    const image = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
    const dimensions = [image.width, image.height];
    image.close();
    return dimensions;
  }, Array.from(out.bytes));
  expect(size).toEqual([480, 640]);
});

test('twenty consecutive jobs release processing workers and reset all document state', async ({
  page,
}) => {
  test.setTimeout(180000);
  const f = await makeFixtures();
  const unsafeRequests: string[] = [];
  page.context().on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method()) || request.postData())
      unsafeRequests.push(request.url());
  });
  await openTool(page, 'rotate', pdfInput(f.tiny));
  for (let i = 0; i < 20; i++) {
    const out = await finish(page);
    expect((await inspectPdf(out.bytes)).count).toBe(1);
    await expect
      .poll(() => page.workers().filter((w) => w.url().includes('processor.worker')).length)
      .toBe(0);
    if (i < 19) await page.getByRole('button', { name: /Adjust settings/ }).click();
  }
  await page.getByRole('button', { name: /Start fresh/ }).click();
  await expect.poll(() => page.workers().length).toBe(0);
  await expect(page.locator('.result-panel')).toHaveCount(0);
  const storage = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
  }));
  expect(storage.local.filter((key) => key !== 'paperlight-theme')).toEqual([]);
  expect(storage.session).toEqual([]);
  expect(unsafeRequests).toEqual([]);
});

test('batch cancellation after the first completed file discards all outputs and permits retry', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Original = Worker;
    let jobs = 0;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('processor.worker') && ++jobs === 1) {
          this.addEventListener('message', (event) => {
            if (event.data?.type !== 'progress' || event.data.completed !== 1) return;
            const cancel = [...document.querySelectorAll('button')].find(
              (button) => button.textContent?.trim() === 'Cancel processing',
            );
            Object.assign(window, { releaseAuditCompletedBeforeCancel: event.data.completed });
            cancel?.click();
          });
        }
      }
    };
  });
  const f = await makeFixtures();
  await openTool(page, 'rotate', [pdfInput(f.tiny, 'first.pdf'), pdfInput(f.pdf, 'second.pdf')]);
  await page.locator('.process-button').click();
  await expect(page.getByRole('alert')).toContainText('cancelled');
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { releaseAuditCompletedBeforeCancel: number })
          .releaseAuditCompletedBeforeCancel,
    ),
  ).toBe(1);
  await expect(page.locator('.result-panel')).toHaveCount(0);
  await expect
    .poll(() => page.workers().filter((worker) => worker.url().includes('processor.worker')).length)
    .toBe(0);
  const retry = await finish(page);
  expect(retry.name).toMatch(/\.zip$/);
  const { unzipSync } = await import('fflate');
  const entries = Object.values(unzipSync(retry.bytes));
  expect(entries).toHaveLength(2);
  expect((await inspectPdf(entries[0])).count).toBe(1);
  expect((await inspectPdf(entries[1])).count).toBe(3);
});
