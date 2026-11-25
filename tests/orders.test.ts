import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { Miniflare } from 'miniflare';
import type { AccessConfig } from '../worker/auth.ts';
import { handleInbox, type InboxDb } from '../worker/inbox.ts';

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

const call = (path: string, method = 'GET', body?: object, jwt: string | null = token) => handleInbox(new Request(`${ORIGIN}${path}`, {
  method, ...(body ? { body: JSON.stringify(body) } : {}),
  headers: { ...(jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {}), ...(method !== 'GET' ? { Origin: ORIGIN, 'X-Cakeopedia-Admin': '1', 'Content-Type': 'application/json' } : {}) },
}), spy as unknown as InboxDb, cfg, () => 7000);
// Fault injection: run a competing operation once, immediately before the first statement matching `match`.
let race: { match: RegExp; run: () => Promise<unknown> } | null = null;
const wrap = (st: any, sql: string): any => new Proxy(st, { get: (t, k) => k === 'bind' ? (...a: unknown[]) => wrap(t.bind(...a), sql) : k === 'sql' ? sql : k === 'run' ? async () => { await fire(sql); return t.run(); } : k === 'first' ? async () => { await fire(sql); return t.first(); } : Reflect.get(t, k) });
async function fire(sql: string) { const r = race; if (r && r.match.test(sql)) { race = null; await r.run(); } }
const spy = { prepare: (sql: string) => wrap(db.prepare(sql), sql), batch: (s: any[]) => (async () => { for (const x of s) await fire(x.sql); return db.batch(s); })() };
const json = async <T = Record<string, unknown>>(r: Response) => (await r.json()) as T;
async function seed(): Promise<string> {
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO enquiries (id, submission_id, payload_hash, public_reference, created_at, payload_json) VALUES (?,?,?,?,?,?)').bind(id, crypto.randomUUID(), 'h', `CK-${id}`, 1, JSON.stringify({ name: 'Synthetic Order' })).run();
  return id;
}
const quote = (over: Record<string, unknown> = {}) => ({ totalCents: 15000, depositCents: 5000, fulfilment: 'pickup', date: '2026-12-12', time: '14:30', expectedVersion: 0, ...over });

test('quotes are versioned, validated and never overwrite each other', async () => {
  const id = await seed(), url = `/admin/api/enquiries/${id}/quote`;
  assert.equal((await call(url, 'POST', quote())).status, 201);
  assert.equal((await call(url, 'POST', quote())).status, 409); // stale expectedVersion
  for (const bad of [{ depositCents: 20000 }, { totalCents: 150.5 }, { totalCents: -1 }, { date: '2026-02-30' }, { time: '25:00' }, { fulfilment: 'courier' }, { expectedVersion: 'x' }, { designNotes: 'x'.repeat(2001) }])
    assert.equal((await call(url, 'POST', quote({ expectedVersion: 1, ...bad }))).status, 400, JSON.stringify(bad));
  assert.equal((await call(url, 'POST', quote({ expectedVersion: 1, totalCents: 17500, depositCents: 7500 }))).status, 201);
  const detail = await json<{ order: { quote: { version: number; totalCents: number } } }>(await call(`/admin/api/enquiries/${id}`));
  assert.deepEqual([detail.order.quote.version, detail.order.quote.totalCents], [2, 17500]);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM quotes WHERE enquiry_id = ?').bind(id).first<{ n: number }>())!.n, 2);
});

test('payments are exact integer records; balance follows; mistakes are voided, never deleted', async () => {
  const id = await seed(), pay = `/admin/api/enquiries/${id}/payments`;
  await call(`/admin/api/enquiries/${id}/quote`, 'POST', quote({ totalCents: 12345, depositCents: 4115 }));
  const ok = { kind: 'deposit', amountCents: 4115, receivedOn: '2026-11-20', note: 'Zelle, checked by owner' };
  for (const bad of [{ amountCents: 0 }, { amountCents: 10.5 }, { amountCents: -5 }, { kind: 'tip' }, { receivedOn: '2026-13-01' }]) assert.equal((await call(pay, 'POST', { ...ok, ...bad })).status, 400, JSON.stringify(bad));
  const { id: pid } = await json<{ id: string }>(await call(pay, 'POST', ok));
  const bal = async () => (await json<{ order: { balanceCents: number; paidCents: number } }>(await call(`/admin/api/enquiries/${id}`))).order;
  assert.deepEqual([(await bal()).paidCents, (await bal()).balanceCents], [4115, 8230]);
  assert.equal((await call(`${pay}/${pid}/void`, 'POST', {})).status, 400); // a reason is required
  assert.equal((await call(`${pay}/${pid}/void`, 'POST', { reason: 'Entered twice' })).status, 200);
  assert.equal((await call(`${pay}/${pid}/void`, 'POST', { reason: 'again' })).status, 409);
  assert.deepEqual([(await bal()).paidCents, (await bal()).balanceCents], [0, 12345]);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM payments WHERE enquiry_id = ?').bind(id).first<{ n: number }>())!.n, 1); // history retained
  assert.equal((await call(`/admin/api/enquiries/${crypto.randomUUID()}/payments`, 'POST', ok)).status, 404);
});

