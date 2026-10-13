// FSD-07A: referral parsing, code checks, refusal messages, derived coupons and bonus points, views.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bindRefusal, checkCode, expiryOf, parseReferral, referralBonuses, referralCoupons, referralStep } from '../src/referral/referral-state.ts';
import { balance, ledgerRows } from '../src/rewards/chest-state.ts';
import { canUse } from '../src/weekly/perfect-week-state.ts';
import { couponsView, referralView, rewardsView } from '../src/ui/views.ts';

const raw = (o = {}) => ({ sessionId: 's6', refereeId: 'YOI-M02', referrerId: 'YOI-M01', boundAt: '2026-10-05T09:00:00+08:00', firstRideAt: null,
  clockVersion: 6, recordedAt: { seconds: 1, nanoseconds: 0 }, firstRideRecordedAt: null, ...o });

test('parseReferral: exact fields, own path, plain referrer id, times; anything else fails closed', () => {
  assert.deepEqual(parseReferral(raw(), 's6', 'YOI-M02'), { refereeId: 'YOI-M02', referrerId: 'YOI-M01', boundAt: '2026-10-05T09:00:00+08:00', firstRideAt: null });
  assert.equal(parseReferral(raw({ firstRideAt: '2026-10-06T10:00:00+08:00' }), 's6', 'YOI-M02').firstRideAt, '2026-10-06T10:00:00+08:00');
  const missing = raw(); delete missing.clockVersion;
  for (const bad of [raw({ sessionId: 's5' }), raw({ refereeId: 'YOI-M03' }), raw({ referrerId: 'YOI-M02' }), raw({ referrerId: 'a/b' }),
    raw({ boundAt: '2026-10-05' }), raw({ firstRideAt: 'soon' }), { ...raw(), extra: 1 }, missing, null]) {
    assert.throws(() => parseReferral(bad, 's6', 'YOI-M02'), { name: 'ReferralFormatError' }, JSON.stringify(bad));
  }
});

test('checkCode and bindRefusal: Q7 messages', () => {
  assert.deepEqual(checkCode('  YOI-M01 ', 'YOI-M02'), { ok: true, code: 'YOI-M01' });
  assert.deepEqual(checkCode('', 'YOI-M02'), { ok: false, message: '請輸入推薦碼。' });
  assert.deepEqual(checkCode('YOI M01', 'YOI-M02'), { ok: false, message: '找不到這個推薦碼。' });
  assert.deepEqual(checkCode('YOI-M02', 'YOI-M02'), { ok: false, message: '不能填自己的推薦碼。' });
  const own = { refereeId: 'YOI-M02', referrerId: 'YOI-M03', boundAt: '2026-10-05T09:00:00+08:00', firstRideAt: null };
  assert.equal(bindRefusal(own, null, 'YOI-M01', 'YOI-M02', true), '您已經綁定推薦碼，不能更改。');
  assert.equal(bindRefusal(null, null, 'YOI-M09', 'YOI-M02', false), '找不到這個推薦碼。');
  assert.equal(bindRefusal(null, { ...own, refereeId: 'YOI-M01', referrerId: 'YOI-M02' }, 'YOI-M01', 'YOI-M02', true), '對方已由您推薦，不能互相推薦。');
  assert.equal(bindRefusal(null, 'unreadable', 'YOI-M01', 'YOI-M02', true), '未綁定，請稍後再試。');
});

test('expiry: 60 days later at the same time, across months, years and leap days', () => {
  assert.equal(expiryOf('2026-10-05T09:00:00+08:00'), '2026-12-04T09:00:00+08:00');
  assert.equal(expiryOf('2026-12-20T23:59:59+08:00'), '2027-02-18T23:59:59+08:00');
  assert.equal(expiryOf('2028-01-01T08:00:00+08:00'), '2028-03-01T08:00:00+08:00'); // 2028 is a leap year
  assert.equal(expiryOf('2028-02-29T08:00:00+08:00'), '2028-04-29T08:00:00+08:00');
});

const r = (refereeId, referrerId, boundAt, firstRideAt = null) => ({ refereeId, referrerId, boundAt, firstRideAt });

test('referralCoupons and referralStep: two welcome coupons for the referee, one reward per first ride', () => {
  const own = r('YOI-M02', 'YOI-M01', '2026-10-05T09:00:00+08:00');
  const mine = [r('YOI-M03', 'YOI-M02', '2026-10-05T10:00:00+08:00', '2026-10-06T11:00:00+08:00'), r('YOI-M04', 'YOI-M02', '2026-10-05T12:00:00+08:00')];
  const coupons = referralCoupons(own, mine);
  assert.deepEqual(coupons.map((c) => [c.key, c.kind, c.faceValue, c.issuedAt, c.expiresAt]), [
    ['ref-YOI-M02-1', 'referralWelcome', 50, '2026-10-05T09:00:00+08:00', '2026-12-04T09:00:00+08:00'],
    ['ref-YOI-M02-2', 'referralWelcome', 50, '2026-10-05T09:00:00+08:00', '2026-12-04T09:00:00+08:00'],
    ['refbonus-YOI-M03', 'referralReward', 100, '2026-10-06T11:00:00+08:00', '2026-12-05T11:00:00+08:00'],
  ]);
  assert.deepEqual(referralCoupons(null, []), []);
  assert.equal(referralStep(null), 0);
  assert.equal(referralStep(own), 2);
  assert.equal(referralStep({ ...own, firstRideAt: '2026-10-06T11:00:00+08:00' }), 3);
});

