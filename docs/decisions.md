# Decisions

Updated 24 November 2026. Recommendations do not imply provider activation.

| ID | Status | Decision | Rationale/impact | Validation and gate |
|---|---|---|---|---|
| ADR01 | Recommended | Static Astro + narrow Worker | Avoid runtime work for public browsing; small API surface | Static route/API separation and CPU proof; After local scaffold; cloud authority later |
| ADR02 | Recommended | D1 private enquiry + outbox | Atomic batch and indexed minimal data; Free quota failure risk | Concurrent duplicate and rollback tests; Before live intake |
| ADR03 | Conditional | Sanity Free editorial | Public dataset only; no restricted Editor role | Phone publishing and admin-role acceptance; Owner/sponsor before CMS release |
| ADR04 | Conditional | Cloudflare Access owner inbox | Avoid homegrown passwords; verify backend and alternate host | Signed token/claims/allowlist denial tests; Before real enquiries |
| ADR05 | Recommended | Resend adapter with persistent recovery | Small free allowance; no exactly-once delivery assumption | Outage quota ambiguous send 24h expiry tests; Before live notifications |
| ADR06 | Recommended | Turnstile + application limits | Single-use expiring token; accessible retry; private replay response | New/replay/conflict/expired token tests; Before live intake |
| ADR07 | Recommended | Collection creative lead | Broad range and name fit; provisional until actual photos | Comparable visual targets and owner selection; Before production design |
| ADR08 | Revised 25 November 2026 | Up to three optional private inspiration uploads approved for launch; checkout remains deferred | Owner accepts outside inspiration and comments; private storage adds abuse/privacy/cost obligations | Count/type/content/size limits, authorised access, cleanup/retention and cost gates before activation; not yet implemented |
| ADR09 | Recommended | 24-file documentation bootstrap | One shared instruction source; no fake running app | Links YAML exclusion and public-safety checks; Separate first-commit authority |
| ADR10 | Proposed | 90-day unsuccessful-enquiry retention | Closure-based period; backups/deletion need coordination | Owner approval and purge/restore tests; Before real customer data |
| ADR11 | Recommended | Independent encrypted exports | Platform history insufficient for account loss | Restore drill and approved storage/key custodian; Before live intake |
| ADR12 | Recommended | Public facts over schema completeness | Never disclose home address for rich results or promise AI rank | Built HTML/schema/public-data review; Before launch |

Evidence references resolve in [research evidence](research-evidence.md). Change the affected ADR when a measured proof or owner decision changes it, rather than retaining competing instructions.

## ADR-013 — local runtime and closed intake

Accepted for F04/E01: Node 24.22.3, Astro 7.4.13, TypeScript 6.0.3 and exact dependencies
in the lockfile. Astro check's peer range excludes TypeScript 7. No cloud bindings or
secrets are required. Keep the Worker public intake closed until real bot/abuse controls,
primary-consistent reads, authentication and operational release gates are proven.
The local API core queues two notification intents but never sends. Emulator tests are
local evidence only. Final visual design remains pending the creative comparison.
