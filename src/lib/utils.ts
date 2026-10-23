export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
export function parseRange(value: string, count: number): number[] {
  if (!count) throw new Error('This document has no pages.');
  if (!value.trim()) return Array.from({ length: count }, (_, index) => index);
  const result: number[] = [];
  for (const part of value.split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error('Use page numbers or ranges, like 1-3, 5, 8-10.');
    const first = Number(match[1]);
    const last = Number(match[2] || match[1]);
    if (first < 1 || last < first || last > count)
      throw new Error(`Choose pages between 1 and ${count}, with each range in ascending order.`);
    for (let page = first; page <= last; page++)
      if (!result.includes(page - 1)) result.push(page - 1);
  }
  return result;
}
export const safeStem = (name: string) =>
  name
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/<>:"|?*\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, '_')
    .replace(/^\.+|[. ]+$/g, '_')
    .slice(0, 100) || 'document';
export const uuid = () => crypto.randomUUID();
export function toBlob(data: Uint8Array, type: string) {
  return new Blob([data as Uint8Array<ArrayBuffer>], { type });
}
export function downloadFile(name: string, data: Uint8Array, type: string) {
  const url = URL.createObjectURL(toBlob(data, type));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function validateKind(file: File, image: boolean) {
  if (!file.size) throw new Error(`${file.name} is empty. Please choose a valid file.`);
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const text = new TextDecoder().decode(head);
  if (!image && !text.includes('%PDF-')) throw new Error(`${file.name} is not a valid PDF.`);
  if (image) {
    const png = head[0] === 137 && head[1] === 80 && head[2] === 78 && head[3] === 71;
    const jpeg = head[0] === 255 && head[1] === 216 && head[2] === 255;
    // RIFF's length is binary. Decoding the whole header as UTF-8 can collapse
    // those bytes and shift WEBP away from character offset 8.
    const webp =
      new TextDecoder().decode(head.subarray(0, 4)) === 'RIFF' &&
      new TextDecoder().decode(head.subarray(8, 12)) === 'WEBP';
    if (!png && !jpeg && !webp) throw new Error(`${file.name}: choose a JPEG, PNG, or WebP image.`);
  }
}
