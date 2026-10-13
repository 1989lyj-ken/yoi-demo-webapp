import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  activeIntervals, classifyFailure, compareMoments, ContribFormatError, contributionEligibility, entryIdOf, missingCredits, parseEntry,
  replayTeamWeek, visibleWeeks, weekOfTaskDate,
} from '../src/team/contrib-state.ts';
import { teamView } from '../src/ui/views.ts';

const S = 's9';
const T = 'A1B2C3D4E5F60718';
const DAY = '2026-09-30';
const WEEK = '2026-09-28';
const at = (hhmmss, day = DAY) => `${day}T${hhmmss}+08:00`;
const st = (seconds, nanoseconds = 0) => ({ seconds, nanoseconds });
const entry = (o = {}) => ({ sessionId: S, teamId: T, weekId: WEEK, memberId: 'YOI-M01', taskDate: DAY, seq: 1, kind: 'steps',
  eligibleRawDelta: 1000, occurredAt: at('12:00:00'), syncedAt: st(100), joinRevision: 0, ...o });

test('weekOfTaskDate and entry IDs', () => {
  assert.equal(weekOfTaskDate('2026-09-30'), '2026-09-28');
  assert.equal(weekOfTaskDate('2026-10-04'), '2026-09-28'); // Sunday
  assert.equal(weekOfTaskDate('2026-10-05'), '2026-10-05'); // Monday
  assert.equal(weekOfTaskDate('2027-01-01'), '2026-12-28');
  assert.throws(() => weekOfTaskDate('2026-02-30'));
  assert.equal(entryIdOf('YOI-M01', DAY, 10), 'YOI-M01_2026-09-30_10');
});

test('parseEntry accepts the 12-field shape and refuses everything else', () => {
  const stored = { ...entry(), recordedAt: st(200) };
  const id = entryIdOf('YOI-M01', DAY, 1);
  assert.equal(parseEntry(stored, S, T, id).eligibleRawDelta, 1000);
  const bad = [{ extra: 1 }, { seq: 0 }, { seq: '1' }, { weekId: '2026-09-21' }, { kind: 'claim' }, { kind: 'ride' },
    { eligibleRawDelta: -1 }, { memberId: 'YOI_M01' }, { occurredAt: '2026-09-30 12:00' }, { syncedAt: null }, { joinRevision: -1 }, { teamId: 'X' }];
  for (const o of bad) assert.throws(() => parseEntry({ ...stored, ...o }, S, T, id), ContribFormatError, JSON.stringify(o));
  assert.throws(() => parseEntry(stored, S, T, entryIdOf('YOI-M01', DAY, 2)), ContribFormatError);
  const { recordedAt, ...missing } = stored;
  assert.throws(() => parseEntry(missing, S, T, id), ContribFormatError);
});

test('replay: 299,999 is not reached, 300,000 is (P12), and the total equals the sum of member contributions', () => {
  const near = replayTeamWeek([entry({ eligibleRawDelta: 299_999 })], WEEK);
  assert.deepEqual([near.total, near.reachedAt], [299_999, null]);
  const reached = replayTeamWeek([entry({ eligibleRawDelta: 299_999 }), entry({ seq: 2, eligibleRawDelta: 1, occurredAt: at('13:00:00'), syncedAt: st(200) })], WEEK);
  assert.deepEqual([reached.total, reached.reachedAt], [300_000, at('13:00:00')]);
  assert.equal(reached.members.reduce((sum, m) => sum + m.contribution, 0), reached.total);
});