test('confirming requires a quote and the owner-recorded deposit', async () => {
  const id = await seed();
  const confirm = (expected: string) => call(`/admin/api/enquiries/${id}/status`, 'POST', { status: 'confirmed', expected });
  assert.deepEqual(await json(await confirm('new')), { error: 'no_quote' });
  await call(`/admin/api/enquiries/${id}/quote`, 'POST', quote({ totalCents: 20000, depositCents: 5000 }));
  await call(`/admin/api/enquiries/${id}/payments`, 'POST', { kind: 'deposit', amountCents: 4999, receivedOn: '2026-11-20' });
  assert.deepEqual(await json(await confirm('new')), { error: 'deposit_not_recorded' });
  await call(`/admin/api/enquiries/${id}/payments`, 'POST', { kind: 'deposit', amountCents: 1, receivedOn: '2026-11-21' });
  assert.equal((await confirm('new')).status, 200);
});

test('calendar lists confirmed orders only, with dates exactly as stored (DST-safe), plus busy dates', async () => {
  const mk = async (date: string, time: string, confirmed: boolean) => {
    const id = await seed();
    await call(`/admin/api/enquiries/${id}/quote`, 'POST', quote({ date, time, depositCents: 0, prepNotes: 'Bake day before' }));
    if (confirmed) await call(`/admin/api/enquiries/${id}/status`, 'POST', { status: 'confirmed', expected: 'new' });
    return id;
  };
  const spring = await mk('2027-03-14', '00:30', true), fall = await mk('2027-11-07', '01:30', true), pending = await mk('2027-03-15', '10:00', false);
  assert.equal((await call('/admin/api/busy/2027-03-20', 'PUT', { note: 'Family event' })).status, 200);
  const cal = await json<{ orders: { id: string; date: string; time: string }[]; busy: { date: string }[] }>(await call('/admin/api/calendar?from=2027-03-01&to=2027-12-01'));
  const byId = Object.fromEntries(cal.orders.map((o) => [o.id, o]));
  assert.deepEqual([byId[spring]?.date, byId[spring]?.time, byId[fall]?.date, byId[fall]?.time], ['2027-03-14', '00:30', '2027-11-07', '01:30']);
  assert.equal(byId[pending], undefined);
  assert.deepEqual(cal.busy.map((b) => b.date), ['2027-03-20']);
  assert.equal((await call('/admin/api/busy/2027-03-20', 'DELETE')).status, 204);
  assert.equal((await call('/admin/api/calendar?from=2027-01-01&to=2028-06-01')).status, 400); // window over 366 days
  assert.equal((await call('/admin/api/busy/2027-02-30', 'PUT', {})).status, 400);
});

test('manual Instagram enquiry uses the same validation, starts as new and sends no notifications', async () => {
  const res = await call('/admin/api/enquiries', 'POST', { name: 'Insta Customer', contact: { kind: 'instagram', value: '@insta.customer' }, dateUndecided: false, eventDate: '2027-05-01', notes: 'Ordered by DM' });
  assert.equal(res.status, 201);
  const { id } = await json<{ id: string }>(res);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM notification_outbox WHERE enquiry_id = ?').bind(id).first<{ n: number }>())!.n, 0);
  const d = await json<{ status: string; payload: { contact: { value: string } }; events: { note: string }[] }>(await call(`/admin/api/enquiries/${id}`));
  assert.deepEqual([d.status, d.payload.contact.value, d.events[0]?.note], ['new', 'insta.customer', 'Added manually by the owner']);
  assert.equal((await call('/admin/api/enquiries', 'POST', { name: '', contact: { kind: 'email', value: 'x' }, dateUndecided: true })).status, 400);
});

