// FSD-08A-3: the showcase layout backed by shared data — view states, element IDs the controllers need (C1),
// the map count's display plan (B1) and the markers/stamps the product owner asked for (D4–D9).
import test from 'node:test';
import assert from 'node:assert/strict';
import { stepsDisplay } from '../src/app/shell-state.ts';
import { progressTrip } from '../src/ui/components.ts';
import { readFileSync } from 'node:fs';
import {
  appShellView, couponPromptView, mapHeroView, referralView, stepsSheetView, couponsView, dailyPanelView, inviteCardView, mapStepsView, milestoneRowsView, perfectWeekView,
  rewardsRecordView, rewardsView, sharedShellView, teamTitleOf, teamView, TEAM_TITLE_FALLBACK, yesterdayPromptView, teamEmptyView,
} from '../src/ui/views.ts';


// 2026-10-06 (4)(5): display-only state boxes; claiming only with the button below (never per row).
const guideShellSrc = () => readFileSync(new URL('../src/app/app-shell.ts', import.meta.url), 'utf8');
const states = (html) => [...html.matchAll(/<span class="yo-mile-state yo-mile-state--(\w+)"><span class="yo-sr-only">狀態：<\/span>([^<]*)<\/span>/g)].map((m) => [m[1], m[2]]);
test('milestones (2026-10-06): locked / ready / claimed state boxes, no buttons, notes', () => {
  const html = milestoneRowsView(1, 6500);
  assert.deepEqual(states(html), [['done', '獎勵 1 點'], ['ready', '待領 1 點'], ['ready', '待領 1 點']]);
  assert.doesNotMatch(html, /<button|data-claim/);
  assert.match(html, /<article class="yo-milestone claimed">/);
  assert.match(html, /<small>已領取<\/small>/);
  assert.match(html, /<small>已達標，等您領取<\/small>/);
  const low = milestoneRowsView(0, 1500);
  assert.deepEqual(states(low), [['locked', '未解鎖'], ['locked', '未解鎖'], ['locked', '未解鎖']]);
  assert.match(low, /<small>再走 500 步解鎖<\/small>/);
  assert.match(low, /<small>再走 4,500 步解鎖<\/small>/);
  assert.deepEqual(states(milestoneRowsView(3, 6000)).map((x) => x[0]), ['done', 'done', 'done']);
});

const day = (taskDate, status, effectiveSteps = null, claimed = null) => ({ taskDate, status, effectiveSteps, claimed });
const week = (overrides = {}) => ({
  label: '本週', confirmed: true, achievedCount: 1, state: 'open', today: '2026-10-07',
  days: [day('2026-10-05', 'achieved', 6500, 3), day('2026-10-06', 'syncable', 4200, 2), day('2026-10-07', 'syncable', 0, 0), day('2026-10-08', 'future'),
    day('2026-10-09', 'future'), day('2026-10-10', 'future'), day('2026-10-11', 'future')],
  ...overrides,
});

test('UX-1010 F14: seven circles — done, missed (dash), today ring, not yet; one sentence; the rule', () => {
  const html = perfectWeekView(week(), null, null);
  assert.match(html, /<button type="button" class="pw-dot pw-dot--done" data-select-date="2026-10-05" aria-pressed="false"><span class="yo-sr-only">週一 10\/05 已達標<\/span><svg/);
  assert.match(html, /class="pw-dot pw-dot--missed"[^>]*><span class="yo-sr-only">週二 10\/06 未達標<\/span><i class="pw-dash"><\/i>/);
  assert.match(html, /class="pw-dot pw-dot--today"[^>]*><span class="yo-sr-only">週三 10\/07 今天，進行中（今天）<\/span><svg class="pw-ring"[^]*?style="--p:0"/);
  assert.match(html, /<span class="pw-dot pw-dot--future"><span class="yo-sr-only">週四 10\/08 還沒到<\/span><\/span><span class="pw-day" aria-hidden="true">四<\/span>/);
  assert.match(html, /<span class="pw-day today" aria-hidden="true">今天<\/span>/);
  assert.doesNotMatch(html, /10\/05<\/b>|pw-state|本週已達標|<b class="pw-date"/);
  // one day missed: the sentence says so
  assert.match(html, /<p class="pt-lead">這週有 1 天沒走滿<\/p><p class="pt-sub">下週一重新開始。今天的步數照樣可以領點數<\/p>/);
  assert.match(html, /<p class="yo-muted pw-rule">週一到週日每天走滿 6,000 步，就能拿到一張 \$50 乘車券<\/p>/);
  // still on track
  const ok = week({ days: week().days.map((d, i) => (i === 1 ? day('2026-10-06', 'achieved', 6200, 3) : i === 2 ? day('2026-10-07', 'syncable', 5000, 2) : d)), achievedCount: 2 });
  assert.match(perfectWeekView(ok, null), /<p class="pt-lead">已經 <b>2 天<\/b>，再 5 天就拿到了<\/p><p class="pt-sub">今天走滿 6,000 步就算一天・目前 5,000 步<\/p>/);
  const doneToday = week({ days: ok.days.map((d, i) => (i === 2 ? day('2026-10-07', 'achieved', 6100, 3) : d)), achievedCount: 3 });
  assert.match(perfectWeekView(doneToday, null), /已經 <b>3 天<\/b>，再 4 天就拿到了<\/p><p class="pt-sub">今天達標了，明天繼續/);
  // started mid-week: earlier days look like days still to come and are not "missed"
  const late = week({ days: week().days.map((d, i) => (i < 2 ? { ...day(d.taskDate, 'missed', 0, 0), beforeStart: true } : d)), achievedCount: 0 });
  const lateHtml = perfectWeekView(late, null);
  assert.equal((lateHtml.match(/pw-dot--future/g) ?? []).length, 6);
  assert.match(lateHtml, /<p class="pt-lead">下週一開始挑戰<\/p>/);
  // all seven
  assert.match(perfectWeekView(week({ state: 'issued', achievedCount: 7 }), null), /這週七天都達標了！<\/p><p class="pt-sub">\$50 乘車券已經放進獎勵/);
  // a picked day
  assert.match(perfectWeekView(week(), null, '2026-10-06'), /<li class="picked">[^]*?週二走了 <b>4,200<\/b> 步<\/p><p class="pt-sub">差 1,800 步，這天沒有算進去/);
  const ride = week({ days: week().days.map((d, i) => (i === 2 ? { ...day('2026-10-07', 'syncable', 4500, 2), ride: true } : d)) });
  assert.match(perfectWeekView(ride, null, '2026-10-07'), /今天走了 <b>4,500<\/b> 步<\/p><p class="pt-sub">再走 1,000 步就達標/);
});

