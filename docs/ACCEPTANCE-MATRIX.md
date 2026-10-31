# Havisu PDF capability contract

Reference review: 29 October 2026. This matrix covers the twelve existing tools and the approved local-processing workflows, not cloud services or support for every PDF producer. The primary references are the corresponding iLovePDF pages linked below. No private document is uploaded to those services.

## How evidence is interpreted

Every row follows file selection → configuration → worker processing → download → independent reopening. `ToolSettings`/`ExtraSettings` and `Workspace` supply controls; `configureJob` whitelists configuration; `validateJob` and `processJob` validate and process it. Single outputs download directly; multiple outputs use ZIPs. Batch errors retain per-file status and only successful outputs are offered. Defaults are recorded below; continuous controls are exercised at boundaries and representative interior points, not every real number.

Evidence codes refer to test files under `tests/`: **T** `e2e/tools.spec.ts`, **P** `e2e/parity.spec.ts`, **H** `e2e/hardening.spec.ts`, **C** `e2e/compatibility.spec.ts`, **S** `e2e/preservation.spec.ts`, **M** `e2e/control-matrix.spec.ts`, **R** `e2e/release-workflows.spec.ts`, **X** `e2e/split-workflows.spec.ts`, **U** `e2e/unlock-compatibility.spec.ts`, **J** `parity.test.ts`, **A** `assembly.test.ts`, **K** `compatibility.test.ts`, **G** `release-contract.test.ts`. Test names identify the scenario within each file; exact run results belong in RELEASE-AUDIT.md, not inferred from test existence.

PDF downloads are read by PDF.js and independently by pypdf/Poppler. Assembly checks also inspect object relationships; rendering alone does not establish preservation. Image output is decoded independently; ZIPs are unpacked and each entry checked. Synthetic fixtures include the three-page mixed/cropped/rotated document, one-page text document, transparent artwork, populated structured PDFs, and independently encrypted form PDFs. Private lecture evidence publishes only aggregate results.

All 103 capability rows below have passing automated evidence for the named bounded fixtures. “Verified” covers those assertions, not every possible PDF or combination. The release report records exact run results and qualification limits. Existing unsupported structures remain explicit restrictions, not passing feature-parity cases.

## Merge — [reference](https://www.ilovepdf.com/merge_pdf)

| Capability / control and default         | Processing / expected output                                                 | Evidence                  | Status   |
| ---------------------------------------- | ---------------------------------------------------------------------------- | ------------------------- | -------- |
| Add files; remove file; previews         | Admission + source list; removed source contributes no pages                 | T merge; H replacement    | Verified |
| Drag/arrow ordering; initial input order | Assembly follows source order                                                | T merge; mobile reorder   | Verified |
| Sort A–Z                                 | Sorted source order, verified in actual text                                 | P alphabetical order      | Verified |
| Rotate file, initially 0°                | Each source page gets requested extra rotation                               | P alphabetical order      | Verified |
| Mixed dimensions and encrypted inputs    | Admission decrypts locally; assembly retains page boxes                      | T; H encrypted input      | Verified |
| Bookmarks and direct/named links         | Combined hierarchies and remapped targets, including collisions              | A three-document merge; S | Verified |
| Tags and reading relationships           | Rebuilt parent trees, identifiers, roles/classes and annotation associations | A; K; S                   | Verified |
| Forms, layers and embedded media         | Independent field names; default visibility and exact payloads               | C; K                      | Verified |

## Split — [reference](https://www.ilovepdf.com/split_pdf)

| Capability / control and default         | Processing / expected output                                         | Evidence                            | Status   |
| ---------------------------------------- | -------------------------------------------------------------------- | ----------------------------------- | -------- |
| Split mode: individual (UI default)      | One PDF per selected page; ZIP for multiple outputs                  | X default ZIP                       | Verified |
| Pages text / checkboxes; blank means all | Shared selection; input order preserved; invalid ranges rejected     | X; T validation                     | Verified |
| Extract into one PDF                     | Selected pages combined in requested order                           | X; T split                          | Verified |
| Custom groups; default `1`               | Semicolon groups, duplicates across groups retained                  | X; J custom groups                  | Verified |
| Combine groups; default off              | One PDF, including repeated pages in different groups                | X; J                                | Verified |
| Fixed groups; default 1 page             | Full groups and final remainder                                      | P; J fixed groups                   | Verified |
| Maximum size; default 1024 KiB           | Measure rebuilt bytes, no oversized output, reject unsplittable page | P; J; G byte boundary               | Verified |
| Allow compression; default off           | Image optimization only on explicit size-mode selection              | J hidden lossy settings             | Verified |
| Excluded-page navigation                 | Prune invalid destinations; retain headings with retained children   | K; S extraction                     | Verified |
| Form/tag/media preservation              | Retained widgets and associations remain valid                       | K; C; private eight-page extraction | Verified |

