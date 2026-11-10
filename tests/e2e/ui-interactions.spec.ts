import { test, expect } from '@playwright/test';
import { tools } from '../../src/lib/tools';
import { inspectPdf, makeFixtures } from '../fixtures';
import { finish, openTool, pdfInput } from './helpers';
import { independentlyEncrypted } from '../encryption-fixtures';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';

test('UI-NAV: mobile navigation closes on Escape and restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Open navigation' });
  await toggle.press('Enter');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link', { name: 'Tools', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(nav).toBeHidden();
});

test('UI-DIALOG: help and file preview trap focus and return it to their opener', async ({
  page,
}) => {
  const f = await makeFixtures();
  await openTool(page, 'merge', [pdfInput(f.pdf, 'first.pdf'), pdfInput(f.tiny, 'second.pdf')]);
  const help = page.getByRole('button', { name: 'Tool help' });
  await help.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Got it/ }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(help).toBeFocused();
  await help.press('Enter');
  await dialog.getByRole('button', { name: /Got it/ }).click();
  await expect(help).toBeFocused();
  const preview = page.getByRole('button', { name: 'Preview first.pdf', exact: true });
  await preview.click();
  await expect(dialog.getByRole('button', { name: 'Previous file page' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Next file page' }).click();
  await expect(dialog).toContainText('Page 2 of 3');
  await dialog.getByRole('button', { name: 'Previous file page' }).click();
  await expect(dialog).toContainText('Page 1 of 3');
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(preview).toBeFocused();
});

test('UI-SETTINGS: adjusting a result reveals collapsed settings and focuses them', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const f = await makeFixtures();
  await openTool(page, 'rotate', pdfInput(f.tiny));
  await finish(page);
  await page.getByRole('button', { name: 'Hide settings', exact: true }).click();
  await page.getByRole('button', { name: /Adjust settings/ }).click();
  await expect(page.getByRole('button', { name: 'Hide settings', exact: true })).toBeVisible();
  await expect(page.locator('.settings-title')).toBeFocused();
  await expect(page.locator('.process-button')).toBeEnabled();
});

test('UI-SEARCH: each category filters the directory and an empty search recovers', async ({
  page,
}) => {
  await page.goto('/');
  const categories = page.getByRole('group', { name: 'Tool categories' });
  for (const category of new Set(tools.map(({ category }) => category))) {
    const button = categories.getByRole('button', { name: category, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.tool-card')).toHaveCount(
      tools.filter((tool) => tool.category === category).length,
    );
  }
  await categories.getByRole('button', { name: 'All tools', exact: true }).click();
  const search = page.getByRole('textbox', { name: 'Search tools' });
  await search.fill('not-a-real-pdf-tool');
  await expect(page.locator('.empty-search')).toBeVisible();
  await expect(page.locator('.tool-card')).toHaveCount(0);
  await search.clear();
  await expect(page.locator('.tool-card')).toHaveCount(12);
});

test('UI-POSITION: all nine presets expose independent names and pressed states', async ({
  page,
}) => {
  const f = await makeFixtures();
  await openTool(page, 'watermark', pdfInput(f.tiny));
  await page.getByLabel('Watermark text').fill('X');
  const grid = page.getByRole('group', { name: 'Annotation position' });
  for (const row of ['Top', 'Middle', 'Bottom']) {
    for (const column of ['left', 'center', 'right']) {
      const choice = grid.getByRole('button', { name: `${row} ${column}`, exact: true });
      await choice.press('Enter');
      await expect(choice).toHaveAttribute('aria-pressed', 'true');
      await expect(grid.getByRole('button', { pressed: true })).toHaveCount(1);
    }
  }
  await finish(page);
});

test('UI-FILE: cancelling a password prompt allows choosing the same file again', async ({
  page,
}) => {
  const f = await makeFixtures();
  const encrypted = pdfInput(
    independentlyEncrypted(f.tiny, 'AES-256', 'audit-password'),
    'locked.pdf',
  );
  await page.goto('/tools/unlock');
  const choose = page.getByRole('button', { name: 'Choose PDFs', exact: true });
  const input = page.getByLabel('Choose files', { exact: true });
  await expect(choose).toBeEnabled();
  const picker = page.waitForEvent('filechooser');
  await choose.press('Enter');
  await (await picker).setFiles(encrypted);
  const dialog = page.getByRole('dialog', { name: 'Password required' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Current PDF password')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(choose).toBeFocused();
  await expect(input).toHaveValue('');
  await input.setInputFiles(encrypted);
  await dialog.getByLabel('Current PDF password').fill('audit-password');
  await dialog.getByRole('button', { name: /Open PDF locally/ }).click();
  await finish(page);
});

test('UI-SIGN-FIELDS: active field state is announced and edits stay on that field', async ({
  page,
}) => {
  const f = await makeFixtures();
  await openTool(page, 'sign', pdfInput(f.pdf));
  const kind = page.getByLabel('Field type');
  await kind.selectOption('name');
  await page.getByRole('button', { name: 'Add field', exact: true }).click();
  await page.getByLabel('Field text', { exact: true }).fill('First field');
  await kind.selectOption('text');
  await page.getByRole('button', { name: 'Add field', exact: true }).click();
  await page.getByLabel('Field text', { exact: true }).fill('Second field');
  await page.getByLabel('Field pages').fill('2');
  const list = page.getByRole('group', { name: 'Signature fields', exact: true });
  const first = list.getByRole('button', { name: /^1\. name/ });
  const second = list.getByRole('button', { name: /^2\. text/ });
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await first.press('Enter');
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(second).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('Field text', { exact: true })).toHaveValue('First field');
  const pdf = await inspectPdf((await finish(page)).bytes);
  expect(pdf.pages[0].text).toContain('First field');
  expect(pdf.pages[1].text).toContain('Second field');
});

test('UI-ORIGINAL: compression keeps the original filename and bytes available', async ({
  page,
}) => {
  const f = await makeFixtures();
  await openTool(page, 'compress', pdfInput(f.pdf, 'original-audit.pdf'));
  await finish(page);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Keep original file' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('original-audit.pdf');
  expect((await readFile((await download.path())!)).equals(f.pdf)).toBe(true);
});

test('UI-BATCH-FAILED: all failed inputs leave the workspace at configure and can be retried', async ({
  page,
}) => {
  const f = await makeFixtures();
  await openTool(page, 'rotate', [pdfInput(f.tiny, 'one.pdf'), pdfInput(f.tiny, 'two.pdf')]);
  const pages = page.getByLabel('Pages', { exact: true });
  await pages.fill('2');
  await page.locator('.process-button').click();
  await expect(page.getByRole('heading', { name: 'Processing could not complete.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Download/ })).toHaveCount(0);
  await expect(page.locator('.flow-steps .current')).toHaveText('2Configure');
  await page.getByRole('button', { name: /Adjust settings/ }).click();
  await expect(pages).toHaveValue('2');
  await pages.fill('1');
  const output = await finish(page);
  expect(Object.keys(unzipSync(output.bytes))).toHaveLength(2);
});

test('UI-LINKS: skip navigation, section links, footer, breadcrumbs and all FAQs work', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await skip.press('Enter');
  await expect(page).toHaveURL(/#main$/);
  await page.keyboard.press('Tab');
  expect(
    await page.locator('#main').evaluate((main) => main.contains(document.activeElement)),
  ).toBe(true);
  await page.getByRole('link', { name: 'Explore the tools' }).click();
  await expect(page).toHaveURL(/#tools$/);
  await page.getByRole('link', { name: 'Private by design', exact: true }).click();
  await expect(page).toHaveURL(/#privacy$/);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('link', { name: 'How it works', exact: true }).click();
  await expect(page).toHaveURL(/#how-it-works$/);
  const toggleFaqs = async (selector: string) => {
    const questions = await page.locator(selector).all();
    expect(questions.length).toBeGreaterThan(0);
    for (const question of questions) {
      const summary = question.locator('summary');
      await summary.press('Enter');
      await expect(question).toHaveJSProperty('open', true);
      await summary.press('Enter');
      await expect(question).toHaveJSProperty('open', false);
    }
  };
  await toggleFaqs('main details');
  const footer = page.getByRole('contentinfo');
  await footer.getByRole('link', { name: 'iLovePDF alternative' }).click();
  await expect(page).toHaveURL(/\/alternatives\/ilovepdf$/);
  await footer.getByRole('link', { name: 'Usage analytics' }).click();
  await expect(page).toHaveURL(/\/#privacy$/);
  await footer.getByRole('link', { name: 'All tools', exact: true }).click();
  await expect(page).toHaveURL(/\/#tools$/);
  for (const tool of tools) {
    await page.goto(`/tools/${tool.id}`);
    await toggleFaqs('.tool-guide details');
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(tool.title);
  }
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Free PDF tools');
});

test('UI-VIEW: page grid and large preview navigate pages without changing the export', async ({
  page,
}) => {
  const f = await makeFixtures();
  await openTool(page, 'rotate', pdfInput(f.pdf));
  const grid = page.getByRole('button', { name: 'Page grid', exact: true });
  const large = page.getByRole('button', { name: 'Large page preview', exact: true });
  await expect(grid).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'View page 2', exact: true }).click();
  await expect(large).toHaveAttribute('aria-pressed', 'true');
  const previous = page.getByRole('button', { name: 'Previous page', exact: true });
  const next = page.getByRole('button', { name: 'Next page', exact: true });
  await expect(page.locator('.page-navigator')).toContainText('Page 2 of 3');
  await next.click();
  await expect(next).toBeDisabled();
  await previous.click();
  await previous.click();
  await expect(previous).toBeDisabled();
  await grid.click();
  await expect(page.getByRole('button', { name: 'View page 2', exact: true })).toBeVisible();
  const pdf = await inspectPdf((await finish(page)).bytes);
  expect(pdf.pages.map(({ rotation }) => rotation)).toEqual([90, 180, 90]);
});