test('every order route requires authentication and CSRF protection', async () => {
  const id = await seed();
  const routes: [string, string][] = [['GET', '/admin/api/calendar?from=2027-01-01&to=2027-02-01'], ['GET', '/admin/api/busy'], ['PUT', '/admin/api/busy/2027-01-01'], ['POST', '/admin/api/enquiries'], ['POST', `/admin/api/enquiries/${id}/quote`], ['POST', `/admin/api/enquiries/${id}/payments`]];
  for (const [m, p] of routes) assert.equal((await call(p, m, m === 'GET' ? undefined : {}, null)).status, 401, `${m} ${p}`);
  const noCsrf = await handleInbox(new Request(`${ORIGIN}/admin/api/busy/2027-01-01`, { method: 'PUT', headers: { 'Cf-Access-Jwt-Assertion': token }, body: '{}' }), db as unknown as InboxDb, cfg);
  assert.equal(noCsrf.status, 403);
});

test('lost responses and double taps replay the same result instead of duplicating money records', async () => {
  const id = await seed(), pay = `/admin/api/enquiries/${id}/payments`;
  await call(`/admin/api/enquiries/${id}/quote`, 'POST', quote({ totalCents: 20000, depositCents: 5000 }));
  const requestId = crypto.randomUUID(), body = { requestId, kind: 'deposit', amountCents: 5000, receivedOn: '2026-11-20' };
  const [a, b] = await Promise.all([call(pay, 'POST', body), call(pay, 'POST', body)]); // two taps at once
  const [ja, jb] = [await json<{ id: string }>(a), await json<{ id: string }>(b)];
  assert.deepEqual([[a.status, b.status].sort(), ja.id], [[200, 201], jb.id]);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM payments WHERE enquiry_id = ?').bind(id).first<{ n: number }>())!.n, 1);
  assert.equal((await call(pay, 'POST', { ...body, amountCents: 6000 })).status, 409); // same key, different content
  // quote replay after a lost response: same requestId returns the stored version rather than a confusing conflict
  const q = quote({ requestId: crypto.randomUUID(), totalCents: 30000, depositCents: 5000, expectedVersion: 1 });
  assert.deepEqual([(await call(`/admin/api/enquiries/${id}/quote`, 'POST', q)).status, (await json(await call(`/admin/api/enquiries/${id}/quote`, 'POST', q)))], [201, { version: 2 }]);
  // manual enquiry replay creates exactly one enquiry
  const m = { requestId: crypto.randomUUID(), name: 'Tap Twice', contact: { kind: 'instagram', value: '@tap.twice' }, dateUndecided: true };
  const first = await json<{ id: string }>(await call('/admin/api/enquiries', 'POST', m)), second = await json<{ id: string }>(await call('/admin/api/enquiries', 'POST', m));
  assert.equal(first.id, second.id);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM enquiries WHERE json_extract(payload_json,'$.name') = 'Tap Twice'").first<{ n: number }>())!.n, 1);
});

test('payments cannot exceed the quote and a confirmed order cannot be silently undermined', async () => {
  const id = await seed(), pay = `/admin/api/enquiries/${id}/payments`, qurl = `/admin/api/enquiries/${id}/quote`;
  const p = (amountCents: number, kind = 'deposit') => call(pay, 'POST', { requestId: crypto.randomUUID(), kind, amountCents, receivedOn: '2026-11-20' });
  assert.deepEqual(await json(await p(100)), { error: 'no_quote' });
  await call(qurl, 'POST', quote({ totalCents: 10000, depositCents: 3000 }));
  const over = await p(10001);
  assert.deepEqual([over.status, (await json(over))], [409, { error: 'exceeds_balance', balanceCents: 10000 }]);
  const dep = await json<{ id: string }>(await p(3000));
  assert.equal((await call(`/admin/api/enquiries/${id}/status`, 'POST', { status: 'confirmed', expected: 'new' })).status, 200);
  assert.deepEqual(await json(await call(`${pay}/${dep.id}/void`, 'POST', { reason: 'typo' })), { error: 'would_unconfirm' }); // void would drop below deposit
  assert.deepEqual(await json(await call(qurl, 'POST', quote({ expectedVersion: 1, totalCents: 10000, depositCents: 4000 }))), { error: 'would_unconfirm' });
  assert.deepEqual(await json(await call(qurl, 'POST', quote({ expectedVersion: 1, totalCents: 2000, depositCents: 1000 }))), { error: 'below_paid', paidCents: 3000 });
  assert.equal((await call(qurl, 'POST', quote({ expectedVersion: 1, totalCents: 12000, depositCents: 3000 }))).status, 201);
  assert.equal((await call(`${pay}/${dep.id}/void`, 'POST', { reason: 'typo' })).status, 409); // still confirmed, still needs the deposit
});

