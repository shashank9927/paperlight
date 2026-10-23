import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { Eraser, Upload } from 'lucide-react';
import { imageDimensions } from '../lib/limits';
import { validateGlyphs } from '../lib/glyphs';
import { validateKind } from '../lib/utils';

export function SignatureEditor({
  onChange,
  onError,
}: {
  onChange: (data: Uint8Array | undefined) => void;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<'draw' | 'type' | 'upload'>('draw');
  const [name, setName] = useState('');
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
        await validateGlyphs(name);
        await document.fonts.load('112px "Paperlight Annotation"');
        if (gen !== generation.current) return;
        const element = document.createElement('canvas');
        element.width = 1200;
        element.height = 260;
        const context = element.getContext('2d')!;
        let size = 112;
        context.font = `${size}px "Paperlight Annotation"`;
        const measured = context.measureText(name).width;
        if (measured > 1120) size *= 1120 / measured;
        context.font = `${size}px "Paperlight Annotation"`;
        context.fillStyle = '#272137';
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
  }, [name, mode, onChange, onError]);
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
                context.strokeStyle = '#272137';
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
          <span className="typed-preview">{name || 'Your signature'}</span>
        </label>
      )}
      {mode === 'upload' && (
        <>
          <input
            ref={upload}
            type="file"
            className="visually-hidden"
            aria-label="Upload signature image"
            accept="image/png,image/jpeg,image/webp"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const gen = ++generation.current;
              onChange(undefined);
              setFileName('');
              try {
                if (file.size > 10 * 1024 * 1024)
                  throw new Error('Use a signature image smaller than 10 MB.');
                await validateKind(file, true);
                await imageDimensions(file);
                const image = await createImageBitmap(file, { imageOrientation: 'from-image' });
                if (image.width * image.height > 16_000_000) {
                  image.close();
                  throw new Error('Resize your signature image below 16 megapixels.');
                }
                const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
                const element = document.createElement('canvas');
                element.width = Math.max(1, Math.round(image.width * scale));
                element.height = Math.max(1, Math.round(image.height * scale));
                element.getContext('2d')!.drawImage(image, 0, 0, element.width, element.height);
                image.close();
                const blob = await new Promise<Blob | null>((resolve) =>
                  element.toBlob(resolve, 'image/png'),
                );
                const data = blob ? new Uint8Array(await blob.arrayBuffer()) : undefined;
                element.width = element.height = 1;
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
