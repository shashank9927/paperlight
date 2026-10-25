import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument, PDFName, rgb } from 'pdf-lib';
import { unzipSync } from 'fflate';
import { makeFixtures, inspectPdf } from '../fixtures';
import { independentPdf, pixelBounds } from '../independent';
import { openTool, finish, pdfInput } from './helpers';
import { mkdir } from 'node:fs/promises';
let f: Awaited<ReturnType<typeof makeFixtures>>;
test.beforeAll(async () => {
  f = await makeFixtures();
});
test('split modes: custom groups, fixed counts, and byte-bounded files', async ({ page }) => {
  await openTool(page, 'split', pdfInput(f.pdf));
  await page.getByLabel('Split mode').selectOption('ranges');
  await page.getByLabel('Page groups').fill('2;1,3');
  let result = await finish(page);
  let entries = Object.values(unzipSync(result.bytes));
  expect((await inspectPdf(entries[0])).pages[0].text).toContain('BETA');
  expect((await inspectPdf(entries[1])).count).toBe(2);
  await page.getByRole('button', { name: /Adjust settings/ }).click();
  await page.getByLabel('Split mode').selectOption('fixed');
  await page.getByLabel('Pages per file').fill('2');
  result = await finish(page);
  entries = Object.values(unzipSync(result.bytes));
  expect(entries).toHaveLength(2);
  await page.getByRole('button', { name: /Adjust settings/ }).click();
  await page.getByLabel('Split mode').selectOption('size');
  await page.getByLabel('Maximum file size (KiB)').fill('800');
  result = await finish(page);
  entries = result.name.endsWith('.zip') ? Object.values(unzipSync(result.bytes)) : [result.bytes];
  expect(entries.every((bytes) => bytes.length <= 800 * 1024)).toBe(true);
});
test('batch compression preserves text and reports each file', async ({ page }) => {
  await openTool(page, 'compress', [pdfInput(f.pdf, 'one.pdf'), pdfInput(f.tiny, 'two.pdf')]);
  await page.getByRole('button', { name: /Optimize embedded images/ }).click();
  await page.getByLabel('Compression level').selectOption('50');
  const output = await finish(page);
  const entries = Object.values(unzipSync(output.bytes));
  expect(entries).toHaveLength(2);
  expect((await inspectPdf(entries[0])).pages[0].text).toContain('ALPHA');
  expect(entries[0].length).toBeLessThan(f.pdf.length);
  await expect(page.locator('.batch-status li')).toHaveCount(2);
});
test('organize inserts blank and imported pages with undo and redo', async ({ page }) => {
  await openTool(page, 'organize', [pdfInput(f.pdf, 'one.pdf'), pdfInput(f.tiny, 'two.pdf')]);
  await page.getByRole('button', { name: 'Add blank page' }).click();
  await expect(page.locator('.page-grid .page-card')).toHaveCount(5);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.page-grid .page-card')).toHaveCount(4);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.locator('.page-grid .page-card')).toHaveCount(5);
  const result = await inspectPdf((await finish(page)).bytes);
  expect(result.count).toBe(5);
  expect(result.pages[3].text).toContain('GAMMA');
  expect(result.pages[4].text.trim()).toBe('');
});
test('batch rotation and image-to-PDF separate output retain order and orientation', async ({
  page,
}) => {
  await openTool(page, 'rotate', [pdfInput(f.pdf, 'one.pdf'), pdfInput(f.tiny, 'two.pdf')]);
  await page.getByRole('button', { name: 'Reset all', exact: true }).click();
  await page
    .getByLabel('Active document', { exact: true })
    .selectOption({ label: 'two.pdf · 1 pages' });
  await page.getByRole('button', { name: 'Rotate document', exact: true }).click();
  let result = await finish(page);
  const pdfs = Object.values(unzipSync(result.bytes));
  expect((await inspectPdf(pdfs[0])).pages[0].rotation).toBe(0);
  expect((await inspectPdf(pdfs[1])).pages[0].rotation).toBe(90);
  await openTool(page, 'images-to-pdf', [
    { name: 'one.png', mimeType: 'image/png', buffer: f.png },
    { name: 'two.webp', mimeType: 'image/webp', buffer: f.webp },
  ]);
  await page.getByRole('button', { name: 'Rotate one.png', exact: true }).click();
  const preview = page.locator('.file-card').first().locator('.page-preview');
  await expect(preview.locator('img')).toBeVisible();
  const bounds = await preview.boundingBox();
  const imageBounds = await preview.locator('img').boundingBox();
  expect(Math.abs(bounds!.width - imageBounds!.width)).toBeLessThan(3);
  expect(Math.abs(bounds!.height - imageBounds!.height)).toBeLessThan(3);
  await page.getByLabel('PDF output').selectOption('separate');
  await page.getByLabel('Page size').selectOption('original');
  result = await finish(page);
  const images = Object.values(unzipSync(result.bytes));
  expect(images).toHaveLength(2);
  expect((await inspectPdf(images[0])).pages[0].view).toEqual([0, 0, 480, 360]);
});
test('extracts embedded artwork instead of rasterizing the full page', async ({ page }) => {
  await openTool(page, 'pdf-to-images', pdfInput(f.pdf));
  await page.getByLabel('Conversion mode').selectOption('extract');
  const result = await finish(page);
  expect(result.name).toContain('-image-001.png');
  const dimensions = await page.evaluate(async (bytes) => {
    const image = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
    const size = [image.width, image.height];
    image.close();
    return size;
  }, Array.from(result.bytes));
  expect(dimensions).toEqual([480, 640]);
});
test('image watermark accepts static SVG and underlay respects opaque content', async ({
  page,
}, info) => {
  const document = await PDFDocument.create();
  document.addPage([400, 500]);
  document
    .addPage([400, 500])
    .drawRectangle({ x: 0, y: 0, width: 400, height: 500, color: rgb(1, 1, 1) });
  await openTool(page, 'watermark', pdfInput(Buffer.from(await document.save())));
  await page.getByLabel('Watermark type').selectOption('image');
  await page.getByLabel('Watermark image').setInputFiles({
    name: 'logo.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="#ff0000"/></svg>',
    ),
  });
  await expect(page.getByText('Artwork ready.')).toBeVisible();
  await page.getByLabel('Opacity', { exact: true }).fill('1');
  await page.getByLabel('Text rotation').fill('0');
  await page.getByLabel('Watermark layer').selectOption('below');
  const result = await finish(page);
  const first = await independentPdf(
      result.bytes,
      info.outputPath('underlay-one.pdf'),
      undefined,
      1,
    ),
    second = await independentPdf(result.bytes, info.outputPath('underlay-two.pdf'), undefined, 2);
  expect(
    (await pixelBounds(first.render!, (r, g, b) => r > 200 && g < 40 && b < 40)).count,
  ).toBeGreaterThan(100);
  expect((await pixelBounds(second.render!, (r, g, b) => r > 200 && g < 40 && b < 40)).count).toBe(
    0,
  );
});
test('page-number templates, cover exclusion, fonts and facing pages export correctly', async ({
  page,
}) => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 4; i++) doc.addPage([400, 500]);
  await openTool(page, 'page-numbers', pdfInput(Buffer.from(await doc.save())));
  await page.getByLabel('First page is a cover').check();
  await page.getByLabel('Facing pages', { exact: true }).check();
  await page.getByLabel('Number style').selectOption('custom');
  await page.getByLabel('Number template').fill('{n}/{p}/{r}/{rf}');
  await page.getByLabel('Start numbering at').fill('8');
  await page.getByText('Typography & appearance', { exact: true }).click();
  await page.getByLabel('Font family').selectOption('serif');
  await page.getByLabel('Bold', { exact: true }).check();
  const result = await inspectPdf((await finish(page)).bytes);
  expect(result.pages.map((p) => p.text.trim())).toEqual(['', '8/4/3/10', '9/4/3/10', '10/4/3/10']);
});
test('advanced protection supports permissions-only encryption and owner credentials', async ({
  page,
}) => {
  await openTool(page, 'protect', pdfInput(f.pdf));
  await page.getByText('Advanced protection', { exact: true }).click();
  await page.getByLabel('Enable permission controls').check();
  await page.getByLabel('Require an opening password').uncheck();
  await page.getByLabel('Permissions password', { exact: true }).fill('owner-only');
  await page.getByLabel('Confirm permissions password').fill('owner-only');
  await page.getByLabel('Allow printing').uncheck();
  await page.getByLabel('Allow copying').uncheck();
  const result = await finish(page);
  expect(new TextDecoder('latin1').decode(result.bytes)).toContain('/AESV3');
  expect((await inspectPdf(result.bytes, '')).count).toBe(3);
  expect((await inspectPdf(result.bytes, 'owner-only')).count).toBe(3);
});
test('sign fields have independent page targets, placement, duplication and history', async ({
  page,
}) => {
  await openTool(page, 'sign', pdfInput(f.pdf));
  await page.getByLabel('Field type').selectOption('name');
  await page.getByRole('button', { name: 'Add field', exact: true }).click();
  await page.getByLabel('Field text', { exact: true }).fill('Alex Morgan');
  await page.getByLabel('Field pages').fill('1');
  await page.getByLabel('Horizontal (%)').fill('25');
  await page.getByRole('button', { name: 'Duplicate field' }).click();
  await page.getByLabel('Field pages').fill('2');
  await page.getByLabel('Field text', { exact: true }).fill('Second signature');
  await page.getByLabel('Field rotation').fill('25');
  await page.getByRole('button', { name: 'Undo field change' }).click();
  await expect(page.getByLabel('Field rotation')).toHaveValue('0');
  await page.getByRole('button', { name: 'Redo field change' }).click();
  const result = await inspectPdf((await finish(page)).bytes);
  expect(result.pages[0].text).toContain('Alex Morgan');
  expect(result.pages[1].text).toContain('Second signature');
  expect(result.pages[2].text).not.toContain('Alex Morgan');
});
test('artwork rejects active SVG without requesting external resources', async ({ page }) => {
  await openTool(page, 'watermark', pdfInput(f.tiny));
  await page.getByLabel('Watermark type').selectOption('image');
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(new URL(page.url()).origin) && !r.url().startsWith('blob:'))
      external.push(r.url());
  });
  await page.getByLabel('Watermark image').setInputFiles({
    name: 'unsafe.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><image href="https://invalid.example/private"/><script>alert(1)</script></svg>',
    ),
  });
  await expect(page.getByRole('alert')).toContainText('static shapes');
  await page.getByLabel('Watermark image').setInputFiles({
    name: 'stylesheet.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<?xml-stylesheet href="https://invalid.example/private"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    ),
  });
  await expect(page.getByRole('alert')).toContainText('processing instructions');
  expect(external).toEqual([]);
});
test('themes remain accessible and responsive, and persist only appearance', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await mkdir('.cache/redesign', { recursive: true });
  for (const theme of ['dark', 'light']) {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/');
      const themeButton = page.getByRole('button', {
        name: `Switch to ${theme} theme`,
      });
      if ((await page.locator('html').getAttribute('data-theme')) !== theme) {
        await themeButton.click();
      }
      // Contrast is evaluated at the settled theme; the dedicated motion test
      // observes the transition itself in the same browser event as the click.
      await expect(page.locator('html')).not.toHaveClass(/theme-changing/);
      await expect(page.locator('.header-right select')).toHaveCount(0);
      await expect(page.locator('.tool-card')).toHaveCount(12);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const report = await new AxeBuilder({ page }).analyze();
      expect(
        report.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      ).toEqual([]);
      await page.screenshot({
        path: info.outputPath('home-' + theme + '-' + width + '.png'),
        fullPage: true,
      });
      await page.goto('/tools/watermark');
      await expect(page.locator('.dropzone')).toBeVisible();
      if (width <= 800) await page.getByRole('button', { name: 'Settings & export' }).click();
      const workspace = await new AxeBuilder({ page }).analyze();
      expect(
        workspace.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      ).toEqual([]);
      await page.screenshot({
        path: info.outputPath('workspace-' + theme + '-' + width + '.png'),
        fullPage: true,
      });
    }
  }
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['paperlight-theme']);
  await page.evaluate(() => localStorage.setItem('paperlight-theme', 'system'));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const themeToggle = page.getByRole('button', { name: 'Switch to dark theme' });
  await themeToggle.focus();
  await expect(themeToggle).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('paperlight-theme'))).toBe('dark');
  const focusedToggle = page.getByRole('button', { name: 'Switch to light theme' });
  await expect(focusedToggle).toBeFocused();
  await expect(focusedToggle).toHaveCSS('outline-style', 'solid');
  await expect(focusedToggle).toHaveCSS('outline-width', '2px');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light theme' }).focus();
  await page.keyboard.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('paperlight-theme'))).toBe('light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('image extraction preserves transparency, deduplicates repeated artwork, and decodes inline images and masks', async ({
  page,
}) => {
  const doc = await PDFDocument.create();
  const p = doc.addPage([400, 500]);
  const image = await doc.embedPng(f.transparent);
  p.drawImage(image, { x: 0, y: 0, width: 180, height: 80 });
  p.drawImage(image, { x: 0, y: 100, width: 180, height: 80 });
  const mask = doc.context.register(
    doc.context.flateStream(new Uint8Array(8), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: 8,
      Height: 8,
      ImageMask: true,
      BitsPerComponent: 1,
      Decode: [0, 1],
    }),
  );
  p.node.setXObject(PDFName.of('TestMask'), mask);
  const prefix = new TextEncoder().encode(
    'q 50 0 0 50 200 100 cm /TestMask Do Q\nq 10 0 0 10 300 300 cm BI /W 2 /H 1 /CS /RGB /BPC 8 ID ',
  );
  const suffix = new TextEncoder().encode(' EI Q');
  const content = new Uint8Array(prefix.length + 6 + suffix.length);
  content.set(prefix);
  content.set([255, 0, 0, 0, 255, 0], prefix.length);
  content.set(suffix, prefix.length + 6);
  p.node.addContentStream(doc.context.register(doc.context.flateStream(content)));
  await openTool(page, 'pdf-to-images', pdfInput(Buffer.from(await doc.save())));
  await page.getByLabel('Conversion mode').selectOption('extract');
  const entries = Object.values(unzipSync((await finish(page)).bytes));
  expect(entries).toHaveLength(3);
  const descriptions = await page.evaluate(
    async (inputs) =>
      Promise.all(
        inputs.map(async (bytes) => {
          const image = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
          const canvas = new OffscreenCanvas(image.width, image.height);
          const c = canvas.getContext('2d')!;
          c.drawImage(image, 0, 0);
          const pixels = c.getImageData(0, 0, image.width, image.height).data;
          const result = {
            width: image.width,
            height: image.height,
            alpha: pixels[3],
            first: Array.from(pixels.slice(0, 8)),
          };
          image.close();
          return result;
        }),
      ),
    entries.map((e) => Array.from(e)),
  );
  expect(descriptions.find((d) => d.width === 180)?.alpha).toBe(0);
  expect(descriptions.find((d) => d.width === 8)?.alpha).toBe(255);
  expect(descriptions.find((d) => d.width === 2)?.first).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
});

