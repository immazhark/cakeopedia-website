import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatMenuPrice, formatServingRange } from '../src/data/menu-presentation.ts';

test('integer prices retain cents, distinguish starting prices and use US dollars', () => {
  assert.equal(formatMenuPrice(123456, 'fixed'), '$1,234.56');
  assert.equal(formatMenuPrice(105, 'starting'), 'From $1.05');
  assert.equal(formatMenuPrice(100, 'fixed'), '$1');
  assert.equal(formatMenuPrice(0, 'fixed'), '$0');
});
test('invalid monetary values fail closed', () => {
  for (const cents of [-1, 0.5, NaN, Infinity, 10_000_001]) assert.throws(() => formatMenuPrice(cents, 'fixed'));
});
test('serving guidance preserves approximate ranges and exact endpoints', () => {
  assert.equal(formatServingRange(6, 8), 'Serves approximately 6–8');
  assert.equal(formatServingRange(6, 6), 'Serves approximately 6');
  for (const [min,max] of [[0,1],[3,2],[1,10001],[1.2,2]] as const) assert.throws(() => formatServingRange(min,max));
});
