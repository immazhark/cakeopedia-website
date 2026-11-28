import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runMaintenance, type MaintenanceDependencies } from '../worker/maintenance.ts';

const report={selected:1,idle:0,accepted:1,pending:0,failed:0,reconcile:0,lease_lost:0,skipped:0,errors:0};
function fixture(){
  const calls:string[]=[];
  const deps:MaintenanceDependencies={
    clock:()=>1000,
    async notifications(){calls.push('notifications');return report;},
    async rateCleanup(){calls.push('cleanup');},
  };
  return {calls,deps};
}
test('defaults to closed with no provider or database work',async()=>{
  const {calls,deps}=fixture();
  assert.deepEqual(await runMaintenance({},deps),{notifications:{state:'disabled'},rateCleanup:{state:'disabled'}});
  assert.deepEqual(calls,[]);
});
test('each job requires its own explicit opt-in; invalid settings fail closed',async()=>{
  const {calls,deps}=fixture();
  assert.deepEqual(await runMaintenance({notifications:'true',rateCleanup:'1'},deps),{notifications:{state:'disabled'},rateCleanup:{state:'completed'}});
  assert.deepEqual(calls,['cleanup']);
  calls.length=0;
  assert.deepEqual(await runMaintenance({notifications:'1',rateCleanup:'0'},deps),{notifications:{state:'completed',report},rateCleanup:{state:'disabled'}});
  assert.deepEqual(calls,['notifications']);
});
test('job failure is isolated and raw diagnostics never enter reports',async()=>{
  const {calls,deps}=fixture();
  deps.notifications=async()=>{throw Error('PRIVATE recipient');};
  assert.deepEqual(await runMaintenance({notifications:'1',rateCleanup:'1'},deps),{notifications:{state:'failed'},rateCleanup:{state:'completed'}});
  assert.deepEqual(calls,['cleanup']);
});
test('invalid clock or missing dependencies must not invoke jobs',async()=>{
  const {calls,deps}=fixture();
  deps.clock=()=>NaN;
  assert.deepEqual(await runMaintenance({notifications:'1',rateCleanup:'1'},deps),{notifications:{state:'failed'},rateCleanup:{state:'failed'}});
  assert.deepEqual(calls,[]);
  assert.deepEqual(await runMaintenance({notifications:'1'}, {clock:()=>1000}),{notifications:{state:'failed'},rateCleanup:{state:'disabled'}});
});
test('cleanup gets one bounded invocation with current time; report flags partial dispatch failures',async()=>{
  const {deps}=fixture();
  let cleanupTime=0;
  deps.rateCleanup=async now=>{cleanupTime=now;};
  deps.notifications=async()=>({...report,accepted:0,errors:1});
  const result=await runMaintenance({notifications:'1',rateCleanup:'1'},deps);
  assert.deepEqual(result.notifications,{state:'partial',report:{...report,accepted:0,errors:1}});
  assert.equal(cleanupTime,1000);
});