## Compress — [reference](https://www.ilovepdf.com/compress_pdf)

| Capability / control and default     | Processing / expected output                                           | Evidence                 | Status   |
| ------------------------------------ | ---------------------------------------------------------------------- | ------------------------ | -------- |
| Preserve text; default lossless      | QPDF stream/object optimization, selectable text and vectors retained  | compression corpus; T    | Verified |
| Optimize embedded images             | QPDF image optimizer, not page rasterization                           | P batch; J image presets | Verified |
| Quality presets 90/75/50; default 75 | All three settings execute; actual size and text independently checked | J each quality           | Verified |
| Explicit whole-page raster mode      | Disclosure visible; rendered pages use selected quality                | T; compression corpus    | Verified |
| Raster quality 0.35–0.90             | Bounded canvas conversion with real image output                       | T; H rendering           | Verified |
| Batch status and savings             | Sequential jobs, actual byte totals, distinct outputs                  | P; J partial batch       | Verified |
| Original fallback                    | Exact original bytes retained if no reduction, including encryption    | compression corpus; T    | Verified |

## Organize — [reference](https://www.ilovepdf.com/organize-pdf)

| Capability / control and default | Processing / expected output                                   | Evidence                     | Status   |
| -------------------------------- | -------------------------------------------------------------- | ---------------------------- | -------- |
| Import additional PDFs           | Sources remain available for undo/redo; imported pages append  | R import history             | Verified |
| Blank page                       | A4 blank with valid dimensions and no unexpected text          | P; J; A                      | Verified |
| Reorder by drag/arrows           | Ordered references determine output                            | T; G deterministic sequences | Verified |
| Rotate                           | Per-reference quarter-turns                                    | T; G                         | Verified |
| Duplicate                        | Independent annotation/widget/tag references                   | A; K; C; G                   | Verified |
| Delete                           | Retained content only, navigation pruned safely                | T; K; G                      | Verified |
| Extract selected pages           | One output preserving selected order                           | T; K                         | Verified |
| Undo / redo                      | Restore page state; new edits/imports invalidate obsolete redo | P; R                         | Verified |

## Rotate — [reference](https://www.ilovepdf.com/rotate_pdf)

| Capability / control and default                | Processing / expected output                              | Evidence               | Status   |
| ----------------------------------------------- | --------------------------------------------------------- | ---------------------- | -------- |
| Angle 90/180/270; default 90                    | Global and per-page adjustments applied exactly once      | T; J rotation          | Verified |
| Page/file rotation; initially 0                 | Correct source receives additional angle                  | P batch rotation       | Verified |
| Pages; default all                              | Unselected pages unchanged                                | T ranges               | Verified |
| Orientation all/portrait/landscape; default all | Target current visible dimensions including crop/rotation | J; M rotation controls | Verified |
| Reset settings / Reset all                      | Global and page adjustments clear as labeled              | P; M rotation controls | Verified |
| Batches                                         | Each source retains dimensions/content/structures         | P; private corpus      | Verified |

## Images to PDF — [reference](https://www.ilovepdf.com/jpg_to_pdf)

| Capability / control and default       | Processing / expected output                           | Evidence                     | Status   |
| -------------------------------------- | ------------------------------------------------------ | ---------------------------- | -------- |
| JPEG / PNG / WebP                      | Decode bounded dimensions; preserve transparency       | T; M image controls          | Verified |
| EXIF orientation                       | Orientation applied before page sizing                 | H EXIF                       | Verified |
| Reorder and rotate                     | Page order and image orientation follow controls       | T; P                         | Verified |
| A4 / Letter / original; default A4     | Exact page dimensions                                  | M image controls             | Verified |
| Portrait / landscape; default portrait | Swap fixed-page dimensions; hidden for original sizing | M                            | Verified |
| Margin 0–72 pt; default 24             | Correct available box with bounded margins             | M; image clipping regression | Verified |
| Contain / cover; default contain       | Whole-image fit versus clipping inside margins         | T; M; hardening              | Verified |
| Combined / separate; default combined  | One PDF or per-image PDFs in named ZIP                 | T; P                         | Verified |

