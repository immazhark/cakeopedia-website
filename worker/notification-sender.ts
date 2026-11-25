import type { Database } from './store.ts';
import { safeRetryWindowMs, type Sender } from './outbox.ts';
import { notificationSnapshot } from './notification-snapshot.ts';
import { freezeNotificationSnapshot } from './notification-persistence.ts';
import { sendResendEmail } from './resend-transport.ts';

type Config = Readonly<{from:string;owner:string;apiKey:string}>;
const timeoutMs=8_000;
const safetyMs=2_000;

// Internal composition only. No production entry point or scheduled trigger calls this.
export function createNotificationSender(db:Database,config:Config,transport:typeof fetch,
  clock:()=>number=Date.now):Sender {
  const approved=Object.freeze({...config});
  return async (event,key)=>{
    const hasTime=()=>{
      const now=clock();
      return Number.isSafeInteger(now) && now>=event.first_attempt_at &&
        event.lease_until-now>timeoutMs+safetyMs &&
        event.first_attempt_at+safeRetryWindowMs-now>timeoutMs+safetyMs;
    };
    if (!hasTime()) return {kind:'reconcile',reason:'insufficient_send_window'};
    const snapshot=await freezeNotificationSnapshot(db,event,async()=>{
      const row=await db.prepare(`SELECT e.public_reference AS reference,
        json_extract(e.payload_json,'$.contact.kind') AS kind,
        json_extract(e.payload_json,'$.contact.value') AS value
        FROM enquiries e JOIN notification_outbox o ON o.enquiry_id=e.id
        WHERE o.id=? AND o.enquiry_id=? AND o.state='leased' AND o.lease_token=? AND o.lease_until>?`)
        .bind(event.id,event.enquiry_id,event.lease_token,clock()).first<{reference:unknown;kind:unknown;value:unknown}>();
      if (!row || typeof row.reference!=='string' || typeof row.value!=='string' ||
          (row.kind!=='email' && row.kind!=='phone' && row.kind!=='instagram')) throw Error('Notification source unavailable');
      return notificationSnapshot(approved,event.recipient_role,row.reference,{kind:row.kind,value:row.value});
    },clock);
    if (!snapshot) return {kind:'reconcile',reason:'snapshot_unavailable'};
    if (snapshot.kind==='skip') return {kind:'skipped',reason:'non_email_contact'};
    if (!hasTime()) return {kind:'reconcile',reason:'insufficient_send_window'};
    return sendResendEmail(approved.apiKey,key,snapshot.payload,transport,timeoutMs);
  };
}
