// Release gate for media in the BUILT site (run after `npm run media && npm run build`; CI has no media, so this
// is not part of `npm run verify`). Fails on: missing or empty files, missing alt, missing width/height, bad
// srcset (descriptor not matching the file, missing sizes, unordered), oversized assets, image metadata
// (EXIF/GPS/XMP/IPTC), videos with audio or location tags, and videos missing poster, muted/playsinline or label.
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { htmlFiles, mediaRefs } from './media-lib.mjs';

const dist = process.env.DIST ?? 'dist';
const KB = 1024, LIMIT = { image: 400 * KB, poster: 120 * KB, video: 1536 * KB };
const errors = [], refs = new Set();
const bad = (page, msg) => errors.push(`${page}: ${msg}`);
const attr = (tag, n) => { const m = tag.match(new RegExp(String.raw`\s${n}(?:="([^"]*)")?(?=[\s>/])`)); return m ? m[1] ?? '' : undefined; };
const file = (u) => join(dist, u);
const candidates = (set) => set.split(',').map((s) => s.trim().split(/\s+/)).map(([u, d]) => ({ u, w: parseInt(d ?? '', 10), d }));

const widthCache = new Map();
async function dims(u) {
  if (!widthCache.has(u)) widthCache.set(u, existsSync(file(u)) ? (await sharp(file(u), { failOn: 'none' }).metadata()).width : undefined);
  return widthCache.get(u);
}
async function checkSet(page, set, sizes, what) {
  const c = candidates(set);
  if (!c.length || c.some((x) => !x.u?.startsWith('/media/') || !/^\d+w$/.test(x.d ?? ''))) return bad(page, `${what}: srcset needs /media/ URLs with w descriptors`);
  if (!sizes) bad(page, `${what}: srcset without sizes`);
  if (c.some((x, i) => i && x.w <= c[i - 1].w)) bad(page, `${what}: srcset widths not ascending`);
  for (const x of c) { refs.add(x.u); const w = await dims(x.u); if (w !== undefined && w !== x.w) bad(page, `${x.u}: descriptor ${x.w}w but file is ${w}px wide`); }
}

for (const f of htmlFiles(dist)) {
  const page = f.slice(dist.length + 1), html = readFileSync(f, 'utf8');
  mediaRefs(html).forEach((r) => refs.add(r));
  let eager = 0;
  for (const m of html.matchAll(/<picture\b[^>]*>([\s\S]*?)<\/picture>|<img\b[^>]*>/g)) {
    const inner = m[1] ?? '', tag = inner ? inner.match(/<img\b[^>]*>/)?.[0] ?? '' : m[0];
    if (!/\/media\//.test(m[0])) continue;
    if (!tag) { bad(page, '<picture> without <img>'); continue; }
    const alt = attr(tag, 'alt');
    if (!alt || !alt.trim()) bad(page, `${attr(tag, 'src')}: missing or empty alt`);
    if (!/^\d+$/.test(attr(tag, 'width') ?? '') || !/^\d+$/.test(attr(tag, 'height') ?? '')) bad(page, `${attr(tag, 'src')}: needs numeric width and height`);
    if (attr(tag, 'loading') !== 'lazy') eager++;
    const sizes = attr(tag, 'sizes');
    if (attr(tag, 'srcset')) await checkSet(page, attr(tag, 'srcset'), sizes, 'img');
    for (const s of inner.matchAll(/<source\b[^>]*>/g)) {
      const t = attr(s[0], 'type');
      if (!/^image\/(avif|webp)$/.test(t ?? '')) bad(page, `<source> needs type image/avif or image/webp, has ${t}`);
      await checkSet(page, attr(s[0], 'srcset') ?? '', attr(s[0], 'sizes') ?? sizes, `source ${t}`);
    }
    if (inner && !/image\/avif/.test(inner)) bad(page, `${attr(tag, 'src')}: no AVIF source`);
  }
  if (eager > 4) bad(page, `${eager} images load eagerly (limit 4; only above-the-fold images should)`);
  for (const m of html.matchAll(/<video\b[^>]*>/g)) {
    const v = m[0], poster = attr(v, 'poster');
    if (!poster) bad(page, 'video without poster'); else refs.add(poster);
    if (attr(v, 'autoplay') !== undefined) bad(page, 'video has the autoplay attribute (the hero starts from script, never under reduced motion)');
    if (!['none', 'metadata'].includes(attr(v, 'preload') ?? '')) bad(page, `video preload must be none or metadata, is ${attr(v, 'preload')}`);
    if (attr(v, 'playsinline') === undefined) bad(page, 'video without playsinline');
    if (attr(v, 'controls') === undefined && attr(v, 'muted') === undefined) bad(page, 'video needs controls, or must be muted');
    if (!attr(v, 'aria-label')?.trim()) bad(page, 'video without aria-label');
    if (!attr(v, 'width') || !attr(v, 'height')) bad(page, 'video without width and height');
  }
}

let checked = 0;
for (const r of refs) {
  const p = file(r);
  if (!existsSync(p) || statSync(p).size === 0) { errors.push(`MISSING: ${r}`); continue; }
  checked++;
  const size = statSync(p).size, ext = r.split('.').pop();
  if (ext === 'mp4') {
    if (size > LIMIT.video) errors.push(`OVERSIZED: ${r} is ${Math.round(size / KB)} KB (limit ${LIMIT.video / KB})`);
    const j = JSON.parse(execFileSync(process.env.FFPROBE ?? 'ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', p]).toString());
    if (j.streams.some((s) => s.codec_type === 'audio')) errors.push(`AUDIO TRACK: ${r}`);
    const tags = Object.keys({ ...j.format.tags, ...j.streams[0]?.tags });
    const meta = tags.filter((k) => /location|gps|xyz|manufacturer|model|author|com\.apple/i.test(k));
    if (meta.length) errors.push(`METADATA: ${r} has ${meta.join(', ')}`);
  } else {
    const lim = /-poster\./.test(r) ? LIMIT.poster : LIMIT.image;
    if (size > lim) errors.push(`OVERSIZED: ${r} is ${Math.round(size / KB)} KB (limit ${lim / KB})`);
    const m = await sharp(p, { failOn: 'none' }).metadata();
    const meta = ['exif', 'xmp', 'iptc', 'tifftagPhotoshop'].filter((k) => m[k]);
    if (meta.length) errors.push(`METADATA: ${r} has ${meta.join(', ')}`);
  }
}
console.log(`${refs.size} media references checked (${checked} files present, ${errors.length} problems)`);
if (errors.length) { console.error('MEDIA CHECK FAILED:\n' + errors.join('\n')); process.exit(1); }
