# Cakeopedia handoff (checkpoint, 25 Nov 2026)
Branch feat/local-application-foundation (PR #1 open, main untouched). Canonical state: docs/handoff.md (read it first).

## Finished and verified locally this session (npm run verify: typecheck + 150 tests + build + 8 built-output tests)
- Git reconciled (collection-slice + menu-domain were ancestors; fast-forwarded). cb7f02d unrecoverable; migrations 0006-0009 never existed.
- Owner money/order integrity: worker/orders.ts, worker/inbox.ts, worker/admin-common.ts (requestId idempotency, payment ceiling,
  below_paid / would_unconfirm, atomic manual enquiry, compare-and-set status). Tests: tests/orders.test.ts, tests/owner.test.ts.
- Uploads: worker/uploads.ts, worker/store.ts, migrations/0012_upload_tombstones.sql, tests/uploads.test.ts (atomic quota, tombstoned deletes).
- SEO: src/site.ts, src/layouts/Base.astro, src/pages/{404.astro,sitemap.xml.ts,robots.txt.ts,index.astro}, tests/production-output.test.mjs.
- Gated live Worker (closed by default): worker/live.ts, worker/index.ts, worker/creation-slugs.ts, tests/live.test.ts. NOT deployed.
- Owner menu: migrations/0013_menu_items.sql, worker/menu.ts, Menu tab in src/pages/admin/index.astro.
- Browser check: scripts/browser-check.mjs (npm run check:browser; needs npm run dev:api + npm run dev), playwright-core devDependency.
- CSS: hero h1 clearance, .visually-hidden overflow fix (/enquiry 19px), sticky lead image in .feature (src/styles/global.css).

## Not done / unproven
- No CI/staging/production proof beyond PR checks (last run seen: pass on d2e4783/469e187 range). iOS/Android devices, screen reader,
  video playback, Core Web Vitals unproven. Rate-limit thresholds in worker/live.ts are placeholders.
- Needs owner: menu/prices/contact, logo, Turnstile site key, Access app, Resend domain, media permissions, Search Console/Bing accounts.

## Next (highest value first)
1. DONE (uncommitted): keyboard + reduced-motion pass in scripts/browser-check.mjs (Edge, 1280px, 5 public pages: skip link, tab order
   with focus rings and no trap, enquiry blank submit by keyboard, no hidden .reveal/animations/autoplay under reduced motion). All pass; no
   site defects found. Native video/date controls take several Tab stops inside one element, so the check counts only the first stop.
   Not covered: screen reader, owner /admin by keyboard, Safari/Firefox.
2. Breadcrumb/image schema and customer-question (AEO) content once menu facts exist.
3. Owner UI: Menu heading + keyboard focus after Save/Cancel DONE (checked in browser-check). Inbox filter, Calendar toggle, enquiry detail keep keyboard focus (checked). Menu edit history DONE (migration 0014 menu_history, GET /admin/api/menu/:id/history, "Earlier versions" in editor; local D1 only, not applied to any provider). Remaining: Turnstile widget on the enquiry form.
