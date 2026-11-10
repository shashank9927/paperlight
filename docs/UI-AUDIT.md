# Havisu PDF functionality and UI audit

Started 10 November 2026 from `50524d3`, the merge of PR #11. The [UI inventory](UI-INVENTORY.md) maps the public pages, shared workspace states and tool controls to test scenarios. The [October capability matrix](ACCEPTANCE-MATRIX.md) remains the processing baseline.

## Defects corrected

| Finding | Correction | Regression |
| --- | --- | --- |
| Keyboard users could not dismiss mobile navigation with Escape | Opening by keyboard moves focus into the navigation. Escape closes it and returns focus to the button | UI-NAV |
| Help, file preview and password dialogs lost their opener on dismissal | Restore focus to the relevant visible control. Cancelled admission can select the same file again | UI-DIALOG, UI-FILE |
| The hidden file input could receive tab focus and retain a previously chosen file | Keep the visible picker as the tab stop. Clear the native input after taking its file selection | UI-FILE |
| Adjust settings left a collapsed mobile panel hidden | Open the panel and focus its heading on adjustment. Opening the panel directly also focuses its heading | UI-SETTINGS, UI-MOBILE |
| A floating settings toggle overlapped the file picker at 320 pixels | Place the empty-workspace toggle in normal document flow | UI-REVIEW, 320-pixel captures |
| File and settings headings skipped levels | Establish a Selected documents heading and use the proper subheading level in settings | UI-REVIEW Axe checks |
| Thumbnail placeholders duplicated the visible page number and polluted button names | Use a decorative file glyph while thumbnails are offscreen | UI-REVIEW Axe checks |
| The position preset group wrapped buttons in a label | Give the group its own label and retain each preset's independent name | UI-POSITION |
| The active signature field and processing step were communicated visually only | Expose the selected field and current step to assistive technology | UI-SIGN-FIELDS, UI-REVIEW |
| An entirely failed batch displayed a success icon and advanced to Download | Keep Configure current and show an attention state with retained inputs and retry | UI-BATCH-FAILED |
| A waiting update used a disallowed landmark role | Announce the update as a status while keeping its action independently accessible | recovery |

## Verification method

- The production app runs in cached Node 24 and a cached Nginx image. The original checkout was restored from GitHub and the existing package and browser versions were reused. No dependency or image downloads were required on this machine.
- All twelve mobile workflows now configure, download, adjust, export again and reset using the visible UI. Downloaded PDFs reopen in PDF.js and the independent pypdf/Poppler oracle. Image downloads are decoded and ZIP entries are checked.
- The Chromium review captures empty, configured, invalid, processing, cancelled and result states in both themes at 390, 768 and 1440 pixels, with separate password and 320-pixel captures. Axe runs at all three widths. The existing partial-result suite supplies both themes and all three widths.
- Native Chromium zoom uses an extension in a temporary test profile to set the browser to 200%. It checks all fourteen pages and completes each export at that zoom.
- Local private verification uses the actual twelve lecture inputs and no recorded browser traces. The release evidence includes aggregate preservation and pixel-comparison results only.
- The full CI suite rechecks the existing processing, privacy, accessibility, SEO, hosting and resource gates. It repeats critical lifecycle scenarios without automatic retries and runs the isolated performance budgets. The CI log and manifest in the pull request identify the tested revision.

## Release evidence

The [local evidence](evidence/ui-audit-2026-11-10.json) records **129 unit tests**, **57 focused browser cases**, **two follow-up theme cases**, **nine follow-up navigation and preview cases**, and **three isolated benchmarks**. The 57-case run generated 476 captures. The later theme revision also exercises the actual OS theme preference and checks Axe at 768 pixels. The full PR suite includes those final checks together. Its checkout manifest and test results are the release disposition for the named cases in the UI inventory.

The static host passed 14 routes, 40 canonical aliases, 14 legacy page redirects, six legacy assets, security/MIME and 404 checks. All 301 served assets match the frozen local manifest. Load verification completed 780 loopback requests at concurrency 1, 10, 50 and 100 with zero errors.

The private corpus passed the twelve-input merge and eight-page extraction. The merged PDF retained 295 outlines, valid tags and the 773,546-byte embedded video. All 303 compared output pages matched the original rendered pixels and the input hashes were unchanged.

The [before screenshot](evidence/ui-file-picker-before.png) shows the overlap at 320 pixels. The [after screenshot](evidence/ui-file-picker-after.jpg) shows the clear picker. Route and state contact sheets and selected full-size captures were reviewed locally. CI publishes the full synthetic screenshot set.

| Browser | Maximum load | Maximum preview | Maximum processing | Maximum timer gap |
| --- | ---: | ---: | ---: | ---: |
| Chromium | 187 ms | 963 ms | 291 ms | 29 ms |
| Firefox | 724 ms | 899 ms | 474 ms | 49 ms |
| Linux WebKit | 361 ms | 1,137 ms | 967 ms | 88 ms |
| Budget | 2,000 ms | 3,500 ms | 2,500 ms | 250 ms |

The production preview is served at `http://127.0.0.1:4187`. Local artifact tree SHA-256 is `255f0d2f4f292718708f31885f0d75ce3f81e4fe39fe43261d12713c66b7c336`. The clean source revision and CI artifact hash are recorded in the pull request and its release manifest.

To reproduce in Node 24 with cached browsers, set `PAPERLIGHT_STRICT_BROWSERS=1`, `PAPERLIGHT_PREBUILT=1` and a UTF-8 locale. Build once and run `npm test`, `npm run format:check`, `npm run test:e2e -- --grep-invert "measured cold/warm"` and the separate benchmark command from the verification workflow. Use `node scripts/check-hosting.mjs <origin>` and `node scripts/load-static.mjs <origin>` against the packaged Nginx preview.

Only supported PDF fixtures and the local lecture corpus were qualified. Physical iPhone, Android and macOS testing, account configuration, and public deployment remain separate.
