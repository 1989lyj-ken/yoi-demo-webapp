// FSD-08A-1: shell decisions (pages, menu, location, invite card), shell views, and source checks for the map module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_CENTER, INITIAL_LOCATION, inviteCard, locationLabel, menuItems, nextLocation, offersLocate, parsePage, shouldWatch, showsOwnPosition,
} from '../src/app/shell-state.ts';
import { appShellView, drawerView, inviteCardView, mapHeroView, mapStatusView } from '../src/ui/views.ts';

test('parsePage: the four pages, anything else is the steps page', () => {
  for (const p of ['steps', 'team', 'rewards', 'invite']) assert.equal(parsePage(`#${p}`), p);
  for (const bad of ['', '#', '#admin', '#STEPS', '#steps?x', 'team']) assert.equal(parsePage(bad), bad === 'team' ? 'team' : 'steps', bad);
});

test('menuItems: admin entries only for admins; upcoming features never navigate', () => {
  const member = menuItems('member').map((i) => i.id);
  assert.deepEqual(member, ['points', 'upcoming-0', 'upcoming-1', 'upcoming-2', 'home', 'logout']);   // 2026-10-06 (15): no 關於展示版
  assert.deepEqual(menuItems('admin').map((i) => i.id).slice(0, 3), ['points', 'admin', 'upcoming-0']);   // 2026-10-06: one admin entry (共用情境管理)
  assert.equal(menuItems('admin')[1].label, '共用情境管理');
  assert.deepEqual(menuItems('admin').filter((i) => i.kind === 'upcoming').map((i) => i.label), ['Yoika 智慧感知 2.0', '人生願望清單', '外籍人士社交平台']);
});

test('location: transitions and pill texts (product owner, 2026-10-04)', () => {
  let s = INITIAL_LOCATION;
  assert.equal(locationLabel(s), '尚未開啟定位');
  assert.equal(offersLocate(s), true);
  s = nextLocation(s, { type: 'request' });
  assert.equal(locationLabel(s), '定位中…');
  s = nextLocation(s, { type: 'fix', accuracy: 23.6 });
  assert.equal(locationLabel(s), '已定位・精度約 24 公尺');
  assert.equal(showsOwnPosition(s), true);
  // A timeout after a fix keeps the position and says it may be outdated (no jump back to the demo spot).
  s = nextLocation(s, { type: 'error', code: 'timeout' });
  assert.equal(locationLabel(s), '位置可能過時');
  assert.equal(showsOwnPosition(s), true);
  assert.equal(locationLabel(nextLocation(INITIAL_LOCATION, { type: 'error', code: 'timeout' })), '暫時無法取得位置');
  assert.equal(offersLocate(nextLocation(INITIAL_LOCATION, { type: 'error', code: 'unavailable' })), true);
  const denied = nextLocation(s, { type: 'error', code: 'denied' });
  assert.equal(locationLabel(denied), '未允許定位');
  assert.equal(showsOwnPosition(denied), false);
  assert.equal(offersLocate(denied), false);
  assert.deepEqual(nextLocation(denied, { type: 'request' }), denied);           // never asks again on this page
  assert.equal(locationLabel(nextLocation(INITIAL_LOCATION, { type: 'unsupported' })), '此裝置無法定位');
  assert.equal(locationLabel(nextLocation(INITIAL_LOCATION, { type: 'fix', accuracy: 0.2 })), '已定位・精度約 1 公尺');
});

test('shouldWatch: every condition must hold (M7)', () => {
  const ok = { stepsPageShown: true, documentVisible: true, stopped: false, stale: false, requested: true, status: 'located' };
  assert.equal(shouldWatch(ok), true);
  for (const [k, v] of [['stepsPageShown', false], ['documentVisible', false], ['stopped', true], ['stale', true], ['requested', false], ['status', 'denied'], ['status', 'unsupported']]) {
    assert.equal(shouldWatch({ ...ok, [k]: v }), false, `${k}=${v}`);
  }
});

test('the demonstration spot is the TibaMe Taipei centre on Nanjing East Road Section 3', () => {
  assert.ok(Math.abs(DEFAULT_CENTER[0] - 25.0517) < 0.003 && Math.abs(DEFAULT_CENTER[1] - 121.5428) < 0.003);
});

test('inviteCard: syncing, no team, shareable, full, paused, archived', () => {
  const t = (o = {}) => ({ confirmed: true, hasTeam: true, inviteCode: 'A1B2C3D4E5F60718', status: 'active', memberCount: 2, weekLocked: false, ...o });
  assert.deepEqual(inviteCard(t({ confirmed: false })), { kind: 'syncing' });
  assert.deepEqual(inviteCard(t({ hasTeam: false, inviteCode: null })), { kind: 'noTeam', locked: false });
  assert.deepEqual(inviteCard(t({ hasTeam: false, inviteCode: null, weekLocked: true })), { kind: 'noTeam', locked: true });
  assert.deepEqual(inviteCard(t()), { kind: 'share', code: 'A1B2C3D4E5F60718', memberCount: 2 });
  assert.equal(inviteCard(t({ memberCount: 5 })).kind, 'full');
  assert.equal(inviteCard(t({ status: 'paused', memberCount: 1 })).kind, 'paused');
  assert.equal(inviteCard(t({ status: 'archived' })).kind, 'archived');
  assert.match(inviteCardView(inviteCard(t())), /id="invite-card-code">A1B2C3D4E5F60718</);
  assert.match(inviteCardView({ kind: 'noTeam', locked: false }), /data-goto="team"/);
  assert.doesNotMatch(inviteCardView({ kind: 'full', code: 'X' }), /invite-card-copy/);
});

