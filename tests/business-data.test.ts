import test from 'node:test';
import assert from 'node:assert/strict';
import { customCake, celebrationCake, flavours, addons, cupcakes, brownies, careSteps } from '../src/data/business.ts';
import { configs, recommend } from '../src/data/serving.ts';

test('prices: $135 custom starting, separate $75 celebration, unknowns stay null', () => {
  assert.equal(customCake.startingCents, 13500);
  assert.equal(celebrationCake.priceCents, 7500);
  assert.equal(cupcakes.priceCents, null);
  assert.equal(brownies.priceCents, null);
  assert.equal(celebrationCake.servings, null);
  assert.deepEqual(addons.map((a) => a.priceCents), [1500, 2000, 2000]);
  assert.ok(addons.every((a) => !a.appliesTo.includes('celebration')));
});
test('12 flavours with unique ids; Swiss meringue buttercream is spelled out', () => {
  assert.equal(flavours.length, 12);
  assert.equal(new Set(flavours.map((f) => f.id)).size, 12);
  assert.ok(!flavours.some((f) => /\bSMBC\b/.test(f.description)));
});
test('11 serving configurations match the owner guide', () => {
  assert.equal(configs.length, 11);
  assert.deepEqual(configs.map((c) => c.servings), [20, 25, 32, 38, 45, 28, 38, 50, 60, 75, 100]);
});
test('recommendation: smallest fit, alternatives of other kinds, consultation beyond 100', () => {
  assert.equal(recommend(1)!.best.id, 'single-6');
  assert.equal(recommend(20)!.best.id, 'single-6');
  assert.equal(recommend(21)!.best.id, 'single-7');
  assert.equal(recommend(26)!.best.id, 'two-6-4');
  const r = recommend(40)!;
  assert.equal(r.best.id, 'single-10');
  assert.deepEqual(r.alternatives.map((c) => c.kind), ['two-tier', 'three-tier']);
  assert.equal(recommend(100)!.best.id, 'three-10-8-6');
  assert.equal(recommend(101), null);
  assert.throws(() => recommend(0)); assert.throws(() => recommend(2.5)); assert.throws(() => recommend(NaN));
});
test('care: four-week freezing only; no invented durations or claims', () => {
  const all = JSON.stringify([careSteps, flavours, celebrationCake, cupcakes, brownies]);
  assert.match(all, /four weeks/);
  assert.doesNotMatch(all, /six.month|6.month|halal|allergen-free|room.temperature|shelf life/i);
});
