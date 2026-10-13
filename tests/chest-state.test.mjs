// FSD-06A: chest draw, opening format, chest weeks, balance and the points record.
import test from 'node:test';
import assert from 'node:assert/strict';
import { balance, chestWeeks, drawChest, legalChest, ledgerRows, parseChestOpen, unopenedChests } from '../src/rewards/chest-state.ts';
import { chestOverlayView, rewardsView } from '../src/ui/views.ts';

const seq = (...values) => { let i = 0; return () => values[i++]; };

test('drawChest: tier edges at 0.7 / 0.9 / 0.99 and equal chances inside a tier', () => {
  assert.deepEqual(drawChest(seq(0, 0)), { tier: 'basic', points: 1 });
  assert.deepEqual(drawChest(seq(0.6999, 0.5)), { tier: 'basic', points: 2 });
  assert.deepEqual(drawChest(seq(0.5, 0.9999)), { tier: 'basic', points: 3 });
  assert.deepEqual(drawChest(seq(0.7)), { tier: 'small', points: 5 });
  assert.deepEqual(drawChest(seq(0.8999)), { tier: 'small', points: 5 });
  assert.deepEqual(drawChest(seq(0.9, 0)), { tier: 'big', points: 10 });
  assert.deepEqual(drawChest(seq(0.9899, 0.9999)), { tier: 'big', points: 20 });
  assert.deepEqual(drawChest(seq(0.95, 0.5)), { tier: 'big', points: 15 });
  assert.deepEqual(drawChest(seq(0.99)), { tier: 'super', points: 50 });
  assert.deepEqual(drawChest(seq(0.999999)), { tier: 'super', points: 50 });
  // A generator returning exactly 1 would be out of contract; the pick still stays in range.
  assert.deepEqual(drawChest(seq(0.1, 1)), { tier: 'basic', points: 3 });
});

