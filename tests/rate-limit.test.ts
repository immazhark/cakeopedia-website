import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { Database, Statement } from '../worker/store.ts';
import { createRateLimiter, purgeRateWindows } from '../worker/rate-limit.ts';

const policy={clientLimit:3,globalLimit:5};
const secret='a'.repeat(64);
function fixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/0011_rate_windows.sql',import.meta.url),'utf8'));
  const db:Database={
    prepare(query:string):Statement{
      const stmt=sql.prepare(query);let values:(string|number|null)[]=[];
      return {bind(...args){values=args;return this;},async first<T>(){return (stmt.get(...values) as T|undefined)??null;}};
    },
    async batch(statements){for(const stmt of statements)await stmt.first();return [];},
  };
  return {sql,db};
}

test('concurrent consumers across limiter instances cannot exceed client quota',async()=>{
  const {sql,db}=fixture();
  try{
    const one=createRateLimiter(db,secret,()=>1000),two=createRateLimiter(db,secret,()=>1000);
    const result=await Promise.all(Array.from({length:10},(_,i)=>(i%2?one:two)('enquiry','trusted-client-a',policy)));
    assert.equal(result.filter(Boolean).length,3);
    const rows=sql.prepare('SELECT subject,hits FROM request_rate_windows ORDER BY subject').all();
    assert.equal(rows.length,3);
    assert.deepEqual(rows.map(x=>Number(x.hits)).sort((a,b)=>a-b),[3,3,10]); // client quota 3, admitted (global) 3, attempts 10
    assert.equal(rows.find(x=>x.subject==='global')?.hits,3); // admitted requests only
    assert.ok(rows.every(x=>x.subject==='global'||/^[0-9a-f]{64}$/.test(String(x.subject))));
    assert.doesNotMatch(JSON.stringify(rows),/trusted-client-a/);
  }finally{sql.close();}
});
test('global cap limits cardinality from rotating identities and isolates scopes',async()=>{
  const {sql,db}=fixture();
  try{
    const limit=createRateLimiter(db,secret,()=>1000);
    const results=await Promise.all(Array.from({length:30},(_,i)=>limit('upload','client-'+i,policy)));
    assert.equal(results.filter(Boolean).length,5);
    assert.ok(Number(sql.prepare('SELECT count(*) AS n FROM request_rate_windows').get()?.n)<=25+2); // attempts cap bounds row creation
    assert.equal(await limit('enquiry','client-0',policy),true);
  }finally{sql.close();}
});
test('one client flooding cannot spend the admitted budget of everyone else',async()=>{
  const {sql,db}=fixture();
  try{
    const limit=createRateLimiter(db,secret,()=>1000);
    for(let i=0;i<20;i++)await limit('enquiry','evil-client',policy);
    assert.equal(await limit('enquiry','legit-client-1',policy),true);
    assert.equal(await limit('enquiry','legit-client-2',policy),true);
  }finally{sql.close();}
});
test('new fixed window resets budget and changes stored pseudonym',async()=>{
  const {sql,db}=fixture();let now=59_999;
  try{
    const limit=createRateLimiter(db,secret,()=>now);
    assert.equal(await limit('enquiry','client-a',{clientLimit:1,globalLimit:2}),true);
    assert.equal(await limit('enquiry','client-a',{clientLimit:1,globalLimit:2}),false);
    now=60_000;
    assert.equal(await limit('enquiry','client-a',{clientLimit:1,globalLimit:2}),true);
    assert.equal(sql.prepare("SELECT count(DISTINCT subject) AS n FROM request_rate_windows WHERE subject<>'global'").get()?.n,4);
  }finally{sql.close();}
});
test('bounded cleanup preserves current and previous windows',async()=>{
  const {sql,db}=fixture();
  try{
    const insert=sql.prepare('INSERT INTO request_rate_windows VALUES (?,?,?,?)');
    for(let i=0;i<6;i++)insert.run('enquiry',0,i.toString(16).padStart(64,'0'),1);
    insert.run('enquiry',60_000,'global',1);insert.run('enquiry',120_000,'global',1);
    await purgeRateWindows(db,120_000,2);
    assert.equal(sql.prepare('SELECT count(*) AS n FROM request_rate_windows WHERE window_start=0').get()?.n,4);
    assert.equal(sql.prepare('SELECT count(*) AS n FROM request_rate_windows WHERE window_start>=60000').get()?.n,2);
  }finally{sql.close();}
});
test('invalid identity, bounds and storage failures fail closed',async()=>{
  const {sql,db}=fixture();
  try{
    assert.throws(()=>createRateLimiter(db,'short'));
    const limit=createRateLimiter(db,secret,()=>1000);
    assert.equal(await limit('enquiry','',policy),false);
    assert.equal(await limit('enquiry','a\nb',policy),false);
    await assert.rejects(limit('enquiry','client-a',{clientLimit:6,globalLimit:5}));
    assert.equal(sql.prepare('SELECT count(*) AS n FROM request_rate_windows').get()?.n,0);
    sql.exec('DROP TABLE request_rate_windows');
    await assert.rejects(limit('enquiry','client-a',policy),{message:'Rate limit unavailable'});
  }finally{sql.close();}
});