test('replay: a ride adds its bonus at its own moment, never earlier (hand-computed)', () => {
  // Team at 180,000 from another member; this member has 100,000 raw by 08:00 and rides at 12:00.
  const entries = [
    entry({ memberId: 'YOI-M02', eligibleRawDelta: 180_000, occurredAt: at('07:00:00'), syncedAt: st(1) }),
    entry({ eligibleRawDelta: 100_000, occurredAt: at('08:00:00'), syncedAt: st(2) }),
    entry({ seq: 2, kind: 'ride', eligibleRawDelta: 0, occurredAt: at('12:00:00'), syncedAt: st(3) }),
  ];
  const week = replayTeamWeek(entries, WEEK);
  assert.equal(week.total, 330_000);
  assert.equal(week.reachedAt, at('12:00:00')); // not 08:00
  // Steps after the ride count at 1.5x; floors keep the sum of deltas equal to the final floor.
  const small = replayTeamWeek([
    entry({ kind: 'ride', eligibleRawDelta: 0, occurredAt: at('08:00:00'), syncedAt: st(1) }),
    entry({ seq: 2, eligibleRawDelta: 1, occurredAt: at('09:00:00'), syncedAt: st(2) }),
    entry({ seq: 3, eligibleRawDelta: 1, occurredAt: at('10:00:00'), syncedAt: st(3) }),
  ], WEEK);
  assert.equal(small.total, 3); // floor(2 x 1.5)
  // A second ride on the same day does not stack.
  const twice = replayTeamWeek([
    entry({ eligibleRawDelta: 1000, occurredAt: at('08:00:00'), syncedAt: st(1) }),
    entry({ seq: 2, kind: 'ride', eligibleRawDelta: 0, occurredAt: at('09:00:00'), syncedAt: st(2) }),
    entry({ seq: 3, kind: 'ride', eligibleRawDelta: 0, occurredAt: at('10:00:00'), syncedAt: st(3) }),
  ], WEEK);
  assert.equal(twice.total, 1500);
  // The bonus is per member-day: yesterday's ride does not lift today.
  const days = replayTeamWeek([
    entry({ taskDate: '2026-09-29', seq: 1, kind: 'ride', eligibleRawDelta: 0, occurredAt: at('08:00:00', '2026-09-29'), syncedAt: st(1) }),
    entry({ eligibleRawDelta: 1000, occurredAt: at('09:00:00'), syncedAt: st(2) }),
  ], WEEK);
  assert.equal(days.total, 1000);
});

test('replay is independent of input order, ignores other weeks and duplicates, and breaks ties deterministically', () => {
  const list = [
    entry({ memberId: 'YOI-M02', eligibleRawDelta: 200_000, occurredAt: at('09:00:00'), syncedAt: st(5) }),
    entry({ memberId: 'YOI-M01', eligibleRawDelta: 100_000, occurredAt: at('09:00:00'), syncedAt: st(4) }),
    entry({ memberId: 'YOI-M03', taskDate: '2026-10-05', weekId: '2026-10-05', eligibleRawDelta: 999_999, occurredAt: at('09:00:00', '2026-10-05'), syncedAt: st(1) }),
  ];
  const a = replayTeamWeek(list, WEEK);
  const b = replayTeamWeek([...list].reverse().concat([list[0]]), WEEK);
  assert.deepEqual(a, { ...b, members: a.members });
  assert.equal(a.total, 300_000);
  // Same scenario time: the server time decides that M02's entry (st 5) closes the target.
  assert.equal(a.reachedAt, at('09:00:00'));
  assert.equal(a.members.find((m) => m.memberId === 'YOI-M03'), undefined); // other week (P13)
  // seq compares as a number: seq 10 comes after seq 9.
  const order = replayTeamWeek([
    entry({ seq: 10, kind: 'ride', eligibleRawDelta: 0, occurredAt: at('09:00:00'), syncedAt: st(1) }),
    entry({ seq: 9, eligibleRawDelta: 1000, occurredAt: at('09:00:00'), syncedAt: st(1) }),
  ], WEEK);
  assert.equal(order.total, 1500);
});

test('missingCredits skips claims and already-credited events and orders by numeric seq', () => {
  const credited = new Set([entryIdOf('YOI-M01', DAY, 1)]);
  const events = [{ taskDate: DAY, seq: 10, kind: 'steps' }, { taskDate: DAY, seq: 2, kind: 'claim' }, { taskDate: DAY, seq: 9, kind: 'ride' },
    { taskDate: DAY, seq: 1, kind: 'steps' }, { taskDate: '2026-09-29', seq: 3, kind: 'steps' }];
  assert.deepEqual(missingCredits(events, credited, 'YOI-M01'), [
    { taskDate: '2026-09-29', seq: 3 }, { taskDate: DAY, seq: 9 }, { taskDate: DAY, seq: 10 },
  ]);
});

// ----- Eligibility -----

