import { addons, flavours } from './business.ts';
import { BASE_CENTS, BROWNIE_TOPPING_CENTS, browniePrice, celebrationFlavours, RASMALAI_SURCHARGE_CENTS, SIZES } from './pricing.ts';

// The part of the catalogue the owner edits from her phone: prices, add-ons and flavour lists. Rules (how prices combine, payment
// terms) stay in pricing.ts. Unknown prices are absent, never zero. The default below is the owner-confirmed seed; a published
// snapshot from the owner CMS replaces it at build time (see scripts/pull-catalogue.mjs).
export interface Catalogue {
  baseCents: Record<string, number>; rasmalaiCents: Record<string, number>;
  celebrationCents: number; brownieBoxCents: number; brownieSlabCents: number; brownieToppingCents: number;
  addons: { id: string; name: string; priceCents: number; note?: string }[];
  flavours: { id: string; name: string; description: string; available: boolean }[]; // available=false: paused for now, still listed
  celebrationFlavours: string[];
  pausedCelebrationFlavours: string[]; // a subset of celebrationFlavours that is paused for now, still listed
}
export const defaultCatalogue: Catalogue = {
  baseCents: Object.fromEntries(SIZES.map((d) => [String(d), BASE_CENTS[d]])), rasmalaiCents: Object.fromEntries(SIZES.map((d) => [String(d), RASMALAI_SURCHARGE_CENTS[d]])),
  celebrationCents: 7500, brownieBoxCents: browniePrice.boxCents, brownieSlabCents: browniePrice.slabCents, brownieToppingCents: BROWNIE_TOPPING_CENTS,
  addons: addons.map(({ id, name, priceCents, note }) => ({ id, name, priceCents, ...(note ? { note } : {}) })),
  flavours: flavours.map(({ id, name, description }) => ({ id, name, description, available: true })),
  celebrationFlavours: [...celebrationFlavours], pausedCelebrationFlavours: [],
};

const bad = (): never => { throw new Error('Invalid catalogue'); };
const obj = (v: unknown, keys: string[]): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== keys.length || keys.some((k) => !Object.hasOwn(v, k))) return bad();
  return v as Record<string, unknown>;
};
const cents = (v: unknown, min = 1): number => (typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= 1_000_000 ? v : bad());
const str = (v: unknown, max: number): string => (typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/u.test(v) ? v.trim() : bad());
const bySize = (v: unknown, min: number): Record<string, number> => {
  const o = obj(v, SIZES.map(String));
  return Object.fromEntries(SIZES.map((d) => [String(d), cents(o[String(d)], min)]));
};
const rows = <T>(v: unknown, max: number, one: (x: unknown) => T, id: (x: T) => string): T[] => {
  if (!Array.isArray(v) || v.length > max) return bad();
  const out = v.map(one);
  if (new Set(out.map((x) => id(x).toLowerCase())).size !== out.length) bad();
  return out;
};
/** Strict parse: rejects unknown keys, non-integer or non-positive prices, duplicates and control characters. */
export function parseCatalogue(value: unknown): Catalogue {
  const hasPaused = !!value && typeof value === 'object' && Object.hasOwn(value, 'pausedCelebrationFlavours'); // snapshots published before pausing existed have no such key
  const d = obj(value, ['baseCents', 'rasmalaiCents', 'celebrationCents', 'brownieBoxCents', 'brownieSlabCents', 'brownieToppingCents', 'addons', 'flavours', 'celebrationFlavours', ...(hasPaused ? ['pausedCelebrationFlavours'] : [])]);
  const c: Catalogue = {
    baseCents: bySize(d.baseCents, 1), rasmalaiCents: bySize(d.rasmalaiCents, 0),
    celebrationCents: cents(d.celebrationCents), brownieBoxCents: cents(d.brownieBoxCents), brownieSlabCents: cents(d.brownieSlabCents), brownieToppingCents: cents(d.brownieToppingCents, 0),
    addons: rows(d.addons, 50, (x) => { const a = obj(x, x && typeof x === 'object' && Object.hasOwn(x, 'note') ? ['id', 'name', 'priceCents', 'note'] : ['id', 'name', 'priceCents']); return { id: str(a.id, 60), name: str(a.name, 100), priceCents: cents(a.priceCents), ...(Object.hasOwn(a, 'note') ? { note: str(a.note, 200) } : {}) }; }, (a) => a.id),
    flavours: rows(d.flavours, 60, (x) => { const f = obj(x, x && typeof x === 'object' && Object.hasOwn(x, 'available') ? ['id', 'name', 'description', 'available'] : ['id', 'name', 'description']); // snapshots published before availability existed have no flag: available
      if (f.available !== undefined && typeof f.available !== 'boolean') bad();
      return { id: str(f.id, 60), name: str(f.name, 100), description: str(f.description, 400), available: f.available !== false }; }, (f) => f.id),
    celebrationFlavours: rows(d.celebrationFlavours, 20, (x) => str(x, 80), (f) => f),
    pausedCelebrationFlavours: hasPaused ? rows(d.pausedCelebrationFlavours, 20, (x) => str(x, 80), (f) => f) : [],
  };
  if (c.pausedCelebrationFlavours.some((p) => !c.celebrationFlavours.includes(p)) || c.pausedCelebrationFlavours.length >= c.celebrationFlavours.length) bad(); // only listed flavours can be paused, and one must stay available
  if (c.flavours.length === 0 || !c.flavours.some((f) => f.available) || c.celebrationFlavours.length === 0) bad(); // at least one flavour must stay available
  return c;
}
/** `approved` is the published snapshot (or null before the owner has published): it fully replaces the seed, never merges with it. */
export const resolveCatalogue = (approved: unknown): Catalogue => (approved === null || approved === undefined ? defaultCatalogue : parseCatalogue(approved));
