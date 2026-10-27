# Havisu PDF identity

Havisu is the brand; Havisu PDF is its private browser-based PDF toolkit at https://pdf.havisu.com. The original refined brush H combines two ink uprights and a rising vermilion stroke. The master paths and product configuration live in `src/lib/brand.ts`; `scripts/brand-assets.ts` generates the reusable assets without a network request.

`npm run build` writes the deployable site to `dist/` and the reusable kit to `.cache/havisu-brand-kit/`. The kit contains light/dark SVG marks, outlined Inter wordmarks and product lockups, transparent PNG exports, a simplified tiled SVG favicon, and 32/180/192/512 px icons. Use light variants on light surfaces and dark variants on dark surfaces. Inter's OFL license accompanies the kit. Runtime assets use content hashes and the same geometry as the header and footer.

The logo accent is #E63323. Buttons use #C52B20 with white text; secondary accents use #A9251B in light mode and #FF8A7B in dark mode. Charcoal and warm white surfaces use neutral text. Error, warning and success colors remain distinct. PDF previews, annotation settings and exported documents keep their own colors. Theme transitions respect reduced motion.

The canonical origin, product name and default download prefix share one configuration. New generic downloads use `havisu-pdf`; names derived from the user's input retain that input name. Existing `paperlight-theme`, service-worker caches, release metadata, worker events, font identifiers, environment variables and repository URLs remain compatible technical identifiers. Historical audit evidence retains the name used when it was recorded.

The old Vercel hostname permanently redirects the fourteen public page routes to the new origin. Static files, service workers, PDF workers and analytics endpoints are excluded from these redirects so existing editing tabs can continue loading their assets. Normal page aliases remain normalized. Analytics accepts only known public pages on the exact new production origin and removes query strings and fragments.

Deploying this change, confirming DNS and Vercel Analytics ingestion, and updating Google Search Console ownership/sitemap submission remain account-level steps. See [SEO.md](SEO.md). A passing local or CI build does not itself publish the new identity.

## Verification

Local rebrand checks on 27 October 2026 passed: TypeScript, formatting, 118 unit tests, 92 desktop/mobile Chromium functional checks covering all twelve tools, 18 Chromium/WebKit branding and workspace-state checks, and the Chromium performance budget. Both themes were inspected at 390/768/1440 px. Automated accessibility checks passed; 34 text/background color pairs meet 4.5:1 AA, with primary-button text at 5.61:1. Raw HTTP checks cover all fourteen pages and legacy page redirects, four old-origin editing assets, security/cache headers, workers, WASM MIME and real 404s.

Full Linux Chromium/Firefox/WebKit and Nginx evidence is attached to [PR #5](https://github.com/shashank9927/paperlight/pull/5). Verification is pinned to Ubuntu 24.04 to prevent `ubuntu-latest` changing browser native dependencies; browser binaries still reuse the existing cache. CI uses Ubuntu's official HTTPS archive after slow downloads from the runner's Azure mirror prevented library setup from completing. Physical mobile devices and public deployment remain outside these checks.

The browser cache key includes the OS release and architecture. A legacy cache can retain Chromium and Firefox while refreshing WebKit once for Ubuntu 24.04; its native ICU dependency differs from the Ubuntu 26 build. Subsequent successful runs reuse the migrated cache.
