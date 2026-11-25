# Owner features to engineering status (25 November 2026)

Owner IDs (F01-F34) are authoritative; engineering backlog IDs in backlog.md differ. Vocabulary: not started,
in progress, partially implemented, implemented locally, integrated and verified, staging verified, production
verified, blocked, deferred. Nothing here is staging or production verified.

| ID | Feature | Status | Evidence / gap |
|---|---|---|---|
| F01 | Genuine Austin portfolio | Partially implemented | 19 real creations, gallery, collections. Austin provenance and name clearance pending owner; media not in Git. |
| F02, F03 | Sizes, prices, flavours, add-ons | Blocked (owner data) | Needs approved menu; model not built. |
| F04 | Short enquiry | Implemented locally | Form to local Worker to D1: validated, replay-safe, offline retry tested in Edge at 390px. Closed in production builds. Uploads not built. |
| F05 | Ordering steps | Implemented locally | Home page steps (wording pending approval). |
| F06 | Story and identity | Partially implemented | Draft story; logo and baker name pending. |
| F07, F08, F13 | Care, pickup/delivery, serving guide | Not started | Owner wording pending. |
| F09 | Contact and Instagram | Partially implemented | Instagram only. |
| F10 | Owner content updates | Not started | CMS trial pending. |
| F11 | Gallery filters | Implemented locally | Crawlable /collections/ pages, no JS needed. |
| F12 | Gallery or external inspiration with up to 3 images | Partially implemented | Gallery reference done; image upload and private storage not built. |
| F15 | Decorating videos | Partially implemented | 3 silent clips; playback not machine-verified. |
| F17 | Shareable creation pages | Implemented locally | 19 pages; sitemap, canonical, schema pending. |
| F18 | Customer feedback | Blocked (no permissioned reviews) | |
| F19-F24 | Inbox, alerts, busy dates, quotes, deposits, calendar | Not started | Outbox recovery logic exists; no auth, UI or sender. |
| F14, F16, F25-F34 | Later phase | Intentionally deferred | |
