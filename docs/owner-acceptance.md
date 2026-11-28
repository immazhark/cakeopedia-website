# Owner acceptance pack (27 Nov 2026)

Purpose: one place for the owner to review the staged site, see what is already decided (so nothing is asked twice) and give the few decisions still open. Staging: https://cakeopedia-staging.mazharkhan-it.workers.dev (behind Cloudflare Access; sign in with an authorised operator email). Status of everything below: staging-verified, NOT owner-accepted, NOT production.

## 1. Please review (about 15 minutes, on your phone and a computer)
| Page | What to look at |
|---|---|
| Home `/` | hero photo and wording, the four style tiles, how ordering works |
| Creations `/creations/` and each Collection | the lead cake, filters, every photo is genuine previous work, titles and descriptions |
| Menu `/menu/` | every price and flavour against your menus (custom from $135, 6-10 inch prices, Rasmalai extras, Celebration Cakes $75, cupcakes $80 per dozen, brownies and toppings) |
| Size guide `/size-guide/`, Cake care `/cake-care/`, FAQ `/faq/` | wording is accurate and nothing is promised that you do not offer |
| Story `/story/` | the draft story and photo (a name and portrait are added only if you choose) |
| Enquiry `/enquiry/` (open on staging only) | the form is short and clear; picture upload; the privacy tick; what the thank-you page says |
| Owner area `/admin/` | enquiries, quotes, payments, calendar and prices on your phone: can you do your daily jobs without help? |

## 2. Already decided: not asked again
Brand and tagline (Cakeopedia Austin, "Custom baked goods"); orange identity and the six-colour palette; no personal photo of the owner; Hyderabad as origin story and Austin as current; all 34 features and their launch/later split; prices and sizes above; Zelle verified manually by the owner; 50% deposit confirms the order and the balance is due at least 48 hours before pickup or delivery; about two weeks' notice recommended; reschedule at least seven days ahead, subject to approval; North Austin service area, delivery by location and generally weekends, pickup generally 10 AM-5 PM; replies the same or next weekday; closed enquiries kept until the owner erases them (automatic deletion off); NO automatic customer email at enquiry (the owner is alerted instead); optional inspiration pictures (up to three, any source) with optional comments; search and AI-retrieval crawlers allowed, AI-training crawlers refused; contact@cakeopedia.com (forwarded to the operations mailbox) and Instagram as public contact; Backblaze B2 for encrypted backups.

## 3. Decisions still needed from the owner (none blocks review)
1. **Cupcakes:** is "same flavour" per dozen, or one flavour for the whole order? (the site currently says "per dozen")
2. **Cupcake fillings:** are caramel and chocolate ganache one filling or two?
3. **Photos:** may any of the five held vintage/floral photos be published (needs per-customer permission or a crop/blur)? A logo image when one is final.
4. **Delivery detail:** ZIP codes served, delivery charges, pickup days, weekend availability.
5. **Texas cottage food** (verified against the DSHS page 27 Nov 2026; see `compliance-texas-cottage-food.md`): is any menu item a "time/temperature control" food (for example cream or custard fillings, Rasmalai)? That requires DSHS registration and extra labelling. Has the operator completed the food handler course? Labels: home address or a DSHS registration number? The site must post the label information before payment is taken.
6. **Privacy and policies:** approve or edit the draft wording (retention, deletion promise and response time, backup retention up to about 70 days, providers named) in `privacy-backup-wording.md`, and the cancellation terms, with legal review. Nothing legal is published until you approve it.
7. **Menu currency:** your menus are dated Jun-Aug 2024; confirm each item is currently offered.
8. **Backups:** choose the free heartbeat monitor if wanted (the erasure list needed for restores is now automatic).

## 4. Authorisations only the owner can give (in this order, each separately)
1. Production setup: secrets, database migrations 0001-0021, Worker deploy (closed) and smoke checks (`production-release-checklist.md`).
2. DNS cutover: replace the placeholder root records (currently answering HTTP 522) and attach the domain; HTTPS/HSTS settings.
3. First production backup, restore drill, then the scheduled backup task (`backup-operations.md`).
4. Launch: open the enquiry form and public intake, owner notifications on, one live end-to-end enquiry.
5. Search consoles: add Google Search Console and Bing Webmaster Tools via a DNS record on your Cloudflare account and submit the sitemap.

## 5. What has been verified (and what has not)
Staging-verified: public pages (320-1280 px), keyboard, reduced motion and axe accessibility checks (automated, 0 violations), enquiry to owner end to end with a real Turnstile, private picture storage and viewing, owner alert email (SPF, DKIM, DMARC pass), quotes/deposits/confirmation, catalogue publish and rollback, media delivery including video playback ranges, encrypted backup and restore drill, closed-by-default gates. NOT verified: real-device testing (iPhone/Android), screen-reader testing, field performance (lab LCP about 1-2 s on emulated 4G), production anything, a real customer's first enquiry.
