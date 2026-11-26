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

## Sender composition and menu review — latest checkpoint
- Full CI run 45545122379 succeeded on 712e891 (prior scheduler checkpoint). New sender integration: d68dd25 tests, 5ae7c76 lease/outcome handling, 216f29d async snapshot preparation, 1534e00 scheduler skip report, 3e3ea44 composed sender. Internal only, no live provider or cron. Four SQLite integration tests committed; new CI pending. Deliberate non-email skip is encoded with legacy terminal state `failed` plus explicit `not_applicable_non_email` code and separate skipped report; operational UI must interpret that code, not report it as failed delivery. Avoid schema rebuild until migration lineage is reconciled.
- Menu presentation: 015e936/3239c42 three focused Node 22 tests passed, strict TypeScript source check passed and both tested file hashes matched GitHub. c5b6914 empty approved dataset, a3f08f6 editorial menu/servings component, 3734b15 review-only concept; production build removes concepts via existing config. Built-output test added. No invented products or prices. Render and full CI verification pending.
- Next: verify latest CI, inspect review layout in a browser once available, wire approved menu source/CMS, continue production auth/abuse and notification scheduler release gates. Unpublished hardening cb7f02d remains unavailable. No duplicate implementation of its overlapping payment/upload changes.

## Access and bot-verification hardening — latest checkpoint
- Combined repository CI run 45545431187 passed at 4c7bd14 (includes sender and menu concept).
- a971e73 / 0ca7bfb: Turnstile Siteverify adapter, fixed HTTPS endpoint, required hostname/action, bounded request/response and deadline, generic unavailable errors and explicit challenge rejection. No provider account, secret or widget provisioned; existing production entry remains closed. Reference: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/.
- 69a1c40 / df48bbb: JWT size and canonical encoding limits, fatal UTF-8, signed temporal/audience checks, reject unsupported critical headers and ambiguous key IDs. Existing issuer/audience/operator/CSRF checks remain. Four auth and five bot-verifier regression tests committed before implementation; new full CI pending at time of this entry. No claim of a completed RED/GREEN run until verified.
- Next: verify latest CI and correct any failures, implement bounded issuer-pinned JWKS retrieval/cache, distributed abuse policy and scheduled maintenance safeguards. Real Access/Turnstile staging integration, approved accounts/config, privacy and release remain gated. cb7f02d still unresolved at GitHub; do not overwrite its potential unpublished work.

## Signing-key retrieval and abuse control — latest checkpoint
- Full repository CI 45545665941 passed at 85af6e6, including JWT/Turnstile hardening.
- 7926d55 / 0c6b2f2 / f81558c / 82cbc36: issuer-pinned Access JWKS, bounded transport/stream, strict public RSA key shape, duplicate rejection, short TTL and failed-refresh cooldown, no stale fallback. Pending fetches are request-local (Workers I/O isolation); late older refresh cannot overwrite newer data. Six tests cover real synthetic RSA signatures, cache behavior, rotation, rejection and failure. New-key recognition may take up to 60 seconds; no token-triggered refresh. Docs: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/.
- e668adf / f60a533 / 688c6c2 / e1616b7: additive migration 0011_rate_windows.sql, atomic global and client fixed-minute quotas, HMAC pseudonyms scoped per minute and action, bounded expiry purge. Global allowance includes client-denied attempts; this is a quota guard, not protection against targeted denial of service. Fixed-window boundary bursts, real quotas, trusted edge source, coarse WAF, per-action policies and cleanup cadence require staging proof. No raw IP persistence. Five SQLite tests and one Miniflare D1 integration test (a15a2e2) committed.
- 420200e / 9391ea8 / 8d5b063: canonical IPv4 and IPv6 /64 identity, including mapped IPv4 and invalid whitespace rejection; four tests. Canonicalization does not authenticate edge headers.
- Sixteen new test cases committed. No successful latest combined CI evidence yet; previous test-only/partial runs were superseded. No complete RED/GREEN claim. New modules remain disconnected from production; do not enable live routing or apply cloud migrations. Reconcile unpublished migration lineage before provider application.
- Next: check latest CI once, correct any failures, implement explicit closed maintenance entry and provider configuration validation, then owner menu editing/content ingestion and visual verification. cb7f02d still unavailable. No account/provider actions or expenditure.