test('UX-1010 F14: Monday shows last week as a compact row (not clickable, no rule)', () => {
  const last = week({ label: '上週', state: 'issued', today: undefined });
  const html = perfectWeekView(week(), last, null);
  const compact = html.slice(html.indexOf('pw-card-compact'));
  assert.ok(compact.includes('<span class="yo-sr-only">週日 10/11 還沒到</span>'));
  assert.match(compact, /上週七天都達標了！\$50 乘車券已經放進獎勵/);
  assert.doesNotMatch(compact, /pw-rule|data-select-date/);
});

const coupon = (active) => ({ key: active ? 'week-2026-09-28' : 'week-2026-08-24', kind: 'weeklyPerfect', issuedAt: '2026-10-04T12:00:00+08:00', expiresAt: '2026-11-03T12:00:00+08:00', active, faceValue: 50, minFare: 150 });

test('coupons (08A-5 7, 9, 12): valid coupons only, no stamp, no fare field, no not-yet-earned card', () => {
  const html = couponsView([coupon(true), coupon(false)]);
  assert.equal(html.split('class="yo-coupon coupon-card"').length - 1, 1); // the expired one is dropped
  assert.doesNotMatch(html, /yo-stamp|已入帳|已過期|<input|車資試算|coupon-placeholder/);
  assert.match(html, /<h3>NT\$50 乘車獎勵券<\/h3><p>最低車資 NT\$150（含）<\/p><p class="team-progress-note">獲得：10\/04 12:00<br>到期：11\/03 12:00<\/p>/);
  assert.doesNotMatch(html, /情境時間/);
  assert.doesNotMatch(html, /（模擬）|可使用/);
  assert.match(html, /僅展示模擬獎勵，不能在正式 yoxi 使用。<\/p>$/);
  assert.match(couponsView([coupon(false)]), /還沒有獎勵券/);
  assert.match(couponsView(null), /同步中/);
  assert.ok(couponPromptView().includes('查看獎勵券'));
  assert.match(appShellView({ role: 'member' }), /<h2 id="coupons-title" class="app-block-title">我的獎勵券<\/h2>/);
});

const teamBase = { status: 'active', memberCount: 2, inviteCode: 'A1B2C3D4E5F60718', leaderMemberId: 'YOI-M01' };
const entries = [
  { memberId: 'YOI-M01', exists: true, pending: false, fromCache: false, rawSteps: 4000, effectiveSteps: 6000, rideCompleted: true },
  { memberId: 'YOI-M02', exists: true, pending: true, fromCache: false, rawSteps: 0, effectiveSteps: 0, rideCompleted: false },
];

test('team (08A-6 附圖二): card title (escaped, fallback), 萬步 total, per-day box, member rows with 我 and 今日第一', () => {
  const week = { total: 186_400, target: 300_000, reachedAt: null, confirmed: true, pending: false, contributions: { 'YOI-M01': 48_000, 'YOI-M02': 1_500 }, todayContributions: { 'YOI-M01': 6_000, 'YOI-M02': 1_500 }, pastMembers: [],
    previous: null, official: null, settling: false, own: null, need: 9_500, needPlusOne: 7_600, daysLeft: 3 };
  const html = teamView({ ...teamBase, title: '<b>Ken</b>的步行小隊' }, entries, true, null, week, (id) => (id === 'YOI-M01' ? '𠮷田' : '小美'), 'YOI-M01');
  assert.match(html, /<h2 id="team-name" class="team-card-title">&lt;b&gt;Ken&lt;\/b&gt;的步行小隊<\/h2>/);
  assert.match(html, /全隊 30 萬步，寶箱人人有份/);
  assert.match(html, /已成團・本週・還有 3 天/);
  assert.match(html, /<b class="team-wan">18.6<\/b><span> \/ 30 萬步<\/span>/);
  assert.match(html, /目前 2 人，每人每天約需 <b>9,500 步<\/b>[\s\S]*再邀 1 人，每人每天只要 <b>7,600 步<\/b>[\s\S]*data-goto-page="invite"/);
  assert.match(html, /成員（2 人，最多 5 人）/);
  assert.match(html, /<span class="yo-avatar self" aria-hidden="true">我<\/span>/);
  assert.match(html, /𠮷田・隊長<\/strong><span class="team-first">/); // highest effective today
  assert.match(html, /本週 48,000 步/);   // 2026-10-05: same format as 有效 (thousands separators, no 萬)
  assert.match(html, /<small>今日乘車加成<\/small>/);   // 2026-10-06 (2): team-counted steps only
  assert.match(html, /<strong>小美<\/strong><\/span><small>本週 1,500 步<\/small><\/span><span class="team-row-today"><b>1,500<\/b>/);
  assert.doesNotMatch(html, /A1B2C3D4E5F60718|team-copy-code|邀請碼/);
  assert.match(teamView(teamBase, entries, false), /正在等待每位隊員的今日狀態由伺服器確認/);
  assert.match(teamView(teamBase, entries, true), new RegExp(`>${TEAM_TITLE_FALLBACK}</h2>`));
  // Reached: the 萬步 number turns "reached" and the box says so (also fixes the 512,501／300,000 misreading).
  const done = teamView(teamBase, entries, true, null, { ...week, total: 512_501, need: null, needPlusOne: null });
  assert.match(done, /<b class="team-wan reached">51.2<\/b>[\s\S]*已達標[\s\S]*達標了！寶箱準備中/);
});

const ids = (html) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

test('C12: the team content and the invite card never repeat an element ID', () => {
  const html = teamView(teamBase, entries, true, { canLeave: true, canTransfer: true, leaveMode: 'leave', notice: null }, null) + inviteCardView({ kind: 'share', code: 'A1B2C3D4E5F60718', memberCount: 2 });
  const list = ids(html);
  assert.deepEqual(list.filter((id, i) => list.indexOf(id) !== i), []);
});

