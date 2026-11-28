# Cakeopedia design language

Source of truth for visual decisions. Directive: docs/directives/MASTER-DESIGN-ENGINEERING-DIRECTIVE.md. Palette and fonts are owner-approved (docs/content-status.md); direction is Collection (docs/creative-brief.md). Tokens live in src/styles/global.css; change values there, not here.

- Direction: elegant, polished, premium home bakery; orange retained from the logo; vintage and floral Austin work leads.
- Type: Fraunces (display), Figtree (body), self-hosted via Fontsource. Prices and quantities use tabular numbers.
- Imagery: only genuine, permission-cleared work. No generated cakes, no screenshot crops as final imagery.
- Motion: first useful frame immediate; no intro, scroll hijack or hover-only function; reduced motion keeps full function; CSS first, no animation library by default.
- Mobile: 44px+ targets, safe-area insets, native scroll, pinch-zoom allowed.
- Rejected for now: GSAP/Lenis/Motion (no choreography justifies the bundle cost), glass/glow effects, extra card grids.

## Logo (supplied by the owner, 28 Nov 2026)
Gold chef hat, green script wordmark, gold ring and sparkles, tagline "Custom baked goods". Source file is the owner's PNG; derivatives live in public/brand/ (hat.png transparent mark, badge-480.webp round badge, icon-64.png, apple-touch-icon.png). Use: the hat mark beside the Fraunces wordmark in the header (hidden at 320px so the Enquire button stays clear); the full round badge in the footer on the dark brown; the hat as favicon and touch icon. Do not set the script wordmark small, it stops being legible below roughly 120px. The logo's green and gold match the site's sage and butter tokens. Owner approval of the final logo is still to be confirmed (the supplied file is a candidate: it looks AI-generated, so check trademark and reproduction rights before launch).
