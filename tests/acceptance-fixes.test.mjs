// FSD-AC1: fixes from the first manual acceptance (R1 save button, R3 display names, R4 copy, R5 previous week).
import test from 'node:test';
import assert from 'node:assert/strict';
import { canSubmitSteps } from '../src/daily/daily-state.ts';
import { showPreviousWeek, teamCreatedBefore } from '../src/team/contrib-state.ts';
import { MemberNames, parseProfile } from '../src/identity/member-names.ts';
import { teamDialogView, teamView } from '../src/ui/views.ts';
import { transferConfirmCopy } from '../src/team/team-state.ts';

const RANGE = '請輸入 0 到 1,000,000 的整數。';

test('R1 canSubmitSteps: only a whole number above the confirmed steps and within the cap', () => {
  assert.deepEqual(canSubmitSteps('4000', 4000), { ok: false, hint: '' });
  assert.deepEqual(canSubmitSteps('3999', 4000), { ok: false, hint: '步數只能增加，請輸入大於 4,000 的數字。' });
  assert.deepEqual(canSubmitSteps('4001', 4000), { ok: true, hint: '' });
  assert.deepEqual(canSubmitSteps(' 4001 ', 4000), { ok: true, hint: '' });
  assert.deepEqual(canSubmitSteps('0', 0), { ok: false, hint: '' });
  assert.deepEqual(canSubmitSteps('1', 0), { ok: true, hint: '' });
  for (const bad of ['', '   ', '4000.5', '1e3', '-1', '+5', '0x10', 'abc', '1000001']) {
    assert.deepEqual(canSubmitSteps(bad, 0), { ok: false, hint: RANGE }, bad);
  }
  assert.deepEqual(canSubmitSteps('1000000', 999999), { ok: true, hint: '' });
  assert.deepEqual(canSubmitSteps('1000000', 1000000), { ok: false, hint: '' });
});

test('R5 teamCreatedBefore: a team created on or after the Monday did not exist last week; bad input falls back to showing', () => {
  assert.equal(teamCreatedBefore('2026-10-05T09:00:00+08:00', '2026-10-05'), false);
  assert.equal(teamCreatedBefore('2026-10-05T00:00:00+08:00', '2026-10-05'), false);
  assert.equal(teamCreatedBefore('2026-10-04T23:59:59+08:00', '2026-10-05'), true);
  assert.equal(teamCreatedBefore('2026-09-30T12:00:00+08:00', '2026-10-05'), true);
  for (const bad of ['', '2026-10-05', '2026-10-05T09:00:00Z', '2026-10-05T09:00:00+08:00x', 'garbage']) {
    assert.equal(teamCreatedBefore(bad, '2026-10-05'), true, bad);
  }
});

test('R5 showPreviousWeek: hidden only for a team created this week with no previous total and no official result', () => {
  const thisWeek = '2026-10-05T09:00:00+08:00';
  const lastWeek = '2026-10-01T09:00:00+08:00';
  assert.equal(showPreviousWeek(thisWeek, '2026-10-05', 0, false), false);
  assert.equal(showPreviousWeek(thisWeek, '2026-10-05', 1, false), true);
  assert.equal(showPreviousWeek(thisWeek, '2026-10-05', 0, true), true);
  assert.equal(showPreviousWeek(lastWeek, '2026-10-05', 0, false), true);
  assert.equal(showPreviousWeek('bad', '2026-10-05', 0, false), true);
});

