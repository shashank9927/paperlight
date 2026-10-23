# Paperlight

A private PDF toolkit with twelve real tools and a responsive white-and-violet interface. Every document operation runs in the browser. There is no upload endpoint, account system, database, analytics service, or conversion API.

## Develop

Use Node.js 24 and npm. No credentials or environment variables are required.

```sh
npm ci
npm run dev
```

The development server uses port 5173. Work directly in this checkout; cloud tasks already have an isolated workspace and do not need another Git worktree.

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

`dist/` is the deployable static website. `npm run preview` serves it on port 4173. Preview and development servers are for local use, not production hosting.

## Tools

| Route                  | Functionality                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/tools/merge`         | Merge PDFs in an adjustable file order.                                                                                                            |
| `/tools/split`         | Extract ranges or split pages into individual PDFs in a ZIP.                                                                                       |
| `/tools/compress`      | Text-preserving qpdf optimization or explicitly selected image-based compression. Original bytes are retained when compression cannot reduce size. |
| `/tools/organize`      | Reorder, rotate, duplicate, remove, undo, and extract selected pages.                                                                              |
| `/tools/rotate`        | Rotate selected pages clockwise.                                                                                                                   |
| `/tools/images-to-pdf` | Assemble JPEG, PNG, and WebP images, with page size, orientation, margin, and fit controls.                                                        |
| `/tools/pdf-to-images` | Export selected pages as PNG or JPEG at configurable resolution. Multiple images become a ZIP.                                                     |
| `/tools/watermark`     | Add text with configurable size, opacity, color, angle, placement, and page selection.                                                             |
| `/tools/page-numbers`  | Add page numbers with configurable starting value, style, placement, and page selection.                                                           |
| `/tools/protect`       | Add AES-256 encryption with a new opening password and a random owner password.                                                                    |
| `/tools/unlock`        | Remove password protection using the correct current password. Unencrypted inputs are also handled.                                                |
| `/tools/sign`          | Draw, type, or upload a visual signature and position it on selected pages.                                                                        |

Page ranges accept expressions such as `1-3, 5, 8`. An empty range means all pages. Explicit ranges preserve their requested order and ignore duplicate page numbers. Organize preserves the displayed order when extracting selected pages.

The annotation preview supports pointer dragging and arrow-key positioning; hold Shift for larger keyboard movements. File and page order can be changed by dragging, keyboard drag controls, or the arrow buttons. `/` focuses homepage tool search.

## Processing and privacy

- React, TypeScript, Vite, Tailwind CSS, React Router, Radix Dialog, Lucide, and dnd-kit provide the interface.
- PDF.js renders previews and image exports. pdf-lib adds images, watermarks, numbering, and visual signatures. qpdf 12.2.0, distributed through `@neslinesli93/qpdf-wasm` 0.3.0, handles page assembly, rotation, optimization and encryption. PDF.js 6.4.299 renders pages. Exact dependency versions and the WASM hash are recorded in `docs/evidence/dependencies.json`. fflate creates ZIPs.
- A dedicated worker handles each processing job. PDF admission runs in another isolated worker before preview; guarded parsing rejects excessive expansion, complexity and image sizes. Inspection has a 30-second deadline and processing a 120-second deadline. Cancellation terminates the worker. Reset clears file references, results, passwords, annotation settings, signature drawings, and preview URLs. Closing the tool destroys its PDF preview documents.
- Heavy PDF libraries load separately from the homepage. Thumbnails render near the viewport and release their canvas backing stores when out of view. Raster operations process pages sequentially.
- Scripts, fonts, CMaps, rendering support files, and WebAssembly are served from this website. There are no runtime CDNs or external font calls.
- The production service worker caches only the app shell and static assets. It does **not** cache documents, results, passwords, signatures, or blob URLs. No document content is written to localStorage, sessionStorage, IndexedDB, or cookies.
- Once the assets needed for a tool have loaded, that tool can process files offline. A first visit still needs a connection to load the application. Clear site data to remove the static asset cache.

## Limits and document compatibility

- Maximum combined input: **100 MiB** (shown as 100 MB in the interface), with **500 PDF pages** or generated pages per job. Both boundaries have real browser processing tests. Available device memory can impose a lower practical limit. Cancellation, smaller batches, and lower export resolutions help on mobile devices.
- Guarded parsing limits decoded streams to 64 MiB each / 256 MiB cumulatively, nesting to 64 levels, and parsed objects to 100,000. The QPDF WASM adapter caps linear memory at 512 MiB. These are individual allocation/work limits, not a cap on total browser memory. Strict parsing may reject damaged PDFs that other editors repair automatically.
- Raster output is limited to **4096 pixels on its longest side**. Image dimensions are validated before decoding: maximum 16 megapixels and 8192 pixels per side. Total raster/image work is capped at 120 megapixels and encoded output/ZIP at 128 MiB. Signature uploads are limited to 10 MB and resized to at most 1600 pixels on their longest side.
- Lossless optimization preserves selectable text; an already optimized PDF may not shrink. Image-based compression rasterizes every page and removes selectable text, links, forms, and interactive fields. The interface explains this before processing.
- Some PDFs use special color or luminosity transfer filters that background canvases cannot safely reproduce. Raster export reports this explicitly instead of silently producing an incorrect image. Other tools can still work with those documents.
- Merge, split and organize reject detected forms, internal destinations, bookmarks, portfolios, attachments and accessibility tags when safe preservation is unsupported. URI links, simple annotations and page labels have regression coverage. Editing a PDF may invalidate existing cryptographic signatures; the interface warns before processing. See the detailed support matrix below.
- Text annotations use a bundled Liberation Sans font. Unsupported characters produce an actionable error. Typed signatures use the same bundled font and reject unsupported characters; drawing and image uploads remain available.
- Signature placement is visual only, without identity verification or a certificate-backed digital signature. Unlocking requires the document’s existing password; no recovery or password cracking is implemented.
- Decrypted exports are unprotected unless Protect PDF is used. The interface also detects encryption with an empty opening password. If compression does not help, its exact-original fallback retains the original encryption and explains this in the result.
- Office conversion, OCR, existing-text editing, certified signatures, accounts, and payments are intentionally outside this release.

## Browser tests

```sh
# First setup only; reuse these cached browsers on subsequent runs.
npx playwright install --with-deps chromium firefox webkit