test('C1 (08A-4 C7): every element the daily controller looks up exists exactly once, in the card or in the steps sheet', () => {
  // FSD-08C: today has the track, the sentence and the ride task row; yesterday its steps, points to claim and ride line.
  const common = ['date', 'ride-state', 'steps-form', 'steps-input', 'steps-hint', 'claim-all', 'points', 'status', 'error'];
  const own = { today: ['trip', 'say', 'simulate-ride', 'ride-done'], yesterday: ['steps', 'ride-note', 'claimable', 'deadline'] };
  const diag = { today: dailyPanelView('today', { stepsInSheet: false }), yesterday: dailyPanelView('yesterday', { stepsInSheet: false }) };
  for (const d of ['today', 'yesterday']) {
    const list = ids(diag[d]);
    for (const name of [...common, ...own[d]]) assert.ok(list.includes(`${d}-${name}`), `${d}-${name}`);
    assert.equal(list.length, new Set(list).size, `${d}: unique IDs`);
    assert.match(diag[d], new RegExp(`data-day="${d}"`));
    // The controller takes the form's only button as the submit button.
    assert.equal((diag[d].match(/<form[\s\S]*?<\/form>/)[0].match(/<button/g) ?? []).length, 1);
  }
  // The shell: today's steps field is in the sheet (a sibling of .app-shell), not in the card; nothing is lost or doubled.
  const shell = appShellView({ role: 'member' });
  const sheet = shell.slice(shell.indexOf('<div id="steps-sheet"'));
  for (const name of ['steps-form', 'steps-input', 'steps-hint']) {
    assert.equal(shell.split(`id="today-${name}"`).length, 2, name);
    assert.ok(sheet.includes(`id="today-${name}"`), `${name} in the sheet`);
  }
  assert.ok(shell.indexOf('<div id="steps-sheet"') > shell.lastIndexOf('</nav>'));
  for (const name of [...common, ...own.today].filter((n) => !n.startsWith('steps'))) assert.equal(shell.split(`id="today-${name}"`).length, 2, name);
  assert.doesNotMatch(dailyPanelView('today', { stepsInSheet: true }), /today-steps-form/);
  assert.match(stepsSheetView(), /<div id="steps-sheet" class="steps-sheet" hidden>\s*<div class="steps-sheet-panel" role="dialog" aria-modal="true"/);
  assert.equal((stepsSheetView().match(/<form[\s\S]*?<\/form>/)[0].match(/<button/g) ?? []).length, 1);
  assert.ok(ids(diag.yesterday).includes('yesterday-deadline'));
  assert.match(diag.yesterday, /id="yesterday-title" tabindex="-1"/);
  assert.match(diag.today, /id="today-say" class="pt-say" tabindex="-1"/);   // the notices' anchor
  assert.doesNotMatch(diag.today, /不連接正式訂單、不具反作弊驗證/); // 08A-5 2(1)
  // FSD-08A-6 (9): the controller writes the combined deadline line into #yesterday-deadline, under claim-all.
  assert.ok(diag.yesterday.indexOf('id="yesterday-claim-all"') < diag.yesterday.indexOf('id="yesterday-deadline"'));
  assert.ok(diag.yesterday.indexOf('id="yesterday-ride-state"') < diag.yesterday.indexOf('id="yesterday-claim-all"')); // FSD-08C: the three lines first
});

test('FSD-08C: one today card — title with points, track, sentence, claim button, then the ride task row', () => {
  const today = dailyPanelView('today', { stepsInSheet: true });
  assert.equal((today.match(/class="yo-panel[ "]/g) ?? []).length, 1);
  assert.match(today, /<div class="yo-panel-head"><h2 id="today-title" tabindex="-1">今天的點數<\/h2><span id="today-points">/);
  assert.match(today, /<p id="today-date" class="yo-kicker" hidden><\/p>/);
  const at = (s) => today.indexOf(s);
  assert.ok(at('id="today-trip"') < at('id="today-say"') && at('id="today-say"') < at('id="today-claim-all"')
    && at('id="today-claim-all"') < at('id="today-ride-state"'));
  assert.doesNotMatch(today, /yo-milestone|2000步|乘車加成/);
  const row = today.match(/<div class="ride-task">[\s\S]*?<\/div>\s*<\/section>/)[0];
  assert.match(row, /<span class="ride-reward" aria-hidden="true"><svg[^]*?<\/svg><b>步數<br>1.5 倍<\/b><\/span>/);
  assert.doesNotMatch(dailyPanelView('yesterday', { stepsInSheet: true }), /ride-task|today-simulate-ride/);
});

test('UX-1010 F1: 輸入步數 sits right under the big count (its own row) and opens the sheet', () => {
  const html = mapHeroView({ label: '尚未開啟定位', offerLocate: true, ownPosition: false, steps: 1000000, effective: null, fallback: false });
  assert.match(html, /<div class="app-map-row"><div class="yo-step-overlay"><strong id="map-steps" class="long">1000000<\/strong><span>步<\/span><\/div><\/div>\s*<button id="steps-sheet-open"[^>]*aria-haspopup="dialog"[^>]*aria-controls="steps-sheet">[^]*?<span>輸入步數<\/span><\/button>/);
  assert.doesNotMatch(html, /map-ride-note/);   // F16: the ride line moved into the card
});


test('B1: the map count animates only between confirmed values; "—" and the first value show directly', () => {
  assert.deepEqual(stepsDisplay(null, null), { kind: 'dash' });
  assert.deepEqual(stepsDisplay(4000, null), { kind: 'dash' });
  assert.deepEqual(stepsDisplay(null, 4000), { kind: 'show', value: 4000 });
  assert.deepEqual(stepsDisplay(4000, 4000), { kind: 'show', value: 4000 });
  assert.deepEqual(stepsDisplay(4000, 6100), { kind: 'animate', from: 4000, to: 6100 });
  assert.equal(mapStepsView(12345), '<strong id="map-steps">12345</strong><span>步</span>');
});

