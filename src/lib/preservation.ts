import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import type { ProcessingJob } from './types';
import { MAX_OBJECTS, MAX_IMAGE_PIXELS } from './limits';

export function checkDocument(document: PDFDocument, job: ProcessingJob) {
  const name = (s: string) => PDFName.of(s);
  const has = (dict: PDFDict, key: string) => dict.has(name(key));
  const objects = document.context.enumerateIndirectObjects();
  if (objects.length > MAX_OBJECTS)
    throw new Error('This PDF exceeds the 100,000 object safety limit. Use a smaller document.');
  const assembly = ['merge', 'split', 'organize'].includes(job.tool);
  const content = ['watermark', 'page-numbers', 'sign'].includes(job.tool);
  const raster =
    job.tool === 'pdf-to-images' ||
    (job.tool === 'compress' && job.options.compression !== 'lossless');
  const unsupported = new Set<string>();
  const catalog = document.catalog;
  const names = catalog.lookupMaybe(name('Names'), PDFDict);
  if (assembly) {
    for (const [key, label] of [
      ['AcroForm', 'interactive forms (including duplicate field names)'],
      ['Outlines', 'bookmarks'],
      ['StructTreeRoot', 'accessibility tags'],
      ['Collection', 'portfolios'],
      ['AF', 'associated attachments'],
      ['Dests', 'named destinations'],
      ['OCProperties', 'optional-content layers'],
      ['Threads', 'article threads'],
      ['OpenAction', 'document open actions'],
      ['AA', 'document actions'],
    ])
      if (has(catalog, key)) unsupported.add(label);
    if (names)
      for (const key of ['EmbeddedFiles', 'Dests', 'JavaScript'])
        if (has(names, key))
          unsupported.add(
            key === 'Dests'
              ? 'named destinations'
              : key === 'JavaScript'
                ? 'document scripts'
                : 'attachments',
          );
  }
  if (content && has(catalog, 'StructTreeRoot'))
    unsupported.add('accessibility tags for added content');
  const form = catalog.lookupMaybe(name('AcroForm'), PDFDict);
  if ((content || raster) && form && has(form, 'XFA')) unsupported.add('XFA forms');
  const pending = objects.map(([, object]) => object);
  const seen = new Set<object>();
  while (pending.length) {
    const object = pending.pop()!;
    if (seen.has(object)) continue;
    seen.add(object);
    if (seen.size > MAX_OBJECTS)
      throw new Error('This PDF exceeds the 100,000 object safety limit. Use a smaller document.');
    if (object instanceof PDFArray) {
      pending.push(...object.asArray());
      continue;
    }
    const dict =
      object instanceof PDFRawStream ? object.dict : object instanceof PDFDict ? object : undefined;
    if (!dict) continue;
    // Inline action dictionaries are as consequential as indirect objects.
    pending.push(...dict.values());
    if (assembly) {
      if (dict.get(name('Subtype'))?.toString() === '/Widget')
        unsupported.add('interactive forms (including duplicate field names)');
      if (has(dict, 'Dest') || dict.get(name('S'))?.toString() === '/GoTo')
        unsupported.add('internal links (destinations may be removed or duplicated)');
      if (has(dict, 'FS') || has(dict, 'EF')) unsupported.add('attachments');
    }
    if (dict.get(name('Subtype'))?.toString() === '/Image') {
      const w = dict.lookupMaybe(name('Width'), PDFNumber)?.asNumber() || 0;
      const h = dict.lookupMaybe(name('Height'), PDFNumber)?.asNumber() || 0;
      if (raster && (!w || !h || w * h > MAX_IMAGE_PIXELS))
        unsupported.add('embedded images above the 16 megapixel decode limit');
    }
  }
  for (const page of document.getPages()) {
    if (page.node.has(name('UserUnit'))) {
      const unit = page.node.lookupMaybe(name('UserUnit'), PDFNumber)?.asNumber();
      if ((content || raster) && unit !== 1) unsupported.add('non-default PDF UserUnit');
    }
    const annots = page.node.lookupMaybe(name('Annots'), PDFArray);
    if (annots && annots.size() > 10000) unsupported.add('more than 10,000 annotations per page');
  }
  if (unsupported.size)
    throw new Error(
      `This operation cannot safely preserve: ${[...unsupported].join('; ')}. Choose another tool or use a PDF editor that supports these features. Your original is unchanged.`,
    );
}
