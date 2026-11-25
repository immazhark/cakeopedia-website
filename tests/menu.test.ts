import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMenu, publicMenu } from '../src/data/menu.ts';

const item = () => ({
  id: 'synthetic-test-cake', title: 'Synthetic fixture', category: 'Test category',
  status: 'published', availability: 'available', revision: 1,
  updatedAt: '2026-11-25T00:00:00Z', kind: 'custom',
  sizes: [{ label: 'Test size', layers: 2, servings: { min: 4, max: 6 }, priceCents: 100 }],
  flavours: ['Test flavour'], fillings: ['Test filling'],
  addons: [{ label: 'Test addon', priceCents: 25 }], ingredientNote: null,
});

test('draft and archived items never appear in public menu', () => {
  const entries = parseMenu([item(), { ...item(), id: 'draft', status: 'draft' }, { ...item(), id: 'archived', status: 'archived' }]);
  assert.deepEqual(publicMenu(entries).map(x => x.id), ['synthetic-test-cake']);
});

test('fixed and starting price models preserve integer cents and serving ranges', () => {
  const entries = parseMenu([item(), { ...item(), id: 'standard', kind: 'standard' }]);
  assert.deepEqual(publicMenu(entries).map(x => x.priceKind), ['starting', 'fixed']);
  assert.deepEqual(entries[0].sizes[0].servings, { min: 4, max: 6 });
  assert.equal(entries[0].sizes[0].priceCents, 100);
});

test('rejects fractional or negative prices, reversed servings, and duplicate IDs', () => {
  for (const priceCents of [-1, 10.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => parseMenu([{ ...item(), sizes: [{ ...item().sizes[0], priceCents }] }]));
  }
  assert.throws(() => parseMenu([{ ...item(), sizes: [{ ...item().sizes[0], servings: { min: 6, max: 4 } }] }]));
  assert.throws(() => parseMenu([item(), item()]));
});

test('unavailable and unpriced items cannot become misleading public listings', () => {
  assert.deepEqual(publicMenu(parseMenu([{ ...item(), availability: 'unavailable' }])), []);
  assert.throws(() => parseMenu([{ ...item(), sizes: [] }]));
  assert.throws(() => parseMenu([{ ...item(), addons: [{ label: 'Test', priceCents: null }] }]));
  assert.deepEqual(publicMenu(parseMenu([])), []);
});

test('rejects unexpected fields and malformed input', () => {
  assert.throws(() => parseMenu([{ ...item(), privateNote: 'not public' }]));
  assert.throws(() => parseMenu([{ ...item(), revision: 0 }]));
  assert.throws(() => parseMenu([{ ...item(), updatedAt: '2026-02-30T00:00:00Z' }]));
  assert.throws(() => parseMenu(null));
});
