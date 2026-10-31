import {
  PDFDocument,
  rgb,
  degrees,
  pushGraphicsState,
  popGraphicsState,
  rectangle,
  clip,
  endPath,
  PDFArray,
  PDFName,
  PDFRawStream,
  PDFNumber,
  beginMarkedContent,
  endMarkedContent,
} from 'pdf-lib';
import type { PDFPage, PDFFont } from 'pdf-lib';
import { zipSync } from 'fflate';
import type {
  OutputFile,
  ProcessingJob,
  ProcessingResult,
  WorkerResponse,
  TextStyle,
  Annotation,
} from './types';
import { MAX_BYTES, MAX_PAGES } from './types';
import { parseRange, parsePageGroups, safeStem } from './utils';
import { selectedPages } from './page-selection';
import { viewToPdf, visibleSize, visibleBox, annotationPosition } from './geometry';
import { qpdfSession } from './qpdf';
import { checkDocument } from './preservation';
import { loadPdfSafely } from './safe-pdf';
import { validatePassword } from './password';
import { validateJob } from './validate-job';
import { validateKind } from './utils';
import {
  checkCanvas,
  checkOutput,
  imageDimensions,
  MAX_RASTER_PIXELS,
  saveBoundedPdf,
} from './limits';
import { fontAsset, numberText, numberPosition, tilePositions } from './annotation-style';
import { extractImages } from './extract-images';
import { assemblePdf, tagWriter, validateAssembly, outputIntentsSignature } from './assembly';
import type { AssemblyPage } from './assembly';
import { documentFeaturesSignature } from './document-features';
import { brand } from './brand';

type Progress = (message: Extract<WorkerResponse, { type: 'progress' }>) => void;
const pdfFile = (name: string, data: Uint8Array): OutputFile => ({
  name,
  data,
  type: 'application/pdf',
});
async function loadFont(document: PDFDocument, style: TextStyle): Promise<PDFFont> {
  const { default: fontkit } = await import('@pdf-lib/fontkit');
  document.registerFontkit(fontkit);
  const response = await fetch(fontAsset(style));
  if (!response.ok)
    throw new Error('The local annotation font could not be loaded. Please reload and try again.');
  return document.embedFont(await response.arrayBuffer(), { subset: true });
}

function drawText(
  page: PDFPage,
  text: string,
  font: PDFFont,
  options: TextStyle,
  size: number,
  opacity: number,
  angle = 0,
) {
  const box = visibleBox(page.getMediaBox(), page.getCropBox());
  const rotation = page.getRotation().angle;
  const view = visibleSize(box, rotation);
  const supported = font.getCharacterSet();
  if ([...text].some((char) => !supported.includes(char.codePointAt(0)!)))
    throw new Error(
      'This text contains characters that the bundled font cannot display. Try Latin, Greek, or Cyrillic characters.',
    );
  const width = font.widthOfTextAtSize(text, size);
  const theta = (angle * Math.PI) / 180;
  // Center the text baseline in the same visible coordinate system as the preview.
  const { x: cx, y: cy } = annotationPosition(options.x, options.y, view.width, view.height);
  const x = cx - (width / 2) * Math.cos(theta) - size * 0.34 * Math.sin(theta);
  const y = cy - (width / 2) * Math.sin(theta) + size * 0.34 * Math.cos(theta);
  const anchor = viewToPdf(x, y, box, rotation);
  const color = /^#[0-9a-f]{6}$/i.test(options.color) ? options.color : '#7560d5';
  const paint = (fill: string, dx = 0, dy = 0) =>
    page.drawText(text, {
      x: anchor.x + dx,
      y: anchor.y + dy,
      font,
      size,
      opacity,
      rotate: degrees(rotation - angle),
      color: rgb(
        parseInt(fill.slice(1, 3), 16) / 255,
        parseInt(fill.slice(3, 5), 16) / 255,
        parseInt(fill.slice(5, 7), 16) / 255,
      ),
    });
  if (options.background) {
    const bw = width + 4,
      bh = size + 4;
    const origin = viewToPdf(
      cx - (bw / 2) * Math.cos(theta) - (bh / 2) * Math.sin(theta),
      cy - (bw / 2) * Math.sin(theta) + (bh / 2) * Math.cos(theta),
      box,
      rotation,
    );
    const bg = options.background;
    page.drawRectangle({
      ...origin,
      width: width + 4,
      height: size + 4,
      rotate: degrees(rotation - angle),
      opacity,
      color: rgb(
        parseInt(bg.slice(1, 3), 16) / 255,
        parseInt(bg.slice(3, 5), 16) / 255,
        parseInt(bg.slice(5, 7), 16) / 255,
      ),
    });
  }
  if (options.shadow) {
    const shadow = viewToPdf(
      x + Math.cos(theta) - Math.sin(theta),
      y + Math.sin(theta) + Math.cos(theta),
      box,
      rotation,
    );
    paint('#777777', shadow.x - anchor.x, shadow.y - anchor.y);
  }
  paint(color);
}

