import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { Miniflare } from 'miniflare';
import { routeOrders } from '../worker/orders.ts';
import type { AdminDb } from '../worker/admin-common.ts';

let mf: Miniflare, db: Awaited<ReturnType<Miniflare['getD1Database']>>;
before(async () => {
  mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("t"); } }', compatibilityDate: '2026-07-30', d1Databases: ['DB'] });
  db = await mf.getD1Database('DB');
  for (const f of (await readdir(new URL('../migrations/', import.meta.url))).sort()) {
    const sql = (await readFile(new URL(`../migrations/${f}`, import.meta.url), 'utf8')).replace(/^--.*$/gm, '');
    await db.batch(sql.split(';').map((s) => s.trim()).filter(Boolean).map((s) => db.prepare(s)));
  }
});
after(async () => { await mf?.dispose(); });

async function enquiry(id: string, name: string, status: string, created: number, quote?: { date: string; total: number; deposit: number }, paid = 0) {
  await db.prepare('INSERT INTO enquiries (id, submission_id, payload_hash, public_reference, created_at, payload_json) VALUES (?,?,?,?,?,?)').bind(id, `s-${id}`, 'h', `CK-${id}`, created, JSON.stringify({ name })).run();
  await db.prepare("INSERT INTO enquiry_events (id, enquiry_id, status, created_at, actor, note) VALUES (?,?,?,?,'t',NULL)").bind(`ev-${id}`, id, status, created + 1).run();
  if (quote) await db.prepare("INSERT INTO quotes (id, enquiry_id, version, total_cents, deposit_cents, fulfilment, fulfil_date, created_at, actor) VALUES (?,?,1,?,?,'pickup',?,?, 't')").bind(`q-${id}`, id, quote.total, quote.deposit, quote.date, created + 2).run();
  if (paid) await db.prepare("INSERT INTO payments (id, enquiry_id, kind, amount_cents, received_on, recorded_at, actor) VALUES (?,?,'deposit',?,'2026-11-01',?, 't')").bind(`p-${id}`, id, paid, created + 3).run();
}
const get = async (qs: string) => {
  const url = new URL(`https://x.test/admin/api/attention${qs}`);
  const res = await routeOrders(new Request(url), db as unknown as AdminDb, 'owner', Date.now, url);
  return { status: res!.status, body: (await res!.json()) as Record<string, unknown> & { newCount: number; oldestNewAt: number | null; quoted: { name: string }[]; balances: { name: string; dueCents: number }[]; week: { name: string }[] } };
};

test('attention: counts new enquiries, lists quotes awaiting a deposit, confirmed orders with a balance outstanding, and the week ahead', async () => {
  await enquiry('n1', 'New One', 'new', 1000); await enquiry('n2', 'New Two', 'new', 2000);
  await enquiry('q1', 'Quoted Person', 'quoted', 3000, { date: '2026-12-20', total: 20000, deposit: 10000 });
  await enquiry('c1', 'Owes Balance', 'confirmed', 4000, { date: '2026-12-05', total: 17000, deposit: 8500 }, 8500);
  await enquiry('c2', 'Paid Up', 'confirmed', 5000, { date: '2026-12-04', total: 15000, deposit: 7500 }, 15000);
  await enquiry('c3', 'Far Away', 'confirmed', 6000, { date: '2027-02-01', total: 9000, deposit: 4500 }, 4500);
  await enquiry('x1', 'Closed One', 'closed', 7000, { date: '2026-12-05', total: 5000, deposit: 2500 });
  const r = await get('?from=2026-12-01&to=2026-12-15');
  assert.equal(r.status, 200); assert.equal(r.body.newCount, 2); assert.equal(r.body.oldestNewAt, 1000);
  assert.deepEqual(r.body.quoted.map((x) => x.name), ['Quoted Person']);
  assert.deepEqual(r.body.balances.map((x) => [x.name, x.dueCents]), [['Owes Balance', 8500]]); // paid in full, closed and far-away orders are not listed
  assert.deepEqual(r.body.week.map((x) => x.name), ['Paid Up', 'Owes Balance']); // confirmed, within 7 days of "from", by date
});

test('attention: bounded and validated input, and it carries no contact details', async () => {
  assert.equal((await get('')).status, 400); assert.equal((await get('?from=2026-12-01&to=2026-11-01')).status, 400);
  assert.equal((await get('?from=2026-01-01&to=2027-01-01')).status, 400); assert.equal((await get("?from=2026-12-01&to=2026-12-15'--")).status, 400);
  const r = await get('?from=2026-12-01&to=2026-12-15'); assert.ok(!JSON.stringify(r.body).includes('contact'));
});
