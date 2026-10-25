import { test, expect } from '@playwright/test';
import { PDFArray, PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { mediaPdf, formPdf, layeredPdf } from '../compatibility-fixtures';
import { openTool, finish, pdfInput } from './helpers';
import { independentPdf, pixelBounds } from '../independent';

test('merge accepts embedded media and preserves all payload and annotation associations', async ({
  page,
}, info) => {
  const bytes = Buffer.from(await mediaPdf());
  await openTool(page, 'merge', [pdfInput(bytes, 'one.pdf'), pdfInput(bytes, 'two.pdf')]);
  const result = await finish(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
  const report = await independentPdf(result.bytes, info.outputPath('media.pdf'));
  expect(report.count).toBe(4);
  expect(report.embeddedFiles).toHaveLength(2);
  expect(report.media?.map((media) => media.page)).toEqual([0, 2]);
  expect(report.preservation?.tags.valid).toBe(true);
});
test('merge keeps colliding form fields independent and organize duplicates retain editable widgets', async ({
  page,
}, info) => {
  await openTool(page, 'merge', [
    pdfInput(Buffer.from(await formPdf('Alice')), 'alice.pdf'),
    pdfInput(Buffer.from(await formPdf('Bob')), 'bob.pdf'),
  ]);
  const result = await finish(page);
  const report = await independentPdf(result.bytes, info.outputPath('forms.pdf'));
  expect(report.fields['person.name']).toBe('Alice');
  expect(report.fields['pl-2-person.name']).toBe('Bob');
  await openTool(page, 'organize', pdfInput(Buffer.from(await formPdf('Alice'))));
  await page.getByLabel('Duplicate page 1', { exact: true }).click();
  await page.getByLabel('Remove page 3', { exact: true }).click();
  const duplicate = await finish(page);
  const document = await PDFDocument.load(duplicate.bytes);
  expect(document.getForm().getTextField('person.name').getText()).toBe('Alice');
  const other = document.getForm().getTextField('pl-1-copy-2-person.name');
  other.setText('Bob');
  expect(document.getForm().getTextField('person.name').getText()).toBe('Alice');
  const n = PDFName.of;
  const widgets = document.getPages().map((page) =>
    page.node
      .lookup(n('Annots'), PDFArray)
      .asArray()
      .filter((ref) => document.context.lookup(ref, PDFDict).get(n('Subtype')) === n('Widget')),
  );
  expect(widgets[0][0]).not.toBe(widgets[1][0]);
});
test('layered documents retain their default visibility through merge and page extraction', async ({
  page,
}, info) => {
  const bytes = Buffer.from(await layeredPdf());
  await openTool(page, 'merge', [pdfInput(bytes, 'one.pdf'), pdfInput(bytes, 'two.pdf')]);
  const result = await finish(page);
  const report = await independentPdf(result.bytes, info.outputPath('layers.pdf'));
  expect(report.layers).toEqual({ groups: 4, defaultOff: 2, configurations: 2 });
  expect((await pixelBounds(report.render!, (r, g, b) => r > 180 && g < 80 && b < 80)).count).toBe(
    0,
  );
  expect(
    (await pixelBounds(report.render!, (r, g, b) => b > 180 && r < 80 && g < 80)).count,
  ).toBeGreaterThan(6000);
  await openTool(page, 'split', pdfInput(Buffer.from(result.bytes)));
  await page.getByLabel('Pages', { exact: true }).fill('2');
  const extracted = await finish(page);
  expect((await independentPdf(extracted.bytes, info.outputPath('layer-selected.pdf'))).count).toBe(
    1,
  );
});
