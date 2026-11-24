# Prioritised backlog

Updated 24 November 2026. P0 means prerequisite/release-critical; P1 core product; P2 completion; P3 conditional/postlaunch. Priority does not grant authority. F01 assessment scope approval and F02 documentation content are addressed by this foundation; F04 and the local E01 proof are implemented (see progress.md); other runtime tasks remain pending. F03 private reporting setup remains pending. Track future active work through scoped issues/PRs, not assumed technical locks.

| Priority / ID | Task | Responsible | Dependencies | Acceptance | Gate |
|---|---|---|---|---|---|
| P0 / F01 | Approve exact initial documentation scope | Sponsor | Assessment review | 24-file scope explicit; no infrastructure permission inferred | Before first commit |
| P0 / F02 | Refresh public-safe canonical brief and agent rules | Implementer | F01 | Stale repo claims removed; no conflicting instruction copies | First commit |
| P0 / F03 | Verify reporting route and public-data exclusions | Implementer/sponsor | F01 | No secret/private files; reporting link not fabricated | First commit |
| P0 / B01 | Confirm business/menu regulatory facts | Owner/adviser | Recipe and operations list | Training/category/registration/labels/fulfilment resolved for offered items | Before live sales and claims |
| P0 / B02 | Approve public identity contact and claims | Owner | Questionnaire | Only approved name/contact/service/ingredient statements published | Before launch |
| P0 / E01 | Local persistence and replay contract proof | Implementer | F02 and scaffold | Batch rollback/concurrent replay/conflict/lost response tests pass | Before functional slice |
| P0 / E02 | Private inbox authentication proof | Implementer/sponsor | Provider permission | JWT/allowlist/expiry/alternate host/API denial verified | Before live intake |
| P0 / E03 | Cost/account register proof | Sponsor/implementer | Read access and provisioning authority | Actual plan/shared usage/card/overage recorded; no implicit upgrades | Before provider activation |
| P0 / E04 | Outbox and email failure recovery | Implementer | E01 | Lease retry/quota/permanent/ambiguous/24h dedup cases pass | Before live intake |
| P0 / E05 | Retention export and restore proof | Implementer/owner | Approved retention and destination | Encrypted independent export restored; deletion reapplied | Before live intake |
| P0 / R01 | Release authority and privacy/security gates | Sponsor/owner | All release-critical tests | No critical failure; facts approved; live switch explicit | Before launch |
| P1 / F04 | Runnable local Astro Worker scaffold | Implementer | F02 | Pinned supported tools; install/check/build succeed; no production binding | Local scaffold |
| P1 / D01 | Group and audit original assets | Owner/curator | Original files | Distinct creations/rights/focal crops/metadata assessed privately | Before final design |
| P1 / D02 | Compare three concepts | Designer/implementer | D01 or labelled wireframes | Same four works; phone/desktop/detail/form/motion compared | Before production UI |
| P1 / D03 | Select coherent Collection direction | Owner/sponsor | D02 | Recorded selection; alternatives not indiscriminately merged | Before production UI |
| P1 / C01 | Separate public creation/menu schemas | Implementer | F04 | IDs/slugs/captions/menu states/null prices/public-safe fields validate | Before slice |
| P1 / C02 | Sanity phone/permissions trial | Owner/implementer | Provider permission/sample assets | Owner upload/edit/publish observed; broad admin role accepted or fallback | Before independent editing promise |
| P1 / U01 | Gallery and creation detail | Implementer | D03/C01 | Filters/back/scroll/refs/keyboard work with real approved assets | Functional slice |
| P1 / U02 | Short enquiry and truthful acknowledgement | Implementer | E01/C01 | One contact; unsure options; no booking claim; ambiguous retry clear | Functional slice |
| P1 / U03 | Owner phone inbox/status workflow | Implementer/owner | E02/E04 | New/replied/booked/closed corrections and phone reply tested | Functional slice |
| P1 / E06 | Turnstile and bounded abuse controls | Implementer | F04 | Server verification and distributed bounds; expiry/replay recover | Before live intake |
| P1 / E07 | CMS publish/rebuild reliability | Implementer | C02 | Authenticated debounced build; failed build visible; old site retained | Before editing release |
| P2 / C03 | Approved menu story FAQ terms privacy | Owner/editor | B01/B02 | No placeholder claims; actual handling matches text | Before launch |
| P2 / D04 | Signature motion and responsive polish | Implementer | D03/U01 | First frame useful; reduced motion/focus/back parity | Before launch |
| P2 / Q01 | Technical SEO and schema checks | Implementer | Built routes/approved facts | HTML/status/canonical/sitemap/schema genuine; private address absent | Before launch |
| P2 / Q02 | Accessibility and device verification | Implementer/owner | Working slice | Manual keyboard/screen reader/zoom/device trials plus automated checks | Before launch |
| P2 / Q03 | Performance and quota measurement | Implementer | Working staging | Lab budgets and Worker CPU/query headroom measured; field unclaimed | Before launch |
| P2 / Q04 | Domain sender preview/production separation | Sponsor/implementer | Name/domain approval | DNS/HTTPS/sender verified; preview protected; production indexing explicit | Before launch |
| P3 / G01 | Eligible local profiles/community directory | Owner/sponsor | Actual operations/final domain | GBP eligibility/hide-address correct; organisers consent | After launch |
| P3 / G02 | Search and business-outcome maintenance | Owner/implementer | Production data | GSC/Bing verified; 7/30/90 checks; response/failure metrics private-safe | After launch |
| P3 / X01 | Private reference uploads | Owner/implementer | Demonstrated need + billing/privacy authority | Type/size/auth/retention/overage controls tested; optional to customer | Future feature |
| P3 / X02 | Seasonal preorder/checkout/capacity | Owner/implementer | B01 and approved commerce spec | Server prices/disclosures/payment events/booking reconciliation | Future feature |

Current evidence lives in [progress](progress.md); source references in [research evidence](research-evidence.md). All live sales, publication and provider activation remain gated by appropriate facts, tests and authority.