test('R3 parseProfile: exactly one non-blank displayName of at most 40 code points', () => {
  assert.equal(parseProfile({ displayName: '管理者Ken' }), '管理者Ken');
  assert.equal(parseProfile({ displayName: '  小美  ' }), '  小美  ');
  assert.equal(parseProfile({ displayName: '😀'.repeat(40) }), '😀'.repeat(40));
  for (const bad of [undefined, null, 'x', {}, { displayName: '' }, { displayName: '   ' }, { displayName: 5 },
    { displayName: 'a'.repeat(41) }, { displayName: '😀'.repeat(41) }, { displayName: 'ok', role: 'admin' }]) {
    assert.equal(parseProfile(bad), null, JSON.stringify(bad));
  }
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('R3 MemberNames: caches confirmed names, single-flights reads, falls back to the memberId', async () => {
  const reads = [];
  const data = { 'YOI-M02': { displayName: '小美' }, 'YOI-M03': { displayName: '' } };
  const names = new MemberNames(async (id) => { reads.push(id); if (id === 'YOI-M05') throw new Error('offline'); return data[id]; });
  let changes = 0;
  names.request(['YOI-M02', 'YOI-M02', 'YOI-M03', 'YOI-M04', 'YOI-M05'], 'r1', () => { changes += 1; });
  names.request(['YOI-M02'], 'r1', () => { changes += 1; });
  await flush();
  assert.deepEqual(reads, ['YOI-M02', 'YOI-M03', 'YOI-M04', 'YOI-M05']);
  assert.equal(changes, 1);
  assert.equal(names.label('YOI-M02'), '小美');
  assert.equal(names.label('YOI-M03'), 'YOI-M03'); // malformed
  assert.equal(names.label('YOI-M04'), 'YOI-M04'); // missing
  assert.equal(names.label('YOI-M05'), 'YOI-M05'); // read failed
  // The same roster never rereads a failure; a changed roster does; a known name is never reread.
  names.request(['YOI-M02', 'YOI-M03', 'YOI-M04', 'YOI-M05'], 'r1', () => undefined);
  await flush();
  assert.equal(reads.length, 4);
  data['YOI-M04'] = { displayName: '阿明' };
  names.request(['YOI-M02', 'YOI-M04'], 'r2', () => { changes += 1; });
  await flush();
  assert.deepEqual(reads.slice(4), ['YOI-M04']);
  assert.equal(names.label('YOI-M04'), '阿明');
  assert.equal(changes, 2);
});

test('R3 MemberNames: clear() drops cached names and any read still in flight', async () => {
  let release;
  const names = new MemberNames(() => new Promise((resolve) => { release = resolve; }));
  let changes = 0;
  names.request(['YOI-M02'], 'r1', () => { changes += 1; });
  names.clear();
  release({ displayName: '舊場次的名字' });
  await flush();
  assert.equal(changes, 0);
  assert.equal(names.name('YOI-M02'), null);
  // After clear the same member is read again.
  names.request(['YOI-M02'], 'r1', () => { changes += 1; });
  release({ displayName: '小美' });
  await flush();
  assert.equal(names.label('YOI-M02'), '小美');
  assert.equal(changes, 1);
});

test('R3/R4 views: names are escaped text, values stay memberIds, copy says 今日原始／今日有效／本週計入', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const nameOf = (id) => (id === 'YOI-M02' ? evil : id === 'YOI-M01' ? '管理者Ken' : id);
  const entries = [
    { memberId: 'YOI-M01', exists: true, pending: false, fromCache: false, rawSteps: 4000, effectiveSteps: 6000, rideCompleted: true },
    { memberId: 'YOI-M02', exists: true, pending: false, fromCache: false, rawSteps: 100, effectiveSteps: 100, rideCompleted: false },
  ];
  const week = { total: 4100, target: 300000, reachedAt: null, confirmed: true, pending: false,
    contributions: { 'YOI-M01': 4000, 'YOI-M02': 100, 'YOI-M03': 50 }, pastMembers: ['YOI-M03'],
    previous: null, official: null, settling: false, own: null, need: null };
  const html = teamView({ status: 'active', memberCount: 2, inviteCode: 'A1B2C3D4E5F60718', leaderMemberId: 'YOI-M01' }, entries, true, null, week, nameOf);
  assert.match(html, /<strong>管理者Ken・隊長<\/strong>/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  // FSD-08A-6 (team page redesign, product owner c): one small line "有效 N・乘車加成" and "本週 N 步" replace R4's wording.
  assert.match(html, /<small>今日乘車加成<\/small>/);   // 2026-10-06 (2): no personal 有效 N 步 on the team page
  assert.match(html, /本週 4,000 步/);
  assert.match(html, /YOI-M03・歷史成員<\/strong><\/span><small>本週 50 步（退團前的貢獻保留）/);
  // The default nameOf keeps the memberId (callers without names).
  assert.match(teamView({ status: 'active', memberCount: 2, inviteCode: 'A1B2C3D4E5F60718', leaderMemberId: 'YOI-M01' }, entries, true), /<strong>YOI-M01・隊長/);

  const dialog = teamDialogView({ title: 't', body: 'b', dismissLabel: 'd', confirmLabel: 'c',
    choices: [{ memberId: 'YOI-M02', label: evil, checked: true }, { memberId: 'YOI-M03', label: '小美', checked: false }] });
  assert.match(dialog, /value="YOI-M02" checked/);
  assert.match(dialog, /value="YOI-M03"/);
  assert.match(dialog, /<span>小美<\/span>/);
  assert.doesNotMatch(dialog, /<img/);
  assert.doesNotMatch(dialog, /value="[^"]*(小美|img)/);

  const confirm = teamDialogView(transferConfirmCopy('A&B <b>'));
  assert.match(confirm, /把隊長交給 A&amp;B &lt;b&gt;？/);
  assert.match(confirm, /確認交棒/); // FSD-08A-6 (4)
  assert.doesNotMatch(confirm, /<b>/);
});
