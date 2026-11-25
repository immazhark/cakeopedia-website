import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTurnstileVerifier } from '../worker/turnstile.ts';

const config={secret:'synthetic-secret',hostname:'cakeopedia.com',action:'enquiry'};
const valid={success:true,hostname:'cakeopedia.com',action:'enquiry'};
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
test('validates token at fixed Siteverify endpoint and checks hostname and action',async()=>{
  const verify=createTurnstileVerifier(config,async(url,init)=>{
    assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');
    const body=new URLSearchParams(String(init?.body));
    assert.equal(body.get('secret'),config.secret);assert.equal(body.get('response'),'challenge');
    assert.equal(body.get('remoteip'),null);
    return reply(valid);
  });
  assert.equal(await verify('challenge'),true);
});
test('rejects false success, wrong hostname, wrong action and missing fields',async()=>{
  for(const value of [{success:false,'error-codes':['timeout-or-duplicate']},{...valid,hostname:'other.example'},{...valid,action:'login'},{success:true}]){
    assert.equal(await createTurnstileVerifier(config,async()=>reply(value))('challenge'),false);
  }
});
test('invalid configuration and invalid tokens never contact provider',async()=>{
  let calls=0;
  const fetcher:typeof fetch=async()=>{calls++;return reply(valid);};
  for(const cfg of [{...config,secret:''},{...config,hostname:'https://cakeopedia.com'},{...config,action:''}]){
    assert.throws(()=>createTurnstileVerifier(cfg,fetcher));
  }
  const verify=createTurnstileVerifier(config,fetcher);
  for(const token of ['', ' ', 'a'.repeat(2049), 'a\nb']) assert.equal(await verify(token),false);
  assert.equal(calls,0);
});
test('provider rejection of credentials, internal error and malformed responses are unavailable, not a failed challenge',async()=>{
  for(const response of [reply({success:false,'error-codes':['invalid-input-secret']}),reply({success:false,'error-codes':['internal-error']}),reply(valid,503),reply(null),new Response('not JSON'),reply({success:'true'})]){
    await assert.rejects(createTurnstileVerifier(config,async()=>response)('challenge'),{message:'Bot verification unavailable'});
  }
  await assert.rejects(createTurnstileVerifier(config,async()=>{throw Error('PRIVATE secret');})('challenge'),{message:'Bot verification unavailable'});
});
test('bounds both transport and streamed response; oversized reply fails closed',async()=>{
  const hanging:typeof fetch=async()=>new Promise<Response>(()=>{});
  await assert.rejects(createTurnstileVerifier(config,hanging,15)('challenge'),{message:'Bot verification unavailable'});
  const stream:typeof fetch=async()=>new Response(new ReadableStream({start(){}}));
  await assert.rejects(createTurnstileVerifier(config,stream,15)('challenge'),{message:'Bot verification unavailable'});
  await assert.rejects(createTurnstileVerifier(config,async()=>reply({...valid,padding:'x'.repeat(17000)}))('challenge'),{message:'Bot verification unavailable'});
});
