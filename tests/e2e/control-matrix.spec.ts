import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { loadImage } from '@napi-rs/canvas';
import { makeFixtures, inspectPdf, renderPdf } from '../fixtures';
import { independentPdf } from '../independent';
import { finish, openTool, pdfInput } from './helpers';

test('rotation controls: all angles orientation targets and reset reach the output', async ({
  page,
}) => {
  test.setTimeout(120000);
  const document = await PDFDocument.create();
  document.addPage([200, 300]);
  document.addPage([300, 200]);
  await openTool(page, 'rotate', pdfInput(Buffer.from(await document.save())));
  for (const [angle, target, expected] of [
    [90, 'all', [90, 90]],
    [180, 'portrait', [180, 0]],
    [270, 'landscape', [0, 270]],
  ] as const) {
    await page.getByRole('button', { name: `${angle}°`, exact: true }).click();
    await page.getByLabel('Target orientation', { exact: true }).selectOption(target);
    expect((await inspectPdf((await finish(page)).bytes)).pages.map((p) => p.rotation)).toEqual(
      expected,
    );
    await page.getByRole('button', { name: /Adjust settings/ }).click();
  }
  await page.getByRole('button', { name: 'Reset all', exact: true }).click();
  expect((await inspectPdf((await finish(page)).bytes)).pages.map((p) => p.rotation)).toEqual([
    0, 0,
  ]);
});

test('empty extraction is recoverable and does not fabricate an image download', async ({
  page,
}) => {
  const f = await makeFixtures();
  await openTool(page, 'pdf-to-images', pdfInput(f.tiny));
  await page.getByLabel('Conversion mode').selectOption('extract');
  await page.locator('.process-button').click();
  await expect(page.getByRole('alert')).toContainText(/no.*image/i);
  await expect(page.locator('.result-panel')).toHaveCount(0);
  await page.getByLabel('Conversion mode').selectOption('pages');
  expect((await finish(page)).name).toMatch(/\.png$/);
});

test('watermark appearance: fonts styles color opacity position and tiled repetition export visibly', async ({
  page,
}) => {
  test.setTimeout(120000);
  const document = await PDFDocument.create();
  document.addPage([400, 500]);
  await openTool(page, 'watermark', pdfInput(Buffer.from(await document.save())));
  await page.getByLabel('Watermark text', { exact: true }).fill('MARK');
  await page.getByLabel('Text size', { exact: true }).fill('20');
  await page.getByLabel('Text rotation', { exact: true }).fill('0');
  await page.getByLabel('Text color', { exact: true }).fill('#e63323');
  await page.getByText('Typography & appearance', { exact: true }).click();
  for (const [i, font] of ['sans', 'serif', 'mono', 'signature'].entries()) {
    await page.getByLabel('Font family', { exact: true }).selectOption(font);
    await page.getByLabel('Bold', { exact: true }).setChecked(i % 2 === 1);
    await page.getByLabel('Italic', { exact: true }).setChecked(i >= 2);
    await page.getByLabel('Text background', { exact: true }).setChecked(i >= 2);
    if (i >= 2) await page.getByLabel('Background color', { exact: true }).fill('#eeeeee');
    await page.getByLabel('Text shadow', { exact: true }).setChecked(i === 3);
    await page.getByLabel('Opacity', { exact: true }).fill(i % 2 ? '0.5' : '1');
    await page.getByLabel('Repeat as a tiled watermark').setChecked(i === 3);
    const output = (await finish(page)).bytes;
    const text = (await inspectPdf(output)).pages[0].text;
    expect(text.match(/MARK/g)?.length).toBe(i === 3 ? 18 : 1);
    const pixels = (await renderPdf(output, 1)).data;
    let colored = 0;
    for (let p = 0; p < pixels.length; p += 4) if (pixels[p] > pixels[p + 1] + 10) colored++;
    expect(colored).toBeGreaterThan(30);
    await page.getByRole('button', { name: /Adjust settings/ }).click();
  }
});

