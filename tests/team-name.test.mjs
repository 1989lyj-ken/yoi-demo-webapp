import test from 'node:test';
import assert from 'node:assert/strict';
import { checkTeamName, normalizeTeamName, parseTeamName, pickTeamTitle, TEAM_NAME_HINTS, TEAM_NAME_MAX, teamNameUnits, TeamNameFormatError } from '../src/team/team-name.ts';
import { teamRenameDialogView, teamView } from '../src/ui/views.ts';
import { TEAM_NAME_CASES } from './fixtures/team-name-cases.mjs';

// A JS mirror of the 03E Rules check (regex + size() in UTF-16 units, as pinned on the Emulator).
const rulesAccept = (name) => typeof name === 'string' && name.length <= 12 && /^[^\s\p{Z}\p{Cc}]([^\p{Cc}]*[^\s\p{Z}\p{Cc}])?$/u.test(name);

test('03E name table: the JS mirror agrees with every Emulator verdict of the shared table', () => {
  for (const { label, name, rules } of TEAM_NAME_CASES) assert.equal(rulesAccept(name), rules, label);
});

test('03E name check: whatever the browser accepts (after trimming) the Rules accept; never looser (B2/B3)', () => {
  for (const { label, name, rules } of TEAM_NAME_CASES) {
    const check = checkTeamName(name);
    if (!check.ok) continue;
    assert.ok(rulesAccept(check.name), `${label}: browser sends ${JSON.stringify(check.name)}`);
    if (check.name === name) assert.equal(rules, true, label);
  }
  // Extra edge spaces the Rules would refuse are trimmed away, not sent.
  for (const raw of [' 小隊', '小隊 ', '　小隊　', ' 小隊', '\t小隊\n']) assert.deepEqual(checkTeamName(raw), { ok: true, name: '小隊' });
});

test('03E name check: messages for blank, too long and control characters; UTF-16 count with an emoji as 2', () => {
  assert.deepEqual(checkTeamName(''), { ok: false, reason: 'empty', message: '請輸入隊名' });
  assert.deepEqual(checkTeamName(' 　 '), { ok: false, reason: 'empty', message: '請輸入隊名' });
  assert.equal(checkTeamName('一二三四五六七八九十甲乙丙').message, '隊名最多 12 個字');
  assert.equal(checkTeamName('小\n隊').message, '隊名不能換行');
  assert.equal(checkTeamName('小\t隊').reason, 'control');
  assert.equal(checkTeamName('一二三四五六七八九十甲乙').ok, true);
  assert.equal(teamNameUnits('\u{1F6B6}'.repeat(6)), 12);
  assert.equal(checkTeamName('\u{1F6B6}'.repeat(6)).ok, true);
  assert.equal(checkTeamName('\u{1F6B6}'.repeat(7)).reason, 'long');
  assert.equal(teamNameUnits('  ab  '), 2);
  assert.equal(normalizeTeamName('　走走　隊　'), '走走　隊');
  assert.equal(TEAM_NAME_MAX, 12);
});

test('03E name parse: only an exact confirmed document becomes a name', () => {
  const good = { sessionId: 's6', teamId: 'A1B2C3D4E5F60718', name: '走走隊', updatedBy: 'YOI-M01', updatedAt: { seconds: 1, nanoseconds: 0 }, clockVersion: 3 };
  assert.equal(parseTeamName(good, 's6', 'A1B2C3D4E5F60718'), '走走隊');
  for (const bad of [null, { ...good, extra: 1 }, { ...good, teamId: 'B1B2C3D4E5F60718' }, { ...good, sessionId: 's5' }, { ...good, name: ' 走走隊' },
    { ...good, name: '' }, { ...good, name: 12 }, { ...good, name: '一二三四五六七八九十甲乙丙' }, { ...good, clockVersion: '3' }]) {
    assert.throws(() => parseTeamName(bad, 's6', 'A1B2C3D4E5F60718'), TeamNameFormatError);
  }
});

