# Cakeopedia Austin — shared context and decision record

Updated: 25 November 2026 (India time).
Audience: project sponsor, Claude Code and ChatGPT Work.
Purpose: one public-safe handover of the conversation's requirements and decisions. This is not a deployment report or permission to activate paid services.

## 1. How to use this record

Read this document alongside AGENTS.md, docs/handoff.md, docs/progress.md and docs/owner-brief.md. Verify the actual remote branch, HEAD, open PRs and working tree before editing. Do not repeat the full questionnaire or foundation research. Read individual specifications only for the task being implemented.

New owner decisions in this record supersede older contradictory product assumptions:
- Domain is purchased: cakeopedia.com, registrar Spaceship.
- Owner approved the 34-feature checklist as presented, retaining launch/later priorities.
- F12 must accept outside inspiration as well as Cakeopedia references.
- The enquiry form must support up to three optional inspiration images and an optional Additional comments field.

Approval of scope is not proof of implementation, final copy approval, certification, a cloud account, a payment integration or public-launch readiness.

## 2. Business and intended outcome

Cakeopedia is an existing home-baking business, originally in Hyderabad, India. The owner moved to Austin, Texas after marriage and continued the business as Cakeopedia Austin. Instagram is the existing order channel:
https://www.instagram.com/cakeopedia.austin/

The website should showcase genuine work, explain the actual menu and pricing, attract suitable local customers and reduce repetitive enquiry exchanges. It is the business's first website. It must feel premium, distinctive, elegant, modern and polished, with careful motion, transitions and strong mobile usability.

The sponsor wants excellent engineering and creative quality while keeping recurring costs as low as practical. A premium site does not require every growth feature at launch.

## 3. Confirmed identity and story

- Public brand name: Cakeopedia Austin. An earlier typed name contains a typo; the explicit Austin answer is authoritative.
- Primary domain: cakeopedia.com. Purchased by the sponsor through Spaceship.
- Refine the existing Instagram logo while preserving recognition; orange is the owner's requested colour continuity. Exact shade, artwork and typography remain design work.
- Tagline: "Custom baked goods" (final, 26 Nov 2026). The superseded "Halal baked goods" tagline is withdrawn from brand assets.
- Owner values the taste that brings customers back.
- Prioritise Austin vintage and floral creations in the portfolio.
- The Hyderabad-to-Austin journey may feature in the story.
- Story/name/process are welcome; no assumption of permission to show her face, kitchen, family or customers. Preferred public baker name still needs confirmation.

Public-safe story direction: homemade treats for family in Hyderabad; lockdown cake experiments and repeated recipe testing; cakes for friends, family and college occasions; requests for paid orders; continuing that passion in Austin.

Do not publish raw questionnaire responses or family medical details. The origin story does not establish allergy safety, preservative-free products or a health claim. Existing owner-brief.md contains a short provisional story draft; final wording approval remains pending. No unsupported superiority claims about other bakeries.

## 4. Menu, ingredients and operations

Owner wants standard-product prices, custom-cake starting prices and separately explained add-ons. Provide sizes, layers, owner-approved approximate servings, actual flavours/fillings and what is included.

The current menu is regular offerings only. Ramadan/Eid collections are future interests, not currently available seasonal products. Portfolio work is evidence of capability, not an automatically orderable catalogue.

The six-inch, four-layer $130 starting quote and approximately $160 customised example supplied in conversation are illustrative, not a complete approved price list and not a universal $30 customisation charge. Do not publish numerical menu prices until current inclusions and menu data are confirmed.

Owner reports using kosher-certified ingredients/products and avoiding products listing alcohol as an ingredient. No special dietary requests are accepted. Certification of ingredients does not establish certification of the kitchen, business or finished cakes. Do not add halal-certified, allergy-safe, gluten-free, vegan, healthy or preservative-free claims. Final public ingredient/allergen wording needs review.

