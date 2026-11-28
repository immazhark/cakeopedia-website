# Privacy wording: retention, deletion and backups (DRAFT for owner and legal review)

Status: NOT published. `src/pages/privacy.astro` still says retention and deletion "will be confirmed here before enquiries open". This is proposed text that matches what the system actually does as of 27 Nov 2026. Do not publish it, or edit the privacy page, until the owner and a legal reviewer approve it. Facts below are limited to what the code and runbook implement; anything marked [OWNER] is a business decision.

## Proposed text (plain language)

**How long we keep your enquiry**
We keep an enquiry and any pictures you attach until we delete them. [OWNER: confirm the period you want, for example "until the order is finished plus [N] months". Today the system keeps closed enquiries until the owner erases them manually; automatic deletion is off.]

**Asking us to delete your information**
Email contact@cakeopedia.com and tell us the reference on your enquiry confirmation page. We will delete your name, contact details, notes and pictures from our working system [OWNER: promise a response time, for example "within 30 days"]. We keep only the amounts, dates and order numbers that we need for our own financial records, without your personal details.

**Backups**
We keep encrypted backups so that we can recover from a failure. If you ask us to delete your information, the copy in our working system is deleted straight away, but a copy may remain in an encrypted backup for up to about 70 days before the backup is automatically and permanently removed. The backups are encrypted, stored separately from our working system, and used only to recover from a failure. If we ever have to restore a backup, we delete again everything that had already been deleted at your request before the restored system is used.

**Who can see your information**
Only Cakeopedia Austin can open enquiries and pictures. We use service providers to run the website, store the data, send our own notifications and keep backups. [OWNER/LEGAL: list them as required: Cloudflare (website, database, picture storage, bot protection), Resend (our emails), Backblaze (encrypted backups).]

## What the system really does (so the wording stays true)
- Erase (owner action): removes the customer's name, contact, request details and pictures from the live database and the private picture storage; keeps amounts, dates and order numbers. Repeat-safe. Confirmed orders must be closed first.
- Backups: the database is exported daily, encrypted on the owner's PC before upload, and stored in Backblaze B2. Customer pictures are backed up individually, encrypted the same way. The bucket lifecycle hides a backup 35 days after upload and permanently deletes it 35 days after that: about 70 days in the normal case. A hidden backup can still be recovered during those days.
- Therefore: erased data can remain, encrypted, in backups for up to about 70 days. The wording above says so and must not be changed to promise instant erasure from backups.
- After a restore: every previously erased enquiry must be erased again before the restored database is used (see `backup-operations.md`). This is now mechanical: every erasure is recorded by reference in an erasure ledger that is backed up (encrypted) with every database backup, and a tool re-applies it to a restored copy before use (see backup-operations.md). No owner action is needed to keep the list.

## Open points for the owner and legal review
1. Retention period for enquiries and pictures (today: until the owner erases them).
2. Deletion response time promised to customers.
3. Whether to name the service providers on the page.
4. Whether any local-law notice is required beyond this (the owner should confirm with a qualified adviser; this is a draft, not legal advice).
