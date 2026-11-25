// Real-browser regression check on installed Edge (viewport emulation, not a physical device).
// Needs the local stack running first: `npm run dev:api` and `npm run dev` (uses local D1 with test data only).
// Usage: node scripts/browser-check.mjs [outDir]   -> exits non-zero on any failed check.
import { mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4321', out = process.argv[2] ?? 'browser-check-out';
mkdirSync(out, { recursive: true });
const failures = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failures.push(msg); };

const browser = await chromium.launch({ channel: 'msedge' });
try {
  // 1. Public pages: no horizontal overflow, no broken images, at real phone widths.
  for (const width of [320, 390, 430]) {
    const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width, height: 844 } });
    const page = await ctx.newPage();
    for (const path of ['/', '/creations/', '/story/', '/enquiry/', '/collections/floral/']) {
      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } });
      const m = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, vw: innerWidth, broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length }));
      check(m.vw === width && m.over <= 0 && m.broken === 0, `${path} @${width}: viewport ${m.vw}, overflow ${m.over}px, broken images ${m.broken}`);
      if (width === 390 && path === '/') await page.screenshot({ path: `${out}/home-390.png` });
    }
    await ctx.close();
  }

  // 2. Owner menu journey at 390px: add a draft, publish it with a size, edit, and see a stale-edit conflict.
  const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + '/admin/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Add a menu item' }).click();
  const name = 'Browser check cake ' + Date.now();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel(/^Group/).fill('Test');
  await page.getByRole('button', { name: 'Add a size' }).click();
  await page.getByLabel(/^Size name/).fill('6 inch');
  await page.getByLabel('Serves from').fill('6');
  await page.getByLabel('Serves up to').fill('8');
  await page.getByLabel('Price ($)').first().fill('55.00');
  await page.getByLabel('Status', { exact: true }).selectOption('published');
  await page.screenshot({ path: `${out}/menu-form-390.png`, fullPage: true });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'menu form has no horizontal overflow at 390');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(name + ' · published') }).waitFor({ timeout: 5000 }).then(() => check(true, 'published item listed after save'), () => check(false, 'published item listed after save'));
  // Stale edit: change the same item behind the page's back, then try to save from the old copy.
  await page.getByRole('button', { name: new RegExp(name) }).click();
  const id = await page.evaluate(() => document.querySelector('#menu input')?.value);
  const bump = await page.evaluate(async (nm) => {
    const list = await (await fetch('/admin/api/menu', { headers: { 'X-Cakeopedia-Admin': '1' } })).json();
    const it = list.items.find((i) => i.title === nm); const { revision, updatedAt, ...rest } = it;
    const r = await fetch('/admin/api/menu/' + it.id, { method: 'PUT', headers: { 'X-Cakeopedia-Admin': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: revision, item: { ...rest, title: nm + ' (phone 2)' } }) });
    return r.status;
  }, name);
  check(bump === 200, 'second device edit succeeds');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('changed somewhere else').waitFor({ timeout: 5000 }).then(() => check(true, 'stale save shows the conflict message'), () => check(false, 'stale save shows the conflict message'));
  check(errors.length === 0, 'no uncaught page errors in owner journey ' + errors.join(' | '));
  void id;
  await ctx.close();
} finally { await browser.close(); }
if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
