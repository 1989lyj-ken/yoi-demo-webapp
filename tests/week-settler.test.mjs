import test from 'node:test';
import assert from 'node:assert/strict';
import { WeekSettler } from '../src/team/week-settler.ts';
import { latestStints, WeekResultFormatError } from '../src/team/week-result-state.ts';

const T = 'A1B2C3D4E5F60718';
const DAY = '2026-09-30';
const at = (hhmmss) => `${DAY}T${hhmmss}+08:00`;
const st = (seconds) => ({ seconds, nanoseconds: 0 });
const m = (hhmmss, server) => ({ at: at(hhmmss), server: st(server) });
const ev = (revision, type, target, hhmmss, server) => ({ revision, type, targetMemberId: target, effectiveAt: at(hhmmss), serverRecordedAt: st(server) });
// A founds at 09:00, B joins 09:00 (rev1), C joins 11:00 (rev2), B leaves 13:00 (rev3).
const EVENTS = [ev(1, 'join', 'B', '09:00:00', 1), ev(2, 'join', 'C', '11:00:00', 2), ev(3, 'leave', 'B', '13:00:00', 3)];
const STINTS = latestStints(EVENTS, ['A', 'C'], at('09:00:00'));
const record = (first, current = first, revision = 0) => ({ sessionId: 's', teamId: T, weekId: '2026-09-28', first, current, reachingEntryId: 'A_2026-09-30_1', revision });
const reaching = (hhmmss, server) => ({ entryId: 'A_2026-09-30_1', occurredAt: at(hhmmss), syncedAt: st(server) });
const inputs = (o = {}) => ({ teamId: T, teamRevision: 3, weekId: '2026-09-28', reaching: null, record: null, awarded: new Set(), confirmed: true, ...o });

/** A scripted port: results are taken in order per method; every call is recorded. */
function fakePort(script = {}) {
  const calls = [];
  const take = (name, fallback) => (script[name]?.length ? script[name].shift() : fallback);
  return {
    calls,
    readStints: async () => { calls.push(['readStints']); const r = take('readStints', { revision: 3, stints: STINTS }); if (r instanceof Error) throw r; return r; },
    writeWeek: async (teamId, weekId, r) => { calls.push(['writeWeek', r.occurredAt]); return take('writeWeek', 'done'); },
    writeAward: async (teamId, weekId, a) => { calls.push(['writeAward', a.memberId, a.basis, a.leaveRevision]); const r = take('writeAward', 'done'); return typeof r === 'function' ? r() : r; },
  };
}

test('settler: creates the week first, then awards the M1 list on the next snapshot; unconfirmed snapshots are ignored', async () => {
  const port = fakePort();
  const s = new WeekSettler(port, () => undefined);
  s.offer(inputs({ reaching: reaching('12:00:00', 50), confirmed: false }));
  await s.idle();
  assert.deepEqual(port.calls, []);
  s.offer(inputs({ reaching: reaching('12:00:00', 50) }));
  await s.idle();
  assert.deepEqual(port.calls, [['readStints'], ['writeWeek', at('12:00:00')]]);
  port.calls.length = 0;
  s.offer(inputs({ reaching: reaching('12:00:00', 50), record: record(m('12:00:00', 50)) }));
  await s.idle();
  // Cached stints (same team revision): no reread. A, B (left 13:00) and C (joined 11:00) were in at 12:00.
  assert.deepEqual(port.calls, [['writeAward', 'A', 'first', 0], ['writeAward', 'B', 'first', 3], ['writeAward', 'C', 'first', 0]]);
  assert.deepEqual(s.eligible, ['A', 'B', 'C']);
  assert.equal(s.eligibleFor, 0);
});

