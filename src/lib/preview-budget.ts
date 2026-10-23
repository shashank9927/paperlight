// Bound expensive page rendering independently of grid size. Queued work checks
// its effect's cancellation flag before touching the document or canvas.
let active = 0;
const pending: Array<() => void> = [];
const canvases = new Map<HTMLCanvasElement, { pixels: number }>();
export function reservePreview(canvas: HTMLCanvasElement, width: number, height: number) {
  const entry = { pixels: width * height };
  const total = [...canvases.entries()].reduce(
    (sum, [other, value]) => sum + (other === canvas ? 0 : value.pixels),
    entry.pixels,
  );
  if (total > 8_000_000 || (!canvases.has(canvas) && canvases.size >= 24))
    throw new Error('Preview budget reached. Scroll to fewer pages or use focus view.');
  canvases.set(canvas, entry);
  canvas.width = width;
  canvas.height = height;
  return () => {
    if (canvases.get(canvas) !== entry) return;
    canvases.delete(canvas);
    canvas.width = canvas.height = 1;
  };
}
export async function previewSlot() {
  if (active >= 2) await new Promise<void>((resolve) => pending.push(resolve));
  else active++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = pending.shift();
    if (next) next();
    else active--;
  };
}
