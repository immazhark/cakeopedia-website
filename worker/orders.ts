import { validate, fingerprint, InvalidInput } from './contract.ts';
import { CURRENT, changed, isCents, isDate, isTime, optText, out, readBounded, uuid, type AdminDb } from './admin-common.ts';

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

async function isConfirmed(db: AdminDb, id: string) {
  return (await db.prepare(`SELECT ${CURRENT} AS s FROM enquiries e WHERE e.id = ?`).bind(id).first<{ s: string }>())?.s === 'confirmed';
}
const MAX_BODY = 32_768; // largest legitimate body is two 2,000-character notes
/** The parsed JSON object, null when malformed, or 'too_large' (checked on the bytes actually read, not a header). */
async function body(request: Request): Promise<Record<string, unknown> | null | 'too_large'> {
  try {
    const raw = await readBounded(request, MAX_BODY);
    if (raw === null) return 'too_large';
    const b = JSON.parse(raw); return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch { return null; }
}
// Inside one statement: cents currently recorded (not voided), and deposit cents recorded, for enquiry ?N.
const PAID = (n: string) => `COALESCE((SELECT SUM(amount_cents) FROM payments WHERE enquiry_id = ${n} AND voided_at IS NULL), 0)`;
const DEPOSIT_PAID = (n: string) => `COALESCE((SELECT SUM(amount_cents) FROM payments WHERE enquiry_id = ${n} AND voided_at IS NULL AND kind = 'deposit'), 0)`;
const QUOTE_DEPOSIT = (n: string) => `(SELECT deposit_cents FROM quotes WHERE enquiry_id = ${n} ORDER BY version DESC LIMIT 1)`;
export const CONFIRM_OK = (n: string) => `${QUOTE_DEPOSIT(n)} IS NOT NULL AND ${QUOTE_DEPOSIT(n)} <= ${DEPOSIT_PAID(n)}`;
const bad = () => out(400, { error: 'invalid_input' });
const isConstraint = (e: unknown) => /UNIQUE|constraint/i.test(String((e as Error)?.message ?? e));

/** Returns a Response for order-related routes, or null when the path is not one of them. */
export async function routeOrders(request: Request, db: AdminDb, actor: string, now: () => number, url: URL): Promise<Response | null> {
  const p = url.pathname, m = request.method;
  // ---- busy dates
  if (p === '/admin/api/busy' && m === 'GET') {
    const from = url.searchParams.get('from') ?? '2000-01-01';
    if (!isDate(from)) return bad();
    const { results } = await db.prepare('SELECT date, note FROM busy_dates WHERE date >= ? ORDER BY date LIMIT 400').bind(from).all();
    return out(200, { items: results });
  }
  const busy = p.match(/^\/admin\/api\/busy\/(\d{4}-\d{2}-\d{2})$/);
  if (busy) {
    const date = busy[1]!;
    if (!isDate(date)) return bad();
    if (m === 'PUT') {
      const b = await body(request); if (b === 'too_large') return out(413, { error: 'too_large' }); const note = optText(b?.note, 200);
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
    const b = await body(request); if (b === 'too_large') return out(413, { error: 'too_large' }); if (!b) return bad();
    try {
      const rid = b.requestId === undefined ? crypto.randomUUID() : b.requestId;
      if (typeof rid !== 'string' || !uuid.test(rid)) return bad();
      const { requestId: _drop, ...fields } = b;
      const { enquiry } = validate({ ...fields, submissionId: rid, privacyAck: true, botToken: '', attachmentIds: [] }, new Set());
      const id = crypto.randomUUID(), t = now(), hash = await fingerprint(enquiry);
      const prior = await db.prepare('SELECT id, payload_hash AS hash FROM enquiries WHERE submission_id = ?').bind(rid).first<{ id: string; hash: string }>();
      if (prior) return prior.hash === hash ? out(200, { id: prior.id }) : out(409, { error: 'request_reused' });
      try { // one atomic batch: an enquiry never exists without its first status event
        await db.batch([db.prepare('INSERT INTO enquiries (id, submission_id, payload_hash, public_reference, created_at, payload_json) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(id, enquiry.submissionId, hash, 'CK-' + crypto.randomUUID(), t, JSON.stringify(enquiry)),
          db.prepare('INSERT INTO enquiry_events (id, enquiry_id, status, created_at, actor, note) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), id, 'new', t, actor, 'Added manually by the owner')]);
      } catch { // a concurrent twin with the same requestId won the UNIQUE(submission_id) race
        const twin = await db.prepare('SELECT id, payload_hash AS hash FROM enquiries WHERE submission_id = ?').bind(rid).first<{ id: string; hash: string }>();
        if (!twin) throw new Error('storage');
        return twin.hash === hash ? out(200, { id: twin.id }) : out(409, { error: 'request_reused' });
      }
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
  const b = await body(request); if (b === 'too_large') return out(413, { error: 'too_large' }); if (!b) return bad();
  if (kind === 'quote') {
    const designNotes = optText(b.designNotes, 2000), prepNotes = optText(b.prepNotes, 2000);
    const time = b.time ?? null;
    if (!isCents(b.totalCents) || !isCents(b.depositCents) || b.depositCents > b.totalCents || (b.fulfilment !== 'pickup' && b.fulfilment !== 'delivery')
      || !isDate(b.date) || (time !== null && !isTime(time)) || designNotes === undefined || prepNotes === undefined
      || typeof b.expectedVersion !== 'number' || !Number.isInteger(b.expectedVersion) || b.expectedVersion < 0) return bad();
    const rid = b.requestId === undefined ? crypto.randomUUID() : b.requestId;
    if (typeof rid !== 'string' || !uuid.test(rid)) return bad();
    const SAME = `SELECT enquiry_id AS e, version, total_cents AS t, deposit_cents AS d, fulfilment AS f, fulfil_date AS date, fulfil_time AS time,
      design_notes AS dn, prep_notes AS pn FROM quotes WHERE id = ?`;
    type Same = { e: string; version: number; t: number; d: number; f: string; date: string; time: string | null; dn: string | null; pn: string | null };
    const replay = async () => { const x = await db.prepare(SAME).bind(rid).first<Same>();
      return x && (x.e === id && x.t === b.totalCents && x.d === b.depositCents && x.f === b.fulfilment && x.date === b.date && x.time === time && x.dn === designNotes && x.pn === prepNotes
        ? out(200, { version: x.version }) : out(409, { error: 'request_reused' })); };
    const done = await replay(); if (done) return done;
    const latest = await db.prepare('SELECT max(version) AS v FROM quotes WHERE enquiry_id = ?').bind(id).first<{ v: number | null }>();
    const current = latest?.v ?? 0;
    if (b.expectedVersion !== current) return out(409, { error: 'quote_changed', currentVersion: current });
    // Every invariant is checked inside the INSERT itself, so a payment, void or newer quote landing in between cannot be missed.
    let written = false;
    try {
      written = changed(await db.prepare(`INSERT INTO quotes (id, enquiry_id, version, total_cents, deposit_cents, fulfilment, fulfil_date, fulfil_time, design_notes, prep_notes, created_at, actor)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12 WHERE COALESCE((SELECT max(version) FROM quotes WHERE enquiry_id = ?2), 0) = ?13
          AND ?4 >= ${PAID('?2')}
          AND (${'(SELECT ' + CURRENT + ' FROM enquiries e WHERE e.id = ?2)'} <> 'confirmed' OR ?5 <= ${DEPOSIT_PAID('?2')})`)
        .bind(rid, id, current + 1, b.totalCents, b.depositCents, b.fulfilment, b.date, time as string | null, designNotes, prepNotes, now(), actor, current).run());
    } catch (e) { if (!isConstraint(e)) throw e; }
    if (!written) { // diagnose from fresh state; a concurrent identical request is a replay, not a conflict
      const again = await replay(); if (again) return again;
      const v = (await db.prepare('SELECT max(version) AS v FROM quotes WHERE enquiry_id = ?').bind(id).first<{ v: number | null }>())?.v ?? 0;
      if (v !== current) return out(409, { error: 'quote_changed', currentVersion: v });
      const s1 = await orderSummary(db, id);
      return b.totalCents < s1.paidCents ? out(409, { error: 'below_paid', paidCents: s1.paidCents }) : out(409, { error: 'would_unconfirm' });
    }
    return out(201, { version: current + 1 });
  }
  if (!paymentId) { // record a payment
    const note = optText(b.note, 500);
    if ((b.kind !== 'deposit' && b.kind !== 'balance') || !isCents(b.amountCents, 1) || !isDate(b.receivedOn) || note === undefined) return bad();
    const payment = b.requestId === undefined ? crypto.randomUUID() : b.requestId;
    if (typeof payment !== 'string' || !uuid.test(payment)) return bad();
    const SAME = 'SELECT enquiry_id AS e, kind, amount_cents AS a, received_on AS d, note AS n FROM payments WHERE id = ?';
    const replay = async () => { const x = await db.prepare(SAME).bind(payment).first<{ e: string; kind: string; a: number; d: string; n: string | null }>();
      return x && (x.e === id && x.kind === b.kind && x.a === b.amountCents && x.d === b.receivedOn && x.n === note ? out(200, { id: payment }) : out(409, { error: 'request_reused' })); };
    const done = await replay(); if (done) return done;
    const s0 = await orderSummary(db, id);
    if (!s0.quote) return out(409, { error: 'no_quote' });
    // The ceiling is enforced inside the INSERT, so two concurrent payments cannot jointly overshoot the quote.
    const ins = await db.prepare(`INSERT INTO payments (id, enquiry_id, kind, amount_cents, received_on, note, recorded_at, actor)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE (SELECT COALESCE(SUM(amount_cents), 0) FROM payments WHERE enquiry_id = ?2 AND voided_at IS NULL) + ?4
        <= (SELECT total_cents FROM quotes WHERE enquiry_id = ?2 ORDER BY version DESC LIMIT 1)`)
      .bind(payment, id, b.kind, b.amountCents, b.receivedOn, note, now(), actor).run().then(() => null, async (e) => (await replay()) ?? Promise.reject(e));
    if (ins) return ins;
    const stored = await replay();
    return stored?.status === 200 ? out(201, { id: payment }) : stored ?? out(409, { error: 'exceeds_balance', balanceCents: s0.balanceCents });
  }
  const reason = optText(b.reason, 500); // void a mistaken payment record
  if (!reason) return bad();
  const row = await db.prepare('SELECT voided_at AS v FROM payments WHERE id = ? AND enquiry_id = ?').bind(paymentId, id).first<{ v: number | null }>();
  if (!row) return out(404, { error: 'not_found' });
  if (row.v !== null) return out(409, { error: 'already_voided' });
  // One statement: the void applies only if a confirmed order would still hold its agreed deposit afterwards.
  const voided = changed(await db.prepare(`UPDATE payments SET voided_at = ?1, void_reason = ?2 WHERE id = ?3 AND enquiry_id = ?4 AND voided_at IS NULL
    AND NOT (kind = 'deposit' AND (SELECT ${CURRENT} FROM enquiries e WHERE e.id = ?4) = 'confirmed'
      AND ${DEPOSIT_PAID('?4')} - amount_cents < COALESCE(${QUOTE_DEPOSIT('?4')}, 0))`).bind(now(), reason, paymentId, id).run());
  if (!voided) {
    const now2 = await db.prepare('SELECT voided_at AS v FROM payments WHERE id = ?').bind(paymentId).first<{ v: number | null }>();
    return out(409, { error: now2?.v ? 'already_voided' : 'would_unconfirm' });
  }
  return out(200, { voided: true });
}
