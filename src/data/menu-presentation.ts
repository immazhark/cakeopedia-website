/** Format integer minor units without floating-point financial arithmetic. */
export function formatMenuPrice(cents: number, kind: 'fixed' | 'starting'): string {
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 10_000_000 || (kind !== 'fixed' && kind !== 'starting')) throw Error('Invalid menu price');
  const dollars = Math.floor(cents / 100).toLocaleString('en-US');
  const remainder = cents % 100;
  const amount = `$${dollars}${remainder ? `.${String(remainder).padStart(2, '0')}` : ''}`;
  return kind === 'starting' ? `From ${amount}` : amount;
}
export function formatServingRange(min: number, max: number): string {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 1 || max < min || max > 10_000) throw Error('Invalid serving range');
  return min === max ? `Serves approximately ${min}` : `Serves approximately ${min}–${max}`;
}