const ev = (revision, type, targetMemberId, hhmmss, server) => ({ revision, type, targetMemberId, effectiveAt: at(hhmmss), serverRecordedAt: st(server) });
const member = (o = {}) => ({ status: 'active', teamId: T, leftTeamId: null, joinOrder: 0, joinedAt: at('09:00:00'), leftAt: null, ...o });
const team = (o = {}) => ({ teamId: T, status: 'active', everFormed: true, createdAt: at('09:00:00'), revision: 1, ...o });
const base = (o = {}) => ({ kind: 'steps', occurredAt: at('12:00:00'), syncedAt: st(500), taskDate: DAY, today: DAY, selfId: 'YOI-M01',
  membership: member(), team: team(), events: [ev(1, 'join', 'YOI-M02', '10:00:00', 100)], ...o });

test('activeIntervals rebuilds formed, paused and resumed periods from team events', () => {
  const events = [ev(1, 'join', 'B', '10:00:00', 1), ev(2, 'leave', 'B', '11:00:00', 2), ev(3, 'join', 'C', '12:00:00', 3), ev(4, 'transferCaptain', 'C', '12:30:00', 4), ev(5, 'join', 'D', '13:00:00', 5), ev(6, 'leave', 'A', '14:00:00', 6)];
  const intervals = activeIntervals(events);
  assert.equal(intervals.length, 2);
  assert.equal(intervals[0].start.at, at('10:00:00'));
  assert.equal(intervals[0].end.at, at('11:00:00'));
  assert.equal(intervals[1].start.at, at('12:00:00'));
  assert.equal(intervals[1].end, null); // 3 -> 2 members after rev 6 is still formed
  assert.equal(activeIntervals([ev(1, 'cancelRecruiting', 'A', '10:00:00', 1)]).length, 0);
});

test('eligibility: formation, joins, pauses (no backfill), rides and the window', () => {
  assert.equal(contributionEligibility(base()).eligible, true);
  assert.equal(contributionEligibility(base()).joinRevision, 0); // founder
  // Same scenario time as formation: decided by server time (B1).
  assert.equal(contributionEligibility(base({ occurredAt: at('10:00:00'), syncedAt: st(50) })).eligible, false);
  assert.equal(contributionEligibility(base({ occurredAt: at('10:00:00'), syncedAt: st(150) })).eligible, true);
  // A joiner counts from its own join event.
  const joiner = { selfId: 'YOI-M02', membership: member({ joinOrder: 1, joinedAt: at('10:00:00') }) };
  assert.deepEqual([contributionEligibility(base(joiner)).eligible, contributionEligibility(base(joiner)).joinRevision], [true, 1]);
  assert.equal(contributionEligibility(base({ ...joiner, occurredAt: at('10:00:00'), syncedAt: st(99) })).eligible, false);
  // Pause then resume: the paused period is never backfilled by a current member (P20).
  const events = [ev(1, 'join', 'YOI-M02', '10:00:00', 100), ev(2, 'leave', 'YOI-M02', '11:00:00', 200), ev(3, 'join', 'YOI-M03', '13:00:00', 300)];
  const resumed = { events, team: team({ revision: 3 }) };
  assert.equal(contributionEligibility(base({ ...resumed, occurredAt: at('12:00:00'), syncedAt: st(250) })).eligible, false);
  assert.equal(contributionEligibility(base({ ...resumed, occurredAt: at('10:30:00'), syncedAt: st(150) })).eligible, true);
  assert.equal(contributionEligibility(base({ ...resumed, occurredAt: at('14:00:00'), syncedAt: st(400) })).eligible, true);
  // Rides: before formation or before joining on the join day is fine (ruling b1); during a pause is not.
  assert.equal(contributionEligibility(base({ kind: 'ride', occurredAt: at('08:00:00'), syncedAt: st(1) })).eligible, true);
  // A ride on an earlier day than the join cannot land in the team (Security Low-1), current or departed.
  const yesterdayRide = { kind: 'ride', taskDate: '2026-09-29', occurredAt: at('20:00:00', '2026-09-29'), syncedAt: st(1) };
  assert.equal(contributionEligibility(base(yesterdayRide)).eligible, false);
  assert.equal(contributionEligibility(base({ ...yesterdayRide, membership: member({ joinedAt: at('20:00:00', '2026-09-28') }) })).eligible, true);
  const leftRide = { membership: member({ status: 'left', teamId: null, leftTeamId: T, joinOrder: 2, joinedAt: at('10:00:00'), leftAt: at('14:00:00') }), events: null, team: null };
  assert.equal(contributionEligibility(base({ ...yesterdayRide, ...leftRide })).eligible, false);
  assert.equal(contributionEligibility(base({ ...leftRide, kind: 'ride', occurredAt: at('09:00:00') })).eligible, true); // before joining, same day
  assert.equal(contributionEligibility(base({ ...leftRide, kind: 'ride', occurredAt: at('15:00:00') })).eligible, false); // after leaving
  // A paused team: before the pause counts, exactly at the pause is decided by server time, after it does not.
  const paused = { events: [ev(1, 'join', 'YOI-M02', '10:00:00', 100), ev(2, 'leave', 'YOI-M02', '13:00:00', 300)], team: team({ status: 'paused', revision: 2 }) };
  assert.equal(contributionEligibility(base({ ...paused, occurredAt: at('12:00:00'), syncedAt: st(400) })).eligible, true);
  assert.equal(contributionEligibility(base({ ...paused, occurredAt: at('13:00:00'), syncedAt: st(299) })).eligible, true);
  assert.equal(contributionEligibility(base({ ...paused, occurredAt: at('13:00:00'), syncedAt: st(301) })).eligible, false);
  assert.equal(contributionEligibility(base({ ...paused, kind: 'ride', occurredAt: at('12:30:00'), syncedAt: st(250) })).eligible, true);
  // A departed founder: no joinedAt bound (it started at creation), strict leftAt.
  const leftFounder = { membership: member({ status: 'left', teamId: null, leftTeamId: T, joinOrder: 0, leftAt: at('14:00:00') }), events: null, team: null };
  assert.equal(contributionEligibility(base({ ...leftFounder, occurredAt: at('09:30:00') })).eligible, true);
  assert.equal(contributionEligibility(base({ ...resumed, kind: 'ride', occurredAt: at('12:00:00'), syncedAt: st(250) })).eligible, false);
  // Window and team state.
  assert.equal(contributionEligibility(base({ taskDate: '2026-09-28' })).eligible, false);
  assert.equal(contributionEligibility(base({ team: team({ status: 'recruiting', everFormed: false }), events: [] })).eligible, false);
  assert.equal(contributionEligibility(base({ membership: null })).eligible, false);
  // A departed member: strict leftAt, and a strict joinedAt for non-founders.
  const left = { membership: member({ status: 'left', teamId: null, leftTeamId: T, joinOrder: 2, joinedAt: at('10:00:00'), leftAt: at('14:00:00') }), events: null, team: null };
  assert.equal(contributionEligibility(base({ ...left, occurredAt: at('13:00:00') })).eligible, true);
  assert.equal(contributionEligibility(base({ ...left, occurredAt: at('14:00:00') })).eligible, false);
  assert.equal(contributionEligibility(base({ ...left, occurredAt: at('10:00:00') })).eligible, false);
});

