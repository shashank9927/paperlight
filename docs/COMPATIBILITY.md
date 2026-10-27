# Ordinary-document compatibility

Havisu PDF's twelve existing tools keep their local select/configure/process/download workflows. This update fixes overly broad preservation errors, adds common form/layer/media assembly, and validates the reported lecture-file cases. Source documents and local private outputs are excluded from Git and CI artifacts.

## Selection and document structures

Merge maps every selected source's page content, bookmarks, valid navigation, tags and annotations. Split and Organize use selection-aware navigation: destinations and leaf bookmarks for excluded pages are pruned; headings with retained children survive without an invalid target. Links to excluded pages lose their unavailable action while retaining appearance and annotation/tag associations. Ordinary selection does not raise an omission prompt. Malformed destinations still fail explicitly. Size splits measure rebuilt serialized output.

The primary selected source determines document-level metadata and opening view. Harmless opening destinations/GoTo actions are remapped, and an opening target excluded by extraction is omitted. Embedded file collections and associated files are combined with source-scoped collection keys. Screen/Rendition media annotations keep their annotation/page references and exact payload bytes. Havisu PDF does not execute embedded media, JavaScript or file-launch actions in its preview; media playback in exported PDFs depends on the reader.

Common AcroForm fields retain values, defaults, flags, widget appearances, page references and parent/child trees. Colliding root field names are scoped to their source; duplicated pages get independent fields/widgets. Default appearance font resources are scoped and remapped without substituting fonts. Only retained widgets remain in extraction outputs. Optional-content groups retain default visibility, membership references, locked/radio groups and alternate configuration visibility/order.

Copied objects/data, newly generated form names, traversal and final serialization remain bounded. A semantic fingerprint verifies form/widget relationships, layer definitions, opening views and embedded payloads after QPDF rewriting, alongside existing navigation/tag/profile validation. Cancellation and recoverable settings retain the existing worker lifecycle.

## Real-document verification

The locally identified twelve-file lecture set contains 295 pages. Its merged output was independently verified with pypdf, PDF.js structures and Poppler: all 295 pages retain text/order, all 295 bookmarks are remapped, tag relationships validate, and all 295 rendered pages match the original page pixels at 72 DPI. PDF.js confirms matching text on all 295 pages and matching structure trees on all 279 originally tagged pages. Empty table cells/rows retain their roles and associations, including duplicated pages. The embedded MP4 remains exactly 773,546 bytes with the same SHA-256 hash and valid annotation/page associations.

Extracting pages 1–8 of the reported 16-page Foundations document produces eight pages and eight valid bookmarks/tags without an omission prompt. The same local corpus exercises Organize, Rotate and Compress batches, Watermark, Page Numbers, Protect, Unlock and Sign. Local image-workflow/UI verification and final complete browser/hosting results are recorded in the follow-up PR's description/checks; do not infer their success from this paragraph alone. No original documents or extracted content are published with those results.

## Twelve-tool acceptance map

The complete control/processing/output mapping remains in [REDESIGN.md](REDESIGN.md). The release suite exercises every existing route:

| Tools                         | Output checks                                                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Merge, Split, Organize        | Ordering, extraction/group modes, byte limits, blanks, rotation, duplicates, undo/redo; bookmarks/tags/navigation/forms/layers/embedded media |
| Compress                      | Lossless, 90/75/50 image presets, explicit raster mode, text/vector retention, accurate sizes and original fallback                           |
| Rotate                        | Page/file/range/orientation selection, reset, batches and retained structures                                                                 |
| Images to PDF, PDF to Images  | Formats, transparency, orientation, sizes, margins/fit, combined/separate output, page rendering/extraction and named ZIP content             |
| Watermark, Page Numbers, Sign | Styles, geometry, ranges, typography, layering, independent fields/history and preview/export agreement                                       |
| Protect, Unlock               | AES-256, passwords/permissions, sequential batches, unencrypted output and unrelated structure retention                                      |

`compatibility.test.ts`/`compatibility.spec.ts` add populated media/action graphs, colliding forms, duplicate widgets, default-appearance font collisions, layer visibility/configuration/membership, retained outline headings and normal navigation pruning. The independent Python oracle checks embedded SHA-256 values and media/layer references. Existing tests still cover invalid inputs, cancellation, retries, repeated jobs, partial batches, offline/network isolation, resource boundaries and responsive accessibility.

## Remaining limits and delivery

This is ordinary-workflow compatibility, not certification of every PDF producer. XFA, portfolios, article threads, certification/usage-right signatures, PDF 2.0 tag namespaces, tagged form XObjects and cross-element structure Ref constructs retain explicit restrictions. JavaScript, Launch, SubmitForm and ImportData actions are rejected for assembly. Conflicting document-wide output conditions require a color-managed editor. Rewriting does not preserve existing cryptographic signature validity; the existing notice remains.

Physical low-memory phones and macOS/iOS Safari remain separate device qualification. Full strict Chromium/Firefox/WebKit results run on Linux CI; cached Windows WebKit lacks background raster APIs. Public deployment, account firewall settings and Search Console ownership remain account handoff steps. The reviewed follow-up PR records the exact verified source revision and final check counts. Local builds reuse cached dependencies/browsers/images.