Operating guidance:
- Approximately two weeks' advance notice.
- North Austin is the stated service area; exact delivery boundaries and fees remain open.
- Pickup is arranged personally; delivery is available at extra cost.
- Replies are usually the same or next day; publish only agreed wording.
- Capacity is limited. Do not publish internal weekly capacity or promise an automatically reserved slot.
- Zelle is the existing payment method. No automatic payment verification or checkout API is assumed.
- Terms confirmed 26 Nov 2026: 50% advance by Zelle confirms an order; remaining 50% due at least 48 h before pickup/delivery (America/Chicago); two weeks’ notice recommended; Cakeopedia cancels = full refund, customer cancels = no refund (legal review pending); no changes after confirmation; rescheduling at least 7 days ahead, owner approval. Accepted rush orders inside the window need owner-approved arrangements. Deposit/balance come from the owner-approved quotation.
- Keep the home address and payment identifiers out of Git, public CMS and public pages.

## 5. Customer journey and approved form

Recommended primary call to action: Request a cake / Enquire about a cake. Submission is an enquiry, not an order confirmation.

Journey:
Browse genuine work and menu → submit requirements → owner discusses design and availability → personalised quote → agree requirements and terms → deposit instructions → owner verifies deposit → owner confirms order.

Core form information:
- Customer name and contact details, with an agreed preferred reply route.
- Occasion, desired servings/size, flavour/filling and add-ons.
- Preferred fulfilment date and time; pickup/delivery preference where appropriate.
- Budget can be optional and framed helpfully; no forced assumptions.
- Allow Not sure where the owner can advise.
- Optional Cakeopedia creation reference carried from the gallery.
- Up to THREE optional inspiration images, including designs from outside Cakeopedia.
- Optional Additional comments field for colours, cake wording, design ideas or other details.
- Clear acknowledgement that availability, final design and price require personal agreement.

F12 is not restricted to the owner's work. Preserve both gallery-to-form references and customer-supplied inspiration. Images are guidance, not a promise of exact reproduction. Suggested copy:
“Share up to 3 pictures to help us understand your vision. We'll discuss what's possible and create our interpretation; the final design and price will be agreed with you.”

Upload engineering requirements: private storage; server-side count, byte-size and supported-image validation; safe image processing and metadata removal where supported; no arbitrary active content; no public bucket or unprotected reference URLs; authenticated owner access; bounded storage/abuse controls; cleanup of abandoned uploads; defined deletion/export/backup handling. Choose documented size/type limits during implementation and show them before upload. Preserve typed input on recoverable errors. Do not activate uploads without the operational/security checks.

No customer images, genuine enquiries or payment details in test fixtures, repository, logs, analytics or public editorial CMS.

## 6. Owner-approved feature catalogue

The sponsor reports: owner is happy with the PDF list as-is, with the F12 expansion and form comments above. Retain the proposed launch/later split; approval does not move every idea into the first release. Features require real content, operating details and release checks.

Feature IDs below are OWNER CHECKLIST IDs, not automatically the same as any older engineering-backlog IDs. Use the Fxx identifier with its title to avoid collisions.

