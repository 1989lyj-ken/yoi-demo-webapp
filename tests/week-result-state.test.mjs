import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { replayTeamWeek, compareMoments } from '../src/team/contrib-state.ts';
import {
  dailyNeed, latestStints, membersAt, ownAwardStatus, parseAward, parseWeekResult, settlementPlan, WeekResultFormatError,
} from '../src/team/week-result-state.ts';
import { leaveDialogCopy } from '../src/team/team-state.ts';
import { teamEmptyView, teamView } from '../src/ui/views.ts';

const S = 's9';
const T = 'A1B2C3D4E5F60718';
const DAY = '2026-09-30';
const WEEK = '2026-09-28';
const at = (hhmmss, day = DAY) => `${day}T${hhmmss}+08:00`;
const st = (seconds, nanoseconds = 0) => ({ seconds, nanoseconds });
const m = (hhmmss, server, day = DAY) => ({ at: at(hhmmss, day), server: st(server) });
const ev = (revision, type, target, hhmmss, server) => ({ revision, type, targetMemberId: target, effectiveAt: at(hhmmss), serverRecordedAt: st(server) });
const record = (first, current = first, revision = compareMoments(first, current) === 0 ? 0 : 1) =>
  ({ sessionId: S, teamId: T, weekId: WEEK, first, current, reachingEntryId: 'YOI-M01_2026-09-30_1', revision });

test('replayTeamWeek reports the reaching entry with its server time', () => {
  const entry = (o) => ({ sessionId: S, teamId: T, weekId: WEEK, memberId: 'YOI-M01', taskDate: DAY, seq: 1, kind: 'steps', eligibleRawDelta: 1000,
    occurredAt: at('12:00:00'), syncedAt: st(100), joinRevision: 0, ...o });
  const week = replayTeamWeek([entry({ eligibleRawDelta: 200_000 }), entry({ seq: 2, eligibleRawDelta: 100_000, occurredAt: at('13:00:00'), syncedAt: st(200, 5) })], WEEK);
  assert.deepEqual(week.reaching, { entryId: 'YOI-M01_2026-09-30_2', occurredAt: at('13:00:00'), syncedAt: st(200, 5) });
  assert.equal(replayTeamWeek([entry({ eligibleRawDelta: 299_999 })], WEEK).reaching, null); // P12: 299,999 is not reached
});

test('parseWeekResult and parseAward accept only the fixed shapes', () => {
  const ts = (s) => ({ seconds: s, nanoseconds: 0 });
  const stored = { sessionId: S, teamId: T, weekId: WEEK, firstReachedAt: at('15:00:00'), firstReachedSyncedAt: ts(9), reachedAt: at('12:00:00'),
    reachedSyncedAt: ts(5), reachingEntryId: 'YOI-M01_2026-09-30_2', revision: 1, firstRecordedAt: ts(9), updatedAt: ts(10), updatedBy: 'YOI-M01' };
  const r = parseWeekResult(stored, S, T, WEEK);
  assert.equal(r.first.at, at('15:00:00'));
  assert.equal(r.current.at, at('12:00:00'));
  for (const o of [{ revision: 0 }, { reachedAt: at('16:00:00') }, { extra: 1 }, { teamId: 'X' }, { reachedSyncedAt: null }]) {
    assert.throws(() => parseWeekResult({ ...stored, ...o }, S, T, WEEK), WeekResultFormatError, JSON.stringify(o));
  }
  const award = { sessionId: S, weekId: WEEK, memberId: 'YOI-M02', teamId: T, reachedAt: at('15:00:00'), reachedSyncedAt: ts(9),
    joinRevision: 1, leaveRevision: 0, basis: 'first', grantedBy: 'YOI-M01', grantedAt: ts(11) };
  assert.equal(parseAward(award, S, WEEK, 'YOI-M02').basis, 'first');
  for (const o of [{ basis: 'x' }, { joinRevision: -1 }, { teamId: 'a1b2' }, { memberId: 'YOI-M03' }]) {
    assert.throws(() => parseAward({ ...award, ...o }, S, WEEK, 'YOI-M02'), WeekResultFormatError, JSON.stringify(o));
  }
});

