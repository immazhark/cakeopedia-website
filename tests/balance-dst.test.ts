import test from 'node:test';
import assert from 'node:assert/strict';
import { canRequestReschedule, chicagoDate, chicagoToInstant, formatChicago, paymentPlan } from '../src/data/pricing.ts';

// Balance is due 48 real hours before fulfilment (Chicago wall clock for the fulfilment, elapsed hours for the deadline).
// US transitions: 2026-11-01 02:00 CDT -> 01:00 CST (fall back), 2027-03-14 02:00 CST -> 03:00 CDT (spring forward).
const due = (date: string, time?: string) => paymentPlan({ totalCents: 20000, fulfilDate: date, fulfilTime: time, acceptedAt: 0 }).balanceDueAt;
const iso = (ms: number) => new Date(ms).toISOString();

test('fall back 2026-11-01: deadline is 48 elapsed hours, shown in Chicago time', () => {
  // Monday 00:00 CST: 48 h earlier is Saturday 01:00 CDT (the repeated hour makes the span one wall-clock hour longer).
  assert.equal(iso(due('2026-11-02', '00:00')), '2026-10-31T06:00:00.000Z');
  assert.equal(formatChicago(due('2026-11-02', '00:00')), 'Oct 31, 2026, 1:00 AM');
  assert.equal(iso(due('2026-11-01', '10:00')), '2026-10-30T16:00:00.000Z'); // transition day itself, after the change
  assert.equal(formatChicago(due('2026-11-01', '10:00')), 'Oct 30, 2026, 11:00 AM');
  assert.equal(iso(due('2026-11-03', '23:30')), '2026-11-02T05:30:00.000Z'); // late evening, deadline lands after the change
  assert.equal(formatChicago(due('2026-11-03', '23:30')), 'Nov 1, 2026, 11:30 PM');
  assert.equal(formatChicago(due('2026-11-02')), 'Oct 31, 2026, 1:00 AM'); // no time: start of day
});
test('fall back: the repeated hour resolves to its first occurrence (the earlier deadline), deterministically', () => {
  assert.equal(iso(chicagoToInstant('2026-11-01', '01:30')), '2026-11-01T06:30:00.000Z'); // 01:30 CDT, not 01:30 CST (07:30Z)
  assert.equal(iso(due('2026-11-01', '01:30')), '2026-10-30T06:30:00.000Z');
});
test('spring forward 2027-03-14: deadline is 48 elapsed hours, shown in Chicago time', () => {
  assert.equal(iso(due('2027-03-14', '00:00')), '2027-03-12T06:00:00.000Z');
  assert.equal(formatChicago(due('2027-03-14', '00:00')), 'Mar 12, 2027, 12:00 AM'); // midnight pickup
  assert.equal(iso(due('2027-03-15', '00:00')), '2027-03-13T05:00:00.000Z'); // midnight after the change: 23:00 CST the evening before
  assert.equal(formatChicago(due('2027-03-15', '00:00')), 'Mar 12, 2027, 11:00 PM');
  assert.equal(formatChicago(due('2027-03-16', '23:30')), 'Mar 14, 2027, 11:30 PM');
  assert.equal(formatChicago(due('2027-03-14', '23:00')), 'Mar 12, 2027, 10:00 PM');
  assert.equal(formatChicago(due('2027-03-14')), 'Mar 12, 2027, 12:00 AM');
});
test('spring forward: a pickup time that does not exist (02:30) moves forward to 03:30 CDT', () => {
  assert.equal(iso(chicagoToInstant('2027-03-14', '02:30')), '2027-03-14T08:30:00.000Z');
  assert.equal(formatChicago(due('2027-03-14', '02:30')), 'Mar 12, 2027, 2:30 AM');
});
test('rush boundary holds across transitions: exactly at the deadline is on time, one millisecond later is a rush', () => {
  for (const [date, time] of [['2026-11-02', '00:00'], ['2027-03-15', '00:00'], ['2026-11-03', '23:30'], ['2027-03-14', '23:00']] as const) {
    const d = due(date, time);
    assert.equal(paymentPlan({ totalCents: 9000, fulfilDate: date, fulfilTime: time, acceptedAt: d }).rush, false);
    assert.equal(paymentPlan({ totalCents: 9000, fulfilDate: date, fulfilTime: time, acceptedAt: d + 1 }).rush, true);
  }
});
test('Chicago dates and the seven-day rescheduling rule across transitions', () => {
  assert.equal(chicagoDate(Date.parse('2026-11-02T05:30:00Z')), '2026-11-01'); // 23:30 CST
  assert.equal(chicagoDate(Date.parse('2027-03-15T04:59:00Z')), '2027-03-14'); // 23:59 CDT
  assert.equal(canRequestReschedule('2026-11-08', Date.parse('2026-11-01T11:00:00Z')), true); // 6:00 CST on the 1st: exactly 7 days
  assert.equal(canRequestReschedule('2026-11-08', Date.parse('2026-11-02T06:00:00Z')), false); // 2nd Chicago: 6 days
  assert.equal(canRequestReschedule('2027-03-21', Date.parse('2027-03-14T12:00:00Z')), true);
  assert.equal(canRequestReschedule('2027-03-21', Date.parse('2027-03-15T05:00:00Z')), false); // 00:00 CDT on the 15th
});
