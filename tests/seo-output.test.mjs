import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Technical SEO/AEO/GEO checks on real built output (production and staging). Structured data must match visible approved content.
const build = (env) => { const d = mkdtempSync(join(tmpdir(), `cake-seo-${env}-`)); execFileSync(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build', '--outDir', d], { env: { ...process.env, PUBLIC_SITE_ENV: env }, stdio: 'pipe' }); return d; };
const prod = build('production'), stage = build('staging');
const read = (d, p) => readFileSync(join(d, p), 'utf8');
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : []; });
const blocks = (h) => [...h.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
const indexablePages = () => walk(prod).filter((f) => !/name="robots" content="[^"]*noindex/.test(readFileSync(f, 'utf8')));
const decode = (s) => s.replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const visible = (h) => decode(h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');

test('every indexable page: one h1, self canonical on the https origin with trailing slash, real og/twitter image and tags', () => {
  const pages = indexablePages();
  assert.ok(pages.length >= 30);
  for (const f of pages) {
    const h = readFileSync(f, 'utf8');
    assert.equal((h.match(/<h1[\s>]/g) ?? []).length, 1, `${f}: h1 count`);
    const canon = h.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
    assert.match(canon ?? '', /^https:\/\/cakeopedia\.com\/([^?#.]*\/)?$/, `${f}: canonical ${canon}`);
    assert.equal(h.match(/property="og:url" content="([^"]*)"/)?.[1], canon, `${f}: og:url`);
    const img = h.match(/property="og:image" content="([^"]*)"/)?.[1] ?? '';
    assert.match(img, /^https:\/\/cakeopedia\.com\/media\//, `${f}: og:image`);
    // CI has no photos by policy (SKIP_IMAGE_CHECK=1); local runs stay strict so a missing share image is caught before release.
    if (process.env.SKIP_IMAGE_CHECK !== '1') assert.ok(existsSync(join(prod, new URL(img).pathname)), `${f}: og:image file missing`);
    assert.match(h, /name="twitter:card" content="summary_large_image"/);
    for (const t of ['title', 'description', 'image']) assert.match(h, new RegExp(`name="twitter:${t}"`), `${f}: twitter:${t}`);
  }
});

test('home carries Bakery, Organization and WebSite data with only confirmed facts', () => {
  const b = blocks(read(prod, 'index.html'));
  const by = (t) => b.find((x) => x['@type'] === t);
  assert.ok(by('Bakery') && by('Organization') && by('WebSite'));
  assert.equal(by('Bakery').areaServed, 'North Austin, Texas');
  assert.equal(by('Organization').email, 'contact@cakeopedia.com');
  assert.deepEqual(by('Organization').sameAs, ['https://www.instagram.com/cakeopedia.austin/']);
  assert.ok(!JSON.stringify(by('Organization')).includes('"logo"') && !JSON.stringify(by('Bakery')).includes('"logo"'), 'no logo property until a real logo is approved');
  assert.doesNotMatch(JSON.stringify(b), /address|aggregateRating|review|priceRange|offers|"price"|telephone|openingHours/i);
});

test('inner indexable pages have one BreadcrumbList ending at the page itself; no Offer or price data anywhere', () => {
  for (const f of indexablePages()) {
    const h = readFileSync(f, 'utf8'), b = blocks(h);
    assert.doesNotMatch(JSON.stringify(b), /"Offer"|"price"|priceCurrency|aggregateRating/, `${f}: unapproved commerce data`);
    if (b.some((x) => x['@type'] === 'Bakery')) continue; // home
    const crumbs = b.filter((x) => x['@type'] === 'BreadcrumbList');
    assert.equal(crumbs.length, 1, `${f}: breadcrumb count`);
    const items = crumbs[0].itemListElement, canon = h.match(/<link rel="canonical" href="([^"]*)"/)[1];
    assert.equal(items[0].item, 'https://cakeopedia.com/');
    assert.equal(items.at(-1).item, canon, `${f}: last crumb`);
    items.forEach((it, i) => assert.equal(it.position, i + 1));
  }
});

test('FAQPage answers equal the visible text; the in-short summaries state only approved facts', () => {
  const html = read(prod, 'faq/index.html'), faq = blocks(html).find((x) => x['@type'] === 'FAQPage');
  const text = visible(html);
  for (const q of faq.mainEntity) {
    assert.ok(text.includes(q.name), `question: ${q.name}`);
    assert.ok(text.includes(q.acceptedAnswer.text.replace(/\s+/g, ' ')), `answer not visible verbatim: ${q.name}`);
  }
  for (const [page, re] of [['menu', /In short: Custom cakes start at \$135/], ['size-guide', /In short:.*about 20 people at 6 inches/], ['faq', /In short: Custom cakes start at \$\d+.*50% advance payment/], ['cake-care', /In short: Carry the box/]]) {
    const h = read(prod, `${page}/index.html`);
    assert.match(visible(h), re, `${page}: direct-answer summary`);
    assert.ok(h.indexOf('In short:') < h.indexOf('<h2'), `${page}: summary comes before the first h2`);
  }
});

test('sitemap and robots follow the policy; admin, thank-you and concept pages stay out; 404 is noindex and links onward', () => {
  const urls = [...read(prod, 'sitemap.xml').matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  assert.ok(urls.every((u) => u.endsWith('/') && !/admin|enquiry-received|concepts|404/.test(u)));
  assert.equal(new Set(urls).size, urls.length);
  const pages = indexablePages().map((f) => 'https://cakeopedia.com' + f.slice(prod.length).replace(/\\/g, '/').replace(/index\.html$/, '')).filter((u) => !u.endsWith('404.html'));
  assert.deepEqual([...urls].sort(), pages.sort(), 'sitemap must list exactly the indexable pages');
  const robots = read(prod, 'robots.txt');
  for (const bot of ['GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot']) assert.match(robots, new RegExp(`User-agent: ${bot}\\nDisallow: /\\n`));
  assert.match(robots, /User-agent: \*\nAllow: \/\nDisallow: \/api\/\nDisallow: \/admin\//);
  const nf = read(prod, '404.html');
  assert.match(nf, /noindex/); assert.match(nf, /href="\/creations\/"/); assert.match(nf, /href="\/"/);
});

test('staging build is closed: noindex meta everywhere, X-Robots-Tag header, Disallow-all robots, empty sitemap, no canonical or JSON-LD', () => {
  for (const f of walk(stage)) {
    const h = readFileSync(f, 'utf8');
    assert.match(h, /<meta name="robots" content="noindex, nofollow"/, f);
    assert.doesNotMatch(h, /rel="canonical"|application\/ld\+json/, f);
  }
  assert.match(read(stage, '_headers'), /X-Robots-Tag: noindex, nofollow/);
  assert.equal(read(stage, 'robots.txt').trim(), 'User-agent: *\nDisallow: /');
  assert.doesNotMatch(read(stage, 'sitemap.xml'), /<loc>/);
});
