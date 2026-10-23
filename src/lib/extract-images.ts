import type { ProcessingJob, OutputFile, WorkerResponse } from './types';
import { getPdfJs, pdfOptions } from './pdf-assets';
import { parseRange, safeStem } from './utils';
import { checkCanvas, checkOutput, MAX_RASTER_PIXELS } from './limits';
type Decoded = {
  width: number;
  height: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray | string;
  bitmap?: ImageBitmap;
};
export async function extractImages(
  data: Uint8Array,
  job: ProcessingJob,
  progress: (v: Extract<WorkerResponse, { type: 'progress' }>) => void,
  budget: { pixels: number },
): Promise<OutputFile[]> {
  if (typeof OffscreenCanvas === 'undefined')
    throw new Error('Image extraction requires a browser with background canvas support.');
  const pdfjs = await getPdfJs();
  const task = pdfjs.getDocument({
    data,
    ...pdfOptions(),
    useWorkerFetch: true,
    disableFontFace: true,
  });
  const files: OutputFile[] = [];
  let bytes = 0;
  try {
    const doc = await task.promise;
    const seen = new Set<string>();
    for (const index of parseRange(job.options.range, doc.numPages)) {
      const page = await doc.getPage(index + 1),
        ops = await page.getOperatorList();
      let sequence = 0;
      const resolve = async (value: unknown): Promise<Decoded> => {
        if (typeof value !== 'string') return value as Decoded;
        return new Promise((r) =>
          (value.startsWith('g_') ? page.commonObjs : page.objs).get(value, r),
        );
      };
      const save = async (
        value: unknown,
        mask = false,
        crop?: { x: number; y: number; w: number; h: number },
      ) => {
        const image = await resolve(value);
        if (!image) throw new Error('An embedded image could not be decoded.');
        const key =
          typeof value === 'string' ? (value.startsWith('g_') ? value : index + ':' + value) : '';
        if (key && seen.has(key)) return;
        if (key) seen.add(key);
        if (typeof image.data === 'string') {
          const decoded = await resolve(image.data);
          await save(decoded, mask, crop);
          return;
        }
        checkCanvas(image.width, image.height);
        if (image.width > 8192 || image.height > 8192 || image.width * image.height > 16_000_000)
          throw new Error('An extracted image exceeds the safe decode limit.');
        budget.pixels += image.width * image.height;
        if (budget.pixels > MAX_RASTER_PIXELS)
          throw new Error('Image extraction exceeds 120 megapixels per batch.');
        const canvas = new OffscreenCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Image canvas is unavailable.');
        try {
          if (image.bitmap) ctx.drawImage(image.bitmap, 0, 0);
          else {
            const input = image.data;
            if (!input) throw new Error('The PDF contains an unsupported image encoding.');
            const output = ctx.createImageData(image.width, image.height);
            const kind = image.kind || 1;
            for (let y = 0; y < image.height; y++)
              for (let x = 0; x < image.width; x++) {
                const i = y * image.width + x,
                  j = i * 4;
                if (kind === 3) {
                  output.data[j] = input[j];
                  output.data[j + 1] = input[j + 1];
                  output.data[j + 2] = input[j + 2];
                  output.data[j + 3] = input[j + 3];
                } else if (kind === 2) {
                  output.data[j] = input[i * 3];
                  output.data[j + 1] = input[i * 3 + 1];
                  output.data[j + 2] = input[i * 3 + 2];
                  output.data[j + 3] = 255;
                } else if (kind === 1) {
                  const bit =
                    (input[y * Math.ceil(image.width / 8) + (x >> 3)] >> (7 - (x & 7))) & 1;
                  output.data[j] = output.data[j + 1] = output.data[j + 2] = mask ? 0 : bit * 255;
                  output.data[j + 3] = mask ? (bit ? 0 : 255) : 255;
                } else throw new Error('The PDF contains an unsupported decoded image format.');
              }
            ctx.putImageData(output, 0, 0);
          }
          const w = crop?.w || canvas.width,
            h = crop?.h || canvas.height;
          const scale = Math.min(1, 4096 / Math.max(w, h));
          const target = new OffscreenCanvas(
            Math.max(1, Math.round(w * scale)),
            Math.max(1, Math.round(h * scale)),
          );
          try {
            const targetCtx = target.getContext('2d')!;
            if (job.options.imageFormat === 'jpeg') {
              targetCtx.fillStyle = '#fff';
              targetCtx.fillRect(0, 0, target.width, target.height);
            }
            targetCtx.drawImage(
              canvas,
              crop?.x || 0,
              crop?.y || 0,
              w,
              h,
              0,
              0,
              target.width,
              target.height,
            );
            const type = job.options.imageFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
            const blob = await target.convertToBlob({ type, quality: job.options.quality });
            const output = new Uint8Array(await blob.arrayBuffer());
            bytes += output.length;
            checkOutput(bytes);
            if (files.length >= 500)
              throw new Error('Extract no more than 500 images per job. Select fewer pages.');
            files.push({
              name:
                safeStem(job.sources[0].file.name) +
                '-page-' +
                String(index + 1).padStart(3, '0') +
                '-image-' +
                String(++sequence).padStart(3, '0') +
                (type === 'image/png' ? '.png' : '.jpg'),
              data: output,
              type,
            });
          } finally {
            target.width = target.height = 1;
          }
        } finally {
          canvas.width = canvas.height = 1;
        }
      };
      for (let i = 0; i < ops.fnArray.length; i++) {
        const op = ops.fnArray[i],
          args = ops.argsArray[i];
        if (
          op === pdfjs.OPS.paintImageXObject ||
          op === pdfjs.OPS.paintImageXObjectRepeat ||
          op === pdfjs.OPS.paintInlineImageXObject
        )
          await save(args[0]);
        else if (
          op === pdfjs.OPS.paintImageMaskXObject ||
          op === pdfjs.OPS.paintImageMaskXObjectRepeat
        )
          await save(args[0], true);
        else if (op === pdfjs.OPS.paintImageMaskXObjectGroup)
          for (const image of args[0]) await save(image, true);
        else if (op === pdfjs.OPS.paintInlineImageXObjectGroup)
          for (const crop of args[1]) await save(args[0], false, crop);
      }
      page.cleanup();
      progress({
        type: 'progress',
        message: 'Extracting embedded images…',
        completed: index + 1,
        total: doc.numPages,
      });
    }
    if (!files.length)
      throw new Error(
        'No embedded raster images were found on the selected pages. Use page rendering for text and vector artwork.',
      );
    return files;
  } finally {
    await task.destroy();
  }
}
