// Public editorial data only. Private order details never belong in this contract.
type ServingRange = { min: number; max: number };
type Size = { label: string; layers: number; servings: ServingRange; priceCents: number };
type Addon = { label: string; priceCents: number };
export type MenuItem = {
  id: string; title: string; category: string; status: 'draft' | 'published' | 'archived';
  availability: 'available' | 'unavailable'; revision: number; updatedAt: string;
  kind: 'standard' | 'custom'; sizes: Size[]; flavours: string[]; fillings: string[];
  addons: Addon[]; ingredientNote: string | null;
};
function invalid(): never { throw new Error('Invalid menu data'); }
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== keys.length || keys.some(k => !Object.hasOwn(data, k))) invalid();
  return data;
}
function text(value: unknown, max = 100): string {
  if (typeof value !== 'string' || value.length > max || !value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) invalid();
  return value.trim();
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) invalid();
  return value;
}
function choice<T extends string>(value: unknown, options: readonly T[]): T {
  if (typeof value !== 'string' || !options.includes(value as T)) invalid();
  return value as T;
}
function list<T>(value: unknown, max: number, parse: (entry: unknown) => T, min = 0): T[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) invalid();
  return Array.from(value, parse);
}
function unique<T>(entries: T[], key: (entry: T) => string): T[] {
  const seen = new Set<string>();
  for (const entry of entries) { const id = key(entry); if (seen.has(id)) invalid(); seen.add(id); }
  return entries;
}
function timestamp(value: unknown): string {
  const date = text(value, 24);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(date)) invalid();
  const time = new Date(date);
  if (!Number.isFinite(time.getTime()) || time.toISOString() !== (date.length === 20 ? date.slice(0, -1) + '.000Z' : date)) invalid();
  return time.toISOString();
}
function price(value: unknown): number { return integer(value, 0, 10_000_000); }
function size(value: unknown): Size {
  const s = record(value, ['label', 'layers', 'servings', 'priceCents']);
  const range = record(s.servings, ['min', 'max']);
  const min = integer(range.min, 1, 10000);
  return { label: text(s.label), layers: integer(s.layers, 1, 100), servings: { min, max: integer(range.max, min, 10000) }, priceCents: price(s.priceCents) };
}
function addon(value: unknown): Addon {
  const a = record(value, ['label', 'priceCents']);
  return { label: text(a.label), priceCents: price(a.priceCents) };
}
function parseItem(value: unknown): MenuItem {
  const d = record(value, ['id', 'title', 'category', 'status', 'availability', 'revision', 'updatedAt', 'kind', 'sizes', 'flavours', 'fillings', 'addons', 'ingredientNote']);
  const id = text(d.id, 80);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) invalid();
  const status = choice(d.status, ['draft', 'published', 'archived']);
  const names = (v: unknown) => unique(list(v, 100, entry => text(entry)), entry => entry.toLowerCase());
  return { id, title: text(d.title), category: text(d.category), status,
    availability: choice(d.availability, ['available', 'unavailable']), revision: integer(d.revision, 1, Number.MAX_SAFE_INTEGER), updatedAt: timestamp(d.updatedAt),
    kind: choice(d.kind, ['standard', 'custom']), sizes: unique(list(d.sizes, 100, size, status === 'published' ? 1 : 0), s => s.label.toLowerCase()),
    flavours: names(d.flavours), fillings: names(d.fillings), addons: unique(list(d.addons, 100, addon), a => a.label.toLowerCase()),
    ingredientNote: d.ingredientNote === null ? null : text(d.ingredientNote, 1000) };
}
export function parseMenu(value: unknown): MenuItem[] { return unique(list(value, 1000, parseItem), item => item.id); }
// This projection does not reserve dates or imply instant checkout. No fixtures are imported.
export function publicMenu(entries: readonly MenuItem[]) {
  return entries.filter(e => e.status === 'published' && e.availability === 'available')
    .map(({ id, title, category, kind, sizes, flavours, fillings, addons, ingredientNote }) => ({
      id, title, category, priceKind: kind === 'standard' ? 'fixed' as const : 'starting' as const,
      sizes, flavours, fillings, addons, ingredientNote,
    }));
}
