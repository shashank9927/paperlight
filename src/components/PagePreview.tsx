import { memo, useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { RenderTask } from 'pdfjs-dist';
import type { PreviewFile } from '../lib/preview';
import type { PageRef, ToolOptions, Annotation } from '../lib/types';
import type { ToolId } from '../lib/tools';
import { PreviewAnnotations } from './PreviewAnnotations';
import { previewSlot, reservePreview } from '../lib/preview-budget';
import { useFrameUpdate } from '../lib/use-frame-update';

export const PagePreview = memo(function PagePreview({
  source,
  page,
  large = false,
  tool,
  options,
  selected = true,
  pageOrdinal = 0,
  selectedCount = 1,
  onPosition,
  onAnnotationChange,
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
  onAnnotationChange?: (id: string, patch: Partial<Annotation>) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderTask = useRef<RenderTask | null>(null);
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(220);
  const [imageUrl, setImageUrl] = useState('');
  const [renderError, setRenderError] = useState(false);
  const position = useFrameUpdate((x: number, y: number) => onPosition?.(x, y));
  const rotation =
    (page.rotation +
      (tool === 'rotate' &&
      selected &&
      (options?.rotationTarget === 'all' ||
        (options?.rotationTarget === 'portrait'
          ? source.pages[page.index].height >= source.pages[page.index].width
          : source.pages[page.index].width > source.pages[page.index].height))
        ? options?.angle || 0
        : 0)) %
    360;
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
    if (source.document || page.blank) return;
    const url = URL.createObjectURL(source.file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [source]);
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
    let deadline: number | undefined;
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
      current = pdfPage.render({
        canvas: element,
        canvasContext: context,
        viewport,
        background: 'rgba(0,0,0,0)',
      });
      renderTask.current = current;
      await Promise.race([
        current.promise,
        new Promise<never>((_, reject) => {
          deadline = window.setTimeout(() => {
            current?.cancel();
            reject(new Error('Preview rendering exceeded its safety deadline.'));
          }, 30000);
        }),
      ]);
      if (!cancelled) element.dataset.ready = 'true';
      pdfPage.cleanup();
    })()
      .catch((error) => {
        if (!cancelled && error?.name !== 'RenderingCancelledException') setRenderError(true);
      })
      .finally(() => {
        window.clearTimeout(deadline);
        release?.();
      });
    return () => {
      cancelled = true;
      current?.cancel();
      releaseCanvas?.();
    };
  }, [visible, source, page.index, width, rotation, info.rotation, large]);
  const draggable =
    !!onPosition &&
    !(tool === 'sign' && options?.annotations.length) &&
    selected &&
    (tool === 'sign' || tool === 'watermark' || tool === 'page-numbers');
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggable || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const box = event.currentTarget.getBoundingClientRect();
    position.update(
      Math.max(0.05, Math.min(0.95, (event.clientX - box.left) / box.width)),
      Math.max(0.05, Math.min(0.95, (event.clientY - box.top) / box.height)),
    );
  };
  const visualWidth = rotated ? info.height : info.width;
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
        position.flush();
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      aria-label={`Preview of page ${page.index + 1}${draggable ? '. Arrow keys move the annotation; Shift moves faster.' : ''}`}
    >
      {page.blank ? null : source.document ? (
        <canvas ref={canvas} aria-hidden="true" />
      ) : (
        <img
          src={visible ? imageUrl : undefined}
          draggable={false}
          loading="lazy"
          decoding="async"
          alt={source.file.name}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: rotated ? `${100 / aspect}%` : '100%',
            height: rotated ? `${100 * aspect}%` : '100%',
            transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          }}
        />
      )}
      {!visible && <span className="preview-placeholder">{page.index + 1}</span>}
      {renderError && <span className="preview-error">Preview unavailable</span>}
      {options && visible && (
        <PreviewAnnotations
          tool={tool}
          options={options}
          index={page.index}
          total={source.pages.length}
          ordinal={pageOrdinal}
          selectedCount={selectedCount}
          selected={selected}
          width={width}
          pageWidth={visualWidth}
          pageHeight={rotated ? info.width : info.height}
          onAnnotationChange={onAnnotationChange}
        />
      )}
    </div>
  );
});
