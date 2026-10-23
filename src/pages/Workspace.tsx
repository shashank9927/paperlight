import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Grid2X2,
  HelpCircle,
  ImagePlus,
  LayoutPanelLeft,
  LockKeyhole,
  Plus,
  RotateCw,
  ShieldCheck,
  Trash2,
  Undo2,
  Redo2,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';
import { getTool } from '../lib/tools';
import { configureJob } from '../lib/tool-config';
import { defaultOptions, MAX_BYTES, MAX_PAGES } from '../lib/types';
import type { PageRef, ProcessingResult, ToolOptions, WorkerResponse } from '../lib/types';
import type { PreviewFile } from '../lib/preview';
import { downloadFile, formatBytes, parseRange, uuid } from '../lib/utils';
import { PagePreview } from '../components/PagePreview';
import { SortableItem, SortableList } from '../components/Sortable';
import { ToolSettings } from '../components/ToolSettings';
import { Modal } from '../components/Modal';
import { ToolGuide } from '../components/ToolGuide';

interface PasswordRequest {
  name: string;
  message: string;
  resolve: (password: string | null) => void;
}
const rearrange = <T,>(items: T[], from: number, to: number) => {
  const next = [...items];
  if (from < 0 || to < 0 || to >= items.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};
const initialOptions = (tool: string): ToolOptions => ({
  ...defaultOptions,
  ...(tool === 'page-numbers'
    ? { fontSize: 12, color: '#30343b', y: 0.92, textAngle: 0, opacity: 1 }
    : {}),
  ...(tool === 'sign' ? { range: '1', x: 0.7, y: 0.82 } : {}),
});

export default function Workspace() {
  const { toolId = '' } = useParams();
  const tool = getTool(toolId);
  // Native file changes must wait until this lazy boundary has attached React handlers.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  const [files, setFiles] = useState<PreviewFile[]>([]);
  const filesRef = useRef<PreviewFile[]>([]);
  const [pages, setPages] = useState<PageRef[]>([]);
  const [history, setHistory] = useState<PageRef[][]>([]);
  const [future, setFuture] = useState<PageRef[][]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [options, setOptions] = useState<ToolOptions>(() => initialOptions(toolId));
  const [settingsEpoch, setSettingsEpoch] = useState(0);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [help, setHelp] = useState(false);
  const [filePreview, setFilePreview] = useState<{ sourceId: string; index: number } | null>(null);
  const [progress, setProgress] = useState<Extract<WorkerResponse, { type: 'progress' }> | null>(
    null,
  );
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [passwordRequest, setPasswordRequest] = useState<PasswordRequest | null>(null);
  const requestRef = useRef<PasswordRequest | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [previewMode, setPreviewMode] = useState<'grid' | 'focus'>(
    ['watermark', 'page-numbers', 'sign', 'protect', 'unlock', 'compress'].includes(toolId)
      ? 'focus'
      : 'grid',
  );
  const [focus, setFocus] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const worker = useRef<Worker | null>(null);
  const processingTimer = useRef<number | undefined>(undefined);
  const stopWorker = useCallback(() => {
    window.clearTimeout(processingTimer.current);
    processingTimer.current = undefined;
    worker.current?.terminate();
    worker.current = null;
  }, []);
  const generation = useRef(0);
  const inspection = useRef<AbortController | null>(null);
  const addingRef = useRef(false);
  const progressRegion = useRef<HTMLDivElement>(null);
  const resultRegion = useRef<HTMLDivElement>(null);
  const settingsTitle = useRef<HTMLDivElement>(null);
  const onError = useCallback((message: string) => setError(message), []);
  const onOptionsChange = useCallback(
    (change: Partial<ToolOptions>) => setOptions((previous) => ({ ...previous, ...change })),
    [],
  );
  const replaceFiles = (next: PreviewFile[]) => {
    filesRef.current = next;
    setFiles(next);
  };
  const askPassword = (name: string, message: string) =>
    new Promise<string | null>((resolve) => {
      const request = { name, message, resolve };
      requestRef.current = request;
      setPasswordInput('');
      setPasswordRequest(request);
    });
  const closePassword = (password: string | null) => {
    requestRef.current?.resolve(password);
    requestRef.current = null;
    setPasswordRequest(null);
    setPasswordInput('');
  };
  useEffect(() => {
    return () => {
      generation.current++;
      inspection.current?.abort();
      addingRef.current = false;
      stopWorker();
      filesRef.current.forEach((file) => void file.dispose?.());
      requestRef.current?.resolve(null);
    };
  }, [tool?.title, stopWorker]);
  useEffect(() => {
    if (result) resultRegion.current?.focus();
  }, [result]);
  useEffect(() => {
    const valid = new Set(pages.map((page) => page.id));
    setSelectedIds((previous) =>
      [...previous].some((id) => !valid.has(id))
        ? new Set([...previous].filter((id) => valid.has(id)))
        : previous,
    );
  }, [pages]);
  if (!tool)
    return (
      <main id="main" className="not-found">
        <h1>That tool isn’t in the toolkit.</h1>
        <Link to="/#tools" className="button primary">
          Explore all tools
        </Link>
      </main>
    );

  const isImages = tool.id === 'images-to-pdf';
  const multiple = !['split', 'sign'].includes(tool.id);
  const fileList = isImages || tool.id === 'merge';
  const busy = adding || !!progress;
  const totalBytes = files.reduce((sum, file) => sum + file.file.size, 0);
  const count = files.reduce((sum, file) => sum + file.pages.length, 0);
  const displayCount = tool.id === 'organize' ? pages.length : count;
  const previewedFile = files.find((file) => file.id === filePreview?.sourceId);
  let rangeIndices: number[] = [];
  try {
    rangeIndices = parseRange(options.range, files[0]?.pages.length || 0);
  } catch {
    /* Invalid ranges are shown when submitted; previews remain available. */
  }
  const selectedSet = new Set(rangeIndices);
  const pageChange = (next: PageRef[]) => {
    setHistory((previous) => [...previous.slice(-19), pages]);
    setFuture([]);
    setPages(next);
    setResult(null);
  };
  const reset = () => {
    generation.current++;
    inspection.current?.abort();
    addingRef.current = false;
    stopWorker();
    filesRef.current.forEach((file) => void file.dispose?.());
    replaceFiles([]);
    setPages([]);
    setHistory([]);
    setFuture([]);
    setSelectedIds(new Set());
    setProgress(null);
    setAdding(false);
    setResult(null);
    setError('');
    setFocus(0);
    setFilePreview(null);
    closePassword(null);
    setOptions(initialOptions(toolId));
    setSettingsEpoch((previous) => previous + 1);
    if (input.current) input.current.value = '';
  };
  const addFiles = async (incoming: File[]) => {
    if (addingRef.current || progress || !incoming.length) return;
    if (!multiple && incoming.length > 1) {
      setError('This tool works with one PDF at a time. Choose one file to continue.');
      return;
    }
    if (!multiple && filesRef.current.length) {
      setError('Clear the current file before selecting a different one.');
      return;
    }
    if (incoming.reduce((sum, file) => sum + file.size, totalBytes) > MAX_BYTES) {
      setError('Please keep the combined file size below 100 MB.');
      return;
    }
    addingRef.current = true;
    setAdding(true);
    setError('');
    setResult(null);
    const gen = generation.current;
    const controller = new AbortController();
    inspection.current = controller;
    try {
      const { inspectFile } = await import('../lib/preview');
      for (const file of incoming) {
        if (gen !== generation.current) break;
        let password: string | undefined;
        let loaded: Omit<PreviewFile, 'id'> | undefined;
        while (!loaded && gen === generation.current) {
          try {
            loaded = await inspectFile(file, isImages, password, controller.signal);
          } catch (failure) {
            if (gen !== generation.current) break;
            if (failure instanceof Error && failure.name === 'PasswordException') {
              const entered = await askPassword(
                file.name,
                password === undefined
                  ? 'This PDF needs its current password. It stays in this tab and is never uploaded.'
                  : 'That password didn’t open the PDF. Please try again.',
              );
              if (entered === null) break;
              password = entered;
            } else throw failure;
          }
        }
        if (!loaded) continue;
        if (gen !== generation.current) {
          await loaded.dispose?.();
          break;
        }
        const newCount =
          filesRef.current.reduce((sum, entry) => sum + entry.pages.length, 0) +
          loaded.pages.length;
        if (newCount > MAX_PAGES) {
          await loaded.dispose?.();
          throw new Error(
            'Choose no more than 500 pages per job. Try splitting the document into smaller batches.',
          );
        }
        const source: PreviewFile = { ...loaded, id: uuid() };
        replaceFiles([...filesRef.current, source]);
        setPages((previous) => [
          ...previous,
          ...source.pages.map((_, index) => ({
            id: uuid(),
            sourceId: source.id,
            index,
            rotation: 0,
          })),
        ]);
      }
    } catch (failure) {
      if (gen === generation.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'This file could not be opened. Please choose a valid document.',
        );
    } finally {
      if (gen === generation.current) {
        setAdding(false);
        addingRef.current = false;
      }
      if (input.current) input.current.value = '';
    }
  };
  const removeFile = (id: string) => {
    const removed = files.find((file) => file.id === id);
    replaceFiles(files.filter((file) => file.id !== id));
    setPages((previous) => previous.filter((page) => page.sourceId !== id));
    setHistory([]);
    setFuture([]);
    setFocus(0);
    void removed?.dispose?.();
    setResult(null);
  };
  const run = (references = pages) => {
    if (worker.current || addingRef.current) return;
    setError('');
    setResult(null);
    try {
      if (!files.length) throw new Error('Choose your files first.');
      if (tool.id === 'merge' && files.length < 2)
        throw new Error('Add at least two PDFs to merge them.');
      if (
        !['merge', 'organize', 'images-to-pdf', 'compress', 'protect', 'unlock'].includes(tool.id)
      )
        parseRange(options.range, count);
      if (
        tool.id === 'protect' &&
        (!options.advancedProtection || options.restrictAccess) &&
        (!options.password || options.password !== options.confirmPassword)
      )
        throw new Error('Enter a password and make sure both passwords match.');
      if (tool.id === 'watermark' && options.watermarkType === 'text' && !options.text.trim())
        throw new Error('Add some text for your watermark.');
      if (tool.id === 'sign' && !options.signature && !options.annotations.length)
        throw new Error('Draw, type, or upload your signature first.');
      if (
        tool.id === 'page-numbers' &&
        (!Number.isInteger(options.startNumber) ||
          options.startNumber < 1 ||
          options.startNumber > 99999)
      )
        throw new Error('Choose a starting page number between 1 and 99999.');
      if (!references.length) throw new Error('Keep at least one page in the document.');
      const instance = new Worker(new URL('../lib/processor.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.current = instance;
      processingTimer.current = window.setTimeout(() => {
        if (worker.current !== instance) return;
        stopWorker();
        setProgress(null);
        setError(
          'Processing exceeded the two-minute safety limit. Try fewer pages or a lower resolution. Your files and settings are still here.',
        );
      }, 120_000);
      setProgress({ type: 'progress', message: 'Getting things ready…' });
      instance.onmessage = (event: MessageEvent<WorkerResponse>) => {
        if (worker.current !== instance) return;
        // PDF.js may emit its own worker initialization messages while loading.
        if (!event.data || !['progress', 'result', 'error'].includes(event.data.type)) return;
        if (event.data.type === 'progress') setProgress(event.data);
        else {
          setProgress(null);
          if (event.data.type === 'result') {
            setResult(event.data.result);
            setOptions((previous) => ({
              ...previous,
              password: '',
              confirmPassword: '',
              ownerPassword: '',
              confirmOwnerPassword: '',
            }));
          } else setError(event.data.message);
          stopWorker();
        }
      };
      instance.onerror = (event) => {
        if (worker.current !== instance) return;
        event.preventDefault();
        setProgress(null);
        setError(
          'The processing worker could not finish. Please try again, or use a smaller document if your device is low on memory.',
        );
        stopWorker();
      };
      instance.postMessage({
        type: 'process',
        job: configureJob({
          tool: tool.id,
          sources: files.map(({ id, file, password }) => ({ id, file, password })),
          pages: references,
          options,
        }),
      });
      requestAnimationFrame(() => progressRegion.current?.focus());
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Please check your settings and try again.',
      );
    }
  };
  const cancel = () => {
    stopWorker();
    setProgress(null);
    setError('Processing was cancelled. Your files and settings are still here.');
  };
  const focusIndex = Math.min(focus, pages.length - 1);
  const focusPage = pages[focusIndex];
  const focusSource = files.find((file) => file.id === focusPage?.sourceId) || focusPage?.blank;
  const blankSource: PreviewFile = {
    id: 'blank',
    file: new File([], 'Blank page'),
    pages: [{ width: 595.28, height: 841.89, rotation: 0 }],
  };
  const sourceFor = (page: PageRef) =>
    page.blank
      ? { ...blankSource, pages: [{ ...page.blank, rotation: 0 }] }
      : files.find((file) => file.id === page.sourceId)!;
  const preview = (page: PageRef, large = false) => {
    let previewIndices: number[] = [];
    try {
      previewIndices = parseRange(options.range, sourceFor(page).pages.length).filter(
        (index) => !(tool.id === 'page-numbers' && options.coverPage && index === 0),
      );
    } catch {
      /* Validation occurs on export. */
    }
    return (
      <PagePreview
        key={page.id}
        source={sourceFor(page)}
        page={page}
        large={large}
        tool={tool.id}
        options={options}
        selected={(() => {
          try {
            return (
              parseRange(options.range, sourceFor(page).pages.length).includes(page.index) &&
              !(tool.id === 'page-numbers' && options.coverPage && page.index === 0)
            );
          } catch {
            return false;
          }
        })()}
        pageOrdinal={Math.max(0, previewIndices.indexOf(page.index))}
        selectedCount={previewIndices.length}
        onPosition={large && !busy ? (x, y) => onOptionsChange({ x, y }) : undefined}
        onAnnotationChange={
          large && !busy
            ? (id, patch) =>
                onOptionsChange({
                  annotations: options.annotations.map((a) =>
                    a.id === id ? { ...a, ...patch } : a,
                  ),
                })
            : undefined
        }
      />
    );
  };
  return (
    <main id="main" className="workspace-page">
      <div className="container workspace-container">
        <Link className="back-link" to="/#tools">
          <ArrowLeft size={14} /> Back to all tools
        </Link>
        <div className="workspace-heading">
          <span className={`tool-icon ${tool.color}`}>
            <tool.icon size={26} strokeWidth={1.6} />
          </span>
          <div>
            <div className="workspace-title-row">
              <h1>{tool.title}</h1>
              <span className="local-label">
                <span className="status-dot" /> LOCAL & PRIVATE
              </span>
            </div>
            <p>{tool.detail}</p>
          </div>
          <button
            className="icon-button help-button"
            aria-label="Tool help"
            onClick={() => setHelp(true)}
          >
            <HelpCircle size={20} />
          </button>
        </div>
        <div className="flow-steps" aria-label="Processing steps">
          <span className={files.length ? 'complete' : 'current'}>
            <i>{files.length ? <Check size={11} /> : '1'}</i>Select files
          </span>
          <div />
          <span className={files.length && !result ? 'current' : result ? 'complete' : ''}>
            <i>{result ? <Check size={11} /> : '2'}</i>Configure
          </span>
          <div />
          <span className={result ? 'current' : ''}>
            <i>3</i>Download
          </span>
        </div>
        {ready && (
          <input
            ref={input}
            type="file"
            className="visually-hidden"
            aria-label="Choose files"
            accept={isImages ? 'image/png,image/jpeg,image/webp' : 'application/pdf,.pdf'}
            multiple={multiple}
            disabled={busy}
            onChange={(event) => void addFiles(Array.from(event.target.files || []))}
          />
        )}
        {error && (
          <div className="error-notice" role="alert">
            <span>{error}</span>
            <button
              className="icon-button"
              aria-label="Dismiss message"
              onClick={() => setError('')}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className={`workspace-layout ${!files.length ? 'empty-layout' : ''}`}>
          <section className="workspace-main" aria-label="Document workspace">
            {!files.length ? (
              <div
                className={`dropzone ${dragging ? 'drag-over' : ''}`}
                aria-busy={!ready || adding}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  void addFiles(Array.from(event.dataTransfer.files));
                }}
              >
                <div className="upload-art">
                  <div className="upload-paper back" />
                  <div className="upload-paper front">
                    {isImages ? (
                      <ImagePlus size={33} strokeWidth={1.3} />
                    ) : (
                      <FileText size={33} strokeWidth={1.3} />
                    )}
                    <i />
                    <i />
                  </div>
                  <span>
                    <Plus size={15} />
                  </span>
                </div>
                <h2>
                  {adding
                    ? 'Opening your document…'
                    : isImages
                      ? 'Drop your images here.'
                      : 'Drop your PDFs here.'}
                </h2>
                <p>
                  {adding
                    ? 'Reading the document locally. Nothing is uploaded.'
                    : `Drag and drop your ${isImages ? 'images' : multiple ? 'PDFs' : 'PDF'} here, or choose from your device.`}
                </p>
                <button
                  className="button primary"
                  disabled={!ready || busy}
                  onClick={() => input.current?.click()}
                >
                  {adding ? <span className="spinner" /> : <Upload size={17} />}{' '}
                  {adding
                    ? 'Opening locally…'
                    : isImages
                      ? 'Choose images'
                      : multiple
                        ? 'Choose PDFs'
                        : 'Choose a PDF'}
                </button>
                <noscript>
                  Enable JavaScript to select files and process documents on your device.
                </noscript>
                <span className="dropzone-meta">
                  {isImages ? 'JPG, PNG, or WebP' : 'PDF files'} <i /> Up to 100 MB combined <i />{' '}
                  500 pages
                </span>
                <div className="dropzone-privacy">
                  <ShieldCheck size={14} /> Processed locally. Never uploaded.
                </div>
              </div>
            ) : (
              <>
                <div className="document-toolbar">
                  <div>
                    <span className="document-count">
                      {multiple
                        ? `${files.length} ${isImages ? 'images' : 'files'}`
                        : files[0].file.name}
                    </span>
                    <span className="document-meta">
                      {displayCount} {displayCount === 1 ? 'page' : 'pages'} <i />{' '}
                      {formatBytes(totalBytes)}
                    </span>
                  </div>
                  <div className="document-toolbar-actions">
                    {!fileList && (
                      <div className="view-switch" role="group" aria-label="Preview layout">
                        <button
                          aria-label="Page grid"
                          aria-pressed={previewMode === 'grid'}
                          className={previewMode === 'grid' ? 'active' : ''}
                          onClick={() => setPreviewMode('grid')}
                        >
                          <Grid2X2 size={16} />
                        </button>
                        <button
                          aria-label="Large page preview"
                          aria-pressed={previewMode === 'focus'}
                          className={previewMode === 'focus' ? 'active' : ''}
                          onClick={() => setPreviewMode('focus')}
                        >
                          <LayoutPanelLeft size={16} />
                        </button>
                      </div>
                    )}
                    {fileList && (
                      <button
                        type="button"
                        className="button small secondary"
                        disabled={busy}
                        onClick={() =>
                          replaceFiles(
                            [...files].sort((a, b) =>
                              a.file.name.localeCompare(b.file.name, undefined, { numeric: true }),
                            ),
                          )
                        }
                      >
                        Sort A–Z
                      </button>
                    )}
                    {tool.id === 'rotate' && (
                      <button
                        type="button"
                        className="button small secondary"
                        disabled={busy}
                        onClick={() => {
                          pageChange(pages.map((p) => ({ ...p, rotation: 0 })));
                          onOptionsChange({ angle: 0, range: '', rotationTarget: 'all' });
                        }}
                      >
                        Reset all
                      </button>
                    )}
                    {tool.id === 'organize' && (
                      <button
                        type="button"
                        className="button small secondary"
                        disabled={busy || pages.length >= MAX_PAGES}
                        onClick={() =>
                          pageChange([
                            ...pages,
                            {
                              id: uuid(),
                              sourceId: 'blank',
                              index: 0,
                              rotation: 0,
                              blank: { width: 595.28, height: 841.89 },
                            },
                          ])
                        }
                      >
                        Add blank page
                      </button>
                    )}
                    {multiple && (
                      <button
                        className="button small secondary"
                        disabled={busy}
                        onClick={() => input.current?.click()}
                      >
                        <Plus size={14} /> Add files
                      </button>
                    )}
                    <button
                      className="icon-button"
                      aria-label="Clear all files"
                      disabled={!!progress}
                      onClick={reset}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                {multiple && !fileList && (
                  <div className="document-file-navigation">
                    <label className="field">
                      <span>Active document</span>
                      <select
                        aria-label="Active document"
                        value={
                          focusPage?.sourceId === 'blank' ? '' : focusPage?.sourceId || files[0]?.id
                        }
                        onChange={(e) => {
                          setFocus(
                            Math.max(
                              0,
                              pages.findIndex((p) => p.sourceId === e.target.value),
                            ),
                          );
                          setPreviewMode('focus');
                        }}
                      >
                        {focusPage?.blank && <option value="">Blank page</option>}
                        {files.map((file) => (
                          <option key={file.id} value={file.id}>
                            {file.file.name} · {file.pages.length} pages
                          </option>
                        ))}
                      </select>
                    </label>
                    {tool.id === 'rotate' && (
                      <button
                        type="button"
                        className="button small secondary"
                        disabled={busy}
                        onClick={() => {
                          const sourceId = focusPage?.sourceId || files[0].id;
                          pageChange(
                            pages.map((p) =>
                              p.sourceId === sourceId
                                ? { ...p, rotation: (p.rotation + 90) % 360 }
                                : p,
                            ),
                          );
                        }}
                      >
                        <RotateCw size={15} /> Rotate document
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-button"
                      disabled={busy || !!focusPage?.blank}
                      aria-label="Remove active document"
                      onClick={() => removeFile(focusPage?.sourceId || files[0].id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
                {fileList ? (
                  <SortableList
                    className="file-list"
                    ids={files.map((file) => file.id)}
                    onMove={(from, to) => {
                      if (!busy) replaceFiles(rearrange(files, from, to));
                    }}
                  >
                    {files.map((source, index) => (
                      <SortableItem
                        key={source.id}
                        id={source.id}
                        label={source.file.name}
                        className="file-card"
                      >
                        <span className="file-sequence">{String(index + 1).padStart(2, '0')}</span>
                        <button
                          type="button"
                          className="file-thumbnail"
                          aria-label={`Preview ${source.file.name}`}
                          disabled={busy}
                          onClick={() => setFilePreview({ sourceId: source.id, index: 0 })}
                        >
                          <PagePreview
                            source={source}
                            page={{
                              id: source.id,
                              sourceId: source.id,
                              index: 0,
                              rotation: pages.find((p) => p.sourceId === source.id)?.rotation || 0,
                            }}
                          />
                        </button>
                        <div className="file-card-info">
                          <h3>{source.file.name}</h3>
                          <p>
                            {source.pages.length} {source.pages.length === 1 ? 'page' : 'pages'}{' '}
                            <i /> {formatBytes(source.file.size)}{' '}
                            {source.password !== undefined && <LockKeyhole size={12} />}
                          </p>
                        </div>
                        <div className="file-card-actions">
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={'Rotate ' + source.file.name}
                            disabled={busy}
                            onClick={() =>
                              pageChange(
                                pages.map((p) =>
                                  p.sourceId === source.id
                                    ? { ...p, rotation: (p.rotation + 90) % 360 }
                                    : p,
                                ),
                              )
                            }
                          >
                            <RotateCw size={15} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Move ${source.file.name} earlier`}
                            disabled={busy || index === 0}
                            onClick={() => replaceFiles(rearrange(files, index, index - 1))}
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Move ${source.file.name} later`}
                            disabled={busy || index === files.length - 1}
                            onClick={() => replaceFiles(rearrange(files, index, index + 1))}
                          >
                            <ChevronRight size={16} />
                          </button>
                          <button
                            className="icon-button danger-hover"
                            aria-label={`Remove ${source.file.name}`}
                            disabled={busy}
                            onClick={() => removeFile(source.id)}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </SortableItem>
                    ))}
                  </SortableList>
                ) : (
                  <>
                    {tool.id === 'organize' && (
                      <div className="page-selection-toolbar">
                        <label>
                          <input
                            type="checkbox"
                            aria-label="Select all pages"
                            checked={selectedIds.size === pages.length && pages.length > 0}
                            onChange={(event) =>
                              setSelectedIds(
                                event.target.checked
                                  ? new Set(pages.map((page) => page.id))
                                  : new Set(),
                              )
                            }
                          />{' '}
                          {selectedIds.size
                            ? `${selectedIds.size} selected`
                            : 'Select pages to extract'}
                        </label>
                        <div>
                          <button
                            className="text-link small"
                            disabled={!history.length || busy}
                            onClick={() => {
                              const previous = history[history.length - 1];
                              setResult(null);
                              setFuture((f) => [pages, ...f]);
                              setPages(previous);
                              setHistory(history.slice(0, -1));
                            }}
                          >
                            <Undo2 size={14} /> Undo
                          </button>
                          <button
                            type="button"
                            className="text-link small"
                            disabled={!future.length || busy}
                            onClick={() => {
                              setHistory((h) => [...h, pages]);
                              setResult(null);
                              setPages(future[0]);
                              setFuture((f) => f.slice(1));
                            }}
                          >
                            <Redo2 size={14} />
                            Redo
                          </button>
                          <button
                            className="button small secondary"
                            disabled={!selectedIds.size || busy}
                            onClick={() => run(pages.filter((page) => selectedIds.has(page.id)))}
                          >
                            <ArrowDown size={13} /> Extract selected
                          </button>
                        </div>
                      </div>
                    )}
                    {previewMode === 'focus' && focusPage && focusSource ? (
                      <div className="focus-preview">
                        <div className="focus-page-wrap">{preview(focusPage, true)}</div>
                        <div className="page-navigator">
                          <button
                            className="icon-button"
                            aria-label="Previous page"
                            disabled={focusIndex === 0}
                            onClick={() => setFocus(focusIndex - 1)}
                          >
                            <ChevronLeft size={18} />
                          </button>
                          <span>
                            Page <strong>{focusIndex + 1}</strong> of {pages.length}
                          </span>
                          <button
                            className="icon-button"
                            aria-label="Next page"
                            disabled={focusIndex === pages.length - 1}
                            onClick={() => setFocus(focusIndex + 1)}
                          >
                            <ChevronRight size={18} />
                          </button>
                        </div>
                        {['sign', 'watermark', 'page-numbers'].includes(tool.id) && (
                          <p className="preview-instruction">
                            {selectedSet.has(focusPage.index)
                              ? 'Drag the annotation to position it. Use settings to resize.'
                              : 'This page is outside your selected page range.'}
                          </p>
                        )}
                      </div>
                    ) : tool.id === 'organize' ? (
                      <SortableList
                        className="page-grid"
                        ids={pages.map((page) => page.id)}
                        onMove={(from, to) => {
                          if (!busy) pageChange(rearrange(pages, from, to));
                        }}
                      >
                        {pages.map((page, index) => (
                          <SortableItem
                            key={page.id}
                            id={page.id}
                            label={`page ${index + 1}`}
                            className="page-card"
                          >
                            <label className="page-checkbox">
                              <input
                                aria-label={`Select page ${index + 1}`}
                                type="checkbox"
                                checked={selectedIds.has(page.id)}
                                onChange={(event) =>
                                  setSelectedIds((previous) => {
                                    const next = new Set(previous);
                                    if (event.target.checked) next.add(page.id);
                                    else next.delete(page.id);
                                    return next;
                                  })
                                }
                              />
                            </label>
                            {preview(page)}
                            <div className="page-card-footer">
                              <span>{index + 1}</span>
                              <div>
                                <button
                                  className="icon-button"
                                  aria-label={`Rotate page ${index + 1}`}
                                  disabled={busy}
                                  onClick={() =>
                                    pageChange(
                                      pages.map((item) =>
                                        item.id === page.id
                                          ? { ...item, rotation: (item.rotation + 90) % 360 }
                                          : item,
                                      ),
                                    )
                                  }
                                >
                                  <RotateCw size={13} />
                                </button>
                                <button
                                  className="icon-button"
                                  aria-label={`Duplicate page ${index + 1}`}
                                  disabled={busy || pages.length >= MAX_PAGES}
                                  onClick={() => {
                                    const next = [...pages];
                                    next.splice(index + 1, 0, { ...page, id: uuid() });
                                    pageChange(next);
                                  }}
                                >
                                  <Copy size={13} />
                                </button>
                                <button
                                  className="icon-button danger-hover"
                                  aria-label={`Remove page ${index + 1}`}
                                  disabled={busy || pages.length === 1}
                                  onClick={() => {
                                    pageChange(pages.filter((item) => item.id !== page.id));
                                    setSelectedIds((previous) => {
                                      const next = new Set(previous);
                                      next.delete(page.id);
                                      return next;
                                    });
                                  }}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                            <div className="page-move-controls">
                              <button
                                disabled={busy || index === 0}
                                aria-label={`Move page ${index + 1} earlier`}
                                onClick={() => pageChange(rearrange(pages, index, index - 1))}
                              >
                                <ChevronLeft size={12} />
                                Earlier
                              </button>
                              <button
                                disabled={busy || index === pages.length - 1}
                                aria-label={`Move page ${index + 1} later`}
                                onClick={() => pageChange(rearrange(pages, index, index + 1))}
                              >
                                Later
                                <ChevronRight size={12} />
                              </button>
                            </div>
                          </SortableItem>
                        ))}
                      </SortableList>
                    ) : (
                      <div className="page-grid">
                        {pages.map((page, index) => (
                          <div key={page.id} className="page-grid-item">
                            <button
                              key={page.id}
                              className={`page-card preview-page-button ${selectedSet.has(page.index) ? 'in-range' : ''}`}
                              aria-label={`View page ${index + 1}`}
                              onClick={() => {
                                setFocus(index);
                                setPreviewMode('focus');
                              }}
                            >
                              {preview(page)}
                              <span className="simple-page-number">
                                {index + 1}
                                {selectedSet.has(page.index) && <Check size={11} />}
                              </span>
                            </button>
                            {tool.id === 'rotate' && (
                              <button
                                type="button"
                                className="button secondary small"
                                aria-label={'Rotate page ' + (index + 1)}
                                disabled={busy}
                                onClick={() =>
                                  pageChange(
                                    pages.map((p) =>
                                      p.id === page.id
                                        ? { ...p, rotation: (p.rotation + 90) % 360 }
                                        : p,
                                    ),
                                  )
                                }
                              >
                                <RotateCw size={13} />
                                Rotate page
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {adding && (
                  <div className="adding-files">
                    <span className="spinner" /> Opening files on your device…
                  </div>
                )}
                {files.some((file) => file.password !== undefined) && tool.id !== 'protect' && (
                  <p className="unlocked-note">
                    <LockKeyhole size={13} /> Opened locally. Exported copies will be unprotected.
                  </p>
                )}
              </>
            )}
            {progress && (
              <div
                ref={progressRegion}
                tabIndex={-1}
                className="processing-panel"
                role="status"
                aria-live="polite"
              >
                <span className="processing-icon">
                  <span className="spinner" />
                </span>
                <h2>Processing on your device.</h2>
                <p>{progress.message}</p>
                {progress.total !== undefined && progress.completed !== undefined && (
                  <progress
                    max={progress.total}
                    value={progress.completed}
                    aria-label="Processing progress"
                  />
                )}
                <button className="button secondary small" onClick={cancel}>
                  Cancel processing
                </button>
              </div>
            )}
            {result && (
              <div
                ref={resultRegion}
                className="result-panel"
                tabIndex={-1}
                role="status"
                aria-live="polite"
              >
                <span className="result-icon">
                  <CheckCheck size={29} />
                </span>
                <span className="eyebrow">PROCESSING COMPLETE</span>
                <h2>
                  {result.files.length ? 'Your files are ready.' : 'Processing could not complete.'}
                </h2>
                <p>{result.note || 'Your file is ready to download.'}</p>
                {result.entries && (
                  <ul className="batch-status">
                    {result.entries.map((entry, i) => (
                      <li key={i} className={entry.status === 'failed' ? 'failed' : ''}>
                        <strong>{entry.name}</strong> ·{' '}
                        {entry.status === 'success' ? 'Completed' : 'Failed'}
                        {entry.outputBytes !== undefined
                          ? ' · ' +
                            formatBytes(entry.inputBytes) +
                            ' → ' +
                            formatBytes(entry.outputBytes)
                          : ''}
                        {entry.message && <div>{entry.message}</div>}
                      </li>
                    ))}
                  </ul>
                )}
                {result.files.map((file) => (
                  <div className="result-file" key={file.name}>
                    <FileText size={22} />
                    <div>
                      <strong>{file.name}</strong>
                      <span>
                        {formatBytes(file.data.length)}
                        {tool.id === 'compress' && !result.entries
                          ? ` output · ${formatBytes(totalBytes)} input`
                          : ''}
                        {tool.id === 'compress' && !result.entries && file.data.length < totalBytes
                          ? ` · ${Math.round((1 - file.data.length / totalBytes) * 100)}% smaller`
                          : ''}
                      </span>
                    </div>
                    <button
                      className="button primary"
                      onClick={() => downloadFile(file.name, file.data, file.type)}
                    >
                      <Download size={16} /> Download<span className="download-desktop"> file</span>
                    </button>
                  </div>
                ))}
                <div className="result-actions">
                  {tool.id === 'compress' &&
                    files.map((source) => (
                      <button
                        key={source.id}
                        className="text-link"
                        onClick={() => {
                          const url = URL.createObjectURL(source.file);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = source.file.name;
                          link.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        }}
                      >
                        Keep original{files.length > 1 ? ' — ' + source.file.name : ' file'}
                      </button>
                    ))}
                  <button
                    className="text-link"
                    onClick={() => {
                      setResult(null);
                      requestAnimationFrame(() => settingsTitle.current?.focus());
                    }}
                  >
                    Adjust settings <ArrowLeft size={13} />
                  </button>
                  <button className="text-link" onClick={reset}>
                    Start fresh <Plus size={14} />
                  </button>
                </div>
                <span className="result-private">
                  <ShieldCheck size={13} /> Never uploaded. Never stored.
                </span>
              </div>
            )}
          </section>
          <button
            type="button"
            className="button mobile-settings-toggle"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <SlidersHorizontal size={16} />
            {settingsOpen ? 'Hide settings' : 'Settings & export'}
          </button>
          <aside className={'settings-panel ' + (!settingsOpen ? 'mobile-collapsed' : '')}>
            <div className="settings-title" ref={settingsTitle} tabIndex={-1}>
              <span className="settings-step">02</span>
              <div>
                <h2>Tool settings</h2>
                <p>Configure your output.</p>
              </div>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                run();
              }}
            >
              <fieldset disabled={busy || !!result}>
                <ToolSettings
                  key={settingsEpoch}
                  tool={tool.id}
                  options={options}
                  onChange={onOptionsChange}
                  onError={onError}
                />
                {!isImages && (
                  <p className="field-hint compatibility-note">
                    Rewriting may invalidate existing certificate-backed signatures. Keep your
                    original.
                    {['merge', 'split', 'organize'].includes(tool.id) &&
                      ' Forms, bookmarks, attachments, tags and internal links are rejected when safe preservation is unsupported.'}
                    {tool.id === 'pdf-to-images' &&
                      ' Image exports contain visible pages only: no selectable text, links, forms, bookmarks, tags or attachments.'}
                  </p>
                )}
              </fieldset>
              <div className="settings-action">
                <button
                  type="submit"
                  className="button primary process-button"
                  disabled={!files.length || busy || !!result}
                >
                  {progress ? (
                    <>
                      <span className="spinner" /> Working locally…
                    </>
                  ) : (
                    <>
                      {tool.action}
                      <ArrowRight size={17} />
                    </>
                  )}
                </button>
                <p>
                  <ShieldCheck size={13} /> Only your browser sees your files.
                </p>
              </div>
            </form>
          </aside>
        </div>
        <div className="workspace-promises">
          <span>
            <ShieldCheck size={15} /> No uploads, ever
          </span>
          <span>
            <CheckCircle2 size={15} /> No account needed
          </span>
          <span>
            <LockKeyhole size={15} /> Yours from start to finish
          </span>
        </div>
        <div className="other-tools">
          <span>Something else on your list?</span>
          <Link to="/#tools">
            Explore the other tools <ArrowRight size={14} />
          </Link>
        </div>
        <ToolGuide toolId={tool.id} />
      </div>
      <Modal
        open={help}
        onClose={() => setHelp(false)}
        title={`Help with ${tool.title.toLowerCase()}`}
        description={tool.detail}
      >
        <div className="help-content">
          <p>
            Select a file, adjust your settings, and use the export button. Your original is never
            overwritten.
          </p>
          <p>
            Work with up to 100 MB and 500 pages per job. Modern browsers are supported; large files
            may need smaller batches on devices with less memory.
          </p>
          <p>
            All processing stays on your device. Files and passwords are kept in this tab’s memory
            and released when you clear the workspace.
          </p>
        </div>
        <button className="button primary" onClick={() => setHelp(false)}>
          Got it <Check size={15} />
        </button>
      </Modal>
      <Modal
        open={!!previewedFile && !!filePreview}
        onClose={() => setFilePreview(null)}
        title={previewedFile?.file.name || 'File preview'}
        description={`Original file preview. Page ${(filePreview?.index || 0) + 1} of ${previewedFile?.pages.length || 1}.`}
      >
        {previewedFile && filePreview && (
          <>
            <div className="source-file-preview">
              <PagePreview
                key={`${previewedFile.id}-${filePreview.index}`}
                source={previewedFile}
                large
                page={{
                  id: 'source-preview',
                  sourceId: previewedFile.id,
                  index: filePreview.index,
                  rotation: 0,
                }}
              />
            </div>
            <div className="page-navigator">
              <button
                className="icon-button"
                aria-label="Previous file page"
                disabled={filePreview.index === 0}
                onClick={() => setFilePreview({ ...filePreview, index: filePreview.index - 1 })}
              >
                <ChevronLeft size={18} />
              </button>
              <span>
                Page <strong>{filePreview.index + 1}</strong> of {previewedFile.pages.length}
              </span>
              <button
                className="icon-button"
                aria-label="Next file page"
                disabled={filePreview.index === previewedFile.pages.length - 1}
                onClick={() => setFilePreview({ ...filePreview, index: filePreview.index + 1 })}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </>
        )}
      </Modal>
      <Modal
        open={!!passwordRequest}
        onClose={() => closePassword(null)}
        title="Password required"
        description={passwordRequest?.message || 'Enter the current document password.'}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            closePassword(passwordInput);
          }}
        >
          <div className="password-file">
            <LockKeyhole size={18} />
            {passwordRequest?.name}
          </div>
          <label className="field">
            Current PDF password
            <input
              autoFocus
              aria-label="Current PDF password"
              type="password"
              autoComplete="off"
              value={passwordInput}
              onChange={(event) => setPasswordInput(event.target.value)}
            />
          </label>
          <button type="submit" className="button primary">
            Open PDF locally <ArrowRight size={15} />
          </button>
        </form>
      </Modal>
    </main>
  );
}
