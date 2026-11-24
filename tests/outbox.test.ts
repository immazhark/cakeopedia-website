import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { Outbox, safeRetryWindowMs, type Delivery } from '../worker/outbox.ts';

let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare['getD1Database']>>;
before(async () => {
  mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("synthetic"); } }', compatibilityDate: '2026-07-30', d1Databases: ['DB'] });
  db = await mf.getD1Database('DB');
  for (const file of ['0001_enquiries.sql', '0002_outbox_leases.sql']) {
    const sql = await readFile(new URL('../migrations/' + file, import.meta.url), 'utf8');
    await db.batch(sql.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
  }
});
after(async () => { await mf?.dispose(); });
async function seed() {
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO enquiries (id,submission_id,payload_hash,public_reference,created_at,payload_json) VALUES (?,?,?,?,?,?)').bind(id,id,'synthetic',id,0,'{}').run();
  await db.prepare('INSERT INTO notification_outbox (id,enquiry_id,recipient_role,next_attempt_at) VALUES (?,?,?,?)').bind(id,id,'owner',0).run();
  return { id, outbox: new Outbox(db) };
}
async function row(id: string) { return db.prepare('SELECT * FROM notification_outbox WHERE id=?').bind(id).first<Record<string, unknown>>(); }

test('concurrent dispatchers acquire only one send lease', async () => {
  const {id,outbox} = await seed(); let calls = 0;
  const results = await Promise.all(Array.from({length:8}, () => outbox.dispatch(id, async () => { calls++; return {kind:'accepted',providerId:'synthetic-accepted'}; }, () => 1000)));
  assert.equal(calls,1); assert.equal(results.filter(r => r==='accepted').length,1);
  assert.equal((await row(id))!.state,'sent');
  assert.equal(await outbox.dispatch(id,async () => { throw Error('do not resend'); },()=>100000),'idle');
});
test('temporary failure honours quota delay and uses the same event key', async () => {
  const {id,outbox} = await seed(); const keys: string[]=[]; let now=1000;
  assert.equal(await outbox.dispatch(id,async (_,key)=>{keys.push(key);return {kind:'retry',reason:'quota',retryAfterMs:120000};},()=>now),'pending');
  assert.equal((await row(id))!.next_attempt_at,121000);
  now=120999; assert.equal(await outbox.dispatch(id,async()=>{throw Error('too early');},()=>now),'idle');
  now=121000; assert.equal(await outbox.dispatch(id,async (_,key)=>{keys.push(key);return {kind:'accepted',providerId:'same-request'};},()=>now),'accepted');
  assert.equal(keys[0],keys[1]); assert.equal((await row(id))!.attempts,2);
});
test('permanent provider rejection stops retries without deleting the enquiry', async () => {
  const {id,outbox} = await seed();
  assert.equal(await outbox.dispatch(id,async()=>({kind:'permanent'}),()=>1000),'failed');
  assert.equal(await outbox.dispatch(id,async()=>{throw Error('must not retry');},()=>999999),'idle');
  assert.equal((await row(id))!.last_error_code,'permanent_rejection');
  assert.ok(await db.prepare('SELECT id FROM enquiries WHERE id=?').bind(id).first());
});
test('ambiguous network error becomes a safe code; older ambiguity requires reconciliation', async () => {
  const {id,outbox} = await seed();
  assert.equal(await outbox.dispatch(id,async()=>{throw Error('PRIVATE API KEY AND CUSTOMER');},()=>1000),'pending');
  assert.equal((await row(id))!.last_error_code,'outcome_unknown');
  let calls=0;
  assert.equal(await outbox.dispatch(id,async()=>{calls++;return {kind:'accepted',providerId:'wrong'};},()=>1000+safeRetryWindowMs),'reconcile');
  assert.equal(calls,0); assert.equal((await row(id))!.state,'reconcile');
  assert.doesNotMatch(JSON.stringify(await row(id)),/PRIVATE API/);
});
test('expired lease recovers after a crash without changing its provider key', async () => {
  const {id,outbox} = await seed();
  const first=await outbox.claim(id,1000); assert.ok(first);
  assert.equal(await outbox.claim(id,60999),null);
  let key='';
  assert.equal(await outbox.dispatch(id,async(_,value)=>{key=value;return {kind:'accepted',providerId:'recovered'};},()=>61000),'accepted');
  assert.equal(key,`cakeopedia/${id}`); assert.equal((await row(id))!.attempts,2);
});
test('stale dispatcher cannot overwrite a newer lease result', async () => {
  const {id,outbox} = await seed(); let now=1000;
  let release!: (result: Delivery)=>void;
  let started!: ()=>void; const entered=new Promise<void>(r=>{started=r;});
  const first=outbox.dispatch(id,async()=>{started();return new Promise<Delivery>(r=>{release=r;});},()=>now);
  await entered; now=61001;
  assert.equal(await outbox.dispatch(id,async()=>({kind:'permanent'}),()=>now),'failed');
  release({kind:'accepted',providerId:'stale'});
  assert.equal(await first,'lease_lost'); assert.equal((await row(id))!.state,'failed');
  assert.equal((await row(id))!.provider_id,null);
});
test('retries are bounded and quota delay cannot cross the safe deduplication window', async () => {
  const {id,outbox} = await seed(); let now=1000;
  for(let attempt=1;attempt<=6;attempt++) {
    assert.equal(await outbox.dispatch(id,async()=>({kind:'unknown'}),()=>now),attempt===6?'reconcile':'pending');
    now=Number((await row(id))!.next_attempt_at);
  }
  assert.equal((await row(id))!.attempts,6);
  const other=await seed();
  assert.equal(await other.outbox.dispatch(other.id,async()=>({kind:'retry',reason:'quota',retryAfterMs:86400000}),()=>1000),'reconcile');
});
