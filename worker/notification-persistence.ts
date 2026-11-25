import type { Database } from './store.ts';
import type { NotificationEvent } from './outbox.ts';

type Snapshot = {kind:'send';payload:string} | {kind:'skip';reason:'non_email_contact'};
type Lease = Pick<NotificationEvent,'id'|'lease_token'>;
type Row = {kind:'send'|'skip';payload:string|null};

// Call only after acquiring an outbox lease. Null means do not send; reconcile
// an old attempt without a durable snapshot rather than guessing its bytes.
export async function freezeNotificationSnapshot(db: Database, event: Lease,
  build: () => Snapshot, clock: () => number = Date.now): Promise<Snapshot|null> {
  const current = async () => db.prepare(`SELECT s.kind,s.payload FROM notification_snapshots s
    JOIN notification_outbox o ON o.id=s.event_id
    WHERE o.id=? AND o.state='leased' AND o.lease_token=? AND o.lease_until>?`)
    .bind(event.id,event.lease_token,clock()).first<Row>();
  const decode = (row: Row): Snapshot => {
    if (row.kind==='skip' && row.payload===null) return {kind:'skip',reason:'non_email_contact'};
    if (row.kind==='send' && typeof row.payload==='string') return {kind:'send',payload:row.payload};
    throw Error('Invalid notification snapshot');
  };
  const existing=await current();
  if (existing) return decode(existing);
  const first=await db.prepare(`SELECT id FROM notification_outbox WHERE id=? AND state='leased'
    AND lease_token=? AND lease_until>? AND attempts=1`).bind(event.id,event.lease_token,clock()).first<{id:string}>();
  if (!first) return null;
  const candidate=build();
  const payload=candidate.kind==='send'?candidate.payload:null;
  if (payload!==null && (payload.length>16384 || new TextEncoder().encode(payload).byteLength>16384)) throw Error('Notification payload too large');
  const now=clock();
  await db.prepare(`INSERT INTO notification_snapshots (event_id,kind,payload,created_at)
    SELECT id,?,?,? FROM notification_outbox WHERE id=? AND state='leased' AND lease_token=?
    AND lease_until>? AND attempts=1 ON CONFLICT(event_id) DO NOTHING RETURNING event_id`)
    .bind(candidate.kind,payload,now,event.id,event.lease_token,now).first<{event_id:string}>();
  const frozen=await current();
  return frozen?decode(frozen):null;
}
