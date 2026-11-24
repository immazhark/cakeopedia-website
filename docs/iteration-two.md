# Iteration two — creative comparison and outbox recovery

24 November 2026. These changes extend PR #1, not a deployment or an approved design.

## Open locally

Run `npm ci` and `npm run dev`, then open http://127.0.0.1:4321/concepts/.
Compare Collection, Celebration Cabinet and The Baker's Table at the same screen width.
Each has the same four labelled content slots, detail routes, back links, story placement
and disabled enquiry entry. Detail links carry only a public synthetic creation ID;
unknown query values are ignored. No contact values are collected or retained.

| Direction | Layout choice | Main tradeoff to assess with real media |
|---|---|---|
| Collection | Warm editorial frame; staggered two-column collection; expressive serif | Strong portfolio range, but may feel too formal without the baker's voice |
| Celebration Cabinet | Berry/cream palette; rounded opening frame; compact coloured panels | More playful; colour competition and small-screen density need visual inspection |
| Baker's Table | Sage/cream palette; image-first opening; personal story; even grid | Warmer maker emphasis; needs coherent authentic process/detail photography |

Collection remains the provisional recommendation, not a selected/final design. Real
photography, owner responses and rendered inspection can change it. No numerical score
is invented before those inputs exist. CSS includes responsive layouts, focus styles,
normal document navigation and a reduced-motion fallback; code presence is not proof
of a manual accessibility/device pass. No final menu or certifications are published.

The browser rejected local-file preview navigation because its URL policy permits
HTTP/HTTPS only. No alternate browser surface or protocol bypass was attempted.
Rendered desktop/mobile inspection, keyboard journey, reduced-motion behaviour,
contrast measurements and screenshots remain pending in an authorised preview setup.

## Outbox proof

0002 adds lease token/expiry, first-attempt time, provider ID and a safe error code.
An atomic conditional UPDATE claims one event. Completion is fenced by token and lease
expiry so a stalled dispatcher cannot overwrite a newer result. Crash recovery uses the
same deterministic provider key. Transient/ambiguous outcomes use bounded exponential
backoff; quota delay is respected. Permanent rejection stops. Exhausted/older ambiguity
requires reconciliation, without removing the enquiry. The test sender has no network.

Resend's documented deduplication window is 24 hours. The local policy stops automatic
attempts at 23 hours to leave transport/clock margin. This does not promise exactly-once
email or prove inbox delivery. Before a real adapter is enabled, freeze the complete
message/envelope per event, enforce a short send timeout, verify sender/domain and
account quota, protect the scheduler, add reconciliation/operator visibility and prove
primary-consistent D1 operations. Provider acceptance uses database state `sent` but is
not a delivery receipt. Webhook verification and delivered/bounced status are future work.

Source rechecked: https://resend.com/docs/dashboard/emails/idempotency-keys
and https://resend.com/docs/api-reference/introduction .

## Actual checks

- `npm run verify`: strict Astro/Worker checks, 18 emulator/API tests, static build,
  two built-output tests including all three disabled enquiry paths.
- `npm run db:local`: 0002 migration applied to local D1 emulation.
- `git diff --check`: source whitespace review.

No cloud resource, real notification, account, billing or live customer flow is enabled.
Remote CI and file comparison are checked separately after publication.
