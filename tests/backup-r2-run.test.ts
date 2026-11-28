import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REFRESH_DAYS, backupKey, classifySnapshot, emptyR2State, isSafeKey, isStaleTemp, parseJsonc, parseRows, planR2, sizeMatches } from '../scripts/backup-r2-run-lib.ts';

test('D1 output: banners before the JSON are ignored; unsafe keys and bad sizes are dropped', () => {
  const out = ' ⛅️ wrangler 4\n[{"results":[{"k":"uploads/ok-1.jpg","b":100},{"k":"../etc/passwd","b":5},{"k":"/abs","b":5},{"k":"a b","b":5},{"k":"uploads/zero.jpg","b":0},{"k":"uploads/ok-2.png","b":7}],"success":true}]';
  assert.deepEqual(parseRows(out).map((r) => r.k), ['uploads/ok-1.jpg', 'uploads/ok-2.png']);
  assert.throws(() => parseRows('no json here'), /No JSON/); assert.throws(() => parseRows('[{"nope":1}]'), /shape/);
});

test('planning: only pictures not yet backed up, oldest first, capped per run; a backed-up picture is never repeated', () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ k: `u/${i}.jpg`, b: 10 + i }));
  const state = emptyR2State(); state.done['u/0.jpg'] = { bytes: 10, at: 1 };
  const plan = planR2(rows, state, 2);
  assert.equal(plan.length, 40); assert.equal(plan[0]!.k, 'u/1.jpg'); assert.ok(!plan.some((r) => r.k === 'u/0.jpg'));
  assert.deepEqual(planR2(rows.slice(0, 1), state, 2), []);
});

test('integrity and naming: size must equal the database record; backup objects are namespaced per source under the writer prefix', () => {
  assert.equal(sizeMatches({ k: 'a', b: 5 }, 5), true); assert.equal(sizeMatches({ k: 'a', b: 5 }, 4), false);
  assert.equal(backupKey('production', 'uploads/x.jpg'), 'backups/r2/production/uploads/x.jpg.ckbak');
  assert.equal(isSafeKey('uploads/x.jpg'), true); for (const bad of ['', '../x', 'a//..//b', '/x', 'x'.repeat(201), 5]) assert.equal(isSafeKey(bad as string), false);
});

test('wrangler config parsing: comments are stripped, // inside strings is kept', () => {
  const cfg = parseJsonc('{\n // comment\n "r2_buckets": [{ "bucket_name": "b-us" }], "u": "https://x.example/a" // tail\n}') as { r2_buckets: { bucket_name: string }[]; u: string };
  assert.equal(cfg.r2_buckets[0]!.bucket_name, 'b-us'); assert.equal(cfg.u, 'https://x.example/a');
});

test('stale temp cleanup: only our own temp names, only when older than an hour', () => {
  const now = 10 * 3_600_000, old = now - 2 * 3_600_000, fresh = now - 60_000;
  assert.equal(isStaleTemp('ckbak-AbC123', old, now), true); assert.equal(isStaleTemp('run-123.ckbak', old, now), true); assert.equal(isStaleTemp('r2tmp-1-0.bin', old, now), true);
  assert.equal(isStaleTemp('ckbak-AbC123', fresh, now), false); assert.equal(isStaleTemp('status.json', old, now), false); assert.equal(isStaleTemp('backup.log', old, now), false);
});

test('lifecycle safety: a still-attached picture is re-uploaded before its newest backup can expire; erased pictures are left to expire; new ones come first', () => {
  const D = 86_400_000, now = 100 * D, rows = [{ k: 'a.jpg', b: 1 }, { k: 'b.jpg', b: 1 }, { k: 'c.jpg', b: 1 }, { k: 'new.jpg', b: 1 }];
  const state = emptyR2State(); state.done['a.jpg'] = { bytes: 1, at: now - 10 * D }; state.done['b.jpg'] = { bytes: 1, at: now - 29 * D }; state.done['c.jpg'] = { bytes: 1, at: now - 60 * D }; state.done['erased.jpg'] = { bytes: 1, at: now - 90 * D };
  assert.deepEqual(planR2(rows, state, now).map((r) => r.k), ['new.jpg', 'c.jpg', 'b.jpg']); // a is fresh; the erased picture is not listed, so it is never refreshed
  assert.ok(REFRESH_DAYS * 2 < 70, 'refresh interval leaves room for a missed run (35 days to hide, 70 to delete)');
});

test('retention audit: a live picture without a backup is a failure; an erased one is allowed to lose its backup; covered ones pass', () => {
  const attached = [{ k: 'live-ok' }, { k: 'live-missing' }, { k: 'erased-deleted' }, { k: 'erased-gone' }];
  const live = new Map<string, number | null>([['live-ok', null], ['live-missing', null], ['erased-deleted', 123]]);
  const r = classifySnapshot(attached, live, new Set(['live-ok', 'erased-deleted']));
  assert.deepEqual([r.covered.map((x) => x.k), r.erasedSince.map((x) => x.k), r.missingLive.map((x) => x.k)], [['live-ok', 'erased-deleted'], ['erased-deleted', 'erased-gone'], ['live-missing']]);
  assert.equal(classifySnapshot([], live, new Set()).missingLive.length, 0);
});
