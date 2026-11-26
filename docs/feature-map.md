# Owner features to engineering status (25 November 2026)

Owner IDs (F01-F34) are authoritative; engineering backlog IDs in backlog.md differ. Vocabulary: not started,
in progress, partially implemented, implemented locally, integrated and verified, staging verified, production
verified, blocked, deferred. Nothing here is staging or production verified. Updated 26 November 2026.

| ID | Feature | Status | Evidence / gap |
|---|---|---|---|
| F01 | Genuine Austin portfolio | Partially implemented | 19 real creations, gallery, collections. Austin provenance and name clearance pending owner; media not in Git. |
| F02, F03 | Sizes, prices, flavours, add-ons | Implemented locally | Owner-confirmed prices and rules in src/data/pricing.ts (integer cents); owner Prices tab edits a private draft, publishes an exact previewed revision, append-only versions and restore; public /menu/ and FAQ render from the approved snapshot (built-in confirmed defaults until published). Cupcake price/minimum unknown; per-item availability not built. Not staging or production verified. |
| F04 | Short enquiry | Implemented locally | Form to local Worker to D1: validated, replay-safe, offline retry tested in Edge at 390px. Closed in production builds. |
| F05 | Ordering steps | Implemented locally | Home page steps (wording pending approval). |
| F06 | Story and identity | Partially implemented | Draft story; logo and baker name pending. |
| F07, F08 | Care, pickup/delivery | Partially implemented | Cake care page and FAQ exist with draft wording; delivery area/fees, allergen and storage matrix pending the owner. |
| F13 | Serving guide | Implemented locally | Size guide with guest-count finder for one, two and three tiers. Serving figures are draft content until the owner confirms them. |
| F09 | Contact and Instagram | Partially implemented | Instagram only. |
| F10 | Owner content updates | Partially implemented | Prices tab (draft, publish, restore) is the owner editing path; flavour text, availability and per-item states are not editable yet. Not staging or production verified. |
| F11 | Gallery filters | Implemented locally | Crawlable /collections/ pages, no JS needed. |
| F12 | Gallery or external inspiration with up to 3 images | Implemented locally | Gallery reference plus private uploads: byte-level format sniffing, dimension/pixel bounds, metadata stripping, 3-image and daily caps, remove, orphan purge, atomic linking (54 tests; live Edge run at 390px with local R2/D1). Private owner viewing implemented locally (F19); provider R2 limits, retention and upload concurrency hardening unverified. |
| F15 | Decorating videos | Partially implemented | 3 silent clips; playback not machine-verified. |
| F17 | Shareable creation pages | Implemented locally | 19 pages; sitemap, canonical, Bakery and FAQ JSON-LD, 404 and a noindex thank-you page exist (production build only); output test checks unique titles and description lengths. |
| F18 | Customer feedback | Blocked (no permissioned reviews) | |
| F19 | Private enquiry list | Implemented locally | /admin screen (phone-first) over the authenticated API: filters, detail, private picture viewing, status history, manual Instagram orders. Verified in Edge at 390px with a local dev login that exercises the real token verifier. Not yet behind a real Cloudflare Access app. |
| F20 | New-enquiry alerts | Partially implemented | Bounded transport, immutable snapshot preparation, uncertainty reconciliation and due-event scheduling with isolated SQLite tests. Lease-aware sender composition implemented; integration tests committed, closed-by-default maintenance runtime composed; approved configuration, cron and cloud verification pending; no live delivery. |
| F21 | Busy dates | Implemented locally | Per-day toggle in the calendar tab; owner note only, no public availability. |
| F22 | Quote and order summary | Implemented locally | Versioned quotes (integer cents), agreed design and prep notes; every write is one conditional statement with optimistic versioning, idempotent replay and bounded bodies; concurrency races covered by fault-injection tests. |
| F23 | Deposit and balance records | Implemented locally | Append-only owner-recorded payments, void with reason, confirmation blocked until the agreed 50% deposit is recorded; balance due shown as 48 hours before pickup/delivery in Chicago time, with a rush message when past. No payment automation; the owner records a payment only after seeing it arrive by Zelle. |
| F24 | Confirmed-order calendar | Implemented locally | Month view of confirmed orders by stored Austin date/time (DST-safe, no conversion). |
| F14, F16, F25-F34 | Later phase | Intentionally deferred | |
| Erase customer data | Owner action | Implemented locally | Owner types the reference; names, contacts, request text, pictures and notes are removed, amounts and dates kept; refused while an order is confirmed; safe to repeat. Retention period and export/restore not decided or built. |
| Accessibility and performance gates | Quality | Implemented locally | axe-core WCAG A/AA scan on every public page and the owner views, keyboard-only and reduced-motion checks, layout at 320/390/430px, run on every pull request (Chrome in CI). Lab performance only: no first-party JavaScript on content pages, home LCP about 2 s on throttled emulation. No field data or screen-reader pass. |
