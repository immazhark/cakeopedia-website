import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cupcakes, pending } from '../src/data/business.ts';
import { cupcakeOrderCents, cupcakePrice } from '../src/data/pricing.ts';
import { defaultCatalogue, parseCatalogue, resolveCatalogue } from '../src/data/catalogue.ts';
import { buildFaq, faqText } from '../src/data/faq.ts';

// Owner-supplied (sponsor, 27 Nov 2026): $80 per dozen, minimum one dozen, same flavour.
test('cupcakes: $80 per dozen in integer cents, minimum one dozen, same flavour', () => {
  assert.deepEqual([cupcakePrice.dozenCents, cupcakePrice.minimumDozens, cupcakePrice.sameFlavour], [8000, 1, true]);
  assert.equal(cupcakes.dozenCents, 8000); assert.equal(cupcakes.minimumDozens, 1);
  assert.equal(defaultCatalogue.cupcakeDozenCents, 8000);
});
test('cupcake order price: whole dozens only, minimum one, no surcharges', () => {
  assert.equal(cupcakeOrderCents(1), 8000); assert.equal(cupcakeOrderCents(3), 24000);
  for (const bad of [0, -1, 1.5, NaN, 1001]) assert.throws(() => cupcakeOrderCents(bad), RangeError);
});
test('catalogue: snapshots published before cupcakes existed parse to the confirmed price; the field is validated and always present', () => {
  const { cupcakeDozenCents: _drop, ...old } = defaultCatalogue;
  assert.equal(parseCatalogue(old).cupcakeDozenCents, 8000);
  assert.equal(resolveCatalogue(old).cupcakeDozenCents, 8000);
  assert.equal(parseCatalogue({ ...defaultCatalogue, cupcakeDozenCents: 8500 }).cupcakeDozenCents, 8500);
  for (const bad of [0, -1, 80.5, '8000', null]) assert.throws(() => parseCatalogue({ ...defaultCatalogue, cupcakeDozenCents: bad }), /Invalid catalogue/);
});
test('FAQ and menu show the dozen price from the catalogue, never $0 or "quoted"', () => {
  const text = faqText(buildFaq(defaultCatalogue));
  assert.match(text, /cupcakes? .*\$80 (per|a) dozen/i); assert.match(text, /minimum order is one dozen/i); assert.match(text, /same flavour/i);
  assert.match(faqText(buildFaq({ ...defaultCatalogue, cupcakeDozenCents: 8500 })), /\$85 per dozen/);
  assert.doesNotMatch(text, /\$0\b/);
  const menu = readFileSync(new URL('../src/pages/menu.astro', import.meta.url), 'utf8');
  assert.match(menu, /cat\.cupcakeDozenCents/); assert.doesNotMatch(menu, /Cupcake pricing and minimum quantities are quoted/);
});
test('the owner Prices editor has a cupcake money field', () => {
  assert.match(readFileSync(new URL('../src/pages/admin/index.astro', import.meta.url), 'utf8'), /cupcakeDozenCents/);
});
test('pending list no longer lists the resolved cupcake price', () => {
  assert.doesNotMatch(pending.join(' '), /Cupcake price and minimum/);
  assert.match(pending.join(' '), /caramel and chocolate ganache/i); // that part is still unanswered
});
