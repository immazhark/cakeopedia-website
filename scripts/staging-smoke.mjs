// Authenticated smoke test of the STAGING Worker with synthetic data only. Cloudflare Access is NOT bypassed: a visible Edge window opens and a
// human logs in once (email code); this script then continues in that same session. Needs LIVE_ENABLED=1 and NOTIFICATIONS_ENABLED=0 on staging.
// Usage: node scripts/staging-smoke.mjs [outDir]    (env: BASE, default the staging URL)
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, devices } from 'playwright-core';

const BASE = process.env.BASE ?? 'https://cakeopedia-staging.mazharkhan-it.workers.dev', out = process.argv[2] ?? 'staging-smoke-out';
mkdirSync(out, { recursive: true });
const failures = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failures.push(msg); };
const profile = join(process.env.LOCALAPPDATA ?? '.', 'cakeopedia-smoke-profile');
const ctx = await chromium.launchPersistentContext(profile, { channel: 'msedge', headless: false, ...devices['Pixel 7'], viewport: { width: 390, height: 844 } });
const page = ctx.pages()[0] ?? await ctx.newPage();
const api = (path, opts = {}) => page.evaluate(async ([p, o]) => { const r = await fetch(p, o); let body = null; try { body = await r.json(); } catch { /* not JSON */ } return { status: r.status, body }; }, [path, opts]);
const admin = (path, method = 'GET', body) => api(path, { method, headers: { 'X-Cakeopedia-Admin': '1', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
try {
  // 0. Human login (Access). Wait up to 10 minutes.
  await page.goto(BASE + '/', { waitUntil: 'load' });
  console.log('>>> Please log in to Cloudflare Access in the Edge window that opened (email code). Waiting up to 10 minutes...');
  const t0 = Date.now(); let health = null;
  while (Date.now() - t0 < 600_000) {
    if (new URL(page.url()).hostname === new URL(BASE).hostname) { health = await api('/health').catch(() => null); if (health?.status === 200) break; }
    await page.waitForTimeout(2000);
  }
  check(health?.status === 200, 'logged in through Cloudflare Access (human)');
  if (health?.status !== 200) throw new Error('not logged in');
  if (process.env.MODE === 'closed') { // intake shut: owner area, catalogue and rejection of public writes (run with LIVE_ENABLED=0, ADMIN_ENABLED=1)
    check(health.body?.intakeEnabled === false && health.body?.adminEnabled === true, 'health: intake closed, admin open');
    const list = await admin('/admin/api/enquiries'); check(list.status === 200, `owner list works while intake is closed (${list.status})`);
    const noHeader = await api('/admin/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); check(noHeader.status === 403, `owner write without the admin header and origin is refused (${noHeader.status})`);
    const pub = await api('/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); check(pub.status === 503, `public enquiry refused (${pub.status})`);
    const up = await api('/api/uploads', { method: 'POST' }); check(up.status === 503, `public upload refused (${up.status})`);
    const cat = await api('/api/catalogue'); check((cat.status === 200 && !JSON.stringify(cat.body).includes('draft')) || (cat.status === 404 && cat.body?.error === 'not_published'), `public catalogue serves only a published snapshot (${cat.status})`);
    const hl = await admin('/admin/api/health'); check(hl.status === 200 && hl.body?.missingTables?.length === 0, `owner health: all tables present (${hl.status}, missing ${hl.body?.missingTables?.length})`);
    const er = await admin('/admin/api/erasures'); check(er.status === 200 && typeof er.body?.count === 'number' && er.body.items.every((i) => Object.keys(i).sort().join() === 'erasedAt,reference,source'), `erasure ledger endpoint answers with references only (${er.body?.count} entries)`);
    const t = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }), t14 = new Date(Date.parse(t + 'T12:00:00Z') + 14 * 86400000).toISOString().slice(0, 10);
    const at = await admin(`/admin/api/attention?from=${t}&to=${t14}`); check(at.status === 200 && typeof at.body?.newCount === 'number' && Array.isArray(at.body.balances), 'owner attention endpoint answers on the real database');
    const st = await admin('/admin/api/health/storage'); check(st.status === 200 && st.body?.ok === true, `private bucket and uploads table agree (${st.status}: ${JSON.stringify(st.body)})`);
    if (process.env.PUBLISH === '1') { // publishes the UNCHANGED seed catalogue (same confirmed prices) to staging to prove migration 0020 and rebuild tracking against real D1
      const g = await admin('/admin/api/catalogue'); const rev = g.body?.draft?.revision ?? 0;
      const saved = await admin('/admin/api/catalogue', 'PUT', { expectedRevision: rev, catalogue: g.body.draft.catalogue }); check(saved.status === 200, `draft saved (${saved.status})`);
      const first = await admin('/admin/api/catalogue/publish', 'POST', { expectedRevision: saved.body?.revision }); check(first.status === 200 && first.body?.rebuild === 'not_configured', `publish ok, rebuild reported honestly (${first.status} ${first.body?.rebuild})`);
      const replay = await admin('/admin/api/catalogue/publish', 'POST', { expectedRevision: saved.body?.revision }); check(replay.body?.replay === true && replay.body?.version === first.body?.version, 'retried publish is a replay, same version');
      const after = await admin('/admin/api/catalogue'); check(after.body?.published?.rebuild?.status === 'not_configured' && after.body.published.rebuild.attempts === 1, 'owner view carries the stored rebuild state');
      const retry = await admin('/admin/api/catalogue/rebuild', 'POST', {}); check(retry.status === 200 && retry.body?.version === first.body?.version, `rebuild retry endpoint works (${retry.status})`);
      const pubc = await api('/api/catalogue', { cache: 'no-store' }); check(pubc.status === 200 && pubc.body?.version === first.body?.version, 'public catalogue now serves the published snapshot');
    }
    if (process.env.MAIL === '1') { // needs NOTIFICATIONS_ENABLED=1 on staging; the only recipient is the owner's own mailbox, never a customer
      const OWNER = process.env.OWNER_MAILBOX ?? 'cakeopedia.austin@gmail.com';
      const e = await admin('/admin/api/enquiries', 'POST', { name: 'Synthetic Mail Test', contact: { kind: 'email', value: OWNER }, dateUndecided: true, notes: 'Synthetic' });
      const id = e.body?.id ?? (await admin('/admin/api/enquiries?limit=10')).body?.items?.find((x) => x.name === 'Synthetic Mail Test')?.id; check(!!id, 'synthetic enquiry created (owner mailbox as recipient)');
      if (id) {
        const u = (x) => `/admin/api/enquiries/${id}/${x}`;
        check((await admin(u('quote'), 'POST', { requestId: crypto.randomUUID(), totalCents: 15000, depositCents: 7500, fulfilment: 'pickup', date: '2027-03-20', time: '14:00', expectedVersion: 0 })).status === 201, 'quote saved');
        const d = await admin(u('messages/draft'), 'POST', { template: 'quotation' }); check(d.status === 200 && d.body?.to === OWNER, `draft addressed to the owner mailbox only (${d.status})`);
        const sent = await admin(u('messages'), 'POST', { template: 'quotation', requestId: crypto.randomUUID(), subject: '[Staging test] ' + (d.body?.subject ?? 'Quotation'), body: d.body?.body ?? '' });
        check(sent.status === 200 && sent.body?.message?.state === 'accepted', `Resend accepted the message (${sent.status} ${sent.body?.message?.state})`);
        check((await admin(u('erase'), 'POST', { confirmReference: (await admin(`/admin/api/enquiries/${id}`)).body?.reference })).status === 200, 'synthetic data erased');
      }
    }
    throw new Error('closed-mode-end');
  }
  check(health.body?.intakeEnabled === true, 'staging intake is enabled for the test (LIVE_ENABLED=1)');

  // 1. Public pages at phone width.
  for (const path of ['/', '/menu/', '/faq/', '/enquiry/', '/size-guide/', '/creations/']) {
    const res = await page.goto(BASE + path, { waitUntil: 'load' });
    const m = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length, robots: document.querySelector('meta[name=robots]')?.content ?? '' }));
    check(res.status() === 200 && m.over <= 0 && m.broken === 0, `${path}: ${res.status()}, overflow ${m.over}px, broken images ${m.broken}`);
    check(/noindex/.test(m.robots) || /noindex/.test(res.headers()['x-robots-tag'] ?? ''), `${path}: staging is not indexable`);
    if (path === '/' || path === '/menu/') await page.screenshot({ path: join(out, `staging${path.replace(/\//g, '_')}390.png`), fullPage: true });
  }

  // 2. Input validation and fail-closed behaviour on the public API (no bot token, junk).
  await page.goto(BASE + '/enquiry/', { waitUntil: 'load' });
  const junk = await api('/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  check(junk.status >= 400 && junk.status < 500, `empty enquiry refused with a 4xx (${junk.status})`);
  const noTok = await api('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: 'not an image' });
  check(noTok.status >= 400 && noTok.status < 500, `upload without a bot token refused (${noTok.status})`);
  const csrf = await api('/admin/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x', contact: { kind: 'instagram', value: '@x' } }) });
  check(csrf.status >= 400 && csrf.status < 500, `owner write without the admin header refused (${csrf.status})`);

  // 3. Real enquiry through the form with real Turnstile, one fake image (rejected) and one valid image.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
  await page.fill('#name', 'Staging Smoke'); await page.fill('#contact', 'staging.smoke@example.invalid'); await page.check('#undecided'); await page.check('#privacy');
  console.log('>>> If a Turnstile checkbox is shown in the window, please tick it (bot checks are never bypassed). Waiting up to 3 minutes...');
  await page.locator('#bot').scrollIntoViewIfNeeded().catch(() => undefined); await page.bringToFront(); // the checkbox sits near the bottom of a long form
  let token = ''; for (let i = 0; i < 180 && !token; i++) { token = await page.evaluate(() => { try { return window.turnstile?.getResponse() ?? ''; } catch { return ''; } }); if (!token) await page.waitForTimeout(1000); } // the form disables the hidden response field, so ask the widget itself
  if (!token) console.log('HUMAN-BLOCKED Turnstile token not produced: public form submit and picture upload not exercised');
  else check(true, 'Turnstile widget produced a token in the browser');
  if (token) {
    const bad = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/uploads', { timeout: 15000 });
    await page.setInputFiles('#pic-input', { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('this is plain text, not a picture') });
    const rb = await bad.catch(() => null);
    check(!!rb && rb.status() >= 400 && rb.status() < 500, `a text file renamed .png is refused (${rb?.status()})`);
    await page.waitForTimeout(4000);
    const good = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/uploads' && r.request().method() === 'POST', { timeout: 20000 });
    await page.setInputFiles('#pic-input', { name: 'ok.png', mimeType: 'image/png', buffer: png });
    const rg = await good.catch(() => null);
    check(rg?.status() === 201, `a valid picture is accepted (${rg?.status()})`);
    await page.locator('#bot').scrollIntoViewIfNeeded().catch(() => undefined); console.log('>>> Please tick the Turnstile checkbox AGAIN (it resets after the picture upload). Waiting up to 90 seconds...');
    let t2 = ''; for (let i = 0; i < 90 && !t2; i++) { await page.waitForTimeout(1000); t2 = await page.evaluate(() => { try { return window.turnstile?.getResponse() ?? ''; } catch { return ''; } }); }
    await page.click('#submit');
    await page.waitForURL('**/enquiry-received/**', { timeout: 25000 }).then(() => check(true, 'enquiry submitted and thank-you page reached'), () => check(false, 'enquiry submitted: still on ' + page.url()));
    const copy = await page.locator('main').innerText().catch(() => '');
    check(!/email you|confirmation email|we have emailed/i.test(copy), 'thank-you page promises no automatic email');
  }

  // 4. Owner: list, quote, deposit, confirm; Messages panel; email stays disabled.
  if (!token) await admin('/admin/api/enquiries', 'POST', { name: 'Staging Smoke', contact: { kind: 'email', value: 'staging.smoke@example.invalid' }, dateUndecided: true, notes: 'Synthetic' });
  const list = await admin('/admin/api/enquiries?limit=10');
  const mine = list.body?.items?.find((x) => x.name === 'Staging Smoke');
  check(!!mine, 'the synthetic enquiry appears in the owner list');
  if (mine) {
    const id = mine.id, u = (s) => `/admin/api/enquiries/${id}/${s}`;
    const q = await admin(u('quote'), 'POST', { requestId: crypto.randomUUID(), totalCents: 15000, depositCents: 7500, fulfilment: 'pickup', date: '2027-03-20', time: '14:00', expectedVersion: 0 });
    check(q.status === 201, `quote saved (${q.status})`);
    check((await admin(u('status'), 'POST', { status: 'confirmed', expected: 'new' })).status === 409, 'confirming before the deposit is refused');
    const pay = await admin(u('payments'), 'POST', { requestId: crypto.randomUUID(), kind: 'deposit', amountCents: 7500, receivedOn: '2026-11-27' });
    check(pay.status === 201, `deposit recorded (${pay.status})`);
    check((await admin(u('status'), 'POST', { status: 'confirmed', expected: 'new' })).status === 200, 'order confirmed once the deposit is recorded');
    const detail = await admin(`/admin/api/enquiries/${id}`);
    check(detail.body?.pictures?.length === (token ? 1 : 0) && detail.body?.order?.balanceCents === 7500, 'detail shows one attached picture and the balance');
    await page.goto(BASE + '/admin/', { waitUntil: 'networkidle' });
    await page.locator('#inbox ul button.row', { hasText: 'Staging Smoke' }).first().click();
    await page.locator('#detail').getByRole('heading', { name: 'Message the customer' }).waitFor({ timeout: 10000 });
    await page.screenshot({ path: join(out, 'staging-admin-detail-390.png'), fullPage: true });
    await page.locator('#detail select').last().selectOption('confirmation');
    await page.getByRole('button', { name: 'Prepare draft' }).click();
    await page.waitForFunction(() => /Your Cakeopedia order/.test(document.querySelector('#detail input[maxlength="200"]')?.value ?? ''), null, { timeout: 10000 }).then(() => check(true, 'Messages: confirmation draft prepared from the real quote'), () => check(false, 'Messages: confirmation draft prepared'));
    const body = await page.locator('#detail textarea[maxlength="8000"]').inputValue();
    check(body.includes('$150.00') && body.includes('$75.00') && !/huma|gmail/i.test(body), 'Messages: draft has the right amounts and no owner mailbox');
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.getByText('Sending is switched off.').first().waitFor({ timeout: 8000 }).then(() => check(true, 'Messages: send is refused while email is switched off'), () => check(false, 'Messages: send is refused while email is switched off'));
    const hist = await admin(u('messages'));
    check(hist.body?.mailEnabled === false && hist.body?.items?.length === 0, 'no message was stored or sent (mailEnabled false, history empty)');
    check((await admin(`/admin/api/messages/${crypto.randomUUID()}/retry`, 'POST')).status === 503, 'retry endpoint is closed while email is off');
    // close then erase the synthetic customer's data
    check((await admin(u('status'), 'POST', { status: 'closed', expected: 'confirmed' })).status === 200, 'order closed');
    check((await admin(u('erase'), 'POST', { confirmReference: detail.body.reference })).status === 200, 'synthetic customer data erased (picture deleted from private storage)');
    const after = await admin(`/admin/api/enquiries/${id}`);
    check(after.body?.payload?.erased === true && after.body?.pictures?.length === 0, 'after erase: payload anonymised, no pictures');
  }

  // 5. Rate limiting: a burst of junk submissions from one client must hit 429.
  await page.goto(BASE + '/enquiry/', { waitUntil: 'load' });
  const codes = []; for (let i = 0; i < 8; i++) codes.push((await api('/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status);
  check(codes.includes(429), `rate limiter answers 429 during a burst (${codes.join(',')})`);
  check(errors.length === 0, 'no uncaught page errors' + (errors.length ? ': ' + errors[0] : ''));
} catch (e) { if (e.message !== 'closed-mode-end') check(false, `aborted: ${e.message}`); }
finally { await ctx.close(); }
console.log(failures.length ? `\n${failures.length} FAILED` : '\nAll staging smoke checks passed');
process.exit(failures.length ? 1 : 0);
