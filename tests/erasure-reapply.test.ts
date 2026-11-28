import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { reapplyErasureSql } from '../worker/erase.ts';
import { formatLedger, mergeLedgers, parseLedger } from '../scripts/erasure-ledger-lib.ts';

test('ledger file: round trips, merges keeping every reference and the earliest time, and rejects malformed or unsafe lines', () => {
  const a = parseLedger('CK-aaaa-1\t100\towner\nCK-bbbb-2\t300\tretention\n'), b = parseLedger('# comment\nCK-aaaa-1\t50\tbackfill\nCK-cccc-3\t400\towner');
  const m = mergeLedgers(a, b);
  assert.deepEqual([...m.keys()].sort(), ['CK-aaaa-1', 'CK-bbbb-2', 'CK-cccc-3']); assert.equal(m.get('CK-aaaa-1')!.at, 50);
  assert.deepEqual([...parseLedger(formatLedger(m)).keys()].sort(), [...m.keys()].sort());
  for (const bad of ["CK-x'; DROP TABLE enquiries;--\t1\towner", 'CK-ok-1\tabc\towner', 'CK-ok-1\t1\tother', 'CK-ok-1\t1', 'not-a-ref\t1\towner']) assert.throws(() => parseLedger(bad), /malformed/, bad);
});

// A real sqlite database built from every migration (what a restore produces), to prove the generated SQL works against the actual schema.
function schemaDb(): DatabaseSync {
  const dir = fileURLToPath(new URL('../migrations/', import.meta.url)), db = new DatabaseSync(':memory:');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(join(dir, f), 'utf8'));
  return db;
}
test('restore scenario: an old backup brings an erased customer back; re-applying the ledger erases them again and leaves everyone else untouched', () => {
  const db = schemaDb();
  const add = (id: string, ref: string) => {
    db.prepare('INSERT INTO enquiries (id, submission_id, payload_hash, public_reference, created_at, payload_json) VALUES (?,?,?,?,?,?)').run(id, `s-${id}`, 'h', ref, 1, JSON.stringify({ name: `Person ${id}`, contact: { kind: 'email', value: `${id}@example.invalid` } }));
    db.prepare("INSERT INTO payments (id, enquiry_id, kind, amount_cents, received_on, note, recorded_at, actor) VALUES (?,?,'deposit',5000,'2026-11-01','note',1,'t')").run(`p-${id}`, id);
    db.prepare("INSERT INTO uploads (id, submission_id, object_key, content_type, bytes, created_at, enquiry_id, ready_at) VALUES (?,?,?,'image/png',3,1,?,1)").run(`u-${id}`, `s-${id}`, `uploads/${id}.png`, id);
  };
  add('x1', 'CK-erased-later'); add('x2', 'CK-stays');
  for (const s of reapplyErasureSql('CK-erased-later', 10, 'owner')) db.exec(s);
  const row = (id: string) => db.prepare('SELECT json_extract(payload_json, \'$.erased\') AS e, (SELECT count(*) FROM uploads WHERE enquiry_id = ?1) AS up, (SELECT amount_cents FROM payments WHERE enquiry_id = ?1) AS amt, (SELECT note FROM payments WHERE enquiry_id = ?1) AS note FROM enquiries WHERE id = ?1').get(id) as { e: number | null; up: number; amt: number; note: string | null };
  assert.deepEqual({ ...row('x1') }, { e: 1, up: 0, amt: 5000, note: null }); // erased, money kept
  assert.deepEqual({ ...row('x2') }, { e: null, up: 1, amt: 5000, note: 'note' });
  assert.equal((db.prepare("SELECT source FROM erasure_ledger WHERE reference = 'CK-erased-later'").get() as { source: string }).source, 'owner');
  assert.equal(db.prepare('PRAGMA integrity_check').get()!.integrity_check, 'ok');
});
