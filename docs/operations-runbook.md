# Operations runbook (draft, nothing here has been run against production)

Status: written from the code, not from a live system. No provider account was inspected (Wrangler is not logged in on the development machine) and nothing is deployed. Every step marked **UNVERIFIED** must be exercised once, with its result recorded in docs/handoff.md, before live intake. Secrets are never written in this repository; this file names them only.

## 1. Launch gate (all must stay true until the owner authorises launch)

- Capabilities open independently (worker/live.ts), each failing closed: **public intake** needs `LIVE_ENABLED=1`, `DB`, `UPLOADS`, `SITE_ORIGIN` (https, origin only), secrets `TURNSTILE_SECRET` and `RATE_SECRET` (503 `intake_not_enabled` otherwise); **owner admin** needs `ADMIN_ENABLED=1`, `DB`, `UPLOADS`, `SITE_ORIGIN`, `ACCESS_ISSUER`, `ACCESS_AUD`, `OPERATORS` (503 `admin_not_enabled` otherwise; Access JWT still checked on every call); the **approved catalogue** needs only `DB`; **scheduled maintenance** needs `DB` and `UPLOADS` plus each job's own switch. No `DB`: everything closed.
- The public form is closed in production builds unless `PUBLIC_ENQUIRY_FORM=on` (src/pages/enquiry.astro). Open form builds also need a real `PUBLIC_TURNSTILE_SITE_KEY` (test keys fail the build).
- Switches, each off unless exactly `1`: `NOTIFICATIONS_ENABLED` (optional until the owner wants email), and **`RATE_CLEANUP_ENABLED` and `UPLOAD_CLEANUP_ENABLED`, which must both be `1` at launch**: without them rate-limit rows, orphaned pictures (and their R2 objects) and expired upload sessions accumulate without limit. Mail needs `RESEND_API_KEY`, `MAIL_FROM`, `OWNER_EMAIL`. `RETENTION_DAYS` (a whole number of at least 30; anything else leaves retention off) makes each scheduled run erase enquiries the owner has explicitly closed that have been quiet that long, up to 20 per run, using the same erasure as the owner action (financial records stay; open, replied, quoted and confirmed enquiries are never touched). Owner decision (26 Nov 2026): keep closed enquiries until the owner erases them, so `RETENTION_DAYS` stays unset and this job stays off; it remains available if that changes. `CATALOGUE_REBUILD_HOOK` (optional) is a deploy-hook URL called after a price publish.
- **Emergency stop for intake:** set `LIVE_ENABLED` to anything other than `1` (or remove it) and redeploy/update the variable. Enquiries and uploads stop; the owner area, catalogue and cleanup keep running (regression-tested locally, not yet on a deployed Worker); the static site stays up.

## 2. Components

| Part | What | Where defined |
|---|---|---|
| Static site | Astro build, served by Workers Static Assets (docs/service-register.md; hosting setup itself not verified) | astro.config.mjs, `npm run build` |
| Worker | enquiry intake, uploads, owner API, scheduled jobs | worker/index.ts, worker/live.ts |
| D1 | enquiries, quotes, payments, uploads, catalogue | migrations/0001 to 0018 |
| R2 | private pictures, never public | binding `UPLOADS` |
| Cloudflare Access | owner login (JWT checked in the Worker, issuer pinned) | worker/auth.ts |
| Turnstile | bot check on submit and on the first upload | worker/turnstile.ts |
| Resend | owner and customer notifications | worker/notification-sender.ts, worker/notification-scheduler.ts |

`wrangler.local.jsonc` (local emulator, test data) is the only working config. `wrangler.production.example.jsonc` is a template with placeholder IDs and no secrets (closed by default, only `/api/*`, `/admin/api/*` and `/health` run the Worker first, one 5-minute cron). A dry-run deploy of it validated and bundled offline (215 static files, six bindings); a test keeps it in step with the settings the Worker reads. Copying it to `wrangler.jsonc` with real resource IDs needs account access and is a precondition for the steps below. Note `/admin/` pages are static assets, so only the Cloudflare Access policy on `/admin/*` protects them; the Worker protects `/admin/api/*`.

