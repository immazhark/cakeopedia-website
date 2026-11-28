// Builds web derivatives from local originals. Originals stay untouched and outside Git.
// Usage: CAKEOPEDIA_MEDIA_DIR=<folder> FFMPEG=<path> node scripts/build-media.mjs   (FORCE_VIDEO=1 re-encodes clips)
// Provenance (neutral slug -> source file) lives in the gitignored private/ folder.
// Images: AVIF + WebP + JPEG fallback at 480/800/1280, metadata stripped, dominant colour for a placeholder.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import sharp from 'sharp';

const src = process.env.CAKEOPEDIA_MEDIA_DIR ?? 'C:/Users/khana/OneDrive/Desktop/CakeopediaMedia/batch1';
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
const prov = JSON.parse(readFileSync('private/media-provenance.json', 'utf8'));
// start/length in seconds; trims avoid frames where customer names are legible.
const clips = {
  'vintage-piped-castle': { ss: 0.5, t: 15, poster: 14.2 },
  'mini-cakes-packing': { ss: 0, t: 12, poster: 5.5 },
  'balloon-reveal': { ss: 0, t: 12, poster: 3.2 },
};
const WIDTHS = [480, 800, 1280];
// Quality is tuned for roughly equal looks: AVIF 52 ~ WebP 74 ~ mozjpeg 74 on buttercream and flowers.
const ENC = { avif: (s) => s.avif({ quality: 52, effort: 5 }), webp: (s) => s.webp({ quality: 74 }), jpg: (s) => s.jpeg({ quality: 74, mozjpeg: true }) };
mkdirSync('public/media/img', { recursive: true });
mkdirSync('public/media/video', { recursive: true });
const manifest = { images: {}, videos: {} };
const hex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

for (const [slug, file] of Object.entries(prov.images)) {
  // rotate() applies EXIF orientation; sharp writes no EXIF/GPS/ICC text unless asked, so outputs carry no metadata.
  const base = sharp(join(src, file), { failOn: 'none' }).rotate();
  const buf = await base.clone().toBuffer();
  const meta = await sharp(buf).metadata();
  for (const w of WIDTHS)
    for (const [ext, enc] of Object.entries(ENC)) await enc(sharp(buf).resize({ width: w, withoutEnlargement: true })).toFile(`public/media/img/${slug}-${w}.${ext}`);
  const small = await sharp(buf).resize(32, 32, { fit: 'inside' }).stats(); // cheap placeholder: mean colour of the picture
  manifest.images[slug] = { w: meta.width, h: meta.height, widths: WIDTHS, bg: hex(small.channels.length >= 3 ? { r: small.channels[0].mean, g: small.channels[1].mean, b: small.channels[2].mean } : { r: 128, g: 128, b: 128 }) };
  console.log('img', slug, meta.width, meta.height);
}
for (const [slug, file] of Object.entries(prov.videos)) {
  const c = clips[slug], input = join(src, file), out = `public/media/video/${slug}.mp4`;
  if (!process.env.FORCE_VIDEO && existsSync(out) && existsSync(`public/media/video/${slug}-poster.webp`)) { manifest.videos[slug] = { w: 540, h: 960, seconds: c.t }; console.log('video kept', slug); continue; }
  // -an: decorative footage ships silent; -map_metadata -1 strips container tags (incl. location).
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-ss', String(c.ss), '-t', String(c.t), '-i', input, '-an', '-map_metadata', '-1',
    '-vf', 'scale=540:960:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '29', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-ss', String(c.poster), '-i', input, '-frames:v', '1', '-vf', 'scale=540:960:flags=lanczos', `private/poster-${slug}.png`]);
  await sharp(`private/poster-${slug}.png`).webp({ quality: 72 }).toFile(`public/media/video/${slug}-poster.webp`);
  manifest.videos[slug] = { w: 540, h: 960, seconds: c.t };
  console.log('video', slug);
}
writeFileSync('src/data/media-manifest.json', JSON.stringify(manifest, null, 1) + '\n');
