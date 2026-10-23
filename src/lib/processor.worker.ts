import type { WorkerRequest, WorkerResponse } from './types';
import { processJob } from './engine';

// Libraries may include untrusted PDF strings in diagnostic messages. Diagnostics
// are never a document-data channel; only our actionable result messages leave.
console.log = console.warn = console.error = console.info = console.debug = () => {};

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type !== 'process') return;
  const send = (message: WorkerResponse) => self.postMessage(message);
  try {
    const result = await processJob(event.data.job, send);
    self.postMessage({ type: 'result', result } satisfies WorkerResponse, {
      transfer: result.files.map((file) => file.data.buffer as ArrayBuffer),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'This file could not be processed.';
    send({
      type: 'error',
      message: /memory|allocation|out of bounds|canvas area/i.test(message)
        ? 'Your device ran out of working memory. Try fewer pages or a lower image resolution.'
        : message,
    });
  }
};
