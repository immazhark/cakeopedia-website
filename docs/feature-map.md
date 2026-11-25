# Owner features to engineering status (25 November 2026)

Owner IDs (F01-F34) are authoritative; engineering backlog IDs in backlog.md differ. Vocabulary: not started,
in progress, partially implemented, implemented locally, integrated and verified, staging verified, production
verified, blocked, deferred. Nothing here is staging or production verified.

| ID | Feature | Status | Evidence / gap |
|---|---|---|---|
| F01 | Genuine Austin portfolio | Partially implemented | 19 real creations, gallery, collections. Austin provenance and name clearance pending owner; media not in Git. |
| F02, F03 | Sizes, prices, flavours, add-ons | Blocked (owner data) | Needs approved menu; model not built. |
| F04 | Short enquiry | Implemented locally | Form to local Worker to D1: validated, replay-safe, offline retry tested in Edge at 390px. Closed in production builds. |
| F05 | Ordering steps | Implemented locally | Home page steps (wording pending approval). |
| F06 | Story and identity | Partially implemented | Draft story; logo and baker name pending. |
| F07, F08, F13 | Care, pickup/delivery, serving guide | Not started | Owner wording pending. |
| F09 | Contact and Instagram | Partially implemented | Instagram only. |
| F10 | Owner content updates | Not started | CMS trial pending. |
| F11 | Gallery filters | Implemented locally | Crawlable /collections/ pages, no JS needed. |
| F12 | Gallery or external inspiration with up to 3 images | Implemented locally | Gallery reference plus private uploads: byte-level format sniffing, dimension/pixel bounds, metadata stripping, 3-image and daily caps, remove, orphan purge, atomic linking (54 tests; live Edge run at 390px with local R2/D1). Owner read access needs auth (not built); provider R2 limits and retention unverified. |
| F15 | Decorating videos | Partially implemented | 3 silent clips; playback not machine-verified. |
| F17 | Shareable creation pages | Implemented locally | 19 pages; sitemap, canonical, schema pending. |
| F18 | Customer feedback | Blocked (no permissioned reviews) | |
| F19 | Private enquiry list | Partially implemented | Worker API only (worker/auth.ts, inbox.ts): Cloudflare Access JWT verified server-side, CSRF guard, keyset pagination, append-only status history (new, replied, quoted, confirmed, closed; legacy booked maps to confirmed), optimistic concurrency; 12 tests. No inbox UI, not wired to a deployed Access app, not provider-verified. |
| F20-F24 | Alerts, busy dates, quotes, deposits, calendar | Not started | Outbox recovery logic exists; no sender. |
| F14, F16, F25-F34 | Later phase | Intentionally deferred | |
