# Preservation and reliability release

## Problem and behavior

Merge previously rejected any Outlines, StructTreeRoot, or internal destination,
even empty structures. Page selection alone could only retain the primary input's
catalog. Assembly now explicitly maps source pages/annotations/objects, combines
outlines and destinations from all inputs, and rebuilds supported tag trees.
Source names identify unsupported structures. Full preservation remains required;
there is no automatic simplification, tag removal, or raster fallback.

Split/Organize share the assembler. A link/bookmark/destination to an excluded
page is rejected rather than left dangling. Links resolve to the first retained
target occurrence, with self-links on a duplicated page targeting its copy.
Page labels, rotations and page resources remain associated with their source.
Size splitting measures final serialized output after structure reconstruction.

Supported accessibility structures include page marked-content IDs, MCR items,
annotation OBJR items, nested elements, alternative/actual text, language, IDs,
role mappings and class mappings. Conflicting names are scoped to their source.
PDF 2.0 namespaces, tagged form XObjects, cross-element Ref constructs, interactive
form assembly, attachments, layers, portfolios and active actions remain explicit
compatibility restrictions. Passing structural tests is not PDF/UA certification.

Watermarks and numbers are tagged as artifacts. Visual signing extends the
existing parent tree with semantic span/figure fields. Image optimization is
distinct from whole-page rasterization in preservation classification.

## Evidence available during implementation

- Unit/processing coverage includes populated three-input merge fixtures with
  colliding destinations/roles/classes/IDs, independent annotation/tag parents,
  reordered/duplicated pages, exclusions, inconsistent source parent trees and
  populated navigation through Rotate/Compress/Protect/Unlock.
- `tests/fixtures/chromium-tagged.pdf` is a two-page PDF generated locally from
  synthetic HTML with Chromium's tagged/outline export. It contains real heading,
  paragraph, image-alt and internal-link structures. It has no user document data.
  Three copies merge and pass independent pypdf and PDF.js checks.
- The targeted Chromium/WebKit production-build run passed 36 checks, covering
  three-input merge, tagged watermark/numbers/signing, retained range on error,
  smooth/reduced-motion themes, fourteen crawlable pages, responsive states and
  offline navigation. Final Linux/browser/hosting results must be recorded for
  the delivered revision; these targeted results do not imply that run passed.
- Cache fault tests cover blocked reads/opening, full writes, and separate HTML/
  asset caches across deployments. Documents, credentials and analytics stay out
  of service-worker caches. Public assets use a generated exact manifest.

The user's original three PDFs are unavailable; their exact compatibility has
not been verified. Windows Firefox and worker-raster WebKit limits remain as
recorded in SEO-VERIFICATION.md. Full strict raster coverage runs on Linux CI.

## Remaining release evidence

Record final unit counts, complete browser results, Nginx contract, performance,
bounded local load, accessibility/visual inspection, dependency audit and actual
CI revision before declaring release verification complete. Public deployment,
firewall activation and Search Console ownership remain separate account steps.

## Additional audit corrections

Output serialization is checked before pdf-lib allocates its final buffer. Copied strings/streams and repeated traversal have aggregate limits. Organize ignores compatibility features of fully excluded source documents, and generated blanks do not consume the external-input page ceiling. Matching decoded ICC output conditions survive differing stream encodings; conflicting conditions are explicit errors. Primary print-page ranges are remapped, extension declarations retained/combined, and the highest selected PDF version is declared. Unknown catalog/name-tree features remain explicit restrictions.

The first Linux run passed 248 browser checks but found three UI timing failures: premature keyboard interaction during homepage hydration, transition sampling after its short lifetime, and contrast sampling mid-animation. Search now has an explicit ready state; motion is sampled synchronously and contrast checked after settling. Final full Linux results and counts are published in the [PR #3 description and checks](https://github.com/shashank9927/paperlight/pull/3), which identify the exact verified revision.
