export const MAX_OUTPUT_BYTES = 128 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 16_000_000;
export const MAX_CANVAS_PIXELS = 16_777_216;
export const MAX_RASTER_PIXELS = 120_000_000;
export const MAX_OBJECTS = 100_000;

export function checkCanvas(width: number, height: number) {
  if (
    ![width, height].every((n) => Number.isFinite(n) && n > 0 && n <= 8192) ||
    width * height > MAX_CANVAS_PIXELS
  )
    throw new Error(
      'This canvas exceeds the safe pixel limit. Use a smaller image or lower resolution.',
    );
}
export function checkOutput(bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > MAX_OUTPUT_BYTES)
    throw new Error('Output exceeds the 128 MB limit. Choose fewer pages or a lower resolution.');
}

// Bound the serialized allocation before pdf-lib creates its complete buffer.
// Assets are flushed first; the estimate includes conservative xref/header space.
export async function saveBoundedPdf(document: import('pdf-lib').PDFDocument) {
  await document.flush();
  const objects = document.context.enumerateIndirectObjects();
  if (objects.length > MAX_OBJECTS)
    throw new Error('The output exceeds the 100,000 object safety limit.');
  let bytes = 4096;
  for (const [, object] of objects) {
    bytes += object.sizeInBytes() + 64;
    if (bytes > MAX_OUTPUT_BYTES)
      throw new Error(
        'This export exceeds the 128 MB serialization safety budget before compression. Choose fewer pages or smaller images.',
      );
  }
  const output = await document.save({ updateFieldAppearances: false });
  checkOutput(output.length);
  return output;
}

// Read bounded headers BEFORE decoding. Reject ambiguous/unsupported headers.
// EXIF orientation is applied by createImageBitmap(imageOrientation: from-image).
export async function imageDimensions(file: Blob) {
  const bytes = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer());
  const v = new DataView(bytes.buffer);
  const ascii = (start: number, length: number) =>
    new TextDecoder().decode(bytes.subarray(start, start + length));
  let width = 0,
    height = 0;
  if (bytes.length >= 24 && ascii(1, 3) === 'PNG' && ascii(12, 4) === 'IHDR') {
    width = v.getUint32(16);
    height = v.getUint32(20);
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    let p = 2;
    while (p + 8 < bytes.length) {
      if (bytes[p++] !== 255) break;
      while (bytes[p] === 255) p++;
      const marker = bytes[p++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const length = v.getUint16(p);
      if (length < 2) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        height = v.getUint16(p + 3);
        width = v.getUint16(p + 5);
        break;
      }
      p += length;
    }
  } else if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const chunk = ascii(12, 4);
    const u24 = (p: number) => bytes[p] + bytes[p + 1] * 256 + bytes[p + 2] * 65536;
    if (chunk === 'VP8X') {
      if (bytes[20] & 2) throw new Error('Animated WebP is unsupported. Choose a still image.');
      width = 1 + u24(24);
      height = 1 + u24(27);
    } else if (chunk === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) {
      width = v.getUint16(26, true) & 16383;
      height = v.getUint16(28, true) & 16383;
    } else if (chunk === 'VP8L' && bytes[20] === 47) {
      const bits = v.getUint32(21, true);
      width = 1 + (bits & 16383);
      height = 1 + ((bits >>> 14) & 16383);
    }
  }
  if (!width || !height || width * height > MAX_IMAGE_PIXELS || Math.max(width, height) > 8192)
    throw new Error(
      'Image dimensions are unsupported or exceed 16 megapixels / 8192 pixels per side. Resize the image first.',
    );
  return { width, height };
}
