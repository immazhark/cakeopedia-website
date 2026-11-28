import { paymentPlan, TIME_ZONE } from '../src/data/pricing.ts';
import { address } from './notification-snapshot.ts';
import { CURRENT, changed, out, readBounded, uuid, type AdminDb } from './admin-common.ts';
import { orderSummary } from './orders.ts';
import type { Delivery } from './outbox.ts';

// Owner-triggered, manual outbound email. Every message is written or reviewed by the owner and sent on her click; nothing
// is sent automatically. The row (with the exact payload) is persisted BEFORE the provider call, the row id is the provider
// idempotency key, and "accepted" never claims delivery. This is not an inbox: replies reach the owner's mailbox through
// forwarding and are not read or stored here. To move to a dedicated mailbox later, supply another `MailTransport`; the
// routes, templates and history stay the same.
export interface MailTransport { from: string; replyTo: string; send(payload: string, key: string): Promise<Delivery> }
export const TEMPLATES = ['reply', 'quotation', 'confirmation', 'reminder'] as const;
type Template = (typeof TEMPLATES)[number];
const isTemplate = (v: unknown): v is Template => typeof v === 'string' && (TEMPLATES as readonly string[]).includes(v);
const RETRY_WINDOW_MS = 23 * 3_600_000; // below the provider's 24 h idempotency window

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const chicago = (ms: number) => new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(ms) + ' (Austin time)';

type Row = { reference: string; payload: string; status: string };
type Draft = { to: string; subject: string; body: string } | { error: 'no_email_contact' | 'erased' | 'no_quote' | 'not_confirmed' | 'nothing_due' };

/** A starting draft for the owner to read and edit. Wording makes no promise the owner has not agreed (no policies, no allergen claims). */
export async function draftFor(db: AdminDb, id: string, template: Template, now: number): Promise<Draft> {
  const e = await db.prepare(`SELECT e.public_reference AS reference, e.payload_json AS payload, ${CURRENT} AS status FROM enquiries e WHERE e.id = ?`).bind(id).first<Row>();
  if (!e) throw new Error('not_found');
  const p = JSON.parse(e.payload) as { name?: string; erased?: boolean; contact?: { kind?: string; value?: string } };
  if (p.erased) return { error: 'erased' };
  if (p.contact?.kind !== 'email' || !p.contact.value) return { error: 'no_email_contact' };
  const o = await orderSummary(db, id), q = o.quote;
  const first = (p.name ?? '').trim().split(/\s+/)[0] || 'there';
  const sign = `\n\nThank you,\nCakeopedia, Austin\nReference: ${e.reference}`;
  const subject = `Your Cakeopedia ${template === 'reply' ? 'enquiry' : template === 'quotation' ? 'quote' : template === 'confirmation' ? 'order' : 'balance'} (${e.reference})`;
  const plan = q && paymentPlan({ totalCents: q.totalCents, fulfilDate: q.date, ...(q.time ? { fulfilTime: q.time } : {}), acceptedAt: now });
  const due = plan && !plan.rush ? `Balance due by ${chicago(plan.balanceDueAt)}.` : plan ? 'The balance date will be agreed with you personally.' : '';
  const when = q && `${q.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'}: ${day(q.date)}${q.time ? ` at ${q.time}` : ''}`;
  let body: string;
  if (template === 'reply') body = `Hi ${first},\n\n${sign}`;
  else if (!q || !plan) return { error: 'no_quote' };
  else if (template === 'quotation') body = `Hi ${first},\n\nHere is the quote for your cake.\n\nTotal: ${usd(q.totalCents)}\nDeposit: ${usd(q.depositCents)}\nBalance: ${usd(plan.balanceCents)}. ${due}\n${when}${q.designNotes ? `\n\nAgreed design:\n${q.designNotes}` : ''}\n\nYour order is confirmed once your deposit has been received. Reply to this email with any questions.${sign}`;
  else if (template === 'confirmation') {
    if (e.status !== 'confirmed') return { error: 'not_confirmed' };
    body = `Hi ${first},\n\nYour order is confirmed. We have recorded your deposit of ${usd(o.depositPaidCents)}.\n\nTotal: ${usd(q.totalCents)}\nBalance remaining: ${usd(o.balanceCents ?? 0)}. ${due}\n${when}${sign}`;
  } else {
    if ((o.balanceCents ?? 0) <= 0) return { error: 'nothing_due' };
    body = `Hi ${first},\n\nA friendly reminder that the remaining balance of ${usd(o.balanceCents ?? 0)} for your order is outstanding. ${due}\n${when}${sign}`;
  }
  return { to: p.contact.value, subject, body };
}

const text = (v: unknown, max: number, multiline: boolean): v is string => typeof v === 'string' && v.trim().length >= 1 && v.length <= max &&
  !(multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u).test(v);
