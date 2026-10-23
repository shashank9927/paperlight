import { test, expect } from '@playwright/test';
import { cpus, platform, release, totalmem } from 'node:os';
import { writeFile } from 'node:fs/promises';
import { makeFixtures } from '../fixtures';
import { pdfInput } from './helpers';
import budgets from '../performance-budgets.json' with { type: 'json' };

test('measured cold/warm loading, preview, processing, responsiveness and available heap', async ({
  browser,
}, info) => {
  const fixture = await makeFixtures();
  const results = [];
  for (let sample = 0; sample < 3; sample++) {
    const context = await browser.newContext({ baseURL: info.project.use.baseURL });
    const page = await context.newPage();
    for (const warm of [false, true]) {
      const start = performance.now();
      await page.goto('/tools/compress');
      await expect(page.locator('.dropzone')).toBeVisible();
      const loadMs = performance.now() - start;
      const preview = performance.now();
      await page.getByLabel('Choose files', { exact: true }).setInputFiles(pdfInput(fixture.pdf));
      await expect(page.locator('.process-button')).toBeEnabled();
      await expect(page.locator('.focus-page-wrap canvas')).toHaveAttribute('data-ready', 'true');
      const previewMs = performance.now() - preview;
      await page.evaluate(() => {
        const state = { maxGapMs: 0, ticks: 0, last: performance.now(), timer: 0 };
        state.timer = window.setInterval(() => {
          const now = performance.now();
          state.maxGapMs = Math.max(state.maxGapMs, now - state.last);
          state.last = now;
          state.ticks++;
        }, 16);
        Object.assign(window, { paperlightBenchmark: state });
      });
      const processing = performance.now();
      await page.locator('.process-button').click();
      await expect(page.locator('.result-panel')).toBeVisible();
      const processingMs = performance.now() - processing;
      const metrics = await page.evaluate(() => {
        const state = (
          window as unknown as {
            paperlightBenchmark: { timer: number; maxGapMs: number; ticks: number };
          }
        ).paperlightBenchmark;
        clearInterval(state.timer);
        const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        return {
          maxGapMs: state.maxGapMs,
          ticks: state.ticks,
          pageJsHeapBytes: memory?.usedJSHeapSize ?? null,
        };
      });
      results.push({ sample, warm, loadMs, previewMs, processingMs, ...metrics });
      // Conservative regression budgets for this specific 3-page / ~0.8MB fixture.
      expect(loadMs).toBeLessThan(budgets.loadMs);
      expect(previewMs).toBeLessThan(budgets.previewMs);
      expect(processingMs).toBeLessThan(budgets.processingMs);
      expect(metrics.maxGapMs).toBeLessThan(budgets.maxGapMs);
    }
    await context.close();
  }
  await writeFile(
    info.outputPath('benchmark.json'),
    JSON.stringify(
      {
        browser: info.project.name,
        version: browser.version(),
        host: {
          platform: platform(),
          release: release(),
          cpu: cpus()[0]?.model,
          logicalCpus: cpus().length,
          ramBytes: totalmem(),
        },
        fixture: {
          bytes: fixture.pdf.length,
          pages: 3,
          kinds: 'text + rotated/cropped text + seeded scanned image',
        },
        caveat:
          'Local loopback, no throttling. Page JS heap excludes workers, WASM, GPU and native allocations; not peak process memory. Automated desktop browsers are not physical mobile devices.',
        results,
      },
      null,
      2,
    ),
  );
});