function requireCanvas() {
  if (
    typeof OffscreenCanvas === 'undefined' ||
    typeof OffscreenCanvas.prototype.convertToBlob !== 'function' ||
    typeof createImageBitmap !== 'function'
  )
    throw new Error(
      'This tool needs OffscreenCanvas and image decoding in a worker. Update your browser or use a current desktop browser.',
    );
}

async function bitmap(file: Blob) {
  try {
    await imageDimensions(file);
    const image = await createImageBitmap(file, { imageOrientation: 'from-image' });
    if (image.width * image.height > 16_000_000) {
      image.close();
      throw new Error('Image dimensions exceed the safe limit.');
    }
    return image;
  } catch {
    throw new Error('An image could not be decoded. Try a smaller JPEG, PNG, or WebP file.');
  }
}
async function canvasImage(file: Blob, rotation = 0) {
  requireCanvas();
  const image = await bitmap(file);
  const turned = rotation % 180 !== 0;
  const originalWidth = turned ? image.height : image.width,
    originalHeight = turned ? image.width : image.height;
  const scale = Math.min(1, 4096 / Math.max(image.width, image.height));
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(originalWidth * scale)),
    Math.max(1, Math.round(originalHeight * scale)),
  );
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not create an image canvas.');
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(
    image,
    (-image.width * scale) / 2,
    (-image.height * scale) / 2,
    image.width * scale,
    image.height * scale,
  );
  image.close();
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const result = {
    data: new Uint8Array(await blob.arrayBuffer()),
    width: canvas.width,
    height: canvas.height,
    originalWidth,
    originalHeight,
  };
  canvas.width = canvas.height = 1;
  return result;
}

class OffscreenFactory {
  create(width: number, height: number) {
    checkCanvas(Math.ceil(width), Math.ceil(height));
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.ceil(width)),
      Math.max(1, Math.ceil(height)),
    );
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');
    return { canvas, context };
  }
  reset(target: { canvas: OffscreenCanvas }, width: number, height: number) {
    checkCanvas(width, height);
    target.canvas.width = width;
    target.canvas.height = height;
  }
  destroy(target: { canvas: OffscreenCanvas; context: OffscreenCanvasRenderingContext2D | null }) {
    target.canvas.width = 1;
    target.canvas.height = 1;
    target.context = null;
  }
}
class WorkerFilterFactory {
  private unsupported(): never {
    throw new Error(
      'This PDF uses a special color or transparency filter that cannot be exported safely in a background canvas. The original file has not been changed.',
    );
  }
  addFilter(maps: unknown) {
    return maps ? this.unsupported() : 'none';
  }
  addAlphaFilter(map: unknown) {
    return map ? this.unsupported() : 'none';
  }
  addLuminosityFilter() {
    return this.unsupported();
  }
  addHCMFilter() {
    return 'none';
  }
  addHighlightHCMFilter() {
    return 'none';
  }
  destroy() {
    /* No DOM or retained graphics resources. */
  }
}

