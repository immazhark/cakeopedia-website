import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { Outbox } from '../worker/outbox.ts';
import type { Database, Statement } from '../worker/store.ts';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE notification_outbox (
    id TEXT PRIMARY KEY, enquiry_id TEXT NOT NULL, recipient_role TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL, lease_token TEXT, lease_until INTEGER,
    first_attempt_at INTEGER, provider_id TEXT, last_error_code TEXT
  ); INSERT INTO notification_outbox (id,enquiry_id,recipient_role,next_attempt_at) VALUES ('event','enquiry','owner',0);`);
  const db: Database = {
    prepare(query: string): Statement {
      const statement = sql.prepare(query);
      let values: (string | number | null)[] = [];
      return { bind(...args) { values = args; return this; }, async first<T>() { return (statement.get(...values) as T | undefined) ?? null; } };
    },
    async batch() { throw Error('not used'); },
  };
  return { sql, outbox: new Outbox(db) };
}

test('a later permanent rejection cannot rule out an earlier ambiguous acceptance', async () => {
  const { sql, outbox } = fixture();
  try {
    assert.equal(await outbox.dispatch('event', async () => ({kind:'unknown'}), () => 1000), 'pending');
    assert.equal(await outbox.dispatch('event', async () => ({kind:'permanent'}), () => 61000), 'reconcile');
    assert.equal(sql.prepare('SELECT last_error_code FROM notification_outbox').get()?.last_error_code, 'prior_attempt_uncertain');
  } finally { sql.close(); }
});

test('a recovered expired lease followed by rejection also requires reconciliation', async () => {
  const { sql, outbox } = fixture();
  try {
    assert.ok(await outbox.claim('event', 1000));
    assert.equal(await outbox.dispatch('event', async () => ({kind:'permanent'}), () => 61000), 'reconcile');
  } finally { sql.close(); }
});

test('first-attempt definitive rejection still stops without automatic retry', async () => {
  const { sql, outbox } = fixture();
  try {
    assert.equal(await outbox.dispatch('event', async () => ({kind:'permanent'}), () => 1000), 'failed');
    assert.equal(await outbox.dispatch('event', async () => { throw Error('unexpected'); }, () => 999999), 'idle');
  } finally { sql.close(); }
});