// A JavaScript mirror of the contribution Rules (firestore.rules contribEligible), used to check that
// whatever the client decides to write would be accepted. It is a model of the Rules, not the Rules.
function rulesAccept(input, joinRevision, server = { team: input.team, events: input.events }) {
  const after = (m, e) => compareMoments(m, { at: e.effectiveAt, server: e.serverRecordedAt }) > 0;
  const before = (m, e) => compareMoments(m, { at: e.effectiveAt, server: e.serverRecordedAt }) < 0;
  const m = input.membership, ts = server.team, events = server.events ?? [];
  const formed = events.find((e) => e.revision === 1);
  const at0 = { at: input.occurredAt, server: input.syncedAt };
  if (!ts || !ts.everFormed || formed?.type !== 'join') return false;
  const statusOk = m.status === 'active'
    ? m.teamId === ts.teamId && (ts.status === 'active' || (ts.status === 'paused' && (() => { const pe = events.find((e) => e.revision === ts.revision); return pe?.type === 'leave' && before(at0, pe); })()))
    : m.status === 'left' && m.leftTeamId === ts.teamId && input.occurredAt < m.leftAt;
  if (!statusOk) return false;
  if (input.kind === 'ride') return joinRevision === 0 && m.joinedAt !== null && input.taskDate >= m.joinedAt.split('T')[0];
  if (!after(at0, formed)) return false;
  const founder = m.joinOrder === 0 && m.joinedAt === ts.createdAt;
  if (founder) return joinRevision === 0;
  if (joinRevision === 0) return m.status === 'left' && input.occurredAt > m.joinedAt;
  const je = events.find((e) => e.revision === joinRevision);
  return je?.type === 'join' && je.targetMemberId === input.selfId && je.effectiveAt === m.joinedAt && after(at0, je);
}

