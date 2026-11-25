import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { Miniflare } from 'miniflare';
import { authorize, verifyAccessJwt, type AccessConfig } from '../worker/auth.ts';
import { handleInbox, type InboxDb } from '../worker/inbox.ts';

const ISS = 'https://synthetic.cloudflareaccess.invalid', AUD = 'synthetic-aud', ORIGIN = 'https://admin.example.invalid', OWNER = 'owner@example.invalid';
const NOW = 1_800_000_000;
const b64u = (b: ArrayBuffer | Uint8Array | string) => Buffer.from(typeof b === 'string' ? b : new Uint8Array(b)).toString('base64url');
const pair = async () => crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
let good: CryptoKeyPair, other: CryptoKeyPair, cfg: AccessConfig;
async function sign(keys: CryptoKeyPair, claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid: 'k1' }) {
  const data = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify({ iss: ISS, aud: [AUD], exp: NOW + 600, email: OWNER, ...claims }))}`;
  return `${data}.${b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(data)))}`;
}
let mf: Miniflare, db: Awaited<ReturnType<Miniflare['getD1Database']>>;
before(async () => {
  good = await pair(); other = await pair();
  const jwk = { ...(await crypto.subtle.exportKey('jwk', good.publicKey)), kid: 'k1' };
  cfg = { issuer: ISS, audience: AUD, operators: new Set([OWNER]), getKeys: async () => [jwk], now: () => NOW, origin: ORIGIN };
  mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("t"); } }', compatibilityDate: '2026-07-30', d1Databases: ['DB'] });
  db = await mf.getD1Database('DB');
  for (const f of ['0001_enquiries.sql', '0002_outbox_leases.sql', '0003_uploads.sql', '0004_enquiry_events.sql', '0005_orders.sql']) {
    const sql = (await readFile(new URL(`../migrations/${f}`, import.meta.url), 'utf8')).replace(/^--.*$/gm, '');
    await db.batch(sql.split(';').map((s) => s.trim()).filter(Boolean).map((s) => db.prepare(s)));
  }
});
after(async () => { await mf?.dispose(); });

test('valid Access token authenticates only allow-listed operators', async () => {
  assert.equal(await verifyAccessJwt(await sign(good, {}), cfg), OWNER);
  assert.equal(await verifyAccessJwt(await sign(good, { email: 'Owner@Example.invalid' }), cfg), OWNER); // case-insensitive
});

test('every other token shape is rejected', async () => {
  const bad: [string, string | null][] = [
    ['missing', null], ['garbage', 'a.b'], ['not base64', '!!!.???.***'],
    ['wrong signer', await sign(other, {})],
    ['wrong audience', await sign(good, { aud: ['other'] })],
    ['wrong issuer', await sign(good, { iss: 'https://evil.example' })],
    ['expired', await sign(good, { exp: NOW - 1 })],
    ['not yet valid', await sign(good, { nbf: NOW + 3600 })],
    ['not an operator', await sign(good, { email: 'stranger@example.invalid' })],
    ['no email', await sign(good, { email: undefined })],
    ['alg none', `${b64u('{"alg":"none","kid":"k1"}')}.${b64u(JSON.stringify({ iss: ISS, aud: [AUD], exp: NOW + 600, email: OWNER }))}.`],
    ['HS256', await sign(good, {}, { alg: 'HS256', kid: 'k1' })],
    ['unknown kid', await sign(good, {}, { alg: 'RS256', kid: 'nope' })],
  ];
  for (const [name, token] of bad) assert.equal(await verifyAccessJwt(token, cfg), null, name);
  const tampered = (await sign(good, {})).split('.'); tampered[1] = b64u(JSON.stringify({ iss: ISS, aud: [AUD], exp: NOW + 600, email: 'stranger@example.invalid' }));
  assert.equal(await verifyAccessJwt(tampered.join('.'), cfg), null, 'payload tampering');
});

test('mutations need same-origin Origin and the admin header (CSRF)', async () => {
  const jwt = await sign(good, {});
  const req = (h: Record<string, string>) => authorize(new Request(`${ORIGIN}/admin/api/x`, { method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': jwt, ...h } }), cfg);
  assert.equal((await req({})).ok, false);
  assert.equal((await req({ Origin: 'https://evil.example', 'X-Cakeopedia-Admin': '1' })).ok, false);
  assert.equal((await req({ Origin: ORIGIN })).ok, false);
  assert.equal((await req({ Origin: ORIGIN, 'X-Cakeopedia-Admin': '1' })).ok, true);
});

async function seed(n: number) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = crypto.randomUUID(); ids.push(id);
    await db.prepare('INSERT INTO enquiries (id, submission_id, payload_hash, public_reference, created_at, payload_json) VALUES (?,?,?,?,?,?)')
      .bind(id, crypto.randomUUID(), 'h', `CK-${id}`, 1000 + i, JSON.stringify({ name: `Synthetic ${i}`, occasion: 'Birthday', eventDate: null })).run();
  }
  return ids;
}
const call = async (path: string, init: RequestInit = {}, token?: string) => {
  const jwt = token ?? await sign(good, {});
  const headers = { 'Cf-Access-Jwt-Assertion': jwt, ...(init.method && init.method !== 'GET' ? { Origin: ORIGIN, 'X-Cakeopedia-Admin': '1', 'Content-Type': 'application/json' } : {}) };
  return handleInbox(new Request(`${ORIGIN}${path}`, { ...init, headers }), db as unknown as InboxDb, cfg, () => 5000);
};

test('inbox: unauthenticated and non-operator requests are denied on every route', async () => {
  const [id] = await seed(1);
  const stranger = await sign(good, { email: 'stranger@example.invalid' });
  for (const [path, init] of [['/admin/api/enquiries', {}], [`/admin/api/enquiries/${id}`, {}], [`/admin/api/enquiries/${id}/status`, { method: 'POST', body: '{}' }]] as const) {
    assert.equal((await handleInbox(new Request(`${ORIGIN}${path}`, init), db as unknown as InboxDb, cfg)).status, 401, path);
    assert.equal((await call(path, init, stranger)).status, 401, path);
  }
});

test('inbox: keyset pagination is bounded, ordered and complete', async () => {
  await seed(7);
  const seen: string[] = [];
  let pages = 0;
  type Key = { beforeAt: number; beforeId: string };
  let next: Key | null = null;
  do {
    const q: string = `/admin/api/enquiries?limit=3${next ? `&beforeAt=${next.beforeAt}&beforeId=${next.beforeId}` : ''}`;
    const body = (await (await call(q)).json()) as { items: { id: string; createdAt: number }[]; next: Key | null };
    assert.ok(body.items.length <= 3);
    seen.push(...body.items.map((i) => i.id)); next = body.next; pages++;
  } while (next && pages < 20);
  assert.equal(new Set(seen).size, seen.length, 'no duplicates across pages');
  const total = (await db.prepare('SELECT count(*) AS n FROM enquiries').first<{ n: number }>())!.n;
  assert.equal(seen.length, total);
  assert.equal((await call('/admin/api/enquiries?limit=999')).status, 200);
  assert.equal((await call('/admin/api/enquiries?status=booked')).status, 400);
});

test('status workflow: history, optimistic concurrency, legacy booked mapping, no silent overwrites', async () => {
  const [id] = await seed(1);
  const get = async () => (await (await call(`/admin/api/enquiries/${id}`)).json()) as { status: string; events: { status: string; actor: string; at: number }[]; payload: { name: string } };
  assert.equal((await get()).status, 'new');
  const post = (b: object) => call(`/admin/api/enquiries/${id}/status`, { method: 'POST', body: JSON.stringify(b) });
  assert.equal((await post({ status: 'replied', expected: 'new', note: 'Replied by text' })).status, 200);
  assert.equal((await post({ status: 'quoted', expected: 'new' })).status, 409); // stale view of the enquiry
  assert.equal((await post({ status: 'replied', expected: 'replied' })).status, 400); // no-op
  assert.equal((await post({ status: 'booked', expected: 'replied' })).status, 400); // not in the vocabulary
  assert.equal((await post({ status: 'quoted', expected: 'replied' })).status, 200);
  assert.equal((await post({ status: 'replied', expected: 'quoted', note: 'correction' })).status, 200); // corrections are new events
  const d = await get();
  assert.deepEqual(d.events.map((e) => e.status), ['replied', 'quoted', 'replied']);
  assert.ok(d.events.every((e) => e.actor === OWNER && e.at === 5000));
  // legacy column value 'booked' reads as confirmed
  const [legacy] = await seed(1);
  await db.prepare("UPDATE enquiries SET status = 'booked' WHERE id = ?").bind(legacy).run();
  assert.equal(((await (await call(`/admin/api/enquiries/${legacy}`)).json()) as { status: string }).status, 'confirmed');
  assert.equal((await call('/admin/api/enquiries/not-a-uuid')).status, 404);
  const filtered = (await (await call('/admin/api/enquiries?status=confirmed&limit=50')).json()) as { items: { id: string }[] };
  assert.ok(filtered.items.some((i) => i.id === legacy));
});
