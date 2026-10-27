import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument } from 'pdf-lib';
import { inspectPdf } from '../fixtures';
import { finish, pdfInput } from './helpers';
import { seoPages } from '../../src/lib/seo';

test('install manifest, icons and warmed files remain available offline', async ({
  page,
  context,
  browserName,
  request,
}) => {
  for (const route of seoPages) {
    const response = await request.get(route.path);
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(await response.text()).toContain('name="apple-mobile-web-app-capable" content="yes"');
  }
  const response = await request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/manifest+json');
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: 'Havisu PDF',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
  });
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((item: { sizes: string }) => item.sizes === `${size}x${size}`);
    const file = await request.get(icon.src);
    expect(file.status()).toBe(200);
    const data = await file.body();
    expect(data.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect([data.readUInt32BE(16), data.readUInt32BE(20)]).toEqual([size, size]);
  }
  await page.goto('/');
  const bootstrap = await page.locator('script[src*="install-capture-"]').getAttribute('src');
  expect(bootstrap).toMatch(/^\/assets\/install-capture-[a-f0-9]{12}\.js$/);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        }),
      );
  });
  const paths = [
    '/manifest.webmanifest',
    bootstrap!,
    ...manifest.icons.map((icon: { src: string }) => icon.src),
  ];
  await expect
    .poll(() =>
      page.evaluate(
        async (items) =>
          (await Promise.all(items.map((path) => caches.match(path)))).every(Boolean),
        paths,
      ),
    )
    .toBe(true);
  if (browserName === 'chromium') {
    const cdp = await context.newCDPSession(page);
    const app = await cdp.send('Page.getAppManifest');
    expect(app.errors).toEqual([]);
    expect(app.manifest?.display).toBe('kStandalone');
    const eligibility = await cdp.send('Page.getInstallabilityErrors');
    expect(eligibility.installabilityErrors).toEqual([]);
    await cdp.detach();
  }
  await context.setOffline(true);
  await expect(
    page.getByText('You’re offline. Previously loaded tools may still work.'),
  ).toBeVisible();
  const offline = await page.evaluate(
    async (items) => Promise.all(items.map(async (path) => (await fetch(path)).status)),
    paths,
  );
  expect(offline).toEqual([200, 200, 200, 200]);
  await context.setOffline(false);
  await expect(
    page.getByText('You’re offline. Previously loaded tools may still work.'),
  ).toHaveCount(0);
});

test('an install event before the app bundle loads is retained', async ({ page }) => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/assets\/index-[^/]+\.js$/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() =>
    Boolean((window as unknown as { __havisuInstall?: unknown }).__havisuInstall),
  );
  await page.evaluate(() => {
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: async () => {
        (window as unknown as { earlyInstallCalls: number }).earlyInstallCalls = 1;
      },
    });
    window.dispatchEvent(event);
  });
  release();
  const button = page.getByRole('button', { name: 'Install Havisu PDF' });
  await expect(button).toBeVisible();
  await button.click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { earlyInstallCalls?: number }).earlyInstallCalls),
    )
    .toBe(1);
});

test('a missing install bootstrap never prevents the app from opening', async ({ page }) => {
  await page.route(/\/assets\/install-capture-[a-f0-9]{12}\.js$/, (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Search tools' })).toBeEnabled();
  await page.evaluate(() =>
    window.dispatchEvent(
      Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt: async () => {},
      }),
    ),
  );
  await expect(page.getByRole('button', { name: 'Install Havisu PDF' })).toBeVisible();
});

