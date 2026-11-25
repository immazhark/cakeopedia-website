import { validate, fingerprint, InvalidInput } from './contract.ts';
import { CURRENT, isCents, isDate, isTime, optText, out, uuid, type AdminDb } from './admin-common.ts';

// Quotes, payments, busy dates, calendar and manual (Instagram) enquiries. Money is integer cents; a payment is only
// ever a record the owner made after checking Zelle herself. Nothing here infers that money arrived.

interface QuoteRow { id: string; version: number; totalCents: number; depositCents: number; fulfilment: string; date: string; time: string | null; designNotes: string | null; prepNotes: string | null; createdAt: number; actor: string }
interface PaymentRow { id: string; kind: string; amountCents: number; receivedOn: string; note: string | null; recordedAt: number; actor: string; voidedAt: number | null; voidReason: string | null }
const QUOTE = `SELECT id, version, total_cents AS totalCents, deposit_cents AS depositCents, fulfilment, fulfil_date AS date, fulfil_time AS time,
  design_notes AS designNotes, prep_notes AS prepNotes, created_at AS createdAt, actor FROM quotes`;

export async function orderSummary(db: AdminDb, enquiryId: string) {
  const quote = await db.prepare(`${QUOTE} WHERE enquiry_id = ? ORDER BY version DESC LIMIT 1`).bind(enquiryId).first<QuoteRow>();
  const { results: payments } = await db.prepare(`SELECT id, kind, amount_cents AS amountCents, received_on AS receivedOn, note, recorded_at AS recordedAt, actor,
    voided_at AS voidedAt, void_reason AS voidReason FROM payments WHERE enquiry_id = ? ORDER BY recorded_at, rowid`).bind(enquiryId).all<PaymentRow>();
  const paid = payments.filter((p) => p.voidedAt === null).reduce((n, p) => n + p.amountCents, 0);
  const depositPaid = payments.filter((p) => p.voidedAt === null && p.kind === 'deposit').reduce((n, p) => n + p.amountCents, 0);
  return { quote, payments, paidCents: paid, depositPaidCents: depositPaid, balanceCents: quote ? quote.totalCents - paid : null };
}

/** Business rule for status "confirmed": a quote exists and the owner has recorded at least the agreed deposit. */
export async function confirmBlocker(db: AdminDb, enquiryId: string): Promise<'no_quote' | 'deposit_not_recorded' | null> {
  const s = await orderSummary(db, enquiryId);
  if (!s.quote) return 'no_quote';
  return s.depositPaidCents >= s.quote.depositCents ? null : 'deposit_not_recorded';
}

async function body(request: Request): Promise<Record<string, unknown> | null> {
  try { const b = await request.json(); return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null; } catch { return null; }
}
const bad = () => out(400, { error: 'invalid_input' });

