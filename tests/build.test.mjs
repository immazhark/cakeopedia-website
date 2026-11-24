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
