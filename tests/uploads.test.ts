import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { Miniflare } from 'miniflare';
import sharp from 'sharp';
import { handleEnquiry } from '../worker/enquiries.ts';
import { EnquiryStore } from '../worker/store.ts';
import { handleUpload, handleUploadDelete, ownsUploads, purgeOrphans, POLICY, type Bucket, type UploadDeps } from '../worker/uploads.ts';

const ORIGIN = 'https://preview.example.invalid';
let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare['getD1Database']>>;
before(async () => {
  mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("t"); } }', compatibilityDate: '2026-07-30', d1Databases: ['DB'] });
  db = await mf.getD1Database('DB');
  for (const file of ['0001_enquiries.sql', '0002_outbox_leases.sql', '0003_uploads.sql']) {
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
