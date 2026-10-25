import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { structuredPdf } from '../preservation-fixtures';
import { centeredSignature } from '../feature-fixtures';
import { independentPdf } from '../independent';
import { finish, openTool, pdfInput } from './helpers';

test('merge: three Chromium documents preserve bookmarks, links and populated tags', async ({
  page,
}, info) => {
  const bytes = await readFile('tests/fixtures/chromium-tagged.pdf');
  await openTool(
    page,
    'merge',
    [0, 1, 2].map((i) => pdfInput(bytes, `source-${i + 1}.pdf`)),
  );
  const result = await finish(page);
  const report = await independentPdf(result.bytes, info.outputPath('three-tagged-inputs.pdf'));
  expect(report.count).toBe(6);
  expect(report.preservation?.tags.pages).toEqual([0, 1, 2, 3, 4, 5]);
  expect(report.preservation?.outlines).toHaveLength(3);
  expect(report.preservation?.internalLinks.map((link) => link.target)).toEqual([1, 3, 5]);
});

for (const tool of ['watermark', 'page-numbers', 'sign'] as const) {
  test(`${tool}: added content preserves existing tags, links and bookmarks`, async ({
    page,
  }, info) => {
    await openTool(page, tool, pdfInput(await structuredPdf()));
    if (tool === 'watermark') await page.getByLabel('Watermark text').fill('DRAFT');
    if (tool === 'sign') {
      await page.getByRole('button', { name: 'Upload', exact: true }).click();
      await page.getByLabel('Upload signature image').setInputFiles({
        name: 'signature.png',
        mimeType: 'image/png',
        buffer: centeredSignature(),
      });
      await expect(page.getByAltText('Your signature placement')).toBeVisible();
    }
    const result = await finish(page);
    const report = await independentPdf(result.bytes, info.outputPath(`${tool}-tagged.pdf`));
    expect(report.preservation?.tags.valid).toBe(true);
    expect(report.preservation?.tags.pages).toEqual([0, 1]);
    expect(report.preservation?.outlines[0].title).toBe('ALPHA Document');
    expect(report.preservation?.internalLinks.map((link) => link.target)).toEqual([1, 1]);
    if (tool === 'sign') expect(report.preservation?.tags.alt).toContain('Visual signature mark');
  });
}

test('full-preservation refusal identifies the file and retains the selected range', async ({
  page,
}) => {
  await openTool(page, 'split', pdfInput(await structuredPdf(), 'linked-source.pdf'));
  await page.getByLabel('Pages', { exact: true }).fill('1');
  await page.locator('.process-button').click();
  await expect(page.getByRole('alert')).toContainText('linked-source.pdf');
  await expect(page.getByRole('alert')).toContainText('excluded from the output');
  await expect(page.getByLabel('Pages', { exact: true })).toHaveValue('1');
  await expect(page.locator('.result-panel')).toHaveCount(0);
  await page.getByLabel('Pages', { exact: true }).fill('1-2');
  expect((await finish(page)).bytes.length).toBeGreaterThan(0);
});

test('theme transition is scoped, settles after rapid toggles, and respects reduced motion', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveClass(/theme-changing/);
  const duration = await page
    .locator('body')
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(duration).toContain('0.24s');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).not.toHaveClass(/theme-changing/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).not.toHaveClass(/theme-changing/);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