test('signature field types support independent ranges resize delete and repeat', async ({
  page,
}) => {
  test.setTimeout(120000);
  const document = await PDFDocument.create();
  document.addPage([400, 500]);
  document.addPage([400, 500]);
  const f = await makeFixtures();
  await openTool(page, 'sign', pdfInput(Buffer.from(await document.save())));
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await page
    .getByLabel('Upload signature image')
    .setInputFiles({ name: 'stamp.png', mimeType: 'image/png', buffer: f.transparent });
  await expect(page.getByAltText('Your signature placement')).toBeVisible();
  for (const [i, kind] of ['signature', 'initials', 'stamp', 'name', 'date', 'text'].entries()) {
    await page.getByLabel('Field type', { exact: true }).selectOption(kind);
    await page.getByRole('button', { name: 'Add field', exact: true }).click();
    await page.getByLabel('Field pages', { exact: true }).fill(i < 3 ? '1-2' : '2');
    await page.getByLabel('Horizontal (%)', { exact: true }).fill('50');
    await page.getByLabel('Vertical (%)', { exact: true }).fill(String(15 + i * 12));
    await page.getByLabel('Field width (%)', { exact: true }).fill('20');
    await page.getByLabel('Field rotation', { exact: true }).fill(i < 3 ? '15' : '0');
    await page.getByLabel('Field opacity', { exact: true }).fill('0.75');
    if (i >= 3) await page.getByLabel('Field text', { exact: true }).fill(`FIELD-${kind}`);
  }
  await page.getByRole('button', { name: 'Duplicate field', exact: true }).click();
  await page.getByRole('button', { name: 'Delete field', exact: true }).click();
  await expect(page.locator('.annotation-list button')).toHaveCount(6);
  const output = (await finish(page)).bytes;
  const result = await inspectPdf(output);
  expect(result.pages[0].text.trim()).toBe('');
  for (const kind of ['name', 'date', 'text'])
    expect(result.pages[1].text).toContain(`FIELD-${kind}`);
  const pixels = (await renderPdf(output, 1)).data;
  expect(pixels.some((v, i) => i % 4 !== 3 && v < 240)).toBe(true);
});

test('image page controls: pairwise size orientation margin fit and format combinations', async ({
  page,
}) => {
  test.setTimeout(120000);
  const f = await makeFixtures();
  const cases = [
    ['a4', 'portrait', 'contain', '0', 'png'],
    ['a4', 'landscape', 'cover', '72', 'jpeg'],
    ['letter', 'portrait', 'cover', '24', 'webp'],
    ['letter', 'landscape', 'contain', '0', 'png'],
    ['original', 'portrait', 'contain', '72', 'jpeg'],
    ['original', 'landscape', 'cover', '24', 'webp'],
  ] as const;
  for (const [size, orientation, fit, margin, format] of cases) {
    await openTool(page, 'images-to-pdf', {
      name: `source.${format}`,
      mimeType: `image/${format}`,
      buffer: f[format],
    });
    await page.getByLabel('Page size', { exact: true }).selectOption(size);
    if (size !== 'original')
      await page.getByLabel('Orientation', { exact: true }).selectOption(orientation);
    await page.getByLabel('Margins', { exact: true }).fill(margin);
    await page.getByLabel('Image fit', { exact: true }).selectOption(fit);
    const actual = (await inspectPdf((await finish(page)).bytes)).pages[0].view;
    let dimensions =
      size === 'original' ? [360, 480] : size === 'letter' ? [612, 792] : [595.28, 841.89];
    if (size !== 'original' && orientation === 'landscape') dimensions = dimensions.reverse();
    expect(actual.slice(2)).toEqual(dimensions);
  }
});

