# Search visibility and analytics

The canonical site is https://pdf.havisu.com. `npm run build` creates HTML for the homepage and all twelve existing tool URLs and the factual iLovePDF-alternative page, a genuine 404 page, sitemap.xml, robots.txt, and a locally generated 1200×630 social card. React hydrates the same page components. PDF engines remain lazy and document processing stays local. Client navigation warms only missing public page HTML, so a tool opened through the directory can also reload offline. The service worker accepts only the fourteen known public paths, deduplicates concurrent warming, and never caches analytics, documents, query strings, or editing state.

## Deployment

- Vercel: use the committed vercel.json, Node 24, `npm ci`, `npm run build`, and output directory `dist`. Do not add a catch-all rewrite to index.html: each tool has its own generated HTML and unknown paths must return 404.
- Production Vercel builds (`VERCEL_ENV=production`) permit indexing and enable analytics. Preview/development builds emit noindex metadata and disallow crawling. The analytics runtime additionally requires the exact canonical origin, so previews and local hosts do not send page views.
- Standalone production hosting can explicitly set `PAPERLIGHT_INDEXABLE=1` when building. It does not enable analytics. Nginx and the supplied static-host redirects serve the same generated tool pages.
- The canonical domain lives in `src/lib/brand.ts`. If the domain changes, update it, rebuild, and configure permanent redirects from the old public domain. The current configuration redirects only public pages from `paperlight-kappa.vercel.app`; workers, assets and service endpoints stay available for existing tabs.
- If Vercel system environment variables have been disabled in project settings, enable them before rebuilding so the production/preview distinction is available.

## Google Search Console

1. Sign in to Google Search Console with the site owner's Google account.
2. Add a **URL-prefix** property for `https://pdf.havisu.com/`.
3. Choose HTML-tag verification. Set the provided public verification value as the Vercel production environment variable `GOOGLE_SITE_VERIFICATION` and redeploy. Do not put account credentials in source control.
4. Verify ownership, then submit `https://pdf.havisu.com/sitemap.xml`.
5. Inspect the homepage and a few tool URLs; request indexing after confirming the published HTML and canonical URL.
6. Monitor indexing, impressions, clicks, search queries, and Core Web Vitals over time. Search Console measures search visibility; Vercel Analytics measures site visits.

Google determines indexing and ranking. No ranking position, indexing deadline, or visibility for another product's brand searches is guaranteed. Havisu PDF's iLovePDF-alternative FAQ describes only supported local workflows and makes no affiliation claim. Do not add keyword stuffing, invented reviews, or misleading comparisons.

## Analytics boundaries

The official pinned `@vercel/analytics` React integration sends public page views through Vercel's same-origin analytics endpoints. React Router supplies explicit route/path values, disabling automatic history tracking to avoid duplicate page views. The beforeSend callback rejects custom events and unknown routes, permits only the canonical origin, and removes query strings and fragments. No document-processing events are collected.

Vercel provides standard visitor statistics such as referring sites, browser/device information, and approximate location under its Web Analytics privacy model. Documents, document names, passwords, signatures, content, and editing settings are not passed to the SDK. Existing security headers remain in force. Analytics endpoints are excluded from offline caching, and an unavailable or blocked analytics script does not prevent editing.

After a production deployment, open the site, navigate between tools, and inspect the same-origin analytics script/intake requests. Confirm visits in the project's **Analytics** dashboard after Vercel processes them. Ad blockers may suppress collection. Local tests exercise SDK page-view scheduling and sanitization with a deterministic intake adapter; they do not prove Vercel dashboard ingestion.

## Verification

`tests/seo.test.ts` checks route/content coverage and analytics URL filtering. `tests/e2e/seo.spec.ts` checks all fourteen pages with JavaScript disabled, metadata and structured data, genuine 404s, redirects, navigation/hydration, delayed-script file-selection safety, and route-specific offline HTML. `tests/e2e/analytics.spec.ts` checks production SDK scheduling, URL sanitization, disabled local collection, and blocked-script resilience. Existing suites continue to cover PDF outputs, privacy, accessibility, responsive themes, and performance budgets.

Local release results and deployment boundaries are recorded in [SEO-VERIFICATION.md](SEO-VERIFICATION.md). Full Linux browser and static-host results are published in the linked pull-request checks. Search Console ownership and dashboard ingestion require the site owner's account; neither is implied by a successful local test.

The alternative page compares supported workflows using dated primary-source links. It does not claim affiliation, identical capabilities or guaranteed ranking. Tool FAQs explain specific options and limitations. Check Search Console for actual impressions, clicks, queries and indexing; laboratory performance checks are not field Core Web Vitals.
