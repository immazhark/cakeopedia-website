import { authorize, type AccessConfig } from './auth.ts';

// Private owner API. Every route authorises first; responses are never cacheable. Pagination is keyset-based and bounded.
interface Stmt {
  bind(...values: (string | number | null)[]): Stmt;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface InboxDb { prepare(sql: string): Stmt }
export const STATUSES = ['new', 'replied', 'quoted', 'confirmed', 'closed'] as const;
type Status = (typeof STATUSES)[number];
const isStatus = (v: unknown): v is Status => typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CURRENT = `COALESCE((SELECT ev.status FROM enquiry_events ev WHERE ev.enquiry_id = e.id ORDER BY ev.created_at DESC, ev.rowid DESC LIMIT 1),
  CASE e.status WHEN 'booked' THEN 'confirmed' ELSE e.status END)`;
const out = (status: number, body?: object) => new Response(body ? JSON.stringify(body) : null, { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

export async function handleInbox(request: Request, db: InboxDb, cfg: AccessConfig, now: () => number = Date.now): Promise<Response> {
  const op = await authorize(request, cfg);
  if (!op.ok) return op.response;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/admin\/api\/enquiries/, '');
  try {
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
      return out(200, { ...row, payload: JSON.parse(row.payload), events: events.results, pictures: pictures.results });
    }
    if (m[2] && request.method === 'POST') {
      let body: unknown;
      try { body = await request.json(); } catch { return out(400, { error: 'invalid_input' }); }
      const b = body as Record<string, unknown>;
      const note = b.note ?? null;
      if (!isStatus(b.status) || !isStatus(b.expected) || (note !== null && (typeof note !== 'string' || note.length > 1000))) return out(400, { error: 'invalid_input' });
      if (b.expected !== row.status) return out(409, { error: 'status_changed', current: row.status }); // optimistic concurrency
      if (b.status === row.status) return out(400, { error: 'no_change' });
      await db.prepare('INSERT INTO enquiry_events (id, enquiry_id, status, created_at, actor, note) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), id, b.status, now(), op.email, note).run();
      return out(200, { status: b.status });
    }
    return new Response(null, { status: 405, headers: { 'Cache-Control': 'no-store' } });
  } catch { return out(503, { error: 'unavailable' }); }
}
