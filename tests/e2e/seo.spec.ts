import { test, expect } from '@playwright/test';
import { seoPages, siteOrigin } from '../../src/lib/seo';
import { makeFixtures } from '../fixtures';
import { pdfInput } from './helpers';

test('SEO: every public page has useful HTML without JavaScript', async ({ browser }, info) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: info.project.use.baseURL,
  });
  const page = await context.newPage();
  const titles = new Set<string>();
  for (const entry of seoPages) {
    const response = await page.goto(entry.path);
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page).toHaveTitle(entry.title);
    titles.add(await page.title());
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      entry.description,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${siteOrigin}${entry.path}`,
    );
    expect(
      JSON.parse((await page.locator('#seo-structured-data').textContent()) || '{}')['@context'],
    ).toBe('https://schema.org');
    if (entry.path !== '/') {
      await expect(
        page.getByRole('heading', { name: 'What you can do', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('navigation', { name: 'Related PDF tools' }).getByRole('link'),
      ).toHaveCount(3);
    }
  }
  expect(titles.size).toBe(13);
  const missing = await page.goto('/tools/not-a-tool');
  expect(missing?.status()).toBe(404);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  await context.close();
});

test('SEO: hydration, navigation and per-route offline HTML remain consistent', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.getByRole('link', { name: /Merge PDF Combine/ }).click();
  await expect(page).toHaveTitle(seoPages.find((entry) => entry.path === '/tools/merge')!.title);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `${siteOrigin}/tools/merge`,
  );
  await page.reload();
  await expect(page.locator('.dropzone')).toBeVisible();
  await page.goto('/tools/split');
  await expect(page.locator('.dropzone')).toBeVisible();
  await context.setOffline(true);
  await page.goto('/tools/merge');
  await expect(page).toHaveTitle(seoPages.find((entry) => entry.path === '/tools/merge')!.title);
  await expect(page.locator('h1')).toHaveText('Merge PDF');
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Free PDF tools.');
  expect(errors).toEqual([]);
});

test('SEO: hosting exposes sitemap and normalizes duplicate URLs', async ({ request }) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml.match(/<loc>/g)).toHaveLength(13);
  for (const entry of seoPages) expect(xml).toContain(`<loc>${siteOrigin}${entry.path}</loc>`);
  expect((await request.get('/robots.txt')).status()).toBe(200);
  for (const path of ['/tools/merge/', '/tools/merge/index.html', '/index.html']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect([301, 308]).toContain(response.status());
    expect(response.headers().location).toMatch(path === '/index.html' ? /\/$/ : /\/tools\/merge$/);
  }
});

test('SEO: unknown tool pages hydrate as genuine 404s without a client render mismatch', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydration|Minified React error/i.test(message.text()))
      errors.push(message.text());
  });
  const response = await page.goto('/tools/not-a-tool');
  expect(response?.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText('This page slipped out of the stack.');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('link', { name: 'Back to Paperlight', exact: true }).click();
  await expect(page.locator('h1')).toContainText('Free PDF tools.');
  expect(errors).toEqual([]);
});

test('SEO: a delayed workspace cannot accept files before hydration is ready', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/assets/Workspace-*.js', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/tools/merge', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Choose PDFs', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'What you can do', exact: true })).toBeVisible();
  await expect(page.getByLabel('Choose files', { exact: true })).toHaveCount(0);
  release();
  const input = page.getByLabel('Choose files', { exact: true });
  await expect(input).toBeEnabled();
  await input.setInputFiles(pdfInput((await makeFixtures()).tiny));
  await expect(page.locator('.process-button')).toBeEnabled();
});