test('D6/Q1: the progress marker is the footprints icon', () => {
  const html = progressTrip(0.5, { label: 'x' });
  assert.match(html, /class="yx-trip-car"><svg[^>]*viewBox="0 0 256 256"/);
  assert.match(html, /M216\.06,192v12/);
});

test('D12: the navy fill follows the marker inside a segment; a reached segment is navy, the last turns red when full', () => {
  const segs = (html) => [...html.matchAll(/<span class="yx-trip-seg ([a-z]*)" style="--fill:([\d.]+)%"><\/span>/g)].map((m) => [m[1], Number(m[2])]);
  assert.deepEqual(segs(progressTrip(0.5, { segments: 3, label: 'x' })), [['done', 100], ['', 50], ['', 0]]);
  assert.deepEqual(segs(progressTrip(1, { segments: 3, label: 'x' })), [['done', 100], ['done', 100], ['done', 100]]); // 08A-5 10: navy to the end
  assert.deepEqual(segs(progressTrip(0.62, { label: 'team' })), [['', 62]]);
  assert.deepEqual(segs(progressTrip(1, { label: 'team' })), [['done', 100]]);
});


test('C5: the banner title uses the own name, or the confirmed name of a teammate; never the memberId', () => {
  const names = (id) => (id === 'YOI-M02' ? '小美' : null);
  assert.equal(teamTitleOf('YOI-M01', 'YOI-M01', 'Ken', names), 'Ken的步行小隊');
  assert.equal(teamTitleOf('YOI-M02', 'YOI-M01', 'Ken', names), '小美的步行小隊');
  assert.equal(teamTitleOf('YOI-M03', 'YOI-M01', 'Ken', names), TEAM_TITLE_FALLBACK);
  assert.equal(teamTitleOf(null, 'YOI-M01', 'Ken', names), TEAM_TITLE_FALLBACK);
});

test('C12: the whole shell and the diagnostics page have unique element IDs; the record follows the coupons', () => {
  for (const html of [appShellView({ role: 'admin' }), sharedShellView({ displayName: 'K', memberId: 'YOI-M01', role: 'admin', sessionId: 's6', scenarioNow: '2026-10-05T09:00:00+08:00' })]) {
    const list = ids(html);
    assert.deepEqual(list.filter((id, i) => list.indexOf(id) !== i), []);
  }
  const shell = appShellView({ role: 'member' });
  // FSD-08A-6: points (with the record) / chests / coupons tabs.
  assert.ok(shell.indexOf('id="rewards-record"') < shell.indexOf('id="rewards-chests"') && shell.indexOf('id="rewards-chests"') < shell.indexOf('id="coupons-content"'));
  const input = { balance: 3, chests: [], rows: [{ label: '每日任務', date: '2026-10-05', points: 1, at: null }], canOpen: true };
  assert.doesNotMatch(rewardsView(input, 'top'), /<h2>獲得紀錄<\/h2>/);
  assert.match(rewardsView(input), /<h2>獲得紀錄<\/h2>/);   // 2026-10-07: was 我的集點
  assert.match(rewardsRecordView(input.rows), /每日任務/);
});

test('QA A1: weekly cells have a keyboard focus ring distinct from the today ring; no stale outline on achieved cells', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  assert.ok(css.includes('.pw-chip:focus-visible { outline: 2px solid var(--yx-link-blue); outline-offset: 4px; }'));
  assert.ok(css.indexOf('.pw-chip:focus-visible') > css.indexOf('.pw-today {'));
  assert.ok(!css.includes('.pw-achieved { outline'));
});

test('08A-4 B3/C3: only a confirmed save closes the sheet; the sheet message keeps a failure first', async () => {
  const { closesSheet, sheetMessage } = await import('../src/app/shell-state.ts');
  assert.equal(closesSheet({ phase: 'saving' }), false);
  assert.equal(closesSheet({ phase: 'done', outcome: 'confirmed', status: '', error: null }), true);
  assert.equal(closesSheet({ phase: 'done', outcome: 'unconfirmed', status: '', error: 'x' }), false);
  assert.equal(closesSheet({ phase: 'done', outcome: 'failed', status: '', error: 'x' }), false);
  assert.equal(sheetMessage({ failure: '失敗', subscriptionError: '斷線', syncing: true }), '失敗');
  assert.equal(sheetMessage({ failure: null, subscriptionError: '斷線', syncing: true }), '斷線');
  assert.equal(sheetMessage({ failure: null, subscriptionError: null, syncing: true }), '同步中，暫時無法儲存。');
  assert.equal(sheetMessage({ failure: null, subscriptionError: null, syncing: false }), '');
});

test('08A-4 D1: the home-screen icon (180) and favicon (32) exist with the right sizes; index.html names the app "yoi"', () => {
  const size = (file) => { const b = readFileSync(new URL(`../public/${file}`, import.meta.url)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  assert.deepEqual(size('apple-touch-icon.png'), [180, 180]);
  assert.deepEqual(size('favicon-32.png'), [32, 32]);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<link rel="apple-touch-icon" href="\/apple-touch-icon.png" \/>/);
  assert.match(html, /<link rel="icon" type="image\/png" sizes="32x32" href="\/favicon-32.png" \/>/);
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="yoi" \/>/);
  assert.doesNotMatch(html, /apple-mobile-web-app-capable/);
});

