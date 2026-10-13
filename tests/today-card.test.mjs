import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { claimableOf, nodeStates, rideCelebration, rideMapNote, rideRowNote, stepsToNext, todaySentence, trackFraction, walkFor } from '../src/daily/today-card.ts';
import { appShellView, pointsTrackView, rewardsView, rideCelebrationView, rideNoteView, todaySayView } from '../src/ui/views.ts';

// FSD-08C (2026-10-07): UI-design/yoi-步數頁改版說明-20261007/demo-steps-page-handoff.md

test('S3: the sentence under the track, four states', () => {
  assert.deepEqual(todaySentence(1000, 0), { lead: '再走 1,000 步，就可以領 1 點', points: null, sub: null });
  assert.deepEqual(todaySentence(5000, 1), { lead: '有 1 點可以領', points: 1, sub: '再走 1,000 步，就可以再領 1 點' });
  assert.deepEqual(todaySentence(7500, 1), { lead: '有 2 點可以領', points: 2, sub: '今天的目標達成了' });
  assert.deepEqual(todaySentence(9300, 3), { lead: '今天的 3 點都領到了', points: null, sub: null });
  assert.deepEqual(todaySentence(0, 0), { lead: '再走 2,000 步，就可以領 1 點', points: null, sub: null });
  assert.equal(stepsToNext(6000), null);
  assert.equal(stepsToNext(3150), 850);
  assert.match(todaySayView(5000, 1), /<p class="pt-lead">有 <b>1 點<\/b>可以領<\/p><p class="pt-sub">再走 1,000 步，就可以再領 1 點<\/p>/);
  assert.equal(todaySayView(1000, 0), '<p class="pt-lead">再走 1,000 步，就可以領 1 點</p>');
});