async function rasterize(
  data: Uint8Array,
  job: ProcessingJob,
  progress: Progress,
  budget: { pixels: number },
): Promise<OutputFile[]> {
  requireCanvas();
  const { getPdfJs, pdfOptions } = await import('./pdf-assets');
  const pdfjs = await getPdfJs();
  const task = pdfjs.getDocument({
    data,
    ...pdfOptions(),
    useWorkerFetch: true,
    disableFontFace: true,
    useSystemFonts: false,
    CanvasFactory: OffscreenFactory,
    FilterFactory: WorkerFilterFactory,
  });
  try {
    const source = await task.promise;
    const indices =
      job.tool === 'compress'
        ? Array.from({ length: source.numPages }, (_, index) => index)
        : parseRange(job.options.range, source.numPages);
    const output = await PDFDocument.create();
    const files: OutputFile[] = [];
    let accumulated = 0,
      pixels = 0;
    for (let i = 0; i < indices.length; i++) {
      progress({
        type: 'progress',
        message: `Rendering page ${i + 1} of ${indices.length}`,
        completed: i,
        total: indices.length,
      });
      const page = await source.getPage(indices[i] + 1);
      const base = page.getViewport({ scale: 1 });
      const dpi =
        job.tool === 'compress'
          ? job.options.quality >= 0.8
            ? 150
            : job.options.quality >= 0.6
              ? 110
              : 80
          : job.options.dpi;
      const scale = Math.min(dpi / 72, 4096 / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = new OffscreenCanvas(
        Math.max(1, Math.ceil(viewport.width)),
        Math.max(1, Math.ceil(viewport.height)),
      );
      checkCanvas(canvas.width, canvas.height);
      pixels += canvas.width * canvas.height;
      budget.pixels += canvas.width * canvas.height;
      if (budget.pixels > MAX_RASTER_PIXELS)
        throw new Error('Raster work exceeds 120 megapixels per batch.');
      if (pixels > MAX_RASTER_PIXELS)
        throw new Error(
          'Raster output exceeds 120 megapixels per job. Choose fewer pages or lower resolution.',
        );
      const context = canvas.getContext('2d');
      if (!context)
        throw new Error(
          'Your browser does not support local canvas rendering. Try a current version of Chrome, Firefox, or Safari.',
        );
      await page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
        background: 'rgb(255,255,255)',
      }).promise;
      const format = job.tool === 'compress' ? 'jpeg' : job.options.imageFormat;
      const blob = await canvas.convertToBlob({
        type: `image/${format}`,
        quality: job.options.quality,
      });
      accumulated += blob.size;
      checkOutput(accumulated);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (job.tool === 'compress') {
        const image = await output.embedJpg(bytes);
        output
          .addPage([base.width, base.height])
          .drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });
      } else
        files.push({
          name: `${safeStem(job.sources[0].file.name)}-page-${String(indices[i] + 1).padStart(3, '0')}.${format === 'jpeg' ? 'jpg' : 'png'}`,
          data: bytes,
          type: blob.type,
        });
      canvas.width = 1;
      canvas.height = 1;
      page.cleanup();
    }
    return job.tool === 'compress'
      ? [
          pdfFile(
            `${safeStem(job.sources[0].file.name)}-compressed.pdf`,
            await saveBoundedPdf(output),
          ),
        ]
      : files;
  } finally {
    await task.destroy();
  }
}