## Maintenance integration and editorial publication — latest checkpoint
- Full repository CI 45546135329 passed at 8efd5da, including all earlier signing-key, IP normalization, SQLite and D1 emulator rate-limit tests.
- d8c6927 / 2f1c6ac: closed-by-default maintenance coordinator, separate exact opt-ins, validated clock, isolated bounded jobs and aggregate operational reports. 434958f / d72e75d / eaf4812: compose actual scheduler, durable sender, address/secret preflight before lease acquisition, bounded rate cleanup, synthetic transport integration tests. No live cron, HTTP maintenance route or provider binding. Orphan cleanup deliberately excluded until attachment lifecycle race is fixed.
- aa15c97 / 40c3800 / f2605fd: pure revision-aware menu editor and approved-only export/ingestion. Edits validate immutable IDs, server-owned revision/time, stale edits and published completeness. A real authenticated storage adapter must implement atomic compare-and-set; owner review is required before export. Public static dataset rejects non-public entries, remains empty and review concept stays non-indexable. No CMS deployment or actual menu publication.
- 7ed5d63: tests explicitly require closed production health/intake/admin and no scheduled trigger. Fifteen new tests across maintenance, runtime, menu and release checks committed. Latest combined CI pending; intermediate runs cancelled by newer commits; no claim of completed RED/GREEN or cloud verification.
- Next: verify latest combined CI; begin authenticated CMS storage/persistence and mobile editing workflow with explicit publish approval; reconcile missing cb7f02d payment/upload/SEO hardening without overwriting unpublished work. Continue release-safe independent work. No production changes or cloud migrations.

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

## Turnstile frontend (uncommitted, branch feat/local-application-foundation)
- EnquiryForm.astro: explicit-render widget (action `enquiry`, flexible size), token/expiry/timeout/error callbacks, load-failure retry button, reset after every non-success response, submit blocked without token. Site key from PUBLIC_TURNSTILE_SITE_KEY; dev falls back to Cloudflare's always-pass test key; a non-dev build with a missing or test key fails. worker/local.ts accepts only the test dummy token. Server replay path already skips token consumption.
- Checks: `npm run verify` (150 tests, build). Real-browser (Edge) checks: dev server with Cloudflare test key, widget mounts and a full form submit returns 201 and redirects; built output with the CSP and a fake key loads script and frame with zero CSP violations (Cloudflare returns 400 for the fake key, as expected). Not done: widget solving under the CSP with a real key, real siteverify against production secret, release gates. Hash-based CSP meta added in astro.config.mjs (self + challenges.cloudflare.com); build output inspected, not browser-tested; meta cannot set frame-ancestors, so a header CSP is still needed at deploy. Secret key is never in the repo; set as Worker secret TURNSTILE_SECRET at authorised deployment.

## Owner catalogue reconciliation (26 November 2026)
- `src/data/business.ts` is the single source for owner-supplied facts: $135 custom starting (6 in, 4 layers, ~20), separate $75 Celebration Cakes (no serving count, add-ons limited to custom cakes until confirmed), 12 flavours, cupcake/brownie prices `null` (never $0), add-ons $15/$20/$20, ingredient statements, care steps (freeze up to four weeks; six-month text must not exist), and a `pending` list that is the owner-decision register. `src/data/serving.ts` holds the 11 configurations and `recommend()` (smallest fit; null above 100 means consultation). 5 tests in tests/business-data.test.ts.
- New pages: /menu/, /size-guide/ (guest-count finder, enquiry prefill via validated `servings` and `size` params), /cake-care/. Nav has six links (two rows on phones). Pages describe previous work and ingredients only; no Offer structured data, no availability or certification claims.
- Commercial launch gate (Pending Owner Authorization and Compliance Approval): production Worker stays closed in worker/index.ts via liveHandler; the form is closed unless PUBLIC_ENQUIRY_FORM=on. No new gate was added; the existing server-side closure is the control. Private owner circumstances are deliberately not recorded anywhere.
- Gap: the owner menu editor still uses the older MenuItem model (per-size prices, no null prices). Migrating it to business.ts, and owner-editable serving data, is the next catalogue task. Cloudflare provisioning is blocked until `wrangler login`.

