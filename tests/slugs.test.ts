import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// worker/local.ts cannot import the Astro data module under NodeNext; keep the two lists identical.
test('local Worker creation IDs match the published creations', () => {
  const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
  const published = [...read('../src/data/creations.ts').matchAll(/^\s+\{ slug: '([a-z0-9-]+)'/gm)].map((m) => m[1]).sort();
  const line = read('../worker/creation-slugs.ts');
  const worker = [...line.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]).sort();
  assert.ok(published.length > 15);
  assert.deepEqual(worker, published);
});
