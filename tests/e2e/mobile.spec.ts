import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { makeFixtures, inspectPdf } from '../fixtures';
import { finish, openTool, pdfInput } from './helpers';
let fixtures: Awaited<ReturnType<typeof makeFixtures>>;
test.beforeAll(async () => {
  fixtures = await makeFixtures();
});
test('mobile: polished home, working navigation and every tool layout', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'All tools', exact: true }).click();
  await expect(page.locator('.main-nav')).not.toHaveClass(/open/);
  await expect(page.locator('.tool-card')).toHaveCount(12);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  const report = await new AxeBuilder({ page }).analyze();
  expect(
    report.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await mkdir('.cache/screenshots', { recursive: true });
  await page.screenshot({ path: '.cache/screenshots/home-mobile.png', fullPage: true });
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
    await page.goto(`/tools/${tool}`);
    await expect(page.locator('.dropzone')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      tool,
    ).toBeTruthy();
  }
});
test('mobile: reorder files and download a real merged PDF', async ({ page }) => {
  await openTool(page, 'merge', [
    pdfInput(fixtures.pdf, 'one.pdf'),
    pdfInput(fixtures.tiny, 'two.pdf'),
  ]);
  await page.getByLabel('Move two.pdf earlier', { exact: true }).click();
  const result = await finish(page);
  const document = await inspectPdf(result.bytes);
  expect(document.count).toBe(4);
  expect(document.pages[0].text).toContain('GAMMA LAST');
  await mkdir('.cache/screenshots', { recursive: true });
  await page.screenshot({ path: '.cache/screenshots/workspace-mobile.png', fullPage: true });
});
