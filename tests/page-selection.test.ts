import { expect, it } from 'vitest';
import { selectedPages } from '../src/lib/page-selection';
import { defaultOptions } from '../src/lib/types';
import { parsePageGroups } from '../src/lib/utils';
import { validateJob } from '../src/lib/validate-job';

it('uses custom groups instead of a stale inactive range for split previews and exports', () => {
  const options = { ...defaultOptions, splitMode: 'ranges' as const, groups: '2;1,2', range: '99' };
  expect(selectedPages('split', options, 3)).toEqual([1, 0]);
  expect(parsePageGroups(options.groups, 3)).toEqual([[1], [0, 1]]);
  expect(() => parsePageGroups('1;;2', 3)).toThrow('nonempty');
});

it('ignores hidden split mode settings but validates the active mode', () => {
  const job = {
    tool: 'split' as const,
    sources: [{ id: 'a', file: new File(['fixture'], 'test.pdf') }],
    pages: [],
    options: { ...defaultOptions, splitMode: 'individual' as const, groupSize: 0, maximumKiB: 0 },
  };
  expect(() => validateJob(job)).not.toThrow();
  expect(() => validateJob({ ...job, options: { ...job.options, splitMode: 'fixed' } })).toThrow(
    'split group',
  );
  expect(() => validateJob({ ...job, options: { ...job.options, splitMode: 'size' } })).toThrow(
    'split group',
  );
});

it('uses independent signature-field targets instead of a hidden legacy range', () => {
  const options = {
    ...defaultOptions,
    range: '99',
    annotations: [{ ...defaultOptions, id: 'text', kind: 'text' as const, range: '2', width: 0.3 }],
  };
  expect(selectedPages('sign', options, 3)).toEqual([1]);
});
