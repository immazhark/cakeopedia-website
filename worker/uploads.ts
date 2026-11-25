import { inspectImage, LIMITS, RejectedImage } from './image.ts';

// Private inspiration uploads. Objects live in a private bucket under unguessable keys; there is no public
// read path. Owner reads need authenticated access (not built yet) and must go through a signed, expiring route.
export interface Bucket {
  put(key: string, value: Uint8Array, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
  delete(key: string): Promise<void>;
}
interface Stmt {
  bind(...values: (string | number | null)[]): Stmt;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface UploadDatabase { prepare(sql: string): Stmt }
export interface UploadDeps {
  db: UploadDatabase; bucket: Bucket; origin: string;
  allowRequest: (request: Request) => Promise<boolean>;
  now?: () => number;
}
export const POLICY = { perSubmission: 3, perDay: 200, orphanMs: 24 * 3600_000 } as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const accepted = new Set(['image/jpeg', 'image/png', 'image/webp']);

function reply(status: number, body?: object): Response {
  return new Response(body ? JSON.stringify(body) : null, { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
async function readBytes(request: Request): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > LIMITS.bytes) return null;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > LIMITS.bytes) { await reader.cancel(); return null; } // bound actual bytes, not the header
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const out = new Uint8Array(length);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}
function submissionOf(request: Request): string | null {
  const id = request.headers.get('X-Submission-Id') ?? '';
  return uuid.test(id) ? id.toLowerCase() : null;
}

/** POST /api/uploads  (raw image bytes, header X-Submission-Id) */
export async function handleUpload(request: Request, deps: UploadDeps): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  if (request.headers.get('Origin') !== deps.origin) return reply(403, { error: 'forbidden' });
  if (!accepted.has(request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() ?? '')) return reply(415, { error: 'unsupported_media_type' });
  const submission = submissionOf(request);
  if (!submission) return reply(400, { error: 'invalid_input' });
  const now = (deps.now ?? Date.now)();
  let rowId: string | null = null;
  try {
    if (!await deps.allowRequest(request)) return reply(429, { error: 'try_later' });
    const raw = await readBytes(request);
    if (!raw) return reply(413, { error: 'image_too_large' });
    let image;
    try { image = inspectImage(raw); } catch (e) {
      if (e instanceof RejectedImage) return reply(e.reason === 'too_large' ? 413 : 422, { error: `image_${e.reason}` });
      throw e;
    }
    if (await deps.db.prepare('SELECT 1 AS x FROM enquiries WHERE submission_id = ?').bind(submission).first()) return reply(409, { error: 'enquiry_already_sent' });
    const mine = await deps.db.prepare('SELECT count(*) AS n FROM uploads WHERE submission_id = ?').bind(submission).first<{ n: number }>();
    if ((mine?.n ?? 0) >= POLICY.perSubmission) return reply(422, { error: 'too_many_images' });
    const day = await deps.db.prepare('SELECT count(*) AS n FROM uploads WHERE created_at > ?').bind(now - 24 * 3600_000).first<{ n: number }>();
    if ((day?.n ?? 0) >= POLICY.perDay) return reply(429, { error: 'try_later' });
    rowId = crypto.randomUUID();
    const key = `u/${crypto.randomUUID()}`;
    await deps.db.prepare('INSERT INTO uploads (id, submission_id, object_key, content_type, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(rowId, submission, key, image.type, image.bytes.length, now).run();
    await deps.bucket.put(key, image.bytes, { httpMetadata: { contentType: image.type } });
    return reply(201, { attachmentId: rowId, type: image.type, width: image.width, height: image.height });
  } catch {
    // Storage failure: drop the tracking row so the customer can retry; never leak provider errors.
    if (rowId) await deps.db.prepare('DELETE FROM uploads WHERE id = ? AND enquiry_id IS NULL').bind(rowId).run().catch(() => undefined);
    return reply(503, { error: 'upload_unconfirmed', retry: true });
  }
}

/** DELETE /api/uploads/<id>  (customer removes an image before sending; header X-Submission-Id) */
export async function handleUploadDelete(request: Request, id: string, deps: UploadDeps): Promise<Response> {
  if (request.method !== 'DELETE') return new Response(null, { status: 405, headers: { Allow: 'DELETE' } });
  if (request.headers.get('Origin') !== deps.origin) return reply(403, { error: 'forbidden' });
  const submission = submissionOf(request);
  if (!submission || !uuid.test(id)) return reply(400, { error: 'invalid_input' });
  try {
    const row = await deps.db.prepare('SELECT object_key AS key FROM uploads WHERE id = ? AND submission_id = ? AND enquiry_id IS NULL').bind(id.toLowerCase(), submission).first<{ key: string }>();
    if (row) {
      await deps.bucket.delete(row.key);
      await deps.db.prepare('DELETE FROM uploads WHERE id = ?').bind(id.toLowerCase()).run();
    }
    return reply(204); // idempotent; nothing reveals whether the id existed
  } catch { return reply(503, { error: 'delete_unconfirmed', retry: true }); }
}

/** True only when every id is an unattached upload of this submission (used before saving an enquiry). */
export async function ownsUploads(db: UploadDatabase, submissionId: string, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const rows = await db.prepare(`SELECT count(*) AS n FROM uploads WHERE submission_id = ? AND enquiry_id IS NULL AND id IN (${ids.map(() => '?').join(',')})`)
    .bind(submissionId, ...ids).first<{ n: number }>();
  return rows?.n === ids.length;
}

/** Scheduled cleanup: delete unattached uploads past the window (object first, then row). */
export async function purgeOrphans(db: UploadDatabase, bucket: Bucket, now: number, limit = 100): Promise<number> {
  const { results } = await db.prepare('SELECT id, object_key AS key FROM uploads WHERE enquiry_id IS NULL AND created_at < ? LIMIT ?')
    .bind(now - POLICY.orphanMs, limit).all<{ id: string; key: string }>();
  let purged = 0;
  for (const r of results) {
    try { await bucket.delete(r.key); await db.prepare('DELETE FROM uploads WHERE id = ? AND enquiry_id IS NULL').bind(r.id).run(); purged++; } catch { /* retry next run */ }
  }
  return purged;
}
