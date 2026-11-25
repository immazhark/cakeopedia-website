// Builds web derivatives from local originals. Originals stay untouched and outside Git.
// Usage: CAKEOPEDIA_MEDIA_DIR=<folder> FFMPEG=<path> node scripts/build-media.mjs
// Provenance (neutral slug -> source file) lives in the gitignored private/ folder.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
mkdirSync('public/media/img', { recursive: true });
mkdirSync('public/media/video', { recursive: true });
const manifest = { images: {}, videos: {} };

for (const [slug, file] of Object.entries(prov.images)) {
  const base = sharp(join(src, file), { failOn: 'none' }).rotate(); // sharp drops EXIF/GPS by default
  const meta = await sharp(await base.clone().toBuffer()).metadata();
  for (const w of WIDTHS) await base.clone().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toFile(`public/media/img/${slug}-${w}.webp`);
  manifest.images[slug] = { w: meta.width, h: meta.height, widths: WIDTHS };
  console.log('img', slug, meta.width, meta.height);
}
for (const [slug, file] of Object.entries(prov.videos)) {
  const c = clips[slug], input = join(src, file);
  // -an: decorative footage ships silent; -map_metadata -1 strips container tags (incl. location).
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-ss', String(c.ss), '-t', String(c.t), '-i', input, '-an', '-map_metadata', '-1',
    '-vf', 'scale=540:960:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '29', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `public/media/video/${slug}.mp4`]);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-ss', String(c.poster), '-i', input, '-frames:v', '1', '-vf', 'scale=540:960:flags=lanczos', `private/poster-${slug}.png`]);
  await sharp(`private/poster-${slug}.png`).webp({ quality: 80 }).toFile(`public/media/video/${slug}-poster.webp`);
  manifest.videos[slug] = { w: 540, h: 960, seconds: c.t };
  console.log('video', slug);
}
writeFileSync('src/data/media-manifest.json', JSON.stringify(manifest, null, 1) + '\n');
