import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { seoPages, siteOrigin } from '../../src/lib/seo';
import { makeFixtures } from '../fixtures';
import { pdfInput } from './helpers';
import { brand } from '../../src/lib/brand';

test('SEO: product and parent-brand site names survive client navigation', async ({
  page,
  request,
}) => {
  const websites = (data: { '@graph': Record<string, unknown>[] }) =>
    data['@graph'].filter((entry) => entry['@type'] === 'WebSite');
  const expected = [
    {
      '@type': 'WebSite',
      '@id': `${siteOrigin}/#website`,
      name: brand.productName,
      alternateName: brand.name,
      url: `${siteOrigin}/`,
    },
  ];
  const response = await request.get('/');
  expect(response.status()).toBe(200);
  const initial = (await response.text()).match(
    /<script id="seo-structured-data" type="application\/ld\+json">(.*?)<\/script>/,
  );
  expect(initial).not.toBeNull();
  expect(websites(JSON.parse(initial![1]))).toEqual(expected);

  await page.goto('/');
  await page.getByRole('link', { name: /Merge PDF Combine/ }).click();
  await expect(page).toHaveURL(/\/tools\/merge$/);
  await expect
    .poll(async () =>
      websites(JSON.parse((await page.locator('#seo-structured-data').textContent())!)),
    )
    .toEqual([]);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect
    .poll(async () =>
      websites(JSON.parse((await page.locator('#seo-structured-data').textContent())!)),
    )
    .toEqual(expected);
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
    'content',
    brand.productName,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${siteOrigin}/`);
});

test('SEO: comparison stays accessible in both themes at mobile, tablet and desktop widths', async ({
  page,
}) => {
  await page.goto('/alternatives/ilovepdf');
  for (const theme of ['dark', 'light']) {
    if ((await page.locator('html').getAttribute('data-theme')) !== theme)
      await page.getByRole('button', { name: `Switch to ${theme} theme` }).click();
    await expect(page.locator('html')).not.toHaveClass(/theme-changing/);
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const comparison = page.getByRole('region', { name: 'PDF workflow comparison' });
      await comparison.focus();
      await expect(comparison).toBeFocused();
      if (width === 390) {
        await comparison.press('ArrowRight');
        await expect
          .poll(() => comparison.evaluate((element) => element.scrollLeft))
          .toBeGreaterThan(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
          .violations,
      ).toEqual([]);
    }
  }
});

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
  expect(titles.size).toBe(14);
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
  await expect
    .poll(() => page.evaluate(async () => Boolean(await caches.match('/tools/merge'))))
    .toBe(true);
  await expect(page.getByLabel('Choose files', { exact: true })).toBeEnabled();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Merge PDF');
  await expect(page.locator('.dropzone')).toBeVisible();
  await expect(page.getByLabel('Choose files', { exact: true })).toBeEnabled();
  await context.setOffline(false);
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
  expect(xml.match(/<loc>/g)).toHaveLength(14);
  for (const entry of seoPages) expect(xml).toContain(`<loc>${siteOrigin}${entry.path}</loc>`);
  expect((await request.get('/robots.txt')).status()).toBe(200);
  for (const path of ['/tools', '/tools/', '/assets/', '/licenses/']) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
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
  await page.getByRole('link', { name: 'Back to Havisu PDF', exact: true }).click();
  await expect(page.locator('h1')).toContainText('Free PDF tools.');
  expect(errors).toEqual([]);
});

test('SEO: saved light appearance never flashes dark during hydration', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('paperlight-theme', 'light');
    const darkTransitions: string[] = [];
    Object.defineProperty(window, '__themeHydrationTransitions', { value: darkTransitions });
    new MutationObserver((records) => {
      for (const record of records) {
        if (
          record.oldValue === 'dark' ||
          (record.target as Element).getAttribute('data-theme') === 'dark'
        )
          darkTransitions.push('dark');
      }
    }).observe(document, {
      attributes: true,
      subtree: true,
      attributeFilter: ['data-theme'],
      attributeOldValue: true,
    });
  });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Switch to dark theme' });
  await expect(toggle).toBeEnabled();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __themeHydrationTransitions: string[] })
          .__themeHydrationTransitions,
    ),
  ).toEqual([]);
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('paperlight-theme'))).toBe('dark');
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
