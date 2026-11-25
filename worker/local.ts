// LOCAL DEVELOPMENT ONLY (wrangler.local.jsonc). The public entry point (index.ts) stays closed.
// Bot check and throttling are stubs here; real Turnstile and distributed limits are release gates.
import { handleEnquiry } from './enquiries.ts';
import { EnquiryStore, type Database } from './store.ts';
import type { AccessConfig, Jwk } from './auth.ts';
import { handleInbox, type PrivateBucket } from './inbox.ts';
import { handleUpload, handleUploadDelete, ownsUploads, type Bucket, type UploadDatabase } from './uploads.ts';

interface Env { DB: Database & UploadDatabase; UPLOADS: Bucket & PrivateBucket; LOCAL_DEV?: string }
const creationIds = new Set(['ruby-rose-mr-and-mrs', 'blush-rose-marble', 'crimson-cascade', 'pampas-and-peach-roses', 'pink-rose-crown', 'white-feather-bloom', 'love-three-tier', 'anniversary-neon-roses', 'texas-hearts-three-tier', 'gold-leaf-garden', 'vintage-piped-castle', 'vintage-fig-cross-stitch', 'blue-and-yellow-anniversary', 'polka-dot-roses', 'red-bow-birthday', 'balloon-he-or-she', 'blue-rainbow-pair', 'festive-orange-and-green', 'mini-cake-box-sign']);
const origin = 'http://127.0.0.1:4321';
const allowRequest = async () => true;

// Local owner login: a throwaway key signs a short-lived token that the REAL verifier then checks, so the
// auth path is exercised without Cloudflare Access. Never present in index.ts or any deployed config.
const DEV = { iss: 'https://dev.invalid', aud: 'dev', email: 'owner@example.invalid' };
let devKey: Promise<{ pair: CryptoKeyPair; jwk: Jwk }> | undefined;
const keyPair = () => (devKey ??= (async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  return { pair, jwk: { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'dev' } };
})());
const b64u = (v: ArrayBuffer | string) => {
  let bin = '';
  for (const byte of typeof v === 'string' ? new TextEncoder().encode(v) : new Uint8Array(v)) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
async function devAdmin(request: Request, env: Env): Promise<Response> {
  const { pair, jwk } = await keyPair();
  const data = b64u(JSON.stringify({ alg: 'RS256', kid: 'dev' })) + '.' + b64u(JSON.stringify({ iss: DEV.iss, aud: [DEV.aud], email: DEV.email, exp: Math.floor(Date.now() / 1000) + 300 }));
  const token = data + '.' + b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(data)));
  const headers = new Headers(request.headers); headers.set('Cf-Access-Jwt-Assertion', token);
  const cfg: AccessConfig = { issuer: DEV.iss, audience: DEV.aud, operators: new Set([DEV.email]), getKeys: async () => [jwk], origin };
  return handleInbox(new Request(request, { headers }), env.DB, cfg, Date.now, env.UPLOADS);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (env.LOCAL_DEV !== '1' || !['localhost', '127.0.0.1'].includes(url.hostname)) return Response.json({ error: 'intake_not_enabled' }, { status: 503 });
    if (url.pathname.startsWith('/admin/api/')) return devAdmin(request, env);
    const uploads = { db: env.DB, bucket: env.UPLOADS, origin, allowRequest };
    if (url.pathname === '/api/uploads') return handleUpload(request, uploads);
    if (url.pathname.startsWith('/api/uploads/')) return handleUploadDelete(request, url.pathname.slice('/api/uploads/'.length), uploads);
    if (url.pathname !== '/api/enquiries') return Response.json({ error: 'not_found' }, { status: 404 });
    return handleEnquiry(request, {
      store: new EnquiryStore(env.DB), origin, creationIds, allowRequest,
      verifyBot: async (token) => token === 'local-dev',
      ownsUploads: (submissionId, ids) => ownsUploads(env.DB, submissionId, ids),
    });
  },
};
