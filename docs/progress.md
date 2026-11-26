# Project progress

Updated 24 November 2026. This file records the local foundation milestone; verify the
actual Git HEAD rather than treating its text as an immutable live deployment record.

| Milestone | State | Evidence / limitation |
|---|---|---|
| Foundation research | Completed outside Git; condensed into current specs | Both source ZIPs reviewed; original seven reviews/videos not independently available. |
| Documentation foundation | This change contains the 24 approved files | Relative-link/YAML/ignore/public-safety checks recorded in handoff. |
| Application scaffold | Local implementation | Astro/strict TS, closed Worker, pinned lockfile, local commands and verification workflow. |
| Enquiry persistence/replay | Local proof implemented | 11 synthetic tests use D1 emulator, including concurrent replay and rollback. Cloud consistency remains unverified. |
| Outbox recovery | Local proof implemented | Atomic leases, fenced completion, bounded retries and reconciliation hold; seven new emulator tests. No live sender/scheduler. |
| Private inbox/auth/retention | Not implemented | Provider and operator proofs remain pending. |
| Creative concepts | 20-page local static build | Three labelled directions, detail/enquiry previews. Rendered inspection, genuine media and selection pending. |
| CMS/auth/provider resources | Not verified or provisioned by this change | Terms/quotas/phone and security trial required. |
| Domain/public launch | Not established by repo evidence | Separate authorisation and release gates. |

## Next scoped work

F04 and the local E01 proof are implemented; see [local development](local-development.md).
No live intake is exposed. D02 labelled concept code is implemented; rendered comparison remains pending;
E02/E04 auth/outbox proof can proceed independently. Provider activation and release
remain gated. No cloud/email/field Web Vitals or visual approval is claimed.

Iteration-two details and local review instructions: [iteration two](iteration-two.md).

Partial owner responses received 25 November: see [owner-informed brief](owner-brief.md).
Brand name and preferences are confirmed; menu/media/contact/policies still have specific holds.

## Decision reconciliation — 25 November 2026

Shared context is consolidated in [shared decisions](shared-context-and-decisions.md); the owner has approved the 34-feature checklist retaining launch/later priorities and expanded F12 to any inspiration with up to three optional images and Additional comments. Domain purchase confirmed: cakeopedia.com through Spaceship. This documentation change does not implement uploads or establish DNS/hosting/email. Existing runtime milestones are unchanged.

| Public site slice | Local candidate | Home, gallery, 19 creation pages, story, closed enquiry; verify passes; not visually signed off. |

## State at 26 November 2026 (local and CI only; nothing staging or production verified)

| Area | State | Evidence / limitation |
|---|---|---|
| Financial integrity | Implemented locally | Each quote, payment, void and confirmation is one conditional SQL statement with optimistic versions, full-payload idempotent replay and bounded bodies. Fault-injection race tests fail on the old code and pass now. D1 emulator only; real D1 behaviour unverified. |
| Private pictures | Implemented locally | Upload sessions (Turnstile token on first upload), ready-state, tombstone and lease cleanup, atomic attach guard, owner erasure. Real Turnstile secret and R2 unverified. |
| Catalogue and CMS | Implemented locally | Owner Prices tab to public menu and FAQ through an approved snapshot; versions and restore. Per-item availability and cupcakes not built. |
| Public design | Local candidate | Squared hero frame, banded two-column menu, FAQ, care; reviewed in Edge at desktop and 390px by the developer. Owner has not reviewed. |
| Accessibility, performance, SEO | Lab checks in CI | See feature map. No field data, no screen-reader pass. |
| CI | Two jobs green | `verify` (type check, 193 tests, build, 10 built-output tests) and `browser` (100 real-browser checks in Chrome). |
| Operations | Runbook drafted | [Operations runbook](operations-runbook.md). Provider verification blocked: Wrangler is not logged in, so Access, Turnstile, D1, R2 and Resend are unverified. No production Wrangler config, external backup, monitoring or retention job yet. |
| Launch gate | Closed | Worker closed unless every live setting is present; form closed in production builds. No live intake, payments or customer communication. |

Owner decisions made 26 November 2026: keep closed enquiries until the owner erases them (automatic retention stays off); no automatic customer email at intake; AI crawler policy confirmed (allow search and AI-retrieval, refuse training). Owner decisions still needed: cupcake price and minimum, delivery area and fees, allergen and storage matrix, final policy wording and legal review, logo, media permissions, business email provisioning, review of the new hero.

