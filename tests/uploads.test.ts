import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { Miniflare } from 'miniflare';
import sharp from 'sharp';
import { handleEnquiry } from '../worker/enquiries.ts';
import { EnquiryStore } from '../worker/store.ts';
import { handleInbox, type InboxDb } from '../worker/inbox.ts';
import type { AccessConfig } from '../worker/auth.ts';
import { handleUpload, handleUploadDelete, ownsUploads, purgeOrphans, POLICY, type Bucket, type UploadDeps } from '../worker/uploads.ts';

const ORIGIN = 'https://preview.example.invalid';
let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare['getD1Database']>>;
before(async () => {
  mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("t"); } }', compatibilityDate: '2026-07-30', d1Databases: ['DB'] });
  db = await mf.getD1Database('DB');
  for (const file of ['0001_enquiries.sql', '0002_outbox_leases.sql', '0003_uploads.sql', '0004_enquiry_events.sql', '0005_orders.sql', '0012_upload_tombstones.sql', '0015_upload_ready.sql']) {
    const sql = (await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')).replace(/^--.*$/gm, '');
    await db.batch(sql.split(';').map((s) => s.trim()).filter(Boolean).map((s) => db.prepare(s)));
  }
});
after(async () => { await mf?.dispose(); });

class MemoryBucket implements Bucket {
  objects = new Map<string, { bytes: Uint8Array; type: string }>();
  failPut = false;
  async put(key: string, bytes: Uint8Array, o: { httpMetadata: { contentType: string } }) { if (this.failPut) throw new Error('r2 down'); this.objects.set(key, { bytes, type: o.httpMetadata.contentType }); }
  async delete(key: string) { this.objects.delete(key); }
}
const png = async (extra: Record<string, number> = {}) => new Uint8Array(await sharp({ create: { width: 40 + (extra.w ?? 0), height: 30, channels: 3, background: '#aabbcc' } }).withExif({ IFD0: { Copyright: 'SYNTHETIC-MARKER' } }).png().toBuffer());
const deps = (bucket: Bucket, over: Partial<UploadDeps> = {}): UploadDeps => ({ db: db as unknown as UploadDeps['db'], bucket, origin: ORIGIN, allowRequest: async () => true, ...over });
const up = (body: Uint8Array | string, sid: string, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/uploads`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'image/png', 'X-Submission-Id': sid, ...headers }, body: body as BodyInit });
async function until(cond: () => Promise<boolean>) { for (let i = 0; i < 200; i++) { if (await cond()) return; await new Promise((r) => setTimeout(r, 10)); } throw new Error('condition not reached'); }
const rows = async (sid: string) => (await db.prepare('SELECT count(*) AS n FROM uploads WHERE submission_id = ?').bind(sid).first<{ n: number }>())!.n;

test('three images are accepted, stored cleaned under opaque keys, and a fourth is refused', async () => {
  const bucket = new MemoryBucket(), sid = crypto.randomUUID();
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const res = await handleUpload(up(await png({ w: i }), sid), deps(bucket));
    assert.equal(res.status, 201);
    ids.push(((await res.json()) as { attachmentId: string }).attachmentId);
  }
  assert.equal((await handleUpload(up(await png(), sid), deps(bucket))).status, 422);
  assert.equal(bucket.objects.size, 3);
  for (const [key, obj] of bucket.objects) {
    assert.match(key, /^u\/[0-9a-f-]{36}$/); // no submission id, name or filename in the key
    assert.ok(!Buffer.from(obj.bytes).includes('SYNTHETIC-MARKER'), 'metadata stripped before storage');
    assert.equal(obj.type, 'image/png');
  }
  assert.equal(await ownsUploads(deps(bucket).db, sid, ids), true);
  assert.equal(await ownsUploads(deps(bucket).db, crypto.randomUUID(), ids), false); // another submission cannot claim them
});

test('hostile uploads are rejected without creating rows or objects', async () => {
  const bucket = new MemoryBucket(), sid = crypto.randomUUID();
  const cases: [string, Request, number][] = [
    ['svg as png', up('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>', sid), 422],
    ['html as png', up('<html><script>1</script></html>'.padEnd(40), sid), 422],
    ['wrong declared type', up(await png(), sid, { 'Content-Type': 'image/svg+xml' }), 415],
    ['foreign origin', up(await png(), sid, { Origin: 'https://evil.example' }), 403],
    ['bad submission id', up(await png(), 'not-a-uuid'), 400],
    ['oversized', up(new Uint8Array(5 * 1024 * 1024 + 1), sid), 413],
  ];
  for (const [name, req, status] of cases) assert.equal((await handleUpload(req, deps(bucket))).status, status, name);
  assert.equal(await rows(sid), 0);
  assert.equal(bucket.objects.size, 0);
  assert.equal((await handleUpload(up(await png(), sid), deps(bucket, { allowRequest: async () => false }))).status, 429);
});

test('storage failure leaves no tracking row and the customer can retry', async () => {
  const bucket = new MemoryBucket(), sid = crypto.randomUUID();
  bucket.failPut = true;
  const failed = await handleUpload(up(await png(), sid), deps(bucket));
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { error: 'upload_unconfirmed', retry: true });
  assert.equal(await rows(sid), 0);
  bucket.failPut = false;
  assert.equal((await handleUpload(up(await png(), sid), deps(bucket))).status, 201);
});

test('customer can remove an image; deletion is idempotent and scoped to the submission', async () => {
  const bucket = new MemoryBucket(), sid = crypto.randomUUID();
  const { attachmentId } = (await (await handleUpload(up(await png(), sid), deps(bucket))).json()) as { attachmentId: string };
  const del = (id: string, s: string) => handleUploadDelete(new Request(`${ORIGIN}/api/uploads/${id}`, { method: 'DELETE', headers: { Origin: ORIGIN, 'X-Submission-Id': s } }), id, deps(bucket));
  assert.equal((await del(attachmentId, crypto.randomUUID())).status, 204); // wrong submission: no effect
  assert.equal(bucket.objects.size, 1);
  assert.equal((await del(attachmentId, sid)).status, 204);
  assert.equal(bucket.objects.size, 0);
  assert.equal((await del(attachmentId, sid)).status, 204);
});

test('enquiry links its uploads atomically; foreign or missing attachments are refused; replay is safe', async () => {
  const bucket = new MemoryBucket(), sid = crypto.randomUUID();
  const { attachmentId } = (await (await handleUpload(up(await png(), sid), deps(bucket))).json()) as { attachmentId: string };
  const d = (owns = true) => ({ store: new EnquiryStore(db), origin: ORIGIN, creationIds: new Set<string>(), allowRequest: async () => true, verifyBot: async () => true, ...(owns ? { ownsUploads: (s: string, ids: string[]) => ownsUploads(deps(bucket).db, s, ids) } : {}) });
  const body = (id: string, ids: string[]) => ({ submissionId: id, name: 'Synthetic', contact: { kind: 'email', value: 'a@example.invalid' }, dateUndecided: true, privacyAck: true, attachmentIds: ids });
  const post = (b: object, dd = d()) => handleEnquiry(new Request(`${ORIGIN}/api/enquiries`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }), dd);
  assert.equal((await post(body(crypto.randomUUID(), [attachmentId]))).status, 400); // belongs to another submission
  assert.equal((await post(body(sid, [crypto.randomUUID()]))).status, 400); // does not exist
  assert.equal((await post(body(sid, [attachmentId]), d(false))).status, 400); // no ownership checker wired: fail closed
  assert.equal((await post(body(sid, [attachmentId]))).status, 201);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM uploads WHERE submission_id = ? AND enquiry_id IS NOT NULL').bind(sid).first<{ n: number }>())!.n, 1);
  assert.equal((await post(body(sid, [attachmentId]))).status, 200); // lost-response replay
  assert.equal((await handleUpload(up(await png(), sid), deps(bucket))).status, 409); // no uploads after the enquiry is sent
});

test('orphan purge removes only stale unattached uploads and their objects', async () => {
  const bucket = new MemoryBucket(), sid = crypto.randomUUID(), t0 = 1_000_000_000_000;
  const old = await handleUpload(up(await png(), sid), deps(bucket, { now: () => t0 }));
  const fresh = await handleUpload(up(await png({ w: 1 }), sid), deps(bucket, { now: () => t0 + POLICY.orphanMs }));
  assert.equal(old.status, 201); assert.equal(fresh.status, 201);
  const purged = await purgeOrphans(deps(bucket).db, bucket, t0 + POLICY.orphanMs + 1000);
  assert.ok(purged >= 1);
  assert.equal(await rows(sid), 1);
  assert.equal(bucket.objects.size, 1);
});

test('owner can read an attached picture only when authorised; unattached and unknown ids are hidden', async () => {
  const bucket = new MemoryBucket(), sid = crypto.randomUUID();
  const { attachmentId } = (await (await handleUpload(up(await png(), sid), deps(bucket))).json()) as { attachmentId: string };
  const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k' };
  const cfg: AccessConfig = { issuer: 'https://i.invalid', audience: 'a', operators: new Set(['o@example.invalid']), getKeys: async () => [jwk], now: () => 1_800_000_000, origin: ORIGIN };
  const b64u = (b: ArrayBuffer | string) => Buffer.from(typeof b === 'string' ? b : new Uint8Array(b)).toString('base64url');
  const data = `${b64u(JSON.stringify({ alg: 'RS256', kid: 'k' }))}.${b64u(JSON.stringify({ iss: 'https://i.invalid', aud: ['a'], exp: 1_800_000_600, email: 'o@example.invalid' }))}`;
  const token = `${data}.${b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(data)))}`;
  const reader = { get: async (key: string) => { const o = bucket.objects.get(key); return o ? { body: new Response(o.bytes as BodyInit).body! } : null; } };
  const read = (id: string, jwt: string | null) => handleInbox(new Request(`${ORIGIN}/admin/api/uploads/${id}`, { headers: jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {} }), db as unknown as InboxDb, cfg, Date.now, reader);
  assert.equal((await read(attachmentId, null)).status, 401);
  assert.equal((await read(attachmentId, token)).status, 404); // not yet attached to an enquiry
  const d = { store: new EnquiryStore(db), origin: ORIGIN, creationIds: new Set<string>(), allowRequest: async () => true, verifyBot: async () => true, ownsUploads: (s: string, ids: string[]) => ownsUploads(deps(bucket).db, s, ids) };
  await handleEnquiry(new Request(`${ORIGIN}/api/enquiries`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ submissionId: sid, name: 'S', contact: { kind: 'email', value: 'a@example.invalid' }, dateUndecided: true, privacyAck: true, attachmentIds: [attachmentId] }) }), d);
  const ok = await read(attachmentId, token);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('Content-Type'), 'image/png');
  assert.match(ok.headers.get('Cache-Control') ?? '', /no-store/);
  assert.equal(ok.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal((await read(crypto.randomUUID(), token)).status, 404);
});

test('concurrent uploads cannot exceed the three-image quota', async () => {
  const bucket = new MemoryBucket(), sid = crypto.randomUUID();
  const res = await Promise.all(await Promise.all([0, 1, 2, 3, 4, 5].map(async (i) => handleUpload(up(await png({ w: i }), sid), deps(bucket)))));
  assert.deepEqual(res.map((r) => r.status).sort(), [201, 201, 201, 422, 422, 422]);
  assert.equal(await rows(sid), 3);
  assert.equal(bucket.objects.size, 3);
});

test('a delete in flight cannot race an enquiry: the picture is never attached with its object gone', async () => {
  const bucket = new MemoryBucket(), sid = crypto.randomUUID();
  const { attachmentId } = (await (await handleUpload(up(await png(), sid), deps(bucket))).json()) as { attachmentId: string };
  let release!: () => void; const gate = new Promise<void>((r) => { release = r; });
  const slow: Bucket = { put: bucket.put.bind(bucket), delete: async (k) => { await gate; await bucket.delete(k); } };
  const del = handleUploadDelete(new Request(`${ORIGIN}/api/uploads/${attachmentId}`, { method: 'DELETE', headers: { Origin: ORIGIN, 'X-Submission-Id': sid } }), attachmentId, deps(slow));
  await until(async () => !!(await db.prepare('SELECT 1 AS x FROM uploads WHERE id = ? AND deleted_at IS NOT NULL').bind(attachmentId).first())); // delete has claimed the row and is waiting on storage
  assert.equal(await ownsUploads(deps(bucket).db, sid, [attachmentId]), false); // cannot be attached any more
  release(); assert.equal((await del).status, 204);
  assert.equal(bucket.objects.size, 0);
  assert.equal(await rows(sid), 0);
});

test('a lost object delete leaves a tombstone the purge finishes, never an untracked object', async () => {
  const bucket = new MemoryBucket(), sid = crypto.randomUUID();
  const { attachmentId } = (await (await handleUpload(up(await png(), sid), deps(bucket))).json()) as { attachmentId: string };
  const flaky: Bucket = { put: bucket.put.bind(bucket), delete: async () => { throw new Error('r2 down'); } };
  const r = await handleUploadDelete(new Request(`${ORIGIN}/api/uploads/${attachmentId}`, { method: 'DELETE', headers: { Origin: ORIGIN, 'X-Submission-Id': sid } }), attachmentId, deps(flaky));
  assert.equal(r.status, 503);
  assert.equal(bucket.objects.size, 1); assert.equal(await rows(sid), 1); // still tracked
  assert.ok((await purgeOrphans(deps(bucket).db, bucket, Date.now() + POLICY.leaseMs)) >= 1); // after the lease, not after 24 hours
  assert.equal(bucket.objects.size, 0); assert.equal(await rows(sid), 0);
});

// ---- lifecycle: ready state, exclusive claims, verified attachment, guarded deletes
const enquiryDeps = (bucket: Bucket, owns?: (s: string, ids: string[]) => Promise<boolean>) => ({ store: new EnquiryStore(db), origin: ORIGIN, creationIds: new Set<string>(), allowRequest: async () => true, verifyBot: async () => true, ownsUploads: owns ?? ((s: string, ids: string[]) => ownsUploads(deps(bucket).db, s, ids)) });
const postEnquiry = (sid: string, ids: string[], d: ReturnType<typeof enquiryDeps>) => handleEnquiry(new Request(`${ORIGIN}/api/enquiries`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
  body: JSON.stringify({ submissionId: sid, name: 'Synthetic', contact: { kind: 'email', value: 'a@example.invalid' }, dateUndecided: true, privacyAck: true, attachmentIds: ids }) }), d);
const enquiryRows = async (sid: string) => (await db.prepare('SELECT count(*) AS n FROM enquiries WHERE submission_id = ?').bind(sid).first<{ n: number }>())!.n;

test('an upload is not attachable until its object is stored', async () => {
  const bucket = new MemoryBucket(), sid = crypto.randomUUID();
  let release!: () => void; const gate = new Promise<void>((r) => { release = r; });
  const slow: Bucket = { put: async (k, v, o) => { await gate; return bucket.put(k, v, o); }, delete: bucket.delete.bind(bucket) };
  const pending = handleUpload(up(await png(), sid), deps(slow));
  await until(async () => (await rows(sid)) === 1);
  const id = (await db.prepare('SELECT id FROM uploads WHERE submission_id = ?').bind(sid).first<{ id: string }>())!.id;
  assert.equal(await ownsUploads(deps(bucket).db, sid, [id]), false); // reserved, object not yet stored
  release(); assert.equal((await pending).status, 201);
  assert.equal(await ownsUploads(deps(bucket).db, sid, [id]), true);
});
test('finalising an enquiry fails whole if an attachment is lost after the ownership check', async () => {
  const bucket = new MemoryBucket(), sid = crypto.randomUUID();
  const { attachmentId } = (await (await handleUpload(up(await png(), sid), deps(bucket))).json()) as { attachmentId: string };
  const lossy = async (s: string, ids: string[]) => { const ok = await ownsUploads(deps(bucket).db, s, ids); await handleUploadDelete(new Request(`${ORIGIN}/api/uploads/${attachmentId}`, { method: 'DELETE', headers: { Origin: ORIGIN, 'X-Submission-Id': sid } }), attachmentId, deps(bucket)); return ok; };
  const r = await postEnquiry(sid, [attachmentId], enquiryDeps(bucket, lossy));
  assert.equal(r.status, 400);
  assert.equal(await enquiryRows(sid), 0); // no enquiry that claims a picture it does not have
});
test('scheduled cleanup claims an orphan exclusively: it cannot be attached while its object is being deleted', async () => {
  const bucket = new MemoryBucket(), sid = crypto.randomUUID(), t0 = 1_000_000_000_000;
  const { attachmentId } = (await (await handleUpload(up(await png(), sid), deps(bucket, { now: () => t0 }))).json()) as { attachmentId: string };
  let release!: () => void; const gate = new Promise<void>((r) => { release = r; });
  const slow: Bucket = { put: bucket.put.bind(bucket), delete: async (k) => { await gate; await bucket.delete(k); } };
  const purge = purgeOrphans(deps(bucket).db, slow, t0 + POLICY.orphanMs + 1000);
  await until(async () => !!(await db.prepare('SELECT 1 AS x FROM uploads WHERE id = ? AND deleted_at IS NOT NULL').bind(attachmentId).first()));
  assert.equal((await postEnquiry(sid, [attachmentId], enquiryDeps(bucket))).status, 400);
  release(); assert.equal(await purge, 1);
  assert.equal(await enquiryRows(sid), 0); assert.equal(bucket.objects.size, 0);
});
test('two cleanups never delete the same object twice', async () => {
  const bucket = new MemoryBucket(), sid = crypto.randomUUID(), t0 = 1_000_000_000_000;
  await handleUpload(up(await png(), sid), deps(bucket, { now: () => t0 }));
  const calls: string[] = []; const counting: Bucket = { put: bucket.put.bind(bucket), delete: async (k) => { calls.push(k); await bucket.delete(k); } };
  const [a, b] = await Promise.all([purgeOrphans(deps(bucket).db, counting, t0 + POLICY.orphanMs + 1), purgeOrphans(deps(bucket).db, counting, t0 + POLICY.orphanMs + 1)]);
  assert.equal(a + b, 1); assert.equal(calls.length, 1);
});
test('a customer cannot delete an image that is already attached to an enquiry', async () => {
  const bucket = new MemoryBucket(), sid = crypto.randomUUID();
  const { attachmentId } = (await (await handleUpload(up(await png(), sid), deps(bucket))).json()) as { attachmentId: string };
  assert.equal((await postEnquiry(sid, [attachmentId], enquiryDeps(bucket))).status, 201);
  await handleUploadDelete(new Request(`${ORIGIN}/api/uploads/${attachmentId}`, { method: 'DELETE', headers: { Origin: ORIGIN, 'X-Submission-Id': sid } }), attachmentId, deps(bucket));
  assert.equal(bucket.objects.size, 1); assert.equal(await rows(sid), 1);
});
test('the delete endpoint is rate limited like uploads', async () => {
  const bucket = new MemoryBucket(), sid = crypto.randomUUID(), id = crypto.randomUUID();
  const r = await handleUploadDelete(new Request(`${ORIGIN}/api/uploads/${id}`, { method: 'DELETE', headers: { Origin: ORIGIN, 'X-Submission-Id': sid } }), id, deps(bucket, { allowRequest: async () => false }));
  assert.equal(r.status, 429);
});
