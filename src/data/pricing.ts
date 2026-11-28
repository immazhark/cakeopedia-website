// Owner-confirmed pricing and payment rules (26 Nov 2026). Integer USD cents. Indicative only: the
// owner-approved quotation is the price; nothing here collects payment or opens enquiries.
export const SIZES = [6, 7, 8, 9, 10] as const;
export type Size = (typeof SIZES)[number];
export const BASE_CENTS: Record<Size, number> = { 6: 13500, 7: 14500, 8: 17000, 9: 21000, 10: 25000 };
export const RASMALAI_SURCHARGE_CENTS: Record<Size, number> = { 6: 1500, 7: 2000, 8: 3000, 9: 3500, 10: 3500 };

export type Quote = { kind: 'starting'; cents: number } | { kind: 'quote-required'; reason: string };
const isSize = (d: unknown): d is Size => SIZES.includes(d as Size);

/** Single-tier starting price. Multi-tier Rasmalai is deliberately quote-only: never extrapolate or multiply. */
export function cakeStartingPrice(input: { tiers: readonly number[]; rasmalai: boolean }): Quote {
  const { tiers, rasmalai } = input;
  if (!Array.isArray(tiers) || tiers.length < 1 || tiers.length > 3 || !tiers.every(isSize)) throw new RangeError('tiers');
  if (tiers.length > 1) return { kind: 'quote-required', reason: 'Multi-tier cakes are quoted personally.' };
  return { kind: 'starting', cents: BASE_CENTS[tiers[0] as Size] + (rasmalai ? RASMALAI_SURCHARGE_CENTS[tiers[0] as Size] : 0) };
}

export const BROWNIE_TOPPING_CENTS = 1000; // once per box or slab, never per brownie or per topping
export const browniePrice = { boxCents: 3500, slabCents: 4000 } as const; // slab = Fudge Delight Brownie Slab
export const brownieToppings = ['Nutella', 'Lotus Biscoff', 'Chocolate ganache'] as const;
export const brownieSlabServings = { min: 9, max: 12 } as const;

/** One box or slab. Unusual quantities, bigger slabs or other topping combinations need owner review (not priced here). */
export function browniePriceCents(input: { format: 'box' | 'slab'; toppings: readonly string[] }): number {
  const { format, toppings } = input;
  if (format !== 'box' && format !== 'slab') throw new RangeError('format');
  if (!toppings.every((t) => (brownieToppings as readonly string[]).includes(t)) || new Set(toppings).size !== toppings.length) throw new RangeError('toppings');
  if (toppings.length > 1) throw new RangeError('topping combinations need owner review');
  return (format === 'box' ? browniePrice.boxCents : browniePrice.slabCents) + (toppings.length ? BROWNIE_TOPPING_CENTS : 0);
}

// Cupcakes (owner, 27 Nov 2026): $80 per dozen, minimum one dozen, all cupcakes in a dozen the same flavour; no topping or filling charges.
export const cupcakePrice = { dozenCents: 8000, minimumDozens: 1, sameFlavour: true } as const;
/** Whole dozens only (the minimum is one). Other quantities need owner review and are not priced here. */
export function cupcakeOrderCents(dozens: number, dozenCents: number = cupcakePrice.dozenCents): number {
  if (!Number.isSafeInteger(dozens) || dozens < cupcakePrice.minimumDozens || dozens > 1000) throw new RangeError('dozens');
  return dozens * dozenCents;
}

export const celebrationFlavours = ['Chocolate Truffle', 'Chocolate Buttercream', 'Classic Vanilla', 'Vanilla with Berries', 'Vanilla with Caramel', 'Vanilla with Lotus Biscoff'] as const;
export const celebrationShapes = ['Round', 'Heart'] as const;
export const celebrationServings = { min: 8, max: 10 } as const;
export const isCelebrationFlavour = (f: string) => (celebrationFlavours as readonly string[]).includes(f);

// ---- Payment terms: 50% advance, remainder due 48 h before pickup/delivery, America/Chicago. ----
export const TIME_ZONE = 'America/Chicago';
const HOUR = 3_600_000, DAY = 24 * HOUR;

export function splitPayment(totalCents: number): { depositCents: number; balanceCents: number } {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) throw new RangeError('total');
  const depositCents = Math.ceil(totalCents / 2); // odd cent goes to the deposit; the two always sum to the total
  return { depositCents, balanceCents: totalCents - depositCents };
}

const fmt = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
function wall(ms: number) {
  const p = Object.fromEntries(fmt.formatToParts(ms).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
}
/** Chicago wall-clock date (YYYY-MM-DD) + time (HH:MM) to a UTC instant. Spring-forward gaps resolve forward. */
export function chicagoToInstant(date: string, time = '00:00'): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date), t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!m || !t) throw new RangeError('date');
  const want = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +t[1]!, +t[2]!);
  if (new Date(want).toISOString().slice(0, 10) !== date) throw new RangeError('date');
  let guess = want;
  for (let i = 0; i < 3; i++) guess += want - wall(guess); // converges in two passes; offsets differ by at most one hour
  return guess;
}
export const chicagoDate = (ms: number) => new Date(wall(ms)).toISOString().slice(0, 10);

export interface PaymentPlan { depositCents: number; balanceCents: number; balanceDueAt: number; rush: boolean; ownerArrangementRequired: boolean }
/** Time omitted => start of the fulfilment day (earliest, so the customer is never told a later deadline). */
export function paymentPlan(input: { totalCents: number; fulfilDate: string; fulfilTime?: string | undefined; acceptedAt: number }): PaymentPlan {
  const balanceDueAt = chicagoToInstant(input.fulfilDate, input.fulfilTime) - 48 * HOUR;
  const rush = input.acceptedAt > balanceDueAt;
  // A rush order never gets an invented exception: the owner sets the arrangement.
  return { ...splitPayment(input.totalCents), balanceDueAt, rush, ownerArrangementRequired: rush };
}

/** How a deadline is shown to the owner: always Chicago time, whatever the viewer's device clock says. */
export const formatChicago = (ms: number) => new Date(ms).toLocaleString('en-US', { timeZone: TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' }).replace(/ /g, ' ');

/** Rescheduling must be requested at least seven calendar days (Chicago) before the original date; owner approval still required. */
export function canRequestReschedule(originalDate: string, requestedAt: number): boolean {
  const original = Date.parse(`${originalDate}T00:00:00Z`);
  if (!Number.isFinite(original)) throw new RangeError('date');
  return Date.parse(`${chicagoDate(requestedAt)}T00:00:00Z`) <= original - 7 * DAY;
}