## 26 Nov 2026 — core business freeze (branch feat/local-application-foundation, base 26881c9, uncommitted)
Changed: src/data/pricing.ts (new), src/data/business.ts, src/pages/menu.astro, tests/pricing.test.ts (new), tests/business-data.test.ts, docs (shared decisions, owner brief, content status).
Checks: `npm run verify` passed (astro check 0 errors, tsc worker, node tests, build 60 pages, build/production-output tests). Local only; no provider changes.
Not done: admin quote form does not yet prefill/enforce the 50% deposit (server accepts any deposit <= total); no wiring of paymentPlan into notifications; logo asset files not located/edited; email not published.
Next: prefill deposit in admin quote UI from splitPayment, show balance due date from paymentPlan, then remaining holds above.
Follow-up (same day): admin quote form now suggests the 50% deposit from the total (src/pages/admin/index.astro, via splitPayment); owner can overwrite. `astro check` 0 errors and 165 node tests pass. `astro build` began failing locally ("Tsconfig not found astro/tsconfigs/strictest", UNRESOLVED_ENTRY) even on clean HEAD 67cda79 while astro dev/wrangler servers and OneDrive sync were active; build therefore NOT re-verified after this change. Re-run `npm run verify` with dev servers stopped.

## 26 Nov 2026 — Phase III execution (branch feat/local-application-foundation)
Local-verified (not staging/production): `npm run verify` passed in a clean copy outside OneDrive: 0 type errors, 184 tests, 60 pages, 8 built-output tests.
- A (financial): quote insert, payment void and confirmation enforce deposit/total/version invariants inside the single write statement; replays compare every stored field; bodies bounded (413); `busy?from` validated. Race tests inject a competing write between check and write and fail on the old code.
- B (uploads): migration 0015 `ready_at` (attach requires it); cleanup claims by tombstone + 5 min lease in one statement; attachment loss aborts enquiry finalisation atomically; delete endpoint now rate limited.
- C (catalogue): migration 0016, `src/data/catalogue.ts` (strict model, seed = confirmed prices), `worker/catalogue.ts` (draft CAS, publish exact previewed revision, append-only rollback, public `GET /api/catalogue`), `scripts/pull-catalogue.mjs` (prebuild; `CATALOGUE_URL`), menu page renders from the approved snapshot. Optional secret `CATALOGUE_REBUILD_HOOK` triggers a rebuild after publish.
Not done: owner catalogue editor UI in admin; per-item availability/draft states in the catalogue (old `menu_items` editor still separate and not wired to the public site); upload bot challenge/session (needs form change); retention job for enquiries and attached uploads; infrastructure verification; creative/SEO/AEO workstreams.
Environment: `npm run build` fails inside the OneDrive folder (UNRESOLVED_ENTRY / Tsconfig not found) even on clean HEAD; builds fine in a fresh copy with `npm ci`. Likely OneDrive file sync or running dev servers; verify in a non-OneDrive copy.
Next: admin catalogue editor screen, wire/retire old menu editor, enquiry retention, upload session challenge.
- F (SEO/AEO): `/faq/` built from the catalogue (prices cannot drift) with FAQPage + BreadcrumbList JSON-LD, production-only; `Base` takes `ld`. robots.txt policy in `src/data/crawlers.ts`: search and AI-retrieval crawlers allowed, training crawlers (GPTBot, ClaudeBot, Google-Extended, CCBot, Applebot-Extended, Bytespider, meta-externalagent, Amazonbot) refused. DEFAULT PENDING OWNER CONFIRMATION. Verified in clean copy: 186 tests, 61 pages, 9 production-output tests.
- D (privacy): `POST /admin/api/enquiries/:id/erase` (`worker/erase.ts`) erases a customer's personal data on the owner's typed-reference confirmation: pictures (objects first), contact/request payload, queued message content, free-text notes; amounts, dates and versions are kept; confirmed orders must be closed first; repeat-safe. Admin detail has the control. This is the manual path only: an automatic retention period still needs the owner's decision (backlog E05).
- E (visual, first rendered pass): Edge screenshots of home/menu/FAQ/size guide at 1280 and 390 px: no horizontal overflow, no broken images. Phone header now fits on one row from 390 px (wraps at 368 px and below). Observations not yet acted on: home hero still uses an arch + orange circle (brief says restrain arches); menu and FAQ are text-only and plain; no favicon (needs approved logo). `scripts/browser-check.mjs` now also visits /menu/, /faq/, /size-guide/, /cake-care/ (not yet run against the full local stack). The Chrome extension was not connected, so checks used Playwright with installed Edge.
- Admin: the legacy Menu tab is removed from the UI (it edited `menu_items`, which never reached the public site). The `/admin/api/menu*` routes, tables and tests remain as legacy; the Prices tab is the owner's single place to change what the website shows. Remove the dead Menu screen code and routes when the catalogue gains per-item availability.
- Admin order view shows the balance due date (48 h before fulfilment, Chicago time) from `paymentPlan`, and flags when that deadline has already passed (owner-approved arrangement needed). Type-checked only; not clicked through in a browser.
- E: home hero arch and orange disc replaced by a squared photo frame with an offset butter mat (decision taken per brief to restrain arches; reversible in src/styles/global.css `.arch`). Checked in Edge at 1280/390 px: no overflow. Not yet reviewed against the original logo or with the owner.
- B (upload challenge): migration 0017 `upload_sessions`; `handleUpload` requires a verified Turnstile token (`X-Bot-Token`) for the first upload of a submission (session valid 1 h, purged after 24 h), before any bytes are read or rows reserved; provider outage is 503, never a pass. Enquiry form sends the token, then resets the widget for the final submit. Server proven by tests; the form change is type-checked only (not exercised in a browser against real Turnstile).

