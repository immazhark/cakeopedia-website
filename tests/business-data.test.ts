import test from 'node:test';
import assert from 'node:assert/strict';
import { customCake, celebrationCake, flavours, addons, cupcakes, brownies, careSteps } from '../src/data/business.ts';
import { configs, recommend } from '../src/data/serving.ts';

test('prices: $135 custom starting, separate $75 celebration, cupcakes stay unpriced', () => {
  assert.equal(customCake.startingCents, 13500);
  assert.equal(celebrationCake.priceCents, 7500);
  assert.equal(cupcakes.priceCents, null);
  assert.equal(brownies.priceCents, 3500);
  assert.deepEqual(celebrationCake.servings, { min: 8, max: 10 });
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

test('catalogue snapshot: null means the seed; an invalid snapshot throws so the build fails instead of publishing junk', async () => {
  const { resolveCatalogue, defaultCatalogue } = await import('../src/data/catalogue.ts');
  assert.deepEqual(resolveCatalogue(null), defaultCatalogue);
  assert.throws(() => resolveCatalogue({ ...defaultCatalogue, celebrationCents: -5 }));
  assert.throws(() => resolveCatalogue({}));
  assert.equal(resolveCatalogue({ ...defaultCatalogue, celebrationCents: 8000 }).celebrationCents, 8000);
});

test('FAQ: prices come from the catalogue, only confirmed facts, no unapproved claims', async () => {
  const { buildFaq, faqText } = await import('../src/data/faq.ts');
  const { defaultCatalogue } = await import('../src/data/catalogue.ts');
  const text = faqText(buildFaq(defaultCatalogue));
  for (const must of ['9-inch $245', '10-inch $285', '6-inch $135', '$75', 'Two weeks', '50% advance', '48 hours', 'Zelle', '$35', '$40', '$10 per box or slab', 'up to three pictures']) assert.ok(text.includes(must), must);
  assert.doesNotMatch(text, /halal|allergen-free|gluten.free cakes? (are|is) available|delivery area|refund|guarantee|rated|reviews?\b/i);
  const changed = buildFaq({ ...defaultCatalogue, celebrationCents: 8000, baseCents: { ...defaultCatalogue.baseCents, '6': 14000 } });
  assert.match(faqText(changed), /\$80/); assert.match(faqText(changed), /6-inch \$140/); // follows an owner price change
  assert.equal(new Set(changed.map((i) => i.id)).size, changed.length);
});
test('robots: previews block everything; production allows search and AI retrieval, refuses training crawlers, hides private routes', async () => {
  const { robotsLines, trainingCrawlers } = await import('../src/data/crawlers.ts');
  assert.deepEqual(robotsLines(false, 'https://x.invalid'), ['User-agent: *', 'Disallow: /']);
  const prod = robotsLines(true, 'https://x.invalid').join('\n');
  for (const bot of trainingCrawlers) assert.match(prod, new RegExp(`User-agent: ${bot}\nDisallow: /\n`));
  assert.doesNotMatch(prod, /OAI-SearchBot|ChatGPT-User|Claude-SearchBot|Claude-User|PerplexityBot|Googlebot|bingbot/); // retrieval and search crawlers are not blocked
  assert.match(prod, /User-agent: \*\nAllow: \/\nDisallow: \/api\/\nDisallow: \/admin\//);
  assert.match(prod, /Sitemap: https:\/\/x\.invalid\/sitemap\.xml$/m);
});

test('flavour availability: old snapshots default to available; a paused flavour is kept; none available or a non-boolean flag is refused', async () => {
  const { defaultCatalogue, parseCatalogue } = await import('../src/data/catalogue.ts');
  const strip = (c: typeof defaultCatalogue) => ({ ...c, flavours: c.flavours.map(({ id, name, description }) => ({ id, name, description })) });
  const old = parseCatalogue(strip(defaultCatalogue)); // published before availability existed
  assert.ok(old.flavours.every((f) => f.available === true));
  const paused = parseCatalogue({ ...defaultCatalogue, flavours: defaultCatalogue.flavours.map((f, i) => (i === 0 ? { ...f, available: false } : f)) });
  assert.equal(paused.flavours[0]!.available, false); assert.equal(paused.flavours.length, defaultCatalogue.flavours.length);
  assert.throws(() => parseCatalogue({ ...defaultCatalogue, flavours: defaultCatalogue.flavours.map((f) => ({ ...f, available: false })) }));
  assert.throws(() => parseCatalogue({ ...defaultCatalogue, flavours: defaultCatalogue.flavours.map((f, i) => (i === 0 ? { ...f, available: 'no' } : f)) }));
});

test('Celebration flavour pausing: optional key, subset only, one must stay available, FAQ lists only available ones', async () => {
  const { defaultCatalogue, parseCatalogue } = await import('../src/data/catalogue.ts');
  const { buildFaq } = await import('../src/data/faq.ts');
  const { pausedCelebrationFlavours: _drop, ...old } = defaultCatalogue; // a snapshot published before pausing existed
  assert.deepEqual(parseCatalogue(old).pausedCelebrationFlavours, []);
  const first = defaultCatalogue.celebrationFlavours[0]!;
  const one = parseCatalogue({ ...defaultCatalogue, pausedCelebrationFlavours: [first] });
  assert.deepEqual(one.pausedCelebrationFlavours, [first]);
  const faq = buildFaq(one).find((q) => q.id === 'celebration')!.a;
  assert.ok(!faq.includes(first) && faq.includes(defaultCatalogue.celebrationFlavours[1]!));
  assert.throws(() => parseCatalogue({ ...defaultCatalogue, pausedCelebrationFlavours: ['Not a flavour'] }));
  assert.throws(() => parseCatalogue({ ...defaultCatalogue, pausedCelebrationFlavours: [...defaultCatalogue.celebrationFlavours] }));
  assert.throws(() => parseCatalogue({ ...defaultCatalogue, pausedCelebrationFlavours: [first, first] }));
});
