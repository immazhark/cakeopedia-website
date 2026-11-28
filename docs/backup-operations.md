# Encrypted backups: operations (Backblaze B2)

Status (27 Nov 2026): tooling built and VALIDATED END TO END ON STAGING with synthetic data (real Wrangler export, real Backblaze upload and download, isolated restore). No real customer data has been exported or uploaded, production has not been backed up, and no schedule is enabled. Keys and the bucket are described in `operations-runbook.md` ("Backblaze B2 backups"); this file covers running them.

## Passphrase (Windows DPAPI)
- Set it once, privately, in a normal terminal: `node scripts/backup-passphrase.ts set`. Paste the passphrase from Bitwarden at the hidden prompt, twice. `node scripts/backup-passphrase.ts check` proves it reads back and prints only its length.
- It is stored as a DPAPI-encrypted file in `%LOCALAPPDATA%/cakeopedia-secrets/` that only this Windows user on this machine can open. It is never put in a command-line argument, environment variable, log, Git or chat.
- Limit: any program running as this Windows user can decrypt it. The Bitwarden note stays the only recovery copy if this PC is lost. `BACKUP_PASSPHRASE` in the environment still works but is discouraged.

## Running a backup
- `node scripts/backup-run.ts --source production` does: export, restore-check the encrypted file in a scratch database, upload to `backups/d1/<source>/YYYY-MM-DD.ckbak`, record the result. Backblaze rejects an upload whose signed payload hash does not match, so a corrupted upload fails.
- It skips when a backup succeeded in the last 20 hours (`--force` overrides), so a catch-up start never uploads twice.
- `node scripts/backup-run.ts --status [--source X]` shows freshness, consecutive failures and projected storage; it exits 1 when stale (over 36 h) or when projected storage passes 50% of the free 10 GB.
- State and a log live in `%LOCALAPPDATA%/cakeopedia-backup/` (one folder per source, so staging or test runs never affect production). The log holds only: time, event, source, stage, exit code, object key, byte count. No customer data, keys or passphrase.

