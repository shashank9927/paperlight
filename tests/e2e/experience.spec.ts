import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { makeFixtures, inspectPdf } from '../fixtures';
import { openTool, finish, pdfInput } from './helpers';
import { mkdir, open } from 'node:fs/promises';
let fixtures: Awaited<ReturnType<typeof makeFixtures>>;
test.beforeAll(async () => {
  fixtures = await makeFixtures();
});
test('homepage: search, categories, keyboard navigation, FAQ and accessibility', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.tool-card')).toHaveCount(12);
  await expect(page.getByRole('textbox', { name: 'Search tools' })).toBeEnabled();
  await page.keyboard.press('/');
  await expect(page.getByRole('textbox', { name: 'Search tools' })).toBeFocused();
  await page.keyboard.type('watermark');
  await expect(page.locator('.tool-card')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Search tools' }).fill('');
  await page.getByRole('button', { name: 'Security', exact: true }).click();
  await expect(page.locator('.tool-card')).toHaveCount(2);
  await page.getByRole('button', { name: /All tools/ }).click();
  await page.getByText('Are my files really private?', { exact: true }).click();
  const privacyAnswer = page.locator('details[open]');
  await expect(privacyAnswer).toContainText('processed in your browser');
  await expect(privacyAnswer).toContainText('not uploaded or stored');
  await expect(privacyAnswer).toContainText('Vercel Web Analytics');
  const report = await new AxeBuilder({ page }).analyze();
  expect(report.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual(
    [],
  );
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await mkdir('.cache/screenshots', { recursive: true });
  await page.screenshot({ path: '.cache/screenshots/home-desktop.png', fullPage: true });
});
test('workspace: accessible controls and a real output with no horizontal overflow', async ({
  page,
}) => {
  await openTool(page, 'watermark', pdfInput(fixtures.pdf));
  const report = await new AxeBuilder({ page }).exclude('.page-preview').analyze();
  expect(report.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual(
    [],
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await finish(page);
});
test('validation: damaged files, invalid page ranges, size and page limits preserve the workspace', async ({
  page,
}) => {
  await page.goto('/tools/split');
  await page
    .getByLabel('Choose files', { exact: true })
    .setInputFiles(pdfInput(Buffer.from('not a pdf'), 'bad.pdf'));
  await expect(page.getByRole('alert')).toContainText('not a valid PDF');
  await page
    .getByLabel('Choose files', { exact: true })
    .setInputFiles(pdfInput(Buffer.from('%PDF-1.7\ncorrupt\n%%EOF'), 'broken.pdf'));
  await expect(page.getByRole('alert')).toContainText(/Invalid PDF|invalid|could not|damaged/i);
  await page.getByLabel('Choose files', { exact: true }).setInputFiles(pdfInput(fixtures.pdf));
  await expect(page.locator('.process-button')).toBeEnabled();
  await page.getByLabel('Pages', { exact: true }).fill('900');
  await page.locator('.process-button').click();
  await expect(page.getByRole('alert')).toContainText('between 1 and 3');
  await expect(page.getByLabel('Pages', { exact: true })).toHaveValue('900');
  await page.getByLabel('Pages', { exact: true }).fill('1');
  expect((await inspectPdf((await finish(page)).bytes)).count).toBe(1);
  await page.getByRole('button', { name: /Start fresh/ }).click();
  await page
    .getByLabel('Choose files', { exact: true })
    .setInputFiles(pdfInput(fixtures.tooMany, 'too-many.pdf'));
  await expect(page.getByRole('alert')).toContainText('500 pages');
  await mkdir('.cache', { recursive: true });
  const oversized = await open('.cache/oversized.pdf', 'w');
  await oversized.truncate(100 * 1024 * 1024 + 1);
  await oversized.close();
  await page.getByLabel('Choose files', { exact: true }).setInputFiles('.cache/oversized.pdf');
  await expect(page.getByRole('alert')).toContainText('100 MB');
});
test('cancellation and reset release the active job and allow a clean retry', async ({ page }) => {
  await openTool(page, 'pdf-to-images', pdfInput(fixtures.pdf));
  await page.locator('.process-button').click();
  await page.getByRole('button', { name: 'Cancel processing', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('cancelled');
  await expect(page.locator('.process-button')).toBeEnabled();
  await page.getByLabel('Pages', { exact: true }).fill('1');
  const output = await finish(page);
  expect(output.name).toContain('.png');
  await page.getByRole('button', { name: /Start fresh/ }).click();
  await expect(page.locator('.dropzone')).toBeVisible();
  await expect(page.locator('.result-panel')).toHaveCount(0);
});
test('privacy and offline: cache only app assets and process without a network connection', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        }),
      );
  });
  await openTool(page, 'protect', pdfInput(fixtures.tiny));
  await page.getByLabel('New password', { exact: true }).fill('private-only');
  await page.getByLabel('Confirm password', { exact: true }).fill('private-only');
  await finish(page);
  await page.getByRole('button', { name: /Adjust settings/ }).click();
  await page.getByLabel('New password', { exact: true }).fill('private-only');
  await page.getByLabel('Confirm password', { exact: true }).fill('private-only');
  await context.setOffline(true);
  const output = await finish(page);
  expect((await inspectPdf(output.bytes, 'private-only')).count).toBe(1);
  await context.setOffline(false);
  const stored = await page.evaluate(async () => {
    const keys = await caches.keys();
    return {
      local: localStorage.length,
      session: sessionStorage.length,
      cookies: document.cookie,
      urls: (
        await Promise.all(
          keys.map(async (key) =>
            (await (await caches.open(key)).keys()).map((request) => request.url),
          ),
        )
      ).flat(),
    };
  });
  expect(stored.local).toBe(0);
  expect(stored.session).toBe(0);
  expect(stored.cookies).toBe('');
  expect(
    stored.urls.every((url) => !url.includes('.pdf') && !url.includes('private-only')),
  ).toBeTruthy();
});
