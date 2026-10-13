import test from 'node:test';
import assert from 'node:assert/strict';
import { addHours, assertScenarioNow, fromDatetimeLocal, nextDayAt9, nextMondayAt9, toDatetimeLocal } from '../src/admin/clock-time.ts';

test('scenario times must match the exact Asia/Taipei format and be real dates', () => {
  assert.equal(assertScenarioNow('2026-10-01T09:00:00+08:00'), '2026-10-01T09:00:00+08:00');
  for (const bad of ['2026-10-01T25:00:00+08:00', '2026-10-01T09:00:00.5+08:00', '2026-10-01T09:00:00Z', '2027-02-30T09:00:00+08:00', '2026-10-1T09:00:00+08:00']) {
    assert.throws(() => assertScenarioNow(bad), undefined, bad);
  }
});

test('quick steps cross day, month, year and leap boundaries in Taipei wall time', () => {
  assert.equal(addHours('2026-12-31T23:30:00+08:00', 1), '2027-01-01T00:30:00+08:00');
  assert.equal(nextDayAt9('2028-02-28T22:00:00+08:00'), '2028-02-29T09:00:00+08:00');
  assert.equal(nextDayAt9('2026-10-31T08:00:00+08:00'), '2026-11-01T09:00:00+08:00');
});

test('next Monday is always a later week, including from a Monday or a Sunday', () => {
  assert.equal(nextMondayAt9('2026-10-01T12:00:00+08:00'), '2026-10-05T09:00:00+08:00'); // Thursday
  assert.equal(nextMondayAt9('2026-10-05T08:00:00+08:00'), '2026-10-12T09:00:00+08:00'); // Monday
  assert.equal(nextMondayAt9('2026-10-04T23:59:59+08:00'), '2026-10-05T09:00:00+08:00'); // Sunday
  assert.equal(nextMondayAt9('2026-12-31T09:00:00+08:00'), '2027-01-04T09:00:00+08:00');
});

test('datetime-local values are read as Taipei wall time', () => {
  assert.equal(toDatetimeLocal('2026-10-01T09:05:30+08:00'), '2026-10-01T09:05');
  assert.equal(fromDatetimeLocal('2026-10-01T09:05'), '2026-10-01T09:05:00+08:00');
  assert.equal(fromDatetimeLocal('2026-10-01T09:05:30'), '2026-10-01T09:05:30+08:00');
  assert.throws(() => fromDatetimeLocal('2026-10-01'));
});
