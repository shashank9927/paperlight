import { describe, expect, it } from 'vitest';
import { expandJob } from '../src/lib/tool-config';
import type { ConfiguredJob } from '../src/lib/tool-config';
import { validateJob } from '../src/lib/validate-job';
import { defaultOptions } from '../src/lib/types';
import type { ProcessingJob } from '../src/lib/types';

describe('worker job validation', () => {
  it('rejects malformed envelopes without exposing runtime errors', () => {
    for (const value of [
      null,
      { tool: 'merge', options: null },
      { tool: 'merge', options: {}, sources: null, pages: [] },
    ])
      expect(() => expandJob(value as unknown as ConfiguredJob)).toThrow(/Choose|Check/);
  });
  it('rejects malformed nested settings and missing permission flags', () => {
    for (const options of [
      { ...defaultOptions, permissions: null },
      { ...defaultOptions, permissions: {} },
      { ...defaultOptions, annotations: [null] },
      { ...defaultOptions, text: null },
    ]) {
      const job = { tool: 'protect', sources: [], pages: [], options } as unknown as ProcessingJob;
      expect(() => validateJob(job)).toThrow('Check the tool settings and try again.');
    }
  });
});