test('08A-4 C1/C2/B4: sources — Tab loop includes inputs, the sheet joins the overlay checks, the team guard skips a hidden sheet', () => {
  const shell = readFileSync(new URL('../src/app/app-shell.ts', import.meta.url), 'utf8');
  assert.ok(shell.includes('button:not([disabled]), input:not([disabled])'));
  assert.ok(shell.includes('const overlayOpen = () => drawer !== null || panel !== null || sheetOpen ||'));
  assert.ok(shell.includes('isDrawerOpen: () => drawer !== null || panel !== null || sheetOpen || guide !== null || weather !== null || ride !== null || intro !== null,'));   // FSD-08B B2, FSD-08C, intro page
  // openDrawer and openPanel check the guide and (FSD-08B QA S2) the weather dialog; openSheet also checks overlayOpen().
  assert.equal(shell.split('|| sheetOpen || guide || weather || ride || intro || stopped').length - 1, 2);   // FSD-08C: and the ride celebration
  assert.ok(shell.includes('if (!sheet || sheetOpen || guide || stopped || hooks.isStale() || overlayOpen()) return;'));
  // FSD-08B QA B1: the weather dialog's Tab loop reaches its links and the hour list; Escape skips a composition.
  assert.ok(shell.includes('const WEATHER_TAB_TARGETS = "button:not([disabled]), a[href], [tabindex=\\"0\\"]";'));
  assert.ok(shell.includes('trapKeys(() => weather, () => closeWeather(), WEATHER_TAB_TARGETS);'));
  assert.ok(shell.includes('if (event.isComposing || event.keyCode === 229) return;'));
  // FSD-08B B3 (QA B2): a location that may be outdated forgets the weather.
  assert.ok(readFileSync(new URL('../src/app/map-hero.ts', import.meta.url), 'utf8').includes('if (state.status === "stale") hooks.onLost?.();'));
  assert.ok(shell.includes('closeSheet(true);'));
  const team = readFileSync(new URL('../src/team/team-panel.ts', import.meta.url), 'utf8');
  assert.ok(team.includes('#steps-sheet:not([hidden])'));
});

test('08A-4 D5: steps page order — map card, today card, weekly task card, yesterday card', () => {
  const html = appShellView({ role: 'member' });
  const at = (needle) => html.indexOf(needle);
  const map = at('id="map-hero"'), today = at('data-day="today"'), week = at('id="perfect-week-title"'), yesterday = at('data-day="yesterday"');
  assert.ok(map > 0 && map < today && today < week && week < yesterday, [map, today, week, yesterday].join(','));
  // The map card holds only the map (and its privacy note); the weekly task is its own card.
  const mapCard = html.slice(html.lastIndexOf('<section', map), today);
  assert.doesNotMatch(mapCard, /perfect-week/);
  assert.match(html, /<section class="yo-walk-week-card app-week-card" aria-label="個人週任務">/);
});

test('2026-10-07: the steps sheet button is a pencil in a pill (no text; was the footprints)', () => {
  const html = mapHeroView({ label: 'x', offerLocate: false, ownPosition: true, steps: 1, effective: null, fallback: true });
  const start = html.indexOf('<button id="steps-sheet-open"');
  const button = html.slice(start, html.indexOf('</button>', start));
  assert.ok(button.includes('M227.31,73.37'), 'pencil');
  assert.ok(!button.includes('M216.06,192v12'), 'no footprints');
  assert.ok(!button.includes('模擬</span>'));
  assert.ok(button.includes('<span>輸入步數</span>'));   // UX-1010 F1: the pencil with words
});

test('08A-5 1, 13, 11, 3, 4: referral note, today tag, menu icon, weekly kicker size, team block margin', () => {
  assert.match(referralView({ myCode: 'YOI-M01', own: null, mine: [], busy: false }), /新戶首次登入後 3 天內綁定即完成註冊任務，可得 NT\$50 推薦獎勵券 ×2。/);
  const today = dailyPanelView('today', { stepsInSheet: true });
  assert.ok(today.indexOf('<p class="yo-kicker yo-kicker-tag">今日里程碑</p>') < today.indexOf('id="today-date"'));
  const shell = appShellView({ role: 'member' });
  const menu = shell.slice(shell.indexOf('id="menu-button"'), shell.indexOf('</button>', shell.indexOf('id="menu-button"')));
  // 2026-10-07: three plain navy lines (no disc, no red ends); the logo centred with a small 遊移.
  assert.match(menu, /<path d="M4 6.5h16M4 12h16M4 17.5h16" stroke="currentColor"/);
  assert.doesNotMatch(menu, /yx-i-accent/);
  assert.match(shell, /<div class="yo-brand app-brand-center" aria-label="yoi 遊移遊戲">[^]*?<span class="yoi-brand-text yoi-brand-text--small">遊移<\/span><\/div>/);
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  assert.ok(css.includes('.yo-week-panel .yo-panel-head .yo-kicker { font: var(--yx-type-body-sm); }'));
  assert.ok(css.includes('.app-block.team-panel { margin-top: 0; }'));
  assert.ok(css.includes('.yo-panel .yo-kicker-tag { font: var(--yx-type-tag); }'));
  assert.ok(css.includes('#menu-button { border-radius: var(--yx-radius-full); background: var(--yx-action-navy);'));
  assert.ok(!css.includes('.yx-trip-seg.full') && !css.includes('.yo-stamp') && !css.includes('.coupon-card input'));
});

test('08A-5 2: the in-sync messages are gone from the sources; problem messages stay', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const team = readFileSync(new URL('../src/team/team-panel.ts', import.meta.url), 'utf8');
  assert.ok(!main.includes('已從共享服務同步') && !team.includes('隊伍及今日隊員狀態已由伺服器確認'));
  assert.ok(main.includes('結果同步中；正在重新讀取伺服器狀態，請稍等。') && main.includes('同步中；尚未確認。'));
  assert.ok(team.includes('隊伍已確認；今日隊員資料同步中…'));
});

