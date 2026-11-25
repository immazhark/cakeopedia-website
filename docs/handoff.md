# Current handoff

Date: 25 November 2026. Task: master build directive; active writer Claude Code.
Branch: feat/cakeopedia-collection-slice (from origin/feat/local-application-foundation, which already contains main). PR #1 still open and unmerged; read the actual HEAD from Git.

Done (cumulative): palette tokens + contrast tests; media pipeline; home, gallery, /collections/ pages, 19 creation pages,
story, privacy draft, enquiry-received; enquiry form (open in dev or PUBLIC_ENQUIRY_FORM=on; closed in default builds) wired to
worker/local.ts (local-only entry; index.ts stays closed) with contract extended for phone/Instagram contact, fulfilment,
add-ons, budget cents and privacy acknowledgement; env-aware robots/meta/_headers (PUBLIC_SITE_ENV=production); concept routes
dropped from production output; npm run check:media release gate; docs/feature-map.md.

Checks run: npm run verify (42 Worker/contract/slug tests, 5 built-output tests); live wrangler dev + local D1: 201 then 200 replay
with the same reference, 403 wrong origin; Playwright-core on installed Edge: no horizontal overflow or broken images at 320, 360, 375,
390, 414, 430, 768 and 1280 on six pages; form journey (blank errors, bad phone, success redirect, offline then safe retry) at 390px.
Not done: iOS Safari/Android, screen reader, video playback proof, Core Web Vitals, upload lifecycle.

Holds: media delivery path and permissions (names, kitchen, locations); menu/prices/contact; enquiry form (closed);
inbox/auth/uploads/notifications; provider accounts; DNS/hosting. No provider, purchase or deployment change was made.

Next: (1) owner answers in media-plan.md; (2) menu data model and enquiry UI with the three-image lifecycle behind the closed
intake; (3) private inbox; (4) a real-browser pass at 390px with keyboard and reduced motion.