# Run benchmarks separately so parallel test activity does not distort timings.
npm run test:e2e -- --grep-invert "measured cold/warm"
npm run test:e2e -- tests/e2e/benchmark.spec.ts --workers=1 --output=.cache/benchmarks
```

If `/usr/bin/chromium` exists, the tests use it. Otherwise they use Playwright’s managed Chromium. Set `CHROMIUM_PATH` to use another installed Chromium executable. `PLAYWRIGHT_BROWSERS_PATH` can select a custom browser cache.

Install development-only validation dependencies with `python -m pip install -r scripts/requirements-test.txt` and install Poppler (`pdfinfo` and `pdftoppm`) on PATH. Set `PAPERLIGHT_PYTHON` if the verifier uses a different Python executable. The shipped application needs none of these tools.

The suite checks real outputs with pypdf, PDF.js and Poppler, including annotations, forms, labels, quarter-turn placement, encryption and ZIP contents. It covers malformed files, boundary limits, cancel/retry, repeated jobs, accessibility, network observation and warm offline processing for all twelve tools. The documented feature restrictions are tested as explicit rejection, not as successful preservation.

Current results, measurements and verification limits are in [the audit report](docs/AUDIT.md). [The support matrix](docs/PRESERVATION.md) describes consequential changes and [the requirement-to-test matrix](docs/REQUIREMENTS-TESTS.md) distinguishes coverage from gaps. Linux Chromium, Firefox and WebKit supply the complete automated release matrix. Set `PAPERLIGHT_STRICT_BROWSERS=1` to fail if required raster APIs are missing. This host's Windows WebKit port lacks worker OffscreenCanvas and its Windows Firefox binary fails at startup; use the already-built Linux verification container. Actual Safari/iOS and Android hardware remain unverified.

`.github/workflows/verify.yml` keeps the three desktop browsers and Chromium mobile emulation in CI. `.devcontainer/` supplies the locally exercised Node 24 / Python / Poppler environment and installs Playwright browsers once when building the image. Reuse that image and container for subsequent verification; see [setup commands](docs/SETUP.md). No credentials or document-processing server are required.

## Static deployment

1. Run `npm ci && npm run build`.
2. Publish the contents of `dist/` to an HTTPS static host.
3. Serve existing assets directly, with `.wasm` files using `application/wasm`.
4. Rewrite application routes such as `/tools/merge` to `/index.html`. Existing `/assets/`, `/pdf-assets/`, `/licenses/`, `/sw.js`, and `/favicon.svg` paths must remain directly available.
5. Apply the security headers in `public/_headers`. Netlify and Cloudflare Pages support this format; equivalent headers are also configured for the local production preview.
6. Serve `/sw.js` and HTML with revalidation. Hashed `/assets/` files can use long immutable caching. Keep support assets in `/pdf-assets/` revalidated across deployments.

`public/_redirects` provides SPA routing for compatible static hosts. The tested Nginx configuration in `deployment/nginx.conf` explicitly handles all twelve tool routes, missing assets, JavaScript module workers (`.mjs`), WASM and security headers. No processing server, secrets, cross-origin isolation, or cloud storage is needed.

The root `Dockerfile` builds a complete production image. To package an existing `dist/` without repeating dependency or image downloads, use the cached Nginx base:

```sh
docker build --pull=false --network=none -f deployment/Dockerfile -t paperlight-production:verified .
docker run -d --pull=never --name paperlight-local-production -p 127.0.0.1:4180:8080 paperlight-production:verified
node scripts/check-hosting.mjs http://127.0.0.1:4180
```

The offline packaging command requires the base image to be cached already. Reuse an existing named container with `docker start` instead of creating it again. Set `PAPERLIGHT_TEST_ORIGIN` to run browser tests against a built static server.

Test the deployed host’s deep links, worker/WASM loading, fonts, downloads, and service-worker updates before announcing a release. Public deployment is separate from preparing this checkout or saving cloud setup instructions.

Third-party notices and bundled license texts are included under `public/licenses/` and copied into the production build.
