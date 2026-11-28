import { createAccessKeySource } from './access-keys.ts';
import type { AccessConfig } from './auth.ts';
import { canonicalClientNetwork } from './client-network.ts';
import { handleEnquiry } from './enquiries.ts';
import { handleInbox, type PrivateBucket } from './inbox.ts';
import { runConfiguredMaintenance } from './maintenance-runtime.ts';
import { purgeExpiredEnquiries, retentionDays } from './erase.ts';
import { createRateLimiter } from './rate-limit.ts';
import { EnquiryStore, type Database } from './store.ts';
import { createTurnstileVerifier } from './turnstile.ts';
import { handlePublicCatalogue } from './catalogue.ts';
import { handleUpload, handleUploadDelete, ownsUploads, purgeOrphans, type Bucket, type UploadDatabase } from './uploads.ts';
import { sendResendEmail } from './resend-transport.ts';
import { creationSlugs } from './creation-slugs.ts';
import { recordMaintenance, type JobState } from './health.ts';

// The live composition of the reviewed modules. Four capabilities, each with its own gate and prerequisites, so a switched-off or
// misconfigured one never disables an unrelated safe one: public intake (LIVE_ENABLED), owner administration (ADMIN_ENABLED),
// the approved public catalogue (needs only DB) and scheduled maintenance (needs DB and UPLOADS; each job keeps its own switch).
// Nothing here is reachable from request headers.
type Opt<T> = { [K in keyof T]?: T[K] | undefined };
export type Env = Opt<{
  DB?: Database & UploadDatabase; UPLOADS?: Bucket & PrivateBucket; ASSETS?: { fetch(request: Request): Promise<Response> };
  LIVE_ENABLED?: string; ADMIN_ENABLED?: string; SITE_ORIGIN?: string; ACCESS_ISSUER?: string; ACCESS_AUD?: string; OPERATORS?: string;
  TURNSTILE_SECRET?: string; RATE_SECRET?: string;
  RESEND_API_KEY?: string; MAIL_FROM?: string; MAIL_REPLY_TO?: string; OWNER_EMAIL?: string;
  CATALOGUE_REBUILD_HOOK?: string; NOTIFICATIONS_ENABLED?: string; RATE_CLEANUP_ENABLED?: string; UPLOAD_CLEANUP_ENABLED?: string; RETENTION_DAYS?: string;
}>;
export interface Capabilities { intake: boolean; admin: boolean; catalogue: boolean; maintenance: boolean }
export interface Live { capabilities: Capabilities; fetch(request: Request): Promise<Response>; scheduled(): Promise<void> }
const POLICY = { enquiry: { clientLimit: 3, globalLimit: 60 }, upload: { clientLimit: 10, globalLimit: 100 }, delete: { clientLimit: 10, globalLimit: 100 } } as const;
const closed = (error = 'intake_not_enabled') => Response.json({ error }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
const cache = new WeakMap<object, Live | null>();

export function liveHandler(env: Env | undefined, transport: typeof fetch = fetch): Live | null {
  if (!env) return null;
  if (!cache.has(env)) { try { cache.set(env, build(env, transport)); } catch { cache.set(env, null); } } // misconfiguration closes, never half-opens
  return cache.get(env) ?? null;
}

function validOrigin(origin: string | undefined): URL | null {
  if (!origin) return null;
  try { const u = new URL(origin); return u.protocol === 'https:' && u.origin === origin ? u : null; } catch { return null; }
}

function build(env: Env, transport: typeof fetch): Live | null {
  const { DB: db, UPLOADS: bucket, ACCESS_ISSUER: issuer, ACCESS_AUD: audience, TURNSTILE_SECRET: turnstile, RATE_SECRET: rateSecret } = env;
  if (!db) return null;
  const site = validOrigin(env.SITE_ORIGIN);
  // Optional deploy hook (a secret URL) that rebuilds the static site after the owner publishes. Absent: publishing still works and says so.
  const hook = env.CATALOGUE_REBUILD_HOOK;
  const rebuild = hook?.startsWith('https://') ? async () => (await fetch(hook, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5000) })).ok : undefined;
  const notify = env.RESEND_API_KEY && env.MAIL_FROM && env.OWNER_EMAIL ? { apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM, owner: env.OWNER_EMAIL } : undefined;
  // Owner-triggered manual email shares the notification switch: with NOTIFICATIONS_ENABLED off, drafts and history work but nothing can be sent.
  const apiKey = env.RESEND_API_KEY;
  const mail = env.NOTIFICATIONS_ENABLED === '1' && apiKey && env.MAIL_FROM && env.MAIL_REPLY_TO
    ? { from: env.MAIL_FROM, replyTo: env.MAIL_REPLY_TO, send: (payload: string, key: string) => sendResendEmail(apiKey, key, payload, transport) } : undefined;

  // Owner administration: Cloudflare Access JWT verified on every call.
  const operators = new Set((env.OPERATORS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
  let admin: ((request: Request) => Promise<Response>) | undefined;
  if (env.ADMIN_ENABLED === '1' && bucket && site && issuer && audience && operators.size > 0) {
    try {
      const access: AccessConfig = { issuer, audience, operators, getKeys: createAccessKeySource(issuer, transport), origin: site.origin };
      admin = (request) => handleInbox(request, db, access, Date.now, bucket, rebuild, mail);
    } catch { admin = undefined; } // malformed Access settings close the owner area only
  }

  // Public enquiries and uploads.
  let intake: { enquiry: (r: Request) => Promise<Response>; uploads: (r: Request, path: string) => Promise<Response> } | undefined;
  if (env.LIVE_ENABLED === '1' && bucket && site && turnstile && rateSecret) {
    try {
      const limit = createRateLimiter(db, rateSecret);
      const guard = (scope: keyof typeof POLICY) => async (request: Request) => {
        const who = canonicalClientNetwork(request.headers.get('CF-Connecting-IP')); // set by the Cloudflare edge, not by the client
        return who !== null && limit(scope, who, POLICY[scope]);
      };
      const verifyBot = createTurnstileVerifier({ secret: turnstile, hostname: site.hostname, action: 'enquiry' }, transport);
      const hmacKey = crypto.subtle.importKey('raw', new TextEncoder().encode(rateSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const clientKey = async (request: Request) => { // pseudonym for the per-client daily upload-session cap; never the raw address
        const who = canonicalClientNetwork(request.headers.get('CF-Connecting-IP'));
        if (who === null) return null;
        const sig = await crypto.subtle.sign('HMAC', await hmacKey, new TextEncoder().encode(JSON.stringify(['upload-day', who])));
        return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
      };
      const up = { db, bucket, origin: site.origin, allowRequest: guard('upload'), verifyBot, clientKey };
      intake = {
        enquiry: (request) => handleEnquiry(request, { store: new EnquiryStore(db), origin: site.origin, creationIds: creationSlugs, allowRequest: guard('enquiry'), verifyBot, ownsUploads: (s, ids) => ownsUploads(db, s, ids) }),
        uploads: (request, path) => path === '/api/uploads' ? handleUpload(request, up) : handleUploadDelete(request, path.slice('/api/uploads/'.length), { ...up, allowRequest: guard('delete') }),
      };
    } catch { intake = undefined; } // a bad rate secret closes intake only
  }

  return {
    capabilities: { intake: !!intake, admin: !!admin, catalogue: true, maintenance: !!bucket },
    async fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname.startsWith('/admin/api/')) return admin ? admin(request) : closed('admin_not_enabled');
      if (pathname === '/api/catalogue') return handlePublicCatalogue(request, db as never);
      if (pathname === '/api/enquiries') return intake ? intake.enquiry(request) : closed();
      if (pathname === '/api/uploads' || pathname.startsWith('/api/uploads/')) return intake ? intake.uploads(request, pathname) : closed();
      return closed();
    },
    async scheduled() {
      if (!bucket) return;
      const at = Date.now(), job = async (name: string, run: () => Promise<JobState | void>) => {
        let state: JobState;
        try { state = (await run()) ?? 'completed'; } catch { state = 'failed'; }
        await recordMaintenance(db, name, state, at);
      };
      const res = await runConfiguredMaintenance(db, { notifications: env.NOTIFICATIONS_ENABLED, rateCleanup: env.RATE_CLEANUP_ENABLED }, notify, transport);
      for (const [name, r] of [['notifications', res.notifications], ['rate_cleanup', res.rateCleanup]] as const) if (r.state !== 'disabled') await recordMaintenance(db, name, r.state, at);
      if (env.UPLOAD_CLEANUP_ENABLED === '1') await job('upload_cleanup', async () => { await purgeOrphans(db, bucket, at); });
      const keep = retentionDays(env.RETENTION_DAYS); // off unless the owner set a period of at least 30 days
      if (keep !== null) await job('retention', async () => { await purgeExpiredEnquiries(db as never, bucket as never, at, keep); });
    },
  };
}
