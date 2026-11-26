# Operations runbook (draft, nothing here has been run against production)

Status: written from the code, not from a live system. No provider account was inspected (Wrangler is not logged in on the development machine) and nothing is deployed. Every step marked **UNVERIFIED** must be exercised once, with its result recorded in docs/handoff.md, before live intake. Secrets are never written in this repository; this file names them only.

## 1. Launch gate (all must stay true until the owner authorises launch)

- The Worker is closed unless **every** one of these is present: `LIVE_ENABLED=1`, bindings `DB` and `UPLOADS`, `SITE_ORIGIN` (https, origin only), `ACCESS_ISSUER`, `ACCESS_AUD`, `OPERATORS`, secrets `TURNSTILE_SECRET` and `RATE_SECRET`. Anything missing or malformed returns 503 `intake_not_enabled`; it never half-opens (worker/live.ts).
- The public form is closed in production builds unless `PUBLIC_ENQUIRY_FORM=on` (src/pages/enquiry.astro). Open form builds also need a real `PUBLIC_TURNSTILE_SITE_KEY` (test keys fail the build).
- Switches, each off unless exactly `1`: `NOTIFICATIONS_ENABLED` (optional until the owner wants email), and **`RATE_CLEANUP_ENABLED` and `UPLOAD_CLEANUP_ENABLED`, which must both be `1` at launch**: without them rate-limit rows, orphaned pictures (and their R2 objects) and expired upload sessions accumulate without limit. Mail needs `RESEND_API_KEY`, `MAIL_FROM`, `OWNER_EMAIL`. `RETENTION_DAYS` (a whole number of at least 30; anything else leaves retention off) makes each scheduled run erase enquiries the owner has explicitly closed that have been quiet that long, up to 20 per run, using the same erasure as the owner action (financial records stay; open, replied, quoted and confirmed enquiries are never touched). The owner must choose the period before it is set. `CATALOGUE_REBUILD_HOOK` (optional) is a deploy-hook URL called after a price publish.
- **Emergency stop for intake:** set `LIVE_ENABLED` to anything other than `1` (or remove it) and redeploy/update the variable. Enquiries stop; the static site stays up. UNVERIFIED.

## 2. Components

| Part | What | Where defined |
|---|---|---|
| Static site | Astro build, served by Workers Static Assets (docs/service-register.md; hosting setup itself not verified) | astro.config.mjs, `npm run build` |
| Worker | enquiry intake, uploads, owner API, scheduled jobs | worker/index.ts, worker/live.ts |
| D1 | enquiries, quotes, payments, uploads, catalogue | migrations/0001 to 0017 |
| R2 | private pictures, never public | binding `UPLOADS` |
| Cloudflare Access | owner login (JWT checked in the Worker, issuer pinned) | worker/auth.ts |
| Turnstile | bot check on submit and on the first upload | worker/turnstile.ts |
| Resend | owner and customer notifications | worker/notification-sender.ts, worker/notification-scheduler.ts |

A production Wrangler config does not exist yet; only `wrangler.local.jsonc` (local emulator, test data) is in the repository. Creating `wrangler.jsonc` with real resource IDs needs account access and is a precondition for the steps below.

## 3. Before first live use (UNVERIFIED unless marked)

1. Cloudflare Access application covers `/admin/*` and `/admin/api/*`; the policy lists only the owner; `ACCESS_AUD` and `ACCESS_ISSUER` match it. Check: an unauthenticated request to `/admin/api/enquiries` is refused, a wrong-audience token is refused.
2. Turnstile widget hostnames list the production domain only; `TURNSTILE_SECRET` is the rotated secret.
3. R2 bucket has no public access and no custom domain. Check: an object URL returns 403/404 without Worker mediation.
4. D1: apply migrations in order (`wrangler d1 migrations apply`), then confirm `ready_at` (0015), catalogue tables (0016) and `upload_sessions` (0017) exist.
5. Schedule: one cron trigger on the Worker. With the three switches on, each run sends due notifications, clears rate windows and purges orphaned uploads and expired upload sessions. Confirm one run in logs.
6. Resend: sending domain verified; send one test message to the owner before enabling `NOTIFICATIONS_ENABLED`.
7. Spending: confirm plan limits and that no billing is attached (AGENTS.md: no purchases without authority).
8. Edge rate limiting: add a Cloudflare rate-limiting rule on `/api/*` (the Worker limits per client and has an attempts cap, but a volumetric flood is best stopped before it reaches the Worker). UNVERIFIED.
9. Transport security: the site's own headers (`_headers`) set nosniff, referrer policy, permissions policy and frame blocking, and the page CSP is a hash-based meta tag. Checked in a production build in Edge: 0 CSP violations on 11 pages. There is **no** `Strict-Transport-Security` header in the repository; confirm HTTPS-only and HSTS in the Cloudflare zone settings for cakeopedia.com (UNVERIFIED, a zone setting, not code).

## 4. Release

1. Pull request green: `verify` (type check, 193+ tests, build, built-output tests) and `browser` (Chrome: layout, keyboard, axe, owner journey) jobs. Merge only on the owner's instruction.
2. Build with `PUBLIC_SITE_ENV=production` (indexable, canonical URLs, sitemap, no concept routes).
3. Apply new migrations **before** deploying the Worker that needs them. Migrations are additive; never edit an applied one.
4. Deploy Worker, then site. Smoke test: home, `/menu/`, `/faq/`, `/robots.txt`, `/sitemap.xml`, owner login, one test enquiry (then erase it from the owner view).
5. Record commit, time, migrations applied and results in docs/handoff.md.

## 5. Rollback

- **Prices:** owner Prices tab, "Restore" on an earlier published version (append-only history). The site shows it after the next rebuild (or immediately if the rebuild hook is set).
- **Worker or site code:** redeploy the previous commit. Migrations are additive and old code ignores new columns, so schema does not need to be reverted.
- **Intake misbehaving:** emergency stop (section 1), investigate, restore.

## 6. Backup and restore (UNVERIFIED, required before live intake)

- D1 has seven-day Time Travel on the free plan; that is not an independent backup (docs/service-register.md).
- Needed: a scheduled encrypted export of D1 (and R2 objects for attachments) to storage outside the account, plus one restore drill proving at most 24 hours of data loss and one working day to restore (docs/backlog.md E05). Export and drill are not built yet. The automatic retention job exists (`RETENTION_DAYS`, section 1) but stays off until the owner chooses a period; take and test a restore before turning it on, because erasure is permanent.
- After any restore, re-apply erasures: an enquiry whose payload has `erased: true` must stay erased.

## 7. Routine owner and operator actions

- **Publish prices:** Prices tab, save draft, publish. A stale edit shows "changed somewhere else" and reloads.
- **Erase a customer's data:** enquiry view, "Erase customer data", type the reference. Refused while an order is confirmed (close it first). Amounts and dates are kept; names, contacts, text, pictures and notes are removed. Safe to repeat.
- **Record a payment:** only after seeing the Zelle payment arrive; the system never infers receipt.
- **Balance due:** shown on the order as 48 hours before pickup or delivery, Chicago time; later quotes show the rush message.

## 8. Known gaps

- No production Wrangler config, no provider verification, no external backup, no monitoring or alerting; the retention job is built but off until the owner sets a period.
- Upload challenge not yet exercised against real Turnstile.
- Business email contact@cakeopedia.com is approved but not provisioned, and is not published.