test('latestStints finds the founder by replaying the roster backwards, and keeps only the latest stint', () => {
  // A founds, B joins (rev1), C joins (rev2), captain to B (rev3), A leaves (rev4), D joins (rev5), C leaves (rev6), A rejoins (rev7).
  const events = [ev(1, 'join', 'B', '09:00:00', 1), ev(2, 'join', 'C', '10:00:00', 2), ev(3, 'transferCaptain', 'B', '10:30:00', 3),
    ev(4, 'leave', 'A', '11:00:00', 4), ev(5, 'join', 'D', '12:00:00', 5), ev(6, 'leave', 'C', '13:00:00', 6), ev(7, 'join', 'A', '14:00:00', 7)];
  const stints = latestStints(events, ['B', 'D', 'A']);
  const by = Object.fromEntries(stints.map((s) => [s.memberId, s]));
  assert.deepEqual([by.A.joinRevision, by.A.leaveRevision, by.A.start.at], [7, 0, at('14:00:00')]); // the founder's latest stint is its rejoin
  assert.deepEqual([by.C.joinRevision, by.C.leaveRevision], [2, 6]);
  assert.equal(by.B.start.at, at('09:00:00'));
  // Founder still in the team: start null (since creation).
  const simple = latestStints([ev(1, 'join', 'B', '09:00:00', 1)], ['A', 'B']);
  assert.equal(simple.find((s) => s.memberId === 'A').start, null);
  // Inconsistent histories fail closed.
  assert.equal(latestStints([ev(1, 'join', 'B', '09:00:00', 1)], ['A', 'C']), null);              // join target not on the roster
  assert.equal(latestStints([ev(1, 'join', 'B', '09:00:00', 1), ev(2, 'leave', 'B', '10:00:00', 2)], ['A', 'B']), null); // leave target still on the roster
  assert.equal(latestStints([ev(1, 'cancelRecruiting', 'A', '09:00:00', 1)], []), null);
  assert.equal(latestStints([ev(2, 'join', 'B', '09:00:00', 1)], ['A', 'B']), null);              // missing revision 1
  assert.equal(latestStints([], ['A', 'B']), null);                                             // two left at revision 0
});

test('membersAt: started strictly before M and gone strictly after M; ties use the server time', () => {
  const events = [ev(1, 'join', 'B', '10:00:00', 100), ev(2, 'join', 'C', '12:00:00', 200), ev(3, 'leave', 'B', '14:00:00', 300)];
  const stints = latestStints(events, ['A', 'C']);
  const ids = (moment) => membersAt(stints, moment).map((s) => s.memberId).sort();
  assert.deepEqual(ids(m('11:00:00', 150)), ['A', 'B']);
  assert.deepEqual(ids(m('12:00:00', 199)), ['A', 'B']);         // same scenario time as C's join, earlier server time
  assert.deepEqual(ids(m('12:00:00', 201)), ['A', 'B', 'C']);
  assert.deepEqual(ids(m('14:00:00', 299)), ['A', 'B', 'C']);    // just before B's leave
  assert.deepEqual(ids(m('14:00:00', 301)), ['A', 'C']);         // reached after B left: B has no award
  const left = membersAt(stints, m('13:00:00', 250)).find((s) => s.memberId === 'B');
  assert.deepEqual([left.joinRevision, left.leaveRevision], [1, 3]); // B left after M: keeps the award with its leave revision
});

test('settlementPlan: create, advance, nothing when already as early, and M1 ∪ Mc awards with M1 first', () => {
  const events = [ev(1, 'join', 'B', '10:00:00', 100), ev(2, 'join', 'C', '13:00:00', 200), ev(3, 'leave', 'B', '14:00:00', 300)];
  const stints = latestStints(events, ['A', 'C']);
  const reaching = (hhmmss, server) => ({ entryId: 'YOI-M01_2026-09-30_1', occurredAt: at(hhmmss), syncedAt: st(server) });
  assert.equal(settlementPlan(null, reaching('15:00:00', 400), new Set(), stints).week.action, 'create');
  assert.equal(settlementPlan(record(m('15:00:00', 400)), reaching('12:00:00', 150), new Set(), stints).week.action, 'advance');
  assert.equal(settlementPlan(record(m('15:00:00', 400), m('12:00:00', 150)), reaching('15:00:00', 400), new Set(), stints).week, null);
  assert.equal(settlementPlan(null, null, new Set(), stints).week, null);
  // M1 = 15:00 (A, C) and Mc = 12:00 (A, B): the union, M1 first for A.
  const plan = settlementPlan(record(m('15:00:00', 400), m('12:00:00', 150)), null, new Set(['C']), stints);
  assert.deepEqual(plan.eligible, ['A', 'B', 'C']);
  assert.deepEqual(plan.awards.map((a) => [a.memberId, a.basis, a.at.at]), [['A', 'first', at('15:00:00')], ['B', 'reissue', at('12:00:00')]]);
  assert.equal(plan.awards.find((a) => a.memberId === 'B').leaveRevision, 3);
  // No consistent history: no awards and no eligibility claim.
  assert.deepEqual(settlementPlan(record(m('15:00:00', 400)), null, new Set(), null), { week: null, awards: [], eligible: null });
});

