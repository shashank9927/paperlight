import { test, expect } from '@playwright/test';
import { featurePdf, rotatedBlank, centeredSignature, encryptedFixture } from '../feature-fixtures';
import { independentPdf, pixelBounds } from '../independent';
import { finish, openTool, pdfInput, requireRaster } from './helpers';
import { makeFixtures, inspectPdf } from '../fixtures';
import { readdirSync } from 'node:fs';
import { loadImage, createCanvas } from '@napi-rs/canvas';
import { unzipSync } from 'fflate';
test.use({ deviceScaleFactor: 2 });

test('password fields preserve all 127 allowed UTF-8 bytes, including confirmation and unlock', async ({
  page,
}) => {
  const password = 'a'.repeat(127);
  await openTool(page, 'protect', pdfInput(await featurePdf('plain')));
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await expect(page.getByLabel('Confirm password', { exact: true })).toHaveValue(password);
  const protectedFile = await finish(page);
  await page.goto('/tools/unlock');
  await page
    .getByLabel('Choose files', { exact: true })
    .setInputFiles(pdfInput(Buffer.from(protectedFile.bytes)));
  await page.getByLabel('Current PDF password').fill(password);
  await page.getByRole('button', { name: /Open PDF locally/ }).click();
  await expect(page.locator('.process-button')).toBeEnabled();
  expect((await inspectPdf((await finish(page)).bytes)).count).toBe(2);
});

for (const tool of ['watermark', 'page-numbers', 'sign']) {
  test(`${tool}: Poppler placement agrees at 0/90/180/270 with crop/media offsets, resized preview and DPR`, async ({
    page,
  }, info) => {
    await openTool(page, tool, pdfInput(await rotatedBlank()));
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.evaluate(() => {
      document.documentElement.style.zoom = '1.25';
    });
    await page.getByLabel('Pages', { exact: true }).fill('4,2,1,3');
    await page.getByRole('button', { name: 'Middle center', exact: true }).click();
    if (tool === 'sign') {
      await page.getByRole('button', { name: 'Upload', exact: true }).click();
      await page
        .getByLabel('Upload signature image')
        .setInputFiles({ name: 'mark.png', mimeType: 'image/png', buffer: centeredSignature() });
      await expect(page.getByAltText('Your signature placement')).toBeVisible();
    } else {
      await page.getByLabel('Text color').fill('#ff0000');
      if (tool === 'watermark') {
        await page.getByLabel('Watermark text').fill('MMMM');
        await page.getByLabel('Opacity', { exact: true }).fill('1');
      } else await page.getByLabel('Start numbering at').fill('8');
    }
    // Screenshot each preview for reproducible visual review. Output is rendered
    // independently and tested below, rather than just checking DOM positioning.
    for (let i = 0; i < 4; i++) {
      await page
        .locator('.focus-page-wrap .page-preview')
        .screenshot({ path: info.outputPath(`preview-${i}.png`) });
      if (i < 3) await page.getByRole('button', { name: 'Next page', exact: true }).click();
    }
    const result = await finish(page);
    for (let p = 1; p <= 4; p++) {
      const report = await independentPdf(
        result.bytes,
        info.outputPath(`quarter-turn-${p}.pdf`),
        undefined,
        p,
      );
      const bounds = await pixelBounds(report.render!, (r, g, b) => r > 160 && g < 100 && b < 100);
      expect(bounds.count).toBeGreaterThan(5);
      expect(Math.abs(bounds.x - 0.5)).toBeLessThan(0.025);
      expect(Math.abs(bounds.y - 0.5)).toBeLessThan(0.025);
      expect(report.pages[p - 1].rotation).toBe([0, 90, 180, 270][p - 1]);
    }
    if (tool === 'page-numbers')
      expect((await inspectPdf(result.bytes)).pages.map((p) => p.text.trim())).toEqual([
        '10',
        '9',
        '11',
        '8',
      ]);
  });
}

