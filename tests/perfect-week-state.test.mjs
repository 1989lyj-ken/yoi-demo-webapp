import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canUse, couponActive, CouponFormatError, dayStatus, finalKey, parseCoupon, plusDays, previousWeek, promptKey, promptPlan,
  settledWeeks, weekDays, weekVerdict,
} from '../src/weekly/perfect-week-state.ts';
import { couponPromptView, couponsView, perfectWeekView } from '../src/ui/views.ts';

const W = '2026-09-28';                       // Monday 09-28 .. Sunday 10-04 (crosses a month)
const day = (taskDate, effectiveSteps = 6000, claimed = 0, eventSeq = 3) => ({ taskDate, effectiveSteps, claimed, eventSeq });
const perfect = () => weekDays(W).map((d, i) => day(d, 6000, i === 6 ? 3 : 0));
const coupon = (o = {}) => ({ sessionId: 's9', memberId: 'YOI-M01', weekId: W, faceValue: 50, minFare: 150, issuedAt: '2026-10-04T12:00:00+08:00',
  expiresAt: '2026-11-03T12:00:00+08:00', clockVersion: 4, kind: 'weeklyPerfect', ...o });

test('plusDays moves only the date (UTC calendar) and keeps the time and +08:00', () => {
  assert.equal(plusDays('2026-12-02T23:30:00+08:00', 30), '2027-01-01T23:30:00+08:00');
  assert.equal(plusDays('2028-01-30T00:00:00+08:00', 30), '2028-02-29T00:00:00+08:00');
  assert.equal(plusDays('2027-01-30T23:59:59+08:00', 30), '2027-03-01T23:59:59+08:00');
  assert.equal(plusDays('2026-01-31T12:00:00+08:00', 30), '2026-03-02T12:00:00+08:00');
  assert.equal(plusDays('2026-10-05', -7), '2026-09-28');
  assert.throws(() => plusDays('2026-9-28', 1));
});