test('08A-6: steps tabs (今日／本週／昨日), guide button, map row, red team bar with 10萬／20萬 marks, kicker style', async () => {
  const { guideView } = await import('../src/ui/views.ts');
  const shell = appShellView({ role: 'member' });
  assert.match(shell, /<div class="app-tabs" role="tablist" aria-label="步數分頁" data-tabs="steps"><button type="button" role="tab" id="steps-tab-today" class="app-tab selected" data-subtab="today" aria-selected="true" aria-controls="steps-panel-today">今日<\/button>/);
  for (const [id, hidden] of [['today', false], ['week', true], ['yesterday', true]]) {
    assert.match(shell, new RegExp(`data-subpanel="${id}" id="steps-panel-${id}" role="tabpanel" aria-labelledby="steps-tab-${id}"${hidden ? ' hidden' : '>'}`));
  }
  assert.ok(shell.indexOf('id="map-hero"') < shell.indexOf('data-tabs="steps"'));
  assert.ok(shell.indexOf('id="info-button"') < shell.indexOf('id="bell-slot"'));
  assert.match(shell, /id="info-button"[^>]*aria-label="遊玩指南"[^>]*aria-controls="guide"/);
  assert.doesNotMatch(shell, /展示體驗說明/);
  // 2026-10-07: two pages in a bottom sheet; rows fold (one open at a time is the shell's job).
  const rules = guideView('rules', null);
  assert.match(rules, /role="dialog" aria-modal="true" aria-labelledby="guide-title"/);
  assert.match(rules, /<button id="guide-close" class="guide-close" type="button" aria-label="關閉">/);
  for (const t of ['怎麼玩', '走路就能存和泰 Points，還有乘車券和寶箱', '每走 2,000 步', '搭一趟 yoxi', '天天走滿 6,000 步', '組隊走 30 萬步', '推薦朋友', 'Yoika提醒您', '認識 Yoika', '展示版', '點步數下面的「輸入步數」就能輸入今天的步數']) assert.ok(rules.includes(t), t);
  assert.equal((rules.match(/aria-expanded="false"/g) ?? []).length, 6);
  assert.equal((rules.match(/class="guide-collapse" aria-hidden="true"/g) ?? []).length, 6);
  const opened = guideView('rules', 2);
  assert.match(opened, /data-guide-row="2" aria-expanded="true" aria-controls="guide-row-2"/);
  assert.match(opened, /<div id="guide-row-2" class="guide-collapse" ><div class="guide-collapse-inner"><ul class="guide-bullets"><li>\$50 乘車券一張，30 天內有效<\/li><li>車資滿 \$150 可用<\/li><\/ul>/);
  // 2026-10-07: folding never re-renders the sheet (no flash)
  assert.ok(guideShellSrc().includes('guideRow = guideRow === Number(row) ? null : Number(row); syncGuideRows();'));
  assert.match(opened, /<li>達標後，每位隊員可以開一次寶箱，抽和泰 Points<\/li>/);
  const yoika = guideView('yoika');
  for (const t of ['嗨，我是 Yoika', '我會隨時留意天氣、時段、您的位置和平常的搭車及走路節奏，在剛好的時機提醒您一聲。', '感知到 天氣・時段・習慣', '一小時後降雨機率 70%，也快到您平常下班的時間，要先幫您預約 yoxi 嗎？', '感知到 步數・位置', '看看怎麼玩']) assert.ok(yoika.includes(t), t);
  // 2026-10-07: two swipeable examples (2026-10-08), no 比如說; the dots are their switch
  assert.doesNotMatch(yoika, /比如說|午後 34°C/);
  assert.equal((yoika.match(/class="guide-slide"/g) ?? []).length, 2);
  assert.match(yoika, /<button type="button" class="guide-dot on" data-guide-slide="0" aria-label="第 1 則範例" aria-current="true"><i><\/i><\/button>/);
  assert.equal((yoika.match(/data-guide-slide=/g) ?? []).length, 2);
  assert.ok(guideShellSrc().includes('if (slide !== undefined) { showGuideSlide(Number(slide)); return; }'));
  const guideShell = readFileSync(new URL('../src/app/app-shell.ts', import.meta.url), 'utf8');
  assert.ok(guideShell.includes('const k = guideSeenKey(identity.memberId);') && guideShell.includes('openGuide("yoika");'));
  const map = mapHeroView({ label: 'x', offerLocate: false, ownPosition: true, steps: 1000000, effective: null, fallback: true });
  assert.match(map, /<div class="app-map-row"><div class="yo-step-overlay">[\s\S]*?<\/div>\s*<button id="steps-sheet-open"/);
  const team = teamView(teamBase, entries, true, null, { total: 150000, target: 300000, reachedAt: null, confirmed: true, pending: false, contributions: {}, pastMembers: [], previous: null, official: null, settling: false, own: null, need: null });
  // 2026-10-07: the team bar is the same track as today's points: checks, grey until reached, the team icon floating
  assert.match(team, /<span class="pt-node pt-node--done" data-at="1"><svg[^]*?<span class="pt-node pt-node--locked" data-at="2"><svg[^]*?<span class="pt-node pt-node--locked" data-at="3"><svg/);
  assert.doesNotMatch(team, /pt-node[^>]*>P</);
  assert.match(team, /<span data-at="1">10萬<\/span><span data-at="2">20萬<\/span><span data-at="3">30萬<\/span>/);
  assert.match(team, /class="pt-shoe" style="--at:50.00%"><span class="pt-shoe-b"><svg[^>]*viewBox="0 0 32 32"/);
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  assert.ok(css.includes('--yx-type-kicker-lg: italic 500 16px/1.4 var(--yx-font);'));
  assert.ok(css.includes('.yo-page-heading .yo-kicker, .yo-panel .yo-kicker-tag { font: var(--yx-type-kicker-lg); }'));
  assert.ok(css.includes('.app-map.yo-walk-map { height: clamp(200px, 32vh, 240px); }'));
  const shellSrc = readFileSync(new URL('../src/app/app-shell.ts', import.meta.url), 'utf8');
  assert.ok(shellSrc.includes('reveal(notice.anchor);'));
  assert.ok(readFileSync(new URL('../src/team/team-panel.ts', import.meta.url), 'utf8').includes('#notices, #guide, #weather-dialog, #steps-sheet:not([hidden])'));
});

