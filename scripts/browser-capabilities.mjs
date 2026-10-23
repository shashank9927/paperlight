import { chromium, firefox, webkit } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
const results = [];
for (const [name, browserType] of Object.entries({ chromium, firefox, webkit })) {
  let browser;
  try {
    browser = await browserType.launch();
    const page = await browser.newPage();
    const worker = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const url = URL.createObjectURL(
            new Blob(
              [
                "postMessage({offscreenCanvas:typeof OffscreenCanvas !== 'undefined',convertToBlob:typeof OffscreenCanvas === 'undefined'?false:typeof OffscreenCanvas.prototype.convertToBlob === 'function',createImageBitmap:typeof createImageBitmap === 'function',secureRandom:typeof crypto.getRandomValues === 'function'})",
              ],
              { type: 'text/javascript' },
            ),
          );
          const worker = new Worker(url);
          worker.onmessage = (event) => {
            worker.terminate();
            URL.revokeObjectURL(url);
            resolve(event.data);
          };
          worker.onerror = () => {
            worker.terminate();
            URL.revokeObjectURL(url);
            resolve({ error: 'Worker probe failed' });
          };
        }),
    );
    results.push({ name, version: browser.version(), worker });
  } catch (error) {
    results.push({ name, unavailable: true, reason: error.message });
  } finally {
    await browser?.close();
  }
}
mkdirSync('docs/evidence', { recursive: true });
writeFileSync('docs/evidence/browser-capabilities.json', JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