test('property: adding entries only moves the reaching moment earlier or keeps it (M only advances)', () => {
  let seed = 11;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const hours = ['08:00:00', '10:00:00', '12:00:00', '14:00:00', '16:00:00', '18:00:00'];
  for (let round = 0; round < 300; round += 1) {
    const entries = [];
    let previous = null;
    for (let k = 0; k < 12; k += 1) {
      const member = `YOI-M0${1 + rand(3)}`;
      entries.push({ sessionId: S, teamId: T, weekId: WEEK, memberId: member, taskDate: DAY, seq: k + 1, kind: rand(5) === 0 ? 'ride' : 'steps',
        eligibleRawDelta: 0, occurredAt: at(hours[rand(hours.length)]), syncedAt: st(rand(1000)), joinRevision: 0 });
      const last = entries[entries.length - 1];
      if (last.kind === 'steps') last.eligibleRawDelta = 20_000 + rand(60_000);
      const now = replayTeamWeek(entries, WEEK).reaching;
      if (previous) {
        assert.ok(now, 'reached stays reached');
        assert.ok(compareMoments({ at: now.occurredAt, server: now.syncedAt }, { at: previous.occurredAt, server: previous.syncedAt }) <= 0, 'never later');
      }
      previous = now;
    }
  }
});

test('ownAwardStatus and dailyNeed', () => {
  const r = record(m('15:00:00', 400));
  assert.equal(ownAwardStatus('A', r, new Set(['A']), null), 'awarded');
  assert.equal(ownAwardStatus('A', r, new Set(), ['A', 'B']), 'pending');
  assert.equal(ownAwardStatus('C', r, new Set(), ['A', 'B']), 'not-in-team');
  assert.equal(ownAwardStatus('A', null, new Set(), null), null);
  assert.equal(ownAwardStatus('A', r, new Set(), null), null); // eligibility unknown: say nothing
  // Wednesday 2026-09-30 of week 09-28: 5 days left including today.
  assert.equal(dailyNeed(100_000, 300_000, DAY, WEEK, 2, 'active'), 20_000);
  assert.equal(dailyNeed(299_999, 300_000, '2026-10-04', WEEK, 3, 'active'), 1);   // Sunday: one day left
  assert.equal(dailyNeed(300_000, 300_000, DAY, WEEK, 2, 'active'), null);          // reached
  assert.equal(dailyNeed(0, 300_000, DAY, WEEK, 1, 'paused'), null);                // paused
  assert.equal(dailyNeed(0, 300_000, DAY, WEEK, 1, 'recruiting'), null);
  assert.equal(dailyNeed(0, 300_000, '2026-10-05', WEEK, 2, 'active'), null);       // another week
});

