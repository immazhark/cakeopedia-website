import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { createRateLimiter, purgeRateWindows } from '../worker/rate-limit.ts';

let mf:Miniflare;
let db:Awaited<ReturnType<Miniflare['getD1Database']>>;
before(async()=>{
  mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("synthetic");}}',compatibilityDate:'2026-07-30',d1Databases:['DB']});
  db=await mf.getD1Database('DB');
  const sql=await readFile(new URL('../migrations/0011_rate_windows.sql',import.meta.url),'utf8');
  await db.batch(sql.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
});
after(async()=>{await mf?.dispose();});

test('D1 emulator shares atomic budget across limiter instances and expires old rows',async()=>{
  const secret='b'.repeat(64);
  const a=createRateLimiter(db,secret,()=>1000),b=createRateLimiter(db,secret,()=>1000);
  const policy={clientLimit:2,globalLimit:5};
  const decisions=await Promise.all(Array.from({length:8},(_,i)=>(i%2?a:b)('upload','synthetic-client',policy)));
  assert.equal(decisions.filter(Boolean).length,2);
  const count=await db.prepare('SELECT count(*) AS n FROM request_rate_windows').first<{n:number}>();
  assert.equal(count?.n,3); // attempts counter, client quota, admitted (global) budget
  const next=createRateLimiter(db,secret,()=>120_000);
  assert.equal(await next('upload','synthetic-client',policy),true);
  await purgeRateWindows(db,120_000,1);
  const old=await db.prepare('SELECT count(*) AS n FROM request_rate_windows WHERE window_start=0').first<{n:number}>();
  assert.equal(old?.n,2); // one of the three old rows purged
  await purgeRateWindows(db,120_000,2);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM request_rate_windows').first<{n:number}>())?.n,3); // only the current window's three rows remain
});
