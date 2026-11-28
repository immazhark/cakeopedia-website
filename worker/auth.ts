// Owner authentication: verifies a Cloudflare Access JWT on EVERY private request (signature, issuer, audience,
// expiry, operator allowlist). Access is the identity provider; the Worker never trusts a header it did not verify.
// CSRF: Access uses ambient cookies, so every mutation also needs a same-origin Origin and a custom header.
export type Jwk = JsonWebKey & { kid?: string };
export interface AccessConfig {
  issuer: string;                 // https://<team>.cloudflareaccess.com
  audience: string;               // Access application AUD tag
  operators: ReadonlySet<string>; // lower-case operator emails
  getKeys: () => Promise<Jwk[]>; // JWKS (cache with a short TTL in the caller)
  now?: () => number;             // seconds, for tests
  origin: string;                 // this app's own origin, for CSRF
}
const b64 = (s: string) => {
  const decoded = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
  if (btoa(decoded).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== s) throw Error('Invalid token encoding');
  return Uint8Array.from(decoded, c => c.charCodeAt(0));
};
const json = (s: string): unknown => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(b64(s)));
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

type Verdict = { email: string } | { fail: 'invalid' | 'forbidden' | 'keys' };
const fail = (f: 'invalid' | 'forbidden' | 'keys'): Verdict => ({ fail: f });
export async function verifyAccessJwt(token: string | null, cfg: AccessConfig): Promise<string | null> {
  const v = await inspect(token, cfg);
  return 'email' in v ? v.email : null;
}
// Separates a bad/expired token (401), a valid identity that is not an operator (403) and unreachable signing keys (503, our side).
async function inspect(token: string | null, cfg: AccessConfig): Promise<Verdict> {
  const invalid = fail('invalid');
  try {
    // Bound attacker-controlled parsing before any key lookup or cryptography.
    if (!token || token.length > 16_384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return invalid;
    const parts = token.split('.');
    if (!parts || parts.length !== 3) return invalid;
    const [h, p, s] = parts as [string, string, string];
    const header = json(h), payload = json(p);
    if (!isObj(header) || !isObj(payload) || header.alg !== 'RS256' || typeof header.kid !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(header.kid) || Object.hasOwn(header, 'crit') || Object.hasOwn(header, 'b64')) return invalid; // never accept none/HS*
    const signature = b64(s);
    let keys: Jwk[];
    try { keys = await cfg.getKeys(); } catch { return fail('keys'); }
    const matching = keys.filter(k => k.kid === header.kid);
    const jwk = matching[0];
    if (matching.length !== 1 || !jwk || jwk.kty !== 'RSA') return invalid;
    const key = await crypto.subtle.importKey('jwk', { ...jwk, alg: 'RS256' }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, new TextEncoder().encode(`${h}.${p}`))) return invalid;
    const now = (cfg.now ?? (() => Math.floor(Date.now() / 1000)))();
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!Number.isSafeInteger(now) || now < 0 || payload.iss !== cfg.issuer || !aud.every(a => typeof a === 'string' && a.length > 0) || !aud.includes(cfg.audience)) return invalid;
    if (typeof payload.exp !== 'number' || !Number.isSafeInteger(payload.exp) || payload.exp <= now) return invalid;
    if (Object.hasOwn(payload, 'nbf') && (typeof payload.nbf !== 'number' || !Number.isSafeInteger(payload.nbf) || payload.nbf < 0 || payload.nbf > now + 30)) return invalid;
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    return cfg.operators.has(email) ? { email } : fail('forbidden');
  } catch { return invalid; }
}

export type Operator = { ok: true; email: string } | { ok: false; response: Response };
const NAMES = { 401: 'unauthenticated', 403: 'forbidden', 503: 'auth_unavailable' } as const;
const deny = (status: 401 | 403 | 503) => ({ ok: false, response: Response.json({ error: NAMES[status] }, { status, headers: { 'Cache-Control': 'no-store' } }) }) as const;

export async function authorize(request: Request, cfg: AccessConfig): Promise<Operator> {
  const v = await inspect(request.headers.get('Cf-Access-Jwt-Assertion'), cfg);
  if ('fail' in v) return deny(v.fail === 'invalid' ? 401 : v.fail === 'forbidden' ? 403 : 503);
  const email = v.email;
  if (!['GET', 'HEAD'].includes(request.method)) {
    if (request.headers.get('Origin') !== cfg.origin || request.headers.get('X-Cakeopedia-Admin') !== '1') return deny(403);
  }
  return { ok: true, email };
}
