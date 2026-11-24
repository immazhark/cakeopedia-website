import type { Database } from './store.ts';

export interface NotificationEvent {
  id: string;
  enquiry_id: string;
  recipient_role: 'owner' | 'customer';
  attempts: number;
  first_attempt_at: number;
  lease_token: string;
}
export type Delivery =
  | { kind: 'accepted'; providerId: string }
  | { kind: 'retry'; reason: 'quota' | 'temporary'; retryAfterMs?: number }
  | { kind: 'permanent' }
  | { kind: 'unknown' };
export type SendEvent = Pick<NotificationEvent, 'id' | 'enquiry_id' | 'recipient_role'>;
export type Sender = (event: Readonly<SendEvent>, idempotencyKey: string) => Promise<Delivery>;
// Below the provider's 24h dedup window; leave room for clock/transport uncertainty.
export const safeRetryWindowMs = 23 * 60 * 60 * 1000;
const maxAttempts = 6;
const leaseMs = 60_000;

export class Outbox {
  private db: Database;
  constructor(db: Database) { this.db = db; }
  async claim(id: string, now: number): Promise<NotificationEvent | null> {
    return this.db.prepare(`UPDATE notification_outbox
      SET state = 'leased', lease_token = ?, lease_until = ?, attempts = attempts + 1,
          first_attempt_at = COALESCE(first_attempt_at, ?)
      WHERE id = ? AND next_attempt_at <= ?
        AND (state = 'pending' OR (state = 'leased' AND lease_until <= ?))
      RETURNING id, enquiry_id, recipient_role, attempts, first_attempt_at, lease_token`)
      .bind(crypto.randomUUID(), now + leaseMs, now, id, now, now).first<NotificationEvent>();
  }
  private async finish(event: NotificationEvent, state: string, now: number, code: string | null, providerId: string | null = null): Promise<boolean> {
    const row = await this.db.prepare(`UPDATE notification_outbox
      SET state = ?, next_attempt_at = ?, last_error_code = ?, provider_id = ?, lease_token = NULL, lease_until = NULL
      WHERE id = ? AND state = 'leased' AND lease_token = ? AND lease_until > ? RETURNING id`)
      .bind(state, now, code, providerId, event.id, event.lease_token, now).first<{ id: string }>();
    return row !== null;
  }
  async dispatch(id: string, send: Sender, clock: () => number = Date.now): Promise<'idle' | 'accepted' | 'pending' | 'failed' | 'reconcile' | 'lease_lost'> {
    const event = await this.claim(id, clock());
    if (!event) return 'idle';
    const start = clock();
    if (start - event.first_attempt_at >= safeRetryWindowMs || event.attempts > maxAttempts) {
      return await this.finish(event, 'reconcile', start, 'retry_window_exhausted') ? 'reconcile' : 'lease_lost';
    }
    let result: Delivery;
    try {
      // A real adapter must freeze message content per event, enforce a short transport
      // timeout and reuse this key. It is intentionally NOT wired to a network provider.
      result = await send(Object.freeze({ id: event.id, enquiry_id: event.enquiry_id, recipient_role: event.recipient_role }), `cakeopedia/${event.id}`);
    } catch { result = { kind: 'unknown' }; }
    const now = clock();
    if (result.kind === 'accepted') {
      // 'sent' means provider accepted, never inbox delivery. No raw provider error logs.
      return await this.finish(event, 'sent', now, null, result.providerId) ? 'accepted' : 'lease_lost';
    }
    if (result.kind === 'permanent') {
      return await this.finish(event, 'failed', now, 'permanent_rejection') ? 'failed' : 'lease_lost';
    }
    const retryAfter = result.kind === 'retry' && Number.isFinite(result.retryAfterMs) ? Math.max(0, result.retryAfterMs ?? 0) : 0;
    const delay = Math.max(Math.min(60_000 * 2 ** (event.attempts - 1), 3_600_000), retryAfter);
    const next = now + delay;
    if (event.attempts >= maxAttempts || next - event.first_attempt_at >= safeRetryWindowMs) {
      return await this.finish(event, 'reconcile', now, 'retry_window_exhausted') ? 'reconcile' : 'lease_lost';
    }
    const updated = await this.db.prepare(`UPDATE notification_outbox
      SET state = 'pending', next_attempt_at = ?, last_error_code = ?, lease_token = NULL, lease_until = NULL
      WHERE id = ? AND state = 'leased' AND lease_token = ? AND lease_until > ? RETURNING id`)
      .bind(next, result.kind === 'retry' ? result.reason : 'outcome_unknown', event.id, event.lease_token, now).first<{ id: string }>();
    return updated ? 'pending' : 'lease_lost';
  }
}