async function processSingle(
  job: ProcessingJob,
  progress: Progress,
  pack: boolean,
  budget: { pages: number; pixels: number },
): Promise<ProcessingResult> {
  const { tool, options } = job;
  const sources = [...job.sources];
  validateJob(job);
  if (!sources.length) throw new Error('Choose a file to get started.');
  if (sources.reduce((total, source) => total + source.file.size, 0) > MAX_BYTES)
    throw new Error('Keep the combined input below 100 MB.');
  if (job.pages.length > MAX_PAGES) throw new Error('Choose no more than 500 pages per job.');
  progress({ type: 'progress', message: 'Preparing your private workspace…' });
  if (sources.length > MAX_PAGES) throw new Error('Choose no more than 500 pages per job.');
  const qpdf = qpdfSession();
  const runQpdf = (data: Uint8Array, args: string[]) => qpdf.run([data], args);
  try {
    const input: Uint8Array[] = [];
    const documents: PDFDocument[] = [];
    let inputPages = 0;
    for (let i = 0; i < sources.length; i++) {
      await validateKind(sources[i].file, tool === 'images-to-pdf');
      if (tool === 'images-to-pdf') continue;
      let bytes: Uint8Array = new Uint8Array(await sources[i].file.arrayBuffer());
      if (sources[i].password !== undefined) {
        validatePassword(sources[i].password!);
        progress({ type: 'progress', message: 'Opening your protected PDF locally…' });
        bytes = await runQpdf(bytes, [
          `--password=${sources[i].password}`,
          '--password-mode=unicode',
          '--decrypt',
          '/input.pdf',
          '/output.pdf',
        ]);
      }
      const document = await loadPdfSafely(bytes);
      inputPages += document.getPageCount();
      budget.pages += document.getPageCount();
      if (budget.pages > MAX_PAGES) throw new Error('Choose no more than 500 pages per batch.');
      if (!document.getPageCount() || inputPages > MAX_PAGES)
        throw new Error('Choose 1–500 pages per job.');
      if (tool !== 'organize' || job.pages.some((page) => page.sourceId === sources[i].id))
        checkDocument(document, { ...job, sources: [sources[i]] });
      if (
        (tool === 'compress' && options.compression === 'optimized') ||
        (tool === 'split' && options.splitMode === 'size' && options.splitCompress)
      ) {
        for (const [, object] of document.context.enumerateIndirectObjects())
          if (
            object instanceof PDFRawStream &&
            object.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')
          ) {
            const w = object.dict.lookupMaybe(PDFName.of('Width'), PDFNumber)?.asNumber() || 0,
              h = object.dict.lookupMaybe(PDFName.of('Height'), PDFNumber)?.asNumber() || 0;
            checkCanvas(w, h);
            budget.pixels += w * h;
            if (w * h > 16_000_000 || budget.pixels > MAX_RASTER_PIXELS)
              throw new Error(
                'Image optimization exceeds the safe pixel limit. Choose fewer images or use lossless optimization.',
              );
          }
      }
      documents.push(document);
      input.push(bytes);
    }
    const name = safeStem(sources[0].file.name);
    const rewriteAssembly = async (selection: AssemblyPage[], extra: string[] = []) => {
      const data = await assemblePdf(
        documents.map((document, i) => ({ document, name: sources[i].file.name })),
        selection,
        { navigation: tool === 'merge' ? 'all' : 'selected' },
      );
      const snapshot = async (bytes: Uint8Array) => {
        const document = await loadPdfSafely(bytes);
        return (
          validateAssembly(document) +
          '\n' +
          (await outputIntentsSignature(document)) +
          '\n' +
          (await documentFeaturesSignature(document))
        );
      };
      const before = await snapshot(data);
      const bytes = await runQpdf(data, ['/input.pdf', ...extra, '/output.pdf']);
      if ((await snapshot(bytes)) !== before)
        throw new Error(
          'The final PDF rewrite changed document navigation or accessibility structure. No output was returned.',
        );
      return bytes;
    };
    let files: OutputFile[] = [];
    let note: string | undefined;
    if (tool === 'unlock') {
      files = [
        pdfFile(
          `${name}-unlocked.pdf`,
          await runQpdf(input[0], ['--decrypt', '/input.pdf', '/output.pdf']),
        ),
      ];
      if (sources[0].password === undefined)
        note = 'This PDF already opens without a password. Your unprotected copy is ready.';
    } else if (tool === 'protect') {
      if (
        (!options.advancedProtection || options.restrictAccess) &&
        (!options.password || options.password !== options.confirmPassword)
      )
        throw new Error('Enter matching passwords to protect your PDF.');
      const userPassword =
        options.advancedProtection && !options.restrictAccess ? '' : options.password;
      validatePassword(userPassword, !!userPassword);
      if (
        options.advancedProtection &&
        (!options.ownerPassword || options.ownerPassword !== options.confirmOwnerPassword)
      )
        throw new Error('Enter matching permissions passwords.');
      if (options.advancedProtection) {
        validatePassword(options.ownerPassword, true);
        if (options.ownerPassword === userPassword)
          throw new Error('Use different opening and permissions passwords.');
      }
      const owner = options.advancedProtection
        ? options.ownerPassword
        : Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) =>
            value.toString(16).padStart(2, '0'),
          ).join('');
      files = [
        pdfFile(
          `${name}-protected.pdf`,
          await runQpdf(input[0], [
            '/input.pdf',
            '--password-mode=unicode',
            '--encrypt',
            `--user-password=${userPassword}`,
            `--owner-password=${owner}`,
            '--bits=256',
            ...(options.advancedProtection
              ? [
                  '--print=' + (options.permissions.print ? 'full' : 'none'),
                  '--extract=' + (options.permissions.copy ? 'y' : 'n'),
                  '--modify-other=' + (options.permissions.modify ? 'y' : 'n'),
                  '--annotate=' + (options.permissions.annotate ? 'y' : 'n'),
                  '--form=' + (options.permissions.forms ? 'y' : 'n'),
                  '--assemble=' + (options.permissions.assemble ? 'y' : 'n'),
                ]
              : []),
            '--',
            '/output.pdf',
          ]),
        ),
      ];
    } else if (tool === 'compress' && options.compression !== 'image') {
      progress({ type: 'progress', message: 'Optimizing PDF objects and streams…' });
      files = [
        pdfFile(
          `${name}-compressed.pdf`,
          await runQpdf(input[0], [
            '/input.pdf',
            '--object-streams=generate',
            '--recompress-flate',
            '--compression-level=9',
            ...(options.compression === 'optimized'
              ? ['--optimize-images', '--jpeg-quality=' + options.compressionLevel]
              : []),
            '/output.pdf',
          ]),
        ),
      ];
    } else if (tool === 'pdf-to-images' && options.exportMode === 'extract')
      files = await extractImages(input[0], job, progress, budget);
    else if (tool === 'pdf-to-images' || (tool === 'compress' && options.compression === 'image'))
      files = await rasterize(input[0], job, progress, budget);
    else if (tool === 'images-to-pdf') {
      const document = await PDFDocument.create();
      let pixels = 0,
        accumulated = 0;
      for (let i = 0; i < sources.length; i++) {
        progress({
          type: 'progress',
          message: `Adding image ${i + 1} of ${sources.length}`,
          completed: i,
          total: sources.length,
        });
        const dimensions = await imageDimensions(sources[i].file);
        pixels += dimensions.width * dimensions.height;
        budget.pixels += dimensions.width * dimensions.height;
        if (budget.pixels > MAX_RASTER_PIXELS)
          throw new Error('Image input exceeds 120 megapixels per batch.');
        if (pixels > MAX_RASTER_PIXELS)
          throw new Error('Image input exceeds 120 megapixels per job. Choose fewer images.');
        const png = await canvasImage(
          sources[i].file,
          job.pages.find((page) => page.sourceId === sources[i].id)?.rotation || 0,
        );
        accumulated += png.data.length;
        checkOutput(accumulated);
        const image = await document.embedPng(png.data);
        let width = options.pageSize === 'letter' ? 612 : 595.28;
        let height = options.pageSize === 'letter' ? 792 : 841.89;
        if (options.orientation === 'landscape') [width, height] = [height, width];
        if (options.pageSize === 'original') {
          width = png.originalWidth * 0.75;
          height = png.originalHeight * 0.75;
        }
        const page = document.addPage([width, height]);
        const margin = Math.min(options.margin, width / 4, height / 4);
        const availableW = width - 2 * margin;
        const availableH = height - 2 * margin;
        const ratio =
          options.fit === 'cover'
            ? Math.max(availableW / image.width, availableH / image.height)
            : Math.min(availableW / image.width, availableH / image.height);
        page.pushOperators(
          pushGraphicsState(),
          rectangle(margin, margin, availableW, availableH),
          clip(),
          endPath(),
        );
        page.drawImage(image, {
          x: (width - image.width * ratio) / 2,
          y: (height - image.height * ratio) / 2,
          width: image.width * ratio,
          height: image.height * ratio,
        });
        page.pushOperators(popGraphicsState());
      }
      files = [pdfFile(`${brand.downloadPrefix}-images.pdf`, await saveBoundedPdf(document))];
    } else {
      if (tool === 'organize' && job.pages.some((p) => p.blank)) {
        const blankDoc = await PDFDocument.create();
        const refs = job.pages.filter((p) => p.blank);
        for (const ref of refs) {
          const b = ref.blank!;
          if (
            !Number.isFinite(b.width) ||
            !Number.isFinite(b.height) ||
            b.width < 10 ||
            b.height < 10 ||
            b.width > 14400 ||
            b.height > 14400
          )
            throw new Error('Invalid blank page dimensions.');
          blankDoc.addPage([b.width, b.height]);
        }
        const id = 'paperlight-blank-internal';
        const bytes = await blankDoc.save();
        const blankSource = { id, file: new File([bytes as BlobPart], 'blank.pdf') };
        // Work on a private job copy so the caller's document references stay intact.
        sources.push(blankSource);
        documents.push(blankDoc);
        input.push(bytes);
        let i = 0;
        job = {
          ...job,
          pages: job.pages.map((ref) => (ref.blank ? { ...ref, sourceId: id, index: i++ } : ref)),
        };
      }
      const count = documents[0].getPageCount();
      const selected = selectedPages(tool, options, count);
      if (inputPages > MAX_PAGES) throw new Error('Choose no more than 500 pages per job.');
      if (tool === 'split' && options.splitMode !== 'extract') {
        const extract = async (indices: number[]) =>
          rewriteAssembly(
            indices.map((index) => ({ source: 0, index, rotation: 0 })),
            [
              ...(options.splitMode === 'size' && options.splitCompress
                ? [
                    '--object-streams=generate',
                    '--recompress-flate',
                    '--optimize-images',
                    '--jpeg-quality=75',
                  ]
                : []),
            ],
          );
        let groups: number[][] = [];
        if (options.splitMode === 'individual') groups = selected.map((i) => [i]);
        if (options.splitMode === 'ranges') {
          groups = parsePageGroups(options.groups, count);
          if (options.combineRanges) groups = [groups.flat()];
        }
        if (options.splitMode === 'fixed')
          for (let i = 0; i < selected.length; i += options.groupSize)
            groups.push(selected.slice(i, i + options.groupSize));
        const keep = (data: Uint8Array, label: string) => {
          checkOutput(files.reduce((sum, file) => sum + file.data.length, 0) + data.length);
          files.push(pdfFile(name + '-' + label + '.pdf', data));
        };
        if (options.splitMode === 'size') {
          const limit = Math.floor(options.maximumKiB * 1024);
          let group: number[] = [],
            accepted: Uint8Array | undefined;
          for (const index of selected) {
            const candidate = await extract([...group, index]);
            if (candidate.length <= limit) {
              group.push(index);
              accepted = candidate;
            } else {
              if (accepted) keep(accepted, 'part-' + String(files.length + 1).padStart(3, '0'));
              const single = await extract([index]);
              if (single.length > limit)
                throw new Error(
                  'Page ' +
                    (index + 1) +
                    ' alone exceeds the requested size (' +
                    single.length +
                    ' bytes). Increase the limit or enable compression.',
                );
              group = [index];
              accepted = single;
            }
            progress({
              type: 'progress',
              message: 'Measuring split files…',
              completed: index + 1,
              total: count,
            });
          }
          if (accepted) keep(accepted, 'part-' + String(files.length + 1).padStart(3, '0'));
        } else {
          if (groups.reduce((sum, g) => sum + g.length, 0) > MAX_PAGES)
            throw new Error('Split output exceeds 500 pages.');
          for (const [i, group] of groups.entries()) {
            progress({
              type: 'progress',
              message: 'Extracting group ' + (i + 1) + ' of ' + groups.length,
              completed: i,
              total: groups.length,
            });
            keep(
              await extract(group),
              options.splitMode === 'individual'
                ? 'page-' + String(group[0] + 1).padStart(3, '0')
                : 'part-' + String(i + 1).padStart(3, '0'),
            );
          }
        }
      } else if (tool === 'merge' || tool === 'organize' || tool === 'split') {
        const references =
          tool === 'merge'
            ? sources.flatMap((source, sourceIndex) =>
                documents[sourceIndex].getPages().map((_, index) => ({
                  source: sourceIndex,
                  index,
                  rotation:
                    job.pages.find((page) => page.sourceId === source.id && page.index === index)
                      ?.rotation || 0,
                })),
              )
            : tool === 'split'
              ? selected.map((index) => ({ source: 0, index, rotation: 0 }))
              : job.pages.map((page) => ({
                  source: sources.findIndex((source) => source.id === page.sourceId),
                  index: page.index,
                  rotation: page.rotation,
                }));
        files = [
          pdfFile(
            tool === 'merge'
              ? `${brand.downloadPrefix}-merged.pdf`
              : `${name}-${tool === 'split' ? 'extracted' : 'organized'}.pdf`,
            await rewriteAssembly(references),
          ),
        ];
      } else if (tool === 'rotate') {
        const args: string[] = ['/input.pdf'];
        const targeted = new Set(
          selected.filter((index) => {
            const page = documents[0].getPage(index);
            const size = visibleSize(
              visibleBox(page.getMediaBox(), page.getCropBox()),
              page.getRotation().angle,
            );
            return (
              options.rotationTarget === 'all' ||
              (options.rotationTarget === 'portrait'
                ? size.height >= size.width
                : size.width > size.height)
            );
          }),
        );
        for (let index = 0; index < count; index++) {
          const extra = job.pages.find((ref) => ref.index === index)?.rotation || 0;
          const angle = (extra + (targeted.has(index) ? options.angle : 0)) % 360;
          if (angle) args.push('--rotate=+' + angle + ':' + (index + 1));
        }
        args.push('/output.pdf');
        files = [pdfFile(name + '-rotated.pdf', await qpdf.run(input, args))];
      } else {
        const document = documents[0];
        const semanticMarks = tool === 'sign' ? tagWriter(document) : undefined;
        const fontCache = new Map<string, PDFFont>();
        const getFont = async (style: TextStyle) => {
          const key = fontAsset(style);
          let font = fontCache.get(key);
          if (!font) {
            font = await loadFont(document, style);
            fontCache.set(key, font);
          }
          return font;
        };
        const imageCache = new Map<Uint8Array, Awaited<ReturnType<PDFDocument['embedPng']>>>();
        const paintImage = async (
          page: PDFPage,
          data: Uint8Array,
          style: TextStyle,
          widthFraction: number,
        ) => {
          if (data.length > 10 * 1024 * 1024) throw new Error('Use artwork smaller than 10 MB.');
          await imageDimensions(new Blob([data as BlobPart]));
          let image = imageCache.get(data);
          if (!image) {
            image = await document.embedPng(data);
            imageCache.set(data, image);
          }
          const box = visibleBox(page.getMediaBox(), page.getCropBox()),
            rotation = page.getRotation().angle,
            view = visibleSize(box, rotation);
          const width = view.width * widthFraction,
            height = (width * image.height) / image.width;
          const center = annotationPosition(style.x, style.y, view.width, view.height),
            theta = (style.textAngle * Math.PI) / 180;
          const anchor = viewToPdf(
            center.x - (width / 2) * Math.cos(theta) - (height / 2) * Math.sin(theta),
            center.y - (width / 2) * Math.sin(theta) + (height / 2) * Math.cos(theta),
            box,
            rotation,
          );
          page.drawImage(image, {
            ...anchor,
            width,
            height,
            rotate: degrees(rotation - style.textAngle),
            opacity: style.opacity,
          });
        };
        const targets = selected.filter(
          (index) => tool !== 'page-numbers' || !options.coverPage || index !== 0,
        );
        if (tool === 'sign' && !options.signature && !options.annotations.length)
          throw new Error('Draw, type, or upload your signature first.');
        let annotationPlacements = 0;
        for (const [i, index] of (tool === 'sign' && options.annotations.length
          ? Array.from({ length: count }, (_, i) => i)
          : targets
        ).entries()) {
          const page = document.getPage(index);
          progress({
            type: 'progress',
            message: 'Updating page ' + (i + 1) + ' of ' + count,
            completed: i,
            total: count,
          });
          if (tool === 'watermark') {
            if (options.watermarkType === 'text' && !options.text.trim())
              throw new Error('Enter your watermark text.');
            if (options.watermarkType === 'image' && !options.watermarkImage)
              throw new Error('Choose a watermark image.');
            const original =
              options.layer === 'below'
                ? page.node.normalizedEntries().Contents?.asArray() || []
                : [];
            page.pushOperators(beginMarkedContent('Artifact'));
            for (const point of tilePositions(options.tile, options.x, options.y)) {
              const style = { ...options, ...point };
              if (options.watermarkType === 'image')
                await paintImage(page, options.watermarkImage!, style, options.watermarkWidth);
              else
                drawText(
                  page,
                  options.text,
                  await getFont(style),
                  style,
                  options.fontSize,
                  options.opacity,
                  options.textAngle,
                );
            }
            page.pushOperators(endMarkedContent());
            if (options.layer === 'below') {
              const contents = page.node.Contents();
              if (contents instanceof PDFArray) {
                const added = contents.asArray().filter((ref) => !original.includes(ref));
                page.node.set(
                  PDFName.of('Contents'),
                  document.context.obj([...added, ...original]),
                );
              }
            }
          } else if (tool === 'page-numbers') {
            page.pushOperators(beginMarkedContent('Artifact'));
            const box = visibleSize(
              visibleBox(page.getMediaBox(), page.getCropBox()),
              page.getRotation().angle,
            );
            const style = {
              ...options,
              ...numberPosition(options, index, box.width, box.height),
              textAngle: 0,
            };
            drawText(
              page,
              numberText(options, i, targets.length, count),
              await getFont(style),
              style,
              options.fontSize,
              options.opacity,
              0,
            );
            page.pushOperators(endMarkedContent());
          } else if (tool === 'sign') {
            const fields: Annotation[] = options.annotations.length
              ? options.annotations.filter((a) => parseRange(a.range, count).includes(index))
              : [
                  {
                    ...options,
                    id: 'legacy',
                    kind: 'signature',
                    range: options.range,
                    image: options.signature,
                    width: options.signatureWidth,
                    opacity: 1,
                    textAngle: 0,
                  },
                ];
            annotationPlacements += fields.length;
            if (annotationPlacements > 2000)
              throw new Error('Use no more than 2,000 total signature field placements.');
            for (const field of fields) {
              const mark = semanticMarks?.begin(
                page,
                field.image ? `Visual ${field.kind} mark` : field.text,
                !!field.image,
              );
              if (mark) page.pushOperators(mark);
              if (field.image) await paintImage(page, field.image, field, field.width);
              else {
                if (!field.text.trim())
                  throw new Error('Enter text or artwork for each signature field.');
                drawText(
                  page,
                  field.text,
                  await getFont(field),
                  field,
                  field.fontSize,
                  field.opacity,
                  field.textAngle,
                );
              }
              if (mark) page.pushOperators(endMarkedContent());
            }
          }
        }
        semanticMarks?.finish();
        if (document.catalog.has(PDFName.of('StructTreeRoot'))) validateAssembly(document);
        files = [
          pdfFile(
            `${name}-${tool === 'page-numbers' ? 'numbered' : tool === 'sign' ? 'signed' : 'watermarked'}.pdf`,
            await saveBoundedPdf(document),
          ),
        ];
      }
    }
    if (tool === 'compress' && files[0].data.length >= sources[0].file.size) {
      files = [
        pdfFile(`${name}-original.pdf`, new Uint8Array(await sources[0].file.arrayBuffer())),
      ];
      note =
        'This file is already well optimized. Compression did not make it smaller, so we kept the exact original, including any encryption.';
    }
    checkOutput(files.reduce((total, file) => total + file.data.length, 0));
    if (pack && files.length > 1) {
      progress({ type: 'progress', message: 'Packing your files into a ZIP…' });
      const packed: Record<string, Uint8Array> = {};
      files.forEach((file) => {
        packed[file.name] = file.data;
      });
      note = `${files.length} ${tool === 'split' ? 'PDFs' : 'images'} are included in your ZIP.`;
      files = [
        {
          name: `${name}-${tool === 'split' ? 'pages' : 'images'}.zip`,
          data: zipSync(packed, { level: 1 }),
          type: 'application/zip',
        },
      ];
    }
    checkOutput(files.reduce((total, file) => total + file.data.length, 0));
    return { files, note };
  } finally {
    qpdf.dispose();
  }
}

