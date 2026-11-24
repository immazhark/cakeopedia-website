# Local application foundation

Use Node 24.22.3 (recorded in `.node-version`). Exact direct versions and the npm lockfile
are committed. Astro 7.4.13 requires Node >=22.23.4; the selected Node 24 release satisfies
that. TypeScript 6.0.3 meets @astrojs/check 0.9.12's declared ^5 || ^6 peer range;
latest TypeScript 7 was deliberately not selected. Versions were checked against npm
package metadata on 24 November 2026. `npm ci` is the reproducible installation path.

## Commands

| Command | Result |
|---|---|
| `npm ci` | Install locked packages; no provider accounts/credentials needed |
| `npm run dev` | Static Astro preview at 127.0.0.1:4321 |
| `npm run dev:api` | Closed Worker on Wrangler's local development port |
| `npm run db:local` | Apply migrations to local D1 emulation only |
| `npm run check` | Astro diagnostics and strict Worker/test TypeScript |
| `npm test` | 11 synthetic D1 emulator/API tests; no real email/customer data |
| `npm run build` | Static HTML and local preview safeguards in dist/ |
| `npm run verify` | Type checks, API tests, build and built-output safety test |

The committed Wrangler configuration has a zero UUID placeholder, no account ID,
no routes, workers.dev disabled and preview URLs disabled. Always retain `--local`
for these database commands. No production resource exists by implication. Do not
run `wrangler deploy` or replace IDs without matching authority and provider gates.
Wrangler may print its own proxy warning in this execution environment.

## Boundaries and evidence

The public page is an intentionally labelled, non-indexable shell using system fonts
and no client JavaScript, photography substitutes, menu claims or structured data.
It is not the final Collection concept. robots.txt/_headers are supplementary controls;
noindex is not access control. Future shared previews require access protection.

`worker/enquiries.ts` is a dependency-injected API core; `worker/index.ts` does NOT
expose it. Every intake/private route returns 503; /health describes the disabled state.
Bot verification and request limiting are injected test adapters, not production controls.
No email is sent: two durable notification intents are queued per synthetic submission.
The outbox sender/leases/reconciliation, private inbox, owner workflow and retention are
future tasks. No secrets or environment file are required for this milestone.

Tests use Miniflare 4.20260730.0 and its real local D1 API. Wrangler 4.167.0 has its own
newer transitive emulator; local migration was tested through that CLI too. Neither is
proof of production Cloudflare consistency, quotas or delivery. Before wiring intake,
make D1 primary/session read consistency explicit and test deployed request races.

The schema is additive and transactional batches use parameterised statements. Removing
local state is destructive to local data; use only synthetic data and never import real
customer records here. No production rollback, backup or retention procedure is claimed.

## Verification recorded on 24 November 2026

`npm run verify`: type checks, 11 enquiry tests, static build and 1 built-output test.
`npm run db:local`: 0001_enquiries.sql applied successfully to local emulator.
`git diff --check`: whitespace check. No cloud send/auth/performance/accessibility audit
or rendered visual approval is inferred from these checks. The GitHub workflow mirrors
`npm ci` and `npm run verify`; its remote result must be checked separately.

Sources: [Astro installation](https://docs.astro.build/en/install-and-setup/),
[D1 transactional batch](https://developers.cloudflare.com/d1/worker-api/d1-database/).
