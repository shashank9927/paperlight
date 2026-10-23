import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { writeFile } from 'node:fs/promises';
import { makeFixtures, inspectPdf } from '../fixtures';
import { openTool, finish, pdfInput, requireRaster } from './helpers';

test('compression corpus: text, scan, mixed images and already optimized input stay honest', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await requireRaster(page);
  const fixtures = await makeFixtures();
  const text = await PDFDocument.create();
  const font = await text.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 6; i++) {
    const page = text.addPage([400, 500]);
    for (let line = 0; line < 15; line++)
      page.drawText(`Report page ${i + 1} / row ${line + 1}: selectable text`, {
        x: 20,
        y: 470 - line * 28,
        size: 12,
        font,
      });
  }
  const scanned = await PDFDocument.create();
  const image = await scanned.embedPng(fixtures.png);
  scanned.addPage([360, 480]).drawImage(image, { x: 0, y: 0, width: 360, height: 480 });
  const corpus = [
    { kind: 'text-heavy', bytes: Buffer.from(await text.save()) },
    { kind: 'scanned', bytes: Buffer.from(await scanned.save()) },
    { kind: 'image-heavy-mixed', bytes: fixtures.pdf },
    { kind: 'already-optimized', bytes: fixtures.tiny },
  ];
  const results = [];
  for (const fixture of corpus) {
    const before = await inspectPdf(fixture.bytes);
    for (const mode of ['lossless', 'image']) {
      await openTool(page, 'compress', pdfInput(fixture.bytes, `${fixture.kind}.pdf`));
      if (mode === 'image')
        await page.getByRole('button', { name: /Stronger compression/ }).click();
      const start = performance.now();
      const output = await finish(page);
      expect(output.bytes.length).toBeLessThanOrEqual(fixture.bytes.length);
      const after = await inspectPdf(output.bytes);
      expect(after.count).toBe(before.count);
      for (const [i, value] of after.pages.entries()) {
        expect(value.viewport.width).toBeCloseTo(before.pages[i].viewport.width, 2);
        expect(value.viewport.height).toBeCloseTo(before.pages[i].viewport.height, 2);
        if (mode === 'lossless') expect(value.text).toBe(before.pages[i].text);
      }
      const retainedOriginal = output.name.endsWith('-original.pdf');
      if (retainedOriginal) expect(Buffer.from(output.bytes).equals(fixture.bytes)).toBe(true);
      results.push({
        kind: fixture.kind,
        mode,
        pages: before.count,
        inputBytes: fixture.bytes.length,
        outputBytes: output.bytes.length,
        retainedOriginal,
        processingAndValidationMs: performance.now() - start,
      });
    }
  }
  await writeFile(
    info.outputPath('compression-corpus.json'),
    JSON.stringify({ synthetic: true, browser: info.project.name, results }, null, 2),
  );
});