test('owner menu: drafts stay private, edits are compare-and-set, replays succeed, export is approved-only', async () => {
  const item = (over: Record<string, unknown> = {}) => ({ id: 'synthetic-menu', title: 'Synthetic', category: 'Test', status: 'draft', availability: 'available', kind: 'custom', sizes: [], flavours: [], fillings: [], addons: [], ingredientNote: null, ...over });
  const put = (id: string, expectedRevision: number | null, it: object) => call(`/admin/api/menu/${id}`, 'PUT', { expectedRevision, item: it });
  assert.equal((await put('synthetic-menu', null, item())).status, 201);
  assert.equal((await put('synthetic-menu', null, item())).status, 409); // cannot re-create
  assert.equal((await put('other-id', null, item())).status, 400); // body id must match the path
  assert.equal((await put('synthetic-menu', 1, item({ revision: 9 }))).status, 400); // clients cannot set server fields
  assert.equal((await put('synthetic-menu', 1, item({ status: 'published' }))).status, 400); // publishing needs a size
  const pub = item({ status: 'published', sizes: [{ label: 'Six inch', layers: 2, servings: { min: 6, max: 8 }, priceCents: 5500 }] });
  const [a, b] = await Promise.all([put('synthetic-menu', 1, pub), put('synthetic-menu', 1, { ...pub, title: 'Other' })]); // two phones, same revision
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const again = await put('synthetic-menu', 1, a.status === 200 ? pub : { ...pub, title: 'Other' }); // the winner's response was lost
  assert.deepEqual([again.status, (await json(again) as { replay?: boolean }).replay], [200, true]);
  assert.equal((await put('hidden-draft', null, item({ id: 'hidden-draft' }))).status, 201);
  const exported = await json<{ items: { id: string }[] }>(await call('/admin/api/menu/export'));
  assert.deepEqual(exported.items.map((i) => i.id), ['synthetic-menu']); // draft excluded
  const hist = await json<{ versions: { revision: number; title: string }[] }>(await call('/admin/api/menu/synthetic-menu/history'));
  assert.deepEqual(hist.versions.map((v) => v.revision), [2, 1]); // the lost race and the replay wrote nothing extra
  assert.equal(hist.versions[1]!.title, 'Synthetic');
  assert.equal((await call('/admin/api/menu/synthetic-menu/history', 'GET', undefined, null)).status, 401);
  assert.equal((await call('/admin/api/menu', 'GET', undefined, null)).status, 401);
});

// ---- financial invariants hold atomically against a competing operation landing between check and write
const url = (id: string, tail: string) => `/admin/api/enquiries/${id}/${tail}`;
const pay = (id: string, amountCents: number, extra: Record<string, unknown> = {}) => call(url(id, 'payments'), 'POST', { requestId: crypto.randomUUID(), kind: 'deposit', amountCents, receivedOn: '2026-11-20', ...extra });
const status = async (id: string) => (await json<{ status: string }>(await call(`/admin/api/enquiries/${id}`))).status;

