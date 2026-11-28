import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serveWithRanges } from '../worker/media-range.ts';

const data = Uint8Array.from({ length: 100 }, (_, i) => i);
let seen: Request | undefined;
const assets = { fetch: async (r: Request) => { seen = r; return new Response(data, { headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'public, max-age=31536000, immutable' } }); } };
const get = (range?: string, method = 'GET') => serveWithRanges(new Request('https://x.test/media/video/a.mp4', { method, ...(range ? { headers: { Range: range } } : {}) }), assets);

test('no Range: full file, advertises byte ranges, keeps type and caching', async () => {
  const r = await get(); assert.equal(r.status, 200);
  assert.deepEqual([r.headers.get('Accept-Ranges'), r.headers.get('Content-Type'), r.headers.get('Content-Length'), r.headers.get('Cache-Control')], ['bytes', 'video/mp4', '100', 'public, max-age=31536000, immutable']);
  assert.equal((await r.arrayBuffer()).byteLength, 100); assert.equal(seen!.headers.get('Range'), null);
});
test('single ranges return 206 with the exact bytes and Content-Range', async () => {
  for (const [range, from, to] of [['bytes=0-9', 0, 9], ['bytes=90-', 90, 99], ['bytes=-10', 90, 99], ['bytes=95-500', 95, 99], ['bytes=0-0', 0, 0]] as const) {
    const r = await get(range); assert.equal(r.status, 206, range);
    assert.equal(r.headers.get('Content-Range'), `bytes ${from}-${to}/100`); assert.equal(r.headers.get('Content-Length'), String(to - from + 1));
    assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [...data.slice(from, to + 1)]);
  }
});
test('unsatisfiable ranges are 416; malformed or multi ranges fall back to the whole file; HEAD has no body', async () => {
  for (const bad of ['bytes=100-', 'bytes=200-300', 'bytes=-0', 'bytes=50-10']) { const r = await get(bad); assert.equal(r.status, 416, bad); assert.equal(r.headers.get('Content-Range'), 'bytes */100'); }
  for (const odd of ['bytes=0-1,5-6', 'items=0-5', 'bytes=-']) assert.equal((await get(odd)).status, 200, odd);
  const h = await get('bytes=0-9', 'HEAD'); assert.equal(h.status, 206); assert.equal((await h.arrayBuffer()).byteLength, 0);
});
test('a missing asset passes through untouched', async () => {
  const r = await serveWithRanges(new Request('https://x.test/media/video/none.mp4'), { fetch: async () => new Response('nope', { status: 404 }) });
  assert.equal(r.status, 404);
});