test('install control follows the browser prompt and does not persist document data', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
      configurable: true,
    });
    window.addEventListener(
      'beforeinstallprompt',
      (event) => {
        if (event.isTrusted) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
  });
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Install Havisu PDF' });
  await expect(button).toHaveCount(0);
  const cancelled = await page.evaluate(() => {
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: async () => {
        (window as unknown as { installCalls: number }).installCalls = 1;
      },
    });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(cancelled).toBe(true);
  await expect(button).toBeVisible();
  await page
    .getByRole('link', { name: /Split PDF/ })
    .first()
    .click();
  await expect(button).toBeVisible();
  await button.focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { installCalls?: number }).installCalls))
    .toBe(1);
  await expect(button).toHaveCount(0);
  await page.evaluate(() => {
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: async () => ({ outcome: 'dismissed' }),
    });
    window.dispatchEvent(event);
  });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toBeVisible();
  await expect(button).toBeFocused();
  await button.click();
  await expect(page.getByRole('dialog', { name: 'Install Havisu PDF' })).toContainText('browser');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: async () => {
        throw new Error('Installation unavailable');
      },
    });
    window.dispatchEvent(event);
  });
  await button.click();
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByRole('dialog', { name: 'Install Havisu PDF' })).toContainText('browser');
  await page.keyboard.press('Escape');
  await expect(page.locator('.dropzone')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await page.evaluate(() => {
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: async () => {},
    });
    window.dispatchEvent(event);
  });
  await expect(button).toHaveCount(0);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test('iPhone and iPad get accessible manual instructions, hidden in standalone mode', async ({
  browser,
}) => {
  const options = {
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 },
  };
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Install Havisu PDF' });
  await expect(button).toBeVisible();
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') {
      await page.getByRole('button', { name: 'Switch to light theme' }).click();
      await expect(page.locator('h1').first()).toHaveCSS('color', 'rgb(25, 26, 29)');
    }
    await button.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Add Havisu PDF to your Home Screen' });
    await expect(dialog).toContainText('Share');
    await expect(dialog).toContainText('Add to Home Screen');
    expect(
      (await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations,
    ).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(button).toBeFocused();
  }
  await context.close();
  const standalone = await browser.newContext(options);
  await standalone.addInitScript(() =>
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }),
  );
  const installedPage = await standalone.newPage();
  await installedPage.goto('/');
  await expect(installedPage.getByRole('button', { name: 'Install Havisu PDF' })).toHaveCount(0);
  await standalone.close();
});

test('macOS Safari offers Dock instructions only on supported versions', async ({ browser }) => {
  const open = async (version: number) => {
    const context = await browser.newContext({
      userAgent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/${version}.0 Safari/605.1.15`,
    });
    await context.addInitScript(() =>
      window.addEventListener(
        'beforeinstallprompt',
        (event) => {
          if (event.isTrusted) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        },
        true,
      ),
    );
    const page = await context.newPage();
    await page.goto('/');
    return { context, page };
  };
  const supported = await open(17);
  await supported.page.getByRole('button', { name: 'Install Havisu PDF' }).click();
  const dialog = supported.page.getByRole('dialog', { name: 'Add Havisu PDF to your Dock' });
  await expect(dialog).toContainText('File');
  await expect(dialog).toContainText('Add to Dock');
  await supported.page.keyboard.press('Escape');
  await supported.context.close();
  const older = await open(16);
  await expect(older.page.getByRole('button', { name: 'Install Havisu PDF' })).toHaveCount(0);
  await older.context.close();
});

test('a warmed standalone workspace processes documents offline without storing them', async ({
  page,
  context,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }),
  );
  const source = await PDFDocument.create();
  source.addPage().drawText('Private fixture');
  const bytes = Buffer.from(await source.save());
  await page.goto('/tools/merge');
  await page
    .getByLabel('Choose files', { exact: true })
    .setInputFiles([
      pdfInput(bytes, 'private-install-a.pdf'),
      pdfInput(bytes, 'private-install-b.pdf'),
    ]);
  await finish(page);
  await page.getByRole('button', { name: /Adjust settings/ }).click();
  await context.setOffline(true);
  await expect(
    page.getByText('You’re offline. Previously loaded tools may still work.'),
  ).toBeVisible();
  const result = await finish(page);
  expect((await inspectPdf(result.bytes)).count).toBe(2);
  const stored = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    urls: (
      await Promise.all(
        (await caches.keys()).map(async (key) =>
          (await (await caches.open(key)).keys()).map((request) => request.url),
        ),
      )
    ).flat(),
  }));
  expect([stored.local, stored.session]).toEqual([0, 0]);
  expect(
    stored.urls.every((url) => !url.includes('private-install') && !url.endsWith('.pdf')),
  ).toBe(true);
  await context.setOffline(false);
});
