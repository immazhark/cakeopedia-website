# Launch checklist (authoritative; updated 27 Nov 2026)

Evidence levels: **L** locally verified, **S** staging verified (synthetic data), **O** owner accepted, **P** production verified. Nothing is O or P yet. Details: `production-release-checklist.md` (step by step), `backup-operations.md`, `owner-acceptance.md`, `owner-questionnaire.md`, `handoff.md` (history).

## 1. Verified (L and S)
- Hermetic build and tests (289 tests, strict TypeScript, build-output and SEO checks) and a real-browser suite (112 checks: axe accessibility, 320-1280 px, keyboard, reduced motion, owner flows) [L].
- Closed-by-default gates: public intake, owner admin, catalogue and maintenance are independent; owner admin works while intake is closed [S].
- Real enquiry from a customer browser: Turnstile, D1, private R2 picture, owner dashboard, owner alert email (SPF/DKIM/DMARC pass), no automatic customer email, erasure and storage reconciliation [S].
- Owner tools: enquiries with a "Today" attention panel, quotes, payments, deposit rules, calendar, busy dates, messages (owner-sent), price editor with publish, retry and rollback [L/S].
- Media: 24 genuine photos in AVIF/WebP/JPEG, video byte ranges, 222 URLs served [S]; lab LCP 0.6-1.7 s on emulated 4G [lab, not field].
- Encrypted backups: database and customer pictures to Backblaze, restore drill, retention audit, erasure ledger with re-apply after restore [S].
- Security: dependency audit 0 vulnerabilities, no secrets in tracked files, Access on admin, rate limits, upload validation, CSRF/origin checks [L/S].

## 2. Human-only blockers (nothing else blocks launch work)
1. Owner answers (`owner-questionnaire.md`): cupcake flavour rule, ganache, delivery detail, menu currency, cottage-food items (TCS, training, label), photos/logo, privacy and policy wording with legal review.
2. Owner authorisations, each separate and in order: production setup (secrets, migrations 0001-0022, closed deploy); DNS cutover (placeholder root records return 522); first production backup, restore drill and scheduled task; opening public enquiries; search-console verification.
3. Provider values only the owner can hold: production Turnstile and Resend secrets, `wrangler login` on the backup PC, Bitwarden recovery items (done), optional healthcheck account.

## 3. Release steps (summary; commands in `production-release-checklist.md`)
Preflight (`node scripts/prod-preflight.mjs dist`) -> secrets -> migrations (Time Travel bookmark first) -> closed production deploy -> Access probe -> domain + TLS/HSTS -> first backup + restore drill -> schedule -> owner acceptance -> open form and intake -> one live synthetic enquiry -> notifications on -> Search Console/Bing.

## 4. Deferred (approved later-phase or optional; not launch scope)
Customer accounts, checkout, subscriptions, waiting lists, seasonal preorders; Cloudflare-cron backups with public-key encryption (only if the PC proves unreliable); llms.txt; Product/Offer structured data (needs fixed approved prices); real-device and screen-reader testing before or just after launch; field Core Web Vitals after launch traffic.

## 5. Known risks
Backups run only while the owner's PC is on (local alerts; heartbeat recommended). Erased personal data can remain encrypted in backups up to about 70 days (wording drafted, unpublished). The root domain currently serves a placeholder (HTTP 522). All work is uncommitted in the working tree; staging builds come from it.