## PDF to Images — [reference](https://www.ilovepdf.com/pdf_to_jpg)

| Capability / control and default            | Processing / expected output                                | Evidence           | Status   |
| ------------------------------------------- | ----------------------------------------------------------- | ------------------ | -------- |
| Render / extract; default render            | Pages rasterize; extraction returns image objects only      | P; R native size   | Verified |
| Pages; default all                          | Only selected pages contribute output                       | T                  | Verified |
| PNG / JPEG; default PNG                     | Correct encoding, alpha or white JPEG background            | T; H; M rendering  | Verified |
| Rendering 72/144/216 DPI; default 144       | Expected pixel dimensions within caps                       | M rendering        | Verified |
| JPEG quality 0.35–0.95; default 0.7         | Actual JPEG at low/high settings                            | M                  | Verified |
| Repeated / inline / masked image extraction | Decoded pixels, deterministic per-page deduplication        | P extraction       | Verified |
| Empty extraction                            | Actionable no-image result, no fake output                  | M empty extraction | Verified |
| Batch naming and ZIP                        | Collision-free page/image names, independent image decoding | T; P; J            | Verified |

## Watermark — [reference](https://www.ilovepdf.com/pdf_add_watermark)

| Capability / control and default   | Processing / expected output                       | Evidence                        | Status   |
| ---------------------------------- | -------------------------------------------------- | ------------------------------- | -------- |
| Text / image; default text         | Text glyphs or locally rasterized static artwork   | T; P                            | Verified |
| Text and font family; default sans | Supported glyphs retained; missing glyphs explicit | T Unicode; H; M appearance      | Verified |
| Bold / italic; default off         | Matching font variant                              | M appearance                    | Verified |
| Background / shadow; default off   | Appearance options painted in output               | M appearance                    | Verified |
| Size, color, opacity               | Exact configured PDF style and visible content     | T; H geometry; M appearance     | Verified |
| Position and rotation              | Preview/export agreement on crop and quarter-turns | H geometry                      | Verified |
| Image width; default 30%           | Proportional size and aspect ratio                 | P image watermark               | Verified |
| Repeat tiles; default off          | Nine placements rather than one                    | M appearance                    | Verified |
| Above / below; default above       | Underlay obscured by opaque existing page content  | P underlay                      | Verified |
| Pages and batches                  | Per-source selection and consistent placement      | R batch preview; private corpus | Verified |

## Page Numbers — [reference](https://www.ilovepdf.com/add_pdf_page_number)

| Capability / control and default                     | Processing / expected output                           | Evidence             | Status   |
| ---------------------------------------------------- | ------------------------------------------------------ | -------------------- | -------- |
| Start counter; default 1                             | Exact sequential counter                               | T; M numbering       | Verified |
| Pages; default all                                   | Counter advances on selected pages only                | T; H geometry        | Verified |
| Cover exclusion; default off                         | Cover neither marked nor counted                       | P; M                 | Verified |
| Single / facing layout; default single               | Mirrored positions according to page parity            | P; J; M              | Verified |
| Minimum margin; default 24 pt                        | Position stays inside required margin                  | J; H geometry        | Verified |
| Number / Page / total / custom style                 | Exact text for each style                              | M numbering          | Verified |
| Tokens `{n}`, `{p}`, `{r}`, `{rf}`                   | Counter, document count, selected count, final counter | P; J; M              | Verified |
| Typography, size, color, opacity, background, shadow | Font/style combinations survive export                 | M numbering; H       | Verified |
| Position and batches                                 | Preview/export geometry uses each source's count       | H; R; private corpus | Verified |

## Protect — [reference](https://www.ilovepdf.com/protect-pdf)