export async function processJob(
  job: ProcessingJob,
  progress: Progress = () => {},
): Promise<ProcessingResult> {
  validateJob(job);
  if (job.sources.reduce((n, s) => n + s.file.size, 0) > MAX_BYTES)
    throw new Error('Keep the combined input below 100 MB.');
  const budget = { pages: 0, pixels: 0 };
  const batch =
    job.sources.length > 1 &&
    !['merge', 'organize'].includes(job.tool) &&
    (job.tool !== 'images-to-pdf' || job.options.imageOutput === 'separate');
  if (!batch) return processSingle(job, progress, true, budget);
  const entries: NonNullable<ProcessingResult['entries']> = [],
    outputs: OutputFile[] = [];
  let bytes = 0;
  for (const [i, source] of job.sources.entries()) {
    progress({
      type: 'progress',
      message: 'Processing file ' + (i + 1) + ' of ' + job.sources.length,
      completed: i,
      total: job.sources.length,
    });
    try {
      const result = await processSingle(
        { ...job, sources: [source], pages: job.pages.filter((p) => p.sourceId === source.id) },
        () => {},
        false,
        budget,
      );
      const length = result.files.reduce((n, f) => n + f.data.length, 0);
      checkOutput(bytes + length);
      bytes += length;
      result.files.forEach((file) =>
        outputs.push({ ...file, name: String(i + 1).padStart(3, '0') + '-' + file.name }),
      );
      entries.push({
        name: source.file.name,
        status: 'success',
        message: result.note,
        inputBytes: source.file.size,
        outputBytes: length,
      });
    } catch (error) {
      entries.push({
        name: source.file.name,
        status: 'failed',
        message: error instanceof Error ? error.message : 'This file could not be processed.',
        inputBytes: source.file.size,
      });
    }
  }
  if (!outputs.length)
    return { files: [], entries, note: 'No files could be processed. Review the errors below.' };
  const failed = entries.filter((e) => e.status === 'failed').length;
  if (outputs.length === 1)
    return {
      files: outputs,
      entries,
      note: failed
        ? `Partial result: ${entries.length - failed} succeeded, ${failed} failed. The successful file is available below.`
        : 'One output file is available below.',
    };
  const packed = zipSync(Object.fromEntries(outputs.map((file) => [file.name, file.data])), {
    level: 1,
  });
  checkOutput(packed.length);
  return {
    files: [
      {
        name: brand.downloadPrefix + '-' + job.tool + (failed ? '-partial' : '') + '.zip',
        type: 'application/zip',
        data: packed,
      },
    ],
    entries,
    note: failed
      ? 'Partial result: ' +
        (entries.length - failed) +
        ' succeeded, ' +
        failed +
        ' failed. Only successful files are included.'
      : entries.length + ' files processed. Your results are included in the ZIP.',
  };
}