/** Returns a Response for order-related routes, or null when the path is not one of them. */
export async function routeOrders(request: Request, db: AdminDb, actor: string, now: () => number, url: URL): Promise<Response | null> {
  const p = url.pathname, m = request.method;
  // ---- busy dates
  if (p === '/admin/api/busy' && m === 'GET') {
    const { results } = await db.prepare('SELECT date, note FROM busy_dates WHERE date >= ? ORDER BY date LIMIT 400').bind(url.searchParams.get('from') ?? '2000-01-01').all();
    return out(200, { items: results });
  }
  const busy = p.match(/^\/admin\/api\/busy\/(\d{4}-\d{2}-\d{2})$/);
  if (busy) {
    const date = busy[1]!;
    if (!isDate(date)) return bad();
    if (m === 'PUT') {
      const b = await body(request); const note = optText(b?.note, 200);
      if (note === undefined) return bad();
      await db.prepare('INSERT INTO busy_dates (date, note, created_at, actor) VALUES (?, ?, ?, ?) ON CONFLICT(date) DO UPDATE SET note = excluded.note').bind(date, note, now(), actor).run();
      return out(200, { date, note });
    }
    if (m === 'DELETE') { await db.prepare('DELETE FROM busy_dates WHERE date = ?').bind(date).run(); return out(204); }
    return new Response(null, { status: 405 });
  }
  // ---- calendar: confirmed orders by fulfilment date + busy dates in a bounded window
  if (p === '/admin/api/calendar' && m === 'GET') {
    const from = url.searchParams.get('from'), to = url.searchParams.get('to');
    if (!isDate(from) || !isDate(to) || to < from || (Date.parse(to) - Date.parse(from)) / 86_400_000 > 366) return bad();
    const { results: orders } = await db.prepare(`SELECT * FROM (SELECT e.id, json_extract(e.payload_json, '$.name') AS name, ${CURRENT} AS status,
      q.fulfil_date AS date, q.fulfil_time AS time, q.fulfilment, q.prep_notes AS prepNotes FROM enquiries e
      JOIN quotes q ON q.enquiry_id = e.id AND q.version = (SELECT max(version) FROM quotes WHERE enquiry_id = e.id)
      WHERE q.fulfil_date BETWEEN ? AND ?) WHERE status = 'confirmed' ORDER BY date, time`).bind(from, to).all();
    const { results: busyDates } = await db.prepare('SELECT date, note FROM busy_dates WHERE date BETWEEN ? AND ? ORDER BY date').bind(from, to).all();
    return out(200, { orders, busy: busyDates });
  }
  // ---- manual enquiry (for example an Instagram order): same validation as the public form
  if (p === '/admin/api/enquiries' && m === 'POST') {
    const b = await body(request); if (!b) return bad();
    try {
      const { enquiry } = validate({ ...b, submissionId: crypto.randomUUID(), privacyAck: true, botToken: '', attachmentIds: [] }, new Set());
      const id = crypto.randomUUID(), t = now(), hash = await fingerprint(enquiry);
      await db.prepare('INSERT INTO enquiries (id, submission_id, payload_hash, public_reference, created_at, payload_json) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, enquiry.submissionId, hash, 'CK-' + crypto.randomUUID(), t, JSON.stringify(enquiry)).run();
      await db.prepare('INSERT INTO enquiry_events (id, enquiry_id, status, created_at, actor, note) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), id, 'new', t, actor, 'Added manually by the owner').run();
      return out(201, { id });
    } catch (e) { if (e instanceof InvalidInput) return bad(); throw e; }
  }
  // ---- per-enquiry quote and payments
  const r = p.match(/^\/admin\/api\/enquiries\/([^/]+)\/(quote|payments)(?:\/([^/]+)\/void)?$/);
  if (!r) return null;
  const [, id, kind, paymentId] = r as unknown as [string, string, string, string | undefined];
  if (!uuid.test(id) || (paymentId && !uuid.test(paymentId))) return out(404, { error: 'not_found' });
  if (!await db.prepare('SELECT 1 AS x FROM enquiries WHERE id = ?').bind(id).first()) return out(404, { error: 'not_found' });
  if (m !== 'POST') return new Response(null, { status: 405 });
  const b = await body(request); if (!b) return bad();
  if (kind === 'quote') {
    const designNotes = optText(b.designNotes, 2000), prepNotes = optText(b.prepNotes, 2000);
    const time = b.time ?? null;
    if (!isCents(b.totalCents) || !isCents(b.depositCents) || b.depositCents > b.totalCents || (b.fulfilment !== 'pickup' && b.fulfilment !== 'delivery')
      || !isDate(b.date) || (time !== null && !isTime(time)) || designNotes === undefined || prepNotes === undefined
      || typeof b.expectedVersion !== 'number' || !Number.isInteger(b.expectedVersion) || b.expectedVersion < 0) return bad();
    const latest = await db.prepare('SELECT max(version) AS v FROM quotes WHERE enquiry_id = ?').bind(id).first<{ v: number | null }>();
    const current = latest?.v ?? 0;
    if (b.expectedVersion !== current) return out(409, { error: 'quote_changed', currentVersion: current });
    try {
      await db.prepare('INSERT INTO quotes (id, enquiry_id, version, total_cents, deposit_cents, fulfilment, fulfil_date, fulfil_time, design_notes, prep_notes, created_at, actor) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(crypto.randomUUID(), id, current + 1, b.totalCents, b.depositCents, b.fulfilment, b.date, time as string | null, designNotes, prepNotes, now(), actor).run();
    } catch { return out(409, { error: 'quote_changed', currentVersion: current + 1 }); } // UNIQUE(enquiry_id, version) lost a race
    return out(201, { version: current + 1 });
  }
  if (!paymentId) { // record a payment
    const note = optText(b.note, 500);
    if ((b.kind !== 'deposit' && b.kind !== 'balance') || !isCents(b.amountCents, 1) || !isDate(b.receivedOn) || note === undefined) return bad();
    const payment = crypto.randomUUID();
    await db.prepare('INSERT INTO payments (id, enquiry_id, kind, amount_cents, received_on, note, recorded_at, actor) VALUES (?,?,?,?,?,?,?,?)')
      .bind(payment, id, b.kind, b.amountCents, b.receivedOn, note, now(), actor).run();
    return out(201, { id: payment });
  }
  const reason = optText(b.reason, 500); // void a mistaken payment record
  if (!reason) return bad();
  const row = await db.prepare('SELECT voided_at AS v FROM payments WHERE id = ? AND enquiry_id = ?').bind(paymentId, id).first<{ v: number | null }>();
  if (!row) return out(404, { error: 'not_found' });
  if (row.v !== null) return out(409, { error: 'already_voided' });
  await db.prepare('UPDATE payments SET voided_at = ?, void_reason = ? WHERE id = ? AND voided_at IS NULL').bind(now(), reason, paymentId).run();
  return out(200, { voided: true });
}
