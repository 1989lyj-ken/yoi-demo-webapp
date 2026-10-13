import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyTeamError, joinOutcome, leaveDialogCopy, leaveExpectation, leaveMode, leaveOutcome, matchesLeaveExpectation,
  matchesTransferExpectation, memberLock, nextMonday, parseMembership, parseTeam, successorOf, teamControls,
  TeamFormatError, transferConfirmCopy, transferExpectation, transferOutcome, weekStateOf,
} from '../src/team/team-state.ts';

const S = 's9';
const T = 'A1B2C3D4E5F60718';
const WEEK = '2026-09-28';
const NOW = '2026-10-01T12:00:00+08:00';
const team = (overrides = {}) => ({ sessionId: S, teamId: T, leaderMemberId: 'YOI-M01', memberIds: ['YOI-M01', 'YOI-M02'], inviteCode: T,
  status: 'active', clockVersion: 4, createdAt: NOW, everFormed: true, nextJoinOrder: 2, revision: 1, ...overrides });
const active = (overrides = {}) => ({ sessionId: S, memberId: 'YOI-M01', teamId: T, joinOrder: 0, clockVersion: 4, status: 'active',
  joinedAt: NOW, leftTeamId: null, leftWeekId: null, leftAt: null, ...overrides });
const left = (overrides = {}) => active({ teamId: null, status: 'left', leftTeamId: T, leftWeekId: WEEK, leftAt: NOW, ...overrides });
const ctx = (overrides = {}) => ({ scenarioNow: NOW, activityWeekId: WEEK, ...overrides });

test('nextMonday adds seven UTC days across month, year and leap boundaries', () => {
  assert.equal(nextMonday('2026-09-28'), '2026-10-05');
  assert.equal(nextMonday('2026-12-28'), '2027-01-04');
  assert.equal(nextMonday('2028-02-28'), '2028-03-06');
  assert.throws(() => nextMonday('2026-02-30'));
  assert.throws(() => nextMonday('2026-9-28'));
});

test('memberLock truth table matches the Rules canJoin (missing week, null week, same week, later week)', () => {
  const cases = [
    // tombstone, activityWeekId, locked
    [null, WEEK, false], [null, undefined, false],
    [{ leftWeekId: null }, WEEK, false], [{ leftWeekId: null }, undefined, false],
    [{ leftWeekId: WEEK }, undefined, true], [{ leftWeekId: WEEK }, null, true], [{ leftWeekId: WEEK }, '', true],
    [{ leftWeekId: WEEK }, WEEK, true],
    [{ leftWeekId: WEEK }, '2026-10-05', false],
  ];
  for (const [tombstone, week, locked] of cases) assert.equal(memberLock(tombstone, week).locked, locked, JSON.stringify([tombstone, week]));
  assert.deepEqual(memberLock({ leftWeekId: WEEK }, WEEK), { locked: true, reason: 'sameWeek', unlockDate: '2026-10-05' });
  assert.equal(memberLock({ leftWeekId: WEEK }, undefined).reason, 'noWeek');
});

test('weekStateOf requires the shared week to exist and match the scenario date', () => {
  assert.equal(weekStateOf(ctx()), 'ok');
  assert.equal(weekStateOf(ctx({ activityWeekId: undefined })), 'missing');
  assert.equal(weekStateOf(ctx({ activityWeekId: '2026-09-21' })), 'mismatch');
  assert.equal(weekStateOf({ scenarioNow: 'bad', activityWeekId: WEEK }), 'mismatch');
});

test('leave mode follows everFormed, so a paused one-person team is a real leave', () => {
  assert.equal(leaveMode(team({ everFormed: false, status: 'recruiting', memberIds: ['YOI-M01'] })), 'cancel');
  assert.equal(leaveMode(team({ everFormed: true, status: 'paused', memberIds: ['YOI-M01'] })), 'leave');
  assert.equal(leaveMode(team()), 'leave');
});

