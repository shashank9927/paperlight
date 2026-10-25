import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

export interface IndependentReport {
  preservation?: {
    outlines: Array<{
      title: string;
      page: number | null;
      children: Array<{ title: string; page: number | null }>;
    }>;
    destinations: Array<{ name: string; page: number }>;
    internalLinks: Array<{ page: number; target: number }>;
    tags: {
      valid: boolean;
      pages: number[];
      alt: string[];
      languages: string[];
      ids: string[];
      roles: string[];
      classes: Array<{ owner: string; spaceAfter: number | null }>;
    };
  };
  count: number;
  encrypted: boolean;
  permissions: number | null;
  fields: Record<string, string>;
  pages: Array<{
    text: string;
    rotation: number;
    media: number[];
    crop: number[];
    annotations: Array<{ type: string; uri: string; value: string; appearance: boolean }>;
  }>;
  popplerText?: string;
  render?: string;
}
export async function independentPdf(
  bytes: Uint8Array,
  path: string,
  password?: string,
  page = 1,
  allowEmptyPassword = false,
): Promise<IndependentReport> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  const result = spawnSync(
    process.env.PAPERLIGHT_PYTHON || 'python',
    [resolve('scripts/verify-pdf.py')],
    {
      input: JSON.stringify({ path, password, page, allowEmptyPassword }),
      encoding: 'utf8',
      timeout: 30000,
    },
  );
  if (result.status !== 0)
    throw new Error(`Independent PDF validation failed: ${result.stderr || result.error}`);
  const report = JSON.parse(result.stdout) as IndependentReport;
  await writeFile(`${path}.json`, JSON.stringify(report, null, 2));
  return report;
}
export async function pixelBounds(
  path: string,
  predicate: (r: number, g: number, b: number) => boolean,
) {
  const image = await loadImage(path);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const bytes = context.getImageData(0, 0, image.width, image.height).data;
  let minX = Infinity,
    minY = Infinity,
    maxX = 0,
    maxY = 0,
    count = 0;
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4;
      if (predicate(bytes[i], bytes[i + 1], bytes[i + 2])) {
        count++;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  return {
    x: (minX + maxX) / 2 / image.width,
    y: (minY + maxY) / 2 / image.height,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    count,
  };
}
