# Site structure and content contract

## Routes
| Route | Purpose | Publishing dependency |
|---|---|---|
| / | Brand introduction and selected real work | Name, key images and approved claims |
| /creations | Browse all curated creations | Approved originals; descriptive captions |
| /creations/[slug] | One physical creation, multiple views | Stable ID, image permissions |
| /collections/[slug] | A meaningful collection | Sufficient distinct works, not duplicated thin pages |
| /menu | Current offerings and flavours | Owner-approved current facts |
| /story | Baker's personal story | Story and portrait consent |
| /enquire | Short custom request | Contact workflow and data notice |
| /enquiry-received | Acknowledge persisted request | No private data in URL; noindex |
| /faq | Lead time, care and process | Owner-approved answers |
| /privacy | Explain collection and retention | Actual implementation and owner review |
| /ordering-terms | Real ordering conditions | Do not imply website checkout exists |

## Public content types
Creation: immutable id; editable unique slug; title; caption; images with alt and focal points; optional video; occasion/style tags; collection references; portfolio status; original region (internal curation field only if suitable for public dataset); approval state held outside public content if confidential.

Public creation status is previous-work, not available-to-buy. MenuItem separately has id, title, description, current/seasonal/custom status, owner-approved options, optional approved pricing/servings, allergen wording and date windows. Use integer cents and USD only if price exists. Unknown is null, never zero/free.

Collection: title, slug, introduction, ordered creation IDs, optional accent token constrained to an accessible palette. SiteSettings: working display name, approved contact methods, featured IDs and public availability message. No arbitrary HTML or script editing.

Do not expose confidential approval notes in a public dataset. No customer names/addresses hidden in captions, alt text, filenames or raw image metadata. Published messages must not reveal her home address by default.

## Browsing behaviour
Use stable URLs. Back restores gallery position and filters. A creation's enquiry
button carries its immutable ID; the form permits removal. A shortlist is deferred
from release one unless separately justified. Retired references must not break the
form: offer removal and continue with notes. Permit up to three optional customer inspiration images from any source plus Additional comments, under the private upload contract. Never fetch arbitrary remote URLs.

## Content intake
Inventory originals before selecting layout crops. Group same-cake images. Keep Hyderabad/Austin work distinguishable internally; owner decides publication. Ask for originals rather than social downloads. Retain original names for traceability privately, generate neutral web names, strip geolocation. Do not infer flavour/servings/ingredients from appearances.
