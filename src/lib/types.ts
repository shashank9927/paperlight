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
}
export interface ToolOptions {
  range: string;
  splitMode: 'extract' | 'individual';
  compression: 'lossless' | 'image';
  quality: number;
  angle: number;
  pageSize: 'a4' | 'letter' | 'original';
  orientation: 'portrait' | 'landscape';
  margin: number;
  fit: 'contain' | 'cover';
  imageFormat: 'png' | 'jpeg';
  dpi: number;
  text: string;
  fontSize: number;
  opacity: number;
  color: string;
  x: number;
  y: number;
  textAngle: number;
  startNumber: number;
  numberStyle: 'number' | 'page' | 'total';
  password: string;
  confirmPassword: string;
  signature?: Uint8Array;
  signatureWidth: number;
}
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
}
export type WorkerRequest = { type: 'process'; job: ProcessingJob };
export type WorkerResponse =
  | { type: 'progress'; message: string; completed?: number; total?: number }
  | { type: 'result'; result: ProcessingResult }
  | { type: 'error'; message: string };
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
};
export const MAX_BYTES = 100 * 1024 * 1024;
export const MAX_PAGES = 500;
