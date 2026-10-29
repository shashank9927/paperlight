# Tool workflow audit — 29 October 2026

## Scope and comparison

Reviewed the public controls on the twelve corresponding iLovePDF pages below against Havisu's controls, worker branches, and downloaded-output assertions. This is a comparison of local workflows, not a claim that both applications support every PDF identically. No private documents were sent to iLovePDF. Cloud imports, AI/smart splitting, remote signature requests, and certified signatures remain outside the approved local-only scope.

| Tool / primary reference | Havisu controls and output verification |
| --- | --- |
| [Merge](https://www.ilovepdf.com/merge_pdf) | Add/remove files, previews, manual/alphabetical order and rotation. `tools.spec.ts`, `parity.spec.ts`, `compatibility.spec.ts` and `preservation.spec.ts` verify downloaded page order, content, navigation, tags, forms, layers and embedded payloads. |
| [Split](https://www.ilovepdf.com/split_pdf) | Individual pages, selected pages combined, custom groups with optional combination, fixed groups and maximum serialized size with optional compression. `split-workflows.spec.ts` verifies default ZIP filenames/content, selection, custom-group preview and combined extraction; `parity.test.ts`/`parity.spec.ts` verify fixed groups, size ceilings and oversize-page rejection. |
| [Compress](https://www.ilovepdf.com/compress_pdf) | Lossless optimization, three image quality levels, explicit page-raster mode and batches. `compression.spec.ts` and `parity.test.ts` check actual size, retained text, page dimensions, originals when compression grows the file, and 90/75/50 image settings. Compression ratios are document-dependent. |
| [Organize](https://www.ilovepdf.com/organize-pdf) | Import, blank pages, order, rotate, duplicate, remove, selected extraction, undo/redo. `tools.spec.ts`, `parity.spec.ts`, `assembly.test.ts` and `compatibility.test.ts` verify actual page graphs, independent duplicate widgets/tags, navigation and blank pages. |
| [Rotate](https://www.ilovepdf.com/rotate_pdf) | Per-page/file adjustments, clockwise angles (270° is left 90°), ranges, portrait/landscape targets, reset and batches. `tools.spec.ts`, `parity.spec.ts`, `hardening.test.ts` verify rotations and retained content. |
| [Images to PDF](https://www.ilovepdf.com/jpg_to_pdf) | Ordering, rotation, orientation, original/A4/Letter page sizes, margins, contain/cover and combined/separate output. `tools.spec.ts` and `parity.spec.ts` verify JPEG/PNG/WebP, transparency, dimensions, clipped image fit and ZIP membership. |
| [PDF to Images](https://www.ilovepdf.com/pdf_to_jpg) | Page rendering or embedded-image extraction, selected pages, PNG/JPEG, quality/resolution and batches. `tools.spec.ts`, `parity.spec.ts`, `hardening.spec.ts` verify pixels, repeated/inline/masked artwork, transparency, JPEG backgrounds, names and ZIPs. Extraction retains native image dimensions subject to documented caps; DPI controls page rendering. |
| [Watermark](https://www.ilovepdf.com/pdf_add_watermark) | Text/image, fonts/styles, opacity, position, rotation, repetition, ranges and above/below content. `parity.spec.ts`, `hardening.spec.ts`, `preservation.spec.ts` verify static SVG, underlay visibility, rotated/cropped geometry and retained structures. |
| [Page Numbers](https://www.ilovepdf.com/add_pdf_page_number) | Single/facing layouts, excluded cover, margins, starting number, ranges, typography and templates. `parity.spec.ts`, `hardening.spec.ts`, `parity.test.ts` check exact counter/token text, placement and crop/rotation handling. `{n}` is counter, `{p}` document count, `{r}` selected count and `{rf}` final counter. |
| [Protect](https://www.ilovepdf.com/protect-pdf) | AES-256 opening/owner passwords and supported print/copy/edit/comment/form/assembly permission settings. `tools.spec.ts`, `parity.spec.ts`, `hardening.test.ts` independently check encryption and permission bits. Viewer enforcement varies; modern encryption keeps accessibility extraction enabled. |
| [Unlock](https://www.ilovepdf.com/unlock_pdf) | Per-file password prompts, wrong-password retry, owner passwords, permissions-only inputs and batches. New `unlock-compatibility.spec.ts` adds independently produced RC4-40, RC4-128, AES-128, AES-256-R5 and AES-256 PDFs, each with reader, owner or empty-user access. Downloads are checked for absence of encryption and unchanged text, fields and widget appearances. Unknown opening-password recovery is not offered. |
| [Sign](https://www.ilovepdf.com/sign-pdf) | Draw/type/upload; signature, initials, name, date, text and stamp fields; individual page targets, position, size, rotation, duplication/deletion and undo/redo. `tools.spec.ts`, `parity.spec.ts`, `hardening.spec.ts` and `preservation.spec.ts` verify fields, geometry, static SVG and document relationships. These are visual signatures, not certified signatures. |

Shared regression coverage includes malformed/hostile inputs, cancellation and retry, repeated jobs, successful-only partial ZIPs, offline processing for all twelve routes, same-origin request restrictions, resource ceilings, mobile layouts, keyboard interaction and accessibility.

## Defects corrected

- Split previously opened in combined extraction mode, producing one PDF when the user expected separate PDFs in a ZIP. Its initial UI selection now creates one PDF per page; multiple outputs download as a ZIP. Combined extraction remains explicitly selectable. A single resulting file downloads directly.
- Custom split groups previously disagreed with preview selection and were blocked by an invalid, inactive page-range field. Shared selection logic now drives preview/export. The irrelevant field is hidden; inactive fixed/size settings no longer block a different split mode.
- Added accessible page-selection checkboxes, synchronized with the text range. The last selected page cannot be deselected accidentally.
- Signature fields now use their own targets in shared selection validation instead of the hidden legacy range.
- Batch preview highlights and instructions now use each source document's page count. Previously, later pages in a longer second PDF could be labeled outside the selection even though they were correctly exported.
- Failure to import or initialize the local QPDF engine was reported as document damage before the document had reached the engine. This failure now gives a connection/reload/retry message. A blocked-WASM test confirms correct classification and successful retry without changing the original file.

## Verification and remaining uncertainty

The reported Unlock document has not been supplied or identified by local path. Its exact error cannot yet be attributed to the engine-loading defect: the same old message also covered unsupported/malformed structures. No preservation or resource check was bypassed. Independently generated encrypted inputs and a synthetic live-site AES-256 unlock succeed; that is not proof about the user's particular document.

Initial baseline: 121 unit/processing tests and 98 Chromium browser tests passed. Expanded unit/processing suite: 124 passed in the cached Linux environment. Focused Windows Chromium run: 18 passed, covering split outputs and 15 independent encryption cases plus engine-loading retry. One additional synthetic AES-256 reader-password case passed on `https://pdf.havisu.com`.

Release verification:

- Full strict Linux browser suite against the production Nginx host: **350 passed**, no skips, in 13.9 minutes (Chromium, Firefox, WebKit and mobile Chromium). This includes all twelve tools, accessibility, offline processing, cancellation, resource limits, SEO and analytics restrictions.
- The subsequent per-source preview correction was verified with **9 passing workflow tests** across Chromium, Firefox and WebKit on the final packaged build. These cover the two split workflows plus the added batch-preview regression. The full 350-test run preceded this final correction; CI runs the expanded suite on the submitted commit.
- Final performance budgets: **3 passed**, one per desktop browser, in 33.7 seconds, using three cold/warm samples each. These are local laboratory measurements, not real-user Core Web Vitals.
- Production build, TypeScript and formatting checks passed. Final packaged-host checks passed for 14 routes, 14 legacy redirects, six legacy editing assets, security headers, WASM/JavaScript MIME types and genuine static 404s.
- Bounded static-host load: **780 requests**, concurrency levels 1/10/50/100, zero errors. This is not an internet-scale availability guarantee.
- Private lecture regression: twelve inputs merged into **295 pages**, all **295 bookmarks** and tag relationships verified; all **295 rendered pages matched exactly** at the tested resolution. Embedded video remained byte-identical (**773,546 bytes**). Pages 1–8 extracted successfully. Organize, Rotate, Compress, Watermark, Page Numbers, Sign, Protect and Unlock also passed the local corpus checks. Source files and outputs remain excluded from Git.
- Split previews were inspected in light/dark themes at 390, 768 and 1440 pixels. Document canvas pixels remained unchanged between themes.

Local testing reused the existing Docker image, browser binaries, node modules and Python tools; no dependencies, browser binaries or Docker images were downloaded. Use `LANG=C.UTF-8` and `LC_ALL=C.UTF-8` in the Linux test container: its default POSIX locale loses Unicode download filenames in headless Chromium (see SETUP.md). An initial run using that locale was stopped and replaced by the clean strict run above.

The browser tests are not physical iOS/Android or low-memory-device qualification. Font coverage, resource limits, unsupported complex PDF structures and certificate-signature invalidation remain as documented in [COMPATIBILITY.md](COMPATIBILITY.md). Public deployment remains a separate step.
