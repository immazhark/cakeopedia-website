# Production release checklist (PREPARED, NOT EXECUTED)

Nothing here has been run against production. Each step needs the owner's explicit release authorisation. Staging proof is not production proof.

## Facts observed (public DNS, 27 Nov 2026, read-only)
- `cakeopedia.com` and `www` resolve to Cloudflare proxy addresses (A + AAAA) whose origin we have not seen; the root answers **522** (origin unreachable). These look like placeholder records. A Workers custom domain cannot attach while a conflicting A/AAAA/CNAME exists. **Before cutover: record each existing root and www record (type, value, proxied) in the runbook, get the owner's OK, then replace them.** Never delete MX, TXT (SPF/DKIM/DMARC), Email Routing or Resend records.
- Mail: MX = Cloudflare Email Routing (3 hosts); root SPF is the Cloudflare routing include; Resend uses `send.` (SPF + feedback MX) and `resend._domainkey` (DKIM); DMARC is `p=none` (monitor only; tighten to `quarantine` only after a clean reporting period).
- Zone (reported, not re-verified): SSL mode Full; Always Use HTTPS off; Cloudflare HSTS off. App emits `Strict-Transport-Security: max-age=86400` only in production builds.

## 1. Before anything is deployed
1. `node scripts/verify-clean.mjs` green (hermetic: no .env files) from the exact commit to release; record commit and test counts.
2. Production Turnstile secret, `RATE_SECRET` (64 hex), `RESEND_API_KEY` set as Worker secrets on the production Worker (names only in logs; `wrangler secret put`).
3. DONE 27 Nov 2026 (owner): production Access application for /admin and /admin/* (public site unrestricted); AUD in the gitignored production config. Still to verify live after the Worker is deployed, `ACCESS_AUD`/issuer/operators filled in the gitignored `wrangler.production.jsonc`. Verify: unauthenticated 302, forged JWT 401, non-operator 403 (use `scripts/staging-smoke.mjs` MODE=closed with BASE set).
4. D1 production: Time Travel bookmark, then `wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc` (0001-0020). Verify tables with `/admin/api/health`.
5. Production site build: `PUBLIC_SITE_ENV=production`, real `PUBLIC_TURNSTILE_SITE_KEY`, `PUBLIC_ENQUIRY_FORM` stays off until launch.

## 2. First production deploy (closed)
`LIVE_ENABLED=0`, `ADMIN_ENABLED=1`, `NOTIFICATIONS_ENABLED=0`, `RETENTION_DAYS` unset, cleanup switches 1. Deploy to `workers.dev` first, run smoke MODE=closed + PUBLISH, confirm 503 on public writes.

## 3. Domain attachment and TLS
1. Owner approves replacing the placeholder A/AAAA records (values saved).
2. Attach `cakeopedia.com` (and `www` redirect to apex) as Worker custom domains.
3. SSL/TLS: Full (strict) once the origin is Cloudflare itself (Worker custom domain); Always Use HTTPS on; Automatic HTTPS Rewrites on; min TLS 1.2.
4. HSTS: keep the app header (1 day) for the first week; then raise to 6 months; `includeSubDomains` and preload only by explicit owner decision (hard to undo).
5. WAF/edge: rate-limit rule on `/api/*` POST (volumetric; app limiter is a quota guard only); bot fight mode on; keep `/admin/*` behind Access.
6. Check live responses: `curl -sI https://cakeopedia.com/` for HSTS, nosniff, frame-ancestors, no X-Robots-Tag noindex; robots.txt and sitemap; `/health` shows intake false.

## 4. Launch (explicit owner authorisation only)
Set `PUBLIC_ENQUIRY_FORM=on`, rebuild, `LIVE_ENABLED=1`; enable `NOTIFICATIONS_ENABLED=1` only after one synthetic owner-only delivery on production is confirmed in the inbox. Submit one synthetic enquiry end to end (Turnstile, picture, owner view, erase).

## 5. Rollback
- Intake: `LIVE_ENABLED=0` + redeploy (owner area, catalogue and cleanup keep running).
- Site: redeploy the previous Worker version (`wrangler rollback`), or catalogue rollback in admin.
- Data: D1 Time Travel restore to the saved bookmark; erasure-after-restore per runbook section 6.
- DNS: restore the saved placeholder records.

## 6. Search consoles (after launch)
Google Search Console and Bing Webmaster Tools: add the domain property via a DNS TXT record on the Cloudflare zone (owner-owned account step), submit `https://cakeopedia.com/sitemap.xml`.