| ID | Feature | Priority and scope |
|---|---|---|
| F01 | Real-work portfolio | Launch; genuine Austin creations, vintage/floral prominent |
| F02 | Cake sizes and prices | Launch; actual sizes, servings, layers and approved pricing |
| F03 | Flavours and add-ons | Launch; current menu and clear additional charges |
| F04 | Short cake enquiry | Launch; requirements, optional images and comments, then discussion |
| F05 | Clear order steps | Launch; no automatic booking or payment confirmation |
| F06 | Story and identity | Launch; recognisable orange refinement and Hyderabad-to-Austin story |
| F07 | Helpful information | Launch; notice, cake care, cutting, ingredients and dietary limitations |
| F08 | Pickup and delivery guide | Launch; general area and agreed fees/process, private home address |
| F09 | Easy contact and Instagram | Launch; contact details/channel still need selection |
| F10 | Simple updates | Launch; owner/team updates, phone-friendly editing target |
| F11 | Gallery filters | Launch; useful styles/occasions supported by actual content |
| F12 | Use/share inspiration | Launch; gallery reference OR any outside inspiration, up to three optional images |
| F13 | Visual serving guide | Launch; owner-approved portion counts and guidance |
| F14 | Flavour finder | Later; curated suggestions from the real menu |
| F15 | Decorating videos | Launch when genuine permission-cleared clips arrive; accessible controls |
| F16 | Save/compare favourites | Later; shortlisting without requiring an account |
| F17 | Share a cake page | Launch; individual creation URLs |
| F18 | Genuine customer feedback | Launch when approved feedback/permissions are available |
| F19 | Private enquiry list | Launch; new/replied/quoted/confirmed/closed, authorised access |
| F20 | New-enquiry alert | Launch; agreed channel, assess email first; no SMS cost assumption |
| F21 | Busy-date controls | Launch; manually maintained availability, enquiry still needs confirmation |
| F22 | Quote and order summary | Launch; agreed design, flavour, servings, price and fulfilment |
| F23 | Deposit/balance record | Launch; owner-verified payment records, no inferred Zelle receipt |
| F24 | Upcoming-order calendar | Launch; confirmed dates/preparation notes; enter Instagram orders too |
| F25 | Pickup/care reminders | Later; confirmed details and channel/cost review |
| F26 | Ramadan/Eid preorders | Later; only after a real collection, caps and windows are approved |
| F27 | Waiting list | Later; contact request, no reservation promise |
| F28 | Email news/launches | Later; separate opt-in and list upkeep |
| F29 | Rough price estimator | Later; owner-defined rules, indicative only |
| F30 | Online payment/checkout | Later; approved products/quotes, fees and operational review |
| F31 | Gift cards/vouchers | Later; redemption/refund terms and tracking |
| F32 | Repeat-order request | Later; reconfirm design, current price and availability |
| F33 | Referral/offer codes | Later; explicit rules and margin/brand suitability |
| F34 | Wedding/larger-event route | Later; only if owner wants/can support this work |

AI cake mockups, 3D builders, mandatory customer accounts, live chat and instant booking remain deferred. Accessibility, security, mobile usability, technical SEO and performance are baseline responsibilities, not optional paid extras.

The original PDF is the selection baseline. This record is the text amendment for F12, the comments field and subsequent domain facts; do not treat the PDF's old narrow F12 wording as controlling.

## 7. Creative direction and architecture

Three original directions were explored:
1. Cakeopedia Collection: editorial, curated range; recommended creative lead.
2. Celebration Cabinet: occasion-led discovery.
3. The Baker's Table: personal craft/story-led presentation.

Collection remains a recommendation, not a recorded final owner selection. Existing coded concepts are development previews, not approved final designs. Compare using genuine photos before locking production design. Use orange thoughtfully with a refined supporting palette; no final palette/font selection is recorded.

Premium execution: strong art direction and typography, deliberate photo sequencing, useful detail views, restrained responsive motion, fast mobile navigation, visible enquiry actions and clear prices. No generated cakes represented as real products, forced intros, scroll hijacking, essential hover interaction or animation blocking access. Respect reduced-motion preferences and provide accessible video controls.

Existing technical direction:
- Astro + TypeScript static-first public pages.
- Narrow Cloudflare Worker APIs.
- D1 for private enquiries and durable outbox.
- Turnstile plus application abuse limits before public intake.
- Resend as proposed notification adapter, subject to account/domain/quota checks.
- Sanity as conditional public editorial CMS; no private enquiries/customer data in it.
- Cloudflare Access or a proven equivalent as conditional owner authentication.
- Private R2 storage is now a candidate for approved inspiration uploads; evaluate quotas, cost exposure and secure access before activation.

Preserve the repository's current architecture unless evidence requires a scoped change. Do not add a full ecommerce platform, subscriptions or extra services merely to sound enterprise-grade.

