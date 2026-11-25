import { Outbox, type Sender } from './outbox.ts';
import type { Database } from './store.ts';

type Outcome = Awaited<ReturnType<Outbox['dispatch']>>;
type Report = Record<Outcome, number> & { selected: number; errors: number };

// Bounded, provider-neutral scheduling pass. Call only from an explicitly approved
// scheduler with a durable snapshot-aware sender. No cron or live transport is enabled here.
export async function runDueNotifications(db: Database, send: Sender,
  clock: () => number = Date.now, limit = 4): Promise<Report> {
  const now = clock();
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isInteger(limit) || limit < 1 || limit > 4) {
    throw Error('Invalid notification scheduler bounds');
  }
  // Aggregate a bounded selection to stay within the existing prepare/first D1 contract.
  // The outbox's compare-and-set lease remains the authoritative send gate.
  const row = await db.prepare(`SELECT json_group_array(id) AS ids FROM (
    SELECT id FROM notification_outbox WHERE next_attempt_at<=?
      AND (state='pending' OR (state='leased' AND lease_until<=?))
    ORDER BY next_attempt_at,id LIMIT ?
  )`).bind(now, now, limit).first<{ids:string}>();
  const ids: unknown = JSON.parse(row?.ids ?? '[]');
  if (!Array.isArray(ids) || ids.length > limit || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) {
    throw Error('Invalid notification candidate selection');
  }
  const report: Report = { selected: ids.length, idle: 0, accepted: 0, pending: 0, failed: 0, reconcile: 0, lease_lost: 0, skipped: 0, errors: 0 };
  const outbox = new Outbox(db);
  const dispatch = async (id: string) => {
    try { report[await outbox.dispatch(id, send, clock)]++; }
    catch { report.errors++; } // Never include recipient data, raw provider output or DB diagnostics.
  };
  for (let i = 0; i < ids.length; i += 2) await Promise.all(ids.slice(i, i + 2).map(dispatch));
  return report;
}
