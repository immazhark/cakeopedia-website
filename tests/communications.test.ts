import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { Miniflare } from 'miniflare';
import type { AccessConfig } from '../worker/auth.ts';
import type { MailTransport } from '../worker/communications.ts';
import { handleInbox, type InboxDb } from '../worker/inbox.ts';
import type { Delivery } from '../worker/outbox.ts';

const ISS = 'https://synthetic.cloudflareaccess.invalid', AUD = 'a', ORIGIN = 'https://admin.example.invalid', OWNER = 'owner@example.invalid', NOW = 1_800_000_000;
const b64u = (b: ArrayBuffer | string) => Buffer.from(typeof b === 'string' ? b : new Uint8Array(b)).toString('base64url');
let keys: CryptoKeyPair, cfg: AccessConfig, mf: Miniflare, db: Awaited<ReturnType<Miniflare['getD1Database']>>, token: string;
before(async () => {
  keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k' };
  cfg = { issuer: ISS, audience: AUD, operators: new Set([OWNER]), getKeys: async () => [jwk], now: () => NOW, origin: ORIGIN };
  const data = `${b64u(JSON.stringify({ alg: 'RS256', kid: 'k' }))}.${b64u(JSON.stringify({ iss: ISS, aud: [AUD], exp: NOW + 600, email: OWNER }))}`;
  token = `${data}.${b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(data)))}`;
  mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("t"); } }', compatibilityDate: '2026-07-30', d1Databases: ['DB'] });
  db = await mf.getD1Database('DB');
  for (const f of (await readdir(new URL('../migrations/', import.meta.url))).sort()) {
    const sql = (await readFile(new URL(`../migrations/${f}`, import.meta.url), 'utf8')).replace(/^--.*$/gm, '');
    await db.batch(sql.split(';').map((s) => s.trim()).filter(Boolean).map((s) => db.prepare(s)));
  }
});
after(async () => { await mf?.dispose(); });

let clock = 7000, mail: MailTransport | undefined;
const sent: { payload: string; key: string }[] = [];
let next: Delivery = { kind: 'accepted', providerId: 'prov_1' };
const transport = (): MailTransport => ({ from: 'hello@notify.example.invalid', replyTo: 'contact@example.invalid', send: async (payload, key) => { sent.push({ payload, key }); return next; } });
const call = (path: string, method = 'GET', body?: object) => handleInbox(new Request(`${ORIGIN}${path}`, {
  method, ...(body ? { body: JSON.stringify(body) } : {}),
  headers: { 'Cf-Access-Jwt-Assertion': token, ...(method !== 'GET' ? { Origin: ORIGIN, 'X-Cakeopedia-Admin': '1', 'Content-Type': 'application/json' } : {}) },
}), db as unknown as InboxDb, cfg, () => clock, undefined, undefined, mail);
const json = async <T = Record<string, any>>(r: Response) => (await r.json()) as T;
async function seed(contact: object = { kind: 'email', value: 'real@example.invalid' }): Promise<string> {
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO enquiries (id, submission_id, payload_hash, public_reference, created_at, payload_json) VALUES (?,?,?,?,?,?)').bind(id, crypto.randomUUID(), 'h', `CK-${id}`, 1, JSON.stringify({ name: 'Real Person', contact })).run();
  return id;
}
const send = (id: string, body: object) => call(`/admin/api/enquiries/${id}/messages`, 'POST', { template: 'reply', requestId: crypto.randomUUID(), subject: 'Hello', body: 'Hi there', ...body });

test('with mail off, drafts and history work but nothing can be sent or stored', async () => {
  mail = undefined; sent.length = 0;
  const id = await seed();
  const d = await json(await call(`/admin/api/enquiries/${id}/messages/draft`, 'POST', { template: 'reply' }));
  assert.equal(d.to, 'real@example.invalid'); assert.equal(d.from, null);
  assert.equal((await send(id, {})).status, 503);
  assert.equal((await call(`/admin/api/messages/${crypto.randomUUID()}/retry`, 'POST')).status, 503);
  const h = await json(await call(`/admin/api/enquiries/${id}/messages`));
  assert.deepEqual([h.items, h.mailEnabled], [[], false]);
  assert.equal(sent.length, 0);
});

test('send: payload hides the owner mailbox, key is the row id, double tap sends once, history records it', async () => {
  mail = transport(); sent.length = 0; next = { kind: 'accepted', providerId: 'prov_1' };
  const id = await seed(), requestId = crypto.randomUUID();
  const r = await json(await send(id, { requestId }));
  assert.equal(r.message.state, 'accepted');
  const p = JSON.parse(sent[0]!.payload);
  assert.deepEqual([p.from, p.to, p.reply_to, sent[0]!.key], ['hello@notify.example.invalid', ['real@example.invalid'], ['contact@example.invalid'], requestId]);
  assert.ok(!sent[0]!.payload.includes(OWNER));
  const again = await json(await send(id, { requestId }));
  assert.equal(again.replay, true); assert.equal(sent.length, 1);
  assert.equal((await send(await seed(), { requestId })).status, 409); // id belongs to another enquiry
  const h = await json(await call(`/admin/api/enquiries/${id}/messages`));
  assert.equal(h.items.length, 1); assert.deepEqual([h.items[0].direction, h.items[0].channel, h.items[0].deliveryStatus], ['outbound', 'resend', null]);
});