test('ordinary form extraction succeeds; password and Unicode errors preserve settings', async ({
  page,
}) => {
  await openTool(page, 'split', pdfInput(await featurePdf('form')));
  await page.getByLabel('Pages', { exact: true }).fill('2');
  const extracted = await finish(page);
  const report = await independentPdf(extracted.bytes, test.info().outputPath('form-selected.pdf'));
  expect(report.count).toBe(1);
  expect(report.fields).toEqual({});
  await expect(page.getByRole('alert')).toHaveCount(0);
  await openTool(page, 'protect', pdfInput(await featurePdf('plain')));
  const long = 'é'.repeat(64);
  await page.getByLabel('New password', { exact: true }).fill(long);
  await page.getByLabel('Confirm password', { exact: true }).fill(long);
  await page.locator('.process-button').click();
  await expect(page.getByRole('alert')).toContainText('127 UTF-8 bytes');
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue(long);
  await openTool(page, 'sign', pdfInput(await featurePdf('plain')));
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByLabel('Signature name').fill('資料');
  await expect(page.getByRole('alert')).toContainText('cannot display');
  await expect(page.getByAltText('Your signature placement')).toHaveCount(0);
});

test('PDF JavaScript and open actions never execute, and production assets have correct headers', async ({
  page,
  context,
  request,
}) => {
  const requests: string[] = [],
    diagnostics: string[] = [];
  context.on('request', (req) => {
    requests.push(req.url());
    expect(req.method()).toBe('GET');
    expect(req.postData()).toBeNull();
  });
  page.on('console', (msg) => diagnostics.push(msg.text()));
  page.on('pageerror', (err) => diagnostics.push(err.message));
  await page.addInitScript(() => {
    Object.assign(window, { policyViolations: [] as string[] });
    document.addEventListener('securitypolicyviolation', (event) => {
      (window as unknown as { policyViolations: string[] }).policyViolations.push(
        event.violatedDirective,
      );
    });
  });
  await openTool(page, 'rotate', pdfInput(await featurePdf('active'), 'DOCUMENT_SECRET.pdf'));
  await finish(page);
  expect(requests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  expect([...requests, ...diagnostics].join('\n')).not.toContain('DOCUMENT_SECRET');
  expect(
    await page.evaluate(
      () => (window as unknown as { policyViolations: string[] }).policyViolations,
    ),
  ).toEqual([]);
  const response = await request.get('/tools/merge');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-security-policy']).toContain(
    "script-src 'self' 'wasm-unsafe-eval'",
  );
  expect(response.headers()['content-security-policy']).not.toContain("'unsafe-eval'");
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['x-frame-options']).toBe('DENY');
  const wasm = readdirSync('dist/assets').find(
    (name) => name.startsWith('qpdf-') && name.endsWith('.wasm'),
  )!;
  expect((await request.get(`/assets/${wasm}`)).headers()['content-type']).toContain(
    'application/wasm',
  );
  expect((await request.get('/assets/missing.js')).status()).toBe(404);
  const moduleWorker = requests.find((url) => /pdf\.worker.*\.mjs$/.test(url));
  expect(moduleWorker).toBeTruthy();
  expect((await request.get(moduleWorker!)).headers()['content-type']).toContain('javascript');
  expect((await request.get('/pdf-assets/wasm/missing.wasm')).status()).toBe(404);
});

