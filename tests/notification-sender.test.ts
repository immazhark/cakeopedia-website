import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { Database, Statement } from '../worker/store.ts';
import { Outbox } from '../worker/outbox.ts';
import { runDueNotifications } from '../worker/notification-scheduler.ts';
import { createNotificationSender } from '../worker/notification-sender.ts';

const reference='CK-12345678-1234-4234-8234-123456789abc';
const config={from:'sender@example.invalid',owner:'owner@example.invalid',apiKey:'synthetic-secret'};
function fixture(kind='email', role='customer') {
  const sql=new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON;');
  for(const file of ['0001_enquiries.sql','0002_outbox_leases.sql','0010_notification_snapshots.sql']) {
    sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  }
  sql.prepare('INSERT INTO enquiries (id,submission_id,payload_hash,public_reference,created_at,payload_json) VALUES (?,?,?,?,?,?)')
    .run('e','sub','synthetic',reference,0,JSON.stringify({contact:{kind,value:kind==='email'?'customer@example.invalid':'5550000000'}}));
  sql.prepare('INSERT INTO notification_outbox (id,enquiry_id,recipient_role,next_attempt_at) VALUES (?,?,?,?)').run('event','e',role,0);
  const db:Database={
    prepare(query:string):Statement {
      const stmt=sql.prepare(query);let values:(string|number|null)[]=[];
      return {bind(...args){values=args;return this;},async first<T>(){return (stmt.get(...values) as T|undefined)??null;}};
    },
    async batch(){throw Error('not used');},
  };
  return {sql,db};
}

test('sender freezes payload before transport and retries identical bytes despite config/contact changes',async()=>{
  const {sql,db}=fixture();let now=1000;
  const requests:RequestInit[]=[];
  const transport:typeof fetch=async(_url,init)=>{
    requests.push(init!);
    assert.equal(sql.prepare('SELECT payload FROM notification_snapshots').get()?.payload,init!.body);
    if(requests.length===1) throw Error('lost response');
    return new Response('{"id":"provider-test"}',{status:200});
  };
  try {
    const first=await runDueNotifications(db,createNotificationSender(db,config,transport,()=>now),()=>now);
    assert.equal(first.pending,1);
    now=61000;
    sql.prepare('UPDATE enquiries SET payload_json=?').run(JSON.stringify({contact:{kind:'email',value:'changed@example.invalid'}}));
    const second=await runDueNotifications(db,createNotificationSender(db,{...config,from:'new@example.invalid'},transport,()=>now),()=>now);
    assert.equal(second.accepted,1);
    assert.equal(requests.length,2);
    assert.equal(requests[0]!.body,requests[1]!.body);
    assert.equal(new Headers(requests[0]!.headers).get('Idempotency-Key'),new Headers(requests[1]!.headers).get('Idempotency-Key'));
  }finally{sql.close();}
});

test('non-email customer acknowledgement is explicitly skipped without contacting provider',async()=>{
  const {sql,db}=fixture('phone');let calls=0;
  try {
    const report=await runDueNotifications(db,createNotificationSender(db,config,async()=>{calls++;throw Error('unexpected');},()=>1000),()=>1000);
    assert.equal(report.skipped,1);assert.equal(calls,0);
    const row=sql.prepare('SELECT state,last_error_code,provider_id FROM notification_outbox').get();
    assert.equal(row?.state,'failed');assert.equal(row?.last_error_code,'not_applicable_non_email');assert.equal(row?.provider_id,null);
    assert.equal(sql.prepare('SELECT kind FROM notification_snapshots').get()?.kind,'skip');
  }finally{sql.close();}
});

test('missing snapshot after an old attempt is reconciled without contacting provider',async()=>{
  const {sql,db}=fixture();let calls=0;
  try {
    assert.ok(await new Outbox(db).claim('event',1000));
    const now=61000;
    const report=await runDueNotifications(db,createNotificationSender(db,config,async()=>{calls++;throw Error('unexpected');},()=>now),()=>now);
    assert.equal(report.reconcile,1);assert.equal(calls,0);
    assert.equal(sql.prepare('SELECT last_error_code FROM notification_outbox').get()?.last_error_code,'snapshot_unavailable');
  }finally{sql.close();}
});

test('sender refuses transport when remaining lease time is insufficient',async()=>{
  const {sql,db}=fixture();let calls=0;let now=1000;
  try {
    const event=await new Outbox(db).claim('event',now);
    assert.ok(event);now=60000;
    const result=await createNotificationSender(db,config,async()=>{calls++;throw Error('unexpected');},()=>now)(event,'cakeopedia/event');
    assert.deepEqual(result,{kind:'reconcile',reason:'insufficient_send_window'});
    assert.equal(calls,0);
  }finally{sql.close();}
});
