# SEO release verification — 2026-10-25

The reviewable change is [PR #2](https://github.com/shashank9927/paperlight/pull/2). Its [checks](https://github.com/shashank9927/paperlight/pull/2/checks) publish the authoritative full Linux Chromium, Firefox, WebKit, performance-budget, and Nginx results for each revision. Cancelled and failed diagnostic runs are not counted as successful release verification.

## Completed local checks

- Clean Linux npm 11.19.1 installation completed offline with the repaired lockfile and pinned analytics package. Existing npm tarballs were reused, including transferring the cached analytics tarball to the Linux cache.
- Type checking, formatting, all 74 unit/processing tests, and the production build passed.
- The final targeted Chromium/WebKit run passed all 30 checks: nine SEO/analytics cases and six responsive-theme/workspace-state cases per engine. It includes every public page without JavaScript, genuine 404 hydration, delayed workspace scripts, stable saved-theme restoration, offline reload after client navigation, sanitized/deduplicated page views, and blocked analytics. Offline navigation passed six repeated checks; the full WebKit theme-persistence/keyboard/system-preference case passed twice.
- All thirteen routes passed the hosting contract at `http://127.0.0.1:4180`: security headers, sixteen script/module-worker responses, WASM MIME, and missing-asset/route 404s.
- Isolated production and preview builds passed independent HTML checks across all thirteen pages: unique titles, one heading/title per page, canonical links, parseable structured data, robots directives, and social-image/license assets. Production enabled indexing/analytics. Preview disabled both even with `PAPERLIGHT_INDEXABLE=1`; the optional public Search Console verification value appeared correctly.
- Mobile light and desktop dark screenshots were visually inspected, along with the generated 1200×630 social card. Automated theme checks cover 390, 768, and 1440 pixel widths, keyboard behavior, and accessibility/contrast.

Regressions found during this work were fixed and checked: early file changes before lazy workspace hydration, stale inherited WebKit text colors, transient theme restoration, and missing offline HTML after client navigation. File selection becomes available after handlers attach; text resolves current theme tokens directly. Only missing public page HTML is warmed, the initial UI font is precached, and invariant build assets remain available despite CORS Vary headers. Cache invalidation includes every generated page.

## Infrastructure and device limits

The C: drive filled during the first Linux release attempt, stopping Docker processes. After disk space was restored, Docker still failed to start its WSL engine. No image/cache reset, prune, or repeat image/browser download was performed. Local verification continued with cached Windows tools.

The cached Windows Firefox binary fails to launch with `spawn UNKNOWN`. Windows WebKit lacks worker raster capabilities required by image-rendering tests. Those failures are recorded as limitations, not skipped successes; the full strict-browser release check runs on Linux in Actions. Physical mobile devices and macOS Safari remain outside this verification.

## Deployment boundary

The local production build is prepared; publishing is a separate step. The live Vercel domain must be redeployed from the reviewed changes before its direct tool links, sitemap, and analytics can be confirmed publicly. Account-level Search Console ownership and Vercel dashboard ingestion have not been verified. Follow [SEO.md](SEO.md) after deployment.