test('send is refused for bad input, missing preconditions and non-email contacts', async () => {
  mail = transport(); sent.length = 0;
  const id = await seed();
  for (const bad of [{ subject: 'a\r\nBcc: x@example.invalid' }, { subject: '' }, { body: ' ' }, { body: 'x'.repeat(8001) }, { requestId: 'nope' }, { template: 'bogus' }])
    assert.equal((await send(id, bad)).status, 400, JSON.stringify(bad).slice(0, 40));
  assert.equal((await send(id, { template: 'quotation' })).status, 409);
  assert.equal((await send(id, { template: 'confirmation' })).status, 409);
  assert.equal((await send(id, { template: 'reminder' })).status, 409);
  assert.equal((await send(await seed({ kind: 'phone', value: '5125550100' }), {})).status, 409);
  assert.equal((await send(crypto.randomUUID(), {})).status, 404);
  assert.equal(sent.length, 0);
});

test('quotation, confirmation and reminder drafts use the stored quote and recorded payments', async () => {
  mail = transport();
  const id = await seed(), u = (s: string) => `/admin/api/enquiries/${id}/${s}`;
  await call(u('quote'), 'POST', { totalCents: 20000, depositCents: 10000, fulfilment: 'pickup', date: '2026-12-12', time: '14:30', expectedVersion: 0, designNotes: 'blue roses' });
  const q = await json(await call(u('messages/draft'), 'POST', { template: 'quotation' }));
  for (const s of ['Hi Real,', 'Total: $200.00', 'Deposit: $100.00', 'Balance: $100.00', 'Saturday, December 12, 2026 at 14:30', 'blue roses', 'Austin time']) assert.ok(q.body.includes(s), s);
  assert.equal((await call(u('messages/draft'), 'POST', { template: 'confirmation' })).status, 409);
  await call(u('payments'), 'POST', { requestId: crypto.randomUUID(), kind: 'deposit', amountCents: 10000, receivedOn: '2026-11-20' });
  await call(u('status'), 'POST', { status: 'confirmed', expected: 'new' });
  const c = await json(await call(u('messages/draft'), 'POST', { template: 'confirmation' }));
  assert.ok(c.body.includes('deposit of $100.00') && c.body.includes('Balance remaining: $100.00'));
  const rem = await json(await call(u('messages/draft'), 'POST', { template: 'reminder' }));
  assert.ok(rem.body.includes('$100.00'));
  await call(u('payments'), 'POST', { requestId: crypto.randomUUID(), kind: 'balance', amountCents: 10000, receivedOn: '2026-11-21' });
  assert.equal((await call(u('messages/draft'), 'POST', { template: 'reminder' })).status, 409); // nothing due
});

test('uncertain and failed sends: retry reuses the same payload and key within the window only', async () => {
  mail = transport(); sent.length = 0; next = { kind: 'unknown' }; clock = 7000;
  const id = await seed(), requestId = crypto.randomUUID();
  assert.equal((await json(await send(id, { requestId }))).message.state, 'unknown');
  next = { kind: 'accepted', providerId: 'prov_2' };
  assert.equal((await json(await call(`/admin/api/messages/${requestId}/retry`, 'POST'))).message.state, 'accepted');
  assert.equal(sent.length, 2); assert.deepEqual([sent[1]!.key, sent[1]!.payload], [sent[0]!.key, sent[0]!.payload]);
  assert.equal((await call(`/admin/api/messages/${requestId}/retry`, 'POST')).status, 409); // accepted: not retryable
  next = { kind: 'permanent' };
  const bad = crypto.randomUUID(); assert.equal((await json(await send(id, { requestId: bad }))).message.state, 'failed');
  assert.equal((await call(`/admin/api/messages/${bad}/retry`, 'POST')).status, 409);
  next = { kind: 'retry', reason: 'quota' };
  const q = crypto.randomUUID(); assert.equal((await json(await send(id, { requestId: q }))).message.state, 'queued');
  clock += 24 * 3_600_000;
  assert.equal((await json(await call(`/admin/api/messages/${q}/retry`, 'POST'))).error, 'retry_window_over');
  clock = 7000;
});

test('erasing a customer blanks sent-message content but keeps the record that a message was sent', async () => {
  mail = transport(); next = { kind: 'accepted', providerId: 'prov_3' };
  const id = await seed(), requestId = crypto.randomUUID();
  await send(id, { requestId, body: 'private words' });
  assert.equal((await call(`/admin/api/enquiries/${id}/erase`, 'POST', { confirmReference: `CK-${id}` })).status, 200);
  const row = await db.prepare('SELECT recipient, subject, body, payload, state FROM communications WHERE id = ?').bind(requestId).first<Record<string, unknown>>();
  assert.deepEqual(row, { recipient: null, subject: null, body: null, payload: null, state: 'accepted' });
  assert.equal((await send(id, {})).status, 409); // erased customers cannot be written to
});
