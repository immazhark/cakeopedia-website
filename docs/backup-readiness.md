# Backup readiness assessment (27 Nov 2026)

Verified today (read-only): the backup passphrase is stored with Windows DPAPI and reads back (60 characters; the value was never displayed); the scheduler script's preview creates nothing and no task exists; Wrangler is logged in with an OAuth token; the production D1 is identified as `cakeopedia-db-production` and currently has **0 tables** (migrations not applied). Temp files: the plain dump is written to a per-run folder under the user's Windows temp directory (not OneDrive, not Git) and removed in a `finally`; encrypted files live in the user's state folder under LOCALAPPDATA (not OneDrive, not Git) and are removed after upload; leftovers of an interrupted run are swept after one hour at the next run (tested).

## Coverage audit: what is and is not backed up
| Data | Where | Backed up? |
|---|---|---|
| Enquiries, quotes, payments, events, catalogue, communications | D1 | YES: daily encrypted export (restore-checked before upload) |
| Customer inspiration pictures (up to 3 per enquiry) | private R2 bucket | **WAS NOT**, the database dump holds only picture metadata. NOW: `scripts/backup-r2.ts` backs up each attached picture, encrypted, when it is new AND again every 28 days while it stays attached (the lifecycle rule would otherwise expire a once-only backup about 70 days after upload while newer database backups still reference the picture; erased pictures are not refreshed, so their backups expire within ~70 days, matching the erasure wording), to `backups/r2/<source>/<key>.ckbak`; `backup-run.ts` runs it after the database backup for staging/production. Built and tested at unit level; a real download-encrypt-upload has not been run (staging has no pictures right now). |
| Static site, code, media | Git / build mirror / original media folder | Git is uncommitted work today (commit decision pending); original media stays in the owner's folder. Not part of the encrypted backup. |
| Cloudflare / Resend / Backblaze settings, secrets | providers, Bitwarden | Not backed up; secrets live in Bitwarden. A provider-settings inventory is in the runbook and `wrangler.*.jsonc`. |
Recovery of pictures is best-effort by design: a customer can resend an inspiration photo; D1 metadata survives. Erased pictures are not backed up again and their backups expire in about 70 days.

## Reliability limits of PC-dependent scheduling and local-only alerts
1. The job runs only while the owner is logged on to this PC. PC off, asleep or away for days means no backups for those days; catch-up happens at the next logon.
2. Failure alerts are a Windows balloon on that PC. If the PC is off, nothing alerts anyone.
3. One machine is a single point of failure (disk loss, Windows reinstall: the DPAPI passphrase file is lost; the Bitwarden note is the recovery path).
4. Wrangler's OAuth login can expire; an expired login makes every run fail until `wrangler login` is repeated.

### Recommended improvement (cost-free, small): external heartbeat
Use a free dead-man's-switch check (for example healthchecks.io's free tier; the owner creates the account and a check with a 1-day period and a grace period of a few hours). The runner pings it at start, on success and on failure; a **missed** ping emails the owner even when the PC is off. Only the ping is sent: no data, no secrets. Implemented: `node scripts/backup-run.ts --set-healthcheck` stores the secret ping URL (hidden prompt, user-only folder); with no URL stored nothing is sent. This closes limit 2 and makes limits 1 and 4 visible within a day.
Later option, only if the PC proves unreliable: a Cloudflare Worker cron that dumps D1 and uploads it encrypted with a PUBLIC key (the private key stays in Bitwarden, so a compromised Worker cannot read backups), alerting through the existing Resend email. It removes the PC dependency but needs a custom dumper, a public-key scheme and a check against Workers free CPU limits, so it is not recommended unless needed.

## First real backup and restoration drill (needs the owner's go-ahead; nothing below has been run)
Production cannot be backed up yet: its database has no tables, and the exporter refuses any dump that cannot be restored. Until production migrations are applied (at release), prove the real remote path with the STAGING database (synthetic data only):
1. Staging drill (real Wrangler export, real Backblaze upload; synthetic data):
   `cd "$env:LOCALAPPDATA\cakeopedia-build"` then `node scripts/backup-run.ts --source staging --force`
   Expect "Backup OK: backups/d1/staging/YYYY-MM-DD.ckbak". Check: `node scripts/backup-run.ts --status --source staging`.
2. Restoration drill: copy `b2-reader.json` from Bitwarden into `%LOCALAPPDATA%\cakeopedia-secrets\`, then
   `node scripts/backup.ts download backups/d1/staging/YYYY-MM-DD.ckbak drill.ckbak`
   `node scripts/backup.ts check drill.ckbak` (decrypts with the DPAPI passphrase, loads a scratch database, prints table counts and `integrity ok`)
   then delete `drill.ckbak` and the reader file.
3. Production, at release (after migrations 0001-0021 are applied and the owner authorises): `node scripts/backup-run.ts --source production --force`, then the same restore drill with the production object.
4. Only after step 3 passes and the owner agrees: preview with `powershell -ExecutionPolicy Bypass -File scripts\register-backup-task.ps1`, register with `-Register`.
Human-only: Bitwarden retrieval of the reader key for the drill; `wrangler login` if the login expired; creating the healthcheck (optional); the go-ahead for each step.
