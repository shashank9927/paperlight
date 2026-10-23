import { test, expect } from '@playwright/test';
import { unzipSync } from 'fflate';
import { inspectPdf, makeFixtures, renderPdf } from '../fixtures';
import { finish, openTool, pdfInput, requireRaster } from './helpers';
let fixtures: Awaited<ReturnType<typeof makeFixtures>>;
test.beforeAll(async () => {
  fixtures = await makeFixtures();
});
test.beforeEach(async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    expect(request.method(), 'No file upload or processing HTTP requests').toBe('GET');
    expect(new URL(request.url()).origin, 'No third-party requests').toBe(new URL(baseURL!).origin);
    expect(request.url()).not.toContain('test-password');
  });
  Object.assign(page, { applicationErrors: errors });
});
test.afterEach(async ({ page }) => {
  expect((page as unknown as { applicationErrors: string[] }).applicationErrors).toEqual([]);
});

test('merge: file order controls determine the downloaded page order', async ({ page }) => {
  await openTool(page, 'merge', [
    pdfInput(fixtures.pdf, 'first.pdf'),
    pdfInput(fixtures.tiny, 'last.pdf'),
  ]);
  expect(page.workers().filter((worker) => worker.url().includes('pdf.worker'))).toHaveLength(1);
  await page.getByRole('button', { name: 'Preview first.pdf', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Next file page' }).click();
  await expect(
    page.getByRole('dialog').getByRole('img', { name: 'Preview of page 2', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByLabel('Move last.pdf earlier', { exact: true }).click();
  const output = await finish(page);
  const document = await inspectPdf(output.bytes);
  expect(document.count).toBe(4);
  expect(document.pages[0].text).toContain('GAMMA LAST');
  expect(document.pages[1].text).toContain('ALPHA FIRST');
});
test('split: selected ranges, reordered extraction, and individual PDFs in ZIP', async ({
  page,
}) => {
  await openTool(page, 'split', pdfInput(fixtures.pdf));
  await page.getByLabel('Pages', { exact: true }).fill('2, 1');
  const extracted = await finish(page);
  const document = await inspectPdf(extracted.bytes);
  expect(document.count).toBe(2);
  expect(document.pages[0].text).toContain('BETA SECOND');
  await page.getByRole('button', { name: /Adjust settings/ }).click();
  await page.getByLabel('Split mode').selectOption('individual');
  const individual = await finish(page);
  const entries = Object.values(unzipSync(individual.bytes));
  expect(entries).toHaveLength(2);
  for (const bytes of entries) expect((await inspectPdf(bytes)).count).toBe(1);
});
test('compress: text survives optimization and already optimized files never grow', async ({
  page,
}) => {
  await openTool(page, 'compress', pdfInput(fixtures.pdf));
  const output = await finish(page);
  const document = await inspectPdf(output.bytes);
  expect(output.bytes.length).toBeLessThanOrEqual(fixtures.pdf.length);
  expect(document.pages[0].text).toContain('ALPHA FIRST');
  expect(document.pages[1].rotation).toBe(90);
  await page.getByRole('button', { name: /Start fresh/ }).click();
  await page
    .getByLabel('Choose files', { exact: true })
    .setInputFiles(pdfInput(Buffer.from(output.bytes), 'optimized.pdf'));
  await expect(page.locator('.process-button')).toBeEnabled();
  const again = await finish(page);
  expect(again.bytes.length).toBeLessThanOrEqual(output.bytes.length);
});
test('compress: stronger mode renders pages into smaller images with an explicit warning', async ({
  page,
}) => {
  await requireRaster(page);
  await openTool(page, 'compress', pdfInput(fixtures.pdf));
  await page.getByRole('button', { name: /Stronger compression/ }).click();
  await expect(page.locator('.warning-note')).toContainText('Selectable text');
  const output = await finish(page);
  const document = await inspectPdf(output.bytes);
  expect(document.count).toBe(3);
  expect(document.pages[0].text).toBe('');
  expect(output.bytes.length).toBeLessThan(fixtures.pdf.length);
  const render = await renderPdf(output.bytes, 3);
  expect(render.data.some((value) => value < 200)).toBeTruthy();
});
test('organize: reorder, rotate, duplicate, remove, undo and extract selected pages', async ({
  page,
}) => {
  await openTool(page, 'organize', pdfInput(fixtures.pdf));
  await page.getByLabel('Move page 2 earlier', { exact: true }).click();
  await page.getByLabel('Rotate page 1', { exact: true }).click();
  await page.getByLabel('Duplicate page 2', { exact: true }).click();
  await page.getByLabel('Remove page 4', { exact: true }).click();
  const output = await finish(page);
  const document = await inspectPdf(output.bytes);
  expect(document.count).toBe(3);
  expect(document.pages[0].text).toContain('BETA SECOND');
  expect(document.pages[0].rotation).toBe(180);
  expect(document.pages[2].text).toContain('ALPHA FIRST');
  await page.getByRole('button', { name: /Adjust settings/ }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByLabel('Select page 1', { exact: true }).check();
  const extracted = await finish(page, 'Extract selected');
  expect((await inspectPdf(extracted.bytes)).count).toBe(1);
});
test('rotate: only selected pages change orientation', async ({ page }) => {
  await openTool(page, 'rotate', pdfInput(fixtures.pdf));
  await page.getByLabel('Pages', { exact: true }).fill('2');
  await page.getByRole('button', { name: '270°', exact: true }).click();
  const output = await finish(page);
  expect((await inspectPdf(output.bytes)).pages.map((item) => item.rotation)).toEqual([0, 0, 0]);
});
test('images to PDF: PNG transparency, JPEG and WebP, page settings and reordering', async ({
  page,
}) => {
  await openTool(page, 'images-to-pdf', [
    { name: 'transparent.png', mimeType: 'image/png', buffer: fixtures.transparent },
    { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: fixtures.jpeg },
    { name: 'photo.webp', mimeType: 'image/webp', buffer: fixtures.webp },
  ]);
  await page.getByLabel('Move photo.webp earlier', { exact: true }).click();
  await page.getByLabel('Page size', { exact: true }).selectOption('letter');
  await page.getByLabel('Orientation', { exact: true }).selectOption('landscape');
  await page.getByLabel('Image fit').selectOption('cover');
  const output = await finish(page);
  const document = await inspectPdf(output.bytes);
  expect(document.count).toBe(3);
  expect(document.pages[0].viewport.width).toBe(792);
  expect(document.pages[0].viewport.height).toBe(612);
  const rendered = await renderPdf(output.bytes, 1);
  expect(rendered.data[0]).toBe(255); // transparent input is placed on the white page, not a black background
});
test('PDF to images: selected, rotated pages export as readable PNG and JPEG', async ({ page }) => {
  await openTool(page, 'pdf-to-images', pdfInput(fixtures.pdf));
  await page.getByLabel('Pages', { exact: true }).fill('1-2');
  const pngs = await finish(page);
  const entries = Object.values(unzipSync(pngs.bytes));
  expect(entries).toHaveLength(2);
  for (const bytes of entries) expect([...bytes.slice(0, 4)]).toEqual([137, 80, 78, 71]);
  await page.getByRole('button', { name: /Adjust settings/ }).click();
  await page.getByLabel('Pages', { exact: true }).fill('2');
  await page.getByLabel('Image format').selectOption('jpeg');
  const jpeg = await finish(page);
  expect([...jpeg.bytes.slice(0, 3)]).toEqual([255, 216, 255]);
  expect(jpeg.name).toContain('-page-002.jpg');
});
test('watermark: selected page text is embedded on a cropped, rotated page', async ({ page }) => {
  await openTool(page, 'watermark', pdfInput(fixtures.pdf));
  await page.getByLabel('Watermark text').fill('Privé — DRAFT');
  await page.getByLabel('Pages', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Middle center', exact: true }).click();
  const output = await finish(page);
  const document = await inspectPdf(output.bytes);
  expect(document.pages[0].text).not.toContain('DRAFT');
  expect(document.pages[1].text).toContain('Privé — DRAFT');
  const rendered = await renderPdf(output.bytes, 2);
  expect(rendered.width).toBe(370);
  expect(rendered.height).toBe(550);
});
test('page numbers: starting number, style, placement and selected ranges', async ({ page }) => {
  await openTool(page, 'page-numbers', pdfInput(fixtures.pdf));
  await page.getByLabel('Pages', { exact: true }).fill('1-2');
  await page.getByLabel('Start numbering at').fill('4');
  await page.getByLabel('Number style').selectOption('page');
  await page.getByRole('button', { name: 'Bottom center', exact: true }).click();
  const output = await finish(page);
  const document = await inspectPdf(output.bytes);
  expect(document.pages[0].text).toContain('Page 4');
  expect(document.pages[1].text).toContain('Page 5');
  expect(document.pages[2].text).not.toContain('Page 6');
});
test('protect and unlock: AES-256, wrong and correct passwords, and a freely readable copy', async ({
  page,
}) => {
  const diagnostics: string[] = [];
  page.on('console', (message) => diagnostics.push(message.text()));
  await openTool(page, 'protect', pdfInput(fixtures.pdf));
  await page.locator('.process-button').click();
  await expect(page.getByRole('alert')).toContainText('both passwords match');
  await page.getByLabel('New password', { exact: true }).fill('test-password-✓');
  await page.getByLabel('Confirm password', { exact: true }).fill('different');
  await page.locator('.process-button').click();
  await expect(page.getByRole('alert')).toContainText('both passwords match');
  await page.getByLabel('Confirm password', { exact: true }).fill('test-password-✓');
  const encrypted = await finish(page);
  expect(new TextDecoder('latin1').decode(encrypted.bytes)).toContain('/AESV3');
  await expect(inspectPdf(encrypted.bytes)).rejects.toThrow();
  await expect(inspectPdf(encrypted.bytes, 'wrong')).rejects.toThrow();
  expect((await inspectPdf(encrypted.bytes, 'test-password-✓')).count).toBe(3);
  await page.goto('/tools/unlock');
  await page
    .getByLabel('Choose files', { exact: true })
    .setInputFiles(pdfInput(Buffer.from(encrypted.bytes), 'protected.pdf'));
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Current PDF password').fill('wrong');
  await page.getByRole('button', { name: /Open PDF locally/ }).click();
  await expect(page.getByRole('dialog')).toContainText('didn’t open');
  await page.getByLabel('Current PDF password').fill('test-password-✓');
  await page.getByRole('button', { name: /Open PDF locally/ }).click();
  await expect(page.locator('.process-button')).toBeEnabled();
  const unlocked = await finish(page);
  expect((await inspectPdf(unlocked.bytes)).pages[0].text).toContain('ALPHA FIRST');
  expect(diagnostics.join('\n')).not.toContain('test-password-✓');
});
test('sign: typed signature placement matches the preview on a rotated, cropped page', async ({
  page,
}) => {
  await openTool(page, 'sign', pdfInput(fixtures.pdf));
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByLabel('Signature name').fill('Alex Morgan');
  await page.getByLabel('Pages', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Next page' }).click();
  await page.getByRole('button', { name: 'Middle center', exact: true }).click();
  await expect(page.getByAltText('Your signature placement')).toBeVisible();
  const keyboardPreview = page.getByRole('img', { name: /Preview of page 2\. Arrow keys/ });
  await keyboardPreview.press('ArrowRight');
  await expect
    .poll(async () => {
      const bounds = await page.locator('.focus-page-wrap .page-preview').boundingBox();
      const image = await page.getByAltText('Your signature placement').boundingBox();
      return (image!.x + image!.width / 2 - bounds!.x) / bounds!.width;
    })
    .toBeCloseTo(0.51, 2);
  await keyboardPreview.press('ArrowLeft');
  await keyboardPreview.scrollIntoViewIfNeeded();
  const preview = await page.locator('.focus-page-wrap .page-preview').boundingBox();
  const signature = await page.getByAltText('Your signature placement').boundingBox();
  expect(
    Math.abs(signature!.x + signature!.width / 2 - (preview!.x + preview!.width / 2)),
  ).toBeLessThan(2);
  await page.mouse.move(signature!.x + signature!.width / 2, signature!.y + signature!.height / 2);
  await page.mouse.down();
  await page.mouse.move(preview!.x + preview!.width * 0.62, preview!.y + preview!.height * 0.6, {
    steps: 8,
  });
  await page.mouse.up();
  const positioned = await page.getByAltText('Your signature placement').boundingBox();
  expect((positioned!.x + positioned!.width / 2 - preview!.x) / preview!.width).toBeCloseTo(
    0.62,
    2,
  );
  expect((positioned!.y + positioned!.height / 2 - preview!.y) / preview!.height).toBeCloseTo(
    0.6,
    2,
  );
  const output = await finish(page);
  const before = await renderPdf(fixtures.pdf, 2);
  const after = await renderPdf(output.bytes, 2);
  let minX = Infinity,
    minY = Infinity,
    maxX = 0,
    maxY = 0,
    changed = 0;
  for (let y = 0; y < before.height; y++)
    for (let x = 0; x < before.width; x++) {
      const offset = (y * before.width + x) * 4;
      if (
        Math.max(
          ...[0, 1, 2].map((channel) =>
            Math.abs(before.data[offset + channel] - after.data[offset + channel]),
          ),
        ) > 30
      ) {
        changed++;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  expect(changed).toBeGreaterThan(50);
  expect((minX + maxX) / 2 / after.width).toBeCloseTo(0.62, 1);
  expect((minY + maxY) / 2 / after.height).toBeCloseTo(0.6, 1);
  expect((await inspectPdf(output.bytes)).count).toBe(3);
});
test('sign: drawn and uploaded signatures produce valid PDFs', async ({ page }) => {
  await openTool(page, 'sign', pdfInput(fixtures.tiny));
  const pad = page.getByLabel('Draw your signature');
  const box = await pad.boundingBox();
  await page.mouse.move(box!.x + 30, box!.y + 30);
  await page.mouse.down();
  await page.mouse.move(box!.x + 75, box!.y + 20, { steps: 8 });
  await page.mouse.move(box!.x + 110, box!.y + 55, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByAltText('Your signature placement')).toBeVisible();
  expect((await inspectPdf((await finish(page)).bytes)).count).toBe(1);
  await page.getByRole('button', { name: /Adjust settings/ }).click();
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await page
    .getByLabel('Upload signature image')
    .setInputFiles({ name: 'signature.png', mimeType: 'image/png', buffer: fixtures.transparent });
  await expect(page.getByAltText('Your signature placement')).toBeVisible();
  expect((await inspectPdf((await finish(page)).bytes)).count).toBe(1);
  await page.getByRole('button', { name: /Start fresh/ }).click();
  await page.getByLabel('Choose files', { exact: true }).setInputFiles(pdfInput(fixtures.tiny));
  await expect(page.locator('.process-button')).toBeEnabled();
  await expect(page.getByAltText('Your signature placement')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Draw', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.locator('.process-button').click();
  await expect(page.getByRole('alert')).toContainText('signature first');
});