test('copy: official result, advanced moment, own status lines, previous week, departed member and leave dialog', () => {
  const week = (o = {}) => ({ total: 305_000, target: 300_000, reachedAt: at('15:30:00'), confirmed: true, pending: false, contributions: {}, pastMembers: [],
    previous: null, official: { firstAt: at('15:30:00'), advancedAt: null, awardCount: 3 }, settling: false, own: 'awarded', need: null, ...o });
  const view = (w) => teamView({ status: 'active', memberCount: 3, inviteCode: T, leaderMemberId: 'YOI-M01' }, [], true, null, w);
  const official = view(week());
  // UX-1010 F12: one message once reached, no time and no 寶箱資格; the way to the chest when it is still closed.
  assert.match(official, /<p class="team-done">達標了！3 個人都可以開寶箱<\/p>/);
  assert.doesNotMatch(official, /試算|寶箱資格|15:30/);
  assert.match(view(week({ chest: 'unopened' })), /<button type="button" class="yo-primary yo-full" data-goto-page="rewards" data-reveal="#rewards-chests">去開寶箱<\/button>/);
  assert.match(view(week({ chest: 'opened' })), /這週的寶箱開過了/);
  assert.doesNotMatch(view(week({ chest: 'opened' })), /去開寶箱/);
  assert.doesNotMatch(view(week({ official: { firstAt: at('15:30:00'), advancedAt: at('12:00:00'), awardCount: 3 } })), /12:00/);
  assert.match(view(week({ official: null, settling: true, own: null })), /達標了！寶箱準備中/);
  assert.match(view(week({ own: 'pending' })), /您的寶箱準備中/);
  assert.match(view(week({ own: 'not-in-team' })), /本週達標時您不在隊上，這次沒有寶箱/);
  assert.match(view(week({ official: null, reachedAt: null, own: null, total: 100_000, need: 20_000 })), /每人每天約需 <b>20,000 步<\/b>/);
  const previous = view(week({ official: null, reachedAt: null, own: null, total: 1_000, previous: { total: 300_100, reachedAt: at('21:00:00', '2026-10-04'),
    official: { firstAt: at('21:00:00', '2026-10-04'), advancedAt: null, awardCount: 2 }, settling: false, own: 'awarded' } }));
  assert.match(previous, /上週達標了！2 個人都可以開寶箱/);
  assert.doesNotMatch(previous, /寶箱資格|21:00/);
  assert.match(teamEmptyView(true, null, ['您已取得本週寶箱資格，可到獎勵頁開箱。']), /您已取得本週寶箱資格/);
  const team = { sessionId: S, teamId: T, leaderMemberId: 'YOI-M01', memberIds: ['YOI-M01', 'YOI-M02'], inviteCode: T, status: 'active', clockVersion: 1,
    createdAt: at('09:00:00'), everFormed: true, nextJoinOrder: 2, revision: 1 };
  assert.match(leaveDialogCopy(team, 'YOI-M02', { activityWeekId: WEEK }, true).body, /您已取得本週寶箱資格，退團後仍保留/);
  assert.doesNotMatch(leaveDialogCopy(team, 'YOI-M02', { activityWeekId: WEEK }, true).body, /可能失去/);
  assert.match(leaveDialogCopy(team, 'YOI-M02', { activityWeekId: WEEK }).body, /尚未取得的寶箱資格可能失去/);
});

// ----- Shared scenario table (also run against the Emulator by tests/firestore-rules.test.mjs) -----
const WEEK_SCENARIOS = JSON.parse(readFileSync(new URL('./fixtures/week-scenarios.json', import.meta.url), 'utf8')).scenarios;
for (const scenario of WEEK_SCENARIOS) {
  test(`shared scenario (client side): ${scenario.name}`, () => {
    const id = (x) => `YOI-${x}`;
    let server = 0, revision = 0, createdAt = null, reach = null, members = [];
    const events = [];
    for (const o of scenario.ops) {
      if (o.op === 'check') continue;
      const now = at(o.at);
      server += 1;
      if (o.op === 'create') { createdAt = now; members = [id(o.member)]; }
      else if (o.op === 'join') { revision += 1; members.push(id(o.member)); events.push({ revision, type: 'join', targetMemberId: id(o.member), effectiveAt: now, serverRecordedAt: st(server) }); }
      else if (o.op === 'leave') { revision += 1; members = members.filter((x) => x !== id(o.member)); events.push({ revision, type: 'leave', targetMemberId: id(o.member), effectiveAt: now, serverRecordedAt: st(server) }); }
      else if (o.op === 'transfer') { revision += 1; events.push({ revision, type: 'transferCaptain', targetMemberId: id(o.target), effectiveAt: now, serverRecordedAt: st(server) }); }
      else if (o.op === 'reach') reach = { at: now, server: st(server) };
    }
    const inTeam = membersAt(latestStints(events, members, createdAt), reach);
    let checks = 0;
    for (const o of scenario.ops.filter((x) => x.op === 'check')) {
      const s = inTeam.find((x) => x.memberId === id(o.member));
      const eligible = !!s && s.joinRevision === o.joinRevision && s.leaveRevision === o.leaveRevision;
      if (o.client !== null) assert.equal(eligible, o.client, JSON.stringify(o));
      if (eligible) assert.equal(o.rules, true, `client-eligible must be Rules-accepted: ${JSON.stringify(o)}`);
      checks += 1;
    }
    assert.ok(checks > 0);
  });
}
