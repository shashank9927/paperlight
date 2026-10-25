# Reproduce verification

Use Node 24, Python with the packages pinned in `scripts/requirements-test.txt`, OpenSSL, and Poppler (`pdfinfo` and `pdftoppm`). These are development dependencies; the deployed website serves static files. No credentials or document-processing backend are needed.

## First setup

```sh
npm ci
python -m pip install -r scripts/requirements-test.txt
npx playwright install --with-deps chromium firefox webkit
```

Install browsers once and reuse their cache. `npm ci --offline --no-audit` works when the lockfile's packages are cached; it was exercised on this Windows host. Postinstall verifies the upstream QPDF WASM hash and generates its memory-bounded local copy. Do not hand-edit dependencies or commit `src/generated/`.

```sh
npm run typecheck
npm run format:check
npm test
npm run build
npm run test:e2e -- --grep-invert "measured cold/warm"
npm run test:e2e -- tests/e2e/benchmark.spec.ts --workers=1 --output=.cache/benchmarks
node scripts/dependency-evidence.mjs
node scripts/browser-capabilities.mjs
npm audit --json
```

Set `PAPERLIGHT_STRICT_BROWSERS=1` for release verification: missing worker raster APIs fail instead of skipping tests. Set `PAPERLIGHT_PYTHON` to the validation interpreter if needed. `CHROMIUM_PATH` can select an installed Chromium. Do not run suites simultaneously against the same output directory. Traces contain synthetic fixtures; never capture them from private documents.

The normal Playwright configuration builds and starts production preview on port 4173. `PAPERLIGHT_TEST_ORIGIN=http://127.0.0.1:8080` disables that server and targets an existing static host. Benchmarks run separately with one worker to avoid competition with functional tests.

## Reuse the existing Linux environment without downloads

The local image `paperlight-verify:local` contains Node 24, Python validators, Poppler and all three Playwright browsers. The existing `paperlight-release-verify` container contains Linux npm dependencies. Start and reuse it:

```sh
docker start paperlight-release-verify
docker exec -e PAPERLIGHT_PYTHON=/opt/paperlight-tests/bin/python -e LANG=C.UTF-8 -e LC_ALL=C.UTF-8 -e PAPERLIGHT_STRICT_BROWSERS=1 paperlight-release-verify sh -lc 'cd /workspace && npm test'
```

The UTF-8 locale is required for Unicode download filenames in headless Chromium. A login shell may reset `PATH`, so set `PAPERLIGHT_PYTHON` explicitly. This container uses a copied checkout, not a live bind mount: copy changed sources before checking them. Exclude host `node_modules`, `dist`, `.git`, caches, results and generated WASM from source synchronization. Keep the existing Linux dependencies and generated WASM; copy final `dist` separately when checking the production artifact.

The container uses 4 CPU cores, 6 GiB memory and 1 GiB shared memory. Browser emulation does not substitute for physical phones. Windows WebKit lacks worker OffscreenCanvas, and this host's Windows Firefox binary cannot launch; use the Linux environment for the complete matrix.

`.devcontainer/` is the repeatable first-time recipe, built and exercised locally. Changing browser/package versions may require large downloads. Ordinary code verification does not require rebuilding it or reinstalling browsers.

## Build and check the production server

The root `Dockerfile` performs a complete dependency install and build. For repeated local packaging, run `npm run build`, then use the cached Nginx image with networking disabled:

```sh
docker build --pull=false --network=none -f deployment/Dockerfile -t paperlight-production:verified .
docker run -d --pull=never --name paperlight-local-production -p 127.0.0.1:4180:8080 paperlight-production:verified
node scripts/check-hosting.mjs http://127.0.0.1:4180
```

Use `docker start paperlight-local-production` for the container already created in this checkout's verification. Recreate it only to use an updated image. Loopback bindings are local verification, not public deployment.

For Linux browser testing, the existing `paperlight-browser-host` shares the verification container's network namespace and serves port 8080. The origin `http://127.0.0.1:8080` is a browser secure context for WebCrypto and service workers; an ordinary insecure hostname is unsuitable.

```sh
docker start paperlight-browser-host
docker exec -e PAPERLIGHT_PYTHON=/opt/paperlight-tests/bin/python -e LANG=C.UTF-8 -e LC_ALL=C.UTF-8 -e PAPERLIGHT_STRICT_BROWSERS=1 -e PAPERLIGHT_TEST_ORIGIN=http://127.0.0.1:8080 paperlight-release-verify sh -lc 'cd /workspace && npx --no-install playwright test --workers=2 --grep-invert "measured cold/warm"'
docker exec -e PAPERLIGHT_PYTHON=/opt/paperlight-tests/bin/python -e LANG=C.UTF-8 -e LC_ALL=C.UTF-8 -e PAPERLIGHT_STRICT_BROWSERS=1 -e PAPERLIGHT_TEST_ORIGIN=http://127.0.0.1:8080 paperlight-release-verify sh -lc 'cd /workspace && npx --no-install playwright test tests/e2e/benchmark.spec.ts --workers=1 --output=.cache/benchmarks'
```

`deployment/nginx.conf` handles all 13 application routes, real assets, missing-file 404s, restrictive headers and shell/service-worker revalidation. It explicitly maps `.js`/`.mjs` to JavaScript and `.wasm` to `application/wasm`. All runtime fonts remain same-origin files, including small subsets; no data-font CSP exception is needed.

The complete browser suite targets this server, including warm offline processing. A different hosting provider still needs its own routing, MIME, headers and HTTPS checks. `public/_headers` and `_redirects` are templates, not proof of another provider's configuration.

## Windows commands

The system Node is outside the supported major version. Local checks use:

```powershell
$taskNode = 'C:\Users\shash\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$taskNpm = 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js'
$env:Path = (Split-Path $taskNode) + ';' + $env:Path
$env:PAPERLIGHT_PYTHON = 'C:\Users\shash\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
& $taskNode $taskNpm ci --offline --no-audit
& $taskNode $taskNpm run typecheck
& $taskNode $taskNpm test
& $taskNode $taskNpm run build
```

## CI

`.github/workflows/verify.yml` checks clean installation, advisories, types, formatting, processing, the complete desktop/mobile-emulation matrix, separate benchmarks and a real Nginx hosting contract. Synthetic evidence is retained for 14 days. Equivalent Linux commands ran locally; GitHub Actions publishes verification for the reviewed commit; see the attached PR for exact final results. No public deployment is part of this work.
