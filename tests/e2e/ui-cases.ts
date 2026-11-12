import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadImage } from '@napi-rs/canvas';
import { unzipSync } from 'fflate';
import { tools, type ToolId } from '../../src/lib/tools';
import { independentlyEncrypted } from '../encryption-fixtures';
import { inspectPdf, renderPdf, type makeFixtures } from '../fixtures';
import { finish, pdfInput } from './helpers';

export const toolIds = tools.map(({ id }) => id);
export const auditPassword = 'local-audit-password';
export const longName = 'Résumé–資料–' + 'long-document-name-'.repeat(8) + '.pdf';

export function auditInput(tool: ToolId, f: Awaited<ReturnType<typeof makeFixtures>>) {
  if (tool === 'images-to-pdf')
    return { name: 'transparent.png', mimeType: 'image/png', buffer: f.transparent };
  if (tool === 'merge') return [pdfInput(f.pdf, longName), pdfInput(f.tiny, 'second.pdf')];
  if (tool === 'unlock')
    return pdfInput(independentlyEncrypted(f.tiny, 'AES-256', auditPassword), longName);
  return pdfInput(f.pdf, longName);
}

export async function openSettings(page: Page) {
  await expect(page.locator('.document-toolbar')).toBeVisible();
  const toggle = page.getByRole('button', { name: 'Settings & export', exact: true });
  if (await toggle.isVisible()) await toggle.click();
  await expect(page.locator('.process-button')).toBeEnabled();
}

export async function configureAuditJob(page: Page, tool: ToolId) {
  if (tool === 'unlock') {
    await page.getByLabel('Current PDF password').fill(auditPassword);
    await page.getByRole('button', { name: /Open PDF locally/ }).click();
  }
  await openSettings(page);
  const pages = page.getByLabel('Pages', { exact: true });
  switch (tool) {
    case 'merge':
      await page.getByRole('button', { name: 'Move second.pdf earlier' }).click();
      break;
    case 'split':
      await pages.fill('2,1');
      break;
    case 'organize':
      await page.getByRole('button', { name: 'Move page 2 earlier' }).click();
      await page.getByRole('button', { name: 'Duplicate page 1' }).click();
      await page.getByRole('button', { name: 'Remove page 4' }).click();
      break;
    case 'rotate':
      await pages.fill('2');
      await page.getByRole('button', { name: '270°', exact: true }).click();
      break;
    case 'images-to-pdf':
      await page.getByLabel('Page size', { exact: true }).selectOption('letter');
      await page.getByLabel('Orientation', { exact: true }).selectOption('landscape');
      break;
    case 'pdf-to-images':
      await pages.fill('1');
      await page.getByLabel('Resolution').selectOption('72');
      break;
    case 'watermark':
      await page.getByLabel('Watermark text').fill('UI AUDIT');
      await pages.fill('2');
      break;
    case 'page-numbers':
      await page.getByLabel('Start numbering at').fill('23');
      await pages.fill('2');
      break;
    case 'protect':
      await page.getByLabel('New password', { exact: true }).fill(auditPassword);
      await page.getByLabel('Confirm password', { exact: true }).fill(auditPassword);
      break;
    case 'sign':
      await page.getByRole('button', { name: 'Type', exact: true }).click();
      await page.getByLabel('Signature name').fill('Havisu Audit');
      await expect(page.getByAltText('Your signature placement')).toBeVisible();
      break;
  }
}

export async function downloadAuditJob(
  page: Page,
  tool: ToolId,
  fixtures: Awaited<ReturnType<typeof makeFixtures>>,
) {
  const output = await finish(page);
  if (tool === 'split') {
    expect(output.name).toMatch(/\.zip$/);
    const entries = Object.values(unzipSync(output.bytes));
    expect(entries).toHaveLength(2);
    const documents = await Promise.all(entries.map((bytes) => inspectPdf(bytes)));
    expect(documents.map(({ count }) => count)).toEqual([1, 1]);
    expect(documents[0].pages[0].text).toContain('BETA SECOND');
    expect(documents[1].pages[0].text).toContain('ALPHA FIRST');
    return;
  }
  if (tool === 'pdf-to-images') {
    expect(output.name).toMatch(/\.png$/);
    const image = await loadImage(Buffer.from(output.bytes));
    expect([image.width, image.height]).toEqual([400, 500]);
    return;
  }
  expect(output.name).toMatch(/\.pdf$/);
  if (tool === 'protect')
    await expect(inspectPdf(output.bytes, 'wrong-password')).rejects.toHaveProperty(
      'name',
      'PasswordException',
    );
  const pdf = await inspectPdf(output.bytes, tool === 'protect' ? auditPassword : undefined);
  if (tool === 'merge') {
    expect(pdf.count).toBe(4);
    expect(pdf.pages[0].text).toContain('GAMMA LAST');
  } else if (tool === 'images-to-pdf') {
    expect(pdf.count).toBe(1);
    expect(pdf.pages[0].view).toEqual([0, 0, 792, 612]);
  } else if (tool === 'unlock') {
    expect(pdf.count).toBe(1);
    expect(pdf.pages[0].text).toContain('GAMMA LAST');
  } else {
    expect(pdf.count).toBe(3);
    expect(pdf.pages[0].text).toContain(tool === 'organize' ? 'BETA SECOND' : 'ALPHA FIRST');
    if (tool === 'organize') expect(pdf.pages[1].text).toContain('BETA SECOND');
    if (tool === 'rotate') expect(pdf.pages.map(({ rotation }) => rotation)).toEqual([0, 0, 0]);
    if (tool === 'watermark') expect(pdf.pages[1].text).toContain('UI AUDIT');
    if (tool === 'page-numbers') expect(pdf.pages[1].text).toMatch(/\b23\b/);
    if (tool === 'compress') expect(output.bytes.length).toBeLessThanOrEqual(fixtures.pdf.length);
    if (tool === 'sign') {
      const [before, after] = await Promise.all([
        renderPdf(fixtures.pdf, 1),
        renderPdf(output.bytes, 1),
      ]);
      expect([after.width, after.height]).toEqual([before.width, before.height]);
      expect(after.data.some((value, index) => value !== before.data[index])).toBe(true);
    }
  }
}
