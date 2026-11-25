// Owner-supplied serving estimates. Tiers are stacked cakes; layers are the sponge layers inside one tier.
export interface Config { id: string; kind: 'single' | 'two-tier' | 'three-tier'; tiersIn: readonly number[]; servings: number }
const single = (d: number, s: number): Config => ({ id: `single-${d}`, kind: 'single', tiersIn: [d], servings: s });
export const singleTierLayers = 4; // four-layer cakes, about 5–6 inches tall
export const configs: readonly Config[] = [
  single(6, 20), single(7, 25), single(8, 32), single(9, 38), single(10, 45),
  { id: 'two-6-4', kind: 'two-tier', tiersIn: [6, 4], servings: 28 },
  { id: 'two-7-5', kind: 'two-tier', tiersIn: [7, 5], servings: 38 },
  { id: 'two-8-6', kind: 'two-tier', tiersIn: [8, 6], servings: 50 },
  { id: 'three-8-6-4', kind: 'three-tier', tiersIn: [8, 6, 4], servings: 60 },
  { id: 'three-9-7-5', kind: 'three-tier', tiersIn: [9, 7, 5], servings: 75 },
  { id: 'three-10-8-6', kind: 'three-tier', tiersIn: [10, 8, 6], servings: 100 },
];
export const label = (c: Config) => c.tiersIn.map((d) => `${d} inch`).join(' + ') + (c.kind === 'single' ? ' round' : ` (${c.kind.replace('-', ' ')})`);

/** Smallest configuration that meets the guest count, plus larger alternatives of other kinds. `null` means: suggest a consultation. */
export function recommend(guests: number): { best: Config; alternatives: Config[] } | null {
  if (!Number.isInteger(guests) || guests < 1 || guests > 10_000) throw new RangeError('guests');
  const fits = [...configs].filter((c) => c.servings >= guests).sort((a, b) => a.servings - b.servings);
  const best = fits[0];
  if (!best) return null;
  const alternatives: Config[] = [];
  for (const c of fits.slice(1)) if (c.kind !== best.kind && !alternatives.some((a) => a.kind === c.kind)) alternatives.push(c);
  return { best, alternatives };
}
