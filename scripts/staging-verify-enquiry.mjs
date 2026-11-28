// Owner-side checks after ONE manual synthetic enquiry submitted in a normal browser (name must contain "Staging Test"). Uses the Access-logged-in Edge profile
// (human login once). Verifies D1 row, private picture read, owner dashboard data, then erases the synthetic data. No Turnstile automation.
import { chromium } from 'playwright-core';
import { join } from 'node:path';
const BASE = process.env.BASE ?? 'https://cakeopedia-staging.mazharkhan-it.workers.dev';
const ctx = await chromium.launchPersistentContext(join(process.env.LOCALAPPDATA ?? '.', 'cakeopedia-smoke-profile'), { channel: 'msedge', headless: false });
const page = ctx.pages()[0] ?? await ctx.newPage();
const api = (p, o = {}) => page.evaluate(async ([u, x]) => { const r = await fetch(u, x); const ct = r.headers.get('content-type') ?? ''; let body = null; if (ct.includes('json')) body = await r.json(); else body = (await r.arrayBuffer()).byteLength; return { status: r.status, ct, body }; }, [p, o]);
const admin = (p, m = 'GET', b) => api(p, { method: m, headers: { 'X-Cakeopedia-Admin': '1', 'Content-Type': 'application/json' }, ...(b ? { body: JSON.stringify(b) } : {}) });
let bad = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${m}`); if (!ok) bad++; };
await page.goto(BASE + '/', { waitUntil: 'load' });
for (let i = 0; i < 300 && (await api('/health').catch(() => ({ status: 0 }))).status !== 200; i++) await page.waitForTimeout(2000);
const list = await admin('/admin/api/enquiries?limit=20'); const mine = list.body?.items?.find((x) => /Staging Test/i.test(x.name));
if (process.env.REF) check(mine?.reference === process.env.REF || list.body?.items?.some((x) => x.reference === process.env.REF), `the enquiry with reference ${process.env.REF} is present`);
check(!!mine, 'the synthetic enquiry from the real form is in the owner list (D1 persisted, server-side Turnstile accepted)');
if (mine) {
  const d = await admin(`/admin/api/enquiries/${mine.id}`);
  check(d.status === 200 && (d.body?.pictures?.length ?? 0) >= 1, `detail shows ${d.body?.pictures?.length ?? 0} attached picture(s)`);
  const pic = d.body?.pictures?.[0]; if (pic) { const img = await admin(`/admin/api/uploads/${pic.id}`); check(img.status === 200 && /^image\//.test(img.ct) && img.body > 100, `private picture served to the owner only (${img.status} ${img.ct}, ${img.body} bytes)`); }
  const anon = await page.evaluate(async ([b, id]) => { try { const r = await fetch(b + '/admin/api/uploads/' + id, { credentials: 'omit', redirect: 'manual' }); return r.type === 'opaqueredirect' ? 302 : r.status; } catch { return 599; } }, [BASE, pic?.id ?? 'x']); // a blocked fetch (no Access session) counts as denied check(anon >= 300, `a request without the Access session cannot read pictures (${anon})`);
  const h = await admin('/admin/api/health'); console.log('health', JSON.stringify(h.body));
  const pendingMail = h.body?.oldestPendingOutboxAgeMs != null; check(!pendingMail, 'owner alert left the outbox (sent by the scheduler)'); const comms = await admin(`/admin/api/enquiries/${mine.id}/messages`); check((comms.body?.items?.length ?? 0) === 0, 'no customer message was created or sent for this enquiry');
  if (process.env.ERASE !== '0' && !pendingMail) {
    check((await admin(`/admin/api/enquiries/${mine.id}/status`, 'POST', { status: 'closed', expected: d.body?.status ?? 'new' })).status < 500, 'closed');
    const er = await admin(`/admin/api/enquiries/${mine.id}/erase`, 'POST', { confirmReference: d.body?.reference }); check(er.status === 200, `synthetic data erased (${er.status})`);
    const after = await admin(`/admin/api/enquiries/${mine.id}`); check(after.body?.payload?.erased === true && (after.body?.pictures?.length ?? 0) === 0, 'after erase: anonymised, no pictures');
    const st = await admin('/admin/api/health/storage'); check(st.body?.ok === true, `bucket and uploads table agree after cleanup (${JSON.stringify(st.body)?.slice(0, 120)})`);
  }
}
await ctx.close(); process.exit(bad ? 1 : 0);