test('property: for random team histories, client-eligible implies Rules-accepted (current and departed members, two days)', () => {
  let seed = 7;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const Y = '2026-09-29';
  const moments = [at('20:00:00', Y), at('22:00:00', Y), at('09:00:00'), at('10:00:00'), at('11:00:00'), at('12:00:00')];
  let checked = 0, eligible = 0, departedEligible = 0, rides = 0, knownGap = 0;
  for (let round = 0; round < 600; round += 1) {
    // A valid FSD-03B history: founder A at moments[0], then random joins/leaves with non-decreasing times.
    const roster = ['A'];
    const ms = { A: member({ joinOrder: 0, joinedAt: moments[0] }) };
    const events = [];
    let server = 10, step = 0, revision = 0, formed = false, nextJoinOrder = 1;
    for (let k = 0; k < 7; k += 1) {
      step = Math.min(moments.length - 1, step + rand(2));
      const now = moments[step];
      const candidates = ['B', 'C', 'D', 'E'].filter((x) => !ms[x]);
      const doJoin = roster.length < 2 || (candidates.length > 0 && rand(2) === 0);
      if (doJoin && candidates.length > 0) {
        const who = candidates[rand(candidates.length)];
        revision += 1; server += 1 + rand(3);
        events.push({ revision, type: 'join', targetMemberId: who, effectiveAt: now, serverRecordedAt: st(server) });
        roster.push(who); ms[who] = member({ joinOrder: nextJoinOrder++, joinedAt: now }); formed = true;
      } else if (formed && roster.length >= 2) {
        const who = roster[rand(roster.length)];
        revision += 1; server += 1 + rand(3);
        events.push({ revision, type: 'leave', targetMemberId: who, effectiveAt: now, serverRecordedAt: st(server) });
        roster.splice(roster.indexOf(who), 1);
        ms[who] = { ...ms[who], status: 'left', teamId: null, leftTeamId: T, leftAt: now };
      }
    }
    if (!formed) continue;
    const serverTeam = team({ status: roster.length >= 2 ? 'active' : 'paused', revision, createdAt: moments[0] });
    for (const self of Object.keys(ms)) {
      const departed = ms[self].status === 'left';
      // A departed member mostly samples up to its leave moment (after it, nothing is eligible anyway).
      const span = departed ? moments.indexOf(ms[self].leftAt) + 1 : moments.length;
      const when = moments[rand(span)];
      const kind = rand(3) === 0 ? 'ride' : 'steps';
      const taskDate = when.slice(0, 10);
      const input = { kind, occurredAt: when, syncedAt: st(rand(server + 5)), taskDate, today: DAY, selfId: self, membership: ms[self],
        team: departed ? null : serverTeam, events: departed ? null : events };
      const result = contributionEligibility(input);
      checked += 1;
      if (!result.eligible) continue;
      eligible += 1;
      if (departed) departedEligible += 1;
      // Documented gap (FSD-03C-1 implementation record): a departed founder cannot read events/1, so a fragment
      // between creation and formation is attempted once and refused by the Rules (final, no loop).
      const formedAt = { at: events[0].effectiveAt, server: events[0].serverRecordedAt };
      if (departed && ms[self].joinOrder === 0 && compareMoments({ at: input.occurredAt, server: input.syncedAt }, formedAt) <= 0) { knownGap += 1; continue; }
      if (kind === 'ride') rides += 1;
      assert.ok(rulesAccept(input, result.joinRevision, { team: serverTeam, events }), JSON.stringify({ input, result }));
    }
  }
  assert.ok(checked > 1000 && eligible > 200 && departedEligible > 20 && rides > 50, `checked ${checked}, eligible ${eligible}, departed ${departedEligible}, rides ${rides}`);
});

// ----- Shared scenario table (also run against the Emulator by tests/firestore-rules.test.mjs) -----

const SCENARIOS = JSON.parse(readFileSync(new URL('./fixtures/contrib-scenarios.json', import.meta.url), 'utf8')).scenarios;

