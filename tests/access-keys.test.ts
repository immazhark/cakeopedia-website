import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAccessKeySource } from '../worker/access-keys.ts';
import { verifyAccessJwt, type AccessConfig } from '../worker/auth.ts';

const issuer='https://example-team.cloudflareaccess.com';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'current',alg:'RS256',use:'sig'};
const reply=(keys:unknown)=>new Response(JSON.stringify({keys,public_cert:{cert:'ignored'}}));
test('pins key endpoint, keeps concurrent loads request-local and isolates cache data',async()=>{
  let calls=0;
  const source=createAccessKeySource(issuer,async(url,init)=>{
    calls++;
    assert.equal(url,issuer+'/cdn-cgi/access/certs');
    assert.equal(init?.redirect,'manual');
    return reply([jwk]);
  },()=>1000);
  const results=await Promise.all(Array.from({length:8},()=>source()));
  assert.equal(calls,8);assert.equal(results[0]?.[0]?.kid,'current');
  results[0]![0]!.kid='corrupted';
  assert.equal((await source())[0]?.kid,'current');assert.equal(calls,8);
});
test('refreshes after TTL and never accepts expired cache on failed refresh',async()=>{
  let now=1000,calls=0,fail=false;
  const source=createAccessKeySource(issuer,async()=>{
    calls++;
    if(fail) throw Error('private diagnostic');
    return reply([{...jwk,kid:calls===1?'current':'rotated'}]);
  },()=>now);
  assert.equal((await source())[0]?.kid,'current');
  now+=59_999;assert.equal((await source())[0]?.kid,'current');
  now++;assert.equal((await source())[0]?.kid,'rotated');
  now+=60_000;fail=true;
  await assert.rejects(source(),{message:'Access signing keys unavailable'});
  await assert.rejects(source(),{message:'Access signing keys unavailable'});
  assert.equal(calls,3);
  now+=5000;fail=false;assert.equal((await source())[0]?.kid,'rotated');
});
test('rejects untrusted issuer URLs and malformed or ambiguous key sets',async()=>{
  for(const url of ['http://example-team.cloudflareaccess.com',issuer+'/',issuer+'/path',issuer+'.evil.example','https://a@'+issuer.slice(8),'https://cloudflareaccess.com']){
    assert.throws(()=>createAccessKeySource(url,async()=>reply([jwk])));
  }
  for(const keys of [[],[jwk,jwk],[{...jwk,d:'private'}],[{...jwk,alg:'HS256'}],[{...jwk,n:'short'}],[{...jwk,use:'enc'}]]){
    const source=createAccessKeySource(issuer,async()=>reply(keys));
    await assert.rejects(source(),{message:'Access signing keys unavailable'});
  }
});
test('bounds slow transport, streaming response and oversized body',async()=>{
  const hanging:typeof fetch=async()=>new Promise<Response>(()=>{});
  const streaming:typeof fetch=async()=>new Response(new ReadableStream({start(){}}));
  const oversized:typeof fetch=async()=>new Response(JSON.stringify({keys:[jwk],padding:'x'.repeat(33000)}));
  for(const transport of [hanging,streaming,oversized]) await assert.rejects(createAccessKeySource(issuer,transport,()=>1000,20)(),{message:'Access signing keys unavailable'});
});
test('fetched public key verifies an actual signed Access token',async()=>{
  const source=createAccessKeySource(issuer,async()=>reply([jwk]));
  const cfg:AccessConfig={issuer,audience:'test-aud',operators:new Set(['owner@example.invalid']),getKeys:source,now:()=>1000,origin:'https://cakeopedia.com'};
  const encode=(value:object)=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const data=encode({alg:'RS256',kid:'current'})+'.'+encode({iss:issuer,aud:['test-aud'],email:'owner@example.invalid',exp:1100});
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(data));
  assert.equal(await verifyAccessJwt(data+'.'+Buffer.from(signature).toString('base64url'),cfg),'owner@example.invalid');
});

test('a late older refresh cannot overwrite a newer signing key set',async()=>{
  let release!: (response:Response)=>void;
  let calls=0;
  const source=createAccessKeySource(issuer,async()=>{
    if(++calls===1)return new Promise<Response>(resolve=>{release=resolve;});
    return reply([{...jwk,kid:'newer'}]);
  },()=>1000);
  const older=source();
  assert.equal((await source())[0]?.kid,'newer');
  release(reply([{...jwk,kid:'older'}]));
  assert.equal((await older)[0]?.kid,'newer');
  assert.equal((await source())[0]?.kid,'newer');
});
