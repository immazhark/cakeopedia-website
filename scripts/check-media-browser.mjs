// Deployed-media check through an already Access-authenticated browser profile (no service token). HEADs every /media/ URL the built
// pages reference from inside the page, so the Access cookie applies. Video must also advertise byte ranges (iOS Safari needs real 206 responses). The check does a real Range GET: the edge may drop the Accept-Ranges header, behaviour is what counts.
// Usage: BASE=https://staging-host DIST=dist node scripts/check-media-browser.mjs     (log in to Access in the window if asked)
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { allRefs, TYPES } from './media-lib.mjs';

const base = process.env.BASE; if (!base) { console.error('Set BASE'); process.exit(2); }
const urls = [...allRefs(process.env.DIST ?? 'dist')]; if (!urls.length) { console.error('No media references found'); process.exit(2); }
const ctx = await chromium.launchPersistentContext(join(process.env.LOCALAPPDATA ?? '.', 'cakeopedia-smoke-profile'), { channel: 'msedge', headless: false });
const page = ctx.pages()[0] ?? await ctx.newPage();
await page.goto(base + '/', { waitUntil: 'load' });
for (let i = 0; i < 300 && new URL(page.url()).origin !== new URL(base).origin; i++) await page.waitForTimeout(2000);
const rows = await page.evaluate(async (list) => {
  const out = [], queue = [...list];
  await Promise.all(Array.from({ length: 8 }, async () => { for (let u; (u = queue.shift()); ) {
    try { const r = await fetch(u, { method: 'HEAD', redirect: 'manual' }); out.push({ u, s: r.type === 'opaqueredirect' ? 302 : r.status, t: (r.headers.get('content-type') ?? '').split(';')[0], l: r.headers.get('content-length'), c: r.headers.get('cache-control') }); }
    catch { out.push({ u, s: 0 }); } } }));
  for (const r of out.filter((x) => x.s === 200 && /.mp4$/.test(x.u))) { try { const g = await fetch(r.u, { headers: { Range: 'bytes=0-1' } }); r.rs = g.status; r.cr = g.headers.get('content-range'); } catch { r.rs = 0; } }
  return out;
}, urls);
await ctx.close();
const bad = [];
for (const r of rows) {
  const want = TYPES[r.u.split('.').pop()];
  if (r.s !== 200) bad.push(`${r.u}: HTTP ${r.s}`);
  else if (r.t !== want) bad.push(`${r.u}: content-type ${r.t || 'none'}, expected ${want}`);
  else if (r.l !== null && Number(r.l) === 0) bad.push(`${r.u}: empty body`);
  else if (/^video\//.test(want) && !(r.rs === 206 && /^bytes 0-1\/\d+$/.test(r.cr ?? ''))) bad.push(`${r.u}: Range request answered ${r.rs} (${r.cr ?? 'no Content-Range'}), expected 206`);
}
const long = rows.filter((r) => r.s === 200 && /immutable/.test(r.c ?? '')).length;
console.log(`${rows.length} media URLs checked on ${new URL(base).origin}; ${rows.length - bad.length} ok; ${long} served with long-lived immutable caching`);
if (bad.length) { console.error('MEDIA PROBLEMS:\n' + bad.slice(0, 20).join('\n') + (bad.length > 20 ? `\n...and ${bad.length - 20} more` : '')); process.exit(1); }