test('successor is the first remaining member in join order', () => {
  assert.equal(successorOf({ memberIds: ['A', 'B', 'C'] }, 'A'), 'B');
  assert.equal(successorOf({ memberIds: ['A', 'B', 'C'] }, 'B'), 'A');
  assert.equal(successorOf({ memberIds: ['A'] }, 'A'), null);
});

test('leave expectation ignores revision (a join must not interrupt) but catches mode and succession changes', () => {
  const before = team({ memberIds: ['YOI-M01', 'YOI-M02'], revision: 1 });
  const expected = leaveExpectation(before);
  assert.equal(matchesLeaveExpectation(team({ memberIds: ['YOI-M01', 'YOI-M02', 'YOI-M03'], revision: 2 }), expected), true);
  assert.equal(matchesLeaveExpectation(team({ everFormed: false, status: 'recruiting', memberIds: ['YOI-M01'] }), expected), false);
  assert.equal(matchesLeaveExpectation(team({ leaderMemberId: 'YOI-M02' }), expected), false);
  assert.equal(matchesLeaveExpectation(team({ memberIds: ['YOI-M02', 'YOI-M01'] }), expected), false);
  assert.equal(matchesLeaveExpectation(team({ teamId: 'B1B2C3D4E5F60718' }), expected), false);
});

test('transfer expectation is pinned to the revision', () => {
  const expected = transferExpectation(team({ revision: 3 }));
  assert.equal(matchesTransferExpectation(team({ revision: 3 }), expected), true);
  assert.equal(matchesTransferExpectation(team({ revision: 4 }), expected), false);
});

test('leave outcome after an unconfirmed write', () => {
  const before = { teamId: T };
  assert.equal(leaveOutcome(left(), before), 'effective');
  assert.equal(leaveOutcome(active(), before), 'not-effective');
  assert.equal(leaveOutcome(null, before), 'changed');
  assert.equal(leaveOutcome(active({ teamId: 'B1B2C3D4E5F60718' }), before), 'changed');
  assert.equal(leaveOutcome(left({ leftTeamId: 'B1B2C3D4E5F60718' }), before), 'changed');
});

test('transfer outcome uses the monotonic revision, never "leader equals target" (concurrency table)', () => {
  const before = { teamId: T, revision: 2 };
  // Nothing landed: still the same revision and still in the team.
  assert.equal(transferOutcome(active(), team({ revision: 2 }), before), 'not-effective');
  // My transfer landed (revision up): changed, so no resend even though I am no longer the leader.
  assert.equal(transferOutcome(active(), team({ revision: 3, leaderMemberId: 'YOI-M02' }), before), 'changed');
  // Transferred to B, then B transferred back to me: leader equals me again but the revision moved on.
  assert.equal(transferOutcome(active(), team({ revision: 4, leaderMemberId: 'YOI-M01' }), before), 'changed');
  // Transferred to B, then B left and I succeeded as captain again.
  assert.equal(transferOutcome(active(), team({ revision: 4, memberIds: ['YOI-M01'], status: 'paused' }), before), 'changed');
  // Another member left concurrently, or I left in another window.
  assert.equal(transferOutcome(active(), team({ revision: 3 }), before), 'changed');
  assert.equal(transferOutcome(left(), null, before), 'changed');
  assert.equal(transferOutcome(active(), null, before), 'changed');
});

test('join outcome: active on target is effective; leaving it again is only "changed"', () => {
  assert.equal(joinOutcome(active(), T), 'effective');
  assert.equal(joinOutcome(left(), T), 'changed');
  assert.equal(joinOutcome(left({ leftTeamId: 'B1B2C3D4E5F60718' }), T), 'not-effective');
  assert.equal(joinOutcome(null, T), 'not-effective');
  assert.equal(joinOutcome(active({ teamId: 'B1B2C3D4E5F60718' }), T), 'not-effective');
});

