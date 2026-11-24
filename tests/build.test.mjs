import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
test('preview remains non-indexable and does not expose an unfinished intake', async () => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(html, /<html\b[^>]*\blang="en"/);
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.match(html, /href="#main"/);
  assert.match(html, /id="main"/);
  assert.match(html, /Development preview/);
  assert.doesNotMatch(html, /<form|application\/ld\+json|<script/);
  const robots = await readFile(new URL('../dist/robots.txt', import.meta.url), 'utf8');
  assert.match(robots, /Disallow: \//);
});
test('every concept has four creation links, a safe detail path and disabled enquiry entry', async () => {
  for (const direction of ['collection','cabinet','table']) {
    const root = new URL(`../dist/concepts/${direction}/`, import.meta.url);
    const html = await readFile(new URL('index.html', root), 'utf8');
    assert.match(html, /noindex, nofollow/);
    assert.match(html, /provisional copy &(?:amp;)? image slots/);
    for (const creation of ['floral','bow','playful','treats']) {
      assert.ok(html.includes(`/concepts/${direction}/${creation}/`));
      const detail = await readFile(new URL(`${creation}/index.html`, root), 'utf8');
      assert.ok(detail.includes(`enquiry/?creation=${creation}`));
      assert.match(detail, /not a product image/);
    }
    const enquiry = await readFile(new URL('enquiry/index.html',root),'utf8');
    assert.match(enquiry, /<fieldset disabled/);
    assert.match(enquiry, /no information is sent/);
    assert.doesNotMatch(enquiry, /<form[^>]*action=/);
  }
});
