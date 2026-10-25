import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFObject,
  PDFRawStream,
  PDFString,
  decodePDFRawStream,
} from 'pdf-lib';
import { MAX_OBJECTS } from './limits';

const n = PDFName.of;
const text = (value: PDFObject | undefined) =>
  value instanceof PDFString || value instanceof PDFHexString ? value.decodeText() : undefined;

/** Stable semantic fingerprint independent of QPDF object IDs and stream filters. */
export async function documentFeaturesSignature(document: PDFDocument) {
  const ctx = document.context,
    pages = document.getPages();
  const pageRefs = new Map<PDFObject, number>();
  pages.forEach((page, index) => {
    pageRefs.set(page.ref, index);
    pageRefs.set(page.node, index);
  });
  let visits = 0,
    decoded = 0;
  const hashes = new Map<PDFRawStream, string>();
  const hash = async (stream: PDFRawStream) => {
    const known = hashes.get(stream);
    if (known) return known;
    const data = decodePDFRawStream(stream).decode();
    decoded += data.length;
    if (data.length > 64 * 1024 * 1024 || decoded > 256 * 1024 * 1024)
      throw new Error('Embedded data exceeds the verification budget.');
    const digest = await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>);
    const value = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    hashes.set(stream, value);
    return value;
  };
  const normal = async (
    value: PDFObject | undefined,
    path = new Set<PDFObject>(),
  ): Promise<unknown> => {
    if (!value) return null;
    if (pageRefs.has(value)) return ['page', pageRefs.get(value)];
    const object = ctx.lookup(value);
    if (!object || path.size > 64 || ++visits > 1_000_000)
      throw new Error('A document feature exceeds the safe verification limit.');
    if (path.has(object)) return ['cycle'];
    path.add(object);
    try {
      if (object instanceof PDFRawStream) return ['stream', await hash(object)];
      if (object instanceof PDFArray) {
        const values = [];
        for (const item of object.asArray()) values.push(await normal(item, path));
        return values;
      }
      if (object instanceof PDFDict) {
        const values = [];
        for (const [key, item] of object
          .entries()
          .sort(([a], [b]) => a.toString().localeCompare(b.toString())))
          if (![n('Parent'), n('P')].includes(key))
            values.push([key.toString(), await normal(item, path)]);
        return values;
      }
      return text(object) ?? object.toString();
    } finally {
      path.delete(object);
    }
  };
  const attachments: unknown[] = [],
    seen = new Set<PDFObject>();
  const inspect = async (value: PDFObject | undefined, depth = 0): Promise<void> => {
    if (!value) return;
    const object = ctx.lookup(value);
    if (!object || seen.has(object)) return;
    if (depth > 64 || seen.size >= MAX_OBJECTS)
      throw new Error('Embedded-file references exceed the verification limit.');
    seen.add(object);
    if (object instanceof PDFDict) {
      if (object.has(n('EF'))) attachments.push(await normal(object));
      for (const [key, item] of object
        .entries()
        .sort(([a], [b]) => a.toString().localeCompare(b.toString())))
        if (![n('Parent'), n('P'), n('Pages'), n('StructTreeRoot')].includes(key))
          await inspect(item, depth + 1);
    } else if (object instanceof PDFArray)
      for (const item of object.asArray()) await inspect(item, depth + 1);
  };
  await inspect(document.catalog.lookupMaybe(n('Names'), PDFDict)?.get(n('EmbeddedFiles')));
  await inspect(document.catalog.get(n('AF')));
  for (const page of pages) await inspect(page.node.get(n('Annots')));
  const widgetPages = new Map<PDFDict, number>();
  for (const [index, page] of pages.entries())
    for (const ref of page.node.lookupMaybe(n('Annots'), PDFArray)?.asArray() || []) {
      const annotation = ctx.lookup(ref, PDFDict);
      if (annotation.get(n('Subtype')) === n('Widget')) {
        if (widgetPages.has(annotation))
          throw new Error('A form widget is shared across output pages.');
        if (annotation.has(n('P')) && ctx.lookup(annotation.get(n('P'))) !== page.node)
          throw new Error('A form widget has an incorrect page association.');
        widgetPages.set(annotation, index);
      }
    }
  const form = document.catalog.lookupMaybe(n('AcroForm'), PDFDict);
  const fields: unknown[] = [],
    fieldNames = new Set<string>(),
    fieldNodes = new Set<PDFDict>(),
    foundWidgets = new Set<PDFDict>();
  const field = async (
    value: PDFObject,
    parent: PDFDict | undefined,
    prefix = '',
    inherited?: PDFObject,
    depth = 0,
  ): Promise<void> => {
    const object = ctx.lookup(value, PDFDict);
    if (depth > 64 || fieldNodes.has(object) || fieldNodes.size >= MAX_OBJECTS)
      throw new Error('The form field tree is invalid or cyclic.');
    fieldNodes.add(object);
    if (parent && ctx.lookup(object.get(n('Parent'))) !== parent)
      throw new Error('A form field has an incorrect parent.');
    const part = text(ctx.lookup(object.get(n('T'))));
    const name = part === undefined ? prefix : prefix ? `${prefix}.${part}` : part;
    const type = object.get(n('FT')) || inherited;
    const kids = object.lookupMaybe(n('Kids'), PDFArray)?.asArray() || [];
    if (object.get(n('Subtype')) === n('Widget')) {
      const page = widgetPages.get(object);
      if (page === undefined) throw new Error('A form widget is outside the output page tree.');
      foundWidgets.add(object);
      fields.push([
        'widget',
        name,
        page,
        await normal(object.get(n('Rect'))),
        await normal(object.get(n('AP'))),
        await normal(object.get(n('AS'))),
      ]);
    }
    if (part !== undefined) {
      if (fieldNames.has(name)) throw new Error('Output form field names collide.');
      fieldNames.add(name);
      fields.push([
        'field',
        name,
        type?.toString(),
        await normal(object.get(n('V'))),
        await normal(object.get(n('DV'))),
        await normal(object.get(n('Ff'))),
        await normal(object.get(n('DA'))),
        await normal(object.get(n('Opt'))),
      ]);
    }
    for (const item of kids) await field(item, object, name, type, depth + 1);
  };
  for (const value of form?.lookupMaybe(n('Fields'), PDFArray)?.asArray() || [])
    await field(value, undefined);
  if (foundWidgets.size !== widgetPages.size)
    throw new Error('An output widget is missing from the form field tree.');
  const layers = document.catalog.lookupMaybe(n('OCProperties'), PDFDict);
  if (layers) {
    const groups = layers
      .lookup(n('OCGs'), PDFArray)
      .asArray()
      .map((value) => ctx.lookup(value, PDFDict));
    if (new Set(groups).size !== groups.length)
      throw new Error('The layer collection contains duplicate references.');
    for (const configuration of [
      layers.get(n('D')),
      ...(layers.lookupMaybe(n('Configs'), PDFArray)?.asArray() || []),
    ]) {
      const dict = ctx.lookup(configuration);
      if (!(dict instanceof PDFDict)) continue;
      for (const key of ['ON', 'OFF', 'Locked'])
        for (const value of dict.lookupMaybe(n(key), PDFArray)?.asArray() || [])
          if (!groups.includes(ctx.lookup(value, PDFDict)))
            throw new Error('A layer configuration targets an unknown group.');
    }
  }
  return JSON.stringify({
    attachments,
    fields,
    layers: await normal(layers),
    opening: await normal(document.catalog.get(n('OpenAction'))),
  });
}
