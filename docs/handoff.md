# Current handoff

Date: 25 November 2026. Task: master build directive; active writer Claude Code.
Branch: feat/cakeopedia-collection-slice (from origin/feat/local-application-foundation, which already contains main). PR #1 still open and unmerged; read the actual HEAD from Git.

Done: palette recorded (tokens, content-status, brief, ADR-014); 41-file media batch inventoried (docs/media-plan.md);
`npm run media` builds git-ignored derivatives; real home (hero clip with pause, featured row, occasion chips, process
film, story, ordering steps), filterable creations gallery, 19 creation detail pages, story and closed-enquiry pages.
The earlier concept pages remain under /concepts/ (internal, unlinked) and the Worker/D1 code is untouched and still disconnected.

Checks run: `npm run verify` (strict types, 40 Worker/contrast tests, build, 4 built-output tests); headless Edge
screenshots of home, gallery and detail at desktop width. Limits: no real-device or 390px-viewport check (headless
Edge enforces a wider minimum window; the Chrome extension was not connected), no screen-reader, keyboard walk-through,
video playback or field-performance test. Media derivatives are not in Git.

Holds: media delivery path and permissions (names, kitchen, locations); menu/prices/contact; enquiry form (closed);
inbox/auth/uploads/notifications; provider accounts; DNS/hosting. No provider, purchase or deployment change was made.

Next: (1) owner answers in media-plan.md; (2) menu data model and enquiry UI with the three-image lifecycle behind the closed
intake; (3) private inbox; (4) a real-browser pass at 390px with keyboard and reduced motion.
