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

test('FAQ page is indexable with FAQPage and breadcrumb data that match its visible answers; previews emit none', () => {
  const html = read('faq/index.html');
  assert.doesNotMatch(html, /noindex/);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((b) => b['@type'] === 'FAQPage'), crumbs = blocks.find((b) => b['@type'] === 'BreadcrumbList');
  assert.ok(faq && crumbs);
  assert.ok(faq.mainEntity.length >= 6);
  for (const q of faq.mainEntity) assert.ok(html.includes(q.name.replace(/’/g, '&#39;').replace(/'/g, '&#39;')) || html.includes(q.name), `question not visible: ${q.name}`);
  assert.match(read('robots.txt'), /User-agent: GPTBot\nDisallow: \//);
  assert.doesNotMatch(read('robots.txt'), /User-agent: (OAI-SearchBot|PerplexityBot|Googlebot)/);
});

test('every indexable page has a unique title and a useful description; the thank-you page stays out of search', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : []; });
  assert.match(read('enquiry-received/index.html'), /noindex/);
  const seen = new Map();
  for (const f of walk(out)) {
    const h = readFileSync(f, 'utf8');
    if (/name="robots" content="[^"]*noindex/.test(h)) continue;
    const title = h.match(/<title>([^<]*)/)?.[1] ?? '', desc = h.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
    assert.ok(title.length >= 20 && title.length <= 70, `${f}: title length ${title.length}`);
    assert.ok(desc.length >= 70 && desc.length <= 175, `${f}: description length ${desc.length}`);
    assert.ok(!seen.has(title), `${f}: duplicate title with ${seen.get(title)}`);
    seen.set(title, f);
  }
  assert.ok(seen.size >= 30);
});
