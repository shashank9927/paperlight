# Comprehensive release audit — 29 October 2026

## Contract and revision

This audit starts from `c4cd1d3` on main (merged PR #10). The [capability matrix](ACCEPTANCE-MATRIX.md) maps all twelve tools' local workflows to controls, processing branches and independently checked downloads. It supplements, rather than replaces, the restrictions in [COMPATIBILITY.md](COMPATIBILITY.md).

The user reports that Unlock now works in their own testing. No currently failing private Unlock example is available. Independent encryption variants remain mandatory regressions; the earlier error is not claimed to have a newly established document-specific cause.

## Architecture findings and fixes

| Finding                            | Before                                                                                                                                                  | Correction and regression                                                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Organize import history            | Importing after Undo left an obsolete Redo that could replace imported pages with an old snapshot.                                                      | Each successful import is a page-history action, retains sources for redo, and clears the obsolete future. UI regression failed before the fix and validates downloaded fourth-page content afterward. |
| Inactive extraction setting        | Embedded-image extraction displayed a DPI selector even though native image dimensions are used.                                                        | DPI appears only for page rendering; extraction describes native dimensions and existing bounds. Regression verifies hidden control and decoded 480×640 output.                                        |
| One successful batch output        | A partial batch with one successful PDF always produced a ZIP.                                                                                          | A single output downloads directly, retaining the per-file failure report and partial label. Multiple outputs still use ZIPs. Processing regression failed before the fix.                             |
| Stale worker message error         | A delayed message-decoding error from a terminated worker could clear current processing state or add a false error.                                    | The error handler now checks worker identity like the other callbacks. All twelve tool lifecycle regressions inject the stale callback after a successful retry.                                       |
| Rotation accessible name           | A label wrapping three buttons renamed the first button to “Rotate clockwise 180° 270°”.                                                                | A named button group replaces the wrapping label. The browser regression selects every angle by its actual accessible name and verifies rotations.                                                     |
| Hidden watermark/number settings   | An invalid image width blocked text watermarks; an oversized custom template blocked standard numbering after switching modes.                          | Validate those values only when their mode is active. The unit regression failed before the fix; active invalid settings still fail.                                                                   |
| Canonical redirects behind a proxy | Nginx emitted its internal port 8080 and dropped query strings for index/trailing-slash redirects; tool `.html` aliases did not normalize consistently. | Relative 308 redirects retain the public origin and query string; all 40 known aliases resolve correctly. The raw HTTP regression failed before the fix. Unknown lookalike paths remain 404.           |

No processing/preservation safeguard was disabled. No automatic rasterization, third-party document request, new runtime dependency or public API was added. Existing typed worker configuration, sequential batch execution, aggregate resource limits and local memory lifecycle remain in place.

## Evidence added

- Control combinations cover all page-size/orientation/fit choices, margins, image formats, rendering resolutions, numbering styles and bundled font choices. Watermark appearance tests verify tiled text and independently rendered colored pixels. Each permission control is checked against its own independent PDF permission bit.
- All six signature field kinds are created, resized, rotated, repeated, duplicated/deleted and exported with independent text/pixel checks.
- Twenty seeded reorder/duplicate/delete sequences compare exact page text, rotations and original-file hashes. Split→merge and protect→unlock round trips compare content and page boxes. Size splitting checks the measured serialized-byte boundary and one byte less.
- Every tool exercises invalid admission, cancellation, discarded output, recovery, download, stale-worker error rejection and reset cleanup. A separate twenty-job test verifies processing-worker release after every job and complete document-worker release at reset, with network/storage checks.
- Existing tests retain populated forms/tags/navigation/media/layer checks, parser/resource boundaries, live worker deadlines, both themes, offline operation for all tools, installation/update behavior, SEO and analytics isolation.
- Recovery tests exercise missing workspace chunks, blocked processing-worker assets, and real service-worker cache exceptions through a local synthetic-fixture proxy. They assert successful retry, active service-worker control and an empty cache rather than assuming fault injection occurred. A simulated waiting deployment cannot activate while documents or results remain.
- Partial-result tests cover both themes at 390/768/1440 pixels, accessibility, single successful PDF downloads, multi-output ZIPs with colliding source names, explicit failed-file attribution and successful retry after adjusting the range.
- CI repeats cancellation, stale-result and asset-retry scenarios three times with no retries. Its job ceiling increases from 25 to 45 minutes for the expanded verification workload; no test or performance threshold is relaxed.

## Release results

The fresh 31 October frozen-build browser run passed **452 tests in 18.2 minutes**, across Chromium, Firefox, Linux WebKit and mobile Chromium, with zero failures, skips or retries. The last batch-cancellation regression was added after that run began and is included in the separate three-run lifecycle gate and the final CI suite. Tests use strict browser capabilities, UTF-8 Linux locale and cached dependencies/browsers/images.

Unit/processing verification passed **129 tests in 14 files** (7.46 seconds). Type checking and formatting passed. Hosting verification passed all fourteen routes, forty canonical aliases, fourteen legacy page redirects, six legacy editing assets, script/worker/WASM MIME checks, security headers and genuine 404s. Bounded local load passed 780 requests at concurrency 1/10/50/100 with zero errors. These checks exercised the same packaged artifact; no public stress test was performed.

The lifecycle gate passed **144 tests in 4.4 minutes**: sixteen critical scenarios per browser, each run three times, without failures, skips or retries. This includes cancelling after the first completed batch file. The final CI suite includes all **455** browser cases together. All **three isolated benchmark tests passed** (28.7 seconds total), with six cold/warm samples per browser. Exact measurements and sanitized aggregate evidence are in [the release evidence](evidence/comprehensive-release-2026-10-31.json). The follow-up PR and its CI manifest identify the final commit and fresh CI results; CI must be green before the PR is marked ready.

The final application artifact is built with cached Node 24.22.1 and is available in `dist/` and the local Nginx preview at `http://127.0.0.1:4185`. An earlier Windows-shell build used the machine's Node 25; its browser run was interrupted when the hosting redirect defect was discovered and is not a release pass. The final Node 24 run starts clean against the corrected Nginx image. All 301 packaged static files were fetched and matched against the frozen artifact hashes.

| Browser          | Maximum load | Maximum preview | Maximum processing | Maximum timer gap |
| ---------------- | -----------: | --------------: | -----------------: | ----------------: |
| Chromium         |       135 ms |          421 ms |             271 ms |             31 ms |
| Firefox          |       415 ms |          948 ms |             347 ms |             38 ms |
| Linux WebKit     |       219 ms |        1,085 ms |             551 ms |             84 ms |
| Unchanged budget |     2,000 ms |        3,500 ms |           2,500 ms |            250 ms |

Values above round upward from the raw measurements. These are loopback laboratory results for the established three-page fixture, not large-document or physical-phone promises.

The 29 October Node 24 browser run was also interrupted by shutdown; its partial results do not count as a release pass. Verification resumed on 31 October against the unchanged cached artifact and a complete fresh suite, including the additional recovery/partial-result cases. The local optimized build intentionally has indexing and analytics disabled; production Vercel flags remain separately covered by the metadata/analytics tests.

Independent private-corpus validation passed: twelve inputs, 295 merged pages, 295 outline entries, valid accessibility relationships, exact same-renderer pixels on all 295 pages, and a byte-identical 773,546-byte embedded video. Eight-page extraction and organize outputs retained valid navigation/tags; watermark, numbering, sign, protect and unlock were independently checked on sixteen-page inputs. Rotate and compress batches each contained twelve entries. These are aggregate results, not published private documents.

Frozen artifact: 301 files, 12,202,362 bytes; tree SHA-256 `568c686a8021fddea12ae270c5e8d5eb542cd1d8cde261d7fb2e80a100928cdc`. Local image `havisu-pdf:release-node24` has image ID `sha256:d4e59308f6f24230b5d4b47e0ff0849f6134e0e601983c3ad7f619219db19c69`. The lockfile SHA-256 is `c3a79bb4c193e8bc2f1689d47610f9bb323a96efe1438a12124a77b55de09d11`. CI generates its own manifest with its exact checked-out commit and artifact hashes; differing build-environment metadata is not claimed to be byte-identical to the local preview.

## Reproduction and limitations

Use Node 24, the lockfile's cached packages, existing Playwright 1.64.1 browsers, and Python dependencies from `scripts/requirements-test.txt`, with Poppler available. Set `PAPERLIGHT_PYTHON` if using the bundled Python runtime. In the Linux verification environment set `LANG=C.UTF-8`, `LC_ALL=C.UTF-8`, `PAPERLIGHT_PREBUILT=1`, `PAPERLIGHT_STRICT_BROWSERS=1`, and `PAPERLIGHT_TEST_ORIGIN` to the local packaged Nginx host.

```text
npm run typecheck
npm run format:check
npm test
npm run build
node scripts/release-manifest.mjs
npx playwright test --grep-invert "measured cold/warm"
npx playwright test tests/e2e/release-workflows.spec.ts tests/e2e/hardening.spec.ts tests/e2e/unlock-compatibility.spec.ts tests/e2e/experience.spec.ts --grep "invalid admission cancellation|rapid reset|unavailable PDF engine|cancellation and reset|batch cancellation" --repeat-each=3 --workers=2 --output=.cache/lifecycle-gate
npx playwright test tests/e2e/benchmark.spec.ts --workers=1 --output=.cache/benchmarks
node scripts/check-hosting.mjs http://127.0.0.1:4185
node scripts/load-static.mjs http://127.0.0.1:4185
```

Private lecture fixtures and output bytes remain local and excluded from Git/CI artifacts. Their existing local verification scripts are intentionally not published with identifying file paths. Public evidence contains aggregate counts only.

The comparison is for the approved local workflows. Cloud imports, AI/smart splitting, signature requests, certified signing and unknown-password recovery are excluded. Complex unsupported document structures still fail explicitly rather than lose features. Physical iPhone/Android/macOS qualification, account settings and public deployment remain separate. Browser automation, local load results and laboratory performance budgets are not a guarantee about every PDF, global traffic or real-user Core Web Vitals.
