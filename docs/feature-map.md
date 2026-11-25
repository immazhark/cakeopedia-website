# Owner features to engineering status (25 November 2026)

Owner IDs (F01-F34) are authoritative; engineering backlog IDs in backlog.md differ. Vocabulary: not started,
in progress, partially implemented, implemented locally, integrated and verified, staging verified, production
verified, blocked, deferred. Nothing here is staging or production verified.

| ID | Feature | Status | Evidence / gap |
|---|---|---|---|
| F01 | Genuine Austin portfolio | Partially implemented | 19 real creations, gallery, collections. Austin provenance and name clearance pending owner; media not in Git. |
| F02, F03 | Sizes, prices, flavours, add-ons | Partially implemented | Validated menu domain, precise price formatting, empty approved dataset and review-only editorial UI. Owner menu data, CMS workflow and production publication pending. |
| F04 | Short enquiry | Implemented locally | Form to local Worker to D1: validated, replay-safe, offline retry tested in Edge at 390px. Closed in production builds. |
| F05 | Ordering steps | Implemented locally | Home page steps (wording pending approval). |
| F06 | Story and identity | Partially implemented | Draft story; logo and baker name pending. |
| F07, F08 | Care, pickup/delivery | Not started | Owner wording pending. |
| F13 | Serving guide | Partially implemented | Serving-range model, formatter and review-only layout exist; approved portion data, visual verification and public release pending. |
| F09 | Contact and Instagram | Partially implemented | Instagram only. |
| F10 | Owner content updates | Partially implemented | Revision-aware editorial domain and approved-only static export; authenticated persistence, atomic compare-and-set, mobile editing and owner review pending. |
| F11 | Gallery filters | Implemented locally | Crawlable /collections/ pages, no JS needed. |
| F12 | Gallery or external inspiration with up to 3 images | Implemented locally | Gallery reference plus private uploads: byte-level format sniffing, dimension/pixel bounds, metadata stripping, 3-image and daily caps, remove, orphan purge, atomic linking (54 tests; live Edge run at 390px with local R2/D1). Private owner viewing implemented locally (F19); provider R2 limits, retention and upload concurrency hardening unverified. |
| F15 | Decorating videos | Partially implemented | 3 silent clips; playback not machine-verified. |
| F17 | Shareable creation pages | Implemented locally | 19 pages; sitemap, canonical, schema pending. |
| F18 | Customer feedback | Blocked (no permissioned reviews) | |
| F19 | Private enquiry list | Implemented locally | /admin screen (phone-first) over the authenticated API: filters, detail, private picture viewing, status history, manual Instagram orders. Verified in Edge at 390px with a local dev login that exercises the real token verifier. Not yet behind a real Cloudflare Access app. |
| F20 | New-enquiry alerts | Partially implemented | Bounded transport, immutable snapshot preparation, uncertainty reconciliation and due-event scheduling with isolated SQLite tests. Lease-aware sender composition implemented; integration tests committed, closed-by-default maintenance runtime composed; approved configuration, cron and cloud verification pending; no live delivery. |
| F21 | Busy dates | Implemented locally | Per-day toggle in the calendar tab; owner note only, no public availability. |
| F22 | Quote and order summary | Implemented locally | Versioned quotes (integer cents), agreed design and prep notes. |
| F23 | Deposit and balance records | Implemented locally | Append-only owner-recorded payments, void with reason, confirmation blocked until the agreed deposit is recorded. No payment automation. |
| F24 | Confirmed-order calendar | Implemented locally | Month view of confirmed orders by stored Austin date/time (DST-safe, no conversion). |
| F14, F16, F25-F34 | Later phase | Intentionally deferred | |
