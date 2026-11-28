// Read-only production preflight: nothing is deployed or changed. Prints PASS/FAIL per check and exits 1 on any failure.
// Usage: node scripts/prod-preflight.mjs [distDir]    (run after a production build; first deploy is expected to be CLOSED)
// Secrets are never printed: only whether values exist and whether production differs from staging.
import { existsSync, readFileSync } from 'node:fs';
const strip = (s) => { let o = '', q = false; for (let i = 0; i < s.length; i++) { const c = s[i], n = s[i + 1]; if (q) { o += c; if (c.charCodeAt(0) === 92) o += s[++i] ?? ''; else if (c === '"') q = false; } else if (c === '"') { q = true; o += c; } else if (c === '/' && n === '/') { while (i < s.length && s[i] !== '\n') i++; } else o += c; } return o; };
const cfg = (f) => existsSync(f) ? JSON.parse(strip(readFileSync(f, 'utf8'))) : null;
const env = (f) => existsSync(f) ? Object.fromEntries(readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])) : {};
let bad = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${m}`); if (!ok) bad++; };
const dist = process.argv[2] ?? 'dist';
const prod = cfg('wrangler.production.jsonc'), stage = cfg('wrangler.staging.jsonc');
check(!!prod && !!stage, 'production and staging Worker configs exist locally (gitignored)');
if (prod && stage) {
  const v = prod.vars ?? {}, sv = stage.vars ?? {};
  check(!/REPLACE/.test(JSON.stringify(prod)), 'production config has no REPLACE_ placeholders');
  check(v.SITE_ORIGIN === 'https://cakeopedia.com', 'SITE_ORIGIN is https://cakeopedia.com');
  check(!!v.ACCESS_AUD && v.ACCESS_AUD !== sv.ACCESS_AUD, 'production ACCESS_AUD is set and differs from staging');
  check(v.ACCESS_ISSUER === sv.ACCESS_ISSUER && /^https:\/\/[\w-]+\.cloudflareaccess\.com$/.test(v.ACCESS_ISSUER ?? ''), 'ACCESS_ISSUER is the Access team domain');
  check((v.OPERATORS ?? '').split(',').filter(Boolean).length >= 1, 'operators configured');
  check(prod.d1_databases?.[0]?.database_id && prod.d1_databases[0].database_id !== stage.d1_databases?.[0]?.database_id, 'production D1 differs from staging D1');
  check(prod.r2_buckets?.[0]?.bucket_name && prod.r2_buckets[0].bucket_name !== stage.r2_buckets?.[0]?.bucket_name, 'production R2 bucket differs from staging bucket');
  check(prod.workers_dev === false, 'workers.dev is off for production (only the custom domain serves it)');
  check(v.LIVE_ENABLED === '0' && v.NOTIFICATIONS_ENABLED === '0', 'first deploy is CLOSED: LIVE_ENABLED=0 and NOTIFICATIONS_ENABLED=0 (flip only on release authorisation)');
  check(v.RATE_CLEANUP_ENABLED === '1' && v.UPLOAD_CLEANUP_ENABLED === '1' && !('RETENTION_DAYS' in v), 'cleanup switches on, retention unset');
  check(prod.assets?.binding === 'ASSETS' && (prod.assets.run_worker_first ?? []).includes('/media/video/*'), 'video byte-range route configured');
  check(!JSON.stringify(prod).match(/re_[A-Za-z0-9]{20,}|0x4AAAAAA\w{20,}secret/i), 'no API keys or Turnstile secrets in the config');
}
const pe = env('.env.production'), se = env('.env.staging');
check(pe.PUBLIC_SITE_ENV === 'production', '.env.production sets PUBLIC_SITE_ENV=production');
check(!!pe.PUBLIC_TURNSTILE_SITE_KEY && !/^[123]x/.test(pe.PUBLIC_TURNSTILE_SITE_KEY) && pe.PUBLIC_TURNSTILE_SITE_KEY !== se.PUBLIC_TURNSTILE_SITE_KEY, 'production Turnstile site key is real and differs from staging');
check(pe.PUBLIC_ENQUIRY_FORM !== 'on', 'enquiry form is OFF in the production env (turn on only at launch)');
if (existsSync(dist)) {
  const h = existsSync(`${dist}/_headers`) ? readFileSync(`${dist}/_headers`, 'utf8') : '';
  check(/Strict-Transport-Security: max-age=\d+/.test(h) && !/X-Robots-Tag: noindex, nofollow\n\/admin/.test(h.split('/admin/*')[0] ?? ''), 'dist is a PRODUCTION build: HSTS present, site not noindex');
  check(existsSync(`${dist}/sitemap.xml`) && /Allow|Disallow/.test(existsSync(`${dist}/robots.txt`) ? readFileSync(`${dist}/robots.txt`, 'utf8') : ''), 'sitemap.xml and robots.txt exist');
  const home = readFileSync(`${dist}/index.html`, 'utf8');
  check(!/noindex/i.test(home) && /rel="canonical" href="https:\/\/cakeopedia\.com\/"/.test(home), 'home page is indexable with the production canonical');
} else console.log('SKIP dist checks (no build directory)');
console.log(bad ? `\n${bad} preflight check(s) FAILED` : '\nPreflight passed (config only: no remote state was read or changed)');
process.exit(bad ? 1 : 0);
