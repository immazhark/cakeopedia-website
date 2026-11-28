// Estimates image bytes a page downloads: per <img>, picks the srcset candidate a browser would choose
// for a viewport width and pixel ratio. Reports eager (loaded at once) and total (everything scrolled to).
// Usage: node scripts/media-report.mjs [dist] [page ...]   env: VW=390 DPR=2
// Estimate from built HTML and file sizes, not a measurement from a browser.
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const pages = process.argv.slice(3).length ? process.argv.slice(3) : ['/', '/creations/'];
const VW = Number(process.env.VW ?? 390), DPR = Number(process.env.DPR ?? 2);
const size = (u) => { const p = join(dist, u.split('?')[0]); return existsSync(p) ? statSync(p).size : 0; };
const attr = (tag, n) => tag.match(new RegExp(`\\s${n}="([^"]*)"`))?.[1];
const len = (v) => (v.endsWith('vw') ? (parseFloat(v) * VW) / 100 : v.endsWith('rem') ? parseFloat(v) * 16 : parseFloat(v));
function slot(sizes) {
  if (!sizes) return VW;
  for (const part of sizes.split(',').map((s) => s.trim())) {
    const m = part.match(/^\(min-width:\s*([\d.]+)rem\)\s+(.+)$/);
    if (m) { if (VW >= parseFloat(m[1]) * 16) return len(m[2]); } else return len(part);
  }
  return VW;
}
function pick(srcset, src, sizes) {
  if (!srcset) return src;
  const need = slot(sizes) * DPR;
  const c = srcset.split(',').map((s) => s.trim().split(/\s+/)).map(([u, w]) => [u, parseInt(w)]).sort((a, b) => a[1] - b[1]);
  return (c.find(([, w]) => w >= need) ?? c.at(-1))[0];
}
for (const page of pages) {
  const html = readFileSync(join(dist, page, 'index.html'), 'utf8');
  let eager = 0, total = 0, n = 0;
  const imgs = [...html.matchAll(/(?:<picture[^>]*>([\s\S]*?))?<img\b[^>]*>/g)];
  for (const m of imgs) {
    const tag = m[0].slice(m[0].lastIndexOf('<img'));
    const inner = m[1] ?? '';
    const srcs = [...inner.matchAll(/<source\b[^>]*>/g)].map((s) => s[0]);
    const best = srcs.find((s) => attr(s, 'type') === 'image/avif') ?? srcs.find((s) => attr(s, 'type') === 'image/webp');
    const u = best ? pick(attr(best, 'srcset'), undefined, attr(best, 'sizes') ?? attr(tag, 'sizes')) : pick(attr(tag, 'srcset'), attr(tag, 'src'), attr(tag, 'sizes'));
    const b = size(u); n++; total += b; if (attr(tag, 'loading') !== 'lazy') eager += b;
  }
  const poster = [...html.matchAll(/<video\b[^>]*\sposter="([^"]+)"/g)].map((m) => size(m[1]));
  const posters = poster.reduce((a, b) => a + b, 0);
  console.log(`${page}  viewport ${VW}px @${DPR}x: ${n} images, eager ${(eager / 1024).toFixed(0)} KB, all ${(total / 1024).toFixed(0)} KB; video posters ${(posters / 1024).toFixed(0)} KB`);
}
