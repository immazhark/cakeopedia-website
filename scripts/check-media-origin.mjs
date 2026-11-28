// Verifies media availability on a running origin (local static server, staging or production): HEAD every
// /media/ URL the built pages reference; each must answer 200 with the right content-type and a non-zero length.
// Usage: BASE=https://example.com node scripts/check-media-origin.mjs   (reads references from ./dist, or DIST=<dir>)
// A redirect (for example to a login page) is a failure, not followed. For a site behind Cloudflare Access, set
// CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET (a service token) so requests can pass.
import { pathToFileURL } from 'node:url';
import { allRefs, TYPES } from './media-lib.mjs';

export async function checkOrigin(base, urls, headers = {}) {
  const failures = [];
  const queue = [...urls];
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let u; (u = queue.shift()); ) {
      try {
        const r = await fetch(new URL(u, base), { method: 'HEAD', redirect: 'manual', headers, signal: AbortSignal.timeout(15000) });
        const want = TYPES[u.split('.').pop()];
        const type = (r.headers.get('content-type') ?? '').split(';')[0].trim();
        const len = r.headers.get('content-length');
        if (r.status !== 200) failures.push(`${u}: HTTP ${r.status}${r.status >= 300 && r.status < 400 ? ' redirect (login page or wrong path?)' : ''}`);
        else if (type !== want) failures.push(`${u}: content-type ${type || 'none'}, expected ${want}`);
        else if (len !== null && Number(len) === 0) failures.push(`${u}: empty body`);
      } catch (e) { failures.push(`${u}: ${e.cause?.code ?? e.message}`); }
    }
  }));
  return failures;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.env.BASE;
  if (!base) { console.error('Set BASE, for example BASE=http://127.0.0.1:4322'); process.exit(2); }
  const headers = process.env.CF_ACCESS_CLIENT_ID ? { 'CF-Access-Client-Id': process.env.CF_ACCESS_CLIENT_ID, 'CF-Access-Client-Secret': process.env.CF_ACCESS_CLIENT_SECRET ?? '' } : {};
  const urls = [...allRefs(process.env.DIST ?? 'dist')];
  if (!urls.length) { console.error('No media references found in the built pages'); process.exit(2); }
  const failures = await checkOrigin(base, urls, headers);
  console.log(`${urls.length} media URLs checked on ${new URL(base).origin}`);
  if (failures.length) { console.error('MEDIA PROBLEMS:\n' + failures.join('\n')); process.exit(1); }
}
