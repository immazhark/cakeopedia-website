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
import { creationSlugs } from './creation-slugs.ts';

// The live composition of the reviewed modules. It exists only when EVERY gate and secret below is present and well formed;
// otherwise liveHandler returns null and index.ts stays closed. Nothing here is reachable from request headers.
type Opt<T> = { [K in keyof T]?: T[K] | undefined };
export type Env = Opt<{
  DB?: Database & UploadDatabase; UPLOADS?: Bucket & PrivateBucket;
  LIVE_ENABLED?: string; SITE_ORIGIN?: string; ACCESS_ISSUER?: string; ACCESS_AUD?: string; OPERATORS?: string;
  TURNSTILE_SECRET?: string; RATE_SECRET?: string;
  RESEND_API_KEY?: string; MAIL_FROM?: string; OWNER_EMAIL?: string;
  CATALOGUE_REBUILD_HOOK?: string; NOTIFICATIONS_ENABLED?: string; RATE_CLEANUP_ENABLED?: string; UPLOAD_CLEANUP_ENABLED?: string; RETENTION_DAYS?: string;
}>;
export interface Live { fetch(request: Request): Promise<Response>; scheduled(): Promise<void> }
const POLICY = { enquiry: { clientLimit: 3, globalLimit: 60 }, upload: { clientLimit: 10, globalLimit: 100 }, delete: { clientLimit: 10, globalLimit: 100 } } as const;
const closed = () => Response.json({ error: 'intake_not_enabled' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
const cache = new WeakMap<object, Live | null>();

export function liveHandler(env: Env | undefined, transport: typeof fetch = fetch): Live | null {
  if (!env) return null;
  if (!cache.has(env)) { try { cache.set(env, build(env, transport)); } catch { cache.set(env, null); } } // misconfiguration closes, never half-opens
  return cache.get(env) ?? null;
}

function build(env: Env, transport: typeof fetch): Live | null {
  const { DB: db, UPLOADS: bucket, SITE_ORIGIN: origin, ACCESS_ISSUER: issuer, ACCESS_AUD: audience, TURNSTILE_SECRET: turnstile, RATE_SECRET: rateSecret } = env;
  if (env.LIVE_ENABLED !== '1' || !db || !bucket || !origin || !issuer || !audience || !turnstile || !rateSecret || !env.OPERATORS) return null;
  const site = new URL(origin);
  if (site.protocol !== 'https:' || site.origin !== origin) return null;
  const operators = new Set(env.OPERATORS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
  if (operators.size === 0) return null;
  const access: AccessConfig = { issuer, audience, operators, getKeys: createAccessKeySource(issuer, transport), origin };
  const limit = createRateLimiter(db, rateSecret);
  const guard = (scope: keyof typeof POLICY) => async (request: Request) => {
    const who = canonicalClientNetwork(request.headers.get('CF-Connecting-IP')); // set by the Cloudflare edge, not by the client
    return who !== null && limit(scope, who, POLICY[scope]);
  };
  const verifyBot = createTurnstileVerifier({ secret: turnstile, hostname: site.hostname, action: 'enquiry' }, transport);
  const uploads = { db, bucket, origin, allowRequest: guard('upload'), verifyBot };
  // Optional deploy hook (a secret URL) that rebuilds the static site after the owner publishes. Absent: publishing still works and says so.
  const hook = env.CATALOGUE_REBUILD_HOOK;
  const rebuild = hook?.startsWith('https://') ? async () => (await fetch(hook, { method: 'POST' })).ok : undefined;
  const notify = env.RESEND_API_KEY && env.MAIL_FROM && env.OWNER_EMAIL ? { apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM, owner: env.OWNER_EMAIL } : undefined;
  return {
    async fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname.startsWith('/admin/api/')) return handleInbox(request, db, access, Date.now, bucket, rebuild);
      if (pathname === '/api/enquiries') {
        return handleEnquiry(request, { store: new EnquiryStore(db), origin, creationIds: creationSlugs, allowRequest: guard('enquiry'), verifyBot, ownsUploads: (s, ids) => ownsUploads(db, s, ids) });
      }
      if (pathname === '/api/catalogue') return handlePublicCatalogue(request, db as never);
      if (pathname === '/api/uploads') return handleUpload(request, uploads);
      if (pathname.startsWith('/api/uploads/')) return handleUploadDelete(request, pathname.slice('/api/uploads/'.length), { ...uploads, allowRequest: guard('delete') });
      return closed();
    },
    async scheduled() {
      await runConfiguredMaintenance(db, { notifications: env.NOTIFICATIONS_ENABLED, rateCleanup: env.RATE_CLEANUP_ENABLED }, notify, transport);
      if (env.UPLOAD_CLEANUP_ENABLED === '1') await purgeOrphans(db, bucket, Date.now()).catch(() => undefined);
      const keep = retentionDays(env.RETENTION_DAYS); // off unless the owner set a period of at least 30 days
      if (keep !== null) await purgeExpiredEnquiries(db as never, bucket as never, Date.now(), keep).catch(() => undefined);
    },
  };
}
