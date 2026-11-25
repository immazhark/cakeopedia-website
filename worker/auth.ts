// Owner authentication: verifies a Cloudflare Access JWT on EVERY private request (signature, issuer, audience,
// expiry, operator allowlist). Access is the identity provider; the Worker never trusts a header it did not verify.
// CSRF: Access uses ambient cookies, so every mutation also needs a same-origin Origin and a custom header.
export interface AccessConfig {
  issuer: string;                 // https://<team>.cloudflareaccess.com
  audience: string;               // Access application AUD tag
  operators: ReadonlySet<string>; // lower-case operator emails
  getKeys: () => Promise<JsonWebKey[]>; // JWKS (cache with a short TTL in the caller)
  now?: () => number;             // seconds, for tests
  origin: string;                 // this app's own origin, for CSRF
}
const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const json = (s: string): unknown => JSON.parse(new TextDecoder().decode(b64(s)));
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export async function verifyAccessJwt(token: string | null, cfg: AccessConfig): Promise<string | null> {
  try {
    const parts = token?.split('.');
    if (!parts || parts.length !== 3) return null;
    const [h, p, s] = parts as [string, string, string];
    const header = json(h), payload = json(p);
    if (!isObj(header) || !isObj(payload) || header.alg !== 'RS256' || typeof header.kid !== 'string') return null; // never accept none/HS*
    const jwk = (await cfg.getKeys()).find((k) => k.kid === header.kid && k.kty === 'RSA');
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', { ...jwk, alg: 'RS256' }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64(s), new TextEncoder().encode(`${h}.${p}`))) return null;
    const now = (cfg.now ?? (() => Math.floor(Date.now() / 1000)))();
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (payload.iss !== cfg.issuer || !aud.includes(cfg.audience)) return null;
    if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
    if (typeof payload.nbf === 'number' && payload.nbf > now + 30) return null;
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    return cfg.operators.has(email) ? email : null;
  } catch { return null; }
}

export type Operator = { ok: true; email: string } | { ok: false; response: Response };
const deny = (status: 401 | 403) => ({ ok: false, response: Response.json({ error: status === 401 ? 'unauthenticated' : 'forbidden' }, { status, headers: { 'Cache-Control': 'no-store' } }) }) as const;

export async function authorize(request: Request, cfg: AccessConfig): Promise<Operator> {
  const email = await verifyAccessJwt(request.headers.get('Cf-Access-Jwt-Assertion'), cfg);
  if (!email) return deny(401);
  if (!['GET', 'HEAD'].includes(request.method)) {
    if (request.headers.get('Origin') !== cfg.origin || request.headers.get('X-Cakeopedia-Admin') !== '1') return deny(403);
  }
  return { ok: true, email };
}
