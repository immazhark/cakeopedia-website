import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { Miniflare } from 'miniflare';
import { collectHealth } from '../worker/health.ts';
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
const h = (now: number) => collectHealth(db as unknown as AdminDb, now);

test('health: an empty database reports nulls and zeros with every table present', async () => {
  assert.deepEqual(await h(1000), { oldestPendingOutboxAgeMs: null, oldestQueuedCommunicationAgeMs: null, failedCommunications: 0, pendingUploadSessions: 0, lastCatalogueRebuild: null, maintenance: [], tablesPresent: 19, missingTables: [] });
});

test('health: ages, counts and the last rebuild come from the data, and no customer value appears in the result', async () => {
  await db.prepare('INSERT INTO enquiries (id, submission_id, payload_hash, public_reference, created_at, payload_json) VALUES (?,?,?,?,?,?)').bind('e1', 's1', 'h', 'CK-1', 1, JSON.stringify({ name: 'Health Test Person' })).run();
  await db.prepare("INSERT INTO notification_outbox (id, enquiry_id, recipient_role, state, next_attempt_at) VALUES ('o1','e1','owner','pending',400), ('o2','e1','customer','sent',1)").run();
  const comm = (id: string, state: string, at: number) => db.prepare("INSERT INTO communications (id, enquiry_id, template, recipient, state, created_at, updated_at, actor) VALUES (?, 'e1', 'reply', 'health@example.invalid', ?, ?, ?, 'a')").bind(id, state, at, at).run();
  await comm('c1', 'queued', 300); await comm('c2', 'failed', 100); await comm('c3', 'failed', 200); await comm('c4', 'accepted', 50);
  await db.prepare("INSERT INTO upload_sessions (submission_id, verified_at) VALUES ('u1', 1), ('u2', 2)").run();
  await db.prepare("INSERT INTO catalogue_published (version, published_at, actor, source, data_json) VALUES (1,'t','a','publish','{}'), (2,'t','a','publish','{}')").run();
  await db.prepare("INSERT INTO catalogue_rebuilds (version, status, attempts, updated_at) VALUES (1,'requested',1,'t'), (2,'failed',3,'t')").run();
  const r = await h(1000);
  assert.equal(r.oldestPendingOutboxAgeMs, 600);
  assert.equal(r.oldestQueuedCommunicationAgeMs, 700);
  assert.equal(r.failedCommunications, 2);
  assert.equal(r.pendingUploadSessions, 2);
  assert.deepEqual(r.lastCatalogueRebuild, { version: 2, status: 'failed', attempts: 3 });
  assert.doesNotMatch(JSON.stringify(r), /Health Test|health@example|CK-1/);
});

test('health: a missing table is reported by name instead of throwing', async () => {
  const names = [...(await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{ name: string }>()).results.map((x: { name: string }) => x.name)];
  assert.ok(names.includes('catalogue_rebuilds'));
  const wrapped: AdminDb = { prepare: (sql: string) => (sql.includes('sqlite_master') ? ({ all: async () => ({ results: names.filter((n) => n !== 'communications').map((name) => ({ name })) }) } as never) : (db as unknown as AdminDb).prepare(sql)), batch: async () => [] };
  assert.deepEqual((await collectHealth(wrapped, 1000)).missingTables, ['communications']);
});

test('storage reconciliation: finds missing, tombstoned and untracked objects and refuses to call an unfinished listing clean', async () => {
  const { reconcileStorage } = await import('../worker/health.ts');
  const up = (k: string, ready: number | null, gone: number | null) => db.prepare("INSERT INTO uploads (id, submission_id, object_key, content_type, bytes, created_at, ready_at, deleted_at) VALUES (?, 's', ?, 'image/png', 5, 1, ?, ?)").bind(`id-${k}`, k, ready, gone).run();
  await up('ok', 1, null); await up('lost', 1, null); await up('erased', 1, 9); await up('pending', null, null);
  const bucket = (keys: string[], pageSize = 2) => ({ list: async (o: { cursor?: string }) => { const at = o.cursor ? Number(o.cursor) : 0; return { objects: keys.slice(at, at + pageSize).map((key) => ({ key })), truncated: at + pageSize < keys.length, cursor: String(at + pageSize) }; } });
  const r = await reconcileStorage(db as unknown as AdminDb, bucket(['ok', 'erased', 'pending', 'stray']));
  assert.deepEqual([r.ok, r.missingInBucket, r.tombstonedStillInBucket, r.untrackedInBucket, r.bucketObjects], [false, 1, 1, 1, 4]);
  assert.deepEqual(r.sample, { missing: ['lost'], tombstoned: ['erased'], untracked: ['stray'] });
  await assert.rejects(reconcileStorage(db as unknown as AdminDb, bucket(['a', 'b', 'c', 'd']), 1), /storage_listing_incomplete/);
  assert.equal((await reconcileStorage(db as unknown as AdminDb, bucket(['ok', 'pending']))).missingInBucket, 1); // 'lost' still missing; clean only when nothing differs
});

test('maintenance outcomes: failures are counted and visible, a success resets them, and no customer data is stored', async () => {
  const { recordMaintenance } = await import('../worker/health.ts');
  const d = db as unknown as AdminDb, logs: string[] = [], real = console.error; console.error = (m: string) => { logs.push(String(m)); };
  try {
    await recordMaintenance(d, 'upload_cleanup', 'failed', 1000); await recordMaintenance(d, 'upload_cleanup', 'failed', 2000);
    let j = (await h(5000)).maintenance.find((x) => x.job === 'upload_cleanup')!;
    assert.deepEqual([j.state, j.failures, j.sinceOkMs, j.ageMs], ['failed', 2, null, 3000]);
    await recordMaintenance(d, 'upload_cleanup', 'completed', 3000); await recordMaintenance(d, 'upload_cleanup', 'partial', 4000);
    j = (await h(5000)).maintenance.find((x) => x.job === 'upload_cleanup')!;
    assert.deepEqual([j.state, j.failures, j.sinceOkMs], ['partial', 1, 2000]);
  } finally { console.error = real; }
  assert.deepEqual(logs, ['{"evt":"maintenance_failed","job":"upload_cleanup"}', '{"evt":"maintenance_failed","job":"upload_cleanup"}']);
});