test('race: a deposit voided between the confirmation check and write cannot leave a confirmed order', async () => {
  const id = await seed();
  await call(url(id, 'quote'), 'POST', quote({ totalCents: 20000, depositCents: 5000 }));
  const { id: pid } = await json<{ id: string }>(await pay(id, 5000));
  race = { match: /INSERT INTO enquiry_events/, run: () => call(url(id, `payments/${pid}/void`), 'POST', { reason: 'typo' }) };
  const r = await call(url(id, 'status'), 'POST', { status: 'confirmed', expected: 'new' });
  race = null;
  assert.equal(r.status, 409);
  assert.notEqual(await status(id), 'confirmed');
});
test('race: two concurrent voids cannot both drop a confirmed order below its deposit', async () => {
  const id = await seed();
  await call(url(id, 'quote'), 'POST', quote({ totalCents: 20000, depositCents: 3000 }));
  const a = await json<{ id: string }>(await pay(id, 3000)), b = await json<{ id: string }>(await pay(id, 3000));
  assert.equal((await call(url(id, 'status'), 'POST', { status: 'confirmed', expected: 'new' })).status, 200);
  race = { match: /UPDATE payments SET voided_at/, run: () => call(url(id, `payments/${b.id}/void`), 'POST', { reason: 'x' }) };
  const r = await call(url(id, `payments/${a.id}/void`), 'POST', { reason: 'y' });
  race = null;
  assert.equal(r.status, 409);
  const s = (await json<{ order: { depositPaidCents: number } }>(await call(`/admin/api/enquiries/${id}`))).order;
  assert.ok(s.depositPaidCents >= 3000);
});
test('race: a quote revision cannot raise the deposit past what a concurrent void left paid', async () => {
  const id = await seed();
  await call(url(id, 'quote'), 'POST', quote({ totalCents: 20000, depositCents: 3000 }));
  await pay(id, 3000); const b = await json<{ id: string }>(await pay(id, 2000));
  assert.equal((await call(url(id, 'status'), 'POST', { status: 'confirmed', expected: 'new' })).status, 200);
  race = { match: /INSERT INTO quotes/, run: () => call(url(id, `payments/${b.id}/void`), 'POST', { reason: 'x' }) };
  const r = await call(url(id, 'quote'), 'POST', quote({ totalCents: 20000, depositCents: 5000, expectedVersion: 1 }));
  race = null;
  assert.equal(r.status, 409);
  const s = (await json<{ order: { quote: { depositCents: number }; depositPaidCents: number } }>(await call(`/admin/api/enquiries/${id}`))).order;
  assert.ok(s.depositPaidCents >= s.quote.depositCents);
});
test('race: a payment landing after the total is lowered cannot exceed the new total', async () => {
  const id = await seed();
  await call(url(id, 'quote'), 'POST', quote({ totalCents: 20000, depositCents: 5000 }));
  await pay(id, 9000);
  race = { match: /INSERT INTO quotes/, run: () => pay(id, 5000, { kind: 'balance' }) };
  const r = await call(url(id, 'quote'), 'POST', quote({ totalCents: 12000, depositCents: 5000, expectedVersion: 1 }));
  race = null;
  assert.equal(r.status, 409);
});
test('replays compare the whole payload: changed time, notes or fulfilment is request_reused', async () => {
  const id = await seed(), requestId = crypto.randomUUID();
  assert.equal((await call(url(id, 'quote'), 'POST', quote({ requestId, designNotes: 'a' }))).status, 201);
  assert.equal((await call(url(id, 'quote'), 'POST', quote({ requestId, designNotes: 'a' }))).status, 200);
  for (const over of [{ time: '15:00' }, { designNotes: 'b' }, { prepNotes: 'p' }, { fulfilment: 'delivery' }, { time: null }])
    assert.deepEqual(await json(await call(url(id, 'quote'), 'POST', quote({ requestId, designNotes: 'a', ...over }))), { error: 'request_reused' });
  const pr = crypto.randomUUID(), body = { requestId: pr, kind: 'deposit', amountCents: 100, receivedOn: '2026-11-20', note: 'one' };
  assert.equal((await call(url(id, 'payments'), 'POST', body)).status, 201);
  assert.equal((await call(url(id, 'payments'), 'POST', body)).status, 200);
  assert.deepEqual(await json(await call(url(id, 'payments'), 'POST', { ...body, note: 'two' })), { error: 'request_reused' });
});
test('manual enquiry: a concurrent twin with a different payload is request_reused, not silently accepted', async () => {
  const requestId = crypto.randomUUID(), man = (name: string) => ({ requestId, name, contact: { kind: 'instagram', value: '@a.b' }, dateUndecided: false, eventDate: '2027-05-01', notes: 'DM' });
  const twin = () => call('/admin/api/enquiries', 'POST', man('Twin Person'));
  race = { match: /INSERT INTO enquiries/, run: twin };
  const r = await call('/admin/api/enquiries', 'POST', man('Other Person'));
  race = null;
  assert.equal(r.status, 409);
});
test('request bodies are bounded and list parameters validated', async () => {
  const id = await seed();
  assert.equal((await call(url(id, 'quote'), 'POST', quote({ designNotes: 'x'.repeat(70_000) }))).status, 413);
  assert.equal((await call('/admin/api/busy?from=garbage')).status, 400);
});