const teamInput = (overrides = {}) => ({ status: 'active', memberCount: 2, inviteCode: 'A1B2C3D4E5F60718', leaderMemberId: 'YOI-M01', title: '走走隊', ...overrides });
const week = { total: 0, target: 300000, reachedAt: null, confirmed: true, pending: false, contributions: {}, pastMembers: [], previous: null, official: null, settling: false, own: null, need: null };

test('03E team card: the edit button sits next to the name for the captain only, in both card branches; the name is escaped', () => {
  for (const w of [week, null]) {
    const captain = teamView(teamInput({ canRename: true }), [], true, null, w);
    assert.match(captain, /<h2 id="team-name" class="team-card-title">走走隊<\/h2><button id="team-rename" class="yo-link team-rename" type="button" data-team-action="rename" aria-label="編輯隊名">/);
    assert.doesNotMatch(teamView(teamInput({ canRename: false }), [], true, null, w), /team-rename|data-team-action="rename"/);
    assert.doesNotMatch(teamView(teamInput(), [], true, null, w), /team-rename/);
  }
  const html = teamView(teamInput({ title: '<b>隊</b>"x"', canRename: true }), [], true, null, week);
  assert.ok(html.includes('&lt;b&gt;隊&lt;/b&gt;&quot;x&quot;'));
  assert.doesNotMatch(html, /<b>隊<\/b>/);
});

test('03E rename dialog: a labelled field without a value attribute, the counter, the four hints and the save state', () => {
  const html = teamRenameDialogView({ units: 3, max: 12, hints: TEAM_NAME_HINTS, busy: false, notice: null });
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="team-dialog-title"/);
  assert.match(html, /<label class="rename-label" for="team-rename-input">輸入隊名<\/label><input id="team-rename-input"/);
  assert.doesNotMatch(html, /value=|maxlength/);
  assert.match(html, /<p id="team-rename-count" class="rename-count" aria-live="polite">3／12<\/p>/);
  for (const hint of TEAM_NAME_HINTS) assert.ok(html.includes(`<li>${hint}</li>`), hint);
  assert.equal(TEAM_NAME_HINTS[0], '1～12 個字（表情符號算 2 個字），中文、英文、數字、符號或表情符號都可以');
  assert.match(html, /<button id="team-dialog-confirm" class="primary-button" type="button" >儲存<\/button>/);
  const over = teamRenameDialogView({ units: 13, max: 12, hints: TEAM_NAME_HINTS, busy: false, notice: '隊名最多 12 個字' });
  assert.match(over, /rename-count over/);
  assert.match(over, /<button id="team-dialog-confirm" class="primary-button" type="button" disabled>儲存<\/button>/);
  assert.match(over, /role="status">隊名最多 12 個字<\/p>/);
  const busy = teamRenameDialogView({ units: 3, max: 12, hints: TEAM_NAME_HINTS, busy: true, notice: null });
  assert.match(busy, /儲存中，請稍候…/);
  assert.match(busy, /<input id="team-rename-input"[^>]* disabled>/);
  assert.match(busy, /id="team-dialog-dismiss" class="secondary-button" type="button" disabled/);
});

test('03E title: the confirmed name of this team first; another team or no name falls back to the captain title', () => {
  const T = 'A1B2C3D4E5F60718';
  assert.equal(pickTeamTitle({ teamId: T, name: '走走隊' }, T, '小美的步行小隊'), '走走隊');
  assert.equal(pickTeamTitle({ teamId: 'B1B2C3D4E5F60718', name: '舊隊名' }, T, '小美的步行小隊'), '小美的步行小隊');
  assert.equal(pickTeamTitle({ teamId: T, name: null }, T, '小美的步行小隊'), '小美的步行小隊');
  assert.equal(pickTeamTitle(null, T, '我的步行小隊'), '我的步行小隊');
  assert.equal(pickTeamTitle(null, T, ''), '');
});
