import type { ReactNode } from 'react';
import type { ToolId } from '../lib/tools';
import type { ToolOptions } from '../lib/types';
import { SignatureEditor } from './SignatureEditor';
import { AlertTriangle, LockKeyhole, Move } from 'lucide-react';
import { useCallback } from 'react';
import { ExtraSettings, SignFields } from './ExtraSettings';

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field range-field">
      <span>
        {label}
        <strong>{display}</strong>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
export function ToolSettings({
  tool,
  options: o,
  onChange,
  onError,
}: {
  tool: ToolId;
  options: ToolOptions;
  onChange: (options: Partial<ToolOptions>) => void;
  onError: (message: string) => void;
}) {
  const signatureChanged = useCallback(
    (signature: Uint8Array | undefined) => onChange({ signature }),
    [onChange],
  );
  const range = (
    <Field
      label="Pages"
      hint="Leave blank for all pages. Ranges apply separately to each PDF. Example: 1-3, 5"
    >
      <input
        aria-label="Pages"
        placeholder="All pages"
        value={o.range}
        onChange={(event) => onChange({ range: event.target.value })}
      />
    </Field>
  );
  const position = (
    <>
      <Field label="Position">
        <div className="position-grid" role="group" aria-label="Annotation position">
          {[0.08, 0.5, 0.92].flatMap((y) =>
            [0.15, 0.5, 0.85].map((x) => (
              <button
                key={`${x}-${y}`}
                type="button"
                aria-label={`${y === 0.08 ? 'Top' : y === 0.5 ? 'Middle' : 'Bottom'} ${x === 0.15 ? 'left' : x === 0.5 ? 'center' : 'right'}`}
                aria-pressed={Math.abs(o.x - x) < 0.02 && Math.abs(o.y - y) < 0.02}
                className={Math.abs(o.x - x) < 0.02 && Math.abs(o.y - y) < 0.02 ? 'active' : ''}
                onClick={() => onChange({ x, y })}
              >
                <span />
              </button>
            )),
          )}
        </div>
      </Field>
      <p className="field-hint inline-hint">
        <Move size={13} /> Drag the preview annotation to fine-tune.
      </p>
    </>
  );
  return (
    <div className="tool-settings">
      <ExtraSettings tool={tool} options={o} onChange={onChange} onError={onError} />
      {tool === 'merge' && (
        <div className="settings-explainer">
          <h4>Merge in order</h4>
          <p>Files are merged in the order shown. Drag a file or use its arrows to move it.</p>
          <p>All pages from every file will be included.</p>
        </div>
      )}
      {tool === 'organize' && (
        <div className="settings-explainer">
          <h4>Arrange your document</h4>
          <p>Reorder, rotate, duplicate, or remove pages using the controls on each card.</p>
          <p>
            Select pages to extract them into a separate PDF. The original file stays untouched.
          </p>
        </div>
      )}
      {tool === 'split' && (
        <>
          <Field label="Split mode">
            <select
              aria-label="Split mode"
              value={o.splitMode}
              onChange={(event) =>
                onChange({ splitMode: event.target.value as ToolOptions['splitMode'] })
              }
            >
              <option value="extract">Extract into one PDF</option>
              <option value="individual">Separate PDF for each page</option>
              <option value="ranges">Custom range groups</option>
              <option value="fixed">Fixed page groups</option>
              <option value="size">Maximum file size</option>
            </select>
          </Field>
          {range}
          <p className="field-hint">Multiple PDFs are packed together in a ZIP.</p>
        </>
      )}
      {tool === 'compress' && (
        <>
          <div className="mode-options" role="group" aria-label="Compression mode">
            <button
              type="button"
              className={o.compression === 'lossless' ? 'mode-option selected' : 'mode-option'}
              aria-pressed={o.compression === 'lossless'}
              onClick={() => onChange({ compression: 'lossless' })}
            >
              <span className="radio-dot" />
              <div>
                <strong>Preserve text</strong>
                <span>
                  Optimize streams and PDF objects.
                  <br />
                  Keep selectable text and links.
                </span>
              </div>
              <span className="small-label">DEFAULT</span>
            </button>
            <button
              type="button"
              className={o.compression === 'image' ? 'mode-option selected' : 'mode-option'}
              aria-pressed={o.compression === 'image'}
              onClick={() => onChange({ compression: 'image' })}
            >
              <span className="radio-dot" />
              <div>
                <strong>Stronger compression</strong>
                <span>Rebuild pages as smaller images.</span>
              </div>
            </button>
          </div>
          {o.compression === 'image' ? (
            <>
              <div className="warning-note">
                <AlertTriangle size={17} />
                <p>
                  This flattens pages into images. Selectable text, links, forms, and interactive
                  fields, vector content, bookmarks, attachments and accessibility tags will be
                  removed.
                </p>
              </div>
              <Range
                label="Image quality"
                value={o.quality}
                min={0.35}
                max={0.9}
                step={0.05}
                display={`${Math.round(o.quality * 100)}%`}
                onChange={(quality) => onChange({ quality })}
              />
              <p className="field-hint">
                Lower quality makes smaller files. Higher quality keeps more detail.
              </p>
            </>
          ) : (
            <p className="field-hint">
              Some PDFs are already optimized. If we can’t make it smaller, we’ll keep the original.
            </p>
          )}
        </>
      )}
      {tool === 'rotate' && (
        <>
          {range}
          <Field label="Rotate clockwise">
            <div className="segmented">
              {[90, 180, 270].map((angle) => (
                <button
                  type="button"
                  key={angle}
                  className={o.angle === angle ? 'active' : ''}
                  aria-pressed={o.angle === angle}
                  onClick={() => onChange({ angle })}
                >
                  {angle}°
                </button>
              ))}
            </div>
          </Field>
        </>
      )}
      {tool === 'images-to-pdf' && (
        <>
          <Field label="Page size">
            <select
              aria-label="Page size"
              value={o.pageSize}
              onChange={(event) =>
                onChange({ pageSize: event.target.value as ToolOptions['pageSize'] })
              }
            >
              <option value="a4">A4 — 210 × 297 mm</option>
              <option value="letter">US Letter — 8.5 × 11 in</option>
              <option value="original">Fit page to image</option>
            </select>
          </Field>
          {o.pageSize !== 'original' && (
            <Field label="Orientation">
              <select
                aria-label="Orientation"
                value={o.orientation}
                onChange={(event) =>
                  onChange({ orientation: event.target.value as ToolOptions['orientation'] })
                }
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </Field>
          )}
          <Range
            label="Margins"
            min={0}
            max={72}
            value={o.margin}
            display={`${o.margin} pt`}
            onChange={(margin) => onChange({ margin })}
          />
          <Field label="Image fit">
            <select
              aria-label="Image fit"
              value={o.fit}
              onChange={(event) => onChange({ fit: event.target.value as ToolOptions['fit'] })}
            >
              <option value="contain">Contain — show whole image</option>
              <option value="cover">Cover — fill and crop</option>
            </select>
          </Field>
          <p className="field-hint">
            Images are placed one per page. Very large images are resized to a maximum of 4096
            pixels on their longest side.
          </p>
        </>
      )}
      {tool === 'pdf-to-images' && (
        <>
          {range}
          <Field label="Image format">
            <select
              aria-label="Image format"
              value={o.imageFormat}
              onChange={(event) =>
                onChange({ imageFormat: event.target.value as ToolOptions['imageFormat'] })
              }
            >
              <option value="png">PNG — crisp, lossless images</option>
              <option value="jpeg">JPEG — smaller files</option>
            </select>
          </Field>
          <Field label="Resolution">
            <select
              aria-label="Resolution"
              value={o.dpi}
              onChange={(event) => onChange({ dpi: Number(event.target.value) })}
            >
              <option value={72}>72 DPI — screen</option>
              <option value={144}>144 DPI — balanced</option>
              <option value={216}>216 DPI — high detail</option>
            </select>
          </Field>
          {o.imageFormat === 'jpeg' && (
            <Range
              label="Image quality"
              min={0.35}
              max={0.95}
              step={0.05}
              value={o.quality}
              display={`${Math.round(o.quality * 100)}%`}
              onChange={(quality) => onChange({ quality })}
            />
          )}
          <p className="field-hint">
            Images are capped at 4096 pixels on their longest side. Multiple pages download as a
            ZIP.
          </p>
        </>
      )}
      {tool === 'watermark' && (
        <>
          <Field label="Watermark text">
            <input
              aria-label="Watermark text"
              value={o.text}
              onChange={(event) => onChange({ text: event.target.value })}
            />
          </Field>
          {range}
          <Range
            label="Text size"
            min={12}
            max={100}
            value={o.fontSize}
            display={`${o.fontSize} pt`}
            onChange={(fontSize) => onChange({ fontSize })}
          />
          <Range
            label="Opacity"
            min={0.05}
            max={1}
            step={0.05}
            value={o.opacity}
            display={`${Math.round(o.opacity * 100)}%`}
            onChange={(opacity) => onChange({ opacity })}
          />
          <Range
            label="Text rotation"
            min={-90}
            max={90}
            value={o.textAngle}
            display={`${o.textAngle}°`}
            onChange={(textAngle) => onChange({ textAngle })}
          />
          <Field label="Text color">
            <input
              aria-label="Text color"
              type="color"
              value={o.color}
              onChange={(event) => onChange({ color: event.target.value })}
            />
          </Field>
          {position}
        </>
      )}
      {tool === 'page-numbers' && (
        <>
          {range}
          <Field label="Start numbering at">
            <input
              aria-label="Start numbering at"
              type="number"
              min={1}
              max={99999}
              value={o.startNumber}
              onChange={(event) => onChange({ startNumber: Number(event.target.value) })}
            />
          </Field>
          <Field label="Number style">
            <select
              aria-label="Number style"
              value={o.numberStyle}
              onChange={(event) =>
                onChange({ numberStyle: event.target.value as ToolOptions['numberStyle'] })
              }
            >
              <option value="number">1, 2, 3</option>
              <option value="page">Page 1, Page 2</option>
              <option value="total">1 / 10, 2 / 10</option>
              <option value="custom">Custom text template</option>
            </select>
          </Field>
          <Range
            label="Text size"
            min={8}
            max={32}
            value={o.fontSize}
            display={`${o.fontSize} pt`}
            onChange={(fontSize) => onChange({ fontSize })}
          />
          <Field label="Text color">
            <input
              aria-label="Text color"
              type="color"
              value={o.color}
              onChange={(event) => onChange({ color: event.target.value })}
            />
          </Field>
          {position}
        </>
      )}
      {tool === 'protect' && (
        <>
          <div className="settings-security">
            <LockKeyhole size={20} />
            <span>
              AES-256 encryption
              <br />
              <small>Applied entirely on this device</small>
            </span>
          </div>
          <Field label="New password">
            <input
              aria-label="New password"
              type="password"
              autoComplete="new-password"
              value={o.password}
              onChange={(event) => onChange({ password: event.target.value })}
            />
          </Field>
          <Field label="Confirm password">
            <input
              aria-label="Confirm password"
              type="password"
              autoComplete="new-password"
              value={o.confirmPassword}
              onChange={(event) => onChange({ confirmPassword: event.target.value })}
            />
          </Field>
          <p className="field-hint">
            Use 1–127 UTF-8 bytes. Unicode may need more than one byte per character. Choose a
            strong password and keep it somewhere safe. Paperlight cannot recover it for you.
          </p>
        </>
      )}
      {tool === 'unlock' && (
        <div className="settings-explainer">
          <h4>Remove password protection</h4>
          <p>
            If this file is password protected, you’ll be asked for its current password when you
            select it.
          </p>
          <p>
            Download a copy that opens without a password. No password cracking or recovery is
            performed.
          </p>
        </div>
      )}
      {tool === 'sign' && (
        <>
          <SignatureEditor onChange={signatureChanged} onError={onError} />
          <SignFields options={o} onChange={onChange} onError={onError} />
          {!o.annotations.length && (
            <>
              {range}
              <Range
                label="Signature width"
                min={0.1}
                max={0.7}
                step={0.02}
                value={o.signatureWidth}
                display={`${Math.round(o.signatureWidth * 100)}% of page`}
                onChange={(signatureWidth) => onChange({ signatureWidth })}
              />
              {position}
            </>
          )}
        </>
      )}
    </div>
  );
}
