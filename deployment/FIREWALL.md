# Vercel Hobby protection and capacity

Paperlight serves static files. PDF CPU/memory work runs on the visitor's device;
there is no upload, processing API, database, or shared document queue to overload.
The repository cannot configure or prove the account's active firewall settings.

Vercel provides automatic DDoS mitigation. Hobby still has finite transfer and
request quotas; it cannot provide an unlimited-traffic or availability guarantee.
Review current limits and usage in the project dashboard before a launch.

## Account configuration to review

Use the project's production environment and host when defining rules. Preserve
existing rules and review the combined policy before publishing changes.

1. Reject methods other than GET/HEAD on public application/static paths. Exempt
   Vercel's `/_vercel/` service namespace, including analytics POST delivery.
   Do not apply an exception based solely on an untrusted user-agent string.
2. Prepare one fixed-window rule, keyed by IP, at 600 requests per 60 seconds.
   Start with **Log**. Review legitimate cold loads, shared office/mobile IPs,
   crawlers, and asset bursts before enabling the default 429 action. Hobby has
   one rate-limit rule within its custom-rule allowance. IP limits supplement
   platform DDoS controls; they do not stop distributed attacks.
3. Verify public pages, sitemap, robots, worker/module/WASM assets, and analytics
   after publishing. Avoid blanket bot challenges that obstruct crawling or
   break script/font downloads.

These are reviewable account steps, **not claims that rules have been enabled**.
No paid subscription or always-on third-party monitoring is introduced.

## Verification and recovery

`node scripts/check-hosting.mjs http://127.0.0.1:4180` verifies routes and headers.
`node scripts/load-static.mjs http://127.0.0.1:4180` checks up to 100 concurrent
local requests with bounded response/request totals. The latter refuses public
hosts and writes `.cache/static-load-report.json`; it is not a DDoS test.

Track production transfer, CDN requests, errors, and blocked traffic through the
existing Vercel dashboard. Verify an immutable deployment before promoting it.
If a release fails smoke checks, use Vercel's previous deployment/rollback flow,
then recheck routes, assets, offline behavior and analytics. Existing editing tabs
must never be automatically reloaded. Offline storage retains public assets for
the current/previous cached release; browsers may evict it under storage pressure.

References: [Hobby](https://vercel.com/docs/plans/hobby),
[DDoS mitigation](https://vercel.com/docs/vercel-firewall/ddos-mitigation),
[rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).
