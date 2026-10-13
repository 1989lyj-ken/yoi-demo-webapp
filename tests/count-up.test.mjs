import test from 'node:test';
import assert from 'node:assert/strict';
import { durationFor, easeOutQuart, valueAt } from '../src/ui/count-up.ts';

test('count-up is fast early and slows near the target (100 steps: ~90 reached in the first 44 % of the time)', () => {
  assert.equal(valueAt(0, 100, 0), 0);
  assert.equal(valueAt(0, 100, 1), 100);
  assert.ok(valueAt(0, 100, 0.44) >= 88, 'first ~90 steps pass quickly');
  assert.ok(valueAt(0, 100, 0.8) >= 99, 'the last steps crawl');
  const early = valueAt(0, 100, 0.25) - valueAt(0, 100, 0.15);
  const late = valueAt(0, 100, 0.95) - valueAt(0, 100, 0.85);
  assert.ok(early > late * 5, 'speed drops markedly toward the end');
});

test('values never overshoot, never decrease, and clamp out-of-range time', () => {
  let previous = 120;
  for (let t = 0; t <= 1.2; t += 0.01) {
    const v = valueAt(120, 6000, t);
    assert.ok(v >= previous && v <= 6000);
    previous = v;
  }
  assert.equal(easeOutQuart(-1), 0);
  assert.equal(easeOutQuart(2), 1);
});

test('duration is 0.9 s minimum and 3 s maximum', () => {
  assert.equal(durationFor(0), 900);
  assert.ok(durationFor(100) >= 900 && durationFor(100) < 3000);
  assert.equal(durationFor(1_000_000), 3000);
});
