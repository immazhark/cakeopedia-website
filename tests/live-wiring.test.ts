import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { Miniflare } from 'miniflare';
import sharp from 'sharp';
import { liveHandler, type Env } from '../worker/live.ts';

// The composition root against a real D1 emulator: the scheduled retention hook and the upload client pseudonym.
const ORIGIN = 'https://cakeopedia.com';
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

const deleted: string[] = [];
const bucket = { put: async () => undefined, delete: async (k: string) => { deleted.push(k); }, get: async () => null };
const env = (over: Partial<Env> = {}): Env => ({ DB: db as unknown as Env['DB'], UPLOADS: bucket as unknown as Env['UPLOADS'], LIVE_ENABLED: '1', SITE_ORIGIN: ORIGIN, ACCESS_ISSUER: 'https://team.cloudflareaccess.com',
  ACCESS_AUD: 'aud', OPERATORS: 'owner@example.invalid', TURNSTILE_SECRET: 'synthetic-secret', RATE_SECRET: 'a'.repeat(64), ...over });
const siteverify: typeof fetch = async () => Response.json({ success: true, hostname: 'cakeopedia.com', action: 'enquiry' });

async function closedEnquiry(closedAt: number) {
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO enquiries (id, submission_id, payload_hash, public_reference, created_at, payload_json) VALUES (?,?,?,?,?,?)').bind(id, crypto.randomUUID(), 'h', `CK-${id}`, 1, JSON.stringify({ name: 'Live Wiring Person', contact: { kind: 'email', value: 'wiring@example.invalid' } })).run();
  await db.prepare('INSERT INTO enquiry_events (id, enquiry_id, status, created_at, actor, note) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(), id, 'closed', closedAt, 't', null).run();
  return id;
}
const erased = async (id: string) => JSON.parse((await db.prepare('SELECT payload_json AS p FROM enquiries WHERE id = ?').bind(id).first<{ p: string }>())!.p).erased === true;

test('scheduled run erases long-closed enquiries only when RETENTION_DAYS is a valid period', async () => {
  const old = await closedEnquiry(1000), recent = await closedEnquiry(Date.now() - 5 * 86_400_000);
  for (const off of [undefined, '', '0', '29', 'abc', '30d']) {
    await liveHandler(env({ RETENTION_DAYS: off }), siteverify)!.scheduled();
    assert.equal(await erased(old), false, `retention must stay off for ${JSON.stringify(off)}`);
  }
  await liveHandler(env({ RETENTION_DAYS: '30' }), siteverify)!.scheduled();
  assert.equal(await erased(old), true);
  assert.equal(await erased(recent), false); // closed five days ago: inside the 30-day period
});

test('upload sessions record only an HMAC pseudonym of the client, stable per address and different between addresses', async () => {
  const png = new Uint8Array(await sharp({ create: { width: 40, height: 30, channels: 3, background: '#aabbcc' } }).png().toBuffer());
  const handler = liveHandler(env(), siteverify)!;
  const upload = (ip: string) => {
    const sid = crypto.randomUUID();
    return handler.fetch(new Request(`${ORIGIN}/api/uploads`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'image/png', 'X-Submission-Id': sid, 'X-Bot-Token': 'tok', 'CF-Connecting-IP': ip }, body: png })).then(async (r) => ({ status: r.status, sid }));
  };
  const clientOf = async (sid: string) => (await db.prepare('SELECT client FROM upload_sessions WHERE submission_id = ?').bind(sid).first<{ client: string }>())?.client;
  const a1 = await upload('203.0.113.9'), a2 = await upload('203.0.113.9'), b1 = await upload('198.51.100.7');
  assert.deepEqual([a1.status, a2.status, b1.status], [201, 201, 201]);
  const [ca1, ca2, cb1] = [await clientOf(a1.sid), await clientOf(a2.sid), await clientOf(b1.sid)];
  assert.match(String(ca1), /^[0-9a-f]{64}$/);
  assert.equal(ca1, ca2); assert.notEqual(ca1, cb1);
  const all = JSON.stringify((await db.prepare('SELECT * FROM upload_sessions').all()).results);
  assert.doesNotMatch(all, /203\.0\.113|198\.51\.100/); // no raw address is stored
});

test('scheduled run records each enabled job so a failing job is visible', async () => {
  const at = Date.now();
  await liveHandler(env({ RATE_CLEANUP_ENABLED: '1', UPLOAD_CLEANUP_ENABLED: '1' }), siteverify)!.scheduled();
  const { results } = await db.prepare("SELECT job, last_state AS s FROM maintenance_runs WHERE last_run_at >= ? ORDER BY job").bind(at).all<{ job: string; s: string }>();
  assert.deepEqual(results.map((r: { job: string; s: string }) => [r.job, r.s]), [['rate_cleanup', 'completed'], ['upload_cleanup', 'completed']]);
});
