import assert from 'node:assert/strict';
import { test } from 'node:test';
import production from '../worker/index.ts';
import { liveHandler, type Env } from '../worker/live.ts';

const db = { prepare() { throw new Error('db must not be touched'); }, batch() { throw new Error('db must not be touched'); } } as unknown as Env['DB'];
const full = (over: Partial<Env> = {}): Env => ({ DB: db, UPLOADS: {} as Env['UPLOADS'], LIVE_ENABLED: '1', SITE_ORIGIN: 'https://cakeopedia.com', ACCESS_ISSUER: 'https://team.cloudflareaccess.com',
  ACCESS_AUD: 'aud', OPERATORS: 'Owner@Example.invalid', TURNSTILE_SECRET: 'synthetic-secret', RATE_SECRET: 'a'.repeat(64), ...over });

test('every missing or malformed gate keeps the Worker closed', () => {
  assert.ok(liveHandler(full()), 'fully configured opens (control)');
  const broken: Partial<Env>[] = [{ LIVE_ENABLED: '0' }, { LIVE_ENABLED: undefined }, { DB: undefined }, { UPLOADS: undefined }, { SITE_ORIGIN: 'http://cakeopedia.com' }, { SITE_ORIGIN: 'https://cakeopedia.com/' },
    { ACCESS_ISSUER: 'https://evil.example.com' }, { ACCESS_AUD: '' }, { OPERATORS: ' , ' }, { OPERATORS: undefined }, { TURNSTILE_SECRET: undefined }, { RATE_SECRET: 'short' }, { RATE_SECRET: 'g'.repeat(64) }];
  for (const b of broken) assert.equal(liveHandler(full(b)), null, JSON.stringify(b));
});

test('a configured Worker still refuses unauthenticated owner calls and bot-less or throttle-less public calls', async () => {
  const env = full();
  const admin = await production.fetch(new Request('https://cakeopedia.com/admin/api/enquiries', { headers: { Origin: 'https://cakeopedia.com' } }), env);
  assert.equal(admin.status, 401);
  const noEdgeIp = await production.fetch(new Request('https://cakeopedia.com/api/enquiries', { method: 'POST', headers: { Origin: 'https://cakeopedia.com', 'Content-Type': 'application/json' }, body: '{}' }), env);
  assert.equal(noEdgeIp.status, 429); // no trusted client network: refused before the database is touched
  assert.equal((await production.fetch(new Request('https://cakeopedia.com/unknown'), env)).status, 503);
  assert.equal(((await (await production.fetch(new Request('https://cakeopedia.com/health'), env)).json()) as { stage: string }).stage, 'live');
});
