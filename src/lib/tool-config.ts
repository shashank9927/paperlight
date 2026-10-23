import { defaultOptions } from './types';
import type { ToolOptions, ToolConfigMap, ProcessingJob } from './types';
import type { ToolId } from './tools';
const textKeys = [
  'text',
  'fontSize',
  'opacity',
  'color',
  'x',
  'y',
  'textAngle',
  'fontFamily',
  'bold',
  'italic',
  'background',
  'shadow',
] as const;
const keys: Record<ToolId, readonly (keyof ToolOptions)[]> = {
  merge: [],
  organize: [],
  unlock: [],
  split: [
    'range',
    'splitMode',
    'groups',
    'groupSize',
    'maximumKiB',
    'splitCompress',
    'combineRanges',
  ],
  compress: ['compression', 'compressionLevel', 'quality'],
  rotate: ['range', 'angle', 'rotationTarget'],
  'images-to-pdf': ['pageSize', 'orientation', 'margin', 'fit', 'imageOutput'],
  'pdf-to-images': ['range', 'imageFormat', 'dpi', 'quality', 'exportMode'],
  watermark: [
    'range',
    ...textKeys,
    'watermarkType',
    'watermarkImage',
    'watermarkWidth',
    'tile',
    'layer',
  ],
  'page-numbers': [
    'range',
    ...textKeys,
    'startNumber',
    'numberStyle',
    'numberTemplate',
    'facingPages',
    'coverPage',
    'numberMargin',
  ],
  protect: [
    'password',
    'confirmPassword',
    'advancedProtection',
    'restrictAccess',
    'ownerPassword',
    'confirmOwnerPassword',
    'permissions',
  ],
  sign: ['range', 'signature', 'signatureWidth', 'annotations', 'x', 'y'],
};
export type ConfiguredJob = {
  [T in ToolId]: Omit<ProcessingJob, 'tool' | 'options'> & { tool: T; options: ToolConfigMap[T] };
}[ToolId];
export function configureJob(job: ProcessingJob): ConfiguredJob {
  return {
    ...job,
    options: Object.fromEntries(keys[job.tool].map((key) => [key, job.options[key]])),
  } as ConfiguredJob;
}
export function expandJob(job: ConfiguredJob): ProcessingJob {
  if (!Object.hasOwn(keys, job.tool)) throw new Error('Choose a supported PDF tool.');
  const supplied = job.options as unknown as Record<string, unknown>;
  const options = {
    ...defaultOptions,
    ...Object.fromEntries(
      keys[job.tool]
        .filter((key) => Object.hasOwn(supplied, key))
        .map((key) => [key, supplied[key]]),
    ),
  };
  return { ...job, options } as ProcessingJob;
}