test('drawChest: 100,000 draws match the PRD odds and every result is legal', () => {
  // mulberry32: a small, well-mixed deterministic generator (reproducible runs).
  let state = 12345;
  const lcg = () => { state = (state + 0x6D2B79F5) | 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const tiers = { basic: 0, small: 0, big: 0, super: 0 };
  const basic = new Map();
  const big = new Map();
  const n = 100000;
  for (let i = 0; i < n; i += 1) {
    const d = drawChest(lcg);
    assert.ok(legalChest(d.tier, d.points), JSON.stringify(d));
    tiers[d.tier] += 1;
    if (d.tier === 'basic') basic.set(d.points, (basic.get(d.points) ?? 0) + 1);
    if (d.tier === 'big') big.set(d.points, (big.get(d.points) ?? 0) + 1);
  }
  const near = (count, p, tol) => Math.abs(count / n - p) < tol;
  assert.ok(near(tiers.basic, 0.7, 0.01) && near(tiers.small, 0.2, 0.01) && near(tiers.big, 0.09, 0.006) && near(tiers.super, 0.01, 0.003), JSON.stringify(tiers));
  assert.deepEqual([...basic.keys()].sort(), [1, 2, 3]);
  assert.deepEqual([...big.keys()].sort((a, b) => a - b), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  for (const c of basic.values()) assert.ok(Math.abs(c / tiers.basic - 1 / 3) < 0.02);
  for (const c of big.values()) assert.ok(Math.abs(c / tiers.big - 1 / 11) < 0.02);
});

test('legalChest mirrors the Rules', () => {
  for (const [t, p] of [['basic', 1], ['basic', 3], ['small', 5], ['big', 10], ['big', 20], ['super', 50]]) assert.equal(legalChest(t, p), true, `${t} ${p}`);
  for (const [t, p] of [['basic', 0], ['basic', 4], ['small', 4], ['big', 9], ['big', 21], ['super', 49], ['basic', 1.5], ['basic', '2'], ['mega', 50], [undefined, 5]]) {
    assert.equal(legalChest(t, p), false, `${t} ${p}`);
  }
});

const open = (o = {}) => ({ sessionId: 's6', memberId: 'YOI-M01', weekId: '2026-10-05', tier: 'small', points: 5,
  openedAt: '2026-10-07T09:00:00+08:00', clockVersion: 6, recordedAt: { seconds: 1, nanoseconds: 0 }, ...o });

test('parseChestOpen: exact fields, own path, legal prize; anything else fails closed', () => {
  assert.deepEqual(parseChestOpen(open(), 's6', 'YOI-M01', '2026-10-05'), { weekId: '2026-10-05', tier: 'small', points: 5, openedAt: '2026-10-07T09:00:00+08:00' });
  const bad = [open({ points: 6 }), open({ tier: 'mega' }), open({ sessionId: 's5' }), open({ memberId: 'YOI-M02' }), open({ weekId: '2026-10-12' }),
    open({ openedAt: '2026-10-07' }), { ...open(), extra: 1 }, null, 'x'];
  const missing = open(); delete missing.clockVersion; bad.push(missing);
  for (const b of bad) assert.throws(() => parseChestOpen(b, 's6', 'YOI-M01', '2026-10-05'), { name: 'ChestFormatError' }, JSON.stringify(b));
});

test('chestWeeks: from the week of the earliest own daily document to this week; none without documents', () => {
  assert.deepEqual(chestWeeks([], '2026-10-07'), []);
  assert.deepEqual(chestWeeks(['2026-10-07', '2026-10-05'], '2026-10-07'), ['2026-10-05']);
  assert.deepEqual(chestWeeks(['2026-10-20', '2026-09-30'], '2026-10-20'), ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']);
  assert.deepEqual(chestWeeks(['2026-12-30'], '2027-01-05'), ['2026-12-28', '2027-01-04']);
  // A far-future clock keeps only the newest 60 weeks (this week included).
  const far = chestWeeks(['2026-01-05'], '2030-01-07');
  assert.equal(far.length, 60);
  assert.equal(far[59], '2030-01-07');
  assert.equal(far[0], '2028-11-20');
});

test('balance and ledgerRows: claimed points plus opened chests, newest first, zero days skipped', () => {
  const days = [{ taskDate: '2026-10-05', claimed: 3 }, { taskDate: '2026-10-06', claimed: 0 }, { taskDate: '2026-10-07', claimed: 2 }];
  const opens = [{ weekId: '2026-10-05', tier: 'big', points: 12, openedAt: '2026-10-07T10:00:00+08:00' }];
  assert.equal(balance(days, opens), 17);
  assert.equal(balance([], []), 0);
  const rows = ledgerRows(days, opens);
  assert.deepEqual(rows.map((r) => [r.kind, r.date, r.points]), [['chest', '2026-10-07', 12], ['daily', '2026-10-07', 2], ['daily', '2026-10-05', 3]]);
  assert.equal(rows[0].label, '2026-10-05 週團隊寶箱・大獎');
  assert.equal(rows[1].label, '2026-10-07 每日任務');
});

test('unopenedChests: only confirmed chests that are not opened; an unreadable chest is never offered', () => {
  const awards = new Map([['2026-10-12', true], ['2026-10-05', true], ['2026-09-28', false], ['2026-09-21', null]]);
  assert.deepEqual(unopenedChests(awards, []), ['2026-10-05', '2026-10-12']);
  assert.deepEqual(unopenedChests(awards, [{ weekId: '2026-10-05', tier: 'small', points: 5, openedAt: '2026-10-07T09:00:00+08:00' }]), ['2026-10-12']);
  // Opened already but the chest itself is not readable right now: still not offered.
  assert.deepEqual(unopenedChests(new Map([['2026-10-05', null]]), [{ weekId: '2026-10-05', tier: 'small', points: 5, openedAt: '2026-10-07T09:00:00+08:00' }]), []);
});

test('views: unconfirmed shows a dash; chests and records render; overlay never shows points before confirmation', () => {
  const syncing = rewardsView({ balance: null, chests: null, rows: null, canOpen: true });
  assert.match(syncing, /已獲得點數<\/span><b>—<\/b>/);
  assert.match(syncing, /寶箱同步中/);
  const html = rewardsView({ balance: 17, chests: ['2026-10-05'], rows: [{ label: '2026-10-07 每日任務', date: '2026-10-07', points: 2, at: null }], canOpen: false });
  assert.match(html, /17/);
  assert.match(html, /data-open-chest="2026-10-05" disabled/);
  assert.match(html, /2026-10-07 每日任務/);
  assert.match(html, /\+2 點/);
  assert.match(rewardsView({ balance: 0, chests: [], rows: [], canOpen: true }), /目前沒有未開的寶箱/);
  const opening = chestOverlayView({ kind: 'opening', skipped: false });
  assert.match(opening, /寶箱開啟中/);
  assert.match(opening, /id="chest-skip"/);
  const skipped = chestOverlayView({ kind: 'opening', skipped: true });
  assert.match(skipped, /確認中/);
  assert.doesNotMatch(skipped, /Points|點/);
  assert.match(chestOverlayView({ kind: 'result', points: 12, tier: '大獎' }), /您抽中了 12 和泰 Points/);
  assert.match(chestOverlayView({ kind: 'failed', message: '開箱未完成，請再試一次。' }), /開箱未完成，請再試一次/);
});