test('S2: four circles, the fill and the floating shoe follow the steps', () => {
  assert.deepEqual(nodeStates(5000, 1), ['done', 'ready', 'locked']);
  assert.deepEqual(nodeStates(9300, 3), ['done', 'done', 'done']);
  assert.equal(trackFraction(5000), 5000 / 6000);
  assert.equal(trackFraction(9300), 1);
  const html = pointsTrackView(5000, 1);
  assert.match(html, /<i><b style="--w:100.00%"><\/b><\/i><i><b style="--w:100.00%"><\/b><\/i><i><b style="--w:50.00%"><\/b><\/i>/);
  assert.match(html, /class="pt-shoe" style="--at:83.33%"/);
  assert.match(html, /pt-node--done" data-at="1"><svg/);
  assert.match(html, /pt-node--ready" data-at="2">P</);
  assert.match(html, /pt-node--locked" data-at="3">P</);
  assert.match(html, /aria-label="今日點數進度：5,000 \/ 6,000 步，已領 1 點，1 點可以領"/);
  for (const t of ['>0<', '>2,000<', '>4,000<', '>6,000<']) assert.ok(html.includes(t), t);
});

test('S1/S4/S5: no milestone rows or raw/effective line; the claim button starts hidden; the ride task row', () => {
  const shell = appShellView({ role: 'member' });
  const today = shell.slice(shell.indexOf('data-day="today"'), shell.indexOf('data-subpanel="week"'));
  assert.doesNotMatch(today, /yo-milestone|原始|有效|最多 3 點／日/);
  assert.match(today, /<h2 id="today-title" tabindex="-1">今天的點數<\/h2>/);
  assert.match(today, /<button id="today-claim-all" class="yo-primary yo-full" type="button" hidden>領取 0 點<\/button>/);
  assert.match(today, /<strong>搭一趟 yoxi<\/strong><small id="today-ride-state">0 \/ 1・今天的步數變 1.5 倍<\/small>/);
  assert.match(today, /<button id="today-simulate-ride" class="ride-go" type="button"[^>]*>模擬一趟<\/button>/);
  assert.match(today, /<span id="today-ride-done" class="ride-done" hidden>/);
  assert.equal(rideRowNote(4000, 4000, false), '0 / 1・搭一趟，今天的目標直接達成');
  assert.equal(rideRowNote(3999, 3999, false), '0 / 1・今天的步數變 1.5 倍');
  assert.equal(rideRowNote(6500, 6500, false), '0 / 1・今天的步數變 1.5 倍');
  assert.equal(rideRowNote(5000, 7500, true), '1 / 1・今天的步數變 1.5 倍');
  // the controller: hidden with nothing to claim, "領取 N 點" claims everything, no glow
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.ok(main.includes('allButton.hidden = claimable === 0;'));
  assert.ok(!main.includes('yo-claim-glow'));
});

test('S6: the celebration wording follows the handoff examples', () => {
  const day = (rawSteps, ride, claimed) => ({ rawSteps, effectiveSteps: Math.floor(rawSteps * (ride ? 1.5 : 1)), claimed });
  assert.deepEqual(rideCelebration(day(5000, false, 1), day(5000, true, 1)), { from: 5000, to: 7500, note: '多了 1 點可以領', claimable: 2 });
  assert.deepEqual(rideCelebration(day(1000, false, 0), day(1000, true, 0)), { from: 1000, to: 1500, note: '再走 334 步，就可以領 1 點', claimable: 0 });   // UX-1010 F16: what is still to walk after the ride
  assert.deepEqual(rideCelebration(day(2100, false, 0), day(2100, true, 0)), { from: 2100, to: 3150, note: '再走 567 步，就可以領 1 點', claimable: 1 });
  assert.deepEqual(rideCelebration(day(6200, false, 3), day(6200, true, 3)), { from: 6200, to: 9300, note: '今天的 3 點都領到了', claimable: 0 });
  assert.equal(rideCelebration(day(6200, false, 1), day(6200, true, 1)).note, '今天的目標達成了');
  assert.equal(claimableOf(7500, 1), 2);
  const claim = rideCelebrationView({ from: 5000, to: 7500, note: '多了 1 點可以領', claimable: 2 });
  assert.match(claim, /role="dialog" aria-modal="true" aria-labelledby="rc-title"/);
  assert.match(claim, /<h2 id="rc-title" class="rc-slogan">Nice Ride!<\/h2>/);
  assert.match(claim, /<span>5,000<\/span><svg class="rc-ar"[^]*?<b id="rc-num" data-from="5000" data-to="7500">7,500<\/b><span>步<\/span>/);
  assert.match(claim, /data-action="claim">領取 2 點<\/button>/);
  assert.equal((claim.match(/class="rc-c rc-c--/g) ?? []).length, 16);
  assert.match(rideCelebrationView({ from: 6200, to: 9300, note: '今天的 3 點都領到了', claimable: 0 }), /data-action="close">知道了<\/button>/);
  // only a ride confirmed by the server in this transaction celebrates; the scrim does not close it
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.ok(main.includes('if (command.type === "ride" && confirmed.eventSeq > before.eventSeq && before.rideCompletedAt === null && confirmed.rideCompletedAt !== null) rode = confirmed;'));
  const shell = readFileSync(new URL('../src/app/app-shell.ts', import.meta.url), 'utf8');
  const celebrate = shell.slice(shell.indexOf('function celebrateRide'), shell.indexOf('function closeRide'));
  assert.ok(!celebrate.includes('el === ride'));
  assert.ok(celebrate.includes('prefers-reduced-motion: reduce'));
});

test('S8: the map shows the effective steps with the ride line; yesterday shows steps, points to claim and the ride', () => {
  assert.equal(rideMapNote(5000), '實際走了 5,000 步，搭 yoxi 變 1.5 倍');
  const shell = appShellView({ role: 'member' });
  assert.doesNotMatch(shell, /map-ride-note/);   // UX-1010 F16: the line lives in the card now
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.ok(main.includes('shell?.setTodaySteps(state ? { raw: state.rawSteps, effective: state.effectiveSteps, ride: state.rideCompletedAt !== null } : null);'));
  const yesterday = shell.slice(shell.indexOf('data-day="yesterday"'));
  assert.match(yesterday, /<h2 id="yesterday-title" tabindex="-1">昨天的點數<\/h2>/);
  for (const t of ['<dt>昨天走了</dt>', '<dt>可以補領</dt>', '<dt>搭車加成</dt>', 'id="yesterday-claimable"', 'id="yesterday-steps-input"']) assert.ok(yesterday.includes(t), t);
  assert.match(yesterday, /<button id="yesterday-claim-all" class="yo-primary yo-full" type="button" hidden>補領 0 點<\/button>/);
  assert.doesNotMatch(yesterday.slice(0, yesterday.indexOf('</section>')), /class="pt"/);
});

test('2026-10-07: the referral simulation note is its own card at the bottom of the 新戶 tab', () => {
  const shell = appShellView({ role: 'member' });
  const tab = shell.slice(shell.indexOf('id="invite-panel-referral"'));
  const panel = tab.slice(0, tab.indexOf('</div>\n', tab.indexOf('</aside>')) + 6);
  assert.ok(panel.indexOf('id="referral-error"') < panel.indexOf('<aside class="yo-panel app-privacy-card" aria-label="推薦新戶說明"><p class="yo-muted">推薦新戶為模擬流程：不建立新帳號、不產生真實訂單或付款。</p></aside>'));
  const views = readFileSync(new URL('../src/ui/views.ts', import.meta.url), 'utf8');
  assert.equal(views.split('推薦新戶為模擬流程').length, 2);
});

// ----- UX-1010 (2026-10-12) -----

test('F16: after a ride "再走 N 步" is what is still to walk (gap ÷ 1.5, rounded up); the ride line sits in the card', () => {
  assert.equal(walkFor(1000, false), 1000);
  assert.equal(walkFor(1000, true), 667);
  assert.equal(walkFor(1500, true), 1000);
  assert.equal(walkFor(500, true), 334);
  assert.deepEqual(todaySentence(3000, 1, true), { lead: '再走 667 步，就可以領 1 點', points: null, sub: null });
  assert.equal(todaySentence(4500, 1, true).sub, '再走 1,000 步，就可以再領 1 點');
  assert.equal(todaySentence(3000, 1, false).lead, '再走 1,000 步，就可以領 1 點');
  assert.equal(rideNoteView(2000, true), '實際走了 <b>2,000</b> 步，搭 yoxi 變 1.5 倍');
  assert.equal(rideNoteView(0, true), '');
  assert.equal(rideNoteView(2000, false), '');
  const today = appShellView({ role: 'member' }).split('data-day="today"')[1];
  assert.ok(today.indexOf('id="today-trip"') < today.indexOf('id="today-ride-note"') && today.indexOf('id="today-ride-note"') < today.indexOf('id="today-say"'));
});

test('F9: with no steps the card says what to do first and offers the steps field', () => {
  assert.equal(todaySayView(0, 0, false, 0), '<p class="pt-lead">先加一些步數試試</p><p class="pt-sub">這是展示版，步數用輸入的。每 2,000 步可以領 1 點</p>');
  assert.match(todaySayView(5000, 1, false, 5000), /有 <b>1 點<\/b>可以領/);
  const today = appShellView({ role: 'member' }).split('data-day="today"')[1];
  assert.match(today, /<div id="today-zero" class="pt-zero" hidden><button type="button" class="yo-primary yo-full" data-open-steps>輸入今天的步數<\/button><\/div>/);
  assert.ok(readFileSync(new URL('../src/app/app-shell.ts', import.meta.url), 'utf8').includes('if (el.closest("[data-open-steps]")) openSheet();'));
});

test('F17: a ride with no steps yet says what happens next and leads to the steps field', () => {
  const c = rideCelebration({ rawSteps: 0, effectiveSteps: 0, claimed: 0 }, { rawSteps: 0, effectiveSteps: 0, claimed: 0 });
  assert.equal(c.zero, true);
  const html = rideCelebrationView(c);
  assert.match(html, /<p class="rc-t">今天走的步數都會變 1\.5 倍<\/p>\s*<p class="rc-n" hidden>/);
  assert.match(html, /還沒有步數，先輸入今天走了幾步/);
  assert.match(html, /data-action="steps">輸入步數<\/button>/);
  assert.match(rideCelebrationView({ from: 5000, to: 7500, note: '多了 1 點可以領', claimable: 2 }), /data-action="claim">領取 2 點/);
  assert.ok(readFileSync(new URL('../src/app/app-shell.ts', import.meta.url), 'utf8').includes('if (action === "steps") openSheet();'));
});

test('F15: a confirmed claim shows a toast with the points and what they are worth', async () => {
  const { claimToast } = await import('../src/app/toast.ts');
  assert.equal(claimToast('today', 2), '已領取 2 點，可以折 $2 車資');
  assert.equal(claimToast('yesterday', 1), '已補領 1 點，可以折 $1 車資');
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.ok(main.includes('if (command.type === "claimAll" && confirmed.claimed > before.claimed) showToast(claimToast(day, confirmed.claimed - before.claimed));'));
});

test('F3/F4: plain words', () => {
  const shell = appShellView({ role: 'member' });
  assert.match(shell, /<h2 id="steps-sheet-title" tabindex="-1">今天走了幾步？<\/h2>/);
  assert.match(shell, /<label for="today-steps-input">只能往上加<\/label>/);
  assert.match(shell, /<label for="yesterday-steps-input">補上昨天的步數（只能往上加）<\/label>/);
  assert.ok(readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8').includes('q("deadline").textContent = "今晚 23:59 前可以補領";'));
  assert.match(rewardsView({ balance: 3, chests: [], rows: [], canOpen: true }, 'balance'), /<p class="points-use">1 點可折 1 元 yoxi 車資<\/p>/);
});