test('classifyTeamError separates a rejected read (precondition) from a commit that may have landed', () => {
  for (const code of ['permission-denied', 'aborted', 'unavailable', 'deadline-exceeded', 'unknown', 'internal', 'cancelled']) {
    assert.equal(classifyTeamError(code, 'commit'), 'unconfirmed', code);
  }
  assert.equal(classifyTeamError('permission-denied', 'read'), 'precondition');
  assert.equal(classifyTeamError('unavailable', 'read'), 'unconfirmed');
  assert.equal(classifyTeamError('failed-precondition', 'commit'), 'other');
  assert.equal(classifyTeamError('resource-exhausted', 'read'), 'other');
  assert.equal(classifyTeamError(undefined, 'commit'), 'other');
});

test('parseTeam accepts the exact Rules-created shapes and refuses everything else', () => {
  assert.equal(parseTeam(team(), S, T).revision, 1);
  assert.equal(parseTeam(team({ status: 'recruiting', everFormed: false, memberIds: ['YOI-M01'], nextJoinOrder: 1, revision: 0 }), S, T).status, 'recruiting');
  assert.equal(parseTeam(team({ status: 'paused', memberIds: ['YOI-M02'], leaderMemberId: 'YOI-M02', nextJoinOrder: 2 }), S, T).status, 'paused');
  assert.equal(parseTeam(team({ status: 'archived', memberIds: [], leaderMemberId: null }), S, T).status, 'archived');
  const bad = [
    { extra: 1 }, { everFormed: undefined }, { status: 'paused' }, { status: 'recruiting' }, { status: 'active', memberIds: ['YOI-M01'], nextJoinOrder: 1 },
    { status: 'archived' }, { leaderMemberId: 'YOI-M09' }, { leaderMemberId: null }, { memberIds: ['YOI-M01', 'YOI-M01'] },
    { memberIds: ['A', 'B', 'C', 'D', 'E', 'F'], nextJoinOrder: 6 }, { nextJoinOrder: 1 }, { revision: -1 }, { revision: 1.5 },
    { inviteCode: 'B1B2C3D4E5F60718' }, { createdAt: 5 }, { sessionId: 'other' }, { teamId: 'B1B2C3D4E5F60718' },
  ];
  for (const override of bad) {
    const value = team(override);
    for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
    assert.throws(() => parseTeam(value, S, T), TeamFormatError, JSON.stringify(override));
  }
  // The pre-03B shape (no everFormed / nextJoinOrder / revision) is no longer tolerated.
  const legacy = team();
  delete legacy.everFormed; delete legacy.nextJoinOrder; delete legacy.revision;
  assert.throws(() => parseTeam(legacy, S, T), TeamFormatError);
  assert.throws(() => parseTeam(null, S, T), TeamFormatError);
});

test('parseMembership keeps the active and left shapes apart and refuses the old five-field index', () => {
  assert.equal(parseMembership(active(), S, 'YOI-M01').status, 'active');
  assert.equal(parseMembership(left(), S, 'YOI-M01').leftWeekId, WEEK);
  assert.equal(parseMembership(left({ leftWeekId: null }), S, 'YOI-M01').leftWeekId, null);
  const bad = [
    { teamId: null }, { joinedAt: null }, { leftTeamId: T }, { leftWeekId: WEEK }, { leftAt: NOW }, { memberId: 'YOI-M02' }, { sessionId: 'other' },
    { joinOrder: -1 }, { clockVersion: 1.5 }, { status: 'pending' }, { extra: true },
  ];
  for (const override of bad) assert.throws(() => parseMembership(active(override), S, 'YOI-M01'), TeamFormatError, JSON.stringify(override));
  for (const override of [{ teamId: T }, { leftTeamId: null }, { leftAt: null }, { leftWeekId: '2026-9-28' }]) {
    assert.throws(() => parseMembership(left(override), S, 'YOI-M01'), TeamFormatError, JSON.stringify(override));
  }
  assert.throws(() => parseMembership({ sessionId: S, memberId: 'YOI-M01', teamId: T, joinOrder: 0, clockVersion: 4 }, S, 'YOI-M01'), TeamFormatError);
});

