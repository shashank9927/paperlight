import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Annotation, ToolOptions, TextStyle } from '../lib/types';
import { fontCss, numberPosition, numberText, tilePositions } from '../lib/annotation-style';
import { parseRange, toBlob } from '../lib/utils';
type Item = TextStyle & {
  id: string;
  image?: Uint8Array;
  width: number;
  layer?: 'above' | 'below';
  interactive?: boolean;
};
function Mark({
  item,
  scale,
  onMove,
}: {
  item: Item;
  scale: number;
  onMove?: (x: number, y: number) => void;
}) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!item.image) {
      setUrl('');
      return;
    }
    const next = URL.createObjectURL(toBlob(item.image, 'image/png'));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [item.image]);
  const style: CSSProperties = {
    left: item.x * 100 + '%',
    top: item.y * 100 + '%',
    transform: 'translate(-50%, -50%) rotate(' + item.textAngle + 'deg)',
    opacity: item.opacity,
    zIndex: item.layer === 'below' ? 0 : 2,
    color: item.color,
    fontFamily: fontCss(item.fontFamily),
    fontWeight: item.bold ? 700 : 400,
    fontStyle: item.italic || item.fontFamily === 'signature' ? 'italic' : 'normal',
    fontSize: item.fontSize * scale,
    background: item.background || undefined,
    padding: item.background ? 2 * scale : undefined,
    textShadow: item.shadow ? scale + 'px ' + scale + 'px ' + scale + 'px #777' : undefined,
    ...(item.image ? { width: item.width * 100 + '%' } : {}),
  };
  return (
    <div
      className={'annotation-overlay ' + (item.image ? 'image-annotation' : 'text-annotation')}
      style={style}
      tabIndex={onMove ? 0 : undefined}
      role={onMove ? 'button' : undefined}
      aria-label={onMove ? 'Move ' + item.id + ' field' : undefined}
      onPointerDown={(e) => {
        if (!onMove) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!onMove || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
        e.stopPropagation();
        const box = e.currentTarget.parentElement!.getBoundingClientRect();
        onMove(
          Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)),
          Math.max(0, Math.min(1, (e.clientY - box.top) / box.height)),
        );
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onKeyDown={(e) => {
        if (!onMove || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        const d = e.shiftKey ? 0.05 : 0.01;
        onMove(
          Math.max(
            0,
            Math.min(1, item.x + (e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0)),
          ),
          Math.max(
            0,
            Math.min(1, item.y + (e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0)),
          ),
        );
      }}
    >
      {item.image ? (
        <img
          src={url || undefined}
          alt={item.id === 'signature' ? 'Your signature placement' : ''}
          draggable={false}
          style={{ width: '100%', display: 'block' }}
        />
      ) : (
        item.text
      )}
    </div>
  );
}
export function PreviewAnnotations({
  tool,
  options: o,
  index,
  total,
  ordinal,
  selectedCount,
  selected,
  width,
  pageWidth,
  pageHeight,
  onAnnotationChange,
}: {
  tool?: string;
  options: ToolOptions;
  index: number;
  total: number;
  ordinal: number;
  selectedCount: number;
  selected: boolean;
  width: number;
  pageWidth: number;
  pageHeight: number;
  onAnnotationChange?: (id: string, patch: Partial<Annotation>) => void;
}) {
  let items: Item[] = [];
  if (tool === 'sign' && o.annotations.length) {
    items = o.annotations
      .filter((a) => {
        try {
          return parseRange(a.range, total).includes(index);
        } catch {
          return false;
        }
      })
      .map((a) => ({ ...a, interactive: true }));
  } else if (selected) {
    if (tool === 'watermark')
      items = tilePositions(o.tile, o.x, o.y).map((point, i) => ({
        ...o,
        ...point,
        id: 'watermark-' + i,
        image: o.watermarkType === 'image' ? o.watermarkImage : undefined,
        width: o.watermarkWidth,
        layer: o.layer,
      }));
    if (tool === 'page-numbers' && !(o.coverPage && index === 0))
      items = [
        {
          ...o,
          ...numberPosition(o, index, pageWidth, pageHeight),
          id: 'number',
          text: numberText(o, ordinal, selectedCount, total),
          width: 0,
          textAngle: 0,
        },
      ];
    if (tool === 'sign' && o.signature)
      items = [
        {
          ...o,
          id: 'signature',
          image: o.signature,
          width: o.signatureWidth,
          textAngle: 0,
          opacity: 1,
        },
      ];
  }
  return (
    <>
      {items.map((item) => (
        <Mark
          key={item.id}
          item={item}
          scale={width / pageWidth}
          onMove={
            item.interactive && onAnnotationChange
              ? (x, y) => onAnnotationChange(item.id, { x, y })
              : undefined
          }
        />
      ))}
    </>
  );
}
