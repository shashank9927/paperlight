import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import type { ProcessingJob } from './types';
import { MAX_OBJECTS, MAX_IMAGE_PIXELS } from './limits';
import { PreservationError } from './assembly';

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
    (job.tool === 'compress' && job.options.compression === 'image');
  const unsupported = new Set<string>();
  const catalog = document.catalog;
  const names = catalog.lookupMaybe(name('Names'), PDFDict);
  if (assembly) {
    const supportedCatalog = new Set([
      'Type',
      'Pages',
      'Names',
      'Dests',
      'Outlines',
      'StructTreeRoot',
      'MarkInfo',
      'Lang',
      'Metadata',
      'PageLabels',
      'PageMode',
      'PageLayout',
      'ViewerPreferences',
      'Version',
      'Extensions',
      'OutputIntents',
      'URI',
    ]);
    const blockedCatalog = new Set([
      'AcroForm',
      'Collection',
      'AF',
      'OCProperties',
      'Threads',
      'OpenAction',
      'AA',
      'Perms',
    ]);
    for (const key of catalog.keys())
      if (!supportedCatalog.has(key.decodeText()) && !blockedCatalog.has(key.decodeText()))
        unsupported.add(`document-level ${key.decodeText()} data`);
    for (const [key, label] of [
      ['AcroForm', 'interactive forms (including duplicate field names)'],
      ['Collection', 'portfolios'],
      ['AF', 'associated attachments'],
      ['OCProperties', 'optional-content layers'],
      ['Threads', 'article threads'],
      ['OpenAction', 'document open actions'],
      ['AA', 'document actions'],
      ['Perms', 'certification or usage-right signatures'],
    ])
      if (has(catalog, key)) unsupported.add(label);
    if (names)
      for (const key of names.keys())
        if (!['Dests', 'EmbeddedFiles', 'JavaScript'].includes(key.decodeText()))
          unsupported.add(`${key.decodeText()} name trees`);
    if (names)
      for (const key of ['EmbeddedFiles', 'JavaScript'])
        if (has(names, key))
          unsupported.add(key === 'JavaScript' ? 'document scripts' : 'attachments');
  }
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
      if (has(dict, 'SD')) unsupported.add('structure destinations');
      if (dict.get(name('Subtype'))?.toString() === '/Widget')
        unsupported.add('interactive forms (including duplicate field names)');
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
    throw new PreservationError(
      job.sources[0]?.file.name || 'This PDF',
      [...unsupported].join('; '),
      'This document structure is outside the verified preservation support for this tool.',
    );
}
