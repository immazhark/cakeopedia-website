// Shared by check-media.mjs and check-media-origin.mjs: finds every /media/... URL the built pages reference.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const TYPES = { avif: 'image/avif', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4' };
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
export const htmlFiles = (dist) => walk(dist).filter((f) => f.endsWith('.html'));
// Every URL under /media/ with a known extension, wherever it appears in the markup (src, srcset, poster, og:image).
export function mediaRefs(html) {
  return [...html.matchAll(/(?:https?:\/\/[A-Za-z0-9.:-]+)?(\/media\/[A-Za-z0-9._\/-]+\.(?:avif|webp|mp4|jpe?g|png))/g)].map((m) => m[1]);
}
export const allRefs = (dist) => new Set(htmlFiles(dist).flatMap((f) => mediaRefs(readFileSync(f, 'utf8'))));
