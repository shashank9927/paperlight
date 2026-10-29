import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { unzipSync } from 'fflate';
import { makeFixtures, inspectPdf } from '../fixtures';
import { finish, openTool, pdfInput } from './helpers';

test('split defaults to one PDF per page in a ZIP, with mouse and keyboard page selection', async ({
  page,
}) => {
  const fixture = await makeFixtures();
  await openTool(page, 'split', pdfInput(fixture.pdf));
  await expect(page.getByLabel('Split mode')).toHaveValue('individual');
  let result = await finish(page);
  expect(result.name).toMatch(/\.zip$/);
  let entries = Object.entries(unzipSync(result.bytes));
  expect(entries.map(([name]) => name.match(/page-\d+\.pdf$/)?.[0])).toEqual([
    'page-001.pdf',
    'page-002.pdf',
    'page-003.pdf',
  ]);
  expect(
    await Promise.all(entries.map(async ([, bytes]) => (await inspectPdf(bytes)).count)),
  ).toEqual([1, 1, 1]);
  await page.getByRole('button', { name: /Adjust settings/ }).click();
  await page.getByRole('checkbox', { name: 'Include page 2', exact: true }).uncheck();
  await expect(page.getByLabel('Pages', { exact: true })).toHaveValue('1, 3');
  result = await finish(page);
  entries = Object.entries(unzipSync(result.bytes));
  expect(entries.map(([name]) => name.match(/page-\d+\.pdf$/)?.[0])).toEqual([
    'page-001.pdf',
    'page-003.pdf',
  ]);
  await page.getByRole('button', { name: /Adjust settings/ }).click();
  await page.getByRole('checkbox', { name: 'Include page 2', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Pages', { exact: true })).toHaveValue('1, 2, 3');
  const report = await new AxeBuilder({ page }).analyze();
  expect(report.violations).toEqual([]);
  await page.getByLabel('Split mode').selectOption('extract');
  result = await finish(page);
  expect(result.name).toMatch(/\.pdf$/);
  expect((await inspectPdf(result.bytes)).count).toBe(3);
});

test('custom groups control the preview and output independently of an inactive page range', async ({
  page,
}) => {
  const fixture = await makeFixtures();
  await openTool(page, 'split', pdfInput(fixture.pdf));
  await page.getByLabel('Pages', { exact: true }).fill('99');
  await page.getByLabel('Split mode').selectOption('ranges');
  await expect(page.getByLabel('Pages', { exact: true })).toHaveCount(0);
  await page.getByLabel('Page groups').fill('2;1');
  await expect(page.getByRole('button', { name: 'View page 1', exact: true })).toHaveClass(
    /in-range/,
  );
  await expect(page.getByRole('button', { name: 'View page 3', exact: true })).not.toHaveClass(
    /in-range/,
  );
  let result = await finish(page);
  const entries = Object.values(unzipSync(result.bytes));
  expect(entries).toHaveLength(2);
  expect((await inspectPdf(entries[0])).pages[0].text).toContain('BETA');
  expect((await inspectPdf(entries[1])).pages[0].text).toContain('ALPHA');
  await page.getByRole('button', { name: /Adjust settings/ }).click();
  await page.getByLabel('Combine all groups into one PDF').check();
  result = await finish(page);
  expect(result.name).toMatch(/\.pdf$/);
  expect((await inspectPdf(result.bytes)).count).toBe(2);
});

test('batch preview selection uses each document page count', async ({ page }) => {
  const fixture = await makeFixtures();
  await openTool(page, 'watermark', [
    pdfInput(fixture.tiny, 'short.pdf'),
    pdfInput(fixture.pdf, 'long.pdf'),
  ]);
  await page.getByLabel('Watermark text', { exact: true }).fill('AUDIT');
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('.preview-instruction')).toContainText('Drag the annotation');
  const entries = Object.values(unzipSync((await finish(page)).bytes));
  expect(entries).toHaveLength(2);
  const output = await inspectPdf(entries[1]);
  expect(output.pages.every((p) => p.text.includes('AUDIT'))).toBe(true);
});
