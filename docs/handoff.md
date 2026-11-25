# Current handoff — 25 November 2026

Active primary development writer: ChatGPT, authorised by the sponsor. This is development coordination, not a transfer of GitHub account ownership or release authority.

## Current integration and recovery
- Existing PR #1 (feat/local-application-foundation → main) was fast-forwarded without force from be2e6dd to the published Collection commit 08bf63c. Main remains 9cfab13. No merge, deploy or live intake.
- Prior ChatGPT Work reported local hardening commit cb7f02d; GitHub cannot resolve it. Recover from its original workspace before overlapping its payment/status/upload/SEO/media changes. Its reported 84 tests, 7 built-output checks and 2 production-output checks do not verify the remote commit.
- Independent branch feat/menu-domain-foundation starts at 08bf63c. Menu domain and tests committed as 36b21c0 and 60521d0. No duplicate integration PR. Fast-forward existing PR branch for repository CI when ready; preserve unpublished hardening lineage for later non-destructive integration. Main must remain untouched until verification.

## Menu foundation (F02/F03/F13)
- src/data/menu.ts: validated editorial records, fixed vs starting pricing, integer cents, sizes/layers/serving ranges, flavours/fillings/add-ons, revision timestamps, publication and availability filtering. No real menu or fixture data in production source.
- tests/menu.test.ts: five isolated tests executed with Node 22.16.0 --experimental-strip-types; all passed. Standalone strict TypeScript 5.8.3 check passed. Remote blob hashes matched local tested files.
- This is a partial domain foundation only; no public menu route, CMS, persistence, owner editing, approved serving data or end-to-end proof. Full repository build/test requires the pinned Node 24 environment and dependencies; this chat's container cannot resolve GitHub directly.
- Next: recover cb7f02d; verify PR head CI, integrate without loss, add approved-content ingestion and preview, then a mobile menu/serving guide with no synthetic publication. Continue independent work while recovery is blocked.

## Notification foundation (F20) — current session
- Transport b8b01a5 and tests 0f8bef7: explicit injected transport; fixed HTTPS endpoint, stable idempotency key, bounded body/response/deadline, safe provider outcomes and quota retry delay. Resend official idempotency semantics: https://resend.com/changelog/idempotency-keys.
- Snapshot builder d8d7cc2 and tests 1599b5c: deterministic minimal plain-text draft payloads; owner alert excludes customer details; customer email only for email contact; explicit skip for other channels; enquiry is not an order confirmation.
- Nine focused tests passed under Node 22.16.0 with --experimental-strip-types. Standalone source check passed with TypeScript 5.8.3 strict, noUncheckedIndexedAccess and exactOptionalPropertyTypes. Delivery type mirrored from existing outbox; no full repo checkout, build, D1 or live provider tests in this session. Files remain disconnected from production.
- Next: persist exact payload and channel disposition atomically before first send; protect existing ambiguous outcomes on subsequent permanent rejection, integrate bounded scheduled outbox dispatch, validate approved sender/owner configuration and copy. Recover unpublished hardening before changing shared store/migrations. Do not enable delivery.

## Notification persistence and uncertainty (F20) — latest checkpoint
- f5c1e63 / 70317a2 / 8525023: real SQLite regressions reproduced two cases of ambiguous prior delivery incorrectly classified as failure; now later permanent rejection moves to reconciliation, including expired leases. First definitive rejection still stops. Conservative treatment also applies to known earlier quota retries.
- 745bae4 / 543a0f7 / 4323c62: additive migration 0010_notification_snapshots.sql and lease-fenced immutable snapshot preparation. Frozen bytes reused on retries; legacy attempted rows without snapshots fail closed; skip stored without payload; deletion cascades. Migration number intentionally leaves room for unpublished hardening; reconcile migration sequence before applying to any provider.
- 4e8d4d8: strict indexed access correction in menu tests.
- Local evidence: 2 regression failures before fix; 8/8 focused tests passed after changes using Node 22.16.0 and SQLite 3.49.1, strict TypeScript 5.8.3 passed for isolated sources and tests with narrow existing DB contract. Five Git blob hashes match tested files. Original Miniflare regression expectations updated but full repository CI is needed. No cloud migration, scheduler, sender wiring or live messages.
- Next: integrate lease-aware sender and bounded scheduler, enforce explicit skip/reconcile outcomes, provider verification, retention and production gates. Recover unpublished hardening before modifying shared intake or migration history.

