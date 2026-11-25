import assert from 'node:assert/strict';
import { test } from 'node:test';
import production from '../worker/index.ts';

test('production worker exposes only closed health status and its scheduled trigger does nothing',async()=>{
  const response=await production.fetch(new Request('https://cakeopedia.com/health'));
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(await response.json(),{stage:'local-foundation',intakeEnabled:false});
  await production.scheduled({});await production.scheduled({},{LIVE_ENABLED:'1'}); // unconfigured: must neither throw nor touch anything
});
test('production write and private read routes cannot be enabled by client headers',async()=>{
  for(const [method,path] of [['POST','/api/enquiries'],['POST','/api/uploads'],['DELETE','/api/uploads/example'],['GET','/admin/api/enquiries'],['POST','/admin/api/orders'],['POST','/maintenance'],['POST','/health']] as const){
    const response=await production.fetch(new Request('https://cakeopedia.com'+path,{method,headers:{'Origin':'https://cakeopedia.com','X-Cakeopedia-Admin':'1','Cf-Access-Jwt-Assertion':'synthetic','X-Local-Dev':'1'}}));
    assert.equal(response.status,503);
    assert.equal(response.headers.get('Cache-Control'),'no-store');
    assert.deepEqual(await response.json(),{error:'intake_not_enabled'});
  }
});
