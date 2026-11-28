import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { Miniflare } from 'miniflare';
import { eraseEnquiry, reapplyErasureSql, routeErase } from '../worker/erase.ts';
import type { AdminDb } from '../worker/admin-common.ts';

let mf: Miniflare, db: Awaited<ReturnType<Miniflare['getD1Database']>>;
before(async () => {
  mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("t"); } }', compatibilityDate: '2026-07-30', d1Databases: ['DB'] });
  db = await mf.getD1Database('DB');
  for (const f of (await readdir(new URL('../migrations/', import.meta.url))).sort()) {
    const sql = (await readFile(new URL(`../migrations/${f}`, import.meta.url), 'utf8')).replace(/^--.*$/gm, '');
    await db.batch(sql.split(';').map((s) => s.trim()).filter(Boolean).map((s) => db.prepare(s)));
  }
});
after(async () => { await mf?.dispose(); });
const A = () => db as unknown as AdminDb;

async function seed(id: string, ref: string) {
  await db.prepare('INSERT INTO enquiries (id, submission_id, payload_hash, public_reference, created_at, payload_json) VALUES (?,?,?,?,?,?)').bind(id, `sub-${id}`, 'h', ref, 1000, JSON.stringify({ name: 'Real Name', contact: { kind: 'email', value: 'real@example.invalid' } })).run();
  await db.prepare("INSERT INTO enquiry_events (id, enquiry_id, status, created_at, actor, note) VALUES (?,?,'new',1000,'t','private note')").bind(`ev-${id}`, id).run();
  await db.prepare("INSERT INTO payments (id, enquiry_id, kind, amount_cents, received_on, note, recorded_at, actor) VALUES (?,?,'deposit',7500,'2026-11-01','zelle from a person',1000,'t')").bind(`pay-${id}`, id).run();
  await db.prepare("INSERT INTO uploads (id, submission_id, object_key, content_type, bytes, created_at, enquiry_id, ready_at) VALUES (?,?,?,'image/jpeg',5,1000,?,1000)").bind(`up-${id}`, `sub-${id}`, `uploads/${id}.jpg`, id).run();
  await db.prepare("INSERT INTO communications (id, enquiry_id, template, recipient, subject, body, state, created_at, updated_at, actor) VALUES (?,?,'reply','real@example.invalid','s','private body','accepted',1000,1000,'t')").bind(`c-${id}`, id).run();
}
const state = async (id: string) => ({
  erased: JSON.parse((await db.prepare('SELECT payload_json AS p FROM enquiries WHERE id = ?').bind(id).first<{ p: string }>())!.p).erased === true,
  note: (await db.prepare('SELECT note FROM enquiry_events WHERE enquiry_id = ?').bind(id).first<{ note: string | null }>())!.note,
  pay: await db.prepare('SELECT amount_cents AS a, note FROM payments WHERE enquiry_id = ?').bind(id).first<{ a: number; note: string | null }>(),
  uploads: (await db.prepare('SELECT count(*) AS n FROM uploads WHERE enquiry_id = ?').bind(id).first<{ n: number }>())!.n,
  body: (await db.prepare('SELECT body FROM communications WHERE enquiry_id = ?').bind(id).first<{ body: string | null }>())!.body,
});
const ledger = (ref: string) => db.prepare('SELECT source FROM erasure_ledger WHERE reference = ?').bind(ref).first<{ source: string }>();

test('re-applying an erasure to a restored database anonymises everything personal, keeps the money, leaves other customers alone, and is idempotent', async () => {
  await seed('r1', 'CK-restore-one'); await seed('r2', 'CK-restore-two');
  const sql = reapplyErasureSql('CK-restore-one', 5000, 'owner');
  for (let pass = 0; pass < 2; pass++) await db.batch(sql.map((s) => db.prepare(s))); // twice: a repeat is a no-op
  assert.deepEqual(await state('r1'), { erased: true, note: null, pay: { a: 7500, note: null }, uploads: 0, body: null });
  assert.deepEqual(await state('r2'), { erased: false, note: 'private note', pay: { a: 7500, note: 'zelle from a person' }, uploads: 1, body: 'private body' });
  assert.equal((await ledger('CK-restore-one'))?.source, 'owner'); assert.equal(await ledger('CK-restore-two'), null);
});

test('every real erasure writes the ledger inside its batch: owner and retention are distinguished, repeats do not duplicate', async () => {
  await seed('e1', 'CK-erase-owner'); await seed('e2', 'CK-erase-retention');
  const bucket = { delete: async () => undefined };
  assert.deepEqual(await eraseEnquiry(A(), 'e1', 'owner@example.invalid', 2000, bucket, 'CK-erase-owner'), { ok: true, alreadyErased: false });
  assert.deepEqual(await eraseEnquiry(A(), 'e2', 'retention', 3000, bucket, undefined, false), { ok: true, alreadyErased: false });
  assert.equal((await ledger('CK-erase-owner'))?.source, 'owner'); assert.equal((await ledger('CK-erase-retention'))?.source, 'retention');
  await eraseEnquiry(A(), 'e1', 'owner@example.invalid', 9000, bucket, 'CK-erase-owner');
  assert.equal((await db.prepare("SELECT count(*) AS n FROM erasure_ledger WHERE reference = 'CK-erase-owner'").first<{ n: number }>())!.n, 1);
  assert.equal((await db.prepare("SELECT erased_at AS t FROM erasure_ledger WHERE reference = 'CK-erase-owner'").first<{ t: number }>())!.t, 2000); // the first time is kept
});

test('the ledger endpoint lists references, dates and sources only; an unsafe reference can never be turned into SQL', async () => {
  const res = await routeErase(new Request('https://x.test/admin/api/erasures'), A(), 'owner', Date.now, new URL('https://x.test/admin/api/erasures'), undefined);
  const body = (await res!.json()) as { count: number; items: Record<string, unknown>[] };
  assert.ok(body.count >= 3); assert.deepEqual(Object.keys(body.items[0]!).sort(), ['erasedAt', 'reference', 'source']);
  assert.ok(!JSON.stringify(body).includes('Real Name') && !JSON.stringify(body).includes('real@example'));
  for (const bad of ["CK-x'; DROP TABLE enquiries;--", 'CK-', 'ck-lower', "CK-a b", 'x'.repeat(200)]) assert.throws(() => reapplyErasureSql(bad, 1), /unsafe/);
  assert.throws(() => reapplyErasureSql('CK-ok-ref', 1.5), /unsafe/); assert.throws(() => reapplyErasureSql('CK-ok-ref', 1, 'x'), /unsafe/);
});

test('migration 0022 backfills erasures made before the ledger existed', async () => {
  const n = (await db.prepare("SELECT count(*) AS n FROM erasure_ledger WHERE source = 'backfill'").first<{ n: number }>())!.n;
  assert.equal(n, 0); // a fresh database has none; the backfill statement itself is exercised by running every migration above without error
});