## 8. Domain, cost and authorisation

Confirmed purchased domain: cakeopedia.com.
Registrar: Spaceship.
Public brand remains Cakeopedia Austin.

Proposed, not verified/provisioned: retain Spaceship as registrar; Cloudflare Free DNS and suitable free-tier hosting. No registrar transfer is needed for that approach. Do not assume nameservers, DNS records, email, hosting, SSL, redirects or canonical URLs are configured.

[Superseded 2026-11-27] Email: public contact@cakeopedia.com forwards (Cloudflare Email Routing) to the business mailbox cakeopedia.austin@gmail.com; automated mail is sent by Resend from contact@cakeopedia.com; no Gmail Send-As; the owner's personal Gmail is not used for operations. Preserve existing DNS/email records before any nameserver change.

Free-first throughout. Verify commercial permissions and actual account limits; free tiers are not unlimited or guaranteed forever. No paid APIs, paid trials, SMS subscriptions, card checkout fees or new spend without explicit approval. Reuse existing capable tools; avoid repetitive environment/tooling optimisation. Sponsor manages purchases/accounts.

The sponsor granted ChatGPT sole repository ownership and authorised publishing the required files on 25 November 2026. No other writer is currently active. Repository implementation authority covers repository development; it does not establish authority or readiness for cloud provisioning, DNS changes, public launch, real customer intake or sending messages.

## 9. SEO, accessibility, content and release gates

Build in: semantic server-rendered HTML, meaningful page titles/descriptions, canonical domain configuration when deployment is real, sitemap/robots, internal links, readable image alt text, accessible forms/errors, keyboard focus and reduced-motion support. Use responsive optimised images, reserved dimensions and minimal JavaScript; measure actual builds rather than inventing scores.

Local discovery: accurate North Austin/service information, genuine customer feedback and approved creation pages. Google Business Profile eligibility/address handling must be checked against actual customer-facing operations before creation. Do not expose the home address to fill structured-data fields or build thin location pages.

Structured data must reflect visible approved facts. No invented ratings, certification or availability. AI-search discoverability means clear crawlable factual content, not guaranteed rankings or a speculative paid tool.

Texas cottage-food rules require current official-source review against actual recipes, temperature control, ingredients, sales/delivery process, training/registration/label obligations as applicable. This handover does not assert legal compliance. Resolve required owner evidence before offering regulated sales/payment flows or publishing certification/health claims.

Before real intake: proven auth, server validation, bot/abuse controls, durable storage/outbox recovery, upload privacy/limits, notifications, retention, export/restore, accurate contact and approved customer-facing policies. Do not treat the proposed 90-day unsuccessful-enquiry retention as owner-approved; the Cakeopedia owner has not selected it. Do not import The Wedding Nest's policy.

## 10. Implementation evidence and current limitations

Repository: https://github.com/immazhark/cakeopedia-website
Last known development branch: feat/local-application-foundation; PR #1 historically open. Recheck actual state.

On this task, the remote docs/handoff.md on that branch was fetched and matched the local record. The full repository, PR status, cloud resources and all tests have NOT been re-audited in this documentation task.

Existing handoff reports local Astro/strict TypeScript tooling, a closed Worker, bounded validation, parameterised transactional enquiry/outbox persistence, replay/conflict handling and notification lease/retry logic; 20 static concept pages; 18 synthetic API/D1 tests plus two built-output tests previously passing. These are prior local/build results, not fresh tests, live-provider evidence or owner visual approval.

Private inbox/auth, live sender/scheduler, public abuse controls, retention/export/restore, genuine media, final menu and provider setup still have recorded holds. Browser-rendered review was previously blocked and remains unproven unless later repository evidence supersedes it. Never claim the website or uploads are live from this document.

Original seven model reviews and all 18 video recommendations are not fully reproduced in the visible conversation; earlier foundation documents report synthesis from supplied packs. Do not invent individual recommendations or claim independent verification of unavailable originals.

