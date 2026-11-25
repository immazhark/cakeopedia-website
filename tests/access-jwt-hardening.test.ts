import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyAccessJwt, type AccessConfig, type Jwk } from '../worker/auth.ts';

const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk:Jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'test-key'};
const cfg:AccessConfig={issuer:'https://test.cloudflareaccess.com',audience:'test-audience',operators:new Set(['owner@example.invalid']),getKeys:async()=>[jwk],now:()=>1000,origin:'https://cakeopedia.com'};
const valid={iss:cfg.issuer,aud:[cfg.audience],exp:1300,email:'owner@example.invalid'};
async function sign(payload:object,header:object={alg:'RS256',kid:'test-key'}){
  const encode=(v:object)=>Buffer.from(JSON.stringify(v)).toString('base64url');
  const data=encode(header)+'.'+encode(payload);
  const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(data));
  return data+'.'+Buffer.from(sig).toString('base64url');
}

test('valid signed operator identity is accepted',async()=>{
  assert.equal(await verifyAccessJwt(await sign(valid),cfg),'owner@example.invalid');
});
test('malformed temporal and audience claims are rejected even with valid signature',async()=>{
  for(const payload of [{...valid,nbf:'1000'},{...valid,nbf:null},{...valid,nbf:1000.25},{...valid,exp:1300.5},{...valid,aud:[cfg.audience,42]}]){
    assert.equal(await verifyAccessJwt(await sign(payload),cfg),null);
  }
});
test('oversized or noncanonical tokens are rejected before key lookup',async()=>{
  let lookups=0;const config={...cfg,getKeys:async()=>{lookups++;return [jwk];}};
  assert.equal(await verifyAccessJwt(await sign({...valid,padding:'x'.repeat(17000)}),config),null);
  const token=await sign(valid);
  assert.equal(await verifyAccessJwt(token+'=',config),null);
  assert.equal(lookups,0);
});
test('duplicate matching key ids and unsupported critical headers fail closed',async()=>{
  assert.equal(await verifyAccessJwt(await sign(valid),{...cfg,getKeys:async()=>[jwk,jwk]}),null);
  assert.equal(await verifyAccessJwt(await sign(valid,{alg:'RS256',kid:'test-key',crit:['unknown'],unknown:true}),cfg),null);
});
