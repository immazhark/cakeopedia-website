# Service and cost register

Published documentation checked 24 November 2026. Actual accounts, plan selection,
remaining shared quotas, billing/card requirements and cloud behaviour are unverified.
No resources are provisioned by this documentation commit. Free-first is a constraint,
not a guarantee of unlimited availability. Commercial SaaS terms require review at setup.

| Candidate | Published allowance/constraint | Decision and failure/cost implication |
|---|---|---|
| Astro / TypeScript | MIT / Apache-2.0 tooling; supported versions to pin together | Static public output; strict types plus server validation. |
| Workers Static Assets/API | Static requests free; Free dynamic 100k/day, 10ms CPU/invocation | Route only narrow API/admin through Worker; measure CPU. Actual account may already be paid. |
| Workers Builds | Free 3,000 minutes/month, one concurrent build, 20-minute timeout | Debounce publishes; show pending/failure; retain last successful build. |
| Sanity Free | 20 seats, 2 public-only datasets; Administrator/Viewer only; 10k documents; 250k API/1m CDN requests; 100GB assets/monthly bandwidth | No restricted Editor role. Trial phone and broad admin permission; public-safe content only, no private assets/records. |
| D1 Free | 5m rows read/day, 100k written/day; 5GB account; 500MB/database; 10 databases; 50 queries/invocation | Usage exhaustion can stop queries. Indexed small schema; transactional batch proof. SQLite-based, not PostgreSQL. |
| Resend Free | 100/day, 3,000/month; recipients and inbound count; 24h idempotency | Domain verification; persistent bounded outbox recovery. API acceptance is not delivery. |
| Turnstile Free | 20 widgets; unlimited challenges; 10 hostnames/widget; single-use five-minute tokens | Server Siteverify plus application limits and recoverable replay. |
| Access | Free plan advertised for teams under 50 users | Exact allowlist/backend JWT/alternate-host proof; no homegrown password system. |
| R2 Standard | 10GB-month, 1m A/10m B operations allowance; metered overage | Conditional private inspiration uploads, up to three; validate actual account/quota/overage controls before activation. |
| Domain | Registration and renewal cost depends on selected name/provider | Purchased by sponsor: cakeopedia.com at Spaceship. DNS/hosting/email setup not verified; no further purchase needed for registration. |

## Before activation

Record account owner, actual plan/resource, check date, shared usage, commercial terms,
card requirement, hard limit versus alert, overage behaviour, export/restore, recovery
custodian and graceful failure. Keep identifiers/contacts private where sensitive.
Do not enable trials, paid AI add-ons, automatic upgrades or artificial keep-alive traffic.
Workers now has product-specific spending controls; these are not blanket R2/account caps.

Illustrative assumptions only: 100 enquiries/month at two email recipients = 200 sends;
60 enquiries in a day would exceed 100 sends. Keep browsing available when intake or
email is unavailable. Review at 50/75/90% of relevant shared quota; no silent paid upgrade.

## Recovery proposal

D1 Free has seven-day always-on Time Travel, not an independent backup against account
loss. Before live intake, automate encrypted daily exports to approved storage outside
that account, with separately protected keys; provisionally retain 7 daily/4 weekly copies.
Export Sanity dataset/assets weekly and before bulk edits. Keep original media privately.
Test restoration to a separate store and reapply deletion records. Targets, subject to a
successful drill: <=24h independent-backup data loss and one working-day restoration.
Backup destination/automation/retention need owner approval. No public CI DB artifacts.

Official source URLs and evidence limits: [research evidence](research-evidence.md).
