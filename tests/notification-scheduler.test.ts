import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { runDueNotifications } from '../worker/notification-scheduler.ts';
import type { Database, Statement } from '../worker/store.ts';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE notification_outbox (
    id TEXT PRIMARY KEY, enquiry_id TEXT NOT NULL, recipient_role TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL, lease_token TEXT, lease_until INTEGER,
    first_attempt_at INTEGER, provider_id TEXT, last_error_code TEXT
  ); CREATE INDEX outbox_due ON notification_outbox(state,next_attempt_at);`);
  const db: Database = {
    prepare(query: string): Statement {
      const statement = sql.prepare(query);
      let values: (string | number | null)[] = [];
      return { bind(...args) { values = args; return this; }, async first<T>() { return (statement.get(...values) as T | undefined) ?? null; } };
    },
    async batch() { throw Error('not used'); },
  };
  const seed = (id: string, due: number, state = 'pending', leaseUntil: number | null = null) => {
    sql.prepare('INSERT INTO notification_outbox (id,enquiry_id,recipient_role,next_attempt_at,state,lease_until,attempts,first_attempt_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(id,id,'owner',due,state,leaseUntil,state==='leased'?1:0,state==='leased'?0:null);
  };
  return {sql,db,seed};
}

test('only due pending and expired leased events are selected in deterministic order', async () => {
  const {sql,db,seed} = fixture();
  try {
    seed('b',5); seed('a',5); seed('expired',0,'leased',1000);
    seed('future',1001); seed('active',0,'leased',1001); seed('sent',0,'sent'); seed('hold',0,'reconcile');
    const seen: string[] = [];
    const result = await runDueNotifications(db, async e=>{seen.push(e.id);return {kind:'accepted',providerId:e.id};},()=>1000,3);
    assert.deepEqual(seen,['expired','a','b']);
    assert.equal(result.selected,3); assert.equal(result.accepted,3);
    assert.equal(sql.prepare("SELECT count(*) AS n FROM notification_outbox WHERE state='sent'").get()?.n,4);
  } finally {sql.close();}
});

test('batch limit and two-send concurrency are respected; remaining work stays pending', async () => {
  const {sql,db,seed} = fixture();
  try {
    for(let i=0;i<7;i++) seed(String(i),0);
    let active=0,peak=0;
    const result=await runDueNotifications(db,async e=>{
      active++;peak=Math.max(peak,active);
      await new Promise<void>(resolve=>setImmediate(resolve));
      active--;return {kind:'accepted',providerId:e.id};
    },()=>1000,4);
    assert.equal(result.accepted,4); assert.equal(peak,2);
    assert.equal(sql.prepare("SELECT count(*) AS n FROM notification_outbox WHERE state='pending'").get()?.n,3);
  } finally {sql.close();}
});

test('overlapping scheduler runs cannot send the same event twice', async () => {
  const {sql,db,seed} = fixture();
  try {
    seed('one',0); seed('two',0);
    const sent: string[]=[];
    const send=async (e:{id:string})=>{sent.push(e.id);return {kind:'accepted' as const,providerId:e.id};};
    const reports=await Promise.all([runDueNotifications(db,send,()=>1000),runDueNotifications(db,send,()=>1000)]);
    assert.deepEqual(sent.sort(),['one','two']);
    assert.equal(reports.reduce((n,r)=>n+r.accepted,0),2);
  } finally {sql.close();}
});

test('isolates a failed database claim and continues other events without raw errors', async () => {
  const {sql,db,seed} = fixture();
  try {
    seed('bad',0);seed('good',1);
    sql.exec("CREATE TRIGGER fail_bad BEFORE UPDATE ON notification_outbox WHEN OLD.id='bad' BEGIN SELECT RAISE(ABORT,'PRIVATE failure'); END;");
    const result=await runDueNotifications(db,async e=>({kind:'accepted',providerId:e.id}),()=>1000);
    assert.equal(result.errors,1);assert.equal(result.accepted,1);
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
  } finally {sql.close();}
});

test('invalid bounds fail before any provider calls; empty queue is idle', async () => {
  const {sql,db} = fixture();
  try {
    const send=async()=>{throw Error('must not send');};
    for(const limit of [0,5,1.5,NaN]) await assert.rejects(runDueNotifications(db,send,()=>1000,limit));
    await assert.rejects(runDueNotifications(db,send,()=>NaN));
    assert.equal((await runDueNotifications(db,send,()=>1000)).selected,0);
  } finally {sql.close();}
});
