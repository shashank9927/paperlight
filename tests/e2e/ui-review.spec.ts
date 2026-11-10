import { test, expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { makeFixtures } from '../fixtures';
import { auditInput, configureAuditJob, downloadAuditJob, toolIds } from './ui-cases';
import type { Input } from './helpers';
import { mkdir, writeFile } from 'node:fs/promises';

test.use({ trace: 'off' });

async function prepareVisualTheme(page: Page) {
  // Exercise the legacy system preference so the real theme control stays
  // synchronized even when a modal makes the header inert.
  await page.addInitScript(() => localStorage.setItem('paperlight-theme', 'system'));
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
}

async function checkReflow(page: Page, label: string) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect
    .poll(() => page.locator('html').evaluate((html) => html.scrollWidth - html.clientWidth), {
      message: label,
    })
    .toBeLessThanOrEqual(0);
}

async function capture(page: Page, info: TestInfo, state: string) {
  const html = page.locator('html');
  const previousTheme = await html.getAttribute('data-theme');
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await expect(html).toHaveAttribute('data-theme', theme);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document
                .getAnimations()
                .filter(
                  (animation) =>
                    animation.playState === 'running' &&
                    Number.isFinite(animation.effect?.getComputedTiming().endTime),
                ).length,
          ),
        )
        .toBe(0);
      await page.evaluate(() => window.scrollTo(0, 0));
      await checkReflow(page, `${state} ${width}px ${theme}`);
      const report = await new AxeBuilder({ page }).analyze();
      expect(
        report.violations.map(({ id, nodes }) => ({
          id,
          nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
        })),
        `${state} ${width}px ${theme}`,
      ).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`${state}-${width}-${theme}.jpg`),
        type: 'jpeg',
        quality: 90,
        fullPage: true,
        animations: 'disabled',
      });
    }
  }
  await page.emulateMedia({ colorScheme: previousTheme === 'light' ? 'light' : 'dark' });
}

test('UI-ZOOM: native browser zoom at 200% supports all public pages and twelve exports', async ({
  playwright,
}, info) => {
  test.setTimeout(180_000);
  const extension = info.outputPath('zoom-extension');
  await mkdir(extension, { recursive: true });
  await writeFile(
    extension + '/manifest.json',
    JSON.stringify({
      manifest_version: 3,
      name: 'Local browser zoom verification',
      version: '1.0',
      permissions: ['tabs'],
      background: { service_worker: 'worker.js' },
    }),
  );
  await writeFile(extension + '/worker.js', 'chrome.runtime.onInstalled.addListener(() => {});');
  const context = await playwright.chromium.launchPersistentContext('', {
    channel: 'chromium',
    viewport: null,
    deviceScaleFactor: undefined,
    isMobile: undefined,
    hasTouch: undefined,
    baseURL: info.project.use.baseURL,
    args: [
      '--window-size=1440,1000',
      '--disable-extensions-except=' + extension,
      '--load-extension=' + extension,
    ],
  });
  try {
    const page = context.pages()[0];
    const fixtures = await makeFixtures();
    for (const path of ['/', '/alternatives/ilovepdf', ...toolIds.map((id) => `/tools/${id}`)]) {
      await page.goto(path);
      const isExtension = (worker: { url(): string }) =>
        worker.url().startsWith('chrome-extension:');
      const worker =
        context.serviceWorkers().find(isExtension) ||
        (await context.waitForEvent('serviceworker', { predicate: isExtension }));
      const zoom = await worker.evaluate(`(async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.setZoom(tab.id, 2);
        return chrome.tabs.getZoom(tab.id);
      })()`);
      expect(zoom).toBe(2);
      await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(2);
      await checkReflow(page, path + ' at native 200% zoom');
      const tool = toolIds.find((id) => path === `/tools/${id}`);
      if (tool) {
        await page
          .getByLabel('Choose files', { exact: true })
          .setInputFiles(auditInput(tool, fixtures));
        await configureAuditJob(page, tool);
        await downloadAuditJob(page, tool, fixtures);
        await checkReflow(page, tool + ' result at native 200% zoom');
      }
      await page.screenshot({
        path: info.outputPath(`native-zoom-${tool || (path === '/' ? 'home' : 'comparison')}.jpg`),
        type: 'jpeg',
        quality: 90,
        fullPage: true,
      });
    }
  } finally {
    await context.close();
  }
});