test('weekDays, previousWeek and settledWeeks', () => {
  assert.deepEqual(weekDays(W), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  assert.equal(weekDays('2028-02-28')[1], '2028-02-29');
  assert.equal(previousWeek('2027-01-04'), '2026-12-28');
  assert.deepEqual(settledWeeks('2026-10-06'), { current: '2026-10-05', previous: '2026-09-28' });   // Tuesday: the previous week is still settled (Q1-A)
  assert.deepEqual(settledWeeks('2026-10-05'), { current: '2026-10-05', previous: '2026-09-28' });
});

test('dayStatus: today and yesterday are syncable, older days missed, later days future, unconfirmed unknown', () => {
  const today = '2026-10-02';
  assert.equal(dayStatus('2026-10-03', null, today), 'future');
  assert.equal(dayStatus('2026-10-02', undefined, today), 'unknown');
  assert.equal(dayStatus('2026-10-02', day('2026-10-02', 6000), today), 'achieved');
  assert.equal(dayStatus('2026-10-02', day('2026-10-02', 5999), today), 'syncable');
  assert.equal(dayStatus('2026-10-01', null, today), 'syncable');
  assert.equal(dayStatus('2026-09-30', day('2026-09-30', 5999), today), 'missed');
  assert.equal(dayStatus('2026-10-04', null, '2026-10-05'), 'syncable');          // Monday sees last Sunday as yesterday
});

test('weekVerdict: X/7, eligibility (FSD-04B: points do not matter) and when the week can no longer qualify', () => {
  const v = weekVerdict(W, perfect(), '2026-10-04');
  assert.deepEqual([v.achievedCount, v.eligible, v.closed, v.confirmed], [7, true, false, true]);
  assert.equal('sundayClaimed' in v, false);
  // FSD-04B: seven achieved days are eligible whatever points were claimed, on any later day too.
  for (const claimed of [0, 1, 2]) {
    const unclaimed = perfect(); unclaimed[6] = day('2026-10-04', 6000, claimed);
    for (const today of ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-20']) {
      assert.deepEqual([weekVerdict(W, unclaimed, today).eligible, weekVerdict(W, unclaimed, today).closed], [true, false], `claimed ${claimed} on ${today}`);
    }
  }
  // Sunday short: Monday may still sync it (syncable, not closed); from Tuesday it is missed and the week closes.
  const shortSunday = perfect(); shortSunday[6] = day('2026-10-04', 5999, 3);
  assert.deepEqual([weekVerdict(W, shortSunday, '2026-10-05').eligible, weekVerdict(W, shortSunday, '2026-10-05').closed, weekVerdict(W, shortSunday, '2026-10-05').days[6].status], [false, false, 'syncable']);
  assert.deepEqual([weekVerdict(W, shortSunday, '2026-10-06').closed, weekVerdict(W, shortSunday, '2026-10-06').days[6].status], [true, 'missed']);
  const noSunday = perfect(); noSunday[6] = null;
  assert.equal(weekVerdict(W, noSunday, '2026-10-05').closed, false);
  assert.equal(weekVerdict(W, noSunday, '2026-10-06').closed, true);
  const gap = perfect(); gap[2] = day('2026-09-30', 5999);
  assert.equal(weekVerdict(W, gap, '2026-10-04').closed, true);
  const unknown = perfect(); unknown[3] = undefined;
  assert.deepEqual([weekVerdict(W, unknown, '2026-10-04').eligible, weekVerdict(W, unknown, '2026-10-04').confirmed], [false, false]);
  const midweek = weekDays(W).map((d) => (d <= '2026-09-30' ? day(d) : null));
  const m = weekVerdict(W, midweek, '2026-09-30');
  assert.deepEqual([m.achievedCount, m.closed, m.days[3].status], [3, false, 'future']);
  // Wednesday to the next Tuesday never combines: only Monday..Sunday of one week counts.
  const shifted = weekDays(W).map((d, i) => (i < 2 ? null : day(d, 6000, i === 6 ? 3 : 0)));
  assert.equal(weekVerdict(W, shifted, '2026-10-04').eligible, false);
});

test('finalKey changes with any eventSeq so a later legal sync allows a retry', () => {
  const a = perfect();
  const b = perfect(); b[1] = day('2026-09-29', 7000, 0, 4);
  assert.notEqual(finalKey(W, a), finalKey(W, b));
  assert.equal(finalKey(W, a), finalKey(W, perfect()));
});

test('parseCoupon accepts only the fixed 10-field shape with a 30-day expiry', () => {
  const stored = { ...coupon(), recordedAt: { seconds: 1, nanoseconds: 0 } };
  assert.equal(parseCoupon(stored, 's9', 'YOI-M01', W).expiresAt, '2026-11-03T12:00:00+08:00');
  for (const o of [{ faceValue: 100 }, { expiresAt: '2026-11-04T12:00:00+08:00' }, { kind: 'x' }, { extra: 1 }, { weekId: '2026-10-05' }, { recordedAt: null }]) {
    assert.throws(() => parseCoupon({ ...stored, ...o }, 's9', 'YOI-M01', W), CouponFormatError, JSON.stringify(o));
  }
});

test('canUse: whole non-negative fares only; 149 no, 150 yes; expired coupons never', () => {
  const c = coupon();
  assert.equal(canUse(c, '149', '2026-10-10T09:00:00+08:00').ok, false);
  assert.equal(canUse(c, '150', '2026-10-10T09:00:00+08:00').ok, true);
  assert.equal(canUse(c, ' 150 ', '2026-10-10T09:00:00+08:00').ok, true);
  for (const bad of ['', 'abc', '-150', '150.5', '1e3']) assert.match(canUse(c, bad, '2026-10-10T09:00:00+08:00').message, /請輸入金額/, bad);
  assert.equal(couponActive(c, '2026-11-03T11:59:59+08:00'), true);
  assert.equal(couponActive(c, '2026-11-03T12:00:00+08:00'), false);
  assert.match(canUse(c, '500', '2026-11-04T09:00:00+08:00').message, /已過期/);
});

test('promptPlan: only the latest unseen coupon is shown; all unseen are marked', () => {
  const a = coupon({ weekId: '2026-09-21', issuedAt: '2026-09-27T12:00:00+08:00' });
  const b = coupon();
  const plan = promptPlan([a, b], () => false);
  assert.equal(plan.show.weekId, W);
  assert.equal(plan.markSeen.length, 2);
  assert.equal(promptPlan([a, b], (c) => c.weekId === W).show.weekId, '2026-09-21');
  assert.equal(promptPlan([a, b], () => true).show, null);
  assert.equal(promptKey('s9', 'YOI-M01', W), 'yoxi-coupon-seen:s9:YOI-M01:2026-09-28');
});

test('copy: week cards, the Sunday deadline, states, coupons and the congratulation', () => {
  const v = weekVerdict(W, perfect(), '2026-10-04');
  const card = (state, label = '本週') => ({ label, confirmed: true, achievedCount: v.achievedCount, days: v.days, state });
  // UX-1010 F14: one sentence under the circles.
  assert.match(perfectWeekView(card('issued'), null), /這週七天都達標了！<\/p><p class="pt-sub">\$50 乘車券已經放進獎勵/);
  assert.match(perfectWeekView(card('issuing'), null), /\$50 乘車券發放中/);
  assert.match(perfectWeekView(card('pending'), null), /\$50 乘車券發放中/);
  assert.match(perfectWeekView(card('identity'), null), /展示身分已變更，請重新登入後再確認乘車券/);
  assert.doesNotMatch(perfectWeekView(card('identity'), null), /乘車券待發/);
  assert.match(perfectWeekView(card('closed'), card('issued', '上週')), /上週七天都達標了！/);
  // FSD-08A-6 (5): no Sunday line any more; (4) the rule sits under the state on this week's card.
  assert.doesNotMatch(perfectWeekView(card('open'), null), /第三點/);
  // FSD-04B: the rule no longer mentions Sunday's third point.
  assert.match(perfectWeekView(card('open'), null), /週一到週日每天走滿 6,000 步，就能拿到一張 \$50 乘車券/);
  assert.doesNotMatch(perfectWeekView({ ...card('unconfirmed'), confirmed: false }, null), /7<\/b>/);
  assert.match(couponsView([{ key: 'week-' + W, kind: 'weeklyPerfect', issuedAt: '2026-10-04T12:00:00+08:00', expiresAt: '2026-11-03T12:00:00+08:00', active: true, faceValue: 50, minFare: 150 }]), /最低車資 NT\$150（含）<\/p>/);
  assert.match(couponsView([]), /還沒有獎勵券/);
  assert.match(couponsView(null), /同步中/);
  const prompt = couponPromptView();
  assert.ok(prompt.includes('恭喜完成本週七日挑戰！'));
  assert.ok(prompt.includes('已獲得 NT$50 乘車獎勵券。每天為自己多走一點，也別忘了適時休息，下一段路讓 yoxi 陪您。'));
  assert.ok(prompt.includes('查看獎勵券'));
  // While unconfirmed the Sunday line does not claim "未領", and the "待補" note appears only with a syncable cell.
  const waiting = perfectWeekView({ ...card('unconfirmed'), confirmed: false }, null);
  assert.match(waiting, /全勤進度同步中/);
  assert.doesNotMatch(perfectWeekView(card('issued'), null), /可補/);
  const open = weekVerdict(W, weekDays(W).map((d) => (d <= '2026-09-30' ? day(d, 5000) : null)), '2026-09-30');
  // 2026-10-07: today not reached is 進行中; yesterday not reached is 未達標 like any earlier day (its steps are fixed in reality).
  const openView = perfectWeekView({ ...card('open'), days: open.days, today: '2026-09-30' }, null);
  // UX-1010 F14: today is a progress ring, yesterday a grey dash like any missed day.
  assert.match(openView, /class="pw-dot pw-dot--today"[^>]*><span class="yo-sr-only">週三 09\/30 今天，進行中（今天）<\/span>/);
  assert.match(openView, /class="pw-dot pw-dot--missed"[^>]*><span class="yo-sr-only">週二 09\/29 未達標<\/span><i class="pw-dash"><\/i>/);
  assert.doesNotMatch(openView, /待補|可補/);
});
