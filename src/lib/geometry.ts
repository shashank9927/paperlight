export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export function annotationPosition(x: number, y: number, width: number, height: number) {
  return { x: x * width, y: y * height };
}
// PDF.js displays the intersection, not an out-of-bounds CropBox.
export function visibleBox(media: Box, crop: Box): Box {
  const x = Math.max(media.x, crop.x),
    y = Math.max(media.y, crop.y);
  const right = Math.min(media.x + media.width, crop.x + crop.width);
  const top = Math.min(media.y + media.height, crop.y + crop.height);
  return right > x && top > y ? { x, y, width: right - x, height: top - y } : media;
}
export function visibleSize(box: Box, rotation: number) {
  return rotation % 180 === 0
    ? { width: box.width, height: box.height }
    : { width: box.height, height: box.width };
}
export function viewToPdf(x: number, y: number, box: Box, rotation: number) {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return { x: box.x + y, y: box.y + x };
    case 180:
      return { x: box.x + box.width - x, y: box.y + y };
    case 270:
      return { x: box.x + box.width - y, y: box.y + box.height - x };
    default:
      return { x: box.x + x, y: box.y + box.height - y };
  }
}
export function pageNumber(value: number, total: number, style: 'number' | 'page' | 'total') {
  return style === 'page'
    ? `Page ${value}`
    : style === 'total'
      ? `${value} / ${total}`
      : String(value);
}
