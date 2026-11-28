import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
const read = (p) => readFile(new URL(`../dist/${p}`, import.meta.url), 'utf8');

test('home is a non-indexable preview with accessible structure, no form and no autoplaying audio', async () => {
  const html = await read('index.html');
  assert.match(html, /<html\b[^>]*\blang="en"/);
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.match(html, /href="#main"/);
  assert.match(html, /id="main"/);
  assert.match(html, /<h1/);
  assert.match(html, /<video[^>]*\bmuted\b[^>]*\bloop\b/);
  assert.doesNotMatch(html, /<video[^>]*\bautoplay\b/);
  assert.doesNotMatch(html, /<form|application\/ld\+json/);
  const robots = await read('robots.txt');
  assert.match(robots, /Disallow: \//);
});

test('every creation page has explicit image dimensions, alt text and a non-menu notice', async () => {
  const index = await read('creations/index.html');
  const slugs = [...index.matchAll(/href="\/creations\/([a-z0-9-]+)\/"/g)].map((m) => m[1]);
  assert.ok(slugs.length >= 15);
  for (const slug of new Set(slugs)) {
    const html = await read(`creations/${slug}/index.html`);
    assert.match(html, /<h1/);
    assert.match(html, /not an item you can order as shown/);
    assert.doesNotMatch(html, /\$\d/); // no invented prices
    for (const img of html.match(/<img\b[^>]*>/g) ?? []) {
      assert.match(img, /\bwidth="\d+"/);
      assert.match(img, /\bheight="\d+"/);
      assert.match(img, /\balt="[^"]+"/);
    }
  }
});

test('enquiry stays closed: no form, no file input, and links to Instagram', async () => {
  const html = await read('enquiry/index.html');
  assert.doesNotMatch(html, /<form|type="file"/);
  assert.match(html, /instagram\.com\/cakeopedia\.austin/);
});

test('no original-media paths or private provenance in built pages', async () => {
  for (const p of ['index.html', 'creations/index.html']) {
    const html = await read(p);
    assert.doesNotMatch(html, /CakeopediaMedia|C:\\|OneDrive|\.HEIC|1000\d{6}/i);
  }
});

test('collections are crawlable links with correct semantics, and the preview emits noindex headers', async () => {
  for (const cat of ['floral', 'vintage', 'celebration', 'minis']) {
    const html = await read(`collections/${cat}/index.html`);
    assert.match(html, /<h1/);
    assert.match(html, /aria-current="page"/);
    assert.doesNotMatch(html, /aria-pressed/);
  }
  assert.match(await read('creations/index.html'), /href="\/collections\/floral\/"/);
  assert.match(await read('_headers'), /X-Robots-Tag: noindex/);
  assert.match(await read('_headers'), /Content-Security-Policy: frame-ancestors 'none'\r?\n  X-Frame-Options: DENY/);
});

test('owner page is noindex, has no public nav, and its headers are not cacheable', async () => {
  const html = await read('admin/index.html');
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.doesNotMatch(html, /href="\/creations\/"/);
  assert.match(await read('_headers'), /\/admin\/\*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-store/);
});

test('menu concept is non-indexable and contains no fabricated prices or products', async () => {
  const html = await read('concepts/menu-guide/index.html');
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.match(html, /Menu in preparation/);
  assert.doesNotMatch(html, /\$\d|<form/);
  assert.doesNotMatch(await read('index.html'), /href="\/concepts\/menu-guide/);
});
