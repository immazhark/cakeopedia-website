# Enquiry behaviour and API boundary — proposed v1

The contract below remains the product target. A locally tested dependency-injected
core now implements the minimal email payload, bounded body/validation, D1 persistence
and replay. It is not connected to the closed public Worker entry point. No live
intake, inbox or notification dispatcher is implemented. See local-development.md.

## Customer form
Required: name and a supported contact route. Email is the proposed initial route; if owner chooses phone/Instagram instead, adapt validators and acknowledge on-screen without inventing an email address. Optional/unsure: event date, occasion, servings, general area, budget, flavours and notes. Selected website creation IDs prefill automatically. Up to three optional inspiration images may depict any reference design, not only Cakeopedia work. Include optional Additional comments; all images are inspiration, not exact-reproduction promises. Date is a local calendar date, not midnight UTC. Fulfilment times use America/Chicago later.

Keep contact values in form memory by default. Persist only non-sensitive choices locally with expiry and clear controls. No partial upload or owner visibility before explicit submit. A privacy notice explains submission; marketing permission is separate, optional and initially unnecessary. Validate without discarding valid fields. Disable repeated taps temporarily, but permit recovery after network failure.

## Proposed POST /api/enquiries
Payload: submissionId (random), name, contact {kind,value}, eventDate|null, dateUndecided, occasion|null, servings|null, notes|null, creationIds[], optional permitted fields, botToken. All fields receive length/type bounds. Contact kind restricted to configured options. No prices, claims or status accepted from the browser. Unknown creation IDs are rejected or explicitly dropped with recoverable feedback, never fetched as URLs.

Server: validate request/origin and bot token; apply rate limits; validate bounded plain-text strings; escape for the output context; enforce payload size; transactionally insert enquiry + references + notification intents; only then return success. Use parameterised SQL. A unique submissionId produces the original response on a retry rather than a duplicate record. If the same ID is reused with materially different payload, return a conflict. Expire deduplication records under a documented policy.

Success 201: received, reference, notificationStatus (pending rather than guaranteed delivered). Replay 200 returns same reference. Failure 400 invalid input, 409 conflicting submission, 413 payload too large, 429 throttled, 503 unavailable. Never return raw database/provider errors or echo private fields in logs. Cache-Control: no-store for private/API responses.

A reference is not an authorisation token. Public success URL must not reveal record data. No booking or availability guarantee is implied.

## Operational data
Enquiry: id, unique submission_id, public_reference, created_at, contact, requested local date, permitted notes, status, replied_at|null. Reference: enquiry_id, public_creation_id. Outbox: id, enquiry_id, recipient role, delivery status, attempt count, next_attempt_at, provider id|null, safe last_error_code. Settings: configured private notification destination and operational flags. Contact details encrypted in exports; access-controlled at rest using provider protections and threat review.

Target status: new → replied → quoted → confirmed or closed, with corrections allowed and timestamps. Existing booked status must be deliberately mapped/migrated if retained; do not pretend the new target states already exist in code. No automatic acceptance. Do not use CMS for private records.

## Notifications and outages
On receipt, show confirmation even if email is queued. Owner and customer messages are distinct and count separately. Use verified From domain and safe Reply-To; never spoof customer From. Use deterministic event keys for retry handling; provider support for idempotency must be verified. If send outcome is ambiguous, reconcile rather than blindly duplicate.

Retry transient failures and quotas with bounded backoff. Permanent address errors stop retrying and remain visible. Scheduled batches fit runtime CPU limits. Exhausted notifications do not delete enquiries. Alert owner through an agreed available route; do not promise an unimplemented second channel.

If persistence is definitively rejected, say not received. If the network outcome is ambiguous, say receipt could not be confirmed and offer a safe retry with the same submission ID. Keep in-memory values and the approved Instagram alternative. Do not claim a successful submission because email alone was sent.

## Upload option
Owner-approved launch scope: up to three optional inspiration images from any source. Activation remains off until private storage/security/cost gates pass; approval is not implementation. Then allow bounded JPEG/PNG/WebP references with actual-content validation and strict file/count/byte limits. HEIC requires an explicitly tested path or helpful instructions, not silent failure. Customer may submit without files. Use authenticated reads or short-lived scoped URLs, clean abandoned files, strip location metadata; no images in public CMS or logs.

## Required verification
Valid request; invalid email/contact; unknown references; duplicate click; replay after lost response; DB outage; email outage; quota exhaustion; unauthorised inbox/API access; oversized payload; bot failure; date boundary; optional fields absent; XSS strings rendered safely. Cloud dependencies mocked locally remain marked not cloud-verified.

## Replay, authentication and retention refinements

Turnstile tokens are single-use. Design a bounded replay path that returns only the
same minimal reference for a high-entropy submission ID and matching payload; changed
payload conflicts. Do not break safe retries by requiring an already consumed token.
New submissions still require server-verified hostname/action/token checks and limits.
Origin/CORS checks do not authenticate a caller. Test this boundary explicitly.

Use D1-supported transactional batch semantics for enquiry, references and outbox,
with constraints and concurrent-replay tests; do not assume interactive SQL transactions.
Claims/leases prevent concurrent dispatchers sending the same event unchecked.
Resend deduplication lasts 24 hours: reconcile ambiguous older sends, do not promise
permanent exactly-once delivery. Email acceptance is not inbox placement. Verify signed
provider events before changing delivery status. Prefer minimal owner email with private
inbox link rather than copying every customer detail into email.

Protect every admin API/export on every hostname; verify identity signature, issuer,
audience, expiry and exact operator allowlist. Private mutations require CSRF controls.
No-store on private responses. No customer record access from a public reference alone.
Owner status edits record timestamps and permit correction; no automatic acceptance.

Proposed unsuccessful-enquiry retention is 90 days after closure, not yet owner-approved.
Booked records need a separate schedule. Coordinate deletion with backups and restore.
Do not solicit medical history; dietary requests do not guarantee accommodation.