| Capability / control and default          | Processing / expected output                                    | Evidence            | Status   |
| ----------------------------------------- | --------------------------------------------------------------- | ------------------- | -------- |
| Opening password and confirmation         | AES-256, mismatch/empty rejection, correct password works       | T; hardening unit   | Verified |
| Unicode and 127-byte boundary             | No silent truncation or normalization                           | H password boundary | Verified |
| Advanced owner password; default disabled | Independent user/owner access                                   | J; P                | Verified |
| Permissions-only mode                     | Empty-user encryption remains readable, owner controls retained | P; H                | Verified |
| Printing permission                       | Independent permission bit                                      | M protection        | Verified |
| Copy permission                           | Independent permission bit                                      | M protection        | Verified |
| Content editing permission                | Independent permission bit                                      | M protection        | Verified |
| Comments permission                       | Independent permission bit                                      | M protection        | Verified |
| Form filling permission                   | Independent permission bit                                      | M protection        | Verified |
| Assembly permission                       | Independent permission bit                                      | M protection        | Verified |
| Preserved structures and batches          | Encryption does not flatten content; round-trip valid           | G; private corpus   | Verified |

## Unlock — [reference](https://www.ilovepdf.com/unlock_pdf)

| Capability / control and default      | Processing / expected output                              | Evidence             | Status   |
| ------------------------------------- | --------------------------------------------------------- | -------------------- | -------- |
| Reader password                       | Prompt, correct password, unencrypted result              | U five algorithms    | Verified |
| Owner password                        | Owner access decrypts without altering fields             | U five algorithms    | Verified |
| Empty-user permissions-only files     | No unnecessary opening-password prompt                    | U five algorithms    | Verified |
| Wrong password and retry              | Prompt stays recoverable, no false damaged-file claim     | T                    | Verified |
| Already-unencrypted PDF               | Valid unencrypted output                                  | offline unlock; G    | Verified |
| Different passwords in batch          | Prompt per source; all entries independently decrypted    | P batch unlock       | Verified |
| Engine asset failure and retry        | Connection/load message, subsequent good job succeeds     | U unavailable engine | Verified |
| Encryption removed, content preserved | Independent encryption flag, text, fields and appearances | U; G round-trip      | Verified |

## Sign — [reference](https://www.ilovepdf.com/sign-pdf)

| Capability / control and default        | Processing / expected output                               | Evidence             | Status   |
| --------------------------------------- | ---------------------------------------------------------- | -------------------- | -------- |
| Draw / type / upload                    | Real artwork, nonempty output, reset removes old signature | T                    | Verified |
| Signature / initials / stamp fields     | Independent artwork references and page targets            | M field types        | Verified |
| Name / date / text fields               | Editable text and correct selected-page output             | P; M field types     | Verified |
| Multiple fields                         | Each field uses its own range and style                    | P; M                 | Verified |
| Position / resize / rotate / opacity    | Geometry shared with preview; keyboard and pointer access  | T; H; P; M           | Verified |
| Duplicate / delete                      | Correct field count and output membership                  | P; M                 | Verified |
| Undo / redo                             | Restored settings produce correct output                   | P; M                 | Verified |
| Page repetition                         | Field only appears on requested pages                      | P; M                 | Verified |
| Font/style/color and unsupported glyphs | Bundled fonts, explicit unsupported text                   | H; M                 | Verified |
| PNG/JPEG/WebP/static SVG                | Bounded local artwork; active SVG rejected                 | T; P; signature unit | Verified |

## Cross-cutting and intentional exclusions

Cancellation/reset/retry, stale messages, worker failures, 20 repeated jobs, resource ceilings and malformed worker data map to `release-workflows`, `experience`, `resources`, `hardening`, `worker-validation` and `service-worker` tests. Offline operation covers every route. Theme/layout/a11y are checked at 390/768/1440 in both themes, plus mobile keyboard/reorder controls. SEO/analytics/brand/install tests cover all fourteen public pages and prohibit document transmission/storage.

Excluded by the product contract: cloud imports, AI/smart splitting, remote signature requests, certified signing and unknown opening-password recovery. Restricted PDF structures are listed in COMPATIBILITY.md and receive explicit failures; this matrix does not relabel them as successful conversions. Physical iOS/Android/macOS qualification is not established by Linux WebKit or viewport emulation.
