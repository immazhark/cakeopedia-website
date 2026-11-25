import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const hex = (name: string) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  assert.ok(m, `missing token --${name}`);
  return m[1]!.toLowerCase();
};
const lum = (h: string) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string) => {
  const hi = Math.max(lum(hex(a)), lum(hex(b))), lo = Math.min(lum(hex(a)), lum(hex(b)));
  return (hi + 0.05) / (lo + 0.05);
};

test('owner-approved base colours are exact', () => {
  const approved = { 'brand-sage': '#91ae8f', 'brand-butter': '#ffb64f', 'surface-cream': '#fff9f0', 'surface-beige': '#f3e5d5', 'ink-chocolate': '#665447', 'surface-white': '#ffffff' };
  for (const [k, v] of Object.entries(approved)) assert.equal(hex(k), v);
});

// [foreground, background, minimum ratio]: 4.5 normal text, 3 for large text / UI edges.
const pairs: [string, string, number][] = [
  ['ink-chocolate', 'surface-cream', 4.5], ['ink-chocolate', 'surface-beige', 4.5], ['ink-chocolate', 'surface-white', 4.5],
  ['ink-deep', 'surface-cream', 4.5], ['ink-deep', 'surface-beige', 4.5], ['ink-deep', 'brand-butter', 4.5], ['ink-deep', 'sage-tint', 4.5],
  ['surface-white', 'sage-deep', 4.5], ['surface-white', 'sage-deeper', 4.5], ['sage-deep', 'surface-cream', 4.5], ['sage-deep', 'surface-beige', 4.5],
  ['butter-deep', 'surface-cream', 4.5], ['butter-deep', 'surface-beige', 4.5],
  ['surface-beige', 'ink-deep', 4.5], ['surface-white', 'ink-deep', 4.5],
  ['disabled-ink', 'disabled-bg', 4.5], ['error', 'surface-cream', 4.5], ['success', 'surface-cream', 4.5],
  ['border-strong', 'surface-cream', 3], ['sage-deep', 'surface-cream', 3],
];
for (const [fg, bg, min] of pairs) test(`${fg} on ${bg} >= ${min}:1`, () => assert.ok(ratio(fg, bg) >= min, `${ratio(fg, bg).toFixed(2)}`));

test('documented unsafe pairings really are below 4.5:1 (guard against using them for body text)', () => {
  for (const [a, b] of [['surface-white', 'brand-sage'], ['ink-chocolate', 'brand-sage'], ['ink-chocolate', 'brand-butter']] as const) assert.ok(ratio(a, b) < 4.5);
});
