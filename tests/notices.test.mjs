// FSD-08A-2: bell notices (derivation, once per day, fail-closed) and the yoxi home mock view.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveNotices, noticeKey, unreadCount } from '../src/app/notices.ts';
import { bellView, homeView, noticesView } from '../src/ui/views.ts';

const base = (o = {}) => ({
  scenarioNow: '2026-10-05T12:00:00+08:00', taskDate: '2026-10-05',
  today: { rawSteps: 6000, effectiveSteps: 6000, claimable: 0 }, yesterdayClaimable: 0, couponIssuedAt: [], unopenedChests: 0, referralRewardAt: [], ...o,
});
const types = (input) => deriveNotices(input).items.map((n) => n.type);

test('fail-closed: any unconfirmed source means no list (and no badge)', () => {
  for (const k of ['today', 'yesterdayClaimable', 'couponIssuedAt', 'unopenedChests', 'referralRewardAt']) {
    const list = deriveNotices(base({ [k]: null }));
    assert.deepEqual(list, { confirmed: false, items: [] }, k);
    assert.equal(unreadCount(list, () => false), undefined);
  }
  assert.deepEqual(deriveNotices(base()), { confirmed: true, items: [] });
});

test('N1 move: from 12:00 with fewer than 1,000 raw steps (scenario time, no Date)', () => {
  assert.deepEqual(types(base({ scenarioNow: '2026-10-05T11:59:59+08:00', today: { rawSteps: 0, effectiveSteps: 0, claimable: 0 } })), []);
  assert.deepEqual(types(base({ today: { rawSteps: 999, effectiveSteps: 999, claimable: 0 } })), ['move']);
  assert.deepEqual(types(base({ today: { rawSteps: 1000, effectiveSteps: 1000, claimable: 0 } })), []);
});

test('N2 claim: any unlocked unclaimed point; with a ride bonus the text says "task effective steps"', () => {
  const plain = deriveNotices(base({ today: { rawSteps: 2500, effectiveSteps: 2500, claimable: 1 } })).items[0];
  assert.equal(plain.type, 'claim');
  assert.equal(plain.text, '今天有 1 點可以領');   // UX-1010 F13
  const ride = deriveNotices(base({ today: { rawSteps: 4000, effectiveSteps: 6000, claimable: 3 } })).items[0];
  assert.equal(ride.text, '今天有 3 點可以領');
  assert.equal(ride.day, '2026-10-05');
  assert.equal(ride.anchor, '#today-say');
});

test('N3 yesterday, N4 coupon today, N5 chests, N6 referral today', () => {
  const all = deriveNotices(base({ yesterdayClaimable: 2, couponIssuedAt: ['2026-10-04T21:00:00+08:00', '2026-10-05T09:00:00+08:00'], unopenedChests: 2,
    referralRewardAt: ['2026-10-05T10:00:00+08:00'] }));
  assert.deepEqual(all.items.map((n) => n.type), ['yesterday', 'coupon', 'chest', 'referral']);
  assert.equal(all.items[0].text, '昨天還有 2 點可以補領，今晚 23:59 前');
  // 2026-10-06 wording
  assert.equal(all.items[1].text, '拿到 1 張 $50 乘車獎勵券');
  assert.equal(all.items[2].text, '有 2 個團隊寶箱可以開');
  assert.equal(all.items[3].text, '拿到 1 張 $100 推薦獎勵券和 50 點');
  assert.equal(deriveNotices(base({ unopenedChests: 1 })).items.find((n) => n.type === 'chest').text, '團隊寶箱可以開了');
  const welcome = deriveNotices(base({ referralRewardAt: ['2026-10-05T10:00:00+08:00'], referralWelcomeAt: ['2026-10-05T10:00:00+08:00'] }));
  assert.equal(welcome.items.find((n) => n.type === 'referral').text, '拿到 2 張 $50 推薦獎勵券');
  assert.ok(all.items.every((n) => !/請至|查看/.test(n.text)));
  assert.deepEqual(all.items.map((n) => n.page), ['steps', 'rewards', 'rewards', 'rewards']);
  // Earned on an earlier day: not "today" any more.
  assert.deepEqual(types(base({ couponIssuedAt: ['2026-10-04T21:00:00+08:00'], referralRewardAt: ['2026-10-04T23:59:59+08:00'] })), []);
});