test('teamControls fails closed on unconfirmed state, busy, missing or mismatched week, and week lock', () => {
  const base = { confirmed: true, busy: false, selfId: 'YOI-M01', context: ctx(), team: null, tombstone: null };
  assert.equal(teamControls(base).canCreateJoin, true);
  assert.equal(teamControls({ ...base, confirmed: false }).canCreateJoin, false);
  assert.equal(teamControls({ ...base, busy: true }).canCreateJoin, false);
  // Week lock after a real leave; cancelling a recruitment never locks.
  const locked = teamControls({ ...base, tombstone: { leftWeekId: WEEK } });
  assert.equal(locked.canCreateJoin, false);
  assert.match(locked.notice, /2026-10-05/);
  assert.equal(teamControls({ ...base, tombstone: { leftWeekId: null } }).canCreateJoin, true);
  assert.equal(teamControls({ ...base, tombstone: { leftWeekId: WEEK }, context: ctx({ activityWeekId: '2026-10-05', scenarioNow: '2026-10-05T09:00:00+08:00' }) }).canCreateJoin, true);
  const noWeek = teamControls({ ...base, tombstone: { leftWeekId: WEEK }, context: ctx({ activityWeekId: undefined }) });
  assert.equal(noWeek.canCreateJoin, false);
  assert.match(noWeek.notice, /尚未設定活動週/);
  // Never locked and no week: Rules still allow creating, so the UI does too.
  assert.equal(teamControls({ ...base, context: ctx({ activityWeekId: undefined }) }).canCreateJoin, true);
});

test('teamControls: leave and transfer need an operable week; only the captain of 2+ may transfer', () => {
  const formed = team();
  const base = { confirmed: true, busy: false, selfId: 'YOI-M01', context: ctx(), team: formed, tombstone: null };
  assert.deepEqual([teamControls(base).canLeave, teamControls(base).canTransfer, teamControls(base).leaveMode], [true, true, 'leave']);
  assert.equal(teamControls({ ...base, selfId: 'YOI-M02' }).canTransfer, false);
  assert.equal(teamControls({ ...base, selfId: 'YOI-M02' }).canLeave, true);
  const solo = team({ status: 'recruiting', everFormed: false, memberIds: ['YOI-M01'], nextJoinOrder: 1, revision: 0 });
  const soloControls = teamControls({ ...base, team: solo });
  assert.deepEqual([soloControls.canLeave, soloControls.canTransfer, soloControls.leaveMode], [true, false, 'cancel']);
  const paused = teamControls({ ...base, team: team({ status: 'paused', memberIds: ['YOI-M01'], nextJoinOrder: 2 }) });
  assert.deepEqual([paused.canLeave, paused.canTransfer, paused.leaveMode], [true, false, 'leave']);
  for (const context of [ctx({ activityWeekId: undefined }), ctx({ activityWeekId: '2026-09-21' })]) {
    const c = teamControls({ ...base, context });
    assert.deepEqual([c.canLeave, c.canTransfer], [false, false]);
    assert.ok(c.notice);
    // Cancelling a recruitment also needs the shared week (the Rules require it too).
    assert.equal(teamControls({ ...base, team: solo, context }).canLeave, false);
  }
  assert.equal(teamControls({ ...base, confirmed: false }).canLeave, false);
  assert.equal(teamControls({ ...base, busy: true }).canTransfer, false);
  assert.equal(teamControls({ ...base, team: team({ status: 'archived', memberIds: [], leaderMemberId: null }) }).canLeave, false);
});

