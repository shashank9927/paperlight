import { test, expect } from '@playwright/test';
import { makeFixtures, inspectPdf } from '../fixtures';
import { openTool, finish, pdfInput } from './helpers';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { unzipSync } from 'fflate';
import AxeBuilder from '@axe-core/playwright';

test('missing workspace chunk offers a working home escape and reload recovery', async ({
  browser,
}) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    await context.route('**/Workspace-*.js', (route) => route.abort());
    const page = await context.newPage();
    await page.goto('/tools/rotate');
    await expect(page.getByRole('alert')).toContainText('required app component');
    await page.getByRole('link', { name: 'Back to tools', exact: true }).click();
    await expect(page.locator('.tool-card')).toHaveCount(12);
    await context.unroute('**/Workspace-*.js');
    await page.reload();
    const f = await makeFixtures();
    await openTool(page, 'rotate', pdfInput(f.tiny));
    expect((await inspectPdf((await finish(page)).bytes)).count).toBe(1);
  } finally {
    await context.close();
  }
});

test('unavailable processing worker retains inputs and permits retry', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    const f = await makeFixtures();
    await openTool(page, 'rotate', pdfInput(f.tiny));
    await page.getByLabel('Pages', { exact: true }).fill('1');
    await context.route('**/processor.worker-*.js', (route) => route.abort());
    await page.locator('.process-button').click();
    await expect(page.getByRole('alert')).toContainText('processing worker');
    await expect(page.getByLabel('Pages', { exact: true })).toHaveValue('1');
    await context.unroute('**/processor.worker-*.js');
    expect((await inspectPdf((await finish(page)).bytes)).count).toBe(1);
  } finally {
    await context.close();
  }
});

test('service worker cache failures do not prevent online processing', async ({
  browser,
}, info) => {
  // Browser routing cannot reliably intercept service-worker script updates.
  // Serve the frozen build through a local fault-injection proxy instead.
  let injected = false;
  const server = createServer(async (request, response) => {
    try {
      const upstream = await fetch(new URL(request.url!, info.project.use.baseURL));
      let body = Buffer.from(await upstream.arrayBuffer());
      if (request.url === '/sw.js') {
        injected = true;
        body = Buffer.from(
          'CacheStorage.prototype.open = async () => { throw new DOMException("Cache unavailable", "QuotaExceededError"); };\n' +
            body.toString(),
        );
      }
      response.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') || 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(502);
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const context = await browser.newContext({
    baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  });
  try {
    const page = await context.newPage();
    const f = await makeFixtures();
    await openTool(page, 'rotate', pdfInput(f.tiny));
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    expect(injected).toBe(true);
    expect((await inspectPdf((await finish(page)).bytes)).count).toBe(1);
    await page.reload();
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    expect(await page.evaluate(() => caches.keys())).toEqual([]);
    await page.getByLabel('Choose files', { exact: true }).setInputFiles(pdfInput(f.tiny));
    expect((await inspectPdf((await finish(page)).bytes)).count).toBe(1);
  } finally {
    await context.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('a waiting deployment update cannot activate while documents remain in the workspace', async ({
  browser,
}) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    await context.addInitScript(() => {
      const registration = new EventTarget();
      Object.assign(registration, {
        waiting: {
          postMessage: (message: unknown) => Object.assign(window, { releaseAuditUpdate: message }),
        },
        active: null,
      });
      Object.defineProperty(navigator.serviceWorker, 'ready', {
        get: () => Promise.resolve(registration),
      });
    });
    const page = await context.newPage();
    const f = await makeFixtures();
    await openTool(page, 'rotate', pdfInput(f.tiny));
    const update = page.getByRole('button', { name: 'Update Havisu PDF', exact: true });
    await expect(update).toBeDisabled();
    await finish(page);
    await expect(update).toBeDisabled();
    await page.getByRole('button', { name: /Start fresh/ }).click();
    await expect(update).toBeEnabled();
    await update.click();
    expect(
      await page.evaluate(
        () => (window as unknown as { releaseAuditUpdate: unknown }).releaseAuditUpdate,
      ),
    ).toEqual({ type: 'activate-update' });
  } finally {
    await context.close();
  }
});

for (const theme of ['dark', 'light']) {
  for (const width of [390, 768, 1440]) {
    test(`partial batches: ${theme} at ${width}px retain failures and safe downloads`, async ({
      page,
    }, info) => {
      test.setTimeout(120000);
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript((value) => localStorage.setItem('paperlight-theme', value), theme);
      const f = await makeFixtures();
      await openTool(page, 'rotate', [pdfInput(f.pdf, 'same.pdf'), pdfInput(f.tiny, 'short.pdf')]);
      await page.getByLabel('Pages', { exact: true }).fill('2');
      const single = await finish(page);
      expect(single.name).toMatch(/\.pdf$/);
      expect((await inspectPdf(single.bytes)).count).toBe(3);
      await expect(page.locator('.result-panel')).toContainText(
        'Partial result: 1 succeeded, 1 failed',
      );
      await expect(page.locator('.batch-status')).toContainText('short.pdf');
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({ path: info.outputPath('partial.png'), fullPage: true });
      await page.getByRole('button', { name: /Start fresh/ }).click();
      await openTool(page, 'rotate', [
        pdfInput(f.pdf, 'same.pdf'),
        pdfInput(f.pdf, 'same.pdf'),
        pdfInput(f.tiny, 'short.pdf'),
      ]);
      await page.getByLabel('Pages', { exact: true }).fill('2');
      const multiple = await finish(page);
      expect(multiple.name).toMatch(/\.zip$/);
      const entries = Object.entries(unzipSync(multiple.bytes));
      expect(entries).toHaveLength(2);
      expect(new Set(entries.map(([name]) => name)).size).toBe(2);
      expect(entries.every(([name]) => !name.includes('short'))).toBe(true);
      await expect(page.locator('.result-panel')).toContainText('2 succeeded, 1 failed');
      await page.getByRole('button', { name: /Adjust settings/ }).click();
      await page.getByLabel('Pages', { exact: true }).fill('1');
      const retry = await finish(page);
      expect(Object.keys(unzipSync(retry.bytes))).toHaveLength(3);
      await expect(page.locator('.batch-status')).not.toContainText('failed');
    });
  }
}
