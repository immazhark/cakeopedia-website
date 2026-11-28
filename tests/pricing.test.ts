import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cakeStartingPrice, browniePriceCents, splitPayment, paymentPlan, canRequestReschedule, chicagoToInstant, isCelebrationFlavour, celebrationFlavours } from '../src/data/pricing.ts';
import { celebrationCake, cupcakes, brownies, paymentTerms, businessEmail, tagline, pending } from '../src/data/business.ts';

const price = (d: number, rasmalai: boolean) => (cakeStartingPrice({ tiers: [d], rasmalai }) as { cents: number }).cents;

test('single-tier base and Rasmalai starting prices for all five sizes', () => {
  assert.deepEqual([6, 7, 8, 9, 10].map((d) => price(d, false)), [13500, 14500, 17000, 21000, 25000]);
  assert.deepEqual([6, 7, 8, 9, 10].map((d) => price(d, true)), [15000, 16500, 20000, 24500, 28500]);
  assert.deepEqual([6, 7, 8, 9, 10].map((d) => price(d, true) - price(d, false)), [1500, 2000, 3000, 3500, 3500]);
});
test('multi-tier cakes (Rasmalai or not) are quote-required, never extrapolated; invalid sizes throw', () => {
  for (const tiers of [[8, 6], [10, 8, 6]]) for (const rasmalai of [true, false]) assert.equal(cakeStartingPrice({ tiers, rasmalai }).kind, 'quote-required');
  assert.throws(() => cakeStartingPrice({ tiers: [11], rasmalai: false })); assert.throws(() => cakeStartingPrice({ tiers: [], rasmalai: false }));
});
test('brownies: one $10 upgrade per box or slab, no per-topping or per-piece multiplication', () => {
  assert.equal(browniePriceCents({ format: 'box', toppings: [] }), 3500);
  assert.equal(browniePriceCents({ format: 'box', toppings: ['Nutella'] }), 4500);
  assert.equal(browniePriceCents({ format: 'slab', toppings: [] }), 4000);
  for (const t of ['Nutella', 'Lotus Biscoff', 'Chocolate ganache']) assert.equal(browniePriceCents({ format: 'slab', toppings: [t] }), 5000);
  assert.throws(() => browniePriceCents({ format: 'box', toppings: ['Nutella', 'Lotus Biscoff'] })); // owner review, not a multiplied charge
  assert.throws(() => browniePriceCents({ format: 'box', toppings: ['Sprinkles'] }));
  assert.deepEqual(brownies.slabServings, { min: 9, max: 12 });
});
test('cupcakes carry no topping or filling charge', () => {
  assert.ok(!/surcharge|topping.*cents|\$\d/i.test(JSON.stringify(cupcakes)));
});
test('Celebration Cake: six flavours only, $75, 6-inch two-layer, no fondant minimum', () => {
  assert.equal(celebrationFlavours.length, 6);
  assert.ok(isCelebrationFlavour('Classic Vanilla')); assert.ok(!isCelebrationFlavour('Rasmalai')); assert.ok(!isCelebrationFlavour('Nutella Nirvana'));
  assert.deepEqual([celebrationCake.priceCents, celebrationCake.diameterIn, celebrationCake.layers], [7500, 6, 2]);
  assert.deepEqual([...celebrationCake.shapes], ['Round', 'Heart']);
  assert.ok(celebrationCake.priceCents < 13500); // the $135 custom minimum is not applied
});
test('50% deposit and balance always sum to the quoted total', () => {
  assert.deepEqual(splitPayment(20000), { depositCents: 10000, balanceCents: 10000 });
  assert.deepEqual(splitPayment(24501), { depositCents: 12251, balanceCents: 12250 });
  assert.throws(() => splitPayment(-1)); assert.throws(() => splitPayment(10.5));
});
test('balance deadline is exactly 48 h before fulfilment in America/Chicago, across DST', () => {
  const plan = (date: string, time: string | undefined, acceptedAt: number) => paymentPlan({ totalCents: 20000, fulfilDate: date, fulfilTime: time, acceptedAt });
  const early = Date.parse('2026-01-01T00:00:00Z');
  assert.equal(new Date(plan('2026-12-12', '14:30', early).balanceDueAt).toISOString(), '2026-12-10T20:30:00.000Z'); // CST, UTC-6
  assert.equal(new Date(plan('2026-07-04', '12:00', early).balanceDueAt).toISOString(), '2026-07-02T17:00:00.000Z'); // CDT, UTC-5
  assert.equal(new Date(plan('2026-03-09', '10:00', early).balanceDueAt).toISOString(), '2026-03-07T15:00:00.000Z'); // 48 real hours across spring-forward
  assert.equal(new Date(plan('2026-12-12', undefined, early).balanceDueAt).toISOString(), '2026-12-10T06:00:00.000Z'); // no time: start of day
  assert.equal(chicagoToInstant('2026-03-08', '02:30'), chicagoToInstant('2026-03-08', '03:30')); // gap resolves forward
  assert.throws(() => plan('2026-02-30', '10:00', early));
});
test('rush orders accepted inside the 48 h window need owner-approved arrangements', () => {
  const due = Date.parse('2026-12-10T20:30:00Z');
  assert.equal(paymentPlan({ totalCents: 9000, fulfilDate: '2026-12-12', fulfilTime: '14:30', acceptedAt: due }).rush, false); // exactly at the deadline is not late
  const r = paymentPlan({ totalCents: 9000, fulfilDate: '2026-12-12', fulfilTime: '14:30', acceptedAt: due + 1 });
  assert.deepEqual([r.rush, r.ownerArrangementRequired, r.depositCents, r.balanceCents], [true, true, 4500, 4500]);
});
test('rescheduling needs seven calendar days (Chicago) before the original date', () => {
  assert.equal(canRequestReschedule('2026-12-12', Date.parse('2026-12-05T17:00:00Z')), true); // 7 days before: allowed
  assert.equal(canRequestReschedule('2026-12-12', Date.parse('2026-12-06T07:00:00Z')), false); // 6 days
  assert.equal(canRequestReschedule('2026-12-12', Date.parse('2026-12-06T05:59:00Z')), true); // still 5 Dec 23:59 in Chicago
  assert.equal(canRequestReschedule('2026-12-12', Date.parse('2026-12-12T12:00:00Z')), false);
});
test('frozen business facts are recorded and the superseded ones are gone', () => {
  assert.equal(businessEmail, 'contact@cakeopedia.com'); assert.equal(tagline, 'Custom baked goods');
  assert.match(paymentTerms.join(' '), /50%.*48 hours.*Zelle.*Two weeks/s);
  const stale = JSON.stringify([pending, celebrationCake]);
  assert.doesNotMatch(stale, /brownie prices|Deposit, balance|Baker display name|flavour surcharges|halal/i);
  for (const f of ['src/pages/menu.astro', 'src/data/business.ts']) assert.doesNotMatch(readFileSync(f, 'utf8'), /Halal baked goods|quoted with your enquiry\.<\/p>\s*<\/section>\s*<section aria-labelledby="ingredients"/);
});
