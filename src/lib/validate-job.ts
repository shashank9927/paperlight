import type { ProcessingJob } from './types';

export function validateJob(job: ProcessingJob) {
  const o = job.options;
  const finite = (value: number, min: number, max: number) =>
    Number.isFinite(value) && value >= min && value <= max;
  if (
    !finite(o.x, 0, 1) ||
    !finite(o.y, 0, 1) ||
    !finite(o.fontSize, 1, 200) ||
    !finite(o.opacity, 0, 1) ||
    !finite(o.quality, 0.1, 1) ||
    !finite(o.dpi, 36, 216) ||
    !finite(o.signatureWidth, 0.01, 1) ||
    !finite(o.margin, 0, 72) ||
    !finite(o.textAngle, -180, 180) ||
    ![0, 90, 180, 270].includes(o.angle) ||
    !Number.isInteger(o.startNumber) ||
    !finite(o.startNumber, 1, 99999) ||
    job.pages.some((p) => !Number.isInteger(p.rotation) || p.rotation < 0 || p.rotation % 90 !== 0)
  )
    throw new Error(
      'One of the settings is outside the supported range. Check page positions, sizes and rotation.',
    );
  if (!['merge', 'images-to-pdf'].includes(job.tool) && job.sources.length !== 1)
    throw new Error('This tool works with one PDF at a time.');
  if (o.text.length > 2000 || o.range.length > 4000)
    throw new Error('Use a shorter watermark or page range.');
}