/** Replays a scenario into client-side state: one team, scenario time from the ops, a growing server clock. */
function simulate(scenario, onCheck) {
  const dayOf = (d) => (d === 'Y' ? '2026-09-29' : DAY);
  let server = 0, revision = 0, nextJoinOrder = 0, createdAt = null, memberIds = [], everFormed = false;
  const events = [], ms = {}, daily = {};
  for (const o of scenario.ops) {
    const id = o.member && `YOI-${o.member}`;
    if (o.op === 'check') { onCheck(o, { events, ms, daily, team: { teamId: T, status: memberIds.length >= 2 ? 'active' : everFormed ? 'paused' : 'recruiting', everFormed, createdAt, revision } }); continue; }
    const now = `${dayOf(o.day)}T${o.at}+08:00`;
    server += 1;
    if (o.op === 'create') {
      createdAt = now; memberIds = [id]; nextJoinOrder = 1;
      ms[id] = member({ joinOrder: 0, joinedAt: now });
    } else if (o.op === 'join') {
      revision += 1; everFormed = true; memberIds.push(id);
      events.push({ revision, type: 'join', targetMemberId: id, effectiveAt: now, serverRecordedAt: st(server) });
      ms[id] = member({ joinOrder: nextJoinOrder++, joinedAt: now });
    } else if (o.op === 'leave') {
      revision += 1; memberIds = memberIds.filter((m) => m !== id);
      events.push({ revision, type: 'leave', targetMemberId: id, effectiveAt: now, serverRecordedAt: st(server) });
      ms[id] = { ...ms[id], status: 'left', teamId: null, leftTeamId: T, leftAt: now };
    } else {
      const taskDate = dayOf(o.taskDay ?? o.day);
      const key = `${id}|${taskDate}`;
      const seq = (daily[key]?.length ?? 0) + 1;
      const occurredAt = o.op === 'steps' && taskDate !== now.slice(0, 10) ? `${taskDate}T23:59:59+08:00` : now;
      (daily[key] ??= []).push({ seq, kind: o.op, occurredAt, syncedAt: st(server) });
    }
  }
}

for (const scenario of SCENARIOS) {
  test(`shared scenario (client side): ${scenario.name}`, () => {
    let checks = 0;
    simulate(scenario, (o, s) => {
      const id = `YOI-${o.member}`;
      const taskDate = o.taskDay === 'Y' ? '2026-09-29' : DAY;
      const e = s.daily[`${id}|${taskDate}`].find((x) => x.seq === o.seq);
      const m = s.ms[id];
      const departed = m.status === 'left';
      const input = { kind: e.kind, occurredAt: e.occurredAt, syncedAt: e.syncedAt, taskDate, today: DAY, selfId: id, membership: m,
        team: departed ? null : s.team, events: departed ? null : s.events };
      const result = contributionEligibility(input);
      const label = JSON.stringify({ check: o, reason: result.reason });
      if (o.client !== null) {
        assert.equal(result.eligible, o.client, label);
        if (result.eligible) assert.equal(result.joinRevision, o.joinRevision, label);
      }
      // Client-eligible must imply Rules-accepted (for the joinRevision the client would send).
      if (result.eligible && result.joinRevision === o.joinRevision) assert.equal(o.rules, true, label);
      checks += 1;
    });
    assert.ok(checks > 0);
  });
}

// ----- Pure helpers used by the service and the panel -----

test('visibleWeeks: a Monday also shows the previous week (catch-up still open); other days do not', () => {
  assert.deepEqual(visibleWeeks('2026-10-05'), { current: '2026-10-05', previous: '2026-09-28' });
  assert.deepEqual(visibleWeeks('2026-10-06'), { current: '2026-10-05', previous: null });
  assert.deepEqual(visibleWeeks('2026-10-04'), { current: '2026-09-28', previous: null });
});

test('classifyFailure: only network-type Firebase errors are pending; refusals and other errors are final', () => {
  const fb = (code) => Object.assign(new Error(code), { name: 'FirebaseError', code });
  for (const code of ['unavailable', 'deadline-exceeded', 'aborted', 'unknown', 'internal', 'cancelled']) assert.equal(classifyFailure(fb(code)), 'unconfirmed', code);
  for (const code of ['permission-denied', 'not-found', 'failed-precondition', 'invalid-argument']) assert.equal(classifyFailure(fb(code)), 'refused', code);
  assert.equal(classifyFailure(new Error('unavailable')), 'refused');
  assert.equal(classifyFailure({ name: 'FirebaseError', code: 'unavailable' }), 'refused'); // not an Error
});

