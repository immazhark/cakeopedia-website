import { authorize, type AccessConfig } from './auth.ts';
import { CURRENT, isStatus, out, uuid, type AdminDb, type Status } from './admin-common.ts';
import { confirmBlocker, orderSummary, routeOrders } from './orders.ts';

// Private owner API entry. Authorises once per request, then routes. Responses are never cacheable;
// list pagination is keyset-based and bounded.
export type InboxDb = AdminDb;
export { STATUSES } from './admin-common.ts';
export interface PrivateBucket { get(key: string): Promise<{ body: ReadableStream } | null> }

export async function handleInbox(request: Request, db: AdminDb, cfg: AccessConfig, now: () => number = Date.now, bucket?: PrivateBucket): Promise<Response> {
  const op = await authorize(request, cfg);
  if (!op.ok) return op.response;
  const url = new URL(request.url);
  try {
    const order = await routeOrders(request, db, op.email, now, url);
    if (order) return order;
    const pic = url.pathname.match(/^\/admin\/api\/uploads\/([^/]+)$/);
    if (pic) { // authorised read of a customer's private inspiration picture (attached ones only)
      if (request.method !== 'GET') return new Response(null, { status: 405 });
      if (!bucket || !uuid.test(pic[1]!)) return out(404, { error: 'not_found' });
      const meta = await db.prepare('SELECT object_key AS key, content_type AS type FROM uploads WHERE id = ? AND enquiry_id IS NOT NULL').bind(pic[1]!.toLowerCase()).first<{ key: string; type: string }>();
      const object = meta && await bucket.get(meta.key);
      if (!meta || !object) return out(404, { error: 'not_found' });
      return new Response(object.body, { headers: { 'Content-Type': meta.type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': 'inline; filename="inspiration"' } });
    }
    const path = url.pathname.replace(/^\/admin\/api\/enquiries/, '');
    if (path === '' && request.method === 'GET') {
      const status = url.searchParams.get('status');
      if (status && !isStatus(status)) return out(400, { error: 'invalid_input' });
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 25) || 25, 1), 50);
      const beforeAt = Number(url.searchParams.get('beforeAt') ?? Number.MAX_SAFE_INTEGER);
      const beforeId = url.searchParams.get('beforeId') ?? '￿';
      if (!Number.isFinite(beforeAt)) return out(400, { error: 'invalid_input' });
      const { results } = await db.prepare(`SELECT * FROM (SELECT e.id, e.public_reference AS reference, e.created_at AS createdAt,
          json_extract(e.payload_json, '$.name') AS name, json_extract(e.payload_json, '$.occasion') AS occasion,
          json_extract(e.payload_json, '$.eventDate') AS eventDate, ${CURRENT} AS status,
          (SELECT count(*) FROM uploads u WHERE u.enquiry_id = e.id) AS pictures
        FROM enquiries e WHERE (e.created_at < ? OR (e.created_at = ? AND e.id < ?))) WHERE (? IS NULL OR status = ?)
        ORDER BY createdAt DESC, id DESC LIMIT ?`).bind(beforeAt, beforeAt, beforeId, status, status, limit + 1).all<{ id: string; createdAt: number }>();
      const page = results.slice(0, limit), last = page[page.length - 1];
      return out(200, { items: page, next: results.length > limit && last ? { beforeAt: last.createdAt, beforeId: last.id } : null });
    }
    const m = path.match(/^\/([^/]+)(\/status)?$/);
    const id = m?.[1];
    if (!m || !id || !uuid.test(id)) return out(404, { error: 'not_found' });
    const row = await db.prepare(`SELECT e.id, e.public_reference AS reference, e.created_at AS createdAt, e.payload_json AS payload, ${CURRENT} AS status FROM enquiries e WHERE e.id = ?`)
      .bind(id).first<{ id: string; payload: string; status: Status }>();
    if (!row) return out(404, { error: 'not_found' });
    if (!m[2] && request.method === 'GET') {
      const events = await db.prepare('SELECT status, created_at AS at, actor, note FROM enquiry_events WHERE enquiry_id = ? ORDER BY created_at, rowid').bind(id).all();
      const pictures = await db.prepare('SELECT id, content_type AS type, bytes FROM uploads WHERE enquiry_id = ? ORDER BY created_at').bind(id).all();
      return out(200, { ...row, payload: JSON.parse(row.payload), events: events.results, pictures: pictures.results, order: await orderSummary(db, id) });
    }
    if (m[2] && request.method === 'POST') {
      let body: unknown;
      try { body = await request.json(); } catch { return out(400, { error: 'invalid_input' }); }
      const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
      const note = b.note ?? null;
      if (!isStatus(b.status) || !isStatus(b.expected) || (note !== null && (typeof note !== 'string' || note.length > 1000))) return out(400, { error: 'invalid_input' });
      if (b.expected !== row.status) return out(409, { error: 'status_changed', current: row.status }); // optimistic concurrency
      if (b.status === row.status) return out(400, { error: 'no_change' });
      if (b.status === 'confirmed') {
        const blocker = await confirmBlocker(db, id); // owner-verified deposit is a precondition, never inferred
        if (blocker) return out(409, { error: blocker });
      }
      await db.prepare('INSERT INTO enquiry_events (id, enquiry_id, status, created_at, actor, note) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), id, b.status, now(), op.email, note).run();
      return out(200, { status: b.status });
    }
    return new Response(null, { status: 405, headers: { 'Cache-Control': 'no-store' } });
  } catch { return out(503, { error: 'unavailable' }); }
}