test('page rendering controls: every resolution and format produces the requested dimensions', async ({
  page,
}) => {
  test.setTimeout(120000);
  const f = await makeFixtures();
  await openTool(page, 'pdf-to-images', pdfInput(f.tiny));
  for (const dpi of [72, 144, 216]) {
    for (const format of ['png', 'jpeg']) {
      await page.getByLabel('Resolution', { exact: true }).selectOption(String(dpi));
      await page.getByLabel('Image format', { exact: true }).selectOption(format);
      if (format === 'jpeg')
        await page.getByLabel('Image quality', { exact: true }).fill(dpi === 72 ? '0.35' : '0.95');
      const out = await finish(page);
      const image = await loadImage(Buffer.from(out.bytes));
      expect([image.width, image.height]).toEqual([(200 * dpi) / 72, (300 * dpi) / 72]);
      expect(out.name).toMatch(format === 'jpeg' ? /\.jpg$/ : /\.png$/);
      await page.getByRole('button', { name: /Adjust settings/ }).click();
    }
  }
});

test('numbering controls: every style and font with cover range and appearance combinations', async ({
  page,
}) => {
  test.setTimeout(120000);
  const doc = await PDFDocument.create();
  for (let i = 0; i < 3; i++) doc.addPage([400, 500]);
  await openTool(page, 'page-numbers', pdfInput(Buffer.from(await doc.save())));
  await page.getByLabel('First page is a cover', { exact: true }).check();
  await page.getByLabel('Start numbering at', { exact: true }).fill('4');
  await page.getByText('Typography & appearance', { exact: true }).click();
  const cases = [
    ['number', 'sans', ['4', '5']],
    ['page', 'serif', ['Page 4', 'Page 5']],
    ['total', 'mono', ['4 / 5', '5 / 5']],
    ['custom', 'signature', ['4/3/2/5', '5/3/2/5']],
  ] as const;
  for (const [style, font, expected] of cases) {
    await page.getByLabel('Number style', { exact: true }).selectOption(style);
    await page.getByLabel('Font family', { exact: true }).selectOption(font);
    await page
      .getByLabel('Bold', { exact: true })
      .setChecked(style === 'page' || style === 'custom');
    await page
      .getByLabel('Italic', { exact: true })
      .setChecked(style === 'total' || style === 'custom');
    await page.getByLabel('Text shadow', { exact: true }).setChecked(style === 'total');
    await page.getByLabel('Text background', { exact: true }).setChecked(style === 'custom');
    await page.getByLabel('Facing pages', { exact: true }).setChecked(style === 'custom');
    if (style === 'custom')
      await page.getByLabel('Number template', { exact: true }).fill('{n}/{p}/{r}/{rf}');
    const out = await inspectPdf((await finish(page)).bytes);
    // A shadow intentionally draws the glyphs twice.
    expect(out.pages[0].text.trim()).toBe('');
    expected.forEach((text, i) =>
      expect(out.pages[i + 1].text.replace(/\s+/g, ' ')).toContain(text),
    );
    await page.getByRole('button', { name: /Adjust settings/ }).click();
  }
});

test('protection controls: each denied permission changes its own PDF permission bit', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const f = await makeFixtures();
  await openTool(page, 'protect', pdfInput(f.tiny));
  await page.getByText('Advanced protection', { exact: true }).click();
  await page.getByLabel('Enable permission controls').check();
  const permissions = [
    ['Allow printing', 4],
    ['Allow copying', 16],
    ['Allow content editing', 8],
    ['Allow comments', 32],
    ['Allow form filling', 256],
    ['Allow document assembly', 1024],
  ] as const;
  for (const [label, mask] of permissions) {
    await page.getByLabel('New password', { exact: true }).fill('opening');
    await page.getByLabel('Confirm password', { exact: true }).fill('opening');
    await page.getByLabel('Permissions password', { exact: true }).fill('owner');
    await page.getByLabel('Confirm permissions password', { exact: true }).fill('owner');
    for (const [other] of permissions)
      await page.getByLabel(other, { exact: true }).setChecked(other !== label);
    const out = await finish(page);
    const report = await independentPdf(
      out.bytes,
      info.outputPath(`permission-${mask}.pdf`),
      'opening',
    );
    expect(report.permissions! & mask).toBe(0);
    for (const [other, otherMask] of permissions)
      if (other !== label) expect(report.permissions! & otherMask).toBe(otherMask);
    await page.getByRole('button', { name: /Adjust settings/ }).click();
  }
});