test('08A-6 附圖三: chest stage order and copy (open, opened, reached, progress, no team, syncing)', async () => {
  const { chestStage, daysLeftInWeek, wanOne } = await import('../src/rewards/chest-stage.ts');
  const { chestStageView, chestOverlayView } = await import('../src/ui/views.ts');
  const team = { confirmed: true, hasTeam: true, total: 186_000, target: 300_000, reached: false, daysLeft: 3, previous: { weekId: '2026-09-28', total: 314_000, awardCount: 5 } };
  const open = { weekId: '2026-09-28', tier: 'small', points: 15, openedAt: '2026-10-05T10:00:00+08:00' };
  assert.deepEqual(chestStage(null, [], team, '2026-09-28'), { kind: 'syncing' });
  assert.deepEqual(chestStage(['2026-09-28', '2026-10-05'], [], team, '2026-09-28'), { kind: 'open', weekId: '2026-09-28', more: 1, teamTotal: 314_000, awardCount: 5 });
  assert.deepEqual(chestStage([], [open], team, '2026-09-28'), { kind: 'opened', points: 15, tier: '小獎' });
  assert.deepEqual(chestStage([], [], { ...team, reached: true }, '2026-09-28'), { kind: 'reached' });
  assert.deepEqual(chestStage([], [], team, '2026-09-28'), { kind: 'progress', remaining: 114_000, daysLeft: 3 });
  assert.deepEqual(chestStage([], [], { ...team, hasTeam: false }, '2026-09-28'), { kind: 'noTeam' });
  assert.deepEqual(chestStage([], [], null, '2026-09-28'), { kind: 'syncing' });
  assert.equal(daysLeftInWeek('2026-10-05', '2026-10-05'), 7);
  assert.equal(daysLeftInWeek('2026-10-05', '2026-10-11'), 1);
  assert.equal(wanOne(299_999), '29.9');
  assert.match(chestStageView({ kind: 'open', weekId: '2026-09-28', more: 1, teamTotal: 314_000, awardCount: 5 }, true), /團隊寶箱可以開了[\s\S]*上週全隊走了 <b class="chest-red">31.4 萬步<\/b>・5 人都有份[\s\S]*data-open-chest="2026-09-28" >開團隊寶箱[\s\S]*還有 1 個寶箱沒開/);
  // UX-1010 F11 (rule A): opened is opened.
  assert.match(chestStageView({ kind: 'opened', points: 15, tier: '小獎', thisWeek: true }, true), /<h2>這週的寶箱開過了<\/h2><p class="chest-card-caption">抽到 <b class="chest-red">15 點<\/b>・下週一重新開始累計<\/p>/);
  assert.match(chestStageView({ kind: 'opened', points: 15, tier: '小獎' }, true), /上週的寶箱開過了/);
  assert.match(chestStageView({ kind: 'solo' }, true), /還沒解鎖・再邀 1 人成團，才開始累計步數[\s\S]*data-goto-page="team">前往團隊/);
  assert.doesNotMatch(chestStageView({ kind: 'solo' }, true), /結算|萬步/);
  assert.doesNotMatch(chestStageView({ kind: 'opened', points: 15, tier: '小獎' }, true), /都開過了/);
  assert.match(chestStageView({ kind: 'reached' }, true), /本週達標了！[\s\S]*寶箱準備中，稍後就能開/);
  assert.match(chestStageView({ kind: 'progress', remaining: 114_000, daysLeft: 3 }, true), /本週還差 <b class="chest-red">11.4 萬步<\/b>・剩 3 天[\s\S]*週一 00:00 結算[\s\S]*data-open-guide/);
  assert.match(chestStageView({ kind: 'noTeam' }, true), /data-goto-page="team"/);
  // The opening dialog: box shakes while waiting; the result card holds the confirmed value; no number before it.
  const opening = chestOverlayView({ kind: 'opening', skipped: false });
  assert.match(opening, /<div class="chest-panel" data-phase="opening"><svg class="chest-svg"/);
  assert.doesNotMatch(opening, /chest-prize/);
  const result = chestOverlayView({ kind: 'result', points: 30, tier: '超級獎' });
  assert.match(result, /class="chest-panel opened chest-big"[\s\S]*Lucky Day![\s\S]*data-target="30"[\s\S]*您抽中了 30 和泰 Points[\s\S]*>收下<\/button>/);
  assert.doesNotMatch(result, /#[0-9A-Fa-f]{6}/); // colours come from tokens
});

test('08A-6: rewards (我的點數／寶箱／獎勵券) and invite (組隊／新戶) tabs; the chest notice opens the 寶箱 tab', async () => {
  const shell = appShellView({ role: 'member' });
  assert.match(shell, /aria-label="獎勵分頁" data-tabs="rewards"><button type="button" role="tab" id="rewards-tab-points" class="app-tab selected"[^>]*>我的點數<\/button>[\s\S]*>寶箱<\/button>[\s\S]*>獎勵券<\/button>/);
  assert.match(shell, /aria-label="邀請分頁" data-tabs="invite"><button type="button" role="tab" id="invite-tab-team" class="app-tab selected"[^>]*>組隊<\/button>[\s\S]*>新戶<\/button>/);
  assert.match(shell, /data-subpanel="chests" id="rewards-panel-chests" role="tabpanel" aria-labelledby="rewards-tab-chests" hidden><div id="rewards-chests" tabindex="-1">/);
  assert.match(shell, /data-subpanel="referral" id="invite-panel-referral" role="tabpanel" aria-labelledby="invite-tab-referral" hidden>/);
  const { deriveNotices } = await import('../src/app/notices.ts');
  const list = deriveNotices({ scenarioNow: '2026-10-05T09:00:00+08:00', taskDate: '2026-10-05', today: { rawSteps: 5000, effectiveSteps: 5000, claimable: 0 }, yesterdayClaimable: 0, couponIssuedAt: [], unopenedChests: 1, referralRewardAt: [] });
  assert.equal(list.items.find((n) => n.type === 'chest').anchor, '#rewards-chests');
});

test('08A-6 Security P3 / FSD-08C: the daily controller updates today\x27s track in place (the shoe and the fill slide)', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.ok(main.includes('syncPointsTrack(q("trip"), current.effectiveSteps, current.claimed);'));
  assert.ok(main.includes('if (shoe) shoe.style.setProperty("--at", '));
});

test('08A-6 QA B2/B3 and suggestions: band from the bottom stack, focus to the chest tab, remaining rounded up', async () => {
  const hero = readFileSync(new URL('../src/app/map-hero.ts', import.meta.url), 'utf8');
  assert.ok(hero.includes('const stack = overlay.closest<HTMLElement>(".app-map-bottom");') && !hero.includes('overlay.parentElement.offsetTop'));
  const rewards = readFileSync(new URL('../src/rewards/rewards-panel.ts', import.meta.url), 'utf8');
  assert.ok(rewards.includes('(chestsBox ?? document.querySelector<HTMLElement>("#rewards"))?.focus();'));
  const { wanOneUp } = await import('../src/rewards/chest-stage.ts');
  assert.equal(wanOneUp(500), '0.1');
  assert.equal(wanOneUp(114_000), '11.4');
  const { chestStageView } = await import('../src/ui/views.ts');
  assert.match(chestStageView({ kind: 'progress', remaining: 500, daysLeft: 1 }, true), /還差 <b class="chest-red">0.1 萬步<\/b>/);
});

