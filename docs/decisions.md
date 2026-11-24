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
| ADR08 | Deferred | No direct uploads or checkout | Reduces storage abuse billing and food-sales complexity | Future approved need and separate specifications; Separate later authority |
| ADR09 | Recommended | 24-file documentation bootstrap | One shared instruction source; no fake running app | Links YAML exclusion and public-safety checks; Separate first-commit authority |
| ADR10 | Proposed | 90-day unsuccessful-enquiry retention | Closure-based period; backups/deletion need coordination | Owner approval and purge/restore tests; Before real customer data |
| ADR11 | Recommended | Independent encrypted exports | Platform history insufficient for account loss | Restore drill and approved storage/key custodian; Before live intake |
| ADR12 | Recommended | Public facts over schema completeness | Never disclose home address for rich results or promise AI rank | Built HTML/schema/public-data review; Before launch |

Evidence references resolve in [research evidence](research-evidence.md). Change the affected ADR when a measured proof or owner decision changes it, rather than retaining competing instructions.
