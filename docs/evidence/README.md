# Verification evidence

The redesign release is documented in `../REDESIGN.md`. Files beginning `redesign-` describe that release. Other files below retain the earlier hardening evidence and must not be used as the new artifact identity.

The theme toggle follow-up is also recorded in `../REDESIGN.md`; `theme-toggle-*` contains its focused browser results, keyboard-focus recheck, and final local hosting check.

Redesign evidence includes the exact static manifest/image ID, production build/package logs, browser matrix report, separate benchmarks, hosting contract, and representative dark/light screenshots. Full synthetic documents and screenshots remain in ignored `.cache` directories and the cached verification container.

Pre-redesign evidence (retained for history):

- `production-e2e-final.txt`: latest full functional run against Nginx: 145 passed, one fast-job cancellation test timing failure. `reset-verification.txt` records the corrected test passing 9/9 repeated checks across all three engines. Together they cover all 146 unique scenarios; the full run is not relabeled as entirely green.
- `password-verification.txt`: nine repeated WebKit password-boundary, retry and CSP checks after fixing the actual WASM error classification.
- `production-verification.txt`: Linux type/format checks and 60 processing tests; the first production browser run exposed an asynchronous worker-close assertion subsequently corrected. Its failure remains recorded here.
- `processing-tests.txt`: latest 60 processing tests on Windows, including actual WASM password classification and independent certificate-signature invalidation.
- `production-benchmarks.txt` and `production-benchmark-*.json`: separate single-worker performance run and raw measurements.
- `production-corpus-*.json`, `production-500-pages-*.json`, `production-100-mib-*.json`: final functional fixtures and measured sizes/timings. These are synthetic documents, not a real-world corpus or phone qualification.
- `hosting-check.txt`: all routes, restrictive headers, all JavaScript/module worker MIME types, WASM and missing-file responses on Nginx.
- `production-offline-build.txt`: packaging the final build using cached images with container build networking disabled.
- `release-artifact.json`: hashes and sizes of all 250 static files, lockfile hash and tested production-image identity; entrypoints were compared with the running image.
- `verification-resources.json`: whole-container lifetime memory peak and OOM counters, with scope limitations. `format-check.txt` records the final formatting check; `hosting-check-loopback.txt` checks the accessible local preview.
- `npm-ci.txt`: clean, offline Windows install; `container-install.txt`: Linux installation and capabilities; `npm-audit.json`: latest advisory check.
- `build.txt`, `typecheck.txt`, `dependencies.json`, `browser-capabilities-linux.json`: successful build, types and actual package/runtime versions.
- `production-watermark-preview-90.png` and `production-watermark-output-90.png`: current Firefox preview and independently rendered Poppler result, visually inspected.

Historical evidence is retained, not counted as current acceptance: `e2e.txt`, the unprefixed `benchmark-*` files, `browser-capabilities.json`, `linux-verification.txt`, and the unprefixed placement images. The Windows baseline had browser limitations; the earlier Linux run exposed the password-classification defect fixed before final acceptance. `container-build.txt` records the initial verification-image setup; `production-container-build.txt` records the initial multi-stage production build. Reusing those cached images requires no repeated downloads.

Full generated documents and traces are copied under `test-results/production`. HTML reports are in `playwright-report/production` and `playwright-report/reset`. These directories and `.cache` remain ignored. Do not use trace-recording verification on private user documents.
