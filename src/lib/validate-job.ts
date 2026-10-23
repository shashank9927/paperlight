import type { ProcessingJob } from './types';

export function validateJob(job: ProcessingJob) {
  const o = job.options;
  const values: [unknown, readonly unknown[]][] = [
    [o.splitMode, ['extract', 'individual', 'ranges', 'fixed', 'size']],
    [o.compression, ['lossless', 'optimized', 'image']],
    [o.rotationTarget, ['all', 'portrait', 'landscape']],
    [o.pageSize, ['a4', 'letter', 'original']],
    [o.orientation, ['portrait', 'landscape']],
    [o.fit, ['contain', 'cover']],
    [o.imageOutput, ['combined', 'separate']],
    [o.imageFormat, ['png', 'jpeg']],
    [o.exportMode, ['pages', 'extract']],
    [o.watermarkType, ['text', 'image']],
    [o.layer, ['above', 'below']],
    [o.numberStyle, ['number', 'page', 'total', 'custom']],
  ];
  if (values.some(([value, allowed]) => !allowed.includes(value)))
    throw new Error('Choose supported tool settings.');
  if (
    [
      o.bold,
      o.italic,
      o.shadow,
      o.tile,
      o.coverPage,
      o.facingPages,
      o.combineRanges,
      o.splitCompress,
      o.advancedProtection,
      o.restrictAccess,
      ...Object.values(o.permissions),
    ].some((v) => typeof v !== 'boolean')
  )
    throw new Error('Invalid option value.');
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
  if (['split', 'sign'].includes(job.tool) && job.sources.length !== 1)
    throw new Error('This tool works with one PDF at a time.');
  if (o.text.length > 2000 || o.range.length > 4000)
    throw new Error('Use a shorter watermark or page range.');
  if (
    !['sans', 'serif', 'mono', 'signature'].includes(o.fontFamily) ||
    !/^#[0-9a-f]{6}$/i.test(o.color) ||
    (o.background && !/^#[0-9a-f]{6}$/i.test(o.background))
  )
    throw new Error('Choose a supported font and color.');
  if (
    !Number.isInteger(o.groupSize) ||
    !finite(o.groupSize, 1, 500) ||
    !finite(o.maximumKiB, 1, 131072) ||
    o.groups.length > 4000
  )
    throw new Error('Check the split group size and maximum file size.');
  if (
    !finite(o.numberMargin, 0, 144) ||
    !finite(o.watermarkWidth, 0.01, 1) ||
    o.numberTemplate.length > 500 ||
    ![90, 75, 50].includes(o.compressionLevel)
  )
    throw new Error('A setting is outside its supported range.');
  if (o.annotations.length > 500) throw new Error('Use no more than 500 signature fields.');
  let assetBytes = (o.watermarkImage?.length || 0) + (o.signature?.length || 0);
  for (const a of o.annotations) {
    assetBytes += a.image?.length || 0;
    if (
      !finite(a.x, 0, 1) ||
      !finite(a.y, 0, 1) ||
      !finite(a.width, 0.01, 1) ||
      !finite(a.fontSize, 1, 200) ||
      !finite(a.opacity, 0, 1) ||
      !finite(a.textAngle, -180, 180) ||
      a.text.length > 2000 ||
      a.range.length > 4000 ||
      !/^#[0-9a-f]{6}$/i.test(a.color) ||
      (a.background && !/^#[0-9a-f]{6}$/i.test(a.background)) ||
      !['signature', 'initials', 'name', 'date', 'text', 'stamp'].includes(a.kind) ||
      !['sans', 'serif', 'mono', 'signature'].includes(a.fontFamily)
    )
      throw new Error('Check the signature field settings.');
  }
  if (assetBytes > 32 * 1024 * 1024)
    throw new Error('Signature and watermark artwork exceeds the 32 MB asset limit.');
}
