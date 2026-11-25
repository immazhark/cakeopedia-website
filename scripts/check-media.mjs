// Release gate: every /media/... URL referenced by built HTML must exist in dist and be non-empty.
// Not part of `npm run verify` (CI has no media); run after `npm run media && npm run build` before any release.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const refs = new Set();
for (const file of walk(dist).filter((f) => f.endsWith('.html'))) {
  for (const m of readFileSync(file, 'utf8').matchAll(/\/media\/[A-Za-z0-9._\/-]+\.(?:webp|mp4|jpg|png)/g)) refs.add(m[0]);
}
const missing = [...refs].filter((r) => !existsSync(join(dist, r)) || statSync(join(dist, r)).size === 0);
console.log(`${refs.size} media references checked`);
if (missing.length) { console.error('MISSING MEDIA:\n' + missing.join('\n')); process.exit(1); }