test('once per day: the read key is per session, member, task day and type; the badge counts unread types', () => {
  assert.equal(noticeKey('s6', 'YOI-M01', '2026-10-05', 'claim'), 'yoi:notice:s6:YOI-M01:2026-10-05:claim');
  const list = deriveNotices(base({ yesterdayClaimable: 1, unopenedChests: 1 }));
  assert.equal(unreadCount(list, () => false), 2);
  assert.equal(unreadCount(list, (t) => t === 'chest'), 1);
  assert.equal(unreadCount(list, () => true), 0);
});

test('bell and panel views: badge, labels, syncing instead of "no notices", unread first', () => {
  assert.match(bellView(undefined), /aria-label="通知（同步中）"/);
  assert.doesNotMatch(bellView(undefined), /app-bell-badge/);
  assert.match(bellView(2), /aria-label="通知，2 則未讀"[\s\S]*app-bell-badge" aria-hidden="true">2</);
  assert.doesNotMatch(bellView(0), /app-bell-badge/);
  assert.match(noticesView({ confirmed: false, items: [] }, () => false), /部分資料同步中/);
  assert.doesNotMatch(noticesView({ confirmed: false, items: [] }, () => false), /沒有新通知/);
  assert.match(noticesView({ confirmed: true, items: [] }, () => false), /沒有新通知/);
  const list = deriveNotices(base({ yesterdayClaimable: 1, unopenedChests: 1 }));
  const html = noticesView(list, (t) => t === 'yesterday');
  assert.ok(html.indexOf('data-notice="chest"') < html.indexOf('data-notice="yesterday"'));
  // 2026-10-06: one font for all notices; Yoika title; 全部已讀 left of 關閉 only when there is something to clear; no push line.
  assert.doesNotMatch(html, /notice-unread/);
  assert.match(html, /<h2 id="notices-title">Yoika提醒您<\/h2><div class="notices-actions"><button id="notices-clear" class="text-button" type="button">全部已讀<\/button><button id="notices-close"/);
  assert.doesNotMatch(noticesView({ confirmed: true, items: [] }, () => false), /notices-clear/);
  assert.doesNotMatch(html, /站內通知/);
});

test('home mock view: screenshot without loading delays, rewritten greeting, demo tag, squid button with label and NEW', () => {
  const html = homeView({ screenshotUrl: '/assets/yoxi-home.jpg' });
  assert.match(html, /<img class="home-shot" src="\/assets\/yoxi-home.jpg" width="1206" height="2478" alt="yoxi App 首頁示意" decoding="async" fetchpriority="high">/);
  assert.doesNotMatch(html, /loading="lazy"/);
  assert.match(html, /<p class="home-greeting">嗨，今天要去哪？<\/p>/);
  assert.match(html, /示意畫面/);
  assert.match(html, /id="home-enter" class="home-squid" type="button" aria-label="進入 yoi 遊移遊戲（新功能）"/);
  assert.match(html, /home-squid-pos"><div class="home-squid-float">/);   // float and wiggle on separate elements (M9)
  assert.match(html, /class="home-new" aria-hidden="true">NEW</);
  assert.doesNotMatch(html, />yoi</);                                      // no visible yoi text on the button (Q5)
  assert.match(homeView({ screenshotUrl: '"><script>' }), /src="&quot;&gt;&lt;script&gt;"/);
});

test('reduced motion stops the float, wiggle and pulse of the home button (CSS)', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce) {\n  .home-squid-float'));
  assert.match(block, /\.home-squid-float, \.home-squid \{ animation: none; \}/);
  assert.match(block, /\.home-squid-float::before \{ display: none; \}/);
  for (const name of ['home-float', 'home-pulse', 'home-wiggle']) assert.match(css, new RegExp(`@keyframes ${name} `));
});

test('2026-10-06 (4): cleared notices stay hidden for the day; the key is per session, member, day and type', async () => {
  const { visibleNotices, noticeClearedKey } = await import('../src/app/notices.ts');
  const list = deriveNotices(base({ yesterdayClaimable: 1, unopenedChests: 1 }));
  assert.deepEqual(visibleNotices(list, (t) => t === 'chest').items.map((n) => n.type), list.items.filter((n) => n.type !== 'chest').map((n) => n.type));
  assert.equal(visibleNotices({ confirmed: false, items: [] }, () => true).confirmed, false);
  assert.equal(noticeClearedKey('s6', 'YOI-M01', '2026-10-06', 'chest'), 'yoi:notice-cleared:s6:YOI-M01:2026-10-06:chest');
});
