import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { handleEnquiry, type Dependencies } from '../worker/enquiries.ts';
import { EnquiryStore, type Database } from '../worker/store.ts';
import entry from '../worker/index.ts';

let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare['getD1Database']>>;
const schema = await readFile(new URL('../migrations/0001_enquiries.sql', import.meta.url), 'utf8');
before(async () => {
  mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("local test"); } }', compatibilityDate: '2026-07-30', d1Databases: ['DB'] });
  db = await mf.getD1Database('DB');
  await db.batch(schema.replace(/^--.*$/gm, '').split(';').map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)));
});
after(async () => { await mf?.dispose(); });
function input(extra: Record<string, unknown> = {}) {
  return { submissionId: crypto.randomUUID(), name: 'Synthetic Test', contact: { kind: 'email', value: 'test@example.invalid' }, dateUndecided: true, creationIds: [], privacyAck: true, ...extra };
}
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://preview.example.invalid/api/enquiries', { method: 'POST', headers: { Origin: 'https://preview.example.invalid', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
function deps(database: Database = db): Dependencies {
  return { store: new EnquiryStore(database), origin: 'https://preview.example.invalid', creationIds: new Set(['synthetic-floral']), allowRequest: async () => true, verifyBot: async () => true };
}
async function count(table: 'enquiries' | 'enquiry_references' | 'notification_outbox', id: string) {
  const key = table === 'enquiries' ? 'submission_id' : 'enquiry_id';
  const value = table === 'enquiries' ? id : (await db.prepare('SELECT id FROM enquiries WHERE submission_id = ?').bind(id).first<{id: string}>())?.id ?? '';
  return (await db.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${key} = ?`).bind(value).first<{ n: number }>())!.n;
}
test('receipt follows durable enquiry, references and one owner notification intent (no automatic customer email)', async () => {
  const body = input({ creationIds: ['synthetic-floral'] });
  const result = await handleEnquiry(request(body), deps());
  assert.equal(result.status, 201);
  const receipt = await result.json() as Record<string, unknown>;
  assert.deepEqual(Object.keys(receipt).sort(), ['notificationStatus', 'received', 'reference']);
  assert.equal(receipt.notificationStatus, 'pending');
  assert.equal(await count('enquiries', body.submissionId), 1);
  assert.equal(await count('enquiry_references', body.submissionId), 1);
  assert.equal(await count('notification_outbox', body.submissionId), 1);
  const id = (await db.prepare('SELECT id FROM enquiries WHERE submission_id = ?').bind(body.submissionId).first<{ id: string }>())!.id;
  assert.deepEqual((await db.prepare('SELECT recipient_role AS r FROM notification_outbox WHERE enquiry_id = ?').bind(id).all<{ r: string }>()).results.map((x: { r: string }) => x.r), ["owner"]); // owner decision: the unverified customer address is never emailed automatically
});
test('lost response replay keeps receipt and skips consumed bot token', async () => {
  const body = input({ botToken: 'single-use-synthetic' });
  const first = await handleEnquiry(request(body), deps());
  const second = await handleEnquiry(request({ ...body, botToken: '' }), { ...deps(), verifyBot: async () => { throw Error('must not be consumed twice'); } });
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), await first.json());
  assert.equal(await count('notification_outbox', body.submissionId), 1);
});
test('concurrent same-payload requests converge on one durable receipt', async () => {
  const body = input();
  const results = await Promise.all(Array.from({ length: 8 }, () => handleEnquiry(request(body), deps())));
  assert.equal(results.filter(r => r.status === 201).length, 1);
  assert.ok(results.every(r => [200, 201].includes(r.status)));
  const receipts = await Promise.all(results.map(r => r.json() as Promise<{reference: string}>));
  assert.equal(new Set(receipts.map(r => r.reference)).size, 1);
  assert.equal(await count('enquiries', body.submissionId), 1);
  assert.equal(await count('notification_outbox', body.submissionId), 1);
});
test('same ID with different payload conflicts, including concurrent race', async () => {
  const body = input();
  const results = await Promise.all([handleEnquiry(request(body), deps()), handleEnquiry(request({ ...body, name: 'Other Synthetic' }), deps())]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  assert.equal(await count('notification_outbox', body.submissionId), 1);
});
test('outbox insertion failure rolls back the entire D1 batch', async () => {
  const body = input({ creationIds: ['synthetic-floral'] });
  await db.exec("CREATE TRIGGER fail_outbox BEFORE INSERT ON notification_outbox BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;");
  try {
    const result = await handleEnquiry(request(body), deps());
    assert.equal(result.status, 503);
    assert.equal(await count('enquiries', body.submissionId), 0);
    assert.equal((await db.prepare("SELECT count(*) AS n FROM enquiry_references r LEFT JOIN enquiries e ON r.enquiry_id=e.id WHERE e.id IS NULL").first<{n: number}>())!.n, 0);
  } finally { await db.exec('DROP TRIGGER fail_outbox;'); }
});
test('storage failure does not report successful receipt or leak errors', async () => {
  const unavailable = { prepare() { throw Error('PRIVATE STORAGE ERROR'); }, async batch() { throw Error('PRIVATE'); } };
  const result = await handleEnquiry(request(input()), deps(unavailable));
  assert.equal(result.status, 503);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await result.json(), { error: 'receipt_unconfirmed', retrySameSubmission: true });
});
test('input bounds, dates and unknown IDs reject before persistence', async () => {
  const invalid = [
    { contact: { kind: 'email', value: 'bad' } }, { name: '' }, { notes: 'a'.repeat(2001) },
    { creationIds: ['not-approved'] }, { dateUndecided: false, eventDate: '2026-02-30' },
    { dateUndecided: false, eventDate: '2026-99-01' }, { dateUndecided: true, eventDate: '2026-12-01' },
    { servings: 0 }, { status: 'booked' }, { contact: { kind: 'email', value: 'test@example.invalid', admin: true } },
    { submissionId: 'predictable' }, { name: 'control\u0000' }, { creationIds: [null] },
  ];
  for (const change of invalid) {
    const body = input(change);
    assert.equal((await handleEnquiry(request(body), deps())).status, 400, JSON.stringify(change));
  }
});
test('valid date stays an Austin calendar date and notes are stored as data', async () => {
  const body = input({ dateUndecided: false, eventDate: '2028-02-29', notes: '<script>alert(1)</script>' });
  assert.equal((await handleEnquiry(request(body), deps())).status, 201);
  const row = await db.prepare('SELECT payload_json FROM enquiries WHERE submission_id = ?').bind(body.submissionId).first<{payload_json: string}>();
  assert.equal(JSON.parse(row!.payload_json).eventDate, '2028-02-29');
  // Rendering/escaping is a separate future inbox requirement. Never render raw HTML.
  assert.equal(JSON.parse(row!.payload_json).notes, '<script>alert(1)</script>');
});
test('method, origin, media type, bot and throttling deny intake', async () => {
  const body = input();
  assert.equal((await handleEnquiry(new Request('https://preview.example.invalid/api/enquiries'), deps())).status, 405);
  assert.equal((await handleEnquiry(request(body, { Origin: 'https://untrusted.invalid' }), deps())).status, 403);
  assert.equal((await handleEnquiry(request(body, { 'Content-Type': 'text/plain' }), deps())).status, 415);
  assert.equal((await handleEnquiry(request(body), { ...deps(), verifyBot: async () => false })).status, 400);
  assert.equal((await handleEnquiry(request(body), { ...deps(), allowRequest: async () => false })).status, 429);
  assert.equal(await count('enquiries', body.submissionId), 0);
});
test('actual streamed byte size is bounded even without Content-Length', async () => {
  const result = await handleEnquiry(request(input({ notes: 'é'.repeat(7000) })), deps());
  assert.equal(result.status, 413);
  const malformed = new Request('https://preview.example.invalid/api/enquiries', { method: 'POST', headers: { Origin: 'https://preview.example.invalid', 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal((await handleEnquiry(malformed, deps())).status, 400);
});
test('public Worker stays closed, including all private endpoints', async () => {
  for (const path of ['/api/enquiries', '/admin', '/api/admin/enquiries', '/api/export']) {
    assert.equal((await entry.fetch(new Request('https://preview.example.invalid' + path))).status, 503);
  }
  const health = await entry.fetch(new Request('http://localhost/health'));
  assert.deepEqual(await health.json(), { stage: 'local-foundation', intakeEnabled: false });
});
test('contact routes, fulfilment, add-ons and budget validate and normalise', async () => {
  const ok = async (extra: Record<string, unknown>) => (await handleEnquiry(request(input(extra)), deps())).status;
  assert.equal(await ok({ contact: { kind: 'phone', value: '(512) 555-0100' } }), 201);
  assert.equal(await ok({ contact: { kind: 'instagram', value: '@synthetic.user' } }), 201);
  assert.equal(await ok({ fulfilment: 'delivery', size: '6 inch', flavour: 'Not sure', addons: ['topper', 'topper'], budgetCents: 15000 }), 201);
  for (const bad of [
    { contact: { kind: 'phone', value: '12345' } }, { contact: { kind: 'instagram', value: 'bad handle!' } },
    { contact: { kind: 'sms', value: 'x' } }, { fulfilment: 'courier' }, { budgetCents: 12.5 }, { budgetCents: -1 },
    { addons: Array.from({ length: 9 }, (_, i) => `a${i}`) }, { privacyAck: false }, { privacyAck: undefined },
  ]) assert.equal(await ok(bad), 400, JSON.stringify(bad));
  const normal = input({ contact: { kind: 'phone', value: '(512) 555-0100' }, addons: ['b', 'a', 'a'] });
  await handleEnquiry(request(normal), deps());
  const stored = JSON.parse((await db.prepare('SELECT payload_json AS p FROM enquiries WHERE submission_id = ?').bind(normal.submissionId).first<{ p: string }>())!.p);
  assert.deepEqual([stored.contact.value, stored.addons], ['5125550100', ['a', 'b']]);
});
