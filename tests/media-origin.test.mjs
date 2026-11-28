import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { checkOrigin } from '../scripts/check-media-origin.mjs';

test('origin check passes good files and reports 404, wrong type, redirect and empty body', async () => {
  const routes = {
    '/media/img/a-480.avif': [200, 'image/avif', '12345'], '/media/img/b.webp': [200, 'image/jpeg', '5'], '/media/img/c.jpg': [302, 'text/html', '0'],
    '/media/video/d.mp4': [200, 'video/mp4', '0'], '/media/video/e.mp4': [200, 'video/mp4; codecs=avc1', '9'],
  };
  const srv = createServer((q, r) => { const [s, t, l] = routes[q.url] ?? [404, 'text/html', '0']; r.writeHead(s, { 'content-type': t, 'content-length': l }); r.end(); });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const f = await checkOrigin(base, [...Object.keys(routes), '/media/img/missing.webp']);
  srv.close();
  assert.equal(f.length, 4, f.join('\n'));
  assert.ok(f.some((x) => x.includes('b.webp') && x.includes('content-type')));
  assert.ok(f.some((x) => x.includes('c.jpg') && x.includes('302')));
  assert.ok(f.some((x) => x.includes('d.mp4') && x.includes('empty')));
  assert.ok(f.some((x) => x.includes('missing') && x.includes('404')));
});
