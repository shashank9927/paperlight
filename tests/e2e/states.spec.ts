import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { makeFixtures } from '../fixtures';
import { openTool, pdfInput, finish } from './helpers';

for (const theme of ['dark', 'light']) {
  for (const width of [390, 768, 1440]) {
    test(`workspace states: ${theme} at ${width}px`, async ({ page }, info) => {
      test.setTimeout(120000);
      // Hold only the first processing job for a deterministic processing-state capture.
      await page.addInitScript(() => {
        const Original = Worker;
        const held = new WeakSet<Worker>();
        let jobs = 0;
        window.Worker = class extends Original {
          constructor(url: string | URL, options?: WorkerOptions) {
            super(url, options);
            if (String(url).includes('processor.worker') && ++jobs === 1) held.add(this);
          }
          postMessage(message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
            if (held.has(this)) return;
            if (Array.isArray(options)) super.postMessage(message, options);
            else super.postMessage(message, options);
          }
        };
      });
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const fixture = await makeFixtures();
      await openTool(page, 'watermark', pdfInput(fixture.pdf));
      if ((await page.locator('html').getAttribute('data-theme')) !== theme) {
        await page.getByRole('button', { name: `Switch to ${theme} theme` }).click();
      }
      await expect(page.locator('.focus-page-wrap canvas')).toHaveAttribute('data-ready', 'true');
      const capture = async (state: string) => {
        await page.evaluate(() => window.scrollTo(0, 0));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        const report = await new AxeBuilder({ page }).analyze();
        expect(
          report.violations.map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
          })),
        ).toEqual([]);
        await page.screenshot({ path: info.outputPath(`${state}.png`), fullPage: true });
      };
      await capture('populated');
      await page.locator('.process-button').click();
      await expect(
        page.getByRole('button', { name: 'Cancel processing', exact: true }),
      ).toBeVisible();
      await capture('processing');
      await page.getByRole('button', { name: 'Cancel processing', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('cancelled');
      await capture('error');
      await expect(page.getByLabel('Watermark text', { exact: true })).toHaveValue('CONFIDENTIAL');
      await finish(page);
      await capture('result');
    });
  }
}