test('shell view: four pages with only steps visible, the shared panel IDs once each, nav state, menu button', () => {
  const html = appShellView({ role: 'member' });
  for (const p of ['steps', 'team', 'rewards', 'invite']) assert.match(html, new RegExp(`data-page="${p}"`));
  assert.equal((html.match(/data-page="[a-z]+" aria-labelledby="[^"]+" hidden/g) ?? []).length, 3);
  for (const id of ['today-steps-input', 'yesterday-steps-input', 'perfect-week-content', 'coupons-content', 'rewards-content', 'team-content', 'referral-content', 'session-error', 'map-hero', 'invite-card']) {
    assert.equal(html.split(`id="${id}"`).length, 2, id);
  }
  assert.doesNotMatch(html, /id="team-invite-code"[\s\S]*id="team-invite-code"/);
  assert.doesNotMatch(html, /id="yesterday-reminder"/);   // 2026-10-06 (3): only the bell reminds
  assert.match(html, /data-nav="steps" class="selected" aria-current="page"/);
  assert.match(html, /id="menu-button"[^>]*aria-expanded="false"[^>]*aria-controls="drawer"/);
});

test('drawer view: account, points, admin-only entries, upcoming features, escaped names', () => {
  const base = { displayName: '<b>Ken</b>', memberId: 'YOI-M01', role: 'member', sessionId: 's6', balance: null, note: null };
  const member = drawerView(base);
  assert.match(member, /&lt;b&gt;Ken&lt;\/b&gt;/);
  assert.match(member, /已獲得和泰 Points 點數<b>—<\/b>/);
  assert.doesNotMatch(member, /data-menu="admin"|data-menu="auto-week"|data-menu="diagnostics"|data-menu="about"|關於展示版/);
  assert.match(member, /<span class="drawer-upcoming-label">Yoika 智慧感知 2.0<\/span><small>即將推出<\/small>/);   // 2026-10-12: no subtitle
  assert.doesNotMatch(member, /AI 智行秘書|drawer-upcoming-sub/);
  assert.match(member, /id="drawer-note"[^>]*hidden/);
  const admin = drawerView({ ...base, role: 'admin', balance: 1234, note: '這項功能將在後續版本開放。' });
  assert.match(admin, /data-menu="admin"/);
  assert.match(admin, /data-menu="admin">共用情境管理/);
  assert.doesNotMatch(admin, /data-menu="auto-week"|推進時間／重設場次/);
  assert.doesNotMatch(admin, /data-menu="diagnostics"|診斷畫面|data-menu="about"/);
  assert.match(admin, /1,234 點/);
  assert.match(admin, /role="status" >這項功能將在後續版本開放。/);
});

test('map hero view: pill, demonstration tag, steps, locate button, fallback art without street names', () => {
  const idle = mapHeroView({ label: '尚未開啟定位', offerLocate: true, ownPosition: false, steps: null, effective: null, fallback: false });
  assert.match(idle, /尚未開啟定位/);
  assert.match(idle, /示意位置/);
  assert.match(idle, /<strong id="map-steps">—<\/strong>/);
  assert.match(idle, /id="map-locate"/);
  assert.match(idle, /id="map-canvas" class="app-map-canvas" aria-hidden="true"/);
  const fallback = mapHeroView({ label: '未允許定位', offerLocate: false, ownPosition: false, steps: 6100, effective: 9150, fallback: true });
  assert.match(fallback, /yo-map-art/);
  assert.doesNotMatch(fallback, /南京東路|松江路|長春路/);
  // FSD-08A-3 Q3 and B1 (d): only the number (no thousands separator) and 步; nothing below it.
  assert.match(fallback, /<strong id="map-steps">6100<\/strong><span>步<\/span><\/div>/);
  assert.doesNotMatch(fallback, /今日有效/);
  assert.doesNotMatch(fallback.match(/<div class="yo-step-overlay">[\s\S]*?<\/div>/)[0], /<small/);
  // C10: the pill names the demonstration spot whenever the own position is not shown.
  assert.match(fallback, /示意位置・未允許定位/);
  assert.doesNotMatch(mapStatusView({ label: '已定位・精度約 20 公尺', ownPosition: true }), /示意位置/);
});

test('privacy (M5): the map module never stores, logs or sends positions and does no reverse geocoding', () => {
  const src = readFileSync(new URL('../src/app/map-hero.ts', import.meta.url), 'utf8');
  for (const banned of ['localStorage', 'sessionStorage', 'console.', 'firebase', 'nominatim', 'fetch(', 'location.hash', 'history.']) {
    assert.ok(!src.toLowerCase().includes(banned.toLowerCase()), banned);
  }
  assert.match(src, /https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
  assert.match(src, /OpenStreetMap contributors/);
  for (const opt of ['dragging: false', 'touchZoom: false', 'scrollWheelZoom: false', 'doubleClickZoom: false', 'boxZoom: false', 'keyboard: false', 'zoomControl: false']) assert.ok(src.includes(opt), opt);
  assert.match(src, /import\("leaflet"\)/);       // loaded on demand, its own chunk
});

test('privacy note (Security M-1, FSD-08B B1, FSD-08C): its own card at the bottom of the 今日、本週、昨日 tabs, always shown; licenses ship with the build', () => {
  const offered = mapHeroView({ label: '尚未開啟定位', offerLocate: true, ownPosition: false, steps: null, effective: null, fallback: false });
  assert.match(offered, /id="map-locate"[^>]*aria-describedby="map-privacy"/);
  assert.doesNotMatch(offered, /id="map-privacy"/);
  const shell = appShellView({ role: 'member' });
  const card = /<aside class="yo-panel app-privacy-card"( id="map-privacy")? aria-label="定位隱私說明"><ul class="app-privacy-list"><li>位置只在您的手機上使用，不存檔、不給隊友看。<\/li><li>地圖與天氣會用到約 1 公里範圍的位置（OpenStreetMap、Open-Meteo）。<\/li><\/ul><\/aside><\/div>/g;
  const cards = [...shell.matchAll(card)];
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map((m) => Boolean(m[1])), [true, false, false]); // the locate button points at the first
  assert.equal(shell.split('id="map-privacy"').length, 2);
  assert.doesNotMatch(shell, /app-privacy-list[^>]*hidden/);
  assert.ok(!readFileSync(new URL('../src/app/map-hero.ts', import.meta.url), 'utf8').includes('#map-privacy'));
  const shellSrc = readFileSync(new URL('../src/app/app-shell.ts', import.meta.url), 'utf8');
  // The shell stores only read notices (FSD-08A-2), never positions; it logs nothing.
  assert.ok(!shellSrc.includes('console.'));
  assert.ok(!shellSrc.split(/\r?\n/).some((line) => line.includes('localStorage') && /lat|lng|coords/.test(line)));
  const notices = readFileSync(new URL('../public/third-party-licenses.txt', import.meta.url), 'utf8');
  assert.match(notices, /BSD 2-Clause License/);
  assert.match(notices, /Phosphor Icons/);
});

test('2026-10-06 (7): drawer — account as a group label, name with a folded detail list, an 其他 group before home', () => {
  const base = { displayName: '<b>Ken</b>', memberId: 'YOI-M01', role: 'member', sessionId: 's6', balance: null, note: null };
  const closed = drawerView(base);
  assert.match(closed, /<p id="drawer-account-title" class="drawer-group">個人帳戶資料<\/p>/);
  assert.match(closed, /<button id="drawer-account-toggle" class="drawer-item drawer-account-name" type="button" aria-expanded="false" aria-controls="drawer-account-details"><strong>&lt;b&gt;Ken&lt;\/b&gt;<\/strong>/);
  assert.match(closed, /<dl id="drawer-account-details" class="session-details" hidden>/);
  assert.match(drawerView({ ...base, accountOpen: true }), /aria-expanded="true"[^]*<dl id="drawer-account-details" class="session-details" >/);
  assert.match(closed, /<li class="drawer-group">其他<\/li>\s*<li><button type="button" class="drawer-item" data-menu="home">回到 yoxi 首頁/);
});

test('2026-10-12: each upcoming feature opens its own intro page (full screen, back closes it, image text as alt)', async () => {
  const { introPageView } = await import('../src/ui/views.ts');
  const { UPCOMING_INTRO, UPCOMING_FEATURES } = await import('../src/app/shell-state.ts');
  assert.deepEqual(UPCOMING_INTRO.map((i) => i.title), [...UPCOMING_FEATURES]);
  const html = introPageView({ ...UPCOMING_INTRO[1], src: '/assets/intro-wishlist.png' });
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="intro-title"/);
  assert.match(html, /<button id="intro-back" class="intro-back" type="button" aria-label="返回">/);
  assert.match(html, /<h2 id="intro-title">人生願望清單<\/h2>/);
  assert.match(html, /<img src="\/assets\/intro-wishlist.png" width="981" height="2790" alt="即將推出：人生願望清單。[^"]*CC BY 3\.0[^"]*" decoding="async">/);
  const shell = readFileSync(new URL('../src/app/app-shell.ts', import.meta.url), 'utf8');
  assert.ok(shell.includes('if (UPCOMING_INTRO[index] && hooks.introImage?.(index)) { closeDrawer(true); openIntro(index); }'));
  assert.ok(shell.includes('removeIntroKeys = trapKeys(() => intro, () => closeIntro(), "button:not([disabled])");'));
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.ok(main.includes('introImage: (index) => [introYoikaUrl, introWishlistUrl, introKampungUrl][index] ?? null'));
});
