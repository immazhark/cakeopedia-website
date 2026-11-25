import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// A deliberate production build must be crawlable and self-consistent; previews stay closed (see build.test.mjs).
const out = mkdtempSync(join(tmpdir(), 'cake-prod-'));
execFileSync(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build', '--outDir', out], { env: { ...process.env, PUBLIC_SITE_ENV: 'production' }, stdio: 'pipe' });
const read = (p) => readFileSync(join(out, p), 'utf8');

test('production output is indexable with canonical URLs, a sitemap and no concept routes', () => {
  const home = read('index.html');
  assert.doesNotMatch(home, /noindex/);
  assert.match(home, /<link rel="canonical" href="https:\/\/cakeopedia\.com\/"/);
  assert.match(home, /property="og:image" content="https:\/\/cakeopedia\.com\//);
  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(home)[1]);
  assert.deepEqual([ld['@type'], ld.url], ['Bakery', 'https://cakeopedia.com/']);
  assert.ok(!('address' in ld) && !('aggregateRating' in ld) && !('priceRange' in ld), 'no unapproved facts');
  assert.match(read('robots.txt'), /Allow: \/\n[\s\S]*Sitemap: https:\/\/cakeopedia\.com\/sitemap\.xml/);
  const urls = [...read('sitemap.xml').matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  assert.ok(urls.length > 20 && urls.every((u) => u.startsWith('https://cakeopedia.com/')));
  for (const u of urls) assert.ok(existsSync(join(out, new URL(u).pathname, 'index.html')), `sitemap lists a missing page: ${u}`);
  assert.ok(!existsSync(join(out, 'concepts')) && !read('_headers').includes('X-Robots-Tag: noindex, nofollow\n/admin'));
  assert.match(read('admin/index.html'), /noindex/);
  assert.match(read('404.html'), /noindex/);
});
