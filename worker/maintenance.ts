import type { runDueNotifications } from './notification-scheduler.ts';

type Report=Awaited<ReturnType<typeof runDueNotifications>>;
type Gates=Readonly<{notifications?:unknown;rateCleanup?:unknown}>;
type JobState={state:'disabled'|'failed'};
type NotificationState=JobState|{state:'completed'|'partial';report:Report};
type CleanupState=JobState|{state:'completed'};
export interface MaintenanceDependencies {
  clock:()=>number;
  notifications?:()=>Promise<Report>;
  rateCleanup?:(now:number)=>Promise<void>;
}

// Internal, bounded maintenance composition only. No HTTP endpoint, cron binding,
// provider configuration or production activation. Never run legacy orphan cleanup
// until upload/delete/attachment races have been reconciled.
export async function runMaintenance(gates:Gates,deps:MaintenanceDependencies):
  Promise<{notifications:NotificationState;rateCleanup:CleanupState}> {
  const notifications=gates.notifications==='1';
  const cleanup=gates.rateCleanup==='1';
  if(!notifications&&!cleanup)return {notifications:{state:'disabled'},rateCleanup:{state:'disabled'}};
  let now:number;
  try{
    now=deps.clock();
    if(!Number.isSafeInteger(now)||now<0)throw Error('Invalid maintenance clock');
  }catch{
    return {notifications:{state:notifications?'failed':'disabled'},rateCleanup:{state:cleanup?'failed':'disabled'}};
  }
  // Sequential bounded jobs avoid adding competing work to one D1 invocation.
  // A failed independent job never prevents the other enabled job.
  let notificationResult:NotificationState={state:'disabled'};
  let cleanupResult:CleanupState={state:'disabled'};
  if(notifications){
    try{
      if(!deps.notifications)throw Error('Missing maintenance dependency');
      const report=await deps.notifications();
      notificationResult={state:report.errors>0?'partial':'completed',report};
    }catch{notificationResult={state:'failed'};}
  }
  if(cleanup){
    try{
      if(!deps.rateCleanup)throw Error('Missing maintenance dependency');
      await deps.rateCleanup(now);
      cleanupResult={state:'completed'};
    }catch{cleanupResult={state:'failed'};}
  }
  return {notifications:notificationResult,rateCleanup:cleanupResult};
}