test('bonus points count until the expiry moment, then stay in the record as expired', () => {
  const mine = [r('YOI-M03', 'YOI-M02', '2026-10-05T10:00:00+08:00', '2026-10-06T11:00:00+08:00')];
  const at = (now) => referralBonuses(mine, now).map((b) => ({ ...b, label: '推薦新戶首乘加碼（小美）' }));
  const days = [{ taskDate: '2026-10-06', claimed: 3 }];
  assert.equal(balance(days, [], at('2026-12-05T10:59:59+08:00')), 53);
  assert.equal(balance(days, [], at('2026-12-05T11:00:00+08:00')), 3);           // the expiry moment itself no longer counts
  const rows = ledgerRows(days, [], at('2026-12-05T11:00:00+08:00'));
  assert.deepEqual(rows.map((x) => [x.kind, x.points, !!x.expired]), [['referral', 50, true], ['daily', 3, false]]);
  const html = rewardsView({ balance: 3, chests: [], rows, canOpen: true });
  assert.match(html, /推薦新戶首乘加碼（小美）/);
  assert.match(html, /已到期（不計入餘額）/);
  assert.match(html, /points-expired/);
});

test('coupons: referral coupons have no minimum fare and distinct keys; the list mixes kinds', () => {
  assert.equal(canUse({ expiresAt: '2026-12-04T09:00:00+08:00', minFare: null }, '1', '2026-10-05T09:00:00+08:00').ok, true);
  assert.match(canUse({ expiresAt: '2026-12-04T09:00:00+08:00', minFare: null }, '1', '2026-12-04T09:00:00+08:00').message, /已過期/);
  const html = couponsView([
    { key: 'ref-YOI-M02-2', kind: 'referralWelcome', issuedAt: '2026-10-05T09:00:00+08:00', expiresAt: '2026-12-04T09:00:00+08:00', active: true, faceValue: 50, minFare: null },
    { key: 'ref-YOI-M02-1', kind: 'referralWelcome', issuedAt: '2026-10-05T09:00:00+08:00', expiresAt: '2026-12-04T09:00:00+08:00', active: true, faceValue: 50, minFare: null },
    { key: 'week-2026-09-28', kind: 'weeklyPerfect', issuedAt: '2026-10-04T12:00:00+08:00', expiresAt: '2026-11-03T12:00:00+08:00', active: true, faceValue: 50, minFare: 150 },
  ]);
  assert.match(html, /NT\$50 推薦獎勵券<span class="yo-coupon-role">（新戶）<\/span><\/h3><p>無最低車資<\/p>/);
  // FSD-08A-5: no fare field (and so no key in the markup); both welcome coupons show, newest first.
  assert.equal(html.split('（新戶）</span>').length - 1, 2);
  assert.ok(html.lastIndexOf('（新戶）') < html.indexOf('NT$50 乘車獎勵券'));
  assert.doesNotMatch(html, /<input|data-coupon-key/);
  assert.match(html, /最低車資 NT\$150（含）/);
});

test('referralView: syncing, binding form, progress with the ride button, people referred; names are escaped', () => {
  const base = { myCode: 'YOI-M02', busy: false };
  const syncing = referralView({ ...base, own: undefined, mine: undefined });
  assert.match(syncing, /推薦狀態同步中/);
  assert.match(syncing, /<div class="yo-code" id="referral-code">YOI-M02<\/div>/); // FSD-08A-6: dashed box like the invite code
  assert.match(syncing, /50 點和泰 Points/);
  assert.match(syncing, /您推薦的新戶狀態[\s\S]*您的新戶狀態/);
  assert.match(referralView({ ...base, own: null, mine: [], formError: '找不到這個推薦碼。' }), /<\/div><p id="referral-form-error" class="error-message" role="alert">找不到這個推薦碼。<\/p>/);
  assert.match(referralView({ ...base, own: null, mine: [] }), /id="referral-form"/);
  assert.match(referralView({ ...base, own: null, mine: [] }), /還沒有人填您的推薦碼/);
  const bound = referralView({ ...base, own: { referrerName: '<b>小美</b>', boundAt: '2026-10-05T09:00:00+08:00', firstRideAt: null }, mine: [{ name: '阿明', firstRide: true }] });
  assert.match(bound, /推薦人：&lt;b&gt;小美&lt;\/b&gt;/);
  assert.match(bound, /id="referral-ride"/);
  assert.match(bound, /阿明<\/span><b>已首乘/);
  const done = referralView({ ...base, own: { referrerName: '小美', boundAt: '2026-10-05T09:00:00+08:00', firstRideAt: '2026-10-06T10:00:00+08:00' }, mine: [] });
  assert.doesNotMatch(done, /id="referral-ride"/);
  assert.match(done, /首乘已完成/);
  assert.match(referralView({ ...base, own: null, mine: [], busy: true }), /<input id="referral-input" maxlength="40" autocomplete="off" disabled>/);
});
