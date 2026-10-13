import test from 'node:test';
import assert from 'node:assert/strict';
import { claimYesterdayPrompt, yesterdayPromptKey } from '../src/daily/yesterday-prompt.ts';
import { claimablePoints, dailyStateDominates, DailyFormatError, parseDaily, previousTaskDate } from '../src/daily/daily-state.ts';

const base = {
  sessionId: 'demo-1', memberId: 'YOI-M01', taskDate: '2026-09-30', clockVersion: 1,
  rawSteps: 4000, effectiveSteps: 4000, rideCompletedAt: null, claimed: 2, eventSeq: 5,
};
const stored = (overrides = {}) => ({ ...base, lastSyncedAt: { seconds: 1, nanoseconds: 0 }, ...overrides });
const expected = { sessionId: 'demo-1', memberId: 'YOI-M01', taskDate: '2026-09-30' };
const RIDE = '2026-09-30T12:00:00+08:00';

test('confirmed ride state dominates an older no-ride snapshot with equal steps and claims', () => {
  const ride = { ...base, effectiveSteps: 6000, rideCompletedAt: RIDE, eventSeq: 6 };
  assert.equal(dailyStateDominates(ride, base), true);
  assert.equal(dailyStateDominates(base, ride), false);
});

test('state reconciliation rejects lower steps, effective steps, claims or event sequence', () => {
  const confirmed = { ...base, effectiveSteps: 6000, rideCompletedAt: RIDE, eventSeq: 6 };
  assert.equal(dailyStateDominates({ ...confirmed, rawSteps: 3999 }, confirmed), false);
  assert.equal(dailyStateDominates({ ...confirmed, effectiveSteps: 5999 }, confirmed), false);
  assert.equal(dailyStateDominates({ ...confirmed, claimed: 1 }, confirmed), false);
  assert.equal(dailyStateDominates({ ...confirmed, eventSeq: 5 }, confirmed), false);
});

test('a document written under an older clock still dominates the empty placeholder of a newer page', () => {
  const empty = { ...base, clockVersion: 9, rawSteps: 0, effectiveSteps: 0, claimed: 0, eventSeq: 0 };
  assert.equal(dailyStateDominates({ ...base, clockVersion: 8 }, empty), true);
});

test('a ride event timestamp cannot be replaced after it has been confirmed', () => {
  const confirmed = { ...base, effectiveSteps: 6000, rideCompletedAt: RIDE };
  assert.equal(dailyStateDominates({ ...confirmed, rideCompletedAt: '2026-09-30T13:00:00+08:00' }, confirmed), false);
});

test('previousTaskDate crosses month, year and leap days in UTC', () => {
  assert.equal(previousTaskDate('2026-10-01'), '2026-09-30');
  assert.equal(previousTaskDate('2027-01-01'), '2026-12-31');
  assert.equal(previousTaskDate('2028-03-01'), '2028-02-29');
  assert.equal(previousTaskDate('2026-03-01'), '2026-02-28');
  assert.equal(previousTaskDate('2026-10-09'), '2026-10-08');
  assert.throws(() => previousTaskDate('2026-02-30'));
  assert.throws(() => previousTaskDate('2026-9-30'));
});

test('parseDaily accepts the canonical shape, including a pending null lastSyncedAt', () => {
  assert.deepEqual(parseDaily(stored(), expected), base);
  assert.deepEqual(parseDaily(stored({ lastSyncedAt: null }), expected), base);
  assert.equal(parseDaily(stored({ rawSteps: 2001, effectiveSteps: 3001, rideCompletedAt: RIDE, claimed: 1 }), expected).effectiveSteps, 3001);
});

test('parseDaily refuses FSD-01A/01B shapes and inconsistent values', () => {
  const legacy7 = { sessionId: 'demo-1', memberId: 'YOI-M01', taskDate: '2026-09-30', clockVersion: 1, rawSteps: 4000, claimedMilestones: [1], points: 1 };
  const legacy10 = { ...legacy7, effectiveSteps: 4000, rideCompleted: false, rideCompletedAt: null };
  assert.throws(() => parseDaily(legacy7, expected), DailyFormatError);
  assert.throws(() => parseDaily(legacy10, expected), DailyFormatError);
  assert.throws(() => parseDaily(stored({ effectiveSteps: 4001 }), expected), DailyFormatError);
  assert.throws(() => parseDaily(stored({ claimed: 3 }), expected), DailyFormatError);
  assert.throws(() => parseDaily(stored({ rideCompletedAt: '2026-09-29T12:00:00+08:00', effectiveSteps: 6000 }), expected), DailyFormatError);
  assert.throws(() => parseDaily(stored({ memberId: 'YOI-M02' }), expected), DailyFormatError);
  assert.throws(() => parseDaily(stored({ eventSeq: 1.5 }), expected), DailyFormatError);
});

test('claimablePoints counts unlocked but unclaimed points', () => {
  assert.equal(claimablePoints({ ...base, effectiveSteps: 6000, claimed: 1 }), 2);
  assert.equal(claimablePoints({ ...base, effectiveSteps: 1999, claimed: 0 }), 0);
  assert.equal(claimablePoints({ ...base, effectiveSteps: 9000, claimed: 3 }), 0);
});

const memoryStorage = () => { const map = new Map(); return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); }, map }; };

test('yesterday prompt shows once per device and key, only when points are claimable (P28)', () => {
  const key = yesterdayPromptKey('s9', 'YOI-M01', '2026-09-30');
  assert.equal(key, 'yoi:yesterday-prompt:s9:YOI-M01:2026-09-30');
  const storage = memoryStorage();
  assert.equal(claimYesterdayPrompt(storage, key, 0), false);
  assert.equal(storage.map.size, 0);
  assert.equal(claimYesterdayPrompt(storage, key, 2), true);
  assert.equal(storage.map.get(key), 'shown');
  assert.equal(claimYesterdayPrompt(storage, key, 2), false);
  assert.equal(claimYesterdayPrompt(storage, yesterdayPromptKey('s9', 'YOI-M01', '2026-10-01'), 1), true);
  assert.equal(claimYesterdayPrompt(storage, yesterdayPromptKey('s10', 'YOI-M01', '2026-09-30'), 1), true);
});

test('yesterday prompt still shows when storage is missing or throws', () => {
  const key = yesterdayPromptKey('s9', 'YOI-M01', '2026-09-30');
  assert.equal(claimYesterdayPrompt(null, key, 1), true);
  const throwingRead = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(claimYesterdayPrompt(throwingRead, key, 1), true);
  assert.equal(claimYesterdayPrompt(throwingRead, key, 1), true);
  const throwingWrite = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.equal(claimYesterdayPrompt(throwingWrite, key, 1), true);
  assert.equal(claimYesterdayPrompt(throwingRead, key, 0), false);
});
