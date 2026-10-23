import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Annotation, ToolOptions, TextStyle, PdfFont } from '../lib/types';
import type { ToolId } from '../lib/tools';
import { artwork } from '../lib/artwork';
import { uuid } from '../lib/utils';
type Change = (patch: Partial<ToolOptions>) => void;
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Check({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="checkbox-field">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
export function ArtworkUpload({
  label,
  onChange,
  onError,
}: {
  label: string;
  onChange: (data: Uint8Array) => void;
  onError: (s: string) => void;
}) {
  const generation = useRef(0);
  const [loading, setLoading] = useState(false);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  return (
    <Field label={label}>
      <input
        type="file"
        aria-label={label}
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        disabled={loading}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const token = ++generation.current;
          setLoading(true);
          try {
            const data = await artwork(file);
            if (token === generation.current) onChange(data);
          } catch (error) {
            if (token === generation.current)
              onError(error instanceof Error ? error.message : 'The artwork could not be read.');
          } finally {
            if (token === generation.current) setLoading(false);
            e.target.value = '';
          }
        }}
      />
      {loading && <span className="field-hint">Preparing artwork…</span>}
    </Field>
  );
}
export function TextAppearance({
  value,
  onChange,
}: {
  value: TextStyle;
  onChange: (v: Partial<TextStyle>) => void;
}) {
  return (
    <>
      <Field label="Font family">
        <select
          aria-label="Font family"
          value={value.fontFamily}
          onChange={(e) => onChange({ fontFamily: e.target.value as PdfFont })}
        >
          <option value="sans">Sans serif</option>
          <option value="serif">Serif</option>
          <option value="mono">Monospace</option>
          <option value="signature">Signature italic</option>
        </select>
      </Field>
      <div className="field-row">
        <Check label="Bold" value={value.bold} onChange={(bold) => onChange({ bold })} />
        <Check label="Italic" value={value.italic} onChange={(italic) => onChange({ italic })} />
      </div>
      <Check label="Text shadow" value={value.shadow} onChange={(shadow) => onChange({ shadow })} />
      <Check
        label="Text background"
        value={!!value.background}
        onChange={(enabled) => onChange({ background: enabled ? '#ffffff' : '' })}
      />
      {value.background && (
        <Field label="Background color">
          <input
            type="color"
            aria-label="Background color"
            value={value.background}
            onChange={(e) => onChange({ background: e.target.value })}
          />
        </Field>
      )}
    </>
  );
}
export function ExtraSettings({
  tool,
  options: o,
  onChange,
  onError,
}: {
  tool: ToolId;
  options: ToolOptions;
  onChange: Change;
  onError: (s: string) => void;
}) {
  return (
    <>
      {tool === 'split' && (
        <>
          {o.splitMode === 'ranges' && (
            <>
              <Field label="Page groups">
                <input
                  aria-label="Page groups"
                  value={o.groups}
                  placeholder="1-3; 4-6; 7,9"
                  onChange={(e) => onChange({ groups: e.target.value })}
                />
                <span className="field-hint">Separate groups with semicolons.</span>
              </Field>
              <Check
                label="Combine all groups into one PDF"
                value={o.combineRanges}
                onChange={(combineRanges) => onChange({ combineRanges })}
              />
            </>
          )}
          {o.splitMode === 'fixed' && (
            <Field label="Pages per file">
              <input
                aria-label="Pages per file"
                type="number"
                min={1}
                max={500}
                value={o.groupSize}
                onChange={(e) => onChange({ groupSize: Number(e.target.value) })}
              />
            </Field>
          )}
          {o.splitMode === 'size' && (
            <>
              <Field label="Maximum file size (KiB)">
                <input
                  aria-label="Maximum file size (KiB)"
                  type="number"
                  min={1}
                  max={131072}
                  value={o.maximumKiB}
                  onChange={(e) => onChange({ maximumKiB: Number(e.target.value) })}
                />
                <span className="field-hint">
                  1,024 KiB = 1 MiB. A single page larger than this limit cannot be split.
                </span>
              </Field>
              <Check
                label="Allow image compression"
                value={o.splitCompress}
                onChange={(splitCompress) => onChange({ splitCompress })}
              />
              {o.splitCompress && (
                <p className="field-hint">
                  Image quality may decrease. Text and vectors remain intact.
                </p>
              )}
            </>
          )}
        </>
      )}
      {tool === 'compress' && (
        <>
          <button
            type="button"
            className={'mode-option ' + (o.compression === 'optimized' ? 'selected' : '')}
            aria-pressed={o.compression === 'optimized'}
            onClick={() => onChange({ compression: 'optimized' })}
          >
            <span className="radio-dot" />
            <div>
              <strong>Optimize embedded images</strong>
              <span>Reduce image quality while retaining text, vectors, links, and fields.</span>
            </div>
          </button>
          {o.compression === 'optimized' && (
            <Field label="Compression level">
              <select
                aria-label="Compression level"
                value={o.compressionLevel}
                onChange={(e) =>
                  onChange({ compressionLevel: Number(e.target.value) as 90 | 75 | 50 })
                }
              >
                <option value={90}>Less — higher image quality</option>
                <option value={75}>Balanced — recommended</option>
                <option value={50}>Extreme — smaller images</option>
              </select>
              <span className="field-hint">
                This changes image quality. Savings depend on your document.
              </span>
            </Field>
          )}
        </>
      )}
      {tool === 'rotate' && (
        <>
          <Field label="Target orientation">
            <select
              aria-label="Target orientation"
              value={o.rotationTarget}
              onChange={(e) =>
                onChange({ rotationTarget: e.target.value as ToolOptions['rotationTarget'] })
              }
            >
              <option value="all">All selected pages</option>
              <option value="portrait">Portrait pages</option>
              <option value="landscape">Landscape pages</option>
            </select>
          </Field>
          <button
            type="button"
            className="button secondary small"
            onClick={() => onChange({ angle: 0, rotationTarget: 'all', range: '' })}
          >
            Reset rotation settings
          </button>
        </>
      )}
      {tool === 'images-to-pdf' && (
        <Field label="PDF output">
          <select
            aria-label="PDF output"
            value={o.imageOutput}
            onChange={(e) =>
              onChange({ imageOutput: e.target.value as ToolOptions['imageOutput'] })
            }
          >
            <option value="combined">Combine images into one PDF</option>
            <option value="separate">One PDF per image</option>
          </select>
        </Field>
      )}
      {tool === 'pdf-to-images' && (
        <Field label="Conversion mode">
          <select
            aria-label="Conversion mode"
            value={o.exportMode}
            onChange={(e) => onChange({ exportMode: e.target.value as ToolOptions['exportMode'] })}
          >
            <option value="pages">Render PDF pages</option>
            <option value="extract">Extract embedded images</option>
          </select>
          <span className="field-hint">
            Extraction exports decoded raster artwork, once per image object on each page. Text and
            vector drawings are excluded.
          </span>
        </Field>
      )}
      {tool === 'watermark' && (
        <>
          <Field label="Watermark type">
            <select
              aria-label="Watermark type"
              value={o.watermarkType}
              onChange={(e) =>
                onChange({ watermarkType: e.target.value as ToolOptions['watermarkType'] })
              }
            >
              <option value="text">Text</option>
              <option value="image">Image</option>
            </select>
          </Field>
          {o.watermarkType === 'image' && (
            <>
              <ArtworkUpload
                label="Watermark image"
                onChange={(watermarkImage) => onChange({ watermarkImage })}
                onError={onError}
              />
              <Field label="Image width (%)">
                <input
                  aria-label="Image width (%)"
                  type="number"
                  min={1}
                  max={100}
                  value={Math.round(o.watermarkWidth * 100)}
                  onChange={(e) => onChange({ watermarkWidth: Number(e.target.value) / 100 })}
                />
              </Field>
              {o.watermarkImage && <span className="field-hint">Artwork ready.</span>}
            </>
          )}
          <Check
            label="Repeat as a tiled watermark"
            value={o.tile}
            onChange={(tile) => onChange({ tile })}
          />
          <Field label="Watermark layer">
            <select
              aria-label="Watermark layer"
              value={o.layer}
              onChange={(e) => onChange({ layer: e.target.value as 'above' | 'below' })}
            >
              <option value="above">Above PDF content</option>
              <option value="below">Below PDF content</option>
            </select>
            <span className="field-hint">
              Opaque page backgrounds can hide watermarks placed underneath.
            </span>
          </Field>
        </>
      )}
      {tool === 'page-numbers' && (
        <>
          <Check
            label="Facing pages"
            value={o.facingPages}
            onChange={(facingPages) => onChange({ facingPages })}
          />
          <Check
            label="First page is a cover"
            value={o.coverPage}
            onChange={(coverPage) => onChange({ coverPage })}
          />
          <Field label="Minimum margin (pt)">
            <input
              aria-label="Minimum margin (pt)"
              type="number"
              min={0}
              max={144}
              value={o.numberMargin}
              onChange={(e) => onChange({ numberMargin: Number(e.target.value) })}
            />
          </Field>
          {o.numberStyle === 'custom' && (
            <Field label="Number template">
              <input
                aria-label="Number template"
                value={o.numberTemplate}
                onChange={(e) => onChange({ numberTemplate: e.target.value })}
              />
              <span className="field-hint">
                {'{n} counter · {p} document pages · {r} selected pages · {rf} final counter'}
              </span>
            </Field>
          )}
          <Field label="Number opacity">
            <input
              aria-label="Number opacity"
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={o.opacity}
              onChange={(e) => onChange({ opacity: Number(e.target.value) })}
            />
          </Field>
        </>
      )}
      {(tool === 'watermark' || tool === 'page-numbers') && (
        <details className="advanced-settings">
          <summary>Typography & appearance</summary>
          <TextAppearance value={o} onChange={onChange} />
        </details>
      )}
      {tool === 'protect' && (
        <details className="advanced-settings">
          <summary>Advanced protection</summary>
          <Check
            label="Enable permission controls"
            value={o.advancedProtection}
            onChange={(advancedProtection) => onChange({ advancedProtection })}
          />
          {o.advancedProtection && (
            <>
              <Check
                label="Require an opening password"
                value={o.restrictAccess}
                onChange={(restrictAccess) => onChange({ restrictAccess })}
              />
              <Field label="Permissions password">
                <input
                  aria-label="Permissions password"
                  type="password"
                  autoComplete="new-password"
                  value={o.ownerPassword}
                  onChange={(e) => onChange({ ownerPassword: e.target.value })}
                />
              </Field>
              <Field label="Confirm permissions password">
                <input
                  aria-label="Confirm permissions password"
                  type="password"
                  autoComplete="new-password"
                  value={o.confirmOwnerPassword}
                  onChange={(e) => onChange({ confirmOwnerPassword: e.target.value })}
                />
              </Field>
              {(
                [
                  ['print', 'Allow printing'],
                  ['copy', 'Allow copying'],
                  ['modify', 'Allow content editing'],
                  ['annotate', 'Allow comments'],
                  ['forms', 'Allow form filling'],
                  ['assemble', 'Allow document assembly'],
                ] as const
              ).map(([key, label]) => (
                <Check
                  key={key}
                  label={label}
                  value={o.permissions[key]}
                  onChange={(v) => onChange({ permissions: { ...o.permissions, [key]: v } })}
                />
              ))}
              <p className="field-hint">
                Permissions depend on the PDF reader. They do not prevent screenshots or replace an
                opening password. Accessibility extraction remains enabled under modern encryption.
              </p>
            </>
          )}
        </details>
      )}
    </>
  );
}
export function SignFields({
  options: o,
  onChange,
  onError,
}: {
  options: ToolOptions;
  onChange: Change;
  onError: (s: string) => void;
}) {
  const [kind, setKind] = useState<Annotation['kind']>('signature'),
    [active, setActive] = useState(''),
    [past, setPast] = useState<Annotation[][]>([]),
    [future, setFuture] = useState<Annotation[][]>([]);
  const previous = useRef(o.annotations),
    local = useRef(false);
  useEffect(() => {
    if (previous.current !== o.annotations) {
      if (!local.current) {
        const before = previous.current;
        setPast((p) => [...p.slice(-19), before]);
        setFuture([]);
      }
      previous.current = o.annotations;
      local.current = false;
    }
  }, [o.annotations]);
  const field = o.annotations.find((a) => a.id === active);
  const change = (next: Annotation[]) => {
    local.current = true;
    setPast((p) => [...p.slice(-19), o.annotations]);
    setFuture([]);
    onChange({ annotations: next });
  };
  const edit = (patch: Partial<Annotation>) =>
    change(o.annotations.map((a) => (a.id === active ? { ...a, ...patch } : a)));
  return (
    <details className="advanced-settings" open>
      <summary>Signature fields</summary>
      <Field label="Field type">
        <select
          aria-label="Field type"
          value={kind}
          onChange={(e) => setKind(e.target.value as Annotation['kind'])}
        >
          {(['signature', 'initials', 'name', 'date', 'text', 'stamp'] as const).map((k) => (
            <option key={k} value={k}>
              {k[0].toUpperCase() + k.slice(1)}
            </option>
          ))}
        </select>
      </Field>
      <button
        type="button"
        className="button secondary"
        onClick={() => {
          if (o.annotations.length >= 500) {
            onError('Use no more than 500 fields.');
            return;
          }
          if ((kind === 'signature' || kind === 'initials' || kind === 'stamp') && !o.signature) {
            onError('Draw, type, or upload artwork above before adding this field.');
            return;
          }
          const id = uuid();
          change([
            ...o.annotations,
            {
              id,
              kind,
              range: o.range || '1',
              width: o.signatureWidth,
              x: o.x,
              y: o.y,
              fontFamily: o.fontFamily,
              bold: o.bold,
              italic: o.italic,
              background: o.background,
              shadow: o.shadow,
              image: ['signature', 'initials', 'stamp'].includes(kind) ? o.signature : undefined,
              text:
                kind === 'date'
                  ? new Date().toLocaleDateString('en-CA')
                  : kind === 'name'
                    ? 'Your name'
                    : kind === 'text'
                      ? 'Text'
                      : '',
              opacity: 1,
              textAngle: 0,
              fontSize: 24,
              color: '#20242d',
            },
          ]);
          setActive(id);
        }}
      >
        Add field
      </button>
      <div className="annotation-list" aria-label="Signature fields">
        {o.annotations.map((a, i) => (
          <button
            type="button"
            key={a.id}
            className={active === a.id ? 'active' : ''}
            onClick={() => setActive(a.id)}
          >
            {i + 1}. {a.kind} · pages {a.range || 'all'}
          </button>
        ))}
      </div>
      {field && (
        <>
          <Field label="Field pages">
            <input
              aria-label="Field pages"
              value={field.range}
              placeholder="All pages"
              onChange={(e) => edit({ range: e.target.value })}
            />
          </Field>
          {field.image ? (
            <ArtworkUpload
              label="Replace field artwork"
              onChange={(image) => edit({ image })}
              onError={onError}
            />
          ) : (
            <Field label="Field text">
              <input
                aria-label="Field text"
                value={field.text}
                onChange={(e) => edit({ text: e.target.value })}
              />
            </Field>
          )}
          <div className="field-row">
            {(
              [
                ['x', 'Horizontal (%)'],
                ['y', 'Vertical (%)'],
                ['width', 'Field width (%)'],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  aria-label={label}
                  type="number"
                  min={key === 'width' ? 1 : 0}
                  max={100}
                  value={Math.round(field[key] * 100)}
                  onChange={(e) => edit({ [key]: Number(e.target.value) / 100 })}
                />
              </Field>
            ))}
            <Field label="Field rotation">
              <input
                aria-label="Field rotation"
                type="number"
                min={-180}
                max={180}
                value={field.textAngle}
                onChange={(e) => edit({ textAngle: Number(e.target.value) })}
              />
            </Field>
          </div>
          {!field.image && (
            <>
              <Field label="Field text size">
                <input
                  aria-label="Field text size"
                  type="number"
                  min={1}
                  max={200}
                  value={field.fontSize}
                  onChange={(e) => edit({ fontSize: Number(e.target.value) })}
                />
              </Field>
              <Field label="Field color">
                <input
                  type="color"
                  aria-label="Field color"
                  value={field.color}
                  onChange={(e) => edit({ color: e.target.value })}
                />
              </Field>
              <TextAppearance value={field} onChange={edit} />
            </>
          )}
          <Field label="Field opacity">
            <input
              aria-label="Field opacity"
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={field.opacity}
              onChange={(e) => edit({ opacity: Number(e.target.value) })}
            />
          </Field>
          <div className="field-row">
            <button
              type="button"
              className="button secondary small"
              onClick={() => {
                if (o.annotations.length >= 500) return;
                const id = uuid();
                change([
                  ...o.annotations,
                  {
                    ...field,
                    id,
                    x: Math.min(0.95, field.x + 0.03),
                    y: Math.min(0.95, field.y + 0.03),
                  },
                ]);
                setActive(id);
              }}
            >
              Duplicate field
            </button>
            <button
              type="button"
              className="button secondary small"
              onClick={() => {
                change(o.annotations.filter((a) => a.id !== active));
                setActive('');
              }}
            >
              Delete field
            </button>
          </div>
        </>
      )}
      <div className="field-row">
        <button
          type="button"
          className="button secondary small"
          disabled={!past.length}
          onClick={() => {
            local.current = true;
            setFuture((f) => [o.annotations, ...f]);
            onChange({ annotations: past[past.length - 1] });
            setPast((p) => p.slice(0, -1));
          }}
        >
          Undo field change
        </button>
        <button
          type="button"
          className="button secondary small"
          disabled={!future.length}
          onClick={() => {
            local.current = true;
            setPast((p) => [...p, o.annotations]);
            onChange({ annotations: future[0] });
            setFuture((f) => f.slice(1));
          }}
        >
          Redo field change
        </button>
      </div>
      <p className="field-hint">
        Each field has its own position and page range. Added fields replace the single-signature
        preview above.
      </p>
    </details>
  );
}
