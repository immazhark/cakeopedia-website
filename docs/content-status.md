# Content status and approval holds

Updated 25 November 2026. This is a public-safe register, not private approval evidence.
No original media, raw questionnaire responses or full current menu are stored here.
See [owner-informed brief](owner-brief.md) for a public-safe synthesis.

| Item | State | Effect |
|---|---|---|
| Austin business / Hyderabad origin | Owner story received; concise draft prepared | Use Hyderabad origin and Austin continuation; final wording review pending. |
| Brand spelling, logo, tagline | Cakeopedia Austin confirmed; recognisable logo refinement retaining orange | Exact logo/shade/tagline pending; no invented final identity. |
| Genuine photographs/videos | Originals and rights review pending | No screenshot crops or generated cakes as production evidence. |
| Current menu/flavours/prices/servings | Pricing presentation and regular-offerings policy supplied; actual menu pending | Quote examples are not a universal price list. |
| Lead time, availability, service area/pickup/delivery | Approximate guidance supplied | Two weeks, North Austin, pickup/paid delivery; precise wording/fees pending. |
| Public contact and reply workflow | Contact selection/public details still unclear | No invented email/phone or DM-sync claim. |
| Ingredient/allergen/certification claims | Evidence and wording pending | Ingredient certification is not finished-product/kitchen certification. |
| Food classification/training/registration/labels | Owner/qualified review pending | Gate live sales and relevant claims; no compliance certification by AI. |
| Privacy/retention/admin access | Owner approval and engineering proof pending | Gate real enquiry intake. |
| Testimonials/customer likeness/names | Publication permission pending | No fabricated social proof or private identifiers. |

## Private asset inventory structure

Maintain originals and permission records outside this public repository. Suggested
fields: internal asset ID, creation group, region, source/rights record, resolution,
orientation, focal crop, suitability and publication clearance. Public derivatives use
neutral names, accurate alt and stripped location metadata. A target of 12–20 distinct
strong creations is curation guidance, not a claimed received inventory or minimum.

No private release forms, customer names, source filenames, addresses, certificates or
account recovery details belong here. Record only approved public facts/date when supplied.

## Subsequent decisions — 25 November 2026

See [shared context and decisions](shared-context-and-decisions.md): cakeopedia.com purchased at Spaceship; owner approved all 34 checklist items with their launch/later priorities. F12 accepts any inspiration, with up to three optional image attachments and optional Additional comments. Exact contact/menu/fees/policies remain pending; scope approval does not activate intake or services.


## Owner-approved palette — 25 November 2026

Six exact base colours, selected by the owner (reference image reviewed): sage #91AE8F, butter orange #FFB64F,
vanilla cream #FFF9F0, warm beige #F3E5D5, chocolate brown #665447, white #FFFFFF. Tokens live in
`src/styles/tokens.css`; derived darker tones (`ink-deep`, `sage-deep`, `butter-deep`, border/error/success/disabled)
are named separately. White on sage (2.43:1), chocolate on sage (2.96:1) and chocolate on butter (4.12:1) fail for
normal text, so sage and butter are used for surfaces, shapes and accents, while text uses chocolate or deep ink on
cream/beige and white on deep sage buttons. `tests/contrast.test.ts` enforces the exact bases and the used pairs.