## Bounded notification scheduling and CI (F20) — latest checkpoint
- 1bcbfd2 fixes the exactOptionalPropertyTypes failure reported by CI run 45544857074; 5/5 transport tests passed locally and remote hash matched. Full CI must verify the newer head.
- c5b7833 / 8976be4: due-event selection with deterministic ordering, at most four events per pass and two concurrent dispatches, atomic existing lease gate, and per-event failure isolation. 5 new SQLite scheduler tests and 13/13 combined scheduler/persistence/uncertainty tests passed on Node 22.16.0. Isolated strict TypeScript passed. Both scheduler file hashes matched remote. No live cron or sender wiring. D1 and pinned Node 24 repository CI remain required.
- Feature-map reconciled with actual partial F02/F03/F13/F20 work and existing private owner viewing. Next: lease-aware snapshot sender integration, explicit non-email disposition, bounded D1 verification, approved provider config and scheduled entry point behind release gates. Continue independent public menu/serving work while unpublished hardening recovery is blocked.

No provider changes, costs, DNS changes, deployments, private media publication or real customer actions. Existing owner input and release holds remain.

## Historical Claude Code checkpoint (not current ownership or verification)
Date: 25 November 2026. Task: master build directive; active writer Claude Code.
Branch: feat/cakeopedia-collection-slice (from origin/feat/local-application-foundation, which already contains main). PR #1 still open and unmerged; read the actual HEAD from Git.

Done (cumulative): palette tokens + contrast tests; media pipeline; home, gallery, /collections/ pages, 19 creation pages,
story, privacy draft, enquiry-received; enquiry form (open in dev or PUBLIC_ENQUIRY_FORM=on; closed in default builds) wired to
worker/local.ts (local-only entry; index.ts stays closed) with contract extended for phone/Instagram contact, fulfilment,
add-ons, budget cents and privacy acknowledgement; env-aware robots/meta/_headers (PUBLIC_SITE_ENV=production); concept routes
dropped from production output; npm run check:media release gate; docs/feature-map.md.

Uploads: worker/image.ts (inspect/strip), worker/uploads.ts (POST/DELETE, ownership, purgeOrphans), migration 0003, local R2 binding.
No public read path exists; purgeOrphans is not scheduled yet; HEIC is converted client-side only where the browser can decode it.

Owner area: worker/auth.ts, inbox.ts, orders.ts, admin-common.ts, migrations 0004-0005, src/pages/admin (noindex, local dev login in worker/local.ts only). 67 tests; live Edge walkthrough of manual order, quote, deposit gate, payment, void, confirm, calendar, busy day and picture viewing.
Next: real Cloudflare Access app + allowlist, scheduled purgeOrphans, email sender, SEO (sitemap/schema/404), CMS/menu data, deployment runbook.

Checks run: npm run verify (42 Worker/contract/slug tests, 5 built-output tests); live wrangler dev + local D1: 201 then 200 replay
with the same reference, 403 wrong origin; Playwright-core on installed Edge: no horizontal overflow or broken images at 320, 360, 375,
390, 414, 430, 768 and 1280 on six pages; form journey (blank errors, bad phone, success redirect, offline then safe retry) at 390px.
Not done: iOS Safari/Android, screen reader, video playback proof, Core Web Vitals, upload lifecycle.

Holds: media delivery path and permissions (names, kitchen, locations); menu/prices/contact; enquiry form (closed);
inbox/auth/uploads/notifications; provider accounts; DNS/hosting. No provider, purchase or deployment change was made.

Next: (1) owner answers in media-plan.md; (2) menu data model and enquiry UI with the three-image lifecycle behind the closed
intake; (3) private inbox; (4) a real-browser pass at 390px with keyboard and reduced motion.
