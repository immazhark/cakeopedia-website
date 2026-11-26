import { CURRENT, out, readBounded, uuid, type AdminDb } from './admin-common.ts';

// Erasure of one customer's personal data. Financial records (amounts, dates, versions) are evidence and stay;
// everything that identifies the customer goes: contact and request text, pictures, queued message content and free-text notes.
// Order: tombstone pictures -> delete objects -> one atomic batch for the rows. Any failure before the batch leaves the personal data
// in place and the request safely repeatable; a repeat after success is a no-op. Used by the owner's erase action and by the retention job.
export interface EraseBucket { delete(key: string): Promise<void> }
const ERASED_PAYLOAD = JSON.stringify({ name: 'Erased customer', contact: { kind: 'erased', value: '' }, erased: true });

export type EraseResult = { ok: true; alreadyErased: boolean } | { ok: false; error: 'not_found' | 'confirmation_mismatch' | 'order_active' | 'erase_incomplete' };

// `confirmReference` is checked only when given (the owner types it; the retention job has no one to ask).
export async function eraseEnquiry(db: AdminDb, id: string, actor: string, t: number, bucket?: EraseBucket, confirmReference?: unknown, requireConfirm = true): Promise<EraseResult> {
  const row = await db.prepare(`SELECT e.public_reference AS ref, ${CURRENT} AS status, json_extract(e.payload_json, '$.erased') AS erased FROM enquiries e WHERE e.id = ?`).bind(id).first<{ ref: string; status: string; erased: number | null }>();
  if (!row) return { ok: false, error: 'not_found' };
  if (requireConfirm && confirmReference !== row.ref) return { ok: false, error: 'confirmation_mismatch' };
  if (row.status === 'confirmed') return { ok: false, error: 'order_active' }; // the contact details are still needed to fulfil it: close it first
  const { results: pics } = await db.prepare('UPDATE uploads SET deleted_at = COALESCE(deleted_at, ?) WHERE enquiry_id = ? RETURNING object_key AS key').bind(t, id).all<{ key: string }>();
  if (pics.length > 0) {
    if (!bucket) return { ok: false, error: 'erase_incomplete' };
    for (const p of pics) { try { await bucket.delete(p.key); } catch { return { ok: false, error: 'erase_incomplete' }; } }
  }
  const eid = crypto.randomUUID();
  try { await db.batch([
    // Guard: if the order became confirmed after the status check above, this violates NOT NULL and aborts the whole batch, so a confirmed order's contact details are never wiped.
    db.prepare("UPDATE enquiries AS e SET payload_hash = NULL WHERE e.id = ? AND " + CURRENT + " = 'confirmed'").bind(id),
    db.prepare('DELETE FROM uploads WHERE enquiry_id = ?').bind(id),
    db.prepare("UPDATE notification_snapshots SET kind = 'skip', payload = NULL WHERE event_id IN (SELECT id FROM notification_outbox WHERE enquiry_id = ?)").bind(id),
    db.prepare("UPDATE notification_outbox SET state = 'failed' WHERE enquiry_id = ? AND state <> 'sent'").bind(id),
    db.prepare('UPDATE enquiry_events SET note = NULL WHERE enquiry_id = ?').bind(id),
    db.prepare('UPDATE quotes SET design_notes = NULL, prep_notes = NULL WHERE enquiry_id = ?').bind(id),
    db.prepare('UPDATE payments SET note = NULL WHERE enquiry_id = ?').bind(id),
    db.prepare("INSERT INTO enquiry_events (id, enquiry_id, status, created_at, actor, note) SELECT ?, e.id, 'closed', ?, ?, NULL FROM enquiries e WHERE e.id = ? AND json_extract(e.payload_json, '$.erased') IS NULL AND " + CURRENT + " <> 'closed'").bind(eid, t, actor, id),
    db.prepare('UPDATE enquiries SET payload_json = ? WHERE id = ?').bind(ERASED_PAYLOAD, id),
  ]); } catch (err) {
    const now = await db.prepare(`SELECT ${CURRENT} AS status FROM enquiries e WHERE e.id = ?`).bind(id).first<{ status: string }>();
    if (now?.status === 'confirmed') return { ok: false, error: 'order_active' };
    throw err;
  }
  return { ok: true, alreadyErased: row.erased === 1 };
}

export async function routeErase(request: Request, db: AdminDb, actor: string, now: () => number, url: URL, bucket?: EraseBucket): Promise<Response | null> {
  const m = url.pathname.match(/^\/admin\/api\/enquiries\/([^/]+)\/erase$/);
  if (!m) return null;
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  const id = m[1]!;
  if (!uuid.test(id)) return out(404, { error: 'not_found' });
  let body: { confirmReference?: unknown } = {};
  try { const raw = await readBounded(request, 1000); if (raw === null) return out(413, { error: 'too_large' }); body = JSON.parse(raw); } catch { return out(400, { error: 'invalid_input' }); }
  const r = await eraseEnquiry(db, id, actor, now(), bucket, body.confirmReference);
  if (r.ok) return out(200, { erased: true, alreadyErased: r.alreadyErased });
  if (r.error === 'not_found') return out(404, { error: 'not_found' });
  if (r.error === 'confirmation_mismatch') return out(400, { error: 'confirmation_mismatch' });
  if (r.error === 'order_active') return out(409, { error: 'order_active' });
  return out(503, { error: 'erase_incomplete', retry: true });
}

// Retention: erase enquiries the owner has explicitly CLOSED and that have been quiet for `days`. Open, replied, quoted and confirmed
// enquiries are never touched. A bounded batch per run keeps each scheduled invocation short; failures leave data in place for the next run.
export const MIN_RETENTION_DAYS = 30;
export function retentionDays(value: string | undefined): number | null {
  if (!value || !/^\d{1,5}$/.test(value)) return null;
  const n = Number(value);
  return n >= MIN_RETENTION_DAYS ? n : null; // anything shorter, or not a whole number, leaves retention off
}
export async function purgeExpiredEnquiries(db: AdminDb, bucket: EraseBucket | undefined, now: number, days: number, limit = 20): Promise<{ erased: number; failed: number }> {
  const cutoff = now - days * 86_400_000;
  const { results } = await db.prepare(
    `SELECT e.id AS id FROM enquiries e WHERE ${CURRENT} = 'closed' AND json_extract(e.payload_json, '$.erased') IS NULL
       AND COALESCE((SELECT MAX(ev.created_at) FROM enquiry_events ev WHERE ev.enquiry_id = e.id), e.created_at) < ? ORDER BY e.created_at LIMIT ?`).bind(cutoff, limit).all<{ id: string }>();
  let erased = 0, failed = 0;
  for (const { id } of results) {
    const r = await eraseEnquiry(db, id, 'retention', now, bucket, undefined, false).catch(() => ({ ok: false as const }));
    if (r.ok) erased++; else failed++;
  }
  return { erased, failed };
}