const COLS = 'id, template, recipient, subject, body, state, delivery_status AS deliveryStatus, direction, channel, created_at AS createdAt, actor';
const STATE: Record<Delivery['kind'], 'accepted' | 'queued' | 'failed' | 'unknown'> = { accepted: 'accepted', retry: 'queued', permanent: 'failed', unknown: 'unknown', skipped: 'failed', reconcile: 'unknown' };

async function deliver(db: AdminDb, mail: MailTransport, id: string, payload: string, now: number) {
  const d = await mail.send(payload, id).catch((): Delivery => ({ kind: 'unknown' }));
  await db.prepare("UPDATE communications SET state = ?, provider_id = ?, updated_at = ? WHERE id = ? AND state IN ('queued','unknown')")
    .bind(STATE[d.kind], d.kind === 'accepted' ? d.providerId : null, now, id).run();
  return db.prepare(`SELECT ${COLS} FROM communications WHERE id = ?`).bind(id).first();
}

export async function routeCommunications(request: Request, db: AdminDb, actor: string, now: () => number, url: URL, mail: MailTransport | undefined): Promise<Response | null> {
  const m = url.pathname.match(/^\/admin\/api\/enquiries\/([^/]+)\/messages(\/draft)?$/), r = url.pathname.match(/^\/admin\/api\/messages\/([^/]+)\/retry$/);
  if (!m && !r) return null;
  const method = request.method;
  if (r) {
    if (method !== 'POST') return new Response(null, { status: 405 });
    if (!mail) return out(503, { error: 'mail_not_enabled' });
    const rid = r[1]!.toLowerCase();
    if (!uuid.test(rid)) return out(404, { error: 'not_found' });
    const row = await db.prepare('SELECT payload, state, created_at AS createdAt FROM communications WHERE id = ?').bind(rid).first<{ payload: string | null; state: string; createdAt: number }>();
    if (!row) return out(404, { error: 'not_found' });
    if (!['queued', 'unknown'].includes(row.state) || !row.payload) return out(409, { error: 'not_retryable' });
    if (now() - row.createdAt > RETRY_WINDOW_MS) return out(409, { error: 'retry_window_over' }); // a resend after 24 h could duplicate; write a new message instead
    return out(200, { message: await deliver(db, mail, rid, row.payload, now()) });
  }
  const id = m![1]!.toLowerCase();
  if (!uuid.test(id)) return out(404, { error: 'not_found' });
  if (!m![2] && method === 'GET') {
    const { results } = await db.prepare(`SELECT ${COLS} FROM communications WHERE enquiry_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 100`).bind(id).all();
    return out(200, { items: results, mailEnabled: !!mail, note: 'Manual messages sent from this dashboard. Customer replies arrive in the owner mailbox, not here.' });
  }
  if (method !== 'POST') return new Response(null, { status: 405 });
  let b: Record<string, unknown>;
  try { const raw = await readBounded(request, 16_384); if (raw === null) return out(413, { error: 'too_large' }); const v = JSON.parse(raw); b = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return out(400, { error: 'invalid_input' }); }
  if (!isTemplate(b.template)) return out(400, { error: 'invalid_input' });
  const draft = await draftFor(db, id, b.template, now()).catch(() => null);
  if (!draft) return out(404, { error: 'not_found' });
  if ('error' in draft) return out(409, { error: draft.error });
  if (m![2]) return out(200, { to: draft.to, subject: draft.subject, body: draft.body, from: mail?.from ?? null, replyTo: mail?.replyTo ?? null });
  // ---- send
  if (!mail) return out(503, { error: 'mail_not_enabled' });
  if (typeof b.requestId !== 'string' || !uuid.test(b.requestId) || !text(b.subject, 200, false) || !text(b.body, 8000, true)) return out(400, { error: 'invalid_input' });
  const mid = b.requestId.toLowerCase();
  const prior = await db.prepare(`SELECT ${COLS}, enquiry_id AS enquiryId FROM communications WHERE id = ?`).bind(mid).first<{ enquiryId: string }>();
  if (prior) return prior.enquiryId === id ? out(200, { message: prior, replay: true }) : out(409, { error: 'request_id_reused' }); // a double tap never sends twice
  const payload = JSON.stringify({ from: address(mail.from), to: [address(draft.to)], reply_to: [address(mail.replyTo)], subject: b.subject, text: b.body });
  const t = now();
  const ins = await db.prepare("INSERT OR IGNORE INTO communications (id, enquiry_id, template, recipient, subject, body, payload, state, created_at, updated_at, actor) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)")
    .bind(mid, id, b.template, draft.to, b.subject, b.body, payload, t, t, actor).run();
  if (!changed(ins)) return out(409, { error: 'request_id_reused' });
  return out(200, { message: await deliver(db, mail, mid, payload, now()) });
}
