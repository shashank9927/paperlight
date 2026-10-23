import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { Eraser, Upload } from 'lucide-react';
import { artwork } from '../lib/artwork';
import { validateGlyphs } from '../lib/glyphs';
import { fontCss } from '../lib/annotation-style';
import type { PdfFont } from '../lib/types';

export function SignatureEditor({
  onChange,
  onError,
}: {
  onChange: (data: Uint8Array | undefined) => void;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<'draw' | 'type' | 'upload'>('draw');
  const [name, setName] = useState('');
  const [ink, setInk] = useState('#20242d');
  const [family, setFamily] = useState<PdfFont>('sans');
  const [fileName, setFileName] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const generation = useRef(0);
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => {
    return () => {
      generation.current++;
    };
  }, []);
  useEffect(() => {
    const gen = ++generation.current;
    if (mode !== 'type') return;
    if (!name.trim()) {
      onChange(undefined);
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        await validateGlyphs(name, family);
        const fontPrefix = family === 'signature' ? 'italic ' : '';
        await document.fonts.load(fontPrefix + '112px "' + fontCss(family) + '"');
        if (gen !== generation.current) return;
        const element = document.createElement('canvas');
        element.width = 1200;
        element.height = 260;
        const context = element.getContext('2d')!;
        let size = 112;
        context.font = `${fontPrefix}${size}px "${fontCss(family)}"`;
        const measured = context.measureText(name).width;
        if (measured > 1120) size *= 1120 / measured;
        context.font = `${fontPrefix}${size}px "${fontCss(family)}"`;
        context.fillStyle = ink;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(name, 600, 130);
        const blob = await new Promise<Blob | null>((resolve) =>
          element.toBlob(resolve, 'image/png'),
        );
        if (blob) {
          const data = new Uint8Array(await blob.arrayBuffer());
          if (gen === generation.current) onChange(data);
        }
      })().catch((error) => {
        if (gen === generation.current) {
          onChange(undefined);
          onError(
            error instanceof Error ? error.message : 'Your typed signature could not be created.',
          );
        }
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [name, mode, family, ink, onChange, onError]);
  const clear = () => {
    generation.current++;
    canvas.current?.getContext('2d')?.clearRect(0, 0, 1000, 320);
    onChange(undefined);
  };
  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) * 1000) / bounds.width,
      y: ((event.clientY - bounds.top) * 320) / bounds.height,
    };
  };
  const finish = async () => {
    if (!drawing.current || !canvas.current) return;
    drawing.current = false;
    const gen = generation.current;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.current!.toBlob(resolve, 'image/png'),
    );
    if (blob) {
      const data = new Uint8Array(await blob.arrayBuffer());
      if (gen === generation.current) onChange(data);
    }
  };
  return (
    <div className="signature-editor">
      <div className="segmented" role="group" aria-label="Signature method">
        {(['draw', 'type', 'upload'] as const).map((item) => (
          <button
            type="button"
            key={item}
            aria-pressed={mode === item}
            className={mode === item ? 'active' : ''}
            onClick={() => {
              clear();
              setMode(item);
              if (item === 'upload') setFileName('');
            }}
          >
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>
      {mode !== 'upload' && (
        <label className="field">
          Signature color
          <input
            aria-label="Signature color"
            type="color"
            value={ink}
            onChange={(e) => {
              if (mode === 'type') onChange(undefined);
              setInk(e.target.value);
            }}
          />
        </label>
      )}
      {mode === 'type' && (
        <label className="field">
          Signature font
          <select
            aria-label="Signature font"
            value={family}
            onChange={(e) => {
              onChange(undefined);
              setFamily(e.target.value as PdfFont);
            }}
          >
            <option value="sans">Sans serif</option>
            <option value="serif">Serif</option>
            <option value="mono">Monospace</option>
            <option value="signature">Signature italic</option>
          </select>
        </label>
      )}
      {mode === 'draw' && (
        <>
          <div className="draw-pad">
            <canvas
              ref={canvas}
              width={1000}
              height={320}
              aria-label="Draw your signature"
              onPointerDown={(event) => {
                onChange(undefined);
                drawing.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
                const context = event.currentTarget.getContext('2d')!;
                const p = point(event);
                context.beginPath();
                context.moveTo(p.x, p.y);
                context.lineWidth = 4;
                context.lineCap = 'round';
                context.lineJoin = 'round';
                context.strokeStyle = ink;
              }}
              onPointerMove={(event) => {
                if (!drawing.current) return;
                const p = point(event);
                const context = event.currentTarget.getContext('2d')!;
                context.lineTo(p.x, p.y);
                context.stroke();
              }}
              onPointerUp={() => void finish()}
              onPointerCancel={() => void finish()}
            />
            <span>Draw something that’s uniquely you</span>
          </div>
          <button type="button" className="text-link small" onClick={clear}>
            <Eraser size={13} /> Clear signature
          </button>
        </>
      )}
      {mode === 'type' && (
        <label className="field">
          Your name
          <input
            aria-label="Signature name"
            placeholder="Alex Morgan"
            value={name}
            onChange={(event) => {
              onChange(undefined);
              setName(event.target.value);
            }}
            maxLength={80}
          />
          <span
            className="typed-preview"
            style={{
              fontFamily: fontCss(family),
              fontStyle: family === 'signature' ? 'italic' : 'normal',
              color: ink,
            }}
          >
            {name || 'Your signature'}
          </span>
        </label>
      )}
      {mode === 'upload' && (
        <>
          <input
            ref={upload}
            type="file"
            className="visually-hidden"
            aria-label="Upload signature image"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const gen = ++generation.current;
              onChange(undefined);
              setFileName('');
              try {
                const data = await artwork(file);
                if (data && gen === generation.current) {
                  onChange(data);
                  setFileName(file.name);
                }
              } catch (error) {
                if (gen !== generation.current) return;
                onChange(undefined);
                onError(
                  error instanceof Error
                    ? error.message
                    : 'The signature image could not be opened.',
                );
              } finally {
                event.target.value = '';
              }
            }}
          />
          <button
            type="button"
            className="signature-upload"
            onClick={() => upload.current?.click()}
          >
            <Upload size={19} />
            {fileName || 'Choose a signature image'}
            <span>PNG, JPG, or WebP · up to 10 MB</span>
          </button>
        </>
      )}
      <p className="field-hint">A visual signature, without certificate verification.</p>
    </div>
  );
}