test('progress copy: recruiting and paused teams say what counts; pending says when it will be credited; unconfirmed shows a dash', () => {
  const week = (o = {}) => ({ total: 1234, target: 300000, reachedAt: null, confirmed: true, pending: false, contributions: { 'YOI-M01': 1234 }, pastMembers: [], previous: null, official: null, settling: false, own: null, need: null, ...o });
  const entries = [{ memberId: 'YOI-M01', exists: true, pending: false, fromCache: false, rawSteps: 1234, effectiveSteps: 1234, rideCompleted: false }];
  const view = (status, memberCount, w) => teamView({ status, memberCount, inviteCode: T, leaderMemberId: 'YOI-M01' }, entries, true, null, w);
  const recruiting = view('recruiting', 1, week());
  // 2026-10-06 (A): one member: the recruiting card (no team steps, no bar, the empty seat, the invite button with the glow).
  assert.match(recruiting, /<section class="yo-panel team-card team-recruit">/);
  assert.match(recruiting, /<span class="team-seat filled">我<\/span><span class="team-seat empty">等待隊友<\/span>/);
  assert.match(recruiting, /<p class="team-recruit-count"><b>1<\/b>／2 人<\/p><p class="team-recruit-lead">再邀 1 人成團，成團後才開始累計團隊步數<\/p>/);
  assert.match(recruiting, /<button type="button" class="yo-primary yo-full" data-goto-page="invite">邀請成員<\/button>/);
  assert.doesNotMatch(recruiting, /role="progressbar"|team-wan|team-row-today/);   // no team total, no bar, no per-member steps
  assert.match(recruiting, /<strong>YOI-M01・隊長<\/strong><\/span><small>招募中<\/small>/);
  const paused = view('paused', 1, week());
  assert.match(paused, /<p class="team-card-status">暫停中<\/p>[^]*隊伍暫停中，再邀 1 人恢復挑戰/);
  assert.match(view('paused', 1, null), /team-recruit/);   // also before the ledger is confirmed
  assert.match(view('active', 2, week({ pending: true })), /下次同步或重新載入頁面時會補上/);
  assert.doesNotMatch(view('active', 2, week({ pending: true })), /連線恢復後/);
  const unconfirmed = view('active', 2, week({ confirmed: false }));
  assert.match(unconfirmed, /本週 —/); // FSD-08A-6 member rows
  assert.doesNotMatch(unconfirmed, /本週計入 1,234/); // today's own steps carry separators too (08A-6), so check the weekly figure
});

test('2026-10-06 (2): formed team rows show today\'s team-counted steps (ledger), not personal steps; the replay keeps them per member and day', () => {
  const entries = [{ memberId: 'YOI-M01', exists: true, pending: false, fromCache: false, rawSteps: 9000, effectiveSteps: 9000, rideCompleted: true },
    { memberId: 'YOI-M02', exists: true, pending: false, fromCache: false, rawSteps: 500, effectiveSteps: 500, rideCompleted: false }];
  const w = { total: 3000, target: 300000, reachedAt: null, confirmed: true, pending: false, contributions: { 'YOI-M01': 1000, 'YOI-M02': 2000 },
    todayContributions: { 'YOI-M01': 1000, 'YOI-M02': 2000 }, pastMembers: [], previous: null, official: null, settling: false, own: null, need: null };
  const html = teamView({ status: 'active', memberCount: 2, inviteCode: T, leaderMemberId: 'YOI-M01' }, entries, true, null, w);
  assert.ok(html.indexOf('YOI-M02') < html.indexOf('YOI-M01・隊長'));                 // sorted by team-counted steps
  assert.match(html, /<span class="team-row-today"><b>2,000<\/b><span>步<\/span>/);
  assert.match(html, /<span class="team-row-today"><b>1,000<\/b><span>步<\/span>/);
  assert.doesNotMatch(html, /9,000|有效 /);                                             // personal steps are not shown here
  assert.match(html, /<small>今日乘車加成<\/small>/);
  assert.match(teamView({ status: 'active', memberCount: 2, inviteCode: T, leaderMemberId: 'YOI-M01' }, entries, true, null, { ...w, confirmed: false }), /<span class="team-row-today"><b>—<\/b>/);
});
