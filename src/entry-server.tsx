import React from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { PassThrough } from 'node:stream';
import App from './App';
export { seoPages, siteOrigin, structuredData } from './lib/seo';

// Wait for the lazy workspace's empty state. PDF engines only load on document jobs.
export function render(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const output = new PassThrough();
    let html = '';
    let failed = false;
    output.on('data', (chunk) => {
      html += chunk.toString();
    });
    output.on('end', () => {
      if (!failed) resolve(html);
    });
    output.on('error', reject);
    const stream = renderToPipeableStream(
      <React.StrictMode>
        <StaticRouter location={path}>
          <App />
        </StaticRouter>
      </React.StrictMode>,
      {
        onAllReady() {
          stream.pipe(output);
        },
        onError(error) {
          failed = true;
          stream.abort();
          reject(error);
        },
        onShellError: reject,
      },
    );
  });
}