test('settler: a snapshot arriving during a run triggers exactly one more run on the latest inputs', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const port = fakePort({ writeAward: [() => gate.then(() => 'done')] });
  const s = new WeekSettler(port, () => undefined);
  s.offer(inputs({ record: record(m('12:00:00', 50)) }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  s.offer(inputs({ record: record(m('12:00:00', 50)), awarded: new Set(['A']) }));
  s.offer(inputs({ record: record(m('12:00:00', 50)), awarded: new Set(['A', 'B']) }));
  release();
  await s.idle();
  const awards = port.calls.filter((c) => c[0] === 'writeAward').map((c) => c[1]);
  // First run: A, B, C. Second (latest inputs only): C.
  assert.deepEqual(awards, ['A', 'B', 'C', 'C']);
});

test('settler: an unconfirmed write only marks pending and never schedules a rerun by itself', async () => {
  const port = fakePort({ writeAward: ['unconfirmed', 'unconfirmed', 'unconfirmed'] });
  const changes = [];
  const s = new WeekSettler(port, () => changes.push(s.pending));
  s.offer(inputs({ record: record(m('12:00:00', 50)) }));
  await s.idle();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(port.calls.filter((c) => c[0] === 'writeAward').length, 3);
  assert.deepEqual(changes, [true]);
});

test('settler: a refused award rereads the events once and retries with the new leave revision, then is final for (member, M)', async () => {
  // C left in the meantime (rev4): the retry carries leaveRevision 4.
  const later = latestStints([...EVENTS, ev(4, 'leave', 'C', '14:00:00', 4)], ['A'], at('09:00:00'));
  const port = fakePort({ writeAward: ['done', 'done', 'refused', 'done'], readStints: [{ revision: 3, stints: STINTS }, { revision: 4, stints: later }] });
  const s = new WeekSettler(port, () => undefined);
  s.offer(inputs({ record: record(m('12:00:00', 50)) }));
  await s.idle();
  assert.deepEqual(port.calls.slice(-2), [['readStints'], ['writeAward', 'C', 'first', 4]]);
  // Refused again after the retry: not attempted again on this page for the same M.
  const port2 = fakePort({ writeAward: ['refused', 'refused'] });
  const s2 = new WeekSettler(port2, () => undefined);
  s2.offer(inputs({ record: record(m('12:00:00', 50)), awarded: new Set(['A', 'B']) }));
  await s2.idle();
  s2.offer(inputs({ record: record(m('12:00:00', 50)), awarded: new Set(['A', 'B']), teamRevision: 3 }));
  await s2.idle();
  assert.equal(port2.calls.filter((c) => c[0] === 'writeAward').length, 2);
});

test('settler: a refused week advance is final for that M but the existing record\'s awards are still settled', async () => {
  const port = fakePort({ writeWeek: ['refused'] });
  const s = new WeekSettler(port, () => undefined);
  const base = { record: record(m('14:00:00', 70)), reaching: reaching('10:00:00', 20), awarded: new Set() };
  s.offer(inputs(base));
  await s.idle();
  assert.deepEqual(port.calls.map((c) => c[0]), ['readStints', 'writeWeek', 'writeAward', 'writeAward']); // A, C at 14:00
  port.calls.length = 0;
  s.offer(inputs({ ...base, awarded: new Set(['A', 'C']) }));
  await s.idle();
  assert.deepEqual(port.calls, []); // no second advance attempt, nothing left to award
});

test('settler: cancel stops further writes, including the retry after a refusal, and silences onChange', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const port = fakePort({ writeAward: [() => gate.then(() => 'refused')] });
  let changes = 0;
  const s = new WeekSettler(port, () => { changes += 1; });
  s.offer(inputs({ record: record(m('12:00:00', 50)) }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  s.cancel();
  release();
  await s.idle();
  assert.deepEqual(port.calls.map((c) => c[0]), ['readStints', 'writeAward']);
  assert.equal(changes, 0);
  s.offer(inputs({ record: record(m('12:00:00', 50)) }));
  await s.idle();
  assert.equal(port.calls.length, 2);
});

test('settler: an award that exists elsewhere is remembered; a malformed document is an error, not "pending"', async () => {
  const port = fakePort({ writeAward: ['done', 'exists', 'done'] });
  const s = new WeekSettler(port, () => undefined);
  s.offer(inputs({ record: record(m('12:00:00', 50)) }));
  await s.idle();
  assert.deepEqual([...s.existing], ['B']);
  const bad = fakePort({ readStints: [new WeekResultFormatError('格式不符')] });
  const s2 = new WeekSettler(bad, () => undefined);
  s2.offer(inputs({ record: record(m('12:00:00', 50)) }));
  await s2.idle();
  assert.deepEqual([s2.formatError, s2.pending], ['格式不符', false]);
});

test('founder stint starts at creation: before createdAt the founder is not in the team', () => {
  const founder = STINTS.find((x) => x.memberId === 'A');
  assert.equal(founder.start.at, at('09:00:00'));
  assert.equal(latestStints(EVENTS, ['A', 'C']).find((x) => x.memberId === 'A').start, null); // creation unknown
});

test('settler: stints are cached per team revision and reread when the revision changes', async () => {
  const port = fakePort();
  const s = new WeekSettler(port, () => undefined);
  const base = { record: record(m('12:00:00', 50)), awarded: new Set(['A', 'B', 'C']) };
  s.offer(inputs(base));
  await s.idle();
  s.offer(inputs(base));
  await s.idle();
  assert.equal(port.calls.filter((c) => c[0] === 'readStints').length, 1); // same revision: cached
  s.offer(inputs({ ...base, teamRevision: 4 }));
  await s.idle();
  assert.equal(port.calls.filter((c) => c[0] === 'readStints').length, 2); // new revision: reread
});

test('settler: an award that already exists is not looked at again', async () => {
  const port = fakePort({ writeAward: ['exists', 'done', 'done'] });
  const s = new WeekSettler(port, () => undefined);
  s.offer(inputs({ record: record(m('12:00:00', 50)) }));
  await s.idle();
  s.offer(inputs({ record: record(m('12:00:00', 50)), awarded: new Set(['B', 'C']) }));
  await s.idle();
  assert.deepEqual(port.calls.filter((c) => c[0] === 'writeAward').map((c) => c[1]), ['A', 'B', 'C']);
});