## 3. Before first live use (UNVERIFIED unless marked)

1. Cloudflare Access application covers `/admin/*` and `/admin/api/*`; the policy lists only the owner; `ACCESS_AUD` and `ACCESS_ISSUER` match it. Check: an unauthenticated request to `/admin/api/enquiries` is refused, a wrong-audience token is refused.
2. Turnstile widget hostnames list the production domain only; `TURNSTILE_SECRET` is the rotated secret.
3. R2 bucket has no public access and no custom domain. Check: an object URL returns 403/404 without Worker mediation.
4. D1: apply migrations in order (`wrangler d1 migrations apply`), then confirm `ready_at` (0015), catalogue tables (0016) `upload_sessions` (0017) and its `client` column (0018) exist.
5. Schedule: one cron trigger on the Worker. With the three switches on, each run sends due notifications, clears rate windows and purges orphaned uploads and expired upload sessions. Confirm one run in logs.
6. Resend: sending domain verified; send one test message to the owner before enabling `NOTIFICATIONS_ENABLED`.
7. Spending: confirm plan limits and that no billing is attached (AGENTS.md: no purchases without authority).
8. Edge rate limiting: add a Cloudflare rate-limiting rule on `/api/*` (the Worker limits per client and has an attempts cap, but a volumetric flood is best stopped before it reaches the Worker). UNVERIFIED.
9. Transport security: the site's own headers (`_headers`) set nosniff, referrer policy, permissions policy and frame blocking, and the page CSP is a hash-based meta tag. Checked in a production build in Edge: 0 CSP violations on 11 pages. Production builds (`PUBLIC_SITE_ENV=production`) add `Strict-Transport-Security: max-age=86400` (one day, no subdomains, no preload; raise only after checking the live site). Zone settings (SSL Full, Always Use HTTPS on, Cloudflare HSTS off so there is one source) are still to be set by the owner at release; today the zone has SSL Full with Always Use HTTPS and HSTS off (reported 27 Nov, not independently re-verified).

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

## 6. Backup and restore (remote path UNVERIFIED, required before live intake)

- D1 has seven-day Time Travel on the free plan; that is not an independent backup (docs/service-register.md).
- **Tool (built, tested):** `npm run backup -- export <file.ckbak>` exports D1 with Wrangler, refuses a dump that is missing a required table, encrypts it (AES-256-GCM, scrypt key from `BACKUP_PASSPHRASE`, at least 20 characters, never stored) and deletes the plain file. `check <file>` decrypts into a scratch in-memory SQLite database and prints row counts per table and the integrity result. `decrypt <file.ckbak> <out.sql>` is for an actual restore (the SQL contains customer data). A wrong key or any tampering fails to decrypt.
- **Local drill done (26 Nov 2026):** `export --local` on the emulator database (test data: 7 enquiries, 17 events, 14 migrations), then `check`: every required table present, integrity ok. This proves the format, the encryption and the check; it does not prove the remote export or a restore into a real D1.
- **Still to do before live intake:** run `export` with `--remote` after `wrangler login`; store the `.ckbak` files outside this Cloudflare account on a schedule (not automated yet) with the passphrase kept in the owner's password manager, separate from the files; run one full restore into a scratch D1 (`wrangler d1 execute ... --file`) and confirm at most 24 hours of data loss and one working day to restore (docs/backlog.md E05).
- **Erasure and backups:** an erased customer's data still exists in older backups. Give backups a finite life (suggested: delete encrypted backups older than 35 days, final period for the owner and legal review), and after any restore re-run every erasure requested since that backup was taken (an enquiry whose payload has `erased: true` must stay erased). Nothing in the database records erasure requests outside the database, so keep a short private list of references erased and when.
- **R2 manifest (built, tested; no network client wired yet):** `scripts/backup-r2-lib.ts` builds an encrypted manifest (key, size, etag, SHA-256 over the entries; no object bytes) from an injected bucket listing client, and `reconcile` compares it with the D1 `uploads` rows. It flags: objects of deleted or erased enquiries still in the bucket, live rows with no object, size mismatches, and objects with no D1 row. Same passphrase rules as the D1 backup. The manifest is not a copy of the images: losing the bucket loses the pictures.
- **Restore and erasure after restore:** (1) restore D1 from the encrypted dump (`decrypt`, then import into an empty database); (2) re-apply every erasure requested since that backup from your private list (enquiry view, "Erase customer data"; it also deletes the R2 objects); (3) list the bucket into a fresh manifest and run `reconcile` with the restored `uploads` rows and the erased enquiry ids: delete every `erasedStillInBucket` object, investigate `missingInBucket` and `untracked`; (4) repeat the reconcile until `ok` is true. An old manifest or D1 backup still names erased customers' objects, so it ages out with the same 35-day life.
- **Monitoring:** `collectHealth(db, now)` in `worker/health.ts` returns counts and ages only (oldest pending outbox and queued message, failed messages, upload sessions, last catalogue rebuild status, missing tables). It needs wiring to a protected route or alert by the Worker owner. Missing index, not added (migrations are applied): `communications(state, created_at)`; harmless while that table is small.