## 2026-11-26 — Browser walkthroughs of owner flows (local stack, Edge, 390px, test data only)
- Prices tab: invalid price rejected, draft save, publish, version history; no console errors, no overflow. Layout compacted in 6cd1afb (two-column price groups).
- Order view: quote 40 days out shows "Balance due by … Chicago time (48 hours before pickup)"; quote for tomorrow shows the rush message; erase with a wrong reference is refused, with the right reference the payload is anonymised and the detail view no longer shows the customer.
- Not covered: real Turnstile on the upload challenge, the public /api/catalogue route (not served by worker/local.ts), staging/production.
- Local note: an older wrangler dev from the main repo folder can hold port 8787; run the scratch stack on another port and point astro's dev proxy at it.

## 2026-11-26 — Performance measurement (emulated, not field data)
- Method: built site served locally, Edge, Pixel 7 profile, slow-4G throttle (1.6 Mbps, 150 ms) and 4x CPU slowdown; LCP/CLS via PerformanceObserver. Lab emulation only.
- Text pages (menu, FAQ, size guide, care, story, enquiry): 76–90 KB, 4 requests, no first-party JavaScript, CLS 0, LCP 0.9–1.3 s. Fonts 56 KB on every page.
- Home: 410 KB (326 KB images), LCP 3.3 s before; after `fetchpriority="high"` on the eager hero image 1.9–2.3 s over three runs, CLS 0.002. /creations/: 699 KB (609 KB images), LCP 1.5–1.8 s.
- Not measured: real devices, field data, the Turnstile script cost on /enquiry/ (third party, loaded at runtime).

## 2026-11-26 — Workstream D/G: provider check and CI browser job
- Provider verification: `wrangler whoami` reports not authenticated on this machine, so Cloudflare Access, Turnstile, D1, R2 and Resend could NOT be verified independently. Blocker: the owner runs `! npx wrangler login` (interactive) in this session, or supplies read-only access. Nothing was created, changed or deployed.
- CI: new `browser` job (verify.yml) runs `npm run check:browser` on every pull request against the local stack (throwaway D1/R2, test data only) with the runner's Chrome: layout at 320/390/430, keyboard-only, reduced motion, axe WCAG A/AA on public and owner pages, Prices journey, enquiry detail. `SKIP_IMAGE_CHECK=1` is set there only because photos are not in Git by policy; local runs stay strict. Green on 8d6f780 (verify and browser).
- SEO: enquiry thank-you page noindex, descriptive titles/descriptions, built-output test for unique titles and description length (6510469).