test('dialog copy: PRD wording, week lock date, succession and cancel-without-lock', () => {
  const formed = team({ memberIds: ['YOI-M01', 'YOI-M02', 'YOI-M03'], nextJoinOrder: 3 });
  const asMember = leaveDialogCopy(formed, 'YOI-M02', { activityWeekId: WEEK });
  assert.equal(asMember.title, '退出隊伍？');
  assert.match(asMember.body, /已貢獻的步數會保留/);
  assert.match(asMember.body, /寶箱資格可能失去/);
  assert.match(asMember.body, /下週一 2026-10-05/);
  assert.doesNotMatch(asMember.body, /寶箱功能後續開放/); // FSD-08A-6 (1): chests are live
  assert.doesNotMatch(asMember.body, /團隊貢獻與寶箱/);
  assert.doesNotMatch(asMember.body, /接任/);
  assert.deepEqual([asMember.dismissLabel, asMember.confirmLabel], ['先不要', '確認退出']);
  const asLeader = leaveDialogCopy(formed, 'YOI-M01', { activityWeekId: WEEK });
  // FSD-08A-6 (2): the successor's display name; never the memberId.
  assert.match(asLeader.body, /退出後由 下一位隊員 接任/);
  assert.match(leaveDialogCopy(formed, 'YOI-M01', { activityWeekId: WEEK }, false, (id) => (id === 'YOI-M02' ? '小美' : null)).body, /退出後由 小美 接任/);
  assert.doesNotMatch(asLeader.body, /YOI-M02/);
  const lastMember = leaveDialogCopy(team({ status: 'paused', memberIds: ['YOI-M01'], nextJoinOrder: 3 }), 'YOI-M01', { activityWeekId: WEEK });
  assert.match(lastMember.body, /退出後隊伍會封存/);
  const cancel = leaveDialogCopy(team({ status: 'recruiting', everFormed: false, memberIds: ['YOI-M01'], nextJoinOrder: 1 }), 'YOI-M01', { activityWeekId: WEEK });
  assert.equal(cancel.title, '取消這次招募？');
  assert.doesNotMatch(cancel.body, /本週不能/);
  assert.deepEqual([cancel.dismissLabel, cancel.confirmLabel], ['保留招募', '取消招募']);
  assert.equal(transferConfirmCopy('YOI-M02').confirmLabel, '確認交棒');
});

test('parseTeam keeps status and everFormed consistent (the Rules write them together)', () => {
  const solo = { memberIds: ['YOI-M01'], leaderMemberId: 'YOI-M01', nextJoinOrder: 1 };
  // paused is a team that once formed; recruiting never did; active needs two or more members and a past formation.
  assert.throws(() => parseTeam(team({ ...solo, status: 'paused', everFormed: false }), S, T), TeamFormatError);
  assert.throws(() => parseTeam(team({ status: 'active', everFormed: false }), S, T), TeamFormatError);
  assert.throws(() => parseTeam(team({ ...solo, status: 'recruiting', everFormed: true }), S, T), TeamFormatError);
  // The matching combinations stay accepted.
  assert.equal(parseTeam(team({ ...solo, status: 'paused', everFormed: true }), S, T).status, 'paused');
  assert.equal(parseTeam(team({ ...solo, status: 'recruiting', everFormed: false }), S, T).status, 'recruiting');
});

test('teamControls: an archived team that still lists me, or a team I am not in, offers no leave', () => {
  const base = { confirmed: true, busy: false, selfId: 'YOI-M01', context: ctx(), tombstone: null };
  // Archived with a non-empty roster is invalid data, but the control must still not depend on it being empty.
  const archivedWithMe = team({ status: 'archived', memberIds: ['YOI-M01'], leaderMemberId: 'YOI-M01' });
  assert.equal(teamControls({ ...base, team: archivedWithMe }).canLeave, false);
  assert.equal(teamControls({ ...base, team: team() }).canLeave, true);
  // Not in the roster: nothing to leave.
  assert.equal(teamControls({ ...base, selfId: 'YOI-M09', team: team() }).canLeave, false);
  assert.equal(teamControls({ ...base, selfId: 'YOI-M09', team: team() }).canTransfer, false);
});