for (const tool of [
  'merge',
  'split',
  'compress',
  'organize',
  'rotate',
  'images-to-pdf',
  'pdf-to-images',
  'watermark',
  'page-numbers',
  'protect',
  'unlock',
  'sign',
]) {
  test(`${tool}: complete warm offline processing with worker/SW network observation`, async ({
    page,
    context,
  }) => {
    const fixture = await makeFixtures();
    if (['images-to-pdf', 'pdf-to-images'].includes(tool)) await requireRaster(page);
    const requests: string[] = [];
    context.on('request', (req) => {
      requests.push(req.url());
      expect(req.method()).toBe('GET');
      expect(req.postData()).toBeNull();
    });
    await openTool(
      page,
      tool,
      tool === 'images-to-pdf'
        ? [{ name: 'PRIVATE_FILENAME.webp', mimeType: 'image/webp', buffer: fixture.webp }]
        : tool === 'merge'
          ? [pdfInput(fixture.tiny, 'PRIVATE_FILENAME.pdf'), pdfInput(fixture.tiny, 'second.pdf')]
          : pdfInput(fixture.tiny, 'PRIVATE_FILENAME.pdf'),
    );
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await new Promise<void>((resolve) =>
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
            once: true,
          }),
        );
    });
    if (tool === 'protect') {
      await page.getByLabel('New password', { exact: true }).fill('PRIVATE_PASSWORD');
      await page.getByLabel('Confirm password', { exact: true }).fill('PRIVATE_PASSWORD');
    }
    if (tool === 'watermark') await page.getByLabel('Watermark text').fill('PRIVATE');
    if (tool === 'sign') {
      await page.getByRole('button', { name: 'Type', exact: true }).click();
      await page.getByLabel('Signature name').fill('Private Person');
      await expect(page.getByAltText('Your signature placement')).toBeVisible();
    }
    await finish(page);
    await page.getByRole('button', { name: /Adjust settings/ }).click();
    if (tool === 'protect') {
      await page.getByLabel('New password', { exact: true }).fill('PRIVATE_PASSWORD');
      await page.getByLabel('Confirm password', { exact: true }).fill('PRIVATE_PASSWORD');
    }
    await context.setOffline(true);
    const output = await finish(page);
    expect(output.bytes.length).toBeGreaterThan(0);
    const stored = await page.evaluate(async () => ({
      local: localStorage.length,
      session: sessionStorage.length,
      cookie: document.cookie,
      databases: typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [],
      urls: (
        await Promise.all(
          (await caches.keys()).map(async (key) =>
            (await (await caches.open(key)).keys()).map((r) => r.url),
          ),
        )
      ).flat(),
    }));
    expect(stored.local + stored.session).toBe(0);
    expect(stored.cookie).toBe('');
    expect(stored.databases).toHaveLength(0);
    for (const url of [...requests, ...stored.urls]) {
      const parsed = new URL(url);
      expect(parsed.origin).toBe(new URL(page.url()).origin);
      expect(parsed.search).toBe('');
      expect(url).not.toMatch(/PRIVATE_|Private%20Person/);
      if (parsed.protocol === 'blob:') {
        expect(stored.urls).not.toContain(url);
        continue;
      }
      expect(parsed.pathname).toMatch(
        /^\/(?:$|tools\/[a-z-]+$|assets\/[A-Za-z0-9_.-]+$|pdf-assets\/[a-f0-9]{12}\/(?:cmaps|wasm|standard_fonts|iccs)\/[A-Za-z0-9_.-]+$|sw.js$|favicon.svg$)/,
      );
    }
    await context.setOffline(false);
  });
}

test('image exports have correct pixel dimensions and a white JPEG background', async ({
  page,
}) => {
  await openTool(page, 'pdf-to-images', pdfInput(await rotatedBlank()));
  await page.getByLabel('Image format').selectOption('jpeg');
  await page.getByLabel('Resolution').selectOption('72');
  const result = await finish(page);
  const entries = Object.values(unzipSync(result.bytes));
  expect(entries).toHaveLength(4);
  for (const [i, data] of entries.entries()) {
    const image = await loadImage(Buffer.from(data));
    expect([image.width, image.height]).toEqual(i % 2 ? [400, 530] : [530, 400]);
    const canvas = createCanvas(image.width, image.height),
      ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    expect([...ctx.getImageData(0, 0, 1, 1).data]).toEqual([255, 255, 255, 255]);
  }
});