## 7. Routine owner and operator actions

- **Publish prices:** Prices tab, save draft, publish. A stale edit shows "changed somewhere else" and reloads.
- **Erase a customer's data:** enquiry view, "Erase customer data", type the reference. Refused while an order is confirmed (close it first). Amounts and dates are kept; names, contacts, text, pictures and notes are removed. Safe to repeat.
- **Record a payment:** only after seeing the Zelle payment arrive; the system never infers receipt.
- **Balance due:** shown on the order as 48 hours before pickup or delivery, Chicago time; later quotes show the rush message.

## 8. Known gaps

- No production Wrangler config, no provider verification, no scheduled off-account backup (the encrypted export tool exists), no monitoring or alerting; the retention job is built but off until the owner sets a period.
- Upload challenge not yet exercised against real Turnstile.
- No automatic customer email: the owner decided (26 Nov 2026) that the unverified customer address is never emailed at intake; only the owner notification is queued. The customer sender code remains for a future owner-triggered message.
- Business email contact@cakeopedia.com is approved but not provisioned, and is not published.

## Off-account backup destination: recommendation (needs owner approval; nothing is sent anywhere until approved)
- Recommended: a free Backblaze B2 bucket (S3-compatible, 10 GB free; confirm current plan before relying on it) in an account the owner controls, separate from Cloudflare, so one account compromise or lock-out cannot take both the data and its backups.
- Only already-encrypted blobs leave Cloudflare (`npm run backup -- export`, R2 manifest); B2 never sees plaintext or the passphrase. Use an application key limited to that bucket with write-only capability (no read/delete) for the scheduled uploader; the owner keeps a separate read key offline for restores.
- The passphrase is held by the owner offline (not in Git, not in Cloudflare). Retention 35 days; erasure-after-restore procedure above applies to every restored copy.
- Alternatives if B2 is declined: a second free Cloudflare account (same vendor, weaker independence) or an owner-held encrypted external drive (manual, no schedule).
- Still to build once approved: the scheduled uploader (needs the key as a secret) and a restore drill into an isolated D1.
- Uploader (built, NOT used): `node scripts/backup.ts upload <file.ckbak> <object-key>` sends an already-encrypted backup to any S3-compatible bucket (AWS SigV4, verified against AWS's published signature example; env `BACKUP_S3_ENDPOINT/REGION/BUCKET/KEY_ID/SECRET`). It refuses plain SQL and `..`/unsafe keys, never logs keys, and throws on any non-2xx. Nothing is scheduled and no destination is configured until the owner approves one (a local Task Scheduler/cron job on a machine the owner controls is the simplest schedule).
- Scheduled-job visibility: migration 0021 `maintenance_runs` records each job's last state; `GET /admin/api/health` returns `maintenance` (state, failures in a row, age, time since last success). A failure also logs one JSON line (`maintenance_failed`, job name only).

## Backblaze B2 backups (destination APPROVED by the owner 27 Nov 2026; keys not created yet)
Bucket `cakeopedia-austin-backups` (id 48d2dd8d325d1cbeaa210217), endpoint https://s3.us-east-005.backblazeb2.com, region us-east-005; private, server-side encryption on, Object Lock off, keep all versions, free 10 GB / 1 GB-day download caps, spending caps $0, usage alerts on. Do NOT use the dashboard "Write Only" preset (it grants deleteFiles and bucket settings) and never paste keys in chat.
- **Writer key** (automated): capability `writeFiles` only, restricted to this bucket and the `backups/` prefix. No read, list, delete, bucket, encryption, lifecycle, retention or key permissions.
- **Reader key** (owner, recovery): `listBuckets`, `listFiles`, `readFiles`, this bucket only. Keep it in the owner's password manager, not on the backup machine.
- **Creation needs a key with `writeKeys`** (B2 `b2_create_key`); in practice only the account's master application key has it. The dashboard presets cannot create these keys. So the owner runs ONE command in their own terminal: `node scripts/b2-keys.ts` (add `--replace-stale` only to redo an earlier partial run: it deletes same-named keys whose permissions exactly match what the script creates, never anything else) (account ID, authorising key ID, then the key typed at a hidden prompt; held in memory only; the two new keys are saved to `%LOCALAPPDATA%\cakeopedia-secrets\`, folder limited to the owner's Windows user, outside OneDrive/Git; only key IDs and capabilities are printed). If the master key value was not saved, the dashboard can only show a new one by GENERATING it, which invalidates the old master key: that is a rotation and needs the owner's explicit decision.
- **Verify before any real data:** `node scripts/b2-verify.ts` uploads a synthetic encrypted blob (database schema, no rows) and proves: writer can upload under `backups/` only; writer cannot read, list or delete; reader downloads byte-identical data (sha256), lists, cannot upload or delete; the download decrypts and restores into a scratch database (isolated recovery).
- **Use:** `BACKUP_PASSPHRASE=... node scripts/backup.ts export out.ckbak` then `node scripts/backup.ts upload out.ckbak backups/d1/YYYY-MM-DD.ckbak` (uses the writer file; the key must start with `backups/`). Recovery: restore the reader file temporarily, `node scripts/backup.ts download backups/d1/DATE.ckbak in.ckbak`, then `check`/`decrypt`. Erasure-after-restore procedure above applies.
- **Retention and Object Lock (evaluated):** with "keep all versions" and a writer that cannot delete, backups are never overwritten (use dated names; a same-name upload only adds a version). Expiry must come from a bucket lifecycle rule, configured by the owner in the dashboard (the writer cannot): file prefix `backups/`, days from upload to hide 35, days from hide to delete 1. This keeps the 35-day erasure promise without any key holding deleteFiles. Object Lock: NOT recommended now; a compliance lock makes backups undeletable even by the owner until expiry (conflicts with erasure commitments unless retention is at most 35 days) and governance mode needs `bypassGovernance`, which we deliberately do not grant. Residual risk: a stolen writer key could fill the free 10 GB cap (uploads then fail at the $0 cap: fail-safe, never a bill); usage alerts and the scheduled-job health view show it.
- **VERIFIED 27 Nov 2026 with synthetic data (`node scripts/b2-verify.ts`, 12 PASS):** keys created (writer `writeFiles`, bucket + `backups/` only; reader `listBuckets/listFiles/readFiles`); writer cannot read, list or write outside `backups/`; reader cannot write; reader downloads byte-identical data (sha256) and the download decrypts and restores into a scratch database. **Backblaze nuance (tested):** `writeFiles` is also what allows HIDING a file: a plain S3 delete by the writer returns 204 and only adds a delete marker; the original version stays readable by version id, and permanently deleting a version is denied (403) for both keys. So a stolen writer key cannot destroy backups but could hide recent ones: recover by listing versions with the reader key (`?versions&prefix=backups/`) and downloading by `versionId`. Synthetic test objects remain (a few KB).
- **Not done:** lifecycle rule, schedule (a Windows Task Scheduler job on a machine the owner controls running export then upload), first real upload. No customer data has left Cloudflare.

- Unattended backups, passphrase, retention (~70 days), hidden-version recovery and the erasure implications: see docs/backup-operations.md.