async function drop(page: Page, input: Input | Input[]) {
  const files = (Array.isArray(input) ? input : [input]).map(({ name, mimeType, buffer }) => ({
    name,
    mimeType,
    base64: buffer.toString('base64'),
  }));
  const transfer = await page.evaluateHandle((items) => {
    const data = new DataTransfer();
    for (const item of items) {
      const bytes = Uint8Array.from(atob(item.base64), (c) => c.charCodeAt(0));
      data.items.add(new File([bytes], item.name, { type: item.mimeType }));
    }
    return data;
  }, files);
  try {
    const zone = page.locator('.dropzone');
    await zone.dispatchEvent('dragover', { dataTransfer: transfer });
    await expect(zone).toHaveClass(/drag-over/);
    await zone.dispatchEvent('dragleave', { dataTransfer: transfer });
    await expect(zone).not.toHaveClass(/drag-over/);
    await zone.dispatchEvent('dragover', { dataTransfer: transfer });
    await zone.dispatchEvent('drop', { dataTransfer: transfer });
  } finally {
    await transfer.dispose();
  }
}

async function checkNarrow(page: Page, state: string) {
  await page.setViewportSize({ width: 320, height: 640 });
  await checkReflow(page, `${state} at 320px`);
}

for (const path of ['/', '/alternatives/ilovepdf']) {
  test(`UI-PUBLIC ${path}: themes, accessibility, reflow and content`, async ({ page }, info) => {
    await prepareVisualTheme(page);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await checkNarrow(page, path);
    await capture(page, info, 'page');
  });
}

for (const tool of toolIds) {
  test(`UI-REVIEW-${tool}: admission, settings, processing, recovery and download states`, async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    await page.addInitScript(() => {
      const Original = Worker;
      let held = false;
      window.Worker = class extends Original {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          if (String(url).includes('processor.worker') && !held) {
            held = true;
            this.postMessage = () => {};
          }
        }
      };
    });
    await prepareVisualTheme(page);
    await page.goto(`/tools/${tool}`);
    await expect(page.getByLabel('Choose files', { exact: true })).toBeAttached();
    await checkNarrow(page, 'empty');
    const upload = await page.locator('.dropzone .primary').boundingBox();
    const settings = await page.locator('.mobile-settings-toggle').boundingBox();
    expect(upload && settings && settings.y >= upload.y + upload.height).toBe(true);
    await page.screenshot({ path: info.outputPath('empty-320.jpg'), type: 'jpeg', quality: 90 });
    const currentStep = page
      .getByRole('group', { name: 'Processing steps' })
      .locator('[aria-current="step"]');
    await expect(currentStep).toHaveText('1Select files');
    await capture(page, info, 'empty');
    await drop(page, {
      name: 'broken.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('invalid'),
    });
    await expect(page.getByRole('alert')).toBeVisible();
    await capture(page, info, 'validation-error');
    await page.getByRole('button', { name: 'Dismiss message' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    const fixtures = await makeFixtures();
    await drop(page, auditInput(tool, fixtures));
    if (tool === 'unlock') {
      await expect(page.getByRole('dialog', { name: 'Password required' })).toBeVisible();
      await capture(page, info, 'password-required');
    }
    await page.setViewportSize({ width: 390, height: 900 });
    await configureAuditJob(page, tool);
    await page.locator('.page-preview').first().scrollIntoViewIfNeeded();
    await expect(
      page.locator('canvas[data-ready="true"], .page-preview img').first(),
    ).toBeVisible();
    await expect(currentStep).toHaveText('2Configure');
    await checkNarrow(page, 'configured');
    await capture(page, info, 'configured');
    await page.locator('.process-button').click();
    const cancel = page.getByRole('button', { name: 'Cancel processing', exact: true });
    await expect(cancel).toBeVisible();
    await expect(page.locator('.process-button')).toBeDisabled();
    await capture(page, info, 'processing');
    await cancel.click();
    await expect(page.getByRole('alert')).toContainText('cancelled');
    await expect(page.locator('.result-panel')).toHaveCount(0);
    await capture(page, info, 'cancelled');
    await downloadAuditJob(page, tool, fixtures);
    await expect(currentStep).toHaveText('3Download');
    await checkNarrow(page, 'result');
    await capture(page, info, 'result');
    await page.getByRole('button', { name: /Start fresh/ }).click();
    await expect(page.locator('.dropzone')).toBeVisible();
    await expect.poll(() => page.workers().length).toBe(0);
  });
}