test('2026-10-05: roster by today steps (most first), red daily bar, prompt buttons in one row, invite text under the copy button', () => {
  const e = (memberId, effectiveSteps, pending = false) => ({ memberId, exists: true, pending, fromCache: false, rawSteps: effectiveSteps, effectiveSteps, rideCompleted: false });
  const html = teamView({ status: 'active', memberCount: 4, inviteCode: 'A1B2C3D4E5F60718', leaderMemberId: 'A' }, [e('A', 3000), e('B', 9000), e('C', 0, true), e('D', 5000)], true, null,
    // 2026-10-06 (2): sorted by today's team-counted steps (personal steps are on the steps page)
    { total: 0, target: 300000, reachedAt: null, confirmed: true, pending: false, contributions: {}, todayContributions: { A: 3000, B: 9000, C: 0, D: 5000 }, pastMembers: [], previous: null, official: null, settling: false, own: null, need: null });
  const order = ['B', 'D', 'A', 'C'].map((id) => html.indexOf(`<strong>${id}`));
  assert.deepEqual([...order].sort((x, y) => x - y), order);
  assert.ok(order.every((i) => i >= 0));
  const prompt = yesterdayPromptView(3, '2026-10-18');
  assert.doesNotMatch(prompt, /Asia\/Taipei/);
  assert.match(prompt, /<div class="dialog-actions"><button id="yesterday-prompt-close"[^>]*>稍後再說<\/button><button id="yesterday-prompt-go"[^>]*>前往補領<\/button><\/div>/);
  assert.match(inviteCardView({ kind: 'share', code: 'A1B2C3D4E5F60718', memberCount: 3 }), /複製邀請碼<\/button><p class="yo-muted">目前 3／5 人<br>隊友在「團隊功能」輸入邀請碼即可加入。<\/p>$/);
});

test('FSD-08C: yesterday card — steps, points left to claim and the ride bonus; 補領 N 點', () => {
  const y = dailyPanelView('yesterday', { stepsInSheet: true });
  assert.match(y, /<dl class="yd-stats">/);
  assert.match(y, />補領 0 點<\/button>/);
  assert.doesNotMatch(y, /yo-milestone|不讓昨日的步數白費/);
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.ok(main.includes('q("ride-state").textContent = rode ? "已加成，步數 × 1.5 倍" : "沒有搭乘";'));
  assert.doesNotMatch(main, /data-claim/);
});

test('2026-10-06 second batch: congratulation buttons in one row, ride text, referral bullets and wording, small notes', () => {
  assert.match(couponPromptView(), /<div class="dialog-actions"><button id="coupon-prompt-close" class="secondary-button" type="button">關閉<\/button><button id="coupon-prompt-go" class="primary-button" type="button">查看獎勵券<\/button><\/div>/);
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.ok(main.includes('rideRowNote(current.rawSteps, current.effectiveSteps, rode)'));   // FSD-08C S5
  const bound = referralView({ myCode: 'YOI-M01', own: { referrerName: 'A', boundAt: 'x', firstRideAt: null }, mine: [], busy: false });
  assert.match(bound, />模擬完成首次乘車（信用卡付款）<\/button>/);
  assert.match(bound, /<h3 class="points-record-title referral-bullet">您推薦的新戶狀態<\/h3>[^]*<h3 class="points-record-title referral-bullet">您的新戶狀態<\/h3>/);
  assert.match(referralView({ myCode: 'YOI-M01', own: null, mine: [], busy: false }), /<label for="referral-input" class="referral-label">填寫朋友的推薦碼/);
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  assert.ok(css.includes('.yo-panel p.yo-muted, .yo-panel p.yo-status, .yo-panel p.yo-hint, .yo-panel p.team-progress-note'));
});

test('2026-10-06 third batch: empty team card without the icon; claim glow while points can be claimed; no empty-yesterday line', () => {
  const html = teamEmptyView(true);
  assert.match(html, /^<section class="yo-panel yo-empty team-empty"><h2>目前還沒有加入隊伍<\/h2>/);
  assert.doesNotMatch(html, /yo-empty-icon/);
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.ok(!main.includes('yo-claim-glow'));   // FSD-08C S4: the claim button has no glow
  assert.doesNotMatch(main, /伺服器確認：尚無昨日步數/);
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.yo-claim-glow::before \{ animation: none;/);
});

test('2026-10-06 fifth batch: 組建隊伍 with the glow (only when enabled), new wording', () => {
  const on = teamEmptyView(true);
  assert.match(on, /<p>組建隊伍，招募夥伴一起走；或輸入隊友分享的邀請碼。<\/p>/);
  assert.match(on, /<button id="create-team" class="yo-primary yo-full" type="button" data-team-action="create" >組建隊伍<\/button>/);   // UX-1010 F2: no glow
  assert.match(teamEmptyView(false), /<button id="create-team" class="yo-primary yo-full" type="button" data-team-action="create" disabled>組建隊伍<\/button>/);
  assert.doesNotMatch(readFileSync(new URL('../src/team/team-panel.ts', import.meta.url), 'utf8'), /已從伺服器確認：您目前不在任何隊伍/);
});

test('2026-10-06: 入帳 wording replaced; the team invite note is small like the referral note', () => {
  const src = ['../src/ui/views.ts', '../src/main.ts', '../src/rewards/rewards-panel.ts', '../src/referral/referral-panel.ts']
    .map((p) => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n');
  const visible = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.includes('不得視為正式入帳'));
  assert.equal(visible.filter((l) => l.includes('入帳')).length, 0);
  assert.match(inviteCardView({ kind: 'share', code: 'A1B2C3D4E5F60718', memberCount: 3 }), /複製邀請碼<\/button><p class="yo-muted">目前 3／5 人/);
});

test('2026-10-06: no sideways shift between pages on desktop (the scrollbar gutter is kept)', () => {
  assert.match(readFileSync(new URL('../src/style.css', import.meta.url), 'utf8'), /html \{ scrollbar-gutter: stable; \}/);
});