## 11. Remaining owner/sponsor inputs — ask only these

1. Current menu: sizes/layers/servings, flavours/fillings, standard/custom starting prices and add-ons/inclusions.
2. Public baker name; preferred website reply channel/contact; new-enquiry alert destination.
3. Fulfilment terms (delivery area and charges); final policy wording and legal review.
4. Public service/delivery boundaries, fees and pickup wording; keep precise home pickup details private.
5. Original logo, permission-cleared Austin photos/videos and approved customer feedback; no automatic right to republish third-party images publicly.
6. Final design/concept and public copy review.
7. Required food-operation/training/recipe/label evidence and retention choice before live intake.

Do not re-ask brand name, orange continuity, Austin portfolio focus, feature-list acceptance or whether outside inspiration pictures are allowed: these are answered.

## 12. Next development milestones

1. Reconcile remote HEAD/PR and current docs; integrate this decision record into the normal startup/handoff path. Update affected ADR08 and upload assumptions: checkout stays deferred, inspiration uploads are approved scope but not yet enabled.
2. Implement the approved menu/enquiry content model with explicit pending fields; no fabricated products/prices.
3. Design and verify the private three-image upload lifecycle alongside the form and Additional comments. Keep public intake closed pending release gates.
4. Build the curated gallery, filters, detail/share pages and inspiration handoff; use genuine assets when supplied.
5. Implement private enquiry/quote/payment-record/calendar/availability operations and recoverable notifications in focused increments.
6. Add the approved content and brand artwork; complete rendered mobile/keyboard/reduced-motion testing, technical SEO and actual performance checks.
7. Review provider costs/quotas and concrete DNS/email/deployment changes separately, then activate only within explicit authority and launch gates.

For each implementation handoff: record actual branch/HEAD, changed paths, tests run, limits/holds and next precise action. One primary writer per task; preserve other contributors' work. Do not reinstall tool stacks or regenerate the entire programme on every session.


## Core business requirements freeze — 26 November 2026
Closed; do not re-ask. Single source of truth in code: `src/data/pricing.ts` (rules) and `src/data/business.ts` (catalogue).
- Single-tier starting prices 6/7/8/9/10 in: $135/$145/$170/$210/$250. Rasmalai surcharge $15/$20/$30/$35/$35 (starts $150/$165/$200/$245/$285). Two- and three-tier Rasmalai: personalised quote, never extrapolated.
- Brownies: box of nine $35 (+$10 topping = $45); Fudge Delight slab $40 (+$10 = $50), serves about 9–12. The $10 is per box or slab, not per brownie or topping. Toppings: Nutella, Lotus Biscoff, chocolate ganache. Unusual quantities or combinations need owner review. No cupcake topping or filling charges.
- Celebration Cake: $75, 6 in, 2 layers, 8–10 servings, round or heart, six dedicated flavours, no fondant, no custom-cake minimum.
- Business email contact@cakeopedia.com approved; provisioning is an infrastructure task, so it is not published yet.
- Enquiry-first remains: no checkout or automated payment. Commercial launch gate unchanged.
Cupcakes (owner, supplied via sponsor 27 Nov 2026; no earlier written record in docs/): $80 per dozen, minimum one dozen, all in the same flavour, no topping or filling charges. Modelled as `cupcakeDozenCents` (catalogue, owner Prices tab), `cupcakePrice` (pricing.ts).
Still open (not core): delivery area and charges, allergen/storage matrix, cottage-food compliance, policy legal review, logo production, media reconciliation.

## Owner decisions, 26 November 2026
- Retention: closed enquiries are kept until the owner erases them; no automatic period (the retention job exists but stays off).
- Customer email: no automatic email to the customer at intake (unverified address); only the owner is notified. Any customer email will be owner-triggered.
- AI crawlers: allow search and AI-retrieval crawlers, refuse model-training crawlers.