## Schedule (not created)
`scripts/register-backup-task.ps1` prints the plan and creates nothing unless `-Register` is passed (needs the owner's go-ahead). It would run as the owner's Windows user, daily at 03:00 and 10 minutes after each logon, with catch-up for missed runs, 3 retries 30 minutes apart and a 30-minute limit, from the build mirror folder (not OneDrive). It only runs while the owner is logged on: a PC that is off all day misses that day and catches up at the next logon.

## Alerts and capacity
- A failure writes a log line, counts consecutive failures, shows a Windows notification and exits non-zero (Task Scheduler shows it as the last result).
- Capacity is projected as the largest recent backup times 70 days. Notification at 50% and a failing exit code at 80% of the free 10 GB. Backblaze usage alerts are also on, and spending caps are $0 (an over-cap upload fails; it cannot bill).
- Limit: alerts are local to the owner's PC and there is no email. If the PC is off, nothing alerts until it is used again; `--status` and the Backblaze usage alerts are the backstop.

## Retention (normal case about 70 days)
The lifecycle rule for `backups/` hides a file 35 days after upload and deletes it 35 days after hiding. A backup is listed for 35 days and recoverable by version id for about 70 days, then permanently gone. Hidden versions: list them with the reader key (`?versions&prefix=backups/`) and download by `versionId`. A key with `writeFiles` can also hide a recent backup but cannot destroy it (tested).

## Customer-data erasure and backups
- Erasing an enquiry removes it from the live database immediately but NOT from existing backups. Erased personal data can remain, encrypted, in backups for up to about 70 days. Any privacy wording the owner approves must say so; do not promise instant erasure from backups.
- After ANY restore, re-erase every previously erased enquiry before the restored database is used. This is now mechanical: every erasure writes its reference to the database table erasure_ledger (references and dates only, no personal data; owner audit view: GET /admin/api/erasures), and every backup run uploads the merged ledger, encrypted, to backups/ledger/<source>/erasure-ledger.ckbak, so the newest copy lists every erasure made so far even if the database backup you restore is older. See "Re-applying erasures" below.
- Never restore a backup into production without that step.

## Isolated restoration of a real backup
1. Copy the reader key file from Bitwarden into `%LOCALAPPDATA%/cakeopedia-secrets/b2-reader.json` for the drill only.
2. `node scripts/backup.ts download backups/d1/production/DATE.ckbak in.ckbak`
3. `node scripts/backup.ts check in.ckbak` loads it into a scratch in-memory database and prints table counts and the integrity result.
4. Delete the reader file and `in.ckbak` afterwards.

## Customer pictures (R2)
The database backup holds only picture metadata. `scripts/backup-r2.ts` (run automatically after the database backup for staging and production) downloads each attached picture, checks its size against the database, encrypts it and uploads it to `backups/r2/<source>/<key>.ckbak`. New pictures are backed up on the next run and every picture that is still attached is uploaded again every 28 days, because the bucket lifecycle expires any backup about 70 days after its last upload and database backups keep referencing a picture for as long as it exists. An erased picture is no longer listed, is not refreshed, and its last backup expires within about 70 days. To restore a picture: download `backups/r2/<source>/<object key>.ckbak` with the reader key, decrypt, and put it back in the private bucket under the key recorded in the restored database.

## Drill evidence (staging, synthetic data, 27 Nov 2026)
- Setup created one synthetic enquiry plus a 305-byte JPEG attachment in staging D1 and the private R2 bucket (SHA-256 recorded before it left staging).
- `backup-run.ts --source staging --force`: database export restore-checked then uploaded (35,129 encrypted bytes), picture downloaded, size-checked, encrypted and uploaded.
- `backup-drill.ts verify` (read-only key, isolated scratch database): 11/11 PASS: integrity_check ok; the synthetic enquiry and picture record present; live and restored row counts equal (enquiries 8, uploads 1, quotes 6, payments 5); restored picture byte-identical (size and SHA-256 match) and equal to the size recorded in the restored database.
- `backup-audit.ts --source staging` (version-aware: lists hidden versions too): before cleanup 1 snapshot, 1 attached picture recoverable, 0 live pictures without a backup; after cleanup (picture erased live) the snapshot still references it, the picture backup is retained until the lifecycle rule expires it, and the audit reports it as erased-since (expected). 0 hidden versions at the time.
- Cleanup removed the synthetic D1 rows and the R2 object (both confirmed gone) and all local temp files. Synthetic backup objects remain in Backblaze (the keys cannot delete) and expire by lifecycle.
- Tools: `backup-drill.ts setup|verify|cleanup` (staging only), `backup-audit.ts --source staging|production`, `b2-reader-import.ts` (put the recovery key on the PC for a drill; `--remove` afterwards).

## Release-time activation (production), in order, each step needs the owner's go-ahead
1. Production migrations 0001-0021 applied and the Worker deployed (release checklist). The exporter refuses a database with no tables.
2. `node scripts/backup-run.ts --source production --force` from the build mirror folder (D1 export, restore check, upload, then new pictures).
3. Restore drill on the production objects: `node scripts/b2-reader-import.ts` (hidden prompt, key from Bitwarden), `node scripts/backup.ts download backups/d1/production/DATE.ckbak drill.ckbak`, `node scripts/backup.ts check drill.ckbak`, `node scripts/backup-audit.ts --source production`, then delete drill.ckbak and run `node scripts/b2-reader-import.ts --remove`.
4. Preview then register the schedule: `powershell -ExecutionPolicy Bypass -File scriptsegister-backup-task.ps1` then the same with `-Register`.
5. Optional but recommended: free external heartbeat (healthchecks.io, 1-day period, 6-hour grace, email to the operations mailbox) and `node scripts/backup-run.ts --set-healthcheck`.
6. Monthly: `node scripts/backup-run.ts --status`; quarterly: the restore drill and the audit.

## Re-applying erasures after a restore (unit-tested against the real schema; not yet drilled from Backblaze: do that in the production-time drill)
Every restore must go through this before the restored data is used:
1. Put the reader key on the PC for the drill: node scripts/b2-reader-import.ts
2. Decrypt the chosen database backup: node scripts/backup.ts download backups/d1/production/DATE.ckbak db.ckbak, then node scripts/backup.ts decrypt db.ckbak restore.sql
3. Get the newest ledger: node scripts/backup.ts download backups/ledger/production/erasure-ledger.ckbak ledger.ckbak, then node scripts/backup.ts decrypt ledger.ckbak erasure-ledger.txt (one reference, time and source per line)
4. node scripts/reapply-erasures.ts --dump restore.sql --ledger erasure-ledger.txt --out restore-reerased.sql . It appends idempotent anonymising statements (same effect as the owner Erase action; payments, amounts and dates are kept), loads the result into a scratch database, and refuses to write unless every ledger enquiry present in the backup comes out erased and the integrity check passes.
5. Import restore-reerased.sql (never restore.sql) into the new database. Restore customer pictures only for uploads rows that remain in that database: erased enquiries lose their upload rows, so their pictures are not restored.
6. Delete restore.sql, restore-reerased.sql, db.ckbak, the ledger files and the reader key file (node scripts/b2-reader-import.ts --remove).
