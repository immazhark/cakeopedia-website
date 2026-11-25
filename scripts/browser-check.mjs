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

  // 1b. Keyboard only (no mouse) + reduced motion, on a desktop-width page.
  {
    const kctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const kp = await kctx.newPage();
    const kerrs = []; kp.on('pageerror', (e) => kerrs.push(String(e)));
    const focusInfo = () => kp.evaluate(() => {
      const e = document.activeElement; if (!e || e === document.body) return null;
      const again = window.__last === e; window.__last = e; // native video/date controls take several Tab stops inside one element
      const s = getComputedStyle(e), r = e.getBoundingClientRect();
      return { again, tag: e.tagName, id: e.id, cls: e.className, text: (e.textContent || '').trim().slice(0, 30), ring: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0, onscreen: r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && r.width > 0 };
    });
    for (const path of ['/', '/creations/', '/story/', '/enquiry/', '/collections/floral/']) {
      await kp.goto(BASE + path, { waitUntil: 'networkidle' });
      await kp.keyboard.press('Tab');
      const first = await focusInfo();
      check(!!first && /skip/.test(String(first.cls)) && first.onscreen && first.ring, `${path} first Tab lands on a visible skip link`);
      await kp.keyboard.press('Enter');
      check(await kp.evaluate(() => location.hash === '#main'), `${path} skip link jumps to #main`);
      // Walk the whole tab order: every stop shows a focus ring and is on screen; focus must leave the page (no trap).
      await kp.goto(BASE + path, { waitUntil: 'networkidle' });
      const bad = []; let stops = 0, left = false;
      for (let i = 0; i < 120; i++) {
        await kp.keyboard.press('Tab'); const f = await focusInfo();
        if (!f) { left = true; break; }
        if (f.again) continue; stops++; if (!f.ring) bad.push(`${f.tag}#${f.id}"${f.text}" no ring`);
      }
      check(left && stops > 3, `${path} tab order ends (no trap) after ${stops} stops`);
      check(bad.length === 0, `${path} every tab stop has a focus ring${bad.length ? ': ' + bad.slice(0, 3).join('; ') : ''}`);
      // Reduced motion: nothing hidden waiting for scroll, nothing animating, no card zoom.
      const rm = await kp.evaluate(() => ({
        hidden: [...document.querySelectorAll('.reveal')].filter((e) => getComputedStyle(e).opacity !== '1').length,
        running: document.getAnimations().filter((a) => a.playState === 'running' && !(a.effect?.getComputedTiming().iterations === 1 && a.effect.getComputedTiming().duration < 50)).length,
        autoplay: [...document.querySelectorAll('video')].filter((v) => !v.paused).length,
        smooth: getComputedStyle(document.documentElement).scrollBehavior === 'smooth',
      }));
      check(rm.hidden === 0 && rm.running === 0 && rm.autoplay === 0 && !rm.smooth, `${path} reduced motion: hidden ${rm.hidden}, running animations ${rm.running}, playing videos ${rm.autoplay}, smooth scroll ${rm.smooth}`);
    }
    // Enquiry form by keyboard: Enter on the submit button with a blank form shows errors and moves focus to them.
    await kp.goto(BASE + '/enquiry/', { waitUntil: 'networkidle' });
    const submit = kp.getByRole('button', { name: /send|submit/i }).last();
    await submit.focus(); await kp.keyboard.press('Enter');
    await kp.waitForTimeout(400);
    const fe = await kp.evaluate(() => ({ invalid: document.querySelectorAll('[aria-invalid="true"]').length, focusOnField: !!document.activeElement?.matches('input,select,textarea,[aria-invalid="true"],.err,[role="alert"],[tabindex="-1"]') }));
    check(fe.invalid > 0 && fe.focusOnField, `enquiry blank submit by keyboard: ${fe.invalid} invalid fields flagged, focus moved to a field/error`);
    check(kerrs.length === 0, 'no uncaught page errors in keyboard pass ' + kerrs.join(' | '));
    await kctx.close();
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
  await page.getByRole('heading', { name: 'Menu', exact: true }).waitFor({ timeout: 5000 }).then(() => check(true, 'menu list has a Menu heading'), () => check(false, 'menu list has a Menu heading'));
  check(await page.evaluate(() => document.getElementById('menu').contains(document.activeElement)), 'focus stays inside the Menu tab after Save (not dropped to the page top)');
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
