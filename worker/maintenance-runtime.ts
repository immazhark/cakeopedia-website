import type { Database } from './store.ts';
import { runMaintenance } from './maintenance.ts';
import { runDueNotifications } from './notification-scheduler.ts';
import { createNotificationSender } from './notification-sender.ts';
import { validateNotificationAddresses } from './notification-snapshot.ts';
import { purgeRateWindows } from './rate-limit.ts';

type Config=Readonly<{from:string;owner:string;apiKey:string}>;
type Gates=Parameters<typeof runMaintenance>[0];

// Dependency composition for controlled integration tests and a future approved
// scheduler. Not imported by the production entry point. No implicit fetch,
// secret lookup, deployment, HTTP route or scheduled trigger.
export async function runConfiguredMaintenance(db:Database,gates:Gates,
  config:Config|undefined,transport:typeof fetch,clock:()=>number=Date.now){
  return runMaintenance(gates,{
    clock,
    notifications:async()=>{
      if(!config||typeof config.from!=='string'||typeof config.owner!=='string'||
         typeof config.apiKey!=='string'||config.apiKey.length<1||config.apiKey.length>512||
         /[^\x21-\x7e]/.test(config.apiKey))throw Error('Invalid notification configuration');
      validateNotificationAddresses(config);
      return runDueNotifications(db,createNotificationSender(db,config,transport,clock),clock,4);
    },
    rateCleanup:now=>purgeRateWindows(db,now,200),
  });
}
