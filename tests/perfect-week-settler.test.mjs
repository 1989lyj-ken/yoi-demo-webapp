import test from 'node:test';
import assert from 'node:assert/strict';
import { CouponSettler } from '../src/weekly/perfect-week-settler.ts';
import { weekDays } from '../src/weekly/perfect-week-state.ts';

const W = '2026-09-28';
const day = (taskDate, effectiveSteps = 6000, claimed = 0, eventSeq = 3) => ({ taskDate, effectiveSteps, claimed, eventSeq });
const perfect = (seq = 3) => weekDays(W).map((d) => day(d, 6000, 0, seq));            // FSD-04B: no points needed
const inputs = (o = {}) => ({ weekId: W, docs: perfect(), hasCoupon: false, confirmed: true, today: '2026-10-06', ...o });

/** A scripted port: results are taken in order per method; every call is recorded. */
function fakePort(script = {}) {
  const calls = [];
  const take = (name, fallback) => (script[name]?.length ? script[name].shift() : fallback);
  return {
    calls,
    issue: async () => { calls.push('issue'); const r = take('issue', 'issued'); return typeof r === 'function' ? r() : r; },
    couponExists: async () => { calls.push('exists'); return take('couponExists', false); },
    readDays: async () => { calls.push('readDays'); const r = take('readDays', perfect()); if (r instanceof Error) throw r; return r; },
  };
}

test('coupon settler: issues for an eligible week (also the previous week on a Tuesday) and not without confirmation', async () => {
  const port = fakePort();
  const s = new CouponSettler(port, () => undefined);
  s.offer(inputs({ confirmed: false }));
  await s.idle();
  assert.deepEqual(port.calls, []);
  s.offer(inputs());                                   // today is Tuesday 10-06: last week is still settled (Q1-A)
  await s.idle();
  assert.deepEqual(port.calls, ['issue']);
  s.offer(inputs({ hasCoupon: true }));
  await s.idle();
  assert.deepEqual(port.calls, ['issue']);
});

test('coupon settler: not eligible (a missing day, a short Sunday, an unconfirmed day) never issues', async () => {
  const port = fakePort();
  const s = new CouponSettler(port, () => undefined);
  const gap = perfect(); gap[2] = null;
  const shortSunday = perfect(); shortSunday[6] = day('2026-10-04', 5999, 3);
  const unknown = perfect(); unknown[0] = undefined;
  for (const docs of [gap, shortSunday, unknown]) { s.offer(inputs({ docs })); await s.idle(); }
  assert.deepEqual(port.calls, []);
});

// FSD-04B: Sunday's third point no longer matters; seven achieved days issue the coupon.
test('coupon settler: seven achieved days with Sunday unclaimed issue the coupon', async () => {
  const port = fakePort();
  const s = new CouponSettler(port, () => undefined);
  const unclaimed = perfect(); unclaimed[6] = day('2026-10-04', 6000, 0);
  s.offer(inputs({ docs: unclaimed }));
  await s.idle();
  assert.deepEqual(port.calls, ['issue']);
});

test('coupon settler: a refusal first checks the coupon (two devices at once) and then counts as issued', async () => {
  const port = fakePort({ issue: ['refused'], couponExists: [true] });
  const s = new CouponSettler(port, () => undefined);
  s.offer(inputs());
  await s.idle();
  assert.deepEqual(port.calls, ['issue', 'exists']);
  assert.deepEqual([s.pending, s.blocked], [false, false]);
});

test('coupon settler: refused and absent rereads the days and retries once; still refused it is final until an eventSeq changes', async () => {
  const port = fakePort({ issue: ['refused', 'refused', 'refused'], couponExists: [false, false] });
  const s = new CouponSettler(port, () => undefined);
  s.offer(inputs());
  await s.idle();
  assert.deepEqual(port.calls, ['issue', 'exists', 'readDays', 'issue', 'exists']);
  assert.equal(s.blocked, true);
  s.offer(inputs());                                   // same data: not tried again on this page
  await s.idle();
  assert.equal(port.calls.length, 5);
  s.offer(inputs({ docs: perfect(4) }));              // a later legal sync changed the eventSeqs: tried again
  await s.idle();
  assert.deepEqual(port.calls.slice(5), ['issue', 'exists', 'readDays', 'issue']); // refused, reread, retried and issued
  assert.equal(s.blocked, false);
});

test('coupon settler: network failures mark pending and never rerun by themselves; stale leaves everything to the reload overlay', async () => {
  const changes = [];
  const port = fakePort({ issue: ['unconfirmed', 'stale'] });
  const s = new CouponSettler(port, () => changes.push([s.issuing, s.pending]));
  s.offer(inputs());
  await s.idle();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(port.calls, ['issue']);
  assert.equal(s.pending, true);
  s.offer(inputs());
  await s.idle();
  assert.deepEqual(port.calls, ['issue', 'issue']);
  assert.deepEqual(changes.at(-1), [true, true]);       // no notification after "stale"; no refusal, no final key
  assert.equal(s.blocked, false);
});

test('coupon settler: an identity change stops further attempts on this page and is not pending', async () => {
  const port = fakePort({ issue: ['identity'] });
  const s = new CouponSettler(port, () => undefined);
  s.offer(inputs());
  await s.idle();
  s.offer(inputs({ docs: perfect(5) }));
  await s.idle();
  assert.deepEqual(port.calls, ['issue']);
  assert.deepEqual([s.identityChanged, s.pending], [true, false]);
});

test('coupon settler: a snapshot during a run triggers one more run; cancel stops writes and notifications', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const port = fakePort({ issue: [() => gate.then(() => 'unconfirmed'), 'issued'] });
  const s = new CouponSettler(port, () => undefined);
  s.offer(inputs());
  await new Promise((resolve) => setTimeout(resolve, 0));
  s.offer(inputs());
  s.offer(inputs());
  release();
  await s.idle();
  assert.deepEqual(port.calls, ['issue', 'issue']);
  const port2 = fakePort({ issue: [() => new Promise((resolve) => setTimeout(() => resolve('refused'), 5))] });
  let changes = 0;
  const s2 = new CouponSettler(port2, () => { changes += 1; });
  s2.offer(inputs());
  await new Promise((resolve) => setTimeout(resolve, 0));
  const before = changes;
  s2.cancel();
  await s2.idle();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(port2.calls, ['issue']);            // no coupon check or retry after cancel
  assert.equal(changes, before);
});
