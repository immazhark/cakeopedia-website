import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { Database,Statement } from '../worker/store.ts';
import { runConfiguredMaintenance } from '../worker/maintenance-runtime.ts';

function fixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON;');
  for(const file of ['0001_enquiries.sql','0002_outbox_leases.sql','0010_notification_snapshots.sql','0011_rate_windows.sql']){
    sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  }
  sql.prepare('INSERT INTO enquiries (id,submission_id,payload_hash,public_reference,created_at,payload_json) VALUES (?,?,?,?,?,?)')
    .run('e','sub','synthetic','CK-12345678-1234-4234-8234-123456789abc',0,JSON.stringify({contact:{kind:'email',value:'test@example.invalid'}}));
  sql.prepare('INSERT INTO notification_outbox (id,enquiry_id,recipient_role,next_attempt_at) VALUES (?,?,?,?)').run('event','e','owner',0);
  sql.prepare('INSERT INTO request_rate_windows VALUES (?,?,?,?)').run('enquiry',0,'global',1);
  const db:Database={
    prepare(query:string):Statement{
      const stmt=sql.prepare(query);let values:(string|number|null)[]=[];
      return {bind(...args){values=args;return this;},async first<T>(){return (stmt.get(...values) as T|undefined)??null;}};
    },
    async batch(){throw Error('not used');},
  };
  return {sql,db};
}
const config={from:'sender@example.invalid',owner:'owner@example.invalid',apiKey:'synthetic-key'};
const clock=()=>120000;
const forbidden:typeof fetch=async()=>{throw Error('unexpected provider call');};

test('closed runtime leaves existing queue and rate counters untouched',async()=>{
  const {sql,db}=fixture();
  try{
    const result=await runConfiguredMaintenance(db,{},config,forbidden,clock);
    assert.deepEqual(result,{notifications:{state:'disabled'},rateCleanup:{state:'disabled'}});
    assert.equal(sql.prepare('SELECT attempts FROM notification_outbox').get()?.attempts,0);
    assert.equal(sql.prepare('SELECT count(*) AS n FROM request_rate_windows').get()?.n,1);
  }finally{sql.close();}
});
test('invalid sender configuration fails before acquiring a lease but permits cleanup',async()=>{
  const {sql,db}=fixture();
  try{
    for(const bad of [undefined,{...config,from:'bad-address'},{...config,apiKey:''}]){
      const result=await runConfiguredMaintenance(db,{notifications:'1',rateCleanup:'1'},bad,forbidden,clock);
      assert.equal(result.notifications.state,'failed');
      assert.equal(result.rateCleanup.state,'completed');
      assert.equal(sql.prepare('SELECT attempts FROM notification_outbox').get()?.attempts,0);
    }
    assert.equal(sql.prepare('SELECT count(*) AS n FROM request_rate_windows').get()?.n,0);
  }finally{sql.close();}
});
test('enabled runtime integrates snapshot sender and bounded cleanup using synthetic transport',async()=>{
  const {sql,db}=fixture();
  let calls=0;
  try{
    const transport:typeof fetch=async(_url,init)=>{
      calls++;
      assert.equal(sql.prepare('SELECT payload FROM notification_snapshots').get()?.payload,init?.body);
      return new Response('{"id":"synthetic"}',{status:200});
    };
    const result=await runConfiguredMaintenance(db,{notifications:'1',rateCleanup:'1'},config,transport,clock);
    assert.equal(result.notifications.state,'completed');
    assert.equal(result.rateCleanup.state,'completed');
    assert.equal(calls,1);
    assert.equal(sql.prepare('SELECT state FROM notification_outbox').get()?.state,'sent');
    assert.equal(sql.prepare('SELECT count(*) AS n FROM request_rate_windows').get()?.n,0);
  }finally{sql.close();}
});