test('EXIF image orientation is honored before fit-to-image page sizing', async ({ page }) => {
  const fixture = await makeFixtures();
  const exif = Buffer.from(
    'ffe1002245786966000049492a0008000000010012010300010000000600000000000000',
    'hex',
  );
  const oriented = Buffer.concat([fixture.jpeg.subarray(0, 2), exif, fixture.jpeg.subarray(2)]);
  await openTool(page, 'images-to-pdf', {
    name: 'portrait.jpg',
    mimeType: 'image/jpeg',
    buffer: oriented,
  });
  await page.getByLabel('Page size', { exact: true }).selectOption('original');
  const result = await finish(page);
  const output = await inspectPdf(result.bytes);
  expect([output.pages[0].viewport.width, output.pages[0].viewport.height]).toEqual([480, 360]);
});

test('rapid reset and replacement cannot publish stale previews or results', async ({ page }) => {
  // A cached tiny job can finish before a pointer click settles. Keep the first
  // three real workers pending so reset reliably exercises termination. The
  // final job runs normally; active-processing cancellation is covered separately.
  await page.addInitScript(() => {
    const Original = Worker;
    const pending = new WeakSet<Worker>();
    let jobs = 0;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('processor.worker') && ++jobs <= 3) pending.add(this);
      }
      postMessage(message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
        if (pending.has(this)) return;
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  });
  const fixture = await makeFixtures();
  await openTool(page, 'pdf-to-images', pdfInput(fixture.pdf, 'old.pdf'));
  for (let i = 0; i < 3; i++) {
    await page.locator('.process-button').click();
    await page.getByRole('button', { name: 'Cancel processing', exact: true }).click();
    await expect
      .poll(
        () => page.workers().filter((worker) => worker.url().includes('processor.worker')).length,
      )
      .toBe(0);
    await page.getByRole('button', { name: 'Clear all files', exact: true }).click();
    await page
      .getByLabel('Choose files', { exact: true })
      .setInputFiles(pdfInput(fixture.tiny, `replacement-${i}.pdf`));
    await expect(page.locator('.process-button')).toBeEnabled();
    await expect(page.locator('.result-panel')).toHaveCount(0);
  }
  const result = await finish(page);
  expect(result.name).toContain('replacement-2-page-001.png');
  await page.getByRole('button', { name: /Start fresh/ }).click();
  await expect.poll(() => page.workers().length).toBe(0);
});

test('permissions-only encrypted input is detected and decrypted explicitly', async ({ page }) => {
  const bytes = await encryptedFixture(await featurePdf('plain'), '');
  await openTool(page, 'rotate', pdfInput(bytes));
  await expect(page.locator('.unlocked-note')).toContainText('unprotected');
  const result = await finish(page);
  const report = await independentPdf(
    result.bytes,
    test.info().outputPath('permissions-unlocked.pdf'),
  );
  expect(report.encrypted).toBe(false);
  expect(report.pages[0].text).toContain('FIRST');
});

for (const tool of ['watermark', 'page-numbers', 'sign']) {
  test(`${tool}: added content retains interactive form values and widget appearances`, async ({
    page,
  }) => {
    await openTool(page, tool, pdfInput(await featurePdf('form')));
    if (tool === 'watermark') await page.getByLabel('Watermark text').fill('FORM');
    if (tool === 'sign') {
      await page.getByRole('button', { name: 'Upload', exact: true }).click();
      await page
        .getByLabel('Upload signature image')
        .setInputFiles({ name: 'mark.png', mimeType: 'image/png', buffer: centeredSignature() });
      await expect(page.getByAltText('Your signature placement')).toBeVisible();
    }
    const result = await finish(page);
    const report = await independentPdf(result.bytes, test.info().outputPath('form-content.pdf'));
    expect(report.fields.customer).toBe('Alice');
    expect(
      report.pages[0].annotations.find((annotation) => annotation.type === '/Widget'),
    ).toMatchObject({ value: 'Alice', appearance: true });
  });
}
