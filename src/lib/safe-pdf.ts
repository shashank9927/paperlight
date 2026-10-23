import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFObjectParser,
  PDFRawStream,
  decodePDFRawStream,
} from 'pdf-lib';
import { MAX_OBJECTS, MAX_IMAGE_PIXELS } from './limits';
import { MAX_PAGES } from './types';

export const MAX_DECODED_STREAM = 64 * 1024 * 1024;
export const MAX_DECODED_DOCUMENT = 256 * 1024 * 1024;
const name = PDFName.of;
const budgetMessage =
  'This PDF exceeds the safe document complexity or decompression limit. Use a smaller document.';

// pdf-lib 1.17.1 exposes its parser but has no allocation limits. This adapter
// guards BEFORE recursive parsing and BEFORE each decoder allocation. It runs
// only in isolated admission/processing workers; no dependency files are edited.
// Keep the dependency pinned and the adversarial tests when upgrading it.
let parsing = false;
export async function loadPdfSafely(bytes: Uint8Array): Promise<PDFDocument> {
  if (parsing) throw new Error('A document is already being inspected.');
  parsing = true;
  const original = PDFObjectParser.prototype.parseObject;
  type TokenParser = {
    bytes: { peekAhead(offset: number): number | undefined };
    parseName(): PDFName;
    parseRawInt(): number;
    parseRawNumber(): number;
  };
  const parserPrototype = PDFObjectParser.prototype as unknown as TokenParser;
  const numberPrototype = Object.getPrototypeOf(PDFObjectParser.prototype) as TokenParser;
  const originalName = parserPrototype.parseName;
  const originalInt = numberPrototype.parseRawInt;
  const originalNumber = numberPrototype.parseRawNumber;
  let depth = 0,
    tokens = 0,
    decoded = 0;
  let failure: Error | undefined;
  const checked = new Set<PDFRawStream>();
  const fail = (): never => {
    throw (failure = new Error(budgetMessage));
  };
  const number = (dict: PDFDict, key: string) => dict.lookupMaybe(name(key), PDFNumber)?.asNumber();
  const checkToken = (parser: TokenParser, max: number, nameToken: boolean) => {
    for (let i = nameToken ? 1 : 0; i <= max; i++) {
      const value = parser.bytes.peekAhead(i);
      if (
        value === undefined ||
        [0, 9, 10, 12, 13, 32, 40, 41, 60, 62, 91, 93, 123, 125, 47, 37].includes(value)
      )
        return;
    }
    fail();
  };
  parserPrototype.parseName = function () {
    checkToken(this, 1024, true);
    return originalName.call(this);
  };
  numberPrototype.parseRawInt = function () {
    checkToken(this, 128, false);
    return originalInt.call(this);
  };
  numberPrototype.parseRawNumber = function () {
    checkToken(this, 128, false);
    return originalNumber.call(this);
  };
  const streamCheck = (stream: PDFRawStream) => {
    if (checked.has(stream)) return;
    checked.add(stream);
    const kind = stream.dict.get(name('Type'))?.toString();
    if (kind === '/ObjStm') {
      const n = number(stream.dict, 'N');
      if (!Number.isSafeInteger(n) || n! < 0 || n! > MAX_OBJECTS) fail();
    }
    if (kind === '/XRef') {
      const size = number(stream.dict, 'Size');
      if (!Number.isSafeInteger(size) || size! < 0 || size! > MAX_OBJECTS) fail();
      const widths = stream.dict.lookupMaybe(name('W'), PDFArray)?.asArray();
      if (
        !widths ||
        widths.length !== 3 ||
        widths.some((v) => !(v instanceof PDFNumber) || v.asNumber() < 0 || v.asNumber() > 8)
      )
        fail();
      const index = stream.dict.lookupMaybe(name('Index'), PDFArray);
      if (index) {
        if (index.size() % 2) fail();
        let count = 0;
        for (let i = 0; i < index.size(); i++) {
          const value = index.lookup(i, PDFNumber).asNumber();
          if (!Number.isSafeInteger(value) || value < 0 || value > MAX_OBJECTS) fail();
          if (i % 2) count += value;
        }
        if (count > MAX_OBJECTS) fail();
      }
    }
    const filter = stream.dict.lookup(name('Filter'));
    const filters = filter instanceof PDFArray ? filter.asArray() : filter ? [filter] : [];
    if (filters.length > 4) fail();
    let data = stream.contents;
    const params = stream.dict.lookup(name('DecodeParms'));
    for (const [i, value] of filters.entries()) {
      const filterName = stream.dict.context.lookup(value, PDFName);
      // Image codecs are checked separately for dimensions. They are never
      // valid in object/xref streams, which must pass this bounded decoder.
      if (
        ['/DCTDecode', '/JPXDecode', '/JBIG2Decode', '/CCITTFaxDecode'].includes(
          filterName.toString(),
        )
      ) {
        if (kind === '/ObjStm' || kind === '/XRef' || i !== filters.length - 1) fail();
        break;
      }
      const dict = PDFDict.withContext(stream.dict.context);
      dict.set(name('Filter'), filterName);
      const param = params instanceof PDFArray ? params.get(i) : params;
      if (param) dict.set(name('DecodeParms'), param);
      const decoder = decodePDFRawStream(PDFRawStream.of(dict, data));
      const bounded = decoder as unknown as { ensureBuffer: (n: number) => Uint8Array };
      const ensure = bounded.ensureBuffer;
      if (typeof ensure !== 'function') fail();
      bounded.ensureBuffer = function (requested) {
        if (
          !Number.isSafeInteger(requested) ||
          requested < 0 ||
          requested > MAX_DECODED_STREAM ||
          decoded + requested > MAX_DECODED_DOCUMENT
        )
          fail();
        return ensure.call(this, requested);
      };
      data = decoder.decode();
      decoded += data.length;
      if (decoded > MAX_DECODED_DOCUMENT) fail();
    }
    if (!filters.length) decoded += data.length;
    if (data.length > MAX_DECODED_STREAM || decoded > MAX_DECODED_DOCUMENT) fail();
  };
  PDFObjectParser.prototype.parseObject = function () {
    if (++tokens > 1_000_000 || ++depth > 64) fail();
    try {
      (this as unknown as { skipWhitespaceAndComments(): void }).skipWhitespaceAndComments();
      const source = (
        this as unknown as { bytes: { peek(): number; peekAhead(n: number): number } }
      ).bytes;
      // Bound literal/hex strings before pdf-lib concatenates their contents.
      // Whitespace is consumed by the parser itself before nested calls.
      if (source.peek() === 40 || (source.peek() === 60 && source.peekAhead(1) !== 60)) {
        const literal = source.peek() === 40;
        let nesting = 1,
          escaped = false,
          offset = 1;
        for (; offset <= 1024 * 1024; offset++) {
          const value = source.peekAhead(offset);
          if (value === undefined) break;
          if (literal) {
            if (escaped) {
              escaped = false;
              continue;
            }
            if (value === 92) {
              escaped = true;
              continue;
            }
            if (value === 40) nesting++;
            if (value === 41 && --nesting === 0) break;
          } else if (value === 62) break;
        }
        if (offset > 1024 * 1024) fail();
      }
      const object = original.call(this);
      if (
        object instanceof PDFRawStream &&
        ['/ObjStm', '/XRef'].includes(object.dict.get(name('Type'))?.toString() || '')
      )
        streamCheck(object);
      return object;
    } finally {
      depth--;
    }
  };
  try {
    const doc = await PDFDocument.load(bytes, {
      updateMetadata: false,
      throwOnInvalidObject: true,
    });
    const objects = doc.context.enumerateIndirectObjects();
    if (objects.length > MAX_OBJECTS) fail();
    for (const [, object] of objects) {
      if (object instanceof PDFRawStream) streamCheck(object);
    }
    // Validate the actual tree before pdf-lib's recursive page traversal. Parent
    // cycles can otherwise hang inherited geometry lookups even with valid Kids.
    const root = doc.catalog.lookup(name('Pages'), PDFDict);
    const pending = [{ node: root, parent: undefined as PDFDict | undefined, depth: 0 }];
    const seen = new Set<PDFDict>();
    let pages = 0;
    while (pending.length) {
      const { node, parent, depth } = pending.pop()!;
      if (seen.has(node) || depth > 64 || seen.size > MAX_OBJECTS) fail();
      seen.add(node);
      if (node.lookupMaybe(name('Parent'), PDFDict) !== parent) fail();
      if (node.get(name('Type'))?.toString() === '/Page') {
        if (++pages > MAX_PAGES) throw new Error('Choose 1–500 pages per job.');
      } else {
        const kids = node.lookup(name('Kids'), PDFArray);
        if (kids.size() > MAX_OBJECTS) fail();
        for (let i = 0; i < kids.size(); i++)
          pending.push({ node: kids.lookup(i, PDFDict), parent: node, depth: depth + 1 });
      }
    }
    if (!pages) throw new Error('This PDF has no pages.');
    const counts = new Map<PDFDict, number>();
    for (const node of [...seen].reverse()) {
      if (node.get(name('Type'))?.toString() === '/Page') counts.set(node, 1);
      else {
        const kids = node.lookup(name('Kids'), PDFArray);
        let count = 0;
        for (let i = 0; i < kids.size(); i++) count += counts.get(kids.lookup(i, PDFDict)) || 0;
        if (number(node, 'Count') !== count) fail();
        counts.set(node, count);
      }
    }
    for (const page of doc.getPages()) {
      for (const box of [page.getMediaBox(), page.getCropBox()]) {
        if (
          ![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
          Math.abs(box.x) > 1e6 ||
          Math.abs(box.y) > 1e6 ||
          box.width <= 0 ||
          box.height <= 0 ||
          Math.max(box.width, box.height) > 14400
        )
          fail();
      }
      if (!Number.isInteger(page.getRotation().angle / 90)) fail();
    }
    return doc;
  } catch (error) {
    throw failure || error;
  } finally {
    PDFObjectParser.prototype.parseObject = original;
    parserPrototype.parseName = originalName;
    numberPrototype.parseRawInt = originalInt;
    numberPrototype.parseRawNumber = originalNumber;
    parsing = false;
  }
}

export function checkPreviewImages(doc: PDFDocument) {
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (
      !(object instanceof PDFRawStream) ||
      object.dict.get(name('Subtype'))?.toString() !== '/Image'
    )
      continue;
    const w = object.dict.lookupMaybe(name('Width'), PDFNumber)?.asNumber() || 0;
    const h = object.dict.lookupMaybe(name('Height'), PDFNumber)?.asNumber() || 0;
    if (
      !Number.isSafeInteger(w) ||
      !Number.isSafeInteger(h) ||
      w <= 0 ||
      h <= 0 ||
      w * h > MAX_IMAGE_PIXELS ||
      Math.max(w, h) > 8192
    )
      throw new Error(
        'This PDF contains an image above the safe 16 megapixel / 8192 pixel limit. Resize its images in a trusted editor first.',
      );
  }
}
