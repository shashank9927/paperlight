import type { ToolId } from './tools';

export interface SourceFile {
  id: string;
  file: File;
  password?: string;
}
export interface PageRef {
  id: string;
  sourceId: string;
  index: number;
  rotation: number;
  blank?: { width: number; height: number };
}
export interface RangeOptions {
  range: string;
}
export interface SplitOptions extends RangeOptions {
  splitMode: 'extract' | 'individual' | 'ranges' | 'fixed' | 'size';
  groups: string;
  groupSize: number;
  maximumKiB: number;
  splitCompress: boolean;
  combineRanges: boolean;
}
export interface CompressionOptions {
  compression: 'lossless' | 'image' | 'optimized';
  compressionLevel: 90 | 75 | 50;
  quality: number;
}
export interface RotationOptions extends RangeOptions {
  angle: number;
  rotationTarget: 'all' | 'portrait' | 'landscape';
}
export interface ImagePdfOptions {
  pageSize: 'a4' | 'letter' | 'original';
  orientation: 'portrait' | 'landscape';
  margin: number;
  fit: 'contain' | 'cover';
  imageOutput: 'combined' | 'separate';
}
export interface ExportImageOptions extends RangeOptions {
  imageFormat: 'png' | 'jpeg';
  dpi: number;
  exportMode: 'pages' | 'extract';
}
export type PdfFont = 'sans' | 'serif' | 'mono' | 'signature';
export interface TextStyle {
  text: string;
  fontSize: number;
  opacity: number;
  color: string;
  x: number;
  y: number;
  textAngle: number;
  fontFamily: PdfFont;
  bold: boolean;
  italic: boolean;
  background: string;
  shadow: boolean;
}
export interface WatermarkOptions extends RangeOptions, TextStyle {
  watermarkType: 'text' | 'image';
  watermarkImage?: Uint8Array;
  watermarkWidth: number;
  tile: boolean;
  layer: 'above' | 'below';
}
export interface NumberOptions extends RangeOptions, TextStyle {
  startNumber: number;
  numberStyle: 'number' | 'page' | 'total' | 'custom';
  numberTemplate: string;
  facingPages: boolean;
  coverPage: boolean;
  numberMargin: number;
}
export interface ProtectOptions {
  password: string;
  confirmPassword: string;
  advancedProtection: boolean;
  restrictAccess: boolean;
  ownerPassword: string;
  confirmOwnerPassword: string;
  permissions: {
    print: boolean;
    copy: boolean;
    modify: boolean;
    annotate: boolean;
    forms: boolean;
    assemble: boolean;
  };
}
export interface Annotation extends TextStyle {
  id: string;
  kind: 'signature' | 'initials' | 'name' | 'date' | 'text' | 'stamp';
  range: string;
  image?: Uint8Array;
  width: number;
}
export interface SignOptions extends RangeOptions, Pick<TextStyle, 'x' | 'y'> {
  signature?: Uint8Array;
  signatureWidth: number;
  annotations: Annotation[];
}
export interface ToolConfigMap {
  merge: Record<string, never>;
  split: SplitOptions;
  compress: CompressionOptions;
  organize: Record<string, never>;
  rotate: RotationOptions;
  'images-to-pdf': ImagePdfOptions;
  'pdf-to-images': ExportImageOptions & Pick<CompressionOptions, 'quality'>;
  watermark: WatermarkOptions;
  'page-numbers': NumberOptions;
  protect: ProtectOptions;
  unlock: Record<string, never>;
  sign: SignOptions;
}
// The UI draft keeps compatibility with existing saved-in-memory controls. Tool
// contracts above define which settings each operation consumes; nothing persists.
export interface ToolOptions
  extends
    SplitOptions,
    CompressionOptions,
    RotationOptions,
    ImagePdfOptions,
    ExportImageOptions,
    WatermarkOptions,
    NumberOptions,
    ProtectOptions,
    SignOptions {}
export interface ProcessingJob {
  tool: ToolId;
  sources: SourceFile[];
  pages: PageRef[];
  options: ToolOptions;
}
export interface OutputFile {
  name: string;
  data: Uint8Array;
  type: string;
}
export interface ProcessingResult {
  files: OutputFile[];
  note?: string;
  entries?: {
    name: string;
    status: 'success' | 'failed';
    message?: string;
    inputBytes: number;
    outputBytes?: number;
  }[];
}
export type WorkerRequest = { type: 'process'; job: import('./tool-config').ConfiguredJob };
export type WorkerResponse =
  | { type: 'progress'; message: string; completed?: number; total?: number }
  | { type: 'result'; result: ProcessingResult }
  | { type: 'error'; message: string; issues?: import('./assembly').CompatibilityIssue[] };
export const defaultOptions: ToolOptions = {
  range: '',
  splitMode: 'extract',
  compression: 'lossless',
  quality: 0.7,
  angle: 90,
  pageSize: 'a4',
  orientation: 'portrait',
  margin: 24,
  fit: 'contain',
  imageFormat: 'png',
  dpi: 144,
  text: 'CONFIDENTIAL',
  fontSize: 40,
  opacity: 0.25,
  color: '#7560d5',
  x: 0.5,
  y: 0.5,
  textAngle: -35,
  startNumber: 1,
  numberStyle: 'number',
  password: '',
  confirmPassword: '',
  signatureWidth: 0.32,
  groups: '1',
  groupSize: 1,
  maximumKiB: 1024,
  splitCompress: false,
  combineRanges: false,
  compressionLevel: 75,
  rotationTarget: 'all',
  imageOutput: 'combined',
  exportMode: 'pages',
  fontFamily: 'sans',
  bold: false,
  italic: false,
  background: '',
  shadow: false,
  watermarkType: 'text',
  watermarkWidth: 0.3,
  tile: false,
  layer: 'above',
  numberTemplate: 'Page {n} of {p}',
  facingPages: false,
  coverPage: false,
  numberMargin: 24,
  advancedProtection: false,
  restrictAccess: true,
  ownerPassword: '',
  confirmOwnerPassword: '',
  permissions: {
    print: true,
    copy: true,
    modify: true,
    annotate: true,
    forms: true,
    assemble: true,
  },
  annotations: [],
};
export const MAX_BYTES = 100 * 1024 * 1024;
export const MAX_PAGES = 500;
