import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import type { RenderTask } from 'pdfjs-dist';
import type { PreviewFile } from '../lib/preview';
import type { PageRef, ToolOptions } from '../lib/types';
import type { ToolId } from '../lib/tools';
import { pageNumber, annotationPosition } from '../lib/geometry';
import { previewSlot, reservePreview } from '../lib/preview-budget';
import { toBlob } from '../lib/utils';

export function PagePreview({
  source,
  page,
  large = false,
  tool,
  options,
  selected = true,
  pageOrdinal = 0,
  selectedCount = 1,
  onPosition,
}: {
  source: PreviewFile;
  page: PageRef;
  large?: boolean;
  tool?: ToolId;
  options?: ToolOptions;
  selected?: boolean;
  pageOrdinal?: number;
  selectedCount?: number;
  onPosition?: (x: number, y: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderTask = useRef<RenderTask | null>(null);
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(220);
  const [imageUrl, setImageUrl] = useState('');
  const [signatureUrl, setSignatureUrl] = useState('');
  const [renderError, setRenderError] = useState(false);
  const rotation =
    (page.rotation + (tool === 'rotate' && selected ? options?.angle || 0 : 0)) % 360;
  const info = source.pages[page.index];
  const rotated = rotation % 180 !== 0;
  const aspect = rotated ? info.height / info.width : info.width / info.height;
  useEffect(() => {
    if (!container.current) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: '250px',
    });
    observer.observe(container.current);
    const resize = new ResizeObserver(([entry]) =>
      setWidth(Math.max(1, Math.round(entry.contentRect.width))),
    );
    resize.observe(container.current);
    return () => {
      observer.disconnect();
      resize.disconnect();
    };
  }, []);
  useEffect(() => {
    if (source.document) return;
    const url = URL.createObjectURL(source.file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [source]);
  useEffect(() => {
    if (!options?.signature) {
      setSignatureUrl('');
      return;
    }
    const url = URL.createObjectURL(toBlob(options.signature, 'image/png'));
    setSignatureUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [options?.signature]);
  useEffect(() => {
    if (!visible) {
      renderTask.current?.cancel();
      if (canvas.current) {
        canvas.current.width = 1;
        canvas.current.height = 1;
      }
      return;
    }
    if (!source.document || !canvas.current) return;
    let cancelled = false;
    let current: RenderTask | undefined;
    let release: (() => void) | undefined;
    let releaseCanvas: (() => void) | undefined;
    setRenderError(false);
    void (async () => {
      release = await previewSlot();
      if (cancelled) return;
      if (renderTask.current) {
        renderTask.current.cancel();
        await renderTask.current.promise.catch(() => {});
      }
      const pdfPage = await source.document!.getPage(page.index + 1);
      if (cancelled || !canvas.current) return;
      const base = pdfPage.getViewport({ scale: 1, rotation: info.rotation + rotation });
      const scale = Math.min(
        (width * (large ? Math.min(devicePixelRatio || 1, 2) : 1.2)) / base.width,
        1600 / Math.max(base.width, base.height),
      );
      const viewport = pdfPage.getViewport({ scale, rotation: info.rotation + rotation });
      const element = canvas.current;
      element.dataset.ready = 'false';
      releaseCanvas = reservePreview(
        element,
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );
      const context = element.getContext('2d');
      if (!context) return;
      current = pdfPage.render({ canvas: element, canvasContext: context, viewport });
      renderTask.current = current;
      await current.promise;
      if (!cancelled) element.dataset.ready = 'true';
      pdfPage.cleanup();
    })()
      .catch((error) => {
        if (!cancelled && error?.name !== 'RenderingCancelledException') setRenderError(true);
      })
      .finally(() => release?.());
    return () => {
      cancelled = true;
      current?.cancel();
      releaseCanvas?.();
    };
  }, [visible, source, page.index, width, rotation, info.rotation, large]);
  const draggable =
    !!onPosition &&
    selected &&
    (tool === 'sign' || tool === 'watermark' || tool === 'page-numbers');
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggable || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const box = event.currentTarget.getBoundingClientRect();
    onPosition!(
      Math.max(0.05, Math.min(0.95, (event.clientX - box.left) / box.width)),
      Math.max(0.05, Math.min(0.95, (event.clientY - box.top) / box.height)),
    );
  };
  const visualWidth = rotated ? info.height : info.width;
  const center = annotationPosition(options?.x || 0, options?.y || 0, width, width / aspect);
  const text =
    tool === 'page-numbers' && options
      ? pageNumber(
          options.startNumber + pageOrdinal,
          options.startNumber + selectedCount - 1,
          options.numberStyle,
        )
      : options?.text;
  return (
    <div
      ref={container}
      role="img"
      tabIndex={draggable ? 0 : undefined}
      className={`page-preview ${large ? 'large' : ''} ${draggable ? 'can-position' : ''}`}
      style={{ aspectRatio: aspect }}
      onKeyDown={(event) => {
        if (
          !draggable ||
          !options ||
          !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
        )
          return;
        event.preventDefault();
        const delta = event.shiftKey ? 0.05 : 0.01;
        onPosition!(
          Math.max(
            0.05,
            Math.min(
              0.95,
              options.x +
                (event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0),
            ),
          ),
          Math.max(
            0.05,
            Math.min(
              0.95,
              options.y +
                (event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0),
            ),
          ),
        );
      }}
      onPointerDown={(event) => {
        if (draggable && (event.target as HTMLElement).closest('.annotation-overlay')) {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          move(event);
        }
      }}
      onPointerMove={move}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      aria-label={`Preview of page ${page.index + 1}${draggable ? '. Arrow keys move the annotation; Shift moves faster.' : ''}`}
    >
      {source.document ? (
        <canvas ref={canvas} aria-hidden="true" />
      ) : (
        <img
          src={visible ? imageUrl : undefined}
          draggable={false}
          loading="lazy"
          decoding="async"
          alt={source.file.name}
          style={{ transform: `rotate(${rotation}deg)` }}
        />
      )}
      {!visible && <span className="preview-placeholder">{page.index + 1}</span>}
      {renderError && <span className="preview-error">Preview unavailable</span>}
      {selected && options && (tool === 'watermark' || tool === 'page-numbers') && (
        <div
          aria-hidden="true"
          className="annotation-overlay text-annotation"
          style={
            {
              left: `${center.x}px`,
              top: `${center.y}px`,
              fontSize: `${(options.fontSize * width) / visualWidth}px`,
              color: options.color,
              opacity: tool === 'watermark' ? options.opacity : 1,
              transform: `translate(-50%, -50%) rotate(${tool === 'watermark' ? options.textAngle : 0}deg)`,
            } as CSSProperties
          }
        >
          {text}
        </div>
      )}
      {selected && tool === 'sign' && signatureUrl && options && (
        <img
          className="annotation-overlay signature-annotation"
          draggable={false}
          src={signatureUrl}
          alt="Your signature placement"
          style={{
            left: `${center.x}px`,
            top: `${center.y}px`,
            width: `${options.signatureWidth * 100}%`,
          }}
        />
      )}
    </div>
  );
}
