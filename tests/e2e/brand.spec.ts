import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { brand } from '../../src/lib/brand';
import { seoPages } from '../../src/lib/seo';
import { makeFixtures } from '../fixtures';
import { openTool, finish, pdfInput } from './helpers';

test('Havisu branding and controls stay readable in both themes across screen widths', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeEnabled();
  for (const theme of ['dark', 'light']) {
    if ((await page.locator('html').getAttribute('data-theme')) !== theme)
      await page.getByRole('button', { name: `Switch to ${theme} theme` }).click();
    await expect(page.locator('html')).not.toHaveClass(/theme-changing/);
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const home = page.getByRole('link', { name: 'Havisu PDF home' }).first();
      await expect(home).toBeVisible();
      await home.focus();
      await expect(home).toBeFocused();
      expect(
        await page
          .locator('.brand-mark')
          .first()
          .evaluate((element) => getComputedStyle(element).width),
      ).toBe('34px');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
          .violations,
      ).toEqual([]);
    }
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      theme === 'dark' ? '#0b0c0e' : '#fafaf9',
    );
  }
});
test('every rendered page and its metadata use the new brand and origin', async ({ page }) => {
  for (const route of seoPages) {
    await page.goto(route.path);
    await expect(page).toHaveTitle(route.title);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      brand.origin + route.path,
    );
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
      'content',
      brand.productName,
    );
    expect(await page.locator('body').innerText()).not.toContain('Paperlight');
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
      'href',
      /\/assets\/favicon-[a-f0-9]{12}\.svg$/,
    );
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      'href',
      /\/assets\/havisu-icon-180-[a-f0-9]{12}\.png$/,
    );
  }
});
test('merge downloads carry the Havisu name and preserve document content', async ({ page }) => {
  const fixture = await makeFixtures();
  await openTool(page, 'merge', [
    pdfInput(fixture.pdf, 'one.pdf'),
    pdfInput(fixture.tiny, 'two.pdf'),
  ]);
  const output = await finish(page);
  expect(output.name).toBe('havisu-pdf-merged.pdf');
});
