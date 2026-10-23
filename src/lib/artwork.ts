import { imageDimensions } from './limits';
import { validateKind } from './utils';
export async function artwork(file: File): Promise<Uint8Array> {
  if (file.size > 10 * 1024 * 1024) throw new Error('Use artwork smaller than 10 MB.');
  let blob: Blob = file;
  const head = await file.slice(0, 1024).text();
  const svg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name) || /<svg[\s>]/i.test(head);
  if (svg) {
    if (file.size > 1024 * 1024) throw new Error('Use SVG artwork smaller than 1 MB.');
    const text = await file.text();
    if (/<!DOCTYPE|<!ENTITY/i.test(text))
      throw new Error('SVG document types and entities are not supported.');
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg')
      throw new Error('Choose valid SVG artwork.');
    const instructions = doc.createTreeWalker(doc, NodeFilter.SHOW_PROCESSING_INSTRUCTION);
    if (instructions.nextNode())
      throw new Error('SVG processing instructions and external stylesheets are not supported.');
    const elements = [doc.documentElement, ...doc.documentElement.querySelectorAll('*')];
    if (elements.length > 2000) throw new Error('SVG artwork is too complex.');
    const tags = new Set([
      'svg',
      'g',
      'path',
      'rect',
      'circle',
      'ellipse',
      'line',
      'polyline',
      'polygon',
      'defs',
      'linearGradient',
      'radialGradient',
      'stop',
      'title',
      'desc',
    ]);
    const attrs = new Set([
      'xmlns',
      'version',
      'viewBox',
      'width',
      'height',
      'x',
      'y',
      'x1',
      'x2',
      'y1',
      'y2',
      'cx',
      'cy',
      'r',
      'rx',
      'ry',
      'd',
      'points',
      'fill',
      'fill-opacity',
      'fill-rule',
      'stroke',
      'stroke-width',
      'stroke-opacity',
      'stroke-linecap',
      'stroke-linejoin',
      'stroke-miterlimit',
      'opacity',
      'transform',
      'id',
      'offset',
      'stop-color',
      'stop-opacity',
      'gradientUnits',
      'gradientTransform',
      'spreadMethod',
      'fx',
      'fy',
      'preserveAspectRatio',
    ]);
    for (const el of elements) {
      if (!tags.has(el.localName) || el.namespaceURI !== 'http://www.w3.org/2000/svg')
        throw new Error(
          'SVG must contain static shapes only. Scripts, text, filters and external content are not supported.',
        );
      for (const attr of [...el.attributes]) {
        if (
          !attrs.has(attr.name) ||
          (/javascript:|data:|https?:|@import|expression\s*\(/i.test(attr.value) &&
            attr.name !== 'xmlns')
        )
          throw new Error('SVG contains an unsupported attribute or external reference.');
        if (/url\s*\(/i.test(attr.value) && !/^url\(#[A-Za-z_][\w.-]*\)$/.test(attr.value))
          throw new Error('SVG external references are not supported.');
      }
    }
    const root = doc.documentElement;
    const view = root
      .getAttribute('viewBox')
      ?.trim()
      .split(/[\s,]+/)
      .map(Number);
    if (
      view &&
      (view.length !== 4 || view.some((v) => !Number.isFinite(v)) || view[2] <= 0 || view[3] <= 0)
    )
      throw new Error('Use a valid SVG viewBox.');
    const dimension = (name: string, fallback: number | undefined) => {
      const raw = root.getAttribute(name);
      if (raw && !/^\d+(\.\d+)?(px)?$/.test(raw))
        throw new Error('Use pixel dimensions or a viewBox for SVG artwork.');
      return raw ? parseFloat(raw) : fallback;
    };
    const w = dimension('width', view?.[2]),
      h = dimension('height', view?.[3]);
    if (
      !w ||
      !h ||
      !Number.isFinite(w) ||
      !Number.isFinite(h) ||
      w < 1 ||
      h < 1 ||
      w > 8192 ||
      h > 8192 ||
      w * h > 16_000_000
    )
      throw new Error('SVG dimensions must be within 8192 pixels and 16 megapixels.');
    root.setAttribute('width', String(w));
    root.setAttribute('height', String(h));
    blob = new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml' });
  } else {
    await validateKind(file, true);
    await imageDimensions(file);
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (image.naturalWidth * image.naturalHeight > 16_000_000)
      throw new Error('Resize artwork below 16 megapixels.');
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    try {
      canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!png) throw new Error('The artwork could not be converted.');
      return new Uint8Array(await png.arrayBuffer());
    } finally {
      canvas.width = canvas.height = 1;
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}
