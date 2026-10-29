import type { ToolId } from './tools';
import type { ToolOptions } from './types';
import { parsePageGroups, parseRange } from './utils';

/** Shared by preview and export: inactive settings must not change the selection. */
export function selectedPages(tool: ToolId, options: ToolOptions, count: number): number[] {
  if (tool === 'split' && options.splitMode === 'ranges')
    return [...new Set(parsePageGroups(options.groups, count).flat())];
  if (tool === 'sign' && options.annotations.length)
    return [...new Set(options.annotations.flatMap((field) => parseRange(field.range, count)))];
  return parseRange(options.range, count).filter(
    (index) => !(tool === 'page-numbers' && options.coverPage && index === 0),
  );
}
