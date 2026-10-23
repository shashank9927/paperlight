import { test, expect } from '@playwright/test';
import { siteOrigin } from '../../src/lib/seo';

// Exercise the official SDK against a deterministic same-origin intake adapter.
// Actual Vercel dashboard ingestion must be checked after production deployment.
test('analytics: production page views are deduplicated and stripped of sensitive URL data', async ({
  browser,
  request,
}, info) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const views: Record<string, unknown>[] = [];
  await context.route(`${siteOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/_vercel/insights/script.js') {
      await route.fulfill({
        contentType: 'text/javascript',
        body: `
        let beforeSend = event => event;
        window.va = (type, value) => {
          if (type === 'beforeSend') beforeSend = value;
          if (type === 'pageview') {
            const event = beforeSend({type: 'pageview', url: location.origin + value.path});
            if (event) fetch('/_vercel/insights/view', {method:'POST',body:JSON.stringify({...event,route:value.route})}).catch(() => {});
          }
        };
        (window.vaq || []).forEach(args => window.va(...args));
        window.vaq = [];
      `,
      });
    } else if (url.pathname === '/_vercel/insights/view') {
      views.push(route.request().postDataJSON());
      await route.fulfill({ status: 204 });
    } else {
      const response = await request.get(`${info.project.use.baseURL}${url.pathname}${url.search}`);
      if (response.headers()['content-type']?.includes('text/html')) {
        await route.fulfill({
          response,
          body: (await response.text()).replace('data-analytics="false"', 'data-analytics="true"'),
        });
      } else await route.fulfill({ response });
    }
  });
  const page = await context.newPage();
  await page.goto(`${siteOrigin}/?filename=private.pdf&password=secret#signature`);
  await expect.poll(() => views.length).toBe(1);
  await page.getByRole('link', { name: /Merge PDF Combine/ }).click();
  await expect.poll(() => views.length).toBe(2);
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(views).toEqual([
    { type: 'pageview', url: `${siteOrigin}/`, route: '/' },
    { type: 'pageview', url: `${siteOrigin}/tools/merge`, route: '/tools/merge' },
  ]);
  expect(JSON.stringify(views)).not.toMatch(/private\.pdf|secret|signature|filename|password/);
  await context.close();
});

test('analytics: local builds make no analytics requests', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/_vercel/')) requests.push(request.url());
  });
  await page.goto('/tools/protect?password=secret');
  await expect(page.locator('.dropzone')).toBeVisible();
  expect(requests).toEqual([]);
});

test('analytics: blocked production script leaves the workspace usable', async ({
  browser,
  request,
}, info) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route(`${siteOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/_vercel/')) return route.abort();
    const response = await request.get(`${info.project.use.baseURL}${url.pathname}`);
    await route.fulfill(
      response.headers()['content-type']?.includes('text/html')
        ? {
            response,
            body: (await response.text()).replace(
              'data-analytics="false"',
              'data-analytics="true"',
            ),
          }
        : { response },
    );
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${siteOrigin}/tools/merge`);
  await expect(page.locator('.dropzone')).toBeVisible();
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(errors).toEqual([]);
  await context.close();
});
