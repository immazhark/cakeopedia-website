import { CURRENT, changed, out, uuid, type AdminDb } from './admin-common.ts';

// Owner-initiated erasure of one customer's personal data. Financial records (amounts, dates, versions) are evidence and stay;
// everything that identifies the customer goes: contact and request text, pictures, queued message content and free-text notes.
// Order: tombstone pictures -> delete objects -> one atomic batch for the rows. Any failure before the batch leaves the personal data
// in place and the request safely repeatable; a repeat after success is a no-op.
export interface EraseBucket { delete(key: string): Promise<void> }
const ERASED_PAYLOAD = JSON.stringify({ name: 'Erased customer', contact: { kind: 'erased', value: '' }, erased: true });

export async function routeErase(request: Request, db: AdminDb, actor: string, now: () => number, url: URL, bucket?: EraseBucket): Promise<Response | null> {
  const m = url.pathname.match(/^\/admin\/api\/enquiries\/([^/]+)\/erase$/);
  if (!m) return null;
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  const id = m[1]!;
  if (!uuid.test(id)) return out(404, { error: 'not_found' });
  let body: { confirmReference?: unknown } = {};
  try { const raw = await request.text(); if (raw.length > 1000) return out(413, { error: 'too_large' }); body = JSON.parse(raw); } catch { return out(400, { error: 'invalid_input' }); }
  const row = await db.prepare(`SELECT e.public_reference AS ref, ${CURRENT} AS status, json_extract(e.payload_json, '$.erased') AS erased FROM enquiries e WHERE e.id = ?`).bind(id).first<{ ref: string; status: string; erased: number | null }>();
  if (!row) return out(404, { error: 'not_found' });
  if (body.confirmReference !== row.ref) return out(400, { error: 'confirmation_mismatch' }); // the owner must type the reference
  if (row.status === 'confirmed') return out(409, { error: 'order_active' }); // the contact details are still needed to fulfil it: close it first
  const t = now();
  const { results: pics } = await db.prepare('UPDATE uploads SET deleted_at = COALESCE(deleted_at, ?) WHERE enquiry_id = ? RETURNING object_key AS key').bind(t, id).all<{ key: string }>();
  if (pics.length > 0) {
    if (!bucket) return out(503, { error: 'erase_incomplete', retry: true });
    for (const p of pics) { try { await bucket.delete(p.key); } catch { return out(503, { error: 'erase_incomplete', retry: true }); } }
  }
  const eid = crypto.randomUUID();
  await db.batch([
    db.prepare('DELETE FROM uploads WHERE enquiry_id = ?').bind(id),
    db.prepare("UPDATE notification_snapshots SET kind = 'skip', payload = NULL WHERE event_id IN (SELECT id FROM notification_outbox WHERE enquiry_id = ?)").bind(id),
    db.prepare("UPDATE notification_outbox SET state = 'failed' WHERE enquiry_id = ? AND state <> 'sent'").bind(id),
    db.prepare('UPDATE enquiry_events SET note = NULL WHERE enquiry_id = ?').bind(id),
    db.prepare('UPDATE quotes SET design_notes = NULL, prep_notes = NULL WHERE enquiry_id = ?').bind(id),
    db.prepare('UPDATE payments SET note = NULL WHERE enquiry_id = ?').bind(id),
    db.prepare("INSERT INTO enquiry_events (id, enquiry_id, status, created_at, actor, note) SELECT ?, e.id, 'closed', ?, ?, NULL FROM enquiries e WHERE e.id = ? AND json_extract(e.payload_json, '$.erased') IS NULL AND " + CURRENT + " <> 'closed'").bind(eid, t, actor, id),
    db.prepare('UPDATE enquiries SET payload_json = ? WHERE id = ?').bind(ERASED_PAYLOAD, id),
  ]);
  return out(200, { erased: true, alreadyErased: row.erased === 1 });
}
