import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { Database, Statement } from '../worker/store.ts';
import { freezeNotificationSnapshot } from '../worker/notification-persistence.ts';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE notification_outbox (id TEXT PRIMARY KEY, state TEXT NOT NULL, attempts INTEGER NOT NULL, lease_token TEXT, lease_until INTEGER);
    INSERT INTO notification_outbox VALUES ('event','leased',1,'lease-a',2000);`);
  sql.exec(readFileSync(new URL('../migrations/0010_notification_snapshots.sql', import.meta.url), 'utf8'));
  const db: Database = {
    prepare(query: string): Statement {
      const statement = sql.prepare(query);
      let values: (string | number | null)[] = [];
      return { bind(...args) { values = args; return this; }, async first<T>() { return (statement.get(...values) as T | undefined) ?? null; } };
    },
    async batch() { throw Error('not used'); },
  };
  return {sql,db};
}
const event = {id:'event',lease_token:'lease-a'};
const payload = '{"text":"synthetic"}';

test('freezes bytes before delivery and reuses them under a renewed lease', async () => {
  const {sql,db} = fixture();
  try {
    assert.deepEqual(await freezeNotificationSnapshot(db,event,()=>({kind:'send',payload}),()=>1000),{kind:'send',payload});
    sql.exec("UPDATE notification_outbox SET attempts=2, lease_token='lease-b', lease_until=4000");
    assert.deepEqual(await freezeNotificationSnapshot(db,{...event,lease_token:'lease-b'},()=>{throw Error('must not rebuild');},()=>3000),{kind:'send',payload});
    assert.equal(sql.prepare('SELECT count(*) AS n FROM notification_snapshots').get()?.n,1);
  } finally {sql.close();}
});
test('stale and expired leases cannot create or read snapshots', async () => {
  const {sql,db} = fixture();
  try {
    const build = () => ({kind:'send',payload} as const);
    assert.equal(await freezeNotificationSnapshot(db,{...event,lease_token:'wrong'},build,()=>1000),null);
    assert.equal(await freezeNotificationSnapshot(db,event,build,()=>2000),null);
    assert.equal(sql.prepare('SELECT count(*) AS n FROM notification_snapshots').get()?.n,0);
    assert.ok(await freezeNotificationSnapshot(db,event,build,()=>1000));
    assert.equal(await freezeNotificationSnapshot(db,event,build,()=>2000),null);
  } finally {sql.close();}
});
test('legacy retry without a frozen snapshot fails closed', async () => {
  const {sql,db} = fixture();
  try {
    sql.exec('UPDATE notification_outbox SET attempts=2');
    assert.equal(await freezeNotificationSnapshot(db,event,()=>({kind:'send',payload}),()=>1000),null);
  } finally {sql.close();}
});
test('records channel skip without payload and cascades deletion', async () => {
  const {sql,db} = fixture();
  try {
    assert.deepEqual(await freezeNotificationSnapshot(db,event,()=>({kind:'skip',reason:'non_email_contact'}),()=>1000),{kind:'skip',reason:'non_email_contact'});
    assert.equal(sql.prepare('SELECT payload FROM notification_snapshots').get()?.payload,null);
    sql.exec("DELETE FROM notification_outbox WHERE id='event'");
    assert.equal(sql.prepare('SELECT count(*) AS n FROM notification_snapshots').get()?.n,0);
  } finally {sql.close();}
});
test('rejects oversize payload and rechecks lease after building', async () => {
  const {sql,db} = fixture();
  try {
    await assert.rejects(freezeNotificationSnapshot(db,event,()=>({kind:'send',payload:'x'.repeat(16385)}),()=>1000));
    let now=1000;
    assert.equal(await freezeNotificationSnapshot(db,event,()=>{now=2000;return {kind:'send',payload};},()=>now),null);
    assert.equal(sql.prepare('SELECT count(*) AS n FROM notification_snapshots').get()?.n,0);
  } finally {sql.close();}
});