test('merge alphabetical order and file rotations reach the actual output', async ({ page }) => {
  await openTool(page, 'merge', [pdfInput(f.pdf, 'z-last.pdf'), pdfInput(f.tiny, 'a-first.pdf')]);
  await page.getByRole('button', { name: 'Sort A–Z', exact: true }).click();
  await page.getByRole('button', { name: 'Rotate a-first.pdf', exact: true }).click();
  const report = await inspectPdf((await finish(page)).bytes);
  expect(report.count).toBe(4);
  expect(report.pages[0].rotation).toBe(90);
  expect(report.pages[1].text).toContain('ALPHA');
});

test('batch unlock asks for each distinct password and exports only unencrypted documents', async ({
  page,
}) => {
  const encrypted: Uint8Array[] = [];
  for (const [i, input] of [f.pdf, f.tiny].entries()) {
    await openTool(page, 'protect', pdfInput(input));
    await page.getByLabel('New password', { exact: true }).fill(`batch-${i}`);
    await page.getByLabel('Confirm password', { exact: true }).fill(`batch-${i}`);
    encrypted.push((await finish(page)).bytes);
  }
  await page.goto('/tools/unlock');
  await page
    .getByLabel('Choose files', { exact: true })
    .setInputFiles(encrypted.map((bytes, i) => pdfInput(Buffer.from(bytes), `locked-${i}.pdf`)));
  for (let i = 0; i < 2; i++) {
    await expect(page.getByRole('dialog')).toContainText(`locked-${i}.pdf`);
    await page.getByLabel('Current PDF password').fill(`batch-${i}`);
    await page.getByRole('button', { name: /Open PDF locally/ }).click();
  }
  await expect(page.locator('.process-button')).toBeEnabled();
  const outputs = Object.values(unzipSync((await finish(page)).bytes));
  expect(outputs).toHaveLength(2);
  expect((await inspectPdf(outputs[0])).count).toBe(3);
  expect((await inspectPdf(outputs[1])).count).toBe(1);
  await expect(page.locator('.batch-status li')).toHaveCount(2);
});
