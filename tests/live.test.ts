import assert from 'node:assert/strict';
import { test } from 'node:test';
import production from '../worker/index.ts';
import { liveHandler, type Env } from '../worker/live.ts';

const db = { prepare() { throw new Error('db must not be touched'); }, batch() { throw new Error('db must not be touched'); } } as unknown as Env['DB'];
const full = (over: Partial<Env> = {}): Env => ({ DB: db, UPLOADS: {} as Env['UPLOADS'], LIVE_ENABLED: '1', ADMIN_ENABLED: '1', SITE_ORIGIN: 'https://cakeopedia.com', ACCESS_ISSUER: 'https://team.cloudflareaccess.com',
  ACCESS_AUD: 'aud', OPERATORS: 'Owner@Example.invalid', TURNSTILE_SECRET: 'synthetic-secret', RATE_SECRET: 'a'.repeat(64), ...over });

type Caps = { intake: boolean; admin: boolean; maintenance: boolean };
const all: Caps = { intake: true, admin: true, maintenance: true };
test('each capability opens only on its own gate; a failure closes that capability and nothing else', () => {
  assert.deepEqual(liveHandler(full())!.capabilities, { ...all, catalogue: true }, 'fully configured (control)');
  const cases: [Partial<Env>, Partial<Caps>][] = [
    [{ LIVE_ENABLED: '0' }, { intake: false }], [{ LIVE_ENABLED: undefined }, { intake: false }],
    [{ ADMIN_ENABLED: '0' }, { admin: false }], [{ ADMIN_ENABLED: undefined }, { admin: false }],
    [{ UPLOADS: undefined }, { intake: false, admin: false, maintenance: false }],
    [{ SITE_ORIGIN: 'http://cakeopedia.com' }, { intake: false, admin: false }], [{ SITE_ORIGIN: 'https://cakeopedia.com/' }, { intake: false, admin: false }],
    [{ SITE_ORIGIN: 'not a url' }, { intake: false, admin: false }],
    [{ ACCESS_ISSUER: 'https://evil.example.com' }, { admin: false }], [{ ACCESS_AUD: '' }, { admin: false }], [{ OPERATORS: ' , ' }, { admin: false }], [{ OPERATORS: undefined }, { admin: false }],
    [{ TURNSTILE_SECRET: undefined }, { intake: false }], [{ RATE_SECRET: 'short' }, { intake: false }], [{ RATE_SECRET: 'g'.repeat(64) }, { intake: false }],
  ];
  for (const [over, off] of cases) assert.deepEqual(liveHandler(full(over))!.capabilities, { ...all, catalogue: true, ...off }, JSON.stringify(over));
  assert.equal(liveHandler(full({ DB: undefined })), null);
});

test('emergency intake shutdown leaves owner administration, the catalogue and maintenance running', async () => {
  const env = full({ LIVE_ENABLED: '0' });
  const intake = await production.fetch(new Request('https://cakeopedia.com/api/enquiries', { method: 'POST' }), env);
  assert.equal(intake.status, 503); assert.deepEqual(await intake.json(), { error: 'intake_not_enabled' });
  assert.equal((await production.fetch(new Request('https://cakeopedia.com/api/uploads', { method: 'POST' }), env)).status, 503);
  assert.equal((await production.fetch(new Request('https://cakeopedia.com/admin/api/enquiries', { headers: { Origin: 'https://cakeopedia.com' } }), env)).status, 401); // reached Access check
  assert.equal(liveHandler(env)!.capabilities.maintenance, true);
  const health = (await (await production.fetch(new Request('https://cakeopedia.com/health'), env)).json()) as { intakeEnabled: boolean; adminEnabled: boolean };
  assert.deepEqual(health, { stage: 'local-foundation', intakeEnabled: false, adminEnabled: true } as never);
});

test('with the owner area off, public intake still works and private routes answer 503 admin_not_enabled', async () => {
  const env = full({ ADMIN_ENABLED: '0' });
  const admin = await production.fetch(new Request('https://cakeopedia.com/admin/api/enquiries', { headers: { Origin: 'https://cakeopedia.com' } }), env);
  assert.equal(admin.status, 503); assert.deepEqual(await admin.json(), { error: 'admin_not_enabled' });
  const intake = await production.fetch(new Request('https://cakeopedia.com/api/enquiries', { method: 'POST', headers: { Origin: 'https://cakeopedia.com', 'Content-Type': 'application/json' }, body: '{}' }), env);
  assert.equal(intake.status, 429); // reached the throttle (no trusted client network), not the closed gate
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

test('video is served with byte ranges even when intake and admin are closed, and only through the assets binding', async () => {
  const assets = { fetch: async () => new Response(new Uint8Array(50), { headers: { 'Content-Type': 'video/mp4' } }) };
  const r = await production.fetch(new Request('https://cakeopedia.com/media/video/a.mp4', { headers: { Range: 'bytes=0-9' } }), { ASSETS: assets } as never);
  assert.equal(r.status, 206); assert.equal(r.headers.get('Content-Range'), 'bytes 0-9/50');
  assert.equal((await production.fetch(new Request('https://cakeopedia.com/media/video/a.mp4'))).status, 503); // no assets binding: closed, not a crash
  assert.equal((await production.fetch(new Request('https://cakeopedia.com/media/video/a.mp4', { method: 'POST' }), { ASSETS: assets } as never)).status, 503); // writes never reach it
});
