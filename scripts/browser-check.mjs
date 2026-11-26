// Real-browser regression check on installed Edge (viewport emulation, not a physical device).
// Needs the local stack running first: `npm run dev:api` and `npm run dev` (uses local D1 with test data only).
// Usage: node scripts/browser-check.mjs [outDir]   -> exits non-zero on any failed check.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium, devices } from 'playwright-core';
const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

const BASE = process.env.BASE ?? 'http://127.0.0.1:4321', out = process.argv[2] ?? 'browser-check-out';
mkdirSync(out, { recursive: true });
const failures = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failures.push(msg); };

const axeScan = async (page, label) => { // automated accessibility rules (axe-core, WCAG A/AA tags); every violation fails the check
  await page.addScriptTag({ path: axePath });
  const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map((x) => `${x.id} (${x.impact}) x${x.nodes.length}: ${x.nodes[0].target.join(' ')}`));
  check(v.length === 0, `${label} axe: ${v.length ? v.join(' | ') : 'no WCAG A/AA violations'}`);
};
const browser = await chromium.launch({ channel: 'msedge' });
try {
  // 1. Public pages: no horizontal overflow, no broken images, at real phone widths.
  for (const width of [320, 390, 430]) {
    const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width, height: 844 } });
    const page = await ctx.newPage();
    for (const path of ['/', '/creations/', '/story/', '/enquiry/', '/collections/floral/', '/menu/', '/faq/', '/size-guide/', '/cake-care/']) {
      // 'load', not 'networkidle': the dev build mounts the real Turnstile widget, which keeps a connection open
      await page.goto(BASE + path, { waitUntil: 'load' });
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } });
      const m = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, vw: innerWidth, broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length }));
      check(m.vw === width && m.over <= 0 && m.broken === 0, `${path} @${width}: viewport ${m.vw}, overflow ${m.over}px, broken images ${m.broken}`);
      if (width === 390 && path === '/') await page.screenshot({ path: `${out}/home-390.png` });
      if (width === 390) await axeScan(page, path);
    }
    await ctx.close();
  }

  // 1b. Keyboard only (no mouse) + reduced motion, on a desktop-width page.
  {
    const kctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const kp = await kctx.newPage();
    const kerrs = []; kp.on('pageerror', (e) => kerrs.push(String(e)));
    const focusInfo = () => kp.evaluate(async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); // let the 1-frame reduced-motion transition settle
      const e = document.activeElement; if (!e || e === document.body) return null;
      const again = window.__last === e; window.__last = e; // native video/date controls take several Tab stops inside one element
      const s = getComputedStyle(e), r = e.getBoundingClientRect();
      return { again, tag: e.tagName, id: e.id, cls: e.className, text: (e.textContent || '').trim().slice(0, 30), ring: !!e.closest('#bot') /* third-party Turnstile draws its own focus UI */ || (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0), onscreen: r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && r.width > 0 };
    });
    for (const path of ['/', '/creations/', '/story/', '/enquiry/', '/collections/floral/', '/menu/', '/faq/', '/size-guide/', '/cake-care/']) {
      await kp.goto(BASE + path, { waitUntil: 'load' });
      await kp.keyboard.press('Tab');
      const first = await focusInfo();
      check(!!first && /skip/.test(String(first.cls)) && first.onscreen && first.ring, `${path} first Tab lands on a visible skip link ${JSON.stringify(first)}`);
      await kp.keyboard.press('Enter');
      check(await kp.evaluate(() => location.hash === '#main'), `${path} skip link jumps to #main`);
      // Walk the whole tab order: every stop shows a focus ring and is on screen; focus must leave the page (no trap).
      await kp.goto(BASE + path, { waitUntil: 'load' });
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
    await kp.goto(BASE + '/enquiry/', { waitUntil: 'load' });
    const submit = kp.getByRole('button', { name: /send|submit/i }).last();
    await submit.focus(); await kp.keyboard.press('Enter');
    await kp.waitForTimeout(400);
    const fe = await kp.evaluate(() => ({ invalid: document.querySelectorAll('[aria-invalid="true"]').length, focusOnField: !!document.activeElement?.matches('input,select,textarea,[aria-invalid="true"],.err,[role="alert"],[tabindex="-1"]') }));
    check(fe.invalid > 0 && fe.focusOnField, `enquiry blank submit by keyboard: ${fe.invalid} invalid fields flagged, focus moved to a field/error`);
    check(kerrs.length === 0, 'no uncaught page errors in keyboard pass ' + kerrs.join(' | '));
    await kctx.close();
  }

  // 2. Owner journey at 390px: prices, enquiries and calendar.
  const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + '/admin/', { waitUntil: 'networkidle' });
  // Prices journey: the draft is private, a bad price is refused, a saved draft can be published, and the page stays within the viewport.
  await page.locator('#inbox').waitFor();
  await axeScan(page, '/admin/ enquiries');
  await page.getByRole('button', { name: 'Prices', exact: true }).click();
  await page.locator('#prices input').first().waitFor({ timeout: 8000 });
  await axeScan(page, '/admin/ prices');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Prices tab has no horizontal overflow at 390');
  const first = page.locator('#prices input').first();
  await first.fill('abc'); await page.getByRole('button', { name: 'Save draft' }).click();
  await page.getByText('dollars and cents').waitFor({ timeout: 5000 }).then(() => check(true, 'an invalid price is refused with a plain message'), () => check(false, 'an invalid price is refused with a plain message'));
  await first.fill('136.00'); await page.getByRole('button', { name: 'Save draft' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('#prices button')].find((b) => b.textContent.includes('Publish'))?.disabled === false, null, { timeout: 8000 }).then(() => check(true, 'a saved draft can be published'), () => check(false, 'a saved draft can be published'));
  await page.getByRole('button', { name: 'Publish to the website' }).click();
  await page.locator('#prices [role=status]').waitFor({ timeout: 8000 }).then(() => check(true, 'publishing confirms with a status message'), () => check(false, 'publishing confirms with a status message'));
  // Owner Enquiries and Calendar by keyboard: re-rendering must not drop focus to the top of the page.
  const kept = (id) => page.evaluate((i) => document.getElementById(i).contains(document.activeElement), id);
  await page.getByRole('button', { name: 'Enquiries', exact: true }).click();
  await page.getByRole('button', { name: 'new', exact: true }).focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(600);
  check(await kept('inbox'), 'focus stays in Enquiries after using a status filter by keyboard');
  const row = page.locator('#inbox ul button.row').first();
  if (await row.count()) {
    await row.focus(); await page.keyboard.press('Enter'); await page.locator('#detail').getByRole('heading', { level: 2 }).waitFor();
    check(await kept('detail'), 'focus moves into the enquiry detail when opened by keyboard');
    await axeScan(page, '/admin/ enquiry detail');
    await page.getByRole('button', { name: 'Update status' }).focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(800);
    check(await kept('detail'), 'focus stays in the enquiry detail after Update status by keyboard');
    await page.getByRole('button', { name: /All enquiries/ }).click();
  } else console.log('SKIP enquiry detail keyboard check: no enquiries in local data');
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  const day = page.locator('#calendar ul button.chip').first(); await day.waitFor();
  await axeScan(page, '/admin/ calendar');
  await day.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(600);
  check(await kept('calendar'), 'focus stays in Calendar after toggling a day by keyboard');
  await page.keyboard.press('Enter'); await page.waitForTimeout(600); // toggle it back so test data stays clean
  check(errors.length === 0, 'no uncaught page errors in owner journey ' + errors.join(' | '));
  await ctx.close();
} finally { await browser.close(); }
if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
