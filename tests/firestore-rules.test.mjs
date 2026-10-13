import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-yoxi-yoi-rules-test';
const EMULATOR_HOST = '127.0.0.1';
const EMULATOR_PORT = 8088;
const SESSION = 'spike-session-1';
const CLOCK_VERSION = 4;
// YOXI_RULES_FILE lets scripts/mutate-contrib-rules.mjs load a mutated copy; the real file is never edited.
const RULES = readFileSync(process.env.YOXI_RULES_FILE || new URL('../firestore.rules', import.meta.url), 'utf8');
if (process.env.YOXI_RULES_FILE) console.log(`Rules under test: ${process.env.YOXI_RULES_FILE} (mutation copy, not firestore.rules)`);
let env;

before(async () => {
  if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== PROJECT_ID) {
    throw new Error(`Refusing non-test project ${process.env.GCLOUD_PROJECT}`);
  }
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: EMULATOR_HOST, port: EMULATOR_PORT, rules: RULES },
  });
});

after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'membersByUid/uid-m01'), { memberId: 'YOI-M01', role: 'member', active: true });
    await setDoc(doc(db, 'membersByUid/uid-m02'), { memberId: 'YOI-M02', role: 'member', active: true });
    await setDoc(doc(db, 'membersByUid/uid-m03'), { memberId: 'YOI-M03', role: 'member', active: true });
    await setDoc(doc(db, 'membersByUid/uid-inactive'), { memberId: 'YOI-M04', role: 'member', active: false });
    await setDoc(doc(db, 'membersByUid/uid-m05'), { memberId: 'YOI-M05', role: 'member', active: true });
    await setDoc(doc(db, 'membersByUid/uid-m06'), { memberId: 'YOI-M06', role: 'member', active: true });
    await setDoc(doc(db, 'demo/current'), { sessionId: SESSION, clockVersion: CLOCK_VERSION, scenarioNow: '2026-09-30T12:00:00+08:00', activityWeekId: '2026-09-28' });
  });
});

const memberDb = (uid = 'uid-m01') => env.authenticatedContext(uid).firestore();
const DAY = '2026-09-30';
const dailyRef = (db = memberDb(), sessionId = SESSION, memberId = 'YOI-M01', day = DAY) =>
  doc(db, `dailySteps/${sessionId}/members/${memberId}/days/${day}`);
const YESTERDAY = '2026-09-29';
const dailyEventRef = (db, seq, day = DAY, memberId = 'YOI-M01', sessionId = SESSION) =>
  doc(db, `dailySteps/${sessionId}/members/${memberId}/days/${day}/events/${seq}`);
// FSD-01C canonical shapes.
const dailyDoc = (overrides = {}) => ({ sessionId: SESSION, memberId: 'YOI-M01', taskDate: DAY, clockVersion: CLOCK_VERSION,
  rawSteps: 0, effectiveSteps: 0, rideCompletedAt: null, claimed: 0, eventSeq: 0, lastSyncedAt: serverTimestamp(), ...overrides });
const eventDoc = (overrides = {}) => ({ sessionId: SESSION, memberId: 'YOI-M01', taskDate: DAY, seq: 1, kind: 'steps',
  rawDelta: 0, pointsDelta: 0, claimedAfter: 0, occurredAt: NOW, syncedAt: serverTimestamp(), clockVersion: CLOCK_VERSION, ...overrides });
const clearDaily = async (day = DAY, memberId = 'YOI-M01', sessionId = SESSION) => env.withSecurityRulesDisabled(async (context) => {
  const db = context.firestore();
  await deleteDoc(dailyRef(db, sessionId, memberId, day));
  for (let seq = 0; seq <= 45; seq += 1) await deleteDoc(dailyEventRef(db, seq, day, memberId, sessionId));
});
const seedDaily = async (state, day = DAY) => {
  await clearDaily(day, state.memberId ?? 'YOI-M01', state.sessionId ?? SESSION);
  await env.withSecurityRulesDisabled((context) => setDoc(dailyRef(context.firestore(), state.sessionId ?? SESSION, state.memberId ?? 'YOI-M01', day), state));
};
const rawDaily = (day = DAY, memberId = 'YOI-M01', sessionId = SESSION) => rawData(`dailySteps/${sessionId}/members/${memberId}/days/${day}`);
// Builds the daily update and its event exactly as src/daily/daily-service.ts does, from the stored
// state (or `from`), then lets `tweak` corrupt either document so the Rules alone decide.
const dailyWrite = async (kind, value, { uid = 'uid-m01', member = 'YOI-M01', day = DAY, session = SESSION, tweak, skipEvent, skipDaily, from } = {}) => {
  const o = from ?? await rawDaily(day, member, session);
  const clock = await rawData('demo/current');
  const now = clock.scenarioNow;
  const d = { ...o, clockVersion: clock.clockVersion, eventSeq: o.eventSeq + 1, lastSyncedAt: serverTimestamp() };
  let rawDelta = 0;
  let pointsDelta = 0;
  let occurredAt = now;
  if (kind === 'steps') {
    d.rawSteps = value;
    d.effectiveSteps = Math.floor(value * (o.rideCompletedAt ? 1.5 : 1));
    rawDelta = value - o.rawSteps;
    if (now.slice(0, 10) !== day) occurredAt = `${day}T23:59:59+08:00`;
  } else if (kind === 'ride') {
    d.rideCompletedAt = now;
    d.effectiveSteps = Math.floor(o.rawSteps * 1.5);
  } else {
    d.claimed = value;
    pointsDelta = value - o.claimed;
  }
  const w = { d, eventId: String(d.eventSeq), e: { sessionId: session, memberId: member, taskDate: day, seq: d.eventSeq, kind,
    rawDelta, pointsDelta, claimedAfter: d.claimed, occurredAt, syncedAt: serverTimestamp(), clockVersion: clock.clockVersion } };
  tweak?.(w);
  const db = memberDb(uid);
  const batch = writeBatch(db);
  if (!skipDaily) batch.set(dailyRef(db, session, member, day), w.d);
  if (!skipEvent) batch.set(dailyEventRef(db, w.eventId, day, member, session), w.e);
  return batch.commit();
};
// Mirrors the client's all-claim transaction (no-op when nothing is left to claim).
const claimAllTx = (uid, day = DAY) => {
  const db = memberDb(uid);
  return runTransaction(db, async (tx) => {
    const c = (await tx.get(doc(db, 'demo/current'))).data();
    const o = (await tx.get(dailyRef(db, SESSION, 'YOI-M01', day))).data();
    const unlocked = Math.min(3, Math.floor(o.effectiveSteps / 2000));
    if (unlocked <= o.claimed) return;
    const seq = o.eventSeq + 1;
    tx.set(dailyRef(db, SESSION, 'YOI-M01', day), { ...o, claimed: unlocked, eventSeq: seq, clockVersion: c.clockVersion, lastSyncedAt: serverTimestamp() });
    tx.set(dailyEventRef(db, seq, day), eventDoc({ taskDate: day, seq, kind: 'claim', pointsDelta: unlocked - o.claimed,
      claimedAfter: unlocked, occurredAt: c.scenarioNow, clockVersion: c.clockVersion }));
  });
};
const WEEK = '2026-09-28';
const NOW = `${DAY}T12:00:00+08:00`;
const TEAM_ID = 'A1B2C3D4E5F60718';
const OTHER_TEAM_ID = 'B1B2C3D4E5F60718';
const teamRef = (db, id = TEAM_ID) => doc(db, `teams/${SESSION}/items/${id}`);
const membershipRef = (db, member = 'YOI-M01') => doc(db, `teamMembership/${SESSION}/members/${member}`);
const eventRef = (db, revision, id = TEAM_ID) => doc(db, `teams/${SESSION}/items/${id}/events/${revision}`);
const teamValue = (members = ['YOI-M01'], overrides = {}) => ({ sessionId: SESSION, teamId: TEAM_ID,
  leaderMemberId: members[0] ?? null, memberIds: members, inviteCode: TEAM_ID,
  status: members.length === 0 ? 'archived' : members.length === 1 ? 'recruiting' : 'active',
  clockVersion: CLOCK_VERSION, createdAt: NOW, everFormed: members.length >= 2,
  nextJoinOrder: members.length, revision: 0, ...overrides });
const activeIndex = (memberId, joinOrder, overrides = {}) => ({ sessionId: SESSION, memberId, teamId: TEAM_ID,
  joinOrder, clockVersion: CLOCK_VERSION, status: 'active', joinedAt: NOW,
  leftTeamId: null, leftWeekId: null, leftAt: null, ...overrides });
const eventValue = (clock, teamId, revision, type, actorMemberId, targetMemberId) => ({ sessionId: SESSION, teamId,
  revision, type, actorMemberId, targetMemberId, effectiveAt: clock.scenarioNow,
  serverRecordedAt: serverTimestamp(), activityWeekId: clock.activityWeekId ?? null });
const seedTeam = async (members = ['YOI-M01', 'YOI-M02'], overrides = {}, id = TEAM_ID) => env.withSecurityRulesDisabled(async (context) => {
  const db = context.firestore();
  await setDoc(teamRef(db, id), teamValue(members, { teamId: id, inviteCode: id, ...overrides }));
  for (const [index, member] of members.entries()) {
    await setDoc(membershipRef(db, member), activeIndex(member, index, { teamId: id, clockVersion: overrides.clockVersion ?? CLOCK_VERSION }));
  }
});
const setDemo = async (overrides = {}) => env.withSecurityRulesDisabled(async (context) => {
  const value = { sessionId: SESSION, clockVersion: CLOCK_VERSION, scenarioNow: NOW, activityWeekId: WEEK, ...overrides };
  for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
  await setDoc(doc(context.firestore(), 'demo/current'), value);
});
const rawData = async (path) => {
  let data;
  await env.withSecurityRulesDisabled(async (context) => { data = (await getDoc(doc(context.firestore(), path))).data(); });
  return data;
};
const rawTeam = (id = TEAM_ID) => rawData(`teams/${SESSION}/items/${id}`);
const rawMembership = (member) => rawData(`teamMembership/${SESSION}/members/${member}`);

// Client operations mirror src/team/team-service.ts payloads but skip its client-side
// guards, so each negative case is decided by the Rules rather than by the browser.
const createTeamOp = (uid, memberId, id = TEAM_ID) => {
  const db = memberDb(uid);
  return runTransaction(db, async (tx) => {
    const [clock, collision] = await Promise.all([tx.get(doc(db, 'demo/current')), tx.get(teamRef(db, id))]);
    assert.equal(collision.exists(), false);
    const c = clock.data();
    tx.set(teamRef(db, id), { sessionId: SESSION, teamId: id, leaderMemberId: memberId, memberIds: [memberId], inviteCode: id,
      status: 'recruiting', clockVersion: c.clockVersion, createdAt: c.scenarioNow, everFormed: false, nextJoinOrder: 1, revision: 0 });
    tx.set(membershipRef(db, memberId), activeIndex(memberId, 0, { teamId: id, clockVersion: c.clockVersion, joinedAt: c.scenarioNow }));
  });
};
const joinOp = (uid, memberId, id = TEAM_ID) => {
  const db = memberDb(uid);
  return runTransaction(db, async (tx) => {
    const [clock, team] = await Promise.all([tx.get(doc(db, 'demo/current')), tx.get(teamRef(db, id))]);
    const c = clock.data();
    const t = team.data();
    const next = { ...t, memberIds: [...t.memberIds, memberId], status: 'active', everFormed: true,
      nextJoinOrder: t.nextJoinOrder + 1, revision: t.revision + 1, clockVersion: c.clockVersion };
    tx.set(teamRef(db, id), next);
    tx.set(membershipRef(db, memberId), activeIndex(memberId, t.nextJoinOrder, { teamId: id, clockVersion: c.clockVersion, joinedAt: c.scenarioNow }));
    tx.set(eventRef(db, next.revision, id), eventValue(c, id, next.revision, 'join', memberId, memberId));
  });
};
const leaveOp = (uid, memberId) => {
  const db = memberDb(uid);
  return runTransaction(db, async (tx) => {
    const [clock, own] = await Promise.all([tx.get(doc(db, 'demo/current')), tx.get(membershipRef(db, memberId))]);
    const c = clock.data();
    const m = own.data();
    const team = (await tx.get(teamRef(db, m.teamId))).data();
    const memberIds = team.memberIds.filter((id) => id !== memberId);
    const next = { ...team, memberIds,
      leaderMemberId: memberIds.length === 0 ? null : team.leaderMemberId === memberId ? memberIds[0] : team.leaderMemberId,
      status: memberIds.length === 0 ? 'archived' : memberIds.length === 1 ? (team.everFormed ? 'paused' : 'recruiting') : 'active',
      revision: team.revision + 1, clockVersion: c.clockVersion };
    tx.set(teamRef(db, m.teamId), next);
    tx.set(membershipRef(db, memberId), { ...m, teamId: null, clockVersion: c.clockVersion, status: 'left', leftTeamId: m.teamId,
      leftWeekId: team.everFormed ? (c.activityWeekId ?? null) : null, leftAt: c.scenarioNow });
    tx.set(eventRef(db, next.revision, m.teamId), eventValue(c, m.teamId, next.revision, team.everFormed ? 'leave' : 'cancelRecruiting', memberId, memberId));
  });
};
const transferOp = (uid, memberId, targetMemberId) => {
  const db = memberDb(uid);
  return runTransaction(db, async (tx) => {
    const [clock, own] = await Promise.all([tx.get(doc(db, 'demo/current')), tx.get(membershipRef(db, memberId))]);
    const c = clock.data();
    const team = (await tx.get(teamRef(db, own.data().teamId))).data();
    const revision = team.revision + 1;
    tx.set(teamRef(db, team.teamId), { ...team, leaderMemberId: targetMemberId, revision, clockVersion: c.clockVersion });
    tx.set(eventRef(db, revision, team.teamId), eventValue(c, team.teamId, revision, 'transferCaptain', memberId, targetMemberId));
  });
};
test('existing paths: only own mapping get; list, writes and cross-UID access remain denied', async () => {
  const db = memberDb();
  assert.equal((await assertSucceeds(getDoc(doc(db, 'membersByUid/uid-m01')))).data().memberId, 'YOI-M01');
  await assertFails(getDoc(doc(db, 'membersByUid/uid-m02')));
  await assertFails(getDocs(collection(db, 'membersByUid')));
  await assertFails(setDoc(doc(db, 'membersByUid/uid-m01'), { active: false }));
  await assertFails(updateDoc(doc(db, 'membersByUid/uid-m01'), { active: false }));
  await assertFails(deleteDoc(doc(db, 'membersByUid/uid-m01')));
});

// FSD-AC1/06A: the published 70acb267 Rules differ from the published 01C-04A Rules only by the marked AC1,
// 06A and 07A blocks and the removed gasSpike section; both snapshots are pinned to their published hashes.
const lfText = (t) => t.replace(/\r\n/g, '\n');
const sha256 = async (t) => (await import('node:crypto')).createHash('sha256').update(t).digest('hex');
const cutBlock = (t, from, to) => {
  const a = t.indexOf(from);
  const b = t.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `markers ${from.trim()}`);
  return t.slice(0, a) + t.slice(b + to.length);
};
const PUBLISHED_70ACB267 = () => lfText(readFileSync(new URL('./fixtures/published-rules-70acb267.rules', import.meta.url), 'utf8'));

test('AC1/06A/07A: the published 70acb267 Rules outside the marked blocks are the 01C-04A Rules without gasSpike', async () => {
  const published = lfText(readFileSync(new URL('./fixtures/published-rules-6f5c1e4c.rules', import.meta.url), 'utf8'));
  assert.equal(await sha256(published), '6f5c1e4cc20a023b33d027f3a6e5bfaf6a3b612efa732c2ff813e46a07325882');
  let current = PUBLISHED_70ACB267();
  assert.equal(await sha256(current), '70acb267aeec7fe446fc05fdb5c80f77b56c4c41bcf0d6a59ecc053d12785327');
  current = cutBlock(current, '\n    // ===== FSD-AC1 >>>', '    // ===== FSD-AC1 <<<\n');
  current = cutBlock(current, '      // ===== FSD-06A daily-list >>>', '      // ===== FSD-06A daily-list <<<\n');
  current = cutBlock(current, '\n    // ===== FSD-06A >>>', '    // ===== FSD-06A <<<\n');
  current = cutBlock(current, '\n    // ===== FSD-07A >>>', '    // ===== FSD-07A <<<\n');
  // gasSpike: its helpers start at ownsSpikeState and end with its match (the first `list, delete` deny after them).
  const withoutSpike = cutBlock(published, '    function ownsSpikeState(', '      allow list, delete: if false;\n    }\n\n');
  assert.equal(current, withoutSpike);
});

// FSD-04B/03E (Architect B1): the Rules are the published 70acb267 Rules plus the 04B edit plus the 03E block.
const FSD_04B_REPLACEMENTS = [
  ["    // of the week (built from weekId) and require 6,000 effective steps each plus Sunday's third point.\n",
   '    // of the week (built from weekId) and require 6,000 effective steps each (FSD-04B: no third-point condition).\n'],
  ['>= 6000\n        && couponDay(sessionId, memberId, monday, 6).claimed == 3;\n', '>= 6000;\n'],
];
test('04B/03E: the Rules are the published 70acb267 Rules plus the 04B edit and the marked 03E block', async () => {
  if (process.env.YOXI_RULES_FILE) return; // mutation copies change the blocks on purpose
  let expected = PUBLISHED_70ACB267();
  assert.equal(await sha256(expected), '70acb267aeec7fe446fc05fdb5c80f77b56c4c41bcf0d6a59ecc053d12785327');
  for (const [from, to] of FSD_04B_REPLACEMENTS) {
    assert.equal(expected.split(from).length - 1, 1, `04B replacement occurs once: ${from.trim().slice(0, 50)}`);
    expected = expected.replace(from, () => to);
  }
  const current = cutBlock(lfText(RULES), '\n    // ===== FSD-03E >>>', '    // ===== FSD-03E <<<\n');
  assert.equal(current, expected);
  // Security S2: the block itself holds one match (teamNames documents only) and only its own teamName* helpers.
  const rules = lfText(RULES);
  const block = rules.slice(rules.indexOf('    // ===== FSD-03E >>>'), rules.indexOf('    // ===== FSD-03E <<<'));
  assert.deepEqual(block.match(/\bmatch \/[^{]*\{[^}]*\}[^{]*\{[^}]*\}/g), ['match /teamNames/{sessionId}/items/{teamId}']);
  assert.deepEqual([...block.matchAll(/function (\w+)\(/g)].map((m) => m[1]), ['teamNameTeam', 'teamNameMemberNow', 'teamNameLeaderNow', 'teamNameShape']);
  assert.doesNotMatch(block, /=\*\*|if true|allow read|allow write/);
});

test('AC1 memberProfiles: active members get any display name; nobody lists or writes', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'membersByUid/uid-admin'), { memberId: 'YOI-A01', role: 'admin', active: true });
    await setDoc(doc(db, 'memberProfiles/YOI-M01'), { displayName: '成員一' });
    await setDoc(doc(db, 'memberProfiles/YOI-M02'), { displayName: '成員二' });
  });
  const db = memberDb();
  assert.equal((await assertSucceeds(getDoc(doc(db, 'memberProfiles/YOI-M01')))).data().displayName, '成員一');
  assert.equal((await assertSucceeds(getDoc(doc(db, 'memberProfiles/YOI-M02')))).data().displayName, '成員二');
  assert.equal((await assertSucceeds(getDoc(doc(db, 'memberProfiles/YOI-M09')))).exists(), false);
  await assertFails(getDoc(doc(db, 'memberProfiles/YOI-M01/extra/x'))); // no subcollection is readable
  await assertFails(getDoc(doc(memberDb('uid-inactive'), 'memberProfiles/YOI-M01')));
  await assertFails(getDoc(doc(memberDb('uid-unmapped'), 'memberProfiles/YOI-M01')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'memberProfiles/YOI-M01')));
  for (const uid of ['uid-m01', 'uid-admin']) {
    const w = memberDb(uid);
    await assertFails(getDocs(collection(w, 'memberProfiles')));
    await assertFails(setDoc(doc(w, 'memberProfiles/YOI-M03'), { displayName: '新名字' }));
    await assertFails(setDoc(doc(w, 'memberProfiles/YOI-M01'), { displayName: '改名' }));
    await assertFails(updateDoc(doc(w, 'memberProfiles/YOI-M01'), { displayName: '改名' }));
    await assertFails(deleteDoc(doc(w, 'memberProfiles/YOI-M01')));
  }
});

test('existing demo/current remains active-member get-only', async () => {
  assert.equal((await assertSucceeds(getDoc(doc(memberDb(), 'demo/current')))).data().sessionId, SESSION);
  await assertFails(getDoc(doc(memberDb('uid-inactive'), 'demo/current')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'demo/current')));
  await assertFails(updateDoc(doc(memberDb(), 'demo/current'), { clockVersion: 5 }));
  await assertFails(setDoc(doc(memberDb(), 'demo/current'), { sessionId: 'attacker-session' }));
});

// FSD-06A Q6: the Apps Script spike is gone; its collection falls to the closed catch-all.
test('06A gasSpike: the retired spike collection is closed for every read and write', async () => {
  const ref = (db) => doc(db, `gasSpike/${SESSION}/members/YOI-M01`);
  await env.withSecurityRulesDisabled((context) => setDoc(ref(context.firestore()),
    { sessionId: SESSION, memberId: 'YOI-M01', clockVersion: CLOCK_VERSION, rawSteps: 0, points: 0, claimedMilestones: [] }));
  await assertFails(getDoc(ref(memberDb())));
  await assertFails(setDoc(doc(memberDb(), `gasSpike/${SESSION}/members/YOI-M02`),
    { sessionId: SESSION, memberId: 'YOI-M02', clockVersion: CLOCK_VERSION, rawSteps: 0, points: 0, claimedMilestones: [] }));
  await assertFails(updateDoc(ref(memberDb()), { rawSteps: 2000 }));
  await assertFails(deleteDoc(ref(memberDb())));
  await assertFails(getDocs(collection(memberDb(), `gasSpike/${SESSION}/members`)));
});

// ----- FSD-06A: chest opening and the points ledger -----
const chestRef = (db, weekId = WEEK, memberId = 'YOI-M01', sessionId = SESSION) => doc(db, `chestOpens/${sessionId}/members/${memberId}/weeks/${weekId}`);
const chestOpen = (overrides = {}) => ({ sessionId: SESSION, memberId: 'YOI-M01', weekId: WEEK, tier: 'small', points: 5,
  openedAt: NOW, clockVersion: CLOCK_VERSION, recordedAt: serverTimestamp(), ...overrides });
// The award's own shape is 03C-2's concern; the opening only needs it to exist.
const seedChestAward = (memberId = 'YOI-M01', weekId = WEEK, sessionId = SESSION) => env.withSecurityRulesDisabled((context) =>
  setDoc(doc(context.firestore(), `chestAwards/${sessionId}/weeks/${weekId}/awards/${memberId}`), { sessionId, weekId, memberId, teamId: 'A1B2C3D4E5F60718' }));

test('06A chest: the owner opens an awarded chest once, with a legal tier and points', async () => {
  await seedChestAward();
  const db = memberDb();
  await assertSucceeds(setDoc(chestRef(db), chestOpen()));
  const stored = (await assertSucceeds(getDoc(chestRef(db)))).data();
  assert.equal(stored.points, 5);
  // Opened once: a second create (an update to the Rules), an update and a delete are refused.
  await assertFails(setDoc(chestRef(db), chestOpen({ tier: 'super', points: 50 })));
  await assertFails(updateDoc(chestRef(db), { points: 50 }));
  await assertFails(deleteDoc(chestRef(db)));
  // Every tier at its legal edges.
  for (const [i, tier, points] of [[1, 'basic', 1], [2, 'basic', 3], [3, 'big', 10], [4, 'big', 20], [5, 'super', 50], [6, 'basic', 2]]) {
    const weekId = `2026-0${i}-05`;
    await seedChestAward('YOI-M01', weekId);
    await assertSucceeds(setDoc(chestRef(db, weekId), chestOpen({ weekId, tier, points })));
  }
});

test('06A chest: illegal points, tiers, fields, times, owners, sessions and missing chests are refused', async () => {
  await seedChestAward();
  await seedChestAward('YOI-M02');
  const db = memberDb();
  for (const [tier, points] of [['basic', 0], ['basic', 4], ['small', 4], ['small', 6], ['big', 9], ['big', 21], ['super', 49], ['super', 51],
    ['basic', 1.5], ['basic', '2'], ['mega', 5], ['mega', 50], ['small', null], [null, 5],
    ['mega', 2], [null, 2], ['small', 50], ['basic', 5], ['big', 50], ['super', 5]]) {
    await assertFails(setDoc(chestRef(db), chestOpen({ tier, points })));
  }
  for (const bad of [{ openedAt: '2026-09-30T11:59:00+08:00' }, { clockVersion: CLOCK_VERSION - 1 }, { recordedAt: new Date() },
    { sessionId: 'other' }, { memberId: 'YOI-M02' }, { weekId: '2026-09-21' }, { extra: 1 }]) {
    await assertFails(setDoc(chestRef(db), chestOpen(bad)));
  }
  const missing = chestOpen();
  delete missing.tier;
  await assertFails(setDoc(chestRef(db), missing));
  // No chest for that week; someone else's chest; an inactive or unmapped member; an old session.
  await assertFails(setDoc(chestRef(db, '2026-09-21'), chestOpen({ weekId: '2026-09-21' })));
  // Only the weeks collection exists (Security L2): a sibling collection under the member is closed.
  await assertFails(setDoc(doc(db, `chestOpens/${SESSION}/members/YOI-M01/other/${WEEK}`), chestOpen()));
  await assertFails(setDoc(chestRef(db, WEEK, 'YOI-M02'), chestOpen({ memberId: 'YOI-M02' })));
  await seedChestAward('YOI-M04');
  await assertFails(setDoc(chestRef(memberDb('uid-inactive'), WEEK, 'YOI-M04'), chestOpen({ memberId: 'YOI-M04' })));
  await assertFails(setDoc(chestRef(env.unauthenticatedContext().firestore()), chestOpen()));
  await seedChestAward('YOI-M01', WEEK, 'old-session');
  await assertFails(setDoc(chestRef(db, WEEK, 'YOI-M01', 'old-session'), chestOpen({ sessionId: 'old-session' })));
  // The control: the same write passes once everything is right.
  await assertSucceeds(setDoc(chestRef(db), chestOpen()));
});

test('06A chest: only the owner gets or lists their openings in the current session', async () => {
  await seedChestAward();
  await assertSucceeds(setDoc(chestRef(memberDb()), chestOpen()));
  await assertSucceeds(getDoc(chestRef(memberDb())));
  assert.equal((await assertSucceeds(getDocs(collection(memberDb(), `chestOpens/${SESSION}/members/YOI-M01/weeks`)))).size, 1);
  await assertFails(getDoc(chestRef(memberDb('uid-m02'))));
  await assertFails(getDocs(collection(memberDb('uid-m02'), `chestOpens/${SESSION}/members/YOI-M01/weeks`)));
  await assertFails(getDocs(collection(memberDb('uid-inactive'), `chestOpens/${SESSION}/members/YOI-M04/weeks`)));
  await assertFails(getDocs(collection(memberDb(), `chestOpens/old-session/members/YOI-M01/weeks`)));
  await assertFails(getDoc(chestRef(env.unauthenticatedContext().firestore())));
  await assertFails(getDocs(collectionGroup(memberDb(), 'weeks')));
});

test('06A daily list: the owner lists their own days of the current session only', async () => {
  await assertSucceeds(setDoc(dailyRef(), dailyDoc()));
  await assertSucceeds(setDoc(dailyRef(memberDb(), SESSION, 'YOI-M01', YESTERDAY), dailyDoc({ taskDate: YESTERDAY })));
  assert.equal((await assertSucceeds(getDocs(collection(memberDb(), `dailySteps/${SESSION}/members/YOI-M01/days`)))).size, 2);
  await assertFails(getDocs(collection(memberDb('uid-m02'), `dailySteps/${SESSION}/members/YOI-M01/days`)));
  await assertFails(getDocs(collection(memberDb('uid-inactive'), `dailySteps/${SESSION}/members/YOI-M04/days`)));
  await assertFails(getDocs(collection(memberDb(), `dailySteps/old-session/members/YOI-M01/days`)));
  await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), `dailySteps/${SESSION}/members/YOI-M01/days`)));
  await assertFails(getDocs(collectionGroup(memberDb(), 'days')));
  // Listing does not open the events: they stay owner get-only.
  await assertFails(getDocs(collection(memberDb(), `dailySteps/${SESSION}/members/YOI-M01/days/${DAY}/events`)));
});

// ----- FSD-07A: referrals (simulated) -----
const referralRef = (db, refereeId = 'YOI-M02', sessionId = SESSION) => doc(db, `referrals/${sessionId}/referees/${refereeId}`);
const referralDoc = (overrides = {}) => ({ sessionId: SESSION, refereeId: 'YOI-M02', referrerId: 'YOI-M01', boundAt: NOW, firstRideAt: null,
  clockVersion: CLOCK_VERSION, recordedAt: serverTimestamp(), firstRideRecordedAt: null, ...overrides });
const seedProfiles = () => env.withSecurityRulesDisabled(async (context) => {
  const db = context.firestore();
  await setDoc(doc(db, 'membersByUid/uid-admin'), { memberId: 'YOI-A01', role: 'admin', active: true });
  for (const id of ['YOI-M01', 'YOI-M02', 'YOI-M03', 'YOI-M04', 'YOI-M05', 'YOI-A01']) await setDoc(doc(db, `memberProfiles/${id}`), { displayName: id });
});
const seedReferral = (refereeId, referrerId, extra = {}) => env.withSecurityRulesDisabled((context) =>
  setDoc(referralRef(context.firestore(), refereeId), { ...referralDoc({ refereeId, referrerId }), recordedAt: new Date(), ...extra }));
// The front end's binding transaction: own referral must not exist; the referrer's referral is read
// (when readable) to rule out a mutual pair.
const bindLikeApp = (uid, refereeId, referrerId) => { const db = memberDb(uid); return runTransaction(db, async (tx) => {
  if ((await tx.get(referralRef(db, refereeId))).exists()) throw new Error('already bound');
  const theirs = await tx.get(referralRef(db, referrerId));
  if (theirs.exists() && theirs.data().referrerId === refereeId) throw new Error('mutual');
  tx.set(referralRef(db, refereeId), referralDoc({ refereeId, referrerId }));
}); };

test('07A referral: a referee binds a valid code once; invalid, self, mutual and repeated bindings are refused', async () => {
  await seedProfiles();
  const b = memberDb('uid-m02');
  await assertFails(setDoc(referralRef(b), referralDoc({ referrerId: 'YOI-M09' })));          // invalid code
  await assertFails(setDoc(referralRef(b), referralDoc({ referrerId: 'YOI-M02' })));          // self
  await assertFails(setDoc(referralRef(b), referralDoc({ referrerId: 'YOI-M01/../x' })));     // not a plain id
  await assertSucceeds(setDoc(referralRef(b), referralDoc()));
  await assertFails(setDoc(referralRef(b), referralDoc({ referrerId: 'YOI-M03' })));          // rebinding
  await assertFails(updateDoc(referralRef(b), { referrerId: 'YOI-M03' }));
  await assertFails(deleteDoc(referralRef(b)));
  // Mutual: M01 (who referred M02) cannot now use M02's code; M03 can.
  await assertFails(setDoc(referralRef(memberDb('uid-m01'), 'YOI-M01'), referralDoc({ refereeId: 'YOI-M01', referrerId: 'YOI-M02' })));
  await assertSucceeds(setDoc(referralRef(memberDb('uid-m03'), 'YOI-M03'), referralDoc({ refereeId: 'YOI-M03', referrerId: 'YOI-M02' })));
  // The admin account is one of the six: it can refer and be referred.
  await assertSucceeds(setDoc(referralRef(memberDb('uid-admin'), 'YOI-A01'), referralDoc({ refereeId: 'YOI-A01', referrerId: 'YOI-M01' })));
  await assertSucceeds(setDoc(referralRef(memberDb('uid-m05'), 'YOI-M05'), referralDoc({ refereeId: 'YOI-M05', referrerId: 'YOI-A01' })));
});

test('07A referral: fields, times, owners, sessions and inactive members are checked on binding', async () => {
  await seedProfiles();
  const b = memberDb('uid-m02');
  for (const bad of [{ boundAt: '2026-09-30T11:00:00+08:00' }, { clockVersion: CLOCK_VERSION - 1 }, { recordedAt: new Date() },
    { firstRideAt: NOW }, { firstRideRecordedAt: new Date() }, { sessionId: 'other' }, { refereeId: 'YOI-M03' }, { referrerId: 5 }, { extra: 1 }]) {
    await assertFails(setDoc(referralRef(b), referralDoc(bad)));
  }
  const missing = referralDoc();
  delete missing.firstRideRecordedAt;
  await assertFails(setDoc(referralRef(b), missing));
  await assertFails(setDoc(referralRef(memberDb('uid-m03')), referralDoc()));                  // binding for someone else
  await assertFails(setDoc(referralRef(memberDb('uid-inactive'), 'YOI-M04'), referralDoc({ refereeId: 'YOI-M04' })));
  await assertFails(setDoc(referralRef(env.unauthenticatedContext().firestore()), referralDoc()));
  await assertFails(setDoc(referralRef(b, 'YOI-M02', 'old-session'), referralDoc({ sessionId: 'old-session' })));
  await assertSucceeds(setDoc(referralRef(b), referralDoc()));                                 // the control
});

test('07A referral: the first ride is set once by the referee only, and nothing else changes', async () => {
  await seedProfiles();
  await seedReferral('YOI-M02', 'YOI-M01');
  const b = memberDb('uid-m02');
  const ride = { firstRideAt: NOW, firstRideRecordedAt: serverTimestamp() };
  await assertFails(updateDoc(referralRef(memberDb('uid-m01')), ride));                          // the referrer cannot press it
  await assertFails(updateDoc(referralRef(b), { firstRideAt: '2026-09-30T11:00:00+08:00', firstRideRecordedAt: serverTimestamp() }));
  await assertFails(updateDoc(referralRef(b), { firstRideAt: NOW, firstRideRecordedAt: new Date() }));
  await assertFails(updateDoc(referralRef(b), { firstRideAt: NOW }));
  await assertFails(updateDoc(referralRef(b), { ...ride, referrerId: 'YOI-M03' }));
  await assertFails(updateDoc(referralRef(b), { ...ride, boundAt: NOW, clockVersion: CLOCK_VERSION + 1 }));
  await assertFails(updateDoc(referralRef(memberDb('uid-inactive'), 'YOI-M02'), ride));
  await seedReferral('YOI-M04', 'YOI-M01');
  await assertFails(updateDoc(referralRef(memberDb('uid-inactive'), 'YOI-M04'), ride));             // an inactive referee, own referral
  await assertSucceeds(updateDoc(referralRef(b), ride));
  await assertFails(updateDoc(referralRef(b), ride));                                             // a second first ride
  // Later the same day the time moved on: a second first ride at the new time is still refused.
  await env.withSecurityRulesDisabled((context) => updateDoc(doc(context.firestore(), 'demo/current'), { scenarioNow: '2026-09-30T15:00:00+08:00' }));
  await assertFails(updateDoc(referralRef(b), { firstRideAt: '2026-09-30T15:00:00+08:00', firstRideRecordedAt: serverTimestamp() }));
  await env.withSecurityRulesDisabled((context) => updateDoc(doc(context.firestore(), 'demo/current'), { scenarioNow: NOW }));
  // An old session's referral cannot be completed.
  await env.withSecurityRulesDisabled((context) => setDoc(referralRef(context.firestore(), 'YOI-M02', 'old-session'),
    { ...referralDoc({ sessionId: 'old-session' }), recordedAt: new Date() }));
  await assertFails(updateDoc(referralRef(b, 'YOI-M02', 'old-session'), ride));
});

test('07A referral: the referee and the referrer read it; a missing one reads as missing; lists need the own filter', async () => {
  await seedProfiles();
  await seedReferral('YOI-M02', 'YOI-M01');
  await seedReferral('YOI-M03', 'YOI-M05');
  assert.equal((await assertSucceeds(getDoc(referralRef(memberDb('uid-m02'))))).data().referrerId, 'YOI-M01');
  await assertSucceeds(getDoc(referralRef(memberDb('uid-m01'))));
  await assertFails(getDoc(referralRef(memberDb('uid-m01'), 'YOI-M03')));                        // someone else's referral
  assert.equal((await assertSucceeds(getDoc(referralRef(memberDb('uid-m01'), 'YOI-M01')))).exists(), false); // own, not yet bound
  assert.equal((await assertSucceeds(getDoc(referralRef(memberDb('uid-m01'), 'YOI-M06')))).exists(), false); // missing
  await assertFails(getDoc(referralRef(memberDb('uid-inactive'), 'YOI-M06')));
  await assertFails(getDoc(referralRef(env.unauthenticatedContext().firestore())));
  await assertFails(getDoc(referralRef(memberDb('uid-m02'), 'YOI-M02', 'old-session')));
  const list = (uid, who) => getDocs(query(collection(memberDb(uid), `referrals/${SESSION}/referees`), where('referrerId', '==', who)));
  assert.equal((await assertSucceeds(list('uid-m01', 'YOI-M01'))).size, 1);
  await assertFails(list('uid-m01', 'YOI-M05'));
  await assertFails(getDocs(collection(memberDb('uid-m01'), `referrals/${SESSION}/referees`)));
  await assertFails(list('uid-inactive', 'YOI-M04'));
  await env.withSecurityRulesDisabled((context) => setDoc(referralRef(context.firestore(), 'YOI-M06', 'old-session'),
    { ...referralDoc({ sessionId: 'old-session', refereeId: 'YOI-M06' }), recordedAt: new Date() }));
  await assertFails(getDocs(query(collection(memberDb('uid-m01'), 'referrals/old-session/referees'), where('referrerId', '==', 'YOI-M01'))));
});

test('07A referral: two members binding each other at once through the app end with at most one referral', async () => {
  await seedProfiles();
  // The positive control: the same helper binds one member on its own.
  await bindLikeApp('uid-m03', 'YOI-M03', 'YOI-M05');
  const results = await Promise.allSettled([bindLikeApp('uid-m01', 'YOI-M01', 'YOI-M02'), bindLikeApp('uid-m02', 'YOI-M02', 'YOI-M01')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, JSON.stringify(results.map((r) => r.status === 'rejected' ? String(r.reason) : 'ok')));
  const loser = results.find((r) => r.status === 'rejected');
  assert.match(String(loser.reason?.code ?? loser.reason?.message), /permission-denied|mutual/);
  // withSecurityRulesDisabled does not pass the callback's value through: record it inside.
  const raw = async (id) => { let found = false; await env.withSecurityRulesDisabled(async (c) => { found = (await getDoc(referralRef(c.firestore(), id))).exists(); }); return found; };
  assert.equal(Number(await raw('YOI-M01')) + Number(await raw('YOI-M02')), 1);
});

test('all other feature collections remain denied', async () => {
  const db = memberDb();
  await assertFails(getDoc(doc(db, 'teams/team-1')));
  await assertFails(setDoc(doc(db, 'teams/team-1'), { name: 'not in spike' }));
  await assertFails(getDoc(doc(db, 'rewards/reward-1')));
});

test('01C daily: owner creates zero docs for today and yesterday only; malformed, other member/session, legacy shapes, list by others and delete denied', async () => {
  await assertSucceeds(setDoc(dailyRef(), dailyDoc()));
  await assertSucceeds(setDoc(dailyRef(memberDb(), SESSION, 'YOI-M01', YESTERDAY), dailyDoc({ taskDate: YESTERDAY })));
  await assertFails(setDoc(dailyRef(memberDb(), SESSION, 'YOI-M01', '2026-09-28'), dailyDoc({ taskDate: '2026-09-28' })));
  await assertFails(setDoc(dailyRef(memberDb(), SESSION, 'YOI-M01', '2026-10-01'), dailyDoc({ taskDate: '2026-10-01' })));
  await assertFails(setDoc(dailyRef(memberDb(), SESSION, 'YOI-M01', '2026-9-29'), dailyDoc({ taskDate: '2026-9-29' })));
  await assertFails(setDoc(dailyRef(memberDb('uid-m02')), dailyDoc()));
  await assertFails(setDoc(dailyRef(memberDb('uid-m02'), SESSION, 'YOI-M02'), dailyDoc()));
  await assertFails(setDoc(dailyRef(memberDb('uid-inactive'), SESSION, 'YOI-M04'), dailyDoc({ memberId: 'YOI-M04' })));
  await assertFails(setDoc(dailyRef(memberDb(), 'old-session'), dailyDoc({ sessionId: 'old-session' })));
  await clearDaily();
  for (const bad of [{ rawSteps: 10 }, { effectiveSteps: 1 }, { claimed: 1 }, { eventSeq: 1 }, { rideCompletedAt: NOW },
    { clockVersion: CLOCK_VERSION - 1 }, { lastSyncedAt: NOW }, { extra: true }, { taskDate: YESTERDAY }]) {
    await assertFails(setDoc(dailyRef(), dailyDoc(bad)));
  }
  const missing = dailyDoc();
  delete missing.eventSeq;
  await assertFails(setDoc(dailyRef(), missing));
  // FSD-01A seven-field and FSD-01B ten-field shapes are no longer accepted.
  await assertFails(setDoc(dailyRef(), { sessionId: SESSION, memberId: 'YOI-M01', taskDate: DAY, clockVersion: CLOCK_VERSION,
    rawSteps: 0, points: 0, claimedMilestones: [] }));
  await assertFails(setDoc(dailyRef(), { sessionId: SESSION, memberId: 'YOI-M01', taskDate: DAY, clockVersion: CLOCK_VERSION,
    rawSteps: 0, effectiveSteps: 0, rideCompleted: false, rideCompletedAt: null, points: 0, claimedMilestones: [] }));
  await assertSucceeds(setDoc(dailyRef(), dailyDoc()));
  await assertFails(getDocs(collection(memberDb('uid-m02'), `dailySteps/${SESSION}/members/YOI-M01/days`))); // 06A: only the owner lists
  await assertFails(deleteDoc(dailyRef()));
  await assertFails(getDoc(dailyRef(env.unauthenticatedContext().firestore())));
});

test('01C daily: legacy documents seeded inside a session cannot be updated', async () => {
  await env.withSecurityRulesDisabled((context) => setDoc(dailyRef(context.firestore()), {
    sessionId: SESSION, memberId: 'YOI-M01', taskDate: DAY, clockVersion: CLOCK_VERSION, rawSteps: 4000, points: 1, claimedMilestones: [1] }));
  const db = memberDb();
  const batch = writeBatch(db);
  batch.set(dailyRef(db), dailyDoc({ rawSteps: 5000, effectiveSteps: 5000, eventSeq: 1 }));
  batch.set(dailyEventRef(db, 1), eventDoc({ seq: 1, kind: 'steps', rawDelta: 1000 }));
  await assertFails(batch.commit());
});

test('01C daily: 1999/2000/3999/4000/5999/6000 boundaries with sequential claims (P03)', async () => {
  await seedDaily(dailyDoc());
  await assertSucceeds(dailyWrite('steps', 1999));
  await assertFails(dailyWrite('claim', 1));
  await assertSucceeds(dailyWrite('steps', 2000));
  await assertSucceeds(dailyWrite('claim', 1));
  await assertSucceeds(dailyWrite('steps', 3999));
  await assertFails(dailyWrite('claim', 2));
  await assertSucceeds(dailyWrite('steps', 4000));
  await assertSucceeds(dailyWrite('claim', 2));
  await assertSucceeds(dailyWrite('steps', 5999));
  await assertFails(dailyWrite('claim', 3));
  await assertSucceeds(dailyWrite('steps', 6000));
  await assertSucceeds(dailyWrite('claim', 3));
  const stored = await rawDaily();
  assert.equal(stored.claimed, 3);
  assert.equal(stored.eventSeq, 9);
  const third = await rawData(`dailySteps/${SESSION}/members/YOI-M01/days/${DAY}/events/9`);
  assert.deepEqual([third.kind, third.pointsDelta, third.claimedAfter, third.occurredAt], ['claim', 1, 3, NOW]);
});

test('01C daily: one claim counter covers single and all claims; skips, replays, over-unlocked and mixed writes denied (P04, P05)', async () => {
  await seedDaily(dailyDoc({ rawSteps: 6000, effectiveSteps: 6000 }));
  await assertFails(dailyWrite('claim', 0));
  await assertFails(dailyWrite('claim', 4));
  await assertSucceeds(dailyWrite('claim', 3)); // all-claim books 1→3 at once
  await assertFails(dailyWrite('claim', 3));    // replay
  await assertFails(dailyWrite('claim', 2));    // rollback
  await seedDaily(dailyDoc({ rawSteps: 4000, effectiveSteps: 4000, claimed: 1, eventSeq: 1 }));
  await assertFails(dailyWrite('claim', 3));    // only two milestones unlocked
  await assertSucceeds(dailyWrite('claim', 2)); // after one point, all-claim adds one more
  await seedDaily(dailyDoc({ rawSteps: 6000, effectiveSteps: 6000 }));
  await assertFails(dailyWrite('claim', 1, { tweak: (w) => { w.d.rawSteps = 7000; w.d.effectiveSteps = 7000; } }));
  await assertFails(dailyWrite('claim', 1, { tweak: (w) => { delete w.d.claimed; } }));
  await assertFails(dailyWrite('claim', 1, { tweak: (w) => { w.d.claimed = 1.5; w.e.claimedAfter = 1.5; w.e.pointsDelta = 1.5; } }));
  await assertSucceeds(dailyWrite('claim', 1));
});

test('01C daily: downsteps, same-value replay, floats, the cap, wrong effective steps and a stale device are denied (P05)', async () => {
  await seedDaily(dailyDoc({ rawSteps: 6000, effectiveSteps: 6000, eventSeq: 3 }));
  await assertFails(dailyWrite('steps', 5999));
  await assertFails(dailyWrite('steps', 6000));
  await assertFails(dailyWrite('steps', 6000.5, { tweak: (w) => { w.d.effectiveSteps = 6000; } }));
  await assertFails(dailyWrite('steps', 1000001));
  await assertFails(dailyWrite('steps', 7000, { tweak: (w) => { w.d.effectiveSteps = 7001; } }));
  await assertFails(dailyWrite('steps', 7000, { tweak: (w) => { w.d.memberId = 'YOI-M02'; } }));
  await assertFails(dailyWrite('steps', 7000, { tweak: (w) => { w.d.clockVersion = CLOCK_VERSION + 1; w.e.clockVersion = CLOCK_VERSION + 1; } }));
  await assertSucceeds(dailyWrite('steps', 1000000));
  // A second device built its write from eventSeq 3 before the first one landed.
  await assertFails(dailyWrite('steps', 1000000, { from: dailyDoc({ rawSteps: 6000, effectiveSteps: 6000, eventSeq: 3 }) }));
  await assertFails(dailyWrite('steps', 8000));
  assert.equal((await rawDaily()).rawSteps, 1000000);
});

test('01C daily: one ride today multiplies by 1.5 with floor; a second ride and a ride on yesterday are denied (P07, P08)', async () => {
  await seedDaily(dailyDoc({ rawSteps: 4000, effectiveSteps: 4000, claimed: 1, eventSeq: 2 }));
  await assertFails(dailyWrite('ride', null, { tweak: (w) => { w.d.rideCompletedAt = `${DAY}T11:59:00+08:00`; } }));
  await assertFails(dailyWrite('ride', null, { tweak: (w) => { w.d.effectiveSteps = 6001; } }));
  await assertFails(dailyWrite('ride', null, { tweak: (w) => { w.d.rawSteps = 4001; } }));
  await assertSucceeds(dailyWrite('ride'));
  const stored = await rawDaily();
  assert.deepEqual([stored.effectiveSteps, stored.rideCompletedAt, stored.claimed], [6000, NOW, 1]);
  await assertFails(dailyWrite('ride'));
  await assertSucceeds(dailyWrite('claim', 3));
  await assertSucceeds(dailyWrite('steps', 5001));
  assert.equal((await rawDaily()).effectiveSteps, 7501);
  await assertFails(dailyWrite('steps', 5002, { tweak: (w) => { w.d.effectiveSteps = 5002; } })); // ride multiplier cannot be dropped
  await seedDaily(dailyDoc({ rawSteps: 1, effectiveSteps: 1 }));
  await assertSucceeds(dailyWrite('ride'));
  assert.equal((await rawDaily()).effectiveSteps, 1);
  await assertSucceeds(dailyWrite('steps', 2001));
  assert.equal((await rawDaily()).effectiveSteps, 3001);
  await assertSucceeds(dailyWrite('claim', 1));
  // Yesterday's document never takes a ride, even when the ride field is otherwise valid.
  await seedDaily(dailyDoc({ taskDate: YESTERDAY, rawSteps: 4000, effectiveSteps: 4000 }), YESTERDAY);
  await assertFails(dailyWrite('ride', null, { day: YESTERDAY }));
  await assertFails(dailyWrite('ride', null, { day: YESTERDAY, tweak: (w) => { w.d.rideCompletedAt = `${YESTERDAY}T20:00:00+08:00`; w.e.occurredAt = `${YESTERDAY}T20:00:00+08:00`; } }));
});

test('01C daily: yesterday sync is stamped 23:59:59 and reopens the remaining claims (P09, PRD §5.3)', async () => {
  // Yesterday: 3,000 steps with a completed ride (4,500 effective), first point claimed.
  await seedDaily(dailyDoc({ taskDate: YESTERDAY, clockVersion: CLOCK_VERSION - 1, rawSteps: 3000, effectiveSteps: 4500,
    rideCompletedAt: `${YESTERDAY}T08:30:00+08:00`, claimed: 1, eventSeq: 3 }), YESTERDAY);
  const opts = { day: YESTERDAY };
  await assertFails(dailyWrite('steps', 4000, { ...opts, tweak: (w) => { w.e.occurredAt = NOW; } }));
  await assertFails(dailyWrite('steps', 4000, { ...opts, tweak: (w) => { w.e.occurredAt = `${YESTERDAY}T15:00:00+08:00`; } }));
  await assertFails(dailyWrite('steps', 4000, { ...opts, tweak: (w) => { w.e.occurredAt = `${YESTERDAY}T23:59:59.000+08:00`; } }));
  await assertSucceeds(dailyWrite('steps', 4000, opts));
  const stored = await rawDaily(YESTERDAY);
  assert.deepEqual([stored.rawSteps, stored.effectiveSteps, stored.clockVersion], [4000, 6000, CLOCK_VERSION]);
  const segment = await rawData(`dailySteps/${SESSION}/members/YOI-M01/days/${YESTERDAY}/events/4`);
  assert.deepEqual([segment.kind, segment.rawDelta, segment.occurredAt], ['steps', 1000, `${YESTERDAY}T23:59:59+08:00`]);
  // Claiming yesterday is stamped with the real claim time, and does not touch today's quota.
  await assertFails(dailyWrite('claim', 3, { ...opts, tweak: (w) => { w.e.occurredAt = `${YESTERDAY}T23:59:59+08:00`; } }));
  await assertSucceeds(dailyWrite('claim', 3, opts));
  assert.equal((await rawData(`dailySteps/${SESSION}/members/YOI-M01/days/${YESTERDAY}/events/5`)).occurredAt, NOW);
  await seedDaily(dailyDoc({ rawSteps: 6000, effectiveSteps: 6000 }));
  await assertSucceeds(dailyWrite('claim', 3));
});

test('01C daily: the window opens today and yesterday only, across month, year and leap boundaries (P06)', async () => {
  const cases = [
    ['2026-10-01T00:00:00+08:00', '2026-09-30', true], ['2026-10-01T23:59:59+08:00', '2026-09-30', true],
    ['2026-10-01T00:00:00+08:00', '2026-10-01', true], ['2026-03-01T09:00:00+08:00', '2026-02-28', true],
    ['2028-03-01T09:00:00+08:00', '2028-02-29', true], ['2027-01-01T09:00:00+08:00', '2026-12-31', true],
    ['2026-10-09T09:00:00+08:00', '2026-10-08', true], ['2026-10-02T00:00:00+08:00', '2026-09-30', false],
    ['2026-10-01T09:00:00+08:00', '2026-10-02', false], ['2026-10-01T09:00:00+08:00', '2026-09-31', false],
    ['2026-10-01T09:00:00+08:00', '2026-9-30', false], ['2026-10-01T09:00:00+08:00', '2026-09-030', false],
    ['2026-03-01T09:00:00+08:00', '2026-02-29', false], ['2026-05-01T09:00:00+08:00', '2026-04-31', false],
    ['2026-10-01T09:00:00+08:00', '+2026-09-30', false],
  ];
  for (const [scenarioNow, day, open] of cases) {
    await setDemo({ scenarioNow, activityWeekId: undefined });
    await clearDaily(day);
    const write = setDoc(dailyRef(memberDb(), SESSION, 'YOI-M01', day), dailyDoc({ taskDate: day }));
    if (open) await assertSucceeds(write); else await assertFails(write);
  }
  // D+2 00:00 closes both sync and claims on an existing document of day D.
  await setDemo({ scenarioNow: '2026-09-30T23:59:59+08:00', activityWeekId: undefined });
  await seedDaily(dailyDoc({ taskDate: '2026-09-29', rawSteps: 6000, effectiveSteps: 6000 }), '2026-09-29');
  await assertSucceeds(dailyWrite('claim', 1, { day: '2026-09-29' }));
  await setDemo({ scenarioNow: '2026-10-01T00:00:00+08:00', activityWeekId: undefined });
  await assertFails(dailyWrite('claim', 2, { day: '2026-09-29' }));
  await assertFails(dailyWrite('steps', 7000, { day: '2026-09-29' }));
  assert.equal((await rawDaily('2026-09-29')).claimed, 1);
});

test('01C daily: a clock advance turns today into yesterday: sync and claim continue at the new clock, the ride closes', async () => {
  await seedDaily(dailyDoc({ rawSteps: 3000, effectiveSteps: 3000 }));
  await assertSucceeds(dailyWrite('steps', 3500));
  await setDemo({ clockVersion: CLOCK_VERSION + 1, scenarioNow: '2026-10-01T08:00:00+08:00', activityWeekId: undefined });
  await assertFails(dailyWrite('steps', 4000, { tweak: (w) => { w.d.clockVersion = CLOCK_VERSION; w.e.clockVersion = CLOCK_VERSION; } }));
  await assertFails(dailyWrite('ride'));
  await assertSucceeds(dailyWrite('steps', 4000));
  assert.equal((await rawData(`dailySteps/${SESSION}/members/YOI-M01/days/${DAY}/events/2`)).occurredAt, `${DAY}T23:59:59+08:00`);
  await assertSucceeds(dailyWrite('claim', 2));
  await setDemo({ clockVersion: CLOCK_VERSION + 2, scenarioNow: '2026-10-02T08:00:00+08:00', activityWeekId: undefined });
  await assertFails(dailyWrite('steps', 5000));
  await assertFails(dailyWrite('claim', 2));
  await assertSucceeds(getDoc(dailyRef())); // still readable by its owner as history
});

test('01C daily: orphan, missing, skipped, mislabelled and forged events are denied (A1, A2)', async () => {
  await seedDaily(dailyDoc({ rawSteps: 6000, effectiveSteps: 6000 }));
  const db = memberDb();
  // Orphan events beside an unchanged daily document.
  await assertFails(setDoc(dailyEventRef(db, 0), eventDoc({ seq: 0, kind: 'claim', pointsDelta: 3, claimedAfter: 3 })));
  await assertFails(setDoc(dailyEventRef(db, 1), eventDoc({ seq: 1, kind: 'claim', pointsDelta: 3, claimedAfter: 3 })));
  await assertFails(dailyWrite('claim', 1, { skipDaily: true }));
  await assertFails(dailyWrite('claim', 1, { skipEvent: true }));
  // Sequence and identity of the event.
  await assertFails(dailyWrite('claim', 1, { tweak: (w) => { w.d.eventSeq = 2; w.e.seq = 2; w.eventId = '2'; } }));
  await assertFails(dailyWrite('claim', 1, { tweak: (w) => { w.eventId = '7'; } }));
  await assertFails(dailyWrite('claim', 1, { tweak: (w) => { w.e.memberId = 'YOI-M02'; } }));
  await assertFails(dailyWrite('claim', 1, { tweak: (w) => { w.e.taskDate = YESTERDAY; } }));
  await assertFails(dailyWrite('claim', 1, { tweak: (w) => { w.e.clockVersion = CLOCK_VERSION - 1; } }));
  await assertFails(dailyWrite('claim', 1, { tweak: (w) => { w.e.syncedAt = NOW; } }));
  await assertFails(dailyWrite('claim', 1, { tweak: (w) => { w.e.extra = true; } }));
  await assertFails(dailyWrite('claim', 1, { tweak: (w) => { delete w.e.kind; } }));
  // Event values that disagree with the daily change.
  await assertFails(dailyWrite('claim', 1, { tweak: (w) => { w.e.kind = 'steps'; } }));
  await assertFails(dailyWrite('claim', 1, { tweak: (w) => { w.e.pointsDelta = 2; } }));
  await assertFails(dailyWrite('claim', 1, { tweak: (w) => { w.e.claimedAfter = 3; } }));
  await assertFails(dailyWrite('claim', 1, { tweak: (w) => { w.e.rawDelta = 5; } }));
  await assertFails(dailyWrite('claim', 1, { tweak: (w) => { w.e.occurredAt = `${DAY}T11:00:00+08:00`; } }));
  await assertFails(dailyWrite('steps', 7000, { tweak: (w) => { w.e.rawDelta = 999; } }));
  await assertFails(dailyWrite('steps', 7000, { tweak: (w) => { w.e.kind = 'ride'; } }));
  await assertFails(dailyWrite('steps', 7000, { tweak: (w) => { w.e.claimedAfter = 1; } }));
  await assertFails(dailyWrite('steps', 7000, { tweak: (w) => { w.e.occurredAt = `${DAY}T23:59:59+08:00`; } }));
  // Another member cannot write into this member's day or events.
  await assertFails(dailyWrite('claim', 1, { uid: 'uid-m02' }));
  // The valid write passes, and replaying the same batch is refused (event IDs are create-only).
  await assertSucceeds(dailyWrite('claim', 1));
  await assertFails(dailyWrite('claim', 1, { from: dailyDoc({ rawSteps: 6000, effectiveSteps: 6000 }) }));
  await assertFails(updateDoc(dailyEventRef(db, 1), { pointsDelta: 3 }));
  await assertFails(deleteDoc(dailyEventRef(db, 1)));
  assert.equal((await rawDaily()).claimed, 1);
});

test('01C daily: two devices claiming at once book each milestone once (P19)', async () => {
  await seedDaily(dailyDoc({ rawSteps: 6000, effectiveSteps: 6000 }));
  const results = await Promise.allSettled([claimAllTx('uid-m01'), claimAllTx('uid-m01'), claimAllTx('uid-m01')]);
  assert.ok(results.some((r) => r.status === 'fulfilled'));
  const stored = await rawDaily();
  assert.equal(stored.claimed, 3);
  assert.equal(stored.eventSeq, 1);
  assert.equal(await rawData(`dailySteps/${SESSION}/members/YOI-M01/days/${DAY}/events/2`), undefined);
});

test('01C daily: worst-case accepted paths stay within Rules limits (yesterday with ride, 0→3 claim, cap)', async () => {
  await seedDaily(dailyDoc({ taskDate: YESTERDAY, rawSteps: 999999, effectiveSteps: 1499998, rideCompletedAt: `${YESTERDAY}T21:00:00+08:00`, eventSeq: 40 }), YESTERDAY);
  await assertSucceeds(dailyWrite('steps', 1000000, { day: YESTERDAY }));
  await assertSucceeds(dailyWrite('claim', 3, { day: YESTERDAY }));
  await seedDaily(dailyDoc({ rawSteps: 999999, effectiveSteps: 999999, claimed: 2, eventSeq: 40 }));
  await assertSucceeds(dailyWrite('ride'));
  await assertSucceeds(dailyWrite('claim', 3));
});

test('01C daily: owners read any day of the session; teammates read today only; events stay owner-only', async () => {
  await seedTeam(['YOI-M01', 'YOI-M02']);
  await seedDaily(dailyDoc({ rawSteps: 3210, effectiveSteps: 3210 }));
  await seedDaily(dailyDoc({ taskDate: '2026-09-20', rawSteps: 500, effectiveSteps: 500 }), '2026-09-20');
  await seedDaily(dailyDoc({ taskDate: YESTERDAY }), YESTERDAY);
  await assertSucceeds(dailyWrite('steps', 3300));
  await assertSucceeds(getDoc(dailyRef(memberDb(), SESSION, 'YOI-M01', '2026-09-20')));
  await assertSucceeds(getDoc(dailyRef(memberDb(), SESSION, 'YOI-M01', YESTERDAY)));
  await assertSucceeds(getDoc(dailyEventRef(memberDb(), 1)));
  await assertFails(getDoc(dailyRef(memberDb(), SESSION, 'YOI-M01', '2026-9-20')));
  await assertFails(getDocs(collection(memberDb(), `dailySteps/${SESSION}/members/YOI-M01/days/${DAY}/events`)));
  const teammate = memberDb('uid-m02');
  assert.equal((await assertSucceeds(getDoc(dailyRef(teammate)))).data().rawSteps, 3300);
  await assertFails(getDoc(dailyRef(teammate, SESSION, 'YOI-M01', YESTERDAY)));
  await assertFails(getDoc(dailyEventRef(teammate, 1)));
  await assertFails(getDoc(dailyRef(memberDb('uid-m03'))));
  await assertFails(getDoc(dailyEventRef(memberDb('uid-m03'), 1)));
});

// QA round 1: each case below differs from an accepted write in exactly one respect, so a passing
// assertFails proves the named rule rather than a neighbouring one.
test('01C daily: claimed never exceeds 3 even when more milestones would fit the steps', async () => {
  await seedDaily(dailyDoc({ rawSteps: 10000, effectiveSteps: 10000 }));
  await assertFails(dailyWrite('claim', 4));
  await assertSucceeds(dailyWrite('claim', 3));
});

test('01C daily: the daily document itself must carry the current clock version and server sync time', async () => {
  await seedDaily(dailyDoc({ rawSteps: 3000, effectiveSteps: 3000 }));
  await assertFails(dailyWrite('steps', 3500, { tweak: (w) => { w.d.clockVersion = CLOCK_VERSION - 1; } }));
  await assertFails(dailyWrite('steps', 3500, { tweak: (w) => { w.d.lastSyncedAt = NOW; } }));
  await assertSucceeds(dailyWrite('steps', 3500));
  // After an advance, a document that keeps its stored (older) clock is refused even with a correct event.
  await setDemo({ clockVersion: CLOCK_VERSION + 1, scenarioNow: '2026-10-01T08:00:00+08:00', activityWeekId: undefined });
  await assertFails(dailyWrite('steps', 4000, { tweak: (w) => { w.d.clockVersion = CLOCK_VERSION; } }));
  await assertSucceeds(dailyWrite('steps', 4000));
});

test('01C daily: a confirmed ride time cannot be replaced by a later ride on the same day', async () => {
  await seedDaily(dailyDoc({ rawSteps: 4000, effectiveSteps: 6000, rideCompletedAt: NOW, eventSeq: 2 }));
  await setDemo({ clockVersion: CLOCK_VERSION + 1, scenarioNow: `${DAY}T15:00:00+08:00` });
  await assertFails(dailyWrite('ride'));
  assert.equal((await rawDaily()).rideCompletedAt, NOW);
  await seedDaily(dailyDoc({ rawSteps: 4000, effectiveSteps: 4000, eventSeq: 2 }));
  await assertSucceeds(dailyWrite('ride'));
});

test('01C daily: step and ride events cannot carry points, steps or a different time', async () => {
  await seedDaily(dailyDoc({ rawSteps: 3000, effectiveSteps: 3000 }));
  await assertFails(dailyWrite('steps', 3500, { tweak: (w) => { w.e.pointsDelta = 1; } }));
  await assertFails(dailyWrite('ride', null, { tweak: (w) => { w.e.occurredAt = `${DAY}T11:00:00+08:00`; } }));
  await assertFails(dailyWrite('ride', null, { tweak: (w) => { w.e.rawDelta = 1; } }));
  await assertFails(dailyWrite('ride', null, { tweak: (w) => { w.e.pointsDelta = 1; } }));
  await assertFails(dailyWrite('steps', 3500, { tweak: (w) => { w.e.rawDelta = 500.5; } }));
  await assertFails(dailyWrite('steps', 3500, { tweak: (w) => { w.e.sessionId = 'other-session'; } }));
  await assertSucceeds(dailyWrite('steps', 3500));
  await assertSucceeds(dailyWrite('ride'));
});

test('01C daily: inactive members and closed sessions cannot update or read, and the same write passes once open', async () => {
  const m04 = { memberId: 'YOI-M04' };
  await seedDaily(dailyDoc({ ...m04, rawSteps: 3000, effectiveSteps: 3000 }));
  await assertFails(dailyWrite('steps', 3500, { uid: 'uid-inactive', member: 'YOI-M04' }));
  await assertFails(getDoc(dailyRef(memberDb('uid-inactive'), SESSION, 'YOI-M04')));
  await env.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), 'membersByUid/uid-inactive'), { memberId: 'YOI-M04', role: 'member', active: true }));
  await assertSucceeds(getDoc(dailyRef(memberDb('uid-inactive'), SESSION, 'YOI-M04')));
  await assertSucceeds(dailyWrite('steps', 3500, { uid: 'uid-inactive', member: 'YOI-M04' }));

  const old = 'old-session';
  await seedDaily(dailyDoc({ sessionId: old, rawSteps: 3000, effectiveSteps: 3000 }));
  await assertFails(dailyWrite('steps', 3500, { session: old }));
  await assertFails(getDoc(dailyRef(memberDb(), old)));
  await setDemo({ sessionId: old });
  await assertSucceeds(getDoc(dailyRef(memberDb(), old)));
  await assertSucceeds(dailyWrite('steps', 3500, { session: old }));
});

test('01C daily: an FSD-01B ten-field document seeded in a session cannot be updated either', async () => {
  await env.withSecurityRulesDisabled((context) => setDoc(dailyRef(context.firestore()), {
    sessionId: SESSION, memberId: 'YOI-M01', taskDate: DAY, clockVersion: CLOCK_VERSION, rawSteps: 4000, effectiveSteps: 4000,
    rideCompleted: false, rideCompletedAt: null, claimedMilestones: [1], points: 1 }));
  const db = memberDb();
  const batch = writeBatch(db);
  batch.set(dailyRef(db), dailyDoc({ rawSteps: 5000, effectiveSteps: 5000, claimed: 1, eventSeq: 1 }));
  batch.set(dailyEventRef(db, 1), eventDoc({ seq: 1, kind: 'steps', rawDelta: 1000, claimedAfter: 1 }));
  await assertFails(batch.commit());
});

test('01C daily: yesterday with a ride floors odd catch-up totals', async () => {
  await seedDaily(dailyDoc({ taskDate: YESTERDAY, rawSteps: 1, effectiveSteps: 1, rideCompletedAt: `${YESTERDAY}T09:00:00+08:00`, eventSeq: 2 }), YESTERDAY);
  await assertFails(dailyWrite('steps', 2001, { day: YESTERDAY, tweak: (w) => { w.d.effectiveSteps = 3002; } }));
  await assertSucceeds(dailyWrite('steps', 2001, { day: YESTERDAY }));
  assert.equal((await rawDaily(YESTERDAY)).effectiveSteps, 3001);
});

test('team: create writes a recruiting team and its own active index atomically', async () => {
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  const db = memberDb();
  const team = (await assertSucceeds(getDoc(teamRef(db)))).data();
  assert.deepEqual(team.memberIds, ['YOI-M01']);
  assert.equal(team.status, 'recruiting');
  assert.equal(team.revision, 0);
  assert.equal((await assertSucceeds(getDoc(membershipRef(db)))).data().status, 'active');
  await assertFails(getDocs(collection(db, `teams/${SESSION}/items`)));
  await assertFails(getDoc(membershipRef(memberDb('uid-m02'), 'YOI-M01')));
  await assertSucceeds(getDoc(teamRef(memberDb('uid-m02')))); // exact invite-code lookup only
  await assertFails(createTeamOp('uid-m01', 'YOI-M01', OTHER_TEAM_ID)); // already in a team
});

test('team: join by exact code appends roster, index and revision event atomically', async () => {
  await seedTeam(['YOI-M01']);
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));
  const joined = await rawTeam();
  assert.deepEqual(joined.memberIds, ['YOI-M01', 'YOI-M02']);
  assert.equal(joined.status, 'active');
  assert.equal(joined.everFormed, true);
  assert.equal(joined.leaderMemberId, 'YOI-M01');
  assert.equal(joined.nextJoinOrder, 2);
  assert.equal(joined.revision, 1);
  assert.equal((await rawMembership('YOI-M02')).joinOrder, 1);
  assert.equal((await assertSucceeds(getDoc(eventRef(memberDb('uid-m02'), 1)))).data().type, 'join');
  await assertFails(getDoc(eventRef(memberDb('uid-m03'), 1)));
  await assertFails(getDocs(collection(memberDb('uid-m02'), `teams/${SESSION}/items/${TEAM_ID}/events`)));
  await assertFails(setDoc(membershipRef(memberDb('uid-m02'), 'YOI-M03'), activeIndex('YOI-M03', 2)));
});

test('team: join without event, reordered roster or wrong join order is denied', async () => {
  await seedTeam(['YOI-M01']);
  const db = memberDb('uid-m02');
  const attempt = (mutate) => runTransaction(db, async (tx) => {
    const t = (await tx.get(teamRef(db))).data();
    const next = { ...t, memberIds: [...t.memberIds, 'YOI-M02'], status: 'active', everFormed: true, nextJoinOrder: 2, revision: 1 };
    const writes = { team: next, index: activeIndex('YOI-M02', 1), event: eventValue({ scenarioNow: NOW, activityWeekId: WEEK }, TEAM_ID, 1, 'join', 'YOI-M02', 'YOI-M02') };
    mutate(writes);
    tx.set(teamRef(db), writes.team);
    tx.set(membershipRef(db, 'YOI-M02'), writes.index);
    if (writes.event) tx.set(eventRef(db, 1), writes.event);
  });
  await assertFails(attempt((w) => { w.event = null; }));
  await assertFails(attempt((w) => { w.team.memberIds = ['YOI-M02', 'YOI-M01']; }));
  await assertFails(attempt((w) => { w.index.joinOrder = 0; }));
  await assertFails(attempt((w) => { w.team.revision = 2; }));
  await assertFails(attempt((w) => { w.team.extra = true; }));
  await assertFails(attempt((w) => { delete w.team.createdAt; }));
  await assertFails(attempt((w) => { delete w.team.everFormed; }));
  await assertFails(attempt((w) => { w.team.inviteCode = OTHER_TEAM_ID; }));
  assert.deepEqual((await rawTeam()).memberIds, ['YOI-M01']);
});

test('team: malformed, short-ID or non-atomic membership/roster writes are denied', async () => {
  const db = memberDb();
  await assertFails(setDoc(teamRef(db), teamValue()));
  await assertFails(setDoc(membershipRef(db), activeIndex('YOI-M01', 0)));
  await assertFails(createTeamOp('uid-m01', 'YOI-M01', 'ABC'));
  await seedTeam(['YOI-M01']);
  await assertFails(updateDoc(teamRef(db), { memberIds: ['YOI-M01', 'YOI-M02'], status: 'active' }));
  await assertFails(setDoc(teamRef(db, 'other-session'), teamValue(['YOI-M01'], { sessionId: 'other-session', teamId: 'other-session', inviteCode: 'other-session' })));
});

test('team: sixth member, inactive users and duplicate membership are denied', async () => {
  const full = ['YOI-M01', 'YOI-M02', 'YOI-M03', 'YOI-M04', 'YOI-M05'];
  await seedTeam(full);
  await assertFails(getDoc(teamRef(memberDb('uid-inactive'))));
  await assertFails(joinOp('uid-m06', 'YOI-M06'));
  await assertFails(joinOp('uid-m03', 'YOI-M03'));
  assert.equal((await rawTeam()).memberIds.length, 5);
});

test('team: teams and indexes written under an older clock remain joinable', async () => {
  await seedTeam(['YOI-M01'], { clockVersion: CLOCK_VERSION - 1 });
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));
  assert.deepEqual((await rawTeam()).memberIds, ['YOI-M01', 'YOI-M02']);
  assert.equal((await rawTeam()).clockVersion, CLOCK_VERSION);
});

test('team: concurrent claims for the fifth seat admit exactly one member', async () => {
  await seedTeam(['YOI-M01', 'YOI-M02', 'YOI-M03', 'YOI-M04']);
  const results = await Promise.allSettled([joinOp('uid-m05', 'YOI-M05'), joinOp('uid-m06', 'YOI-M06')]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const finalTeam = await rawTeam();
  assert.equal(finalTeam.memberIds.length, 5);
  assert.equal(finalTeam.revision, 1);
});

test('03B: formed-team leave hands over captain, pauses at one, archives at zero and locks the week', async () => {
  await seedTeam(['YOI-M01', 'YOI-M02', 'YOI-M03']);
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const member of ['YOI-M01', 'YOI-M02', 'YOI-M03']) await setDoc(dailyRef(db, SESSION, member, DAY), dailyDoc({ memberId: member }));
  });
  await assertSucceeds(getDoc(dailyRef(memberDb('uid-m01'), SESSION, 'YOI-M02', DAY)));

  await assertSucceeds(leaveOp('uid-m01', 'YOI-M01'));
  let team = await rawTeam();
  assert.deepEqual(team.memberIds, ['YOI-M02', 'YOI-M03']);
  assert.equal(team.leaderMemberId, 'YOI-M02');
  assert.equal(team.status, 'active');
  assert.equal(team.revision, 1);
  const left = await rawMembership('YOI-M01');
  assert.equal(left.status, 'left');
  assert.equal(left.teamId, null);
  assert.equal(left.leftTeamId, TEAM_ID);
  assert.equal(left.leftWeekId, WEEK);
  assert.equal(left.leftAt, NOW);
  assert.equal(left.joinOrder, 0);
  assert.equal((await assertSucceeds(getDoc(eventRef(memberDb('uid-m02'), 1)))).data().type, 'leave');

  // Former member loses teammate visibility both ways; remaining members keep it.
  await assertFails(getDoc(dailyRef(memberDb('uid-m01'), SESSION, 'YOI-M02', DAY)));
  await assertFails(getDoc(dailyRef(memberDb('uid-m02'), SESSION, 'YOI-M01', DAY)));
  await assertFails(getDoc(eventRef(memberDb('uid-m01'), 1)));
  await assertSucceeds(getDoc(dailyRef(memberDb('uid-m02'), SESSION, 'YOI-M03', DAY)));

  // Same-week lock: no rejoin, no other team, no new recruiting team.
  await seedTeam(['YOI-M05'], {}, OTHER_TEAM_ID);
  await assertFails(joinOp('uid-m01', 'YOI-M01'));
  await assertFails(joinOp('uid-m01', 'YOI-M01', OTHER_TEAM_ID));
  await assertFails(createTeamOp('uid-m01', 'YOI-M01', 'C1B2C3D4E5F60718'));

  await assertSucceeds(leaveOp('uid-m02', 'YOI-M02'));
  team = await rawTeam();
  assert.deepEqual(team.memberIds, ['YOI-M03']);
  assert.equal(team.leaderMemberId, 'YOI-M03');
  assert.equal(team.status, 'paused');
  assert.equal(team.revision, 2);

  await assertSucceeds(leaveOp('uid-m03', 'YOI-M03'));
  team = await rawTeam();
  assert.deepEqual(team.memberIds, []);
  assert.equal(team.leaderMemberId, null);
  assert.equal(team.status, 'archived');
  assert.equal(team.revision, 3);
  assert.equal((await rawMembership('YOI-M03')).leftWeekId, WEEK);
  await assertFails(getDoc(teamRef(memberDb('uid-m05'))));
});

test('03B: a paused team resumes when a new member joins and join order keeps counting', async () => {
  await seedTeam(['YOI-M01', 'YOI-M02']);
  await assertSucceeds(leaveOp('uid-m02', 'YOI-M02'));
  assert.equal((await rawTeam()).status, 'paused');
  await assertSucceeds(joinOp('uid-m03', 'YOI-M03'));
  const team = await rawTeam();
  assert.deepEqual(team.memberIds, ['YOI-M01', 'YOI-M03']);
  assert.equal(team.status, 'active');
  assert.equal(team.nextJoinOrder, 3);
  assert.equal(team.revision, 2);
  assert.equal((await rawMembership('YOI-M03')).joinOrder, 2);
});

test('03B: cancelling a recruiting team archives it without a week lock and allows retry', async () => {
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(leaveOp('uid-m01', 'YOI-M01'));
  const archived = await rawTeam();
  assert.equal(archived.status, 'archived');
  assert.equal(archived.leaderMemberId, null);
  assert.equal((await rawData(`teams/${SESSION}/items/${TEAM_ID}/events/1`)).type, 'cancelRecruiting');
  assert.equal((await rawMembership('YOI-M01')).leftWeekId, null);
  await assertFails(joinOp('uid-m02', 'YOI-M02')); // archived code no longer admits anyone

  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01', OTHER_TEAM_ID));
  const index = await rawMembership('YOI-M01');
  assert.equal(index.status, 'active');
  assert.equal(index.teamId, OTHER_TEAM_ID);
  assert.equal(index.joinOrder, 0);
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02', OTHER_TEAM_ID));
});

test('03B: week lock survives a mid-week clock advance and lifts next Monday', async () => {
  await seedTeam(['YOI-M01', 'YOI-M02', 'YOI-M03']);
  await assertSucceeds(leaveOp('uid-m01', 'YOI-M01'));

  await setDemo({ clockVersion: CLOCK_VERSION + 1, scenarioNow: '2026-10-01T09:00:00+08:00' });
  await assertFails(joinOp('uid-m01', 'YOI-M01'));

  await setDemo({ clockVersion: CLOCK_VERSION + 2, scenarioNow: '2026-10-05T09:00:00+08:00', activityWeekId: '2026-10-05' });
  // Indexes written under an older clock must still be able to leave.
  await assertSucceeds(leaveOp('uid-m02', 'YOI-M02'));
  assert.equal((await rawTeam()).status, 'paused');
  await assertSucceeds(joinOp('uid-m01', 'YOI-M01'));
  const team = await rawTeam();
  assert.deepEqual(team.memberIds, ['YOI-M03', 'YOI-M01']);
  assert.equal(team.leaderMemberId, 'YOI-M03');
  assert.equal(team.status, 'active');
  assert.equal((await rawMembership('YOI-M01')).joinOrder, 3);
});

test('03B: leave and transfer fail closed without demo/current.activityWeekId', async () => {
  await seedTeam(['YOI-M01', 'YOI-M02']);
  await setDemo({ activityWeekId: undefined });
  await assertFails(leaveOp('uid-m01', 'YOI-M01'));
  await assertFails(transferOp('uid-m01', 'YOI-M01', 'YOI-M02'));
  const team = await rawTeam();
  assert.equal(team.revision, 0);
  assert.equal(team.leaderMemberId, 'YOI-M01');
});

test('03B: only the current captain transfers to an existing member; captains cannot remove others', async () => {
  await seedTeam(['YOI-M01', 'YOI-M02', 'YOI-M03']);
  await assertFails(transferOp('uid-m02', 'YOI-M02', 'YOI-M03'));
  await assertFails(transferOp('uid-m01', 'YOI-M01', 'YOI-M05'));
  await assertFails(transferOp('uid-m01', 'YOI-M01', 'YOI-M01'));

  await assertSucceeds(transferOp('uid-m01', 'YOI-M01', 'YOI-M02'));
  let team = await rawTeam();
  assert.equal(team.leaderMemberId, 'YOI-M02');
  assert.deepEqual(team.memberIds, ['YOI-M01', 'YOI-M02', 'YOI-M03']);
  assert.equal(team.revision, 1);
  const event = await rawData(`teams/${SESSION}/items/${TEAM_ID}/events/1`);
  assert.equal(event.type, 'transferCaptain');
  assert.equal(event.actorMemberId, 'YOI-M01');
  assert.equal(event.targetMemberId, 'YOI-M02');

  await assertFails(transferOp('uid-m01', 'YOI-M01', 'YOI-M03'));
  await assertSucceeds(transferOp('uid-m02', 'YOI-M02', 'YOI-M03'));
  assert.equal((await rawTeam()).leaderMemberId, 'YOI-M03');

  const db = memberDb('uid-m03');
  await assertFails(runTransaction(db, async (tx) => {
    const t = (await tx.get(teamRef(db))).data();
    const revision = t.revision + 1;
    tx.set(teamRef(db), { ...t, memberIds: ['YOI-M01', 'YOI-M03'], revision });
    tx.set(eventRef(db, revision), eventValue({ scenarioNow: NOW, activityWeekId: WEEK }, TEAM_ID, revision, 'leave', 'YOI-M03', 'YOI-M02'));
  }));
  team = await rawTeam();
  assert.deepEqual(team.memberIds, ['YOI-M01', 'YOI-M02', 'YOI-M03']);
  assert.equal((await rawMembership('YOI-M02')).status, 'active');
});

test('03B: worst-case five-member team stays within Rules limits for transfer and leave', async () => {
  // Largest roster: exercises list slicing/removeAll at their maximum size under the 1000-expression cap.
  await seedTeam(['YOI-M01', 'YOI-M02', 'YOI-M03', 'YOI-M04', 'YOI-M05']);
  await assertSucceeds(transferOp('uid-m01', 'YOI-M01', 'YOI-M05'));
  await assertSucceeds(leaveOp('uid-m05', 'YOI-M05')); // captain at the end of a full roster leaves
  let team = await rawTeam();
  assert.deepEqual(team.memberIds, ['YOI-M01', 'YOI-M02', 'YOI-M03', 'YOI-M04']);
  assert.equal(team.leaderMemberId, 'YOI-M01');
  await assertSucceeds(leaveOp('uid-m01', 'YOI-M01')); // captain at the head leaves; next earliest succeeds
  team = await rawTeam();
  assert.deepEqual(team.memberIds, ['YOI-M02', 'YOI-M03', 'YOI-M04']);
  assert.equal(team.leaderMemberId, 'YOI-M02');
  assert.equal(team.revision, 3);
  await assertSucceeds(joinOp('uid-m06', 'YOI-M06'));
  assert.equal((await rawMembership('YOI-M06')).joinOrder, 5);
});

// Builds the exact leave/transfer writes of leaveOp/transferOp, lets a test tamper with them, then commits.
const tamperedTeamOp = (uid, memberId, kind, mutate, targetMemberId = 'YOI-M02') => {
  const db = memberDb(uid);
  return runTransaction(db, async (tx) => {
    const c = (await tx.get(doc(db, 'demo/current'))).data();
    const m = (await tx.get(membershipRef(db, memberId))).data();
    const team = (await tx.get(teamRef(db, m.teamId))).data();
    const revision = team.revision + 1;
    let w;
    if (kind === 'leave') {
      const memberIds = team.memberIds.filter((id) => id !== memberId);
      w = {
        team: { ...team, memberIds, revision, clockVersion: c.clockVersion,
          leaderMemberId: memberIds.length === 0 ? null : team.leaderMemberId === memberId ? memberIds[0] : team.leaderMemberId,
          status: memberIds.length === 0 ? 'archived' : memberIds.length === 1 ? (team.everFormed ? 'paused' : 'recruiting') : 'active' },
        index: { ...m, teamId: null, clockVersion: c.clockVersion, status: 'left', leftTeamId: m.teamId,
          leftWeekId: team.everFormed ? c.activityWeekId : null, leftAt: c.scenarioNow },
        event: eventValue(c, m.teamId, revision, team.everFormed ? 'leave' : 'cancelRecruiting', memberId, memberId),
      };
    } else {
      w = { team: { ...team, leaderMemberId: targetMemberId, revision, clockVersion: c.clockVersion }, index: null,
        event: eventValue(c, m.teamId, revision, 'transferCaptain', memberId, targetMemberId) };
    }
    mutate(w);
    if (w.team) tx.set(teamRef(db, m.teamId), w.team);
    if (w.index) tx.set(membershipRef(db, memberId), w.index);
    if (w.event) tx.set(eventRef(db, revision, m.teamId), w.event);
  });
};

test('03B: formed-team leave cannot forge the tombstone, skip the team update or mislabel the event', async () => {
  await seedTeam(['YOI-M01', 'YOI-M02', 'YOI-M03']);
  const leave = (mutate) => tamperedTeamOp('uid-m01', 'YOI-M01', 'leave', mutate);
  await assertFails(leave((w) => { w.index.leftWeekId = null; })); // would bypass the week lock
  await assertFails(leave((w) => { w.index.leftWeekId = '2026-09-21'; }));
  await assertFails(leave((w) => { w.index.leftTeamId = OTHER_TEAM_ID; }));
  await assertFails(leave((w) => { w.index.leftAt = `${DAY}T11:00:00+08:00`; }));
  await assertFails(leave((w) => { w.index.joinOrder = 9; }));
  await assertFails(leave((w) => { w.index = null; })); // team update without tombstone
  await assertFails(leave((w) => { w.team = null; w.event = null; })); // tombstone only
  await assertFails(leave((w) => { w.team = null; })); // tombstone + event without team update
  await assertFails(leave((w) => { w.event = null; }));
  await assertFails(leave((w) => { w.event.type = 'cancelRecruiting'; }));
  await assertFails(leave((w) => { w.event.targetMemberId = 'YOI-M02'; }));
  await assertFails(leave((w) => { w.event.effectiveAt = `${DAY}T11:00:00+08:00`; }));
  await assertFails(leave((w) => { w.event.extra = true; }));
  await assertFails(leave((w) => { w.team.leaderMemberId = 'YOI-M03'; })); // skip earliest remaining member
  await assertFails(leave((w) => { w.team.memberIds = ['YOI-M03', 'YOI-M02']; })); // reorder remaining members
  await assertFails(leave((w) => { w.team.status = 'paused'; }));
  await assertFails(leave((w) => { delete w.team.nextJoinOrder; }));
  await assertFails(leave((w) => { w.team.createdAt = NOW.replace('12:00', '11:00'); }));
  assert.equal((await rawTeam()).revision, 0);
  assert.equal((await rawMembership('YOI-M01')).status, 'active');
  await assertSucceeds(leave(() => {})); // the untampered writes are accepted
});

test('03B: recruiting cancel cannot claim a formed-team leave and transfer cannot drop fields', async () => {
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertFails(tamperedTeamOp('uid-m01', 'YOI-M01', 'leave', (w) => { w.index.leftWeekId = WEEK; }));
  await assertFails(tamperedTeamOp('uid-m01', 'YOI-M01', 'leave', (w) => { w.event.type = 'leave'; }));
  await seedTeam(['YOI-M02', 'YOI-M03'], {}, OTHER_TEAM_ID);
  const transfer = (mutate) => tamperedTeamOp('uid-m02', 'YOI-M02', 'transfer', mutate, 'YOI-M03');
  await assertFails(transfer((w) => { delete w.team.nextJoinOrder; }));
  await assertFails(transfer((w) => { delete w.team.everFormed; }));
  await assertFails(transfer((w) => { w.team.status = 'paused'; }));
  await assertFails(transfer((w) => { w.event = null; }));
  await assertFails(transfer((w) => { w.event.targetMemberId = 'YOI-M02'; }));
  await assertSucceeds(transfer(() => {}));
});

test('03B: concurrent transfer and leave always end with one valid captain', async () => {
  await seedTeam(['YOI-M01', 'YOI-M02', 'YOI-M03']);
  const [transfer, leave] = await Promise.allSettled([
    transferOp('uid-m01', 'YOI-M01', 'YOI-M02'),
    leaveOp('uid-m02', 'YOI-M02'),
  ]);
  // A loser may be denied (evaluated against the winner's state) instead of retried; either way the
  // final state must be one of the serial outcomes with exactly one captain inside the roster.
  const succeeded = [transfer, leave].filter((result) => result.status === 'fulfilled').length;
  assert.ok(succeeded >= 1);
  for (const result of [transfer, leave]) {
    if (result.status === 'rejected') assert.ok(['permission-denied', 'aborted'].includes(result.reason?.code), String(result.reason));
  }
  const team = await rawTeam();
  assert.deepEqual(team.memberIds, leave.status === 'fulfilled' ? ['YOI-M01', 'YOI-M03'] : ['YOI-M01', 'YOI-M02', 'YOI-M03']);
  assert.ok(team.memberIds.includes(team.leaderMemberId));
  assert.equal(team.leaderMemberId, leave.status === 'fulfilled' ? 'YOI-M01' : 'YOI-M02');
  assert.equal(team.revision, succeeded);
  assert.equal((await rawMembership('YOI-M02')).status, leave.status === 'fulfilled' ? 'left' : 'active');
  for (let revision = 1; revision <= team.revision; revision += 1) {
    assert.equal((await rawData(`teams/${SESSION}/items/${TEAM_ID}/events/${revision}`)).revision, revision);
  }
});

test('03B: team events are create-only and cannot be forged without a matching team revision', async () => {
  await seedTeam(['YOI-M01']);
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));
  const db = memberDb('uid-m02');
  await assertFails(updateDoc(eventRef(db, 1), { type: 'leave' }));
  await assertFails(deleteDoc(eventRef(db, 1)));
  await assertFails(setDoc(eventRef(db, 2), eventValue({ scenarioNow: NOW, activityWeekId: WEEK }, TEAM_ID, 2, 'leave', 'YOI-M02', 'YOI-M02')));
  await assertFails(setDoc(eventRef(db, 2), eventValue({ scenarioNow: NOW, activityWeekId: WEEK }, TEAM_ID, 2, 'leave', 'YOI-M01', 'YOI-M01')));
  assert.equal((await rawData(`teams/${SESSION}/items/${TEAM_ID}/events/1`)).type, 'join');
});

const ADMIN_MEMBERS = { 'uid-admin': 'YOI-A01', 'uid-admin-off': 'YOI-A02', 'uid-m01': 'YOI-M01' };
const seedAdmins = () => env.withSecurityRulesDisabled(async (context) => {
  const db = context.firestore();
  await setDoc(doc(db, 'membersByUid/uid-admin'), { memberId: 'YOI-A01', role: 'admin', active: true });
  await setDoc(doc(db, 'membersByUid/uid-admin-off'), { memberId: 'YOI-A02', role: 'admin', active: false });
});
// Mirrors the admin service: demo/current and its audit entry in one batch; `mutate` tampers before commit.
const clockChange = async (uid, next, mutate = () => {}) => {
  const cur = await rawData('demo/current');
  const db = memberDb(uid);
  const w = {
    demo: { ...next },
    logId: String(next.clockVersion),
    log: { clockVersion: next.clockVersion, kind: next.sessionId === cur.sessionId ? 'advance' : 'reset',
      actorMemberId: ADMIN_MEMBERS[uid], fromSessionId: cur.sessionId, toSessionId: next.sessionId,
      fromScenarioNow: cur.scenarioNow, toScenarioNow: next.scenarioNow, fromWeekId: cur.activityWeekId ?? null,
      toWeekId: next.activityWeekId ?? null, serverRecordedAt: serverTimestamp() },
  };
  mutate(w);
  const batch = writeBatch(db);
  if (w.demo) batch.set(doc(db, 'demo/current'), w.demo);
  if (w.log) batch.set(doc(db, `demoClockLog/${w.logId}`), w.log);
  for (const [path, value] of w.extra ?? []) batch.set(doc(db, path), value);
  return batch.commit();
};

test('02B: only an active admin advances the clock, forward only and together with a matching audit entry', async () => {
  await seedAdmins();
  const next = { sessionId: SESSION, clockVersion: CLOCK_VERSION + 1, scenarioNow: '2026-10-05T09:00:00+08:00', activityWeekId: '2026-10-05' };
  const admin = (mutate) => clockChange('uid-admin', next, mutate);
  await assertFails(clockChange('uid-m01', next));
  await assertFails(clockChange('uid-admin-off', next));
  await assertFails(admin((w) => { w.demo.clockVersion = CLOCK_VERSION + 2; w.log.clockVersion = CLOCK_VERSION + 2; w.logId = String(CLOCK_VERSION + 2); }));
  await assertFails(admin((w) => { w.demo.activityWeekId = '2026-09-28'; w.log.toWeekId = '2026-09-28'; })); // week does not contain the date
  await assertFails(admin((w) => { w.demo.scenarioNow = '2026-09-29T09:00:00+08:00'; w.log.toScenarioNow = w.demo.scenarioNow; w.demo.activityWeekId = '2026-09-28'; w.log.toWeekId = '2026-09-28'; }));
  await assertFails(admin((w) => { w.demo.scenarioNow = '2026-10-05T25:00:00+08:00'; w.log.toScenarioNow = w.demo.scenarioNow; }));
  await assertFails(admin((w) => { w.demo.scenarioNow = '2026-10-05T09:00:00.5+08:00'; w.log.toScenarioNow = w.demo.scenarioNow; }));
  await assertFails(admin((w) => { w.demo.sessionId = 'new-session'; w.log.toSessionId = 'new-session'; w.log.kind = 'reset'; }));
  await assertFails(admin((w) => { delete w.demo.activityWeekId; w.log.toWeekId = null; }));
  await assertFails(admin((w) => { w.demo.extra = true; }));
  await assertFails(admin((w) => { w.log = null; }));
  await assertFails(admin((w) => { w.demo = null; }));
  await assertFails(admin((w) => { w.log.fromScenarioNow = '2026-09-01T09:00:00+08:00'; }));
  await assertFails(admin((w) => { w.log.kind = 'reset'; }));
  await assertFails(admin((w) => { w.log.actorMemberId = 'YOI-M01'; }));
  await assertFails(admin((w) => { w.logId = String(CLOCK_VERSION + 2); }));
  await assertFails(admin((w) => { w.log.extra = true; }));
  await assertFails(admin((w) => { w.log.toWeekId = '2026-09-28'; }));
  await assertFails(admin((w) => { w.log.fromWeekId = null; }));
  await assertFails(admin((w) => { w.log.fromSessionId = 'other-session'; }));
  await assertFails(admin((w) => { w.log.toScenarioNow = '2026-10-05T10:00:00+08:00'; }));
  await assertFails(admin((w) => { w.log.serverRecordedAt = new Date('2026-10-05T01:00:00Z'); }));
  // A second, forged entry for the next version would pre-empt (and so block) every later change.
  await assertFails(admin((w) => { w.extra = [[`demoClockLog/${CLOCK_VERSION + 2}`, { ...w.log }]]; }));
  await assertFails(admin((w) => { w.demo.clockVersion = CLOCK_VERSION; w.log.clockVersion = CLOCK_VERSION; w.logId = String(CLOCK_VERSION); }));
  await assertFails(clockChange('uid-m01', next, (w) => { w.log.actorMemberId = 'YOI-M01'; }));
  const anon = env.unauthenticatedContext().firestore();
  await assertFails(setDoc(doc(anon, 'demo/current'), next));
  assert.equal((await rawData('demo/current')).clockVersion, CLOCK_VERSION);

  await assertSucceeds(admin(() => {}));
  const log = await assertSucceeds(getDoc(doc(memberDb('uid-admin'), `demoClockLog/${CLOCK_VERSION + 1}`)));
  assert.equal(log.data().kind, 'advance');
  assert.equal(log.data().fromWeekId, '2026-09-28');
  await assertFails(getDoc(doc(memberDb('uid-m01'), `demoClockLog/${CLOCK_VERSION + 1}`)));
  await assertFails(getDocs(collection(memberDb('uid-admin'), 'demoClockLog')));
  await assertFails(updateDoc(doc(memberDb('uid-admin'), `demoClockLog/${CLOCK_VERSION + 1}`), { kind: 'reset' }));
  await assertFails(deleteDoc(doc(memberDb('uid-admin'), `demoClockLog/${CLOCK_VERSION + 1}`)));
  // Same scenario time with the next version is allowed: it only forces every device to reload.
  await assertSucceeds(clockChange('uid-admin', { ...next, clockVersion: CLOCK_VERSION + 2 }));
});

test('02B: an audit entry left from a lowered clock cannot cover an unaudited advance or reset', async () => {
  await seedAdmins();
  // Simulates a Console write that lowered clockVersion below an existing audit entry.
  await env.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), `demoClockLog/${CLOCK_VERSION + 1}`), { kind: 'advance' }));
  const db = memberDb('uid-admin');
  await assertFails(setDoc(doc(db, 'demo/current'), { sessionId: SESSION, clockVersion: CLOCK_VERSION + 1, scenarioNow: '2026-10-01T09:00:00+08:00', activityWeekId: '2026-09-28' }));
  await assertFails(setDoc(doc(db, 'demo/current'), { sessionId: `s${CLOCK_VERSION + 1}`, clockVersion: CLOCK_VERSION + 1, scenarioNow: '2026-10-01T09:00:00+08:00', activityWeekId: '2026-09-28' }));
  await assertFails(clockChange('uid-admin', { sessionId: SESSION, clockVersion: CLOCK_VERSION + 1, scenarioNow: '2026-10-01T09:00:00+08:00', activityWeekId: '2026-09-28' }));
  assert.equal((await rawData('demo/current')).clockVersion, CLOCK_VERSION);
});

test('02B: an advance never lowers the stored week, and a legacy context without a week can still advance', async () => {
  await seedAdmins();
  // Inconsistent stored week (Console-written): a later date whose real week is earlier must still be refused.
  await setDemo({ activityWeekId: '2026-10-05' });
  await assertFails(clockChange('uid-admin', { sessionId: SESSION, clockVersion: CLOCK_VERSION + 1, scenarioNow: '2026-10-01T09:00:00+08:00', activityWeekId: '2026-09-28' }));
  await setDemo({ activityWeekId: undefined });
  await assertSucceeds(clockChange('uid-admin', { sessionId: SESSION, clockVersion: CLOCK_VERSION + 1, scenarioNow: '2026-10-01T09:00:00+08:00', activityWeekId: '2026-09-28' }));
  assert.equal((await rawData(`demoClockLog/${CLOCK_VERSION + 1}`)).fromWeekId, null);
});

test('02B: the activity week is verified against the scenario date across week, month, leap-year and year boundaries', async () => {
  await seedAdmins();
  let version = CLOCK_VERSION;
  const step = (scenarioNow, activityWeekId) => clockChange('uid-admin', { sessionId: SESSION, clockVersion: version + 1, scenarioNow, activityWeekId });
  const ok = async (scenarioNow, weekId) => { await assertSucceeds(step(scenarioNow, weekId)); version += 1; };
  await ok('2026-10-04T23:59:59+08:00', '2026-09-28'); // Sunday end still belongs to the week
  await assertFails(step('2026-10-05T00:00:00+08:00', '2026-09-28')); // Monday 00:00 starts the next week
  await ok('2026-10-05T00:00:00+08:00', '2026-10-05');
  await assertFails(step('2026-10-06T09:00:00+08:00', '2026-10-06')); // not a Monday
  await assertFails(step('2026-12-31T09:00:00+08:00', '2026-12-21')); // a Monday, but the wrong week
  await ok('2026-12-31T09:00:00+08:00', '2026-12-28');
  await ok('2027-01-03T09:00:00+08:00', '2026-12-28'); // week spans the new year
  await ok('2027-01-04T09:00:00+08:00', '2027-01-04');
  await assertFails(step('2027-02-30T09:00:00+08:00', '2027-02-22')); // impossible date
  await ok('2028-02-29T09:00:00+08:00', '2028-02-28'); // leap day
  await ok('2028-03-01T09:00:00+08:00', '2028-02-28'); // week spans the month
  await assertFails(step('2028-03-02T09:00:00+08:00', '2028-2-28')); // malformed week ID
  assert.equal((await rawData('demo/current')).clockVersion, version);
});

test('02B: reset opens a fresh s{N} session; old-session data is closed and the new session starts from zero', async () => {
  await seedAdmins();
  await seedTeam(['YOI-M01', 'YOI-M02']);
  await seedDaily(dailyDoc({ rawSteps: 6000, effectiveSteps: 6000, claimed: 3, eventSeq: 4 }));
  await env.withSecurityRulesDisabled((context) => setDoc(eventRef(context.firestore(), 1), eventValue({ scenarioNow: NOW, activityWeekId: WEEK }, TEAM_ID, 1, 'join', 'YOI-M02', 'YOI-M02')));
  const newSession = `s${CLOCK_VERSION + 1}`;
  // Same calendar day as the old session, so only the session check can refuse old-session access below.
  const reset = { sessionId: newSession, clockVersion: CLOCK_VERSION + 1, scenarioNow: `${DAY}T13:00:00+08:00`, activityWeekId: '2026-09-28' };
  await assertFails(clockChange('uid-admin', { ...reset, sessionId: 'yoi-replay' }));
  await assertFails(clockChange('uid-admin', { ...reset, sessionId: `s${CLOCK_VERSION + 2}` }));
  await assertFails(clockChange('uid-admin', reset, (w) => { w.log.kind = 'advance'; }));
  await assertFails(clockChange('uid-m01', reset));
  await assertSucceeds(clockChange('uid-admin', reset));
  assert.equal((await rawData(`demoClockLog/${CLOCK_VERSION + 1}`)).kind, 'reset');

  const m01 = memberDb('uid-m01');
  await assertFails(getDoc(dailyRef(m01, SESSION, 'YOI-M01', DAY)));
  await assertFails(dailyWrite('steps', 7000));
  await assertFails(getDoc(teamRef(m01)));
  await assertFails(getDoc(membershipRef(m01)));
  await assertFails(getDoc(eventRef(memberDb('uid-m02'), 1)));

  // Same member, same day, new session: the points claimed in the old session can be claimed again (P16).
  const newDaily = dailyRef(m01, newSession, 'YOI-M01', DAY);
  await assertSucceeds(setDoc(newDaily, dailyDoc({ sessionId: newSession, clockVersion: CLOCK_VERSION + 1 })));
  await assertSucceeds(dailyWrite('steps', 2000, { session: newSession }));
  await assertSucceeds(dailyWrite('claim', 1, { session: newSession }));
  const m02 = memberDb('uid-m02');
  const newTeam = writeBatch(m02);
  newTeam.set(doc(m02, `teams/${newSession}/items/${TEAM_ID}`), teamValue(['YOI-M02'], { sessionId: newSession, clockVersion: CLOCK_VERSION + 1, createdAt: reset.scenarioNow }));
  newTeam.set(doc(m02, `teamMembership/${newSession}/members/YOI-M02`), activeIndex('YOI-M02', 0, { sessionId: newSession, clockVersion: CLOCK_VERSION + 1, joinedAt: reset.scenarioNow }));
  await assertSucceeds(newTeam.commit());

  // A reset may start earlier than the current time, because it opens a new session version.
  await assertSucceeds(clockChange('uid-admin', { sessionId: `s${CLOCK_VERSION + 2}`, clockVersion: CLOCK_VERSION + 2, scenarioNow: '2026-09-28T09:00:00+08:00', activityWeekId: '2026-09-28' }));

  // Session IDs can never repeat: not the old Console ID, and not an s{N} whose audit version already exists.
  await assertFails(clockChange('uid-admin', { sessionId: SESSION, clockVersion: CLOCK_VERSION + 3, scenarioNow: '2026-09-30T09:00:00+08:00', activityWeekId: '2026-09-28' }));
  await env.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), `demoClockLog/${CLOCK_VERSION + 3}`), { kind: 'reset' }));
  await assertFails(clockChange('uid-admin', { sessionId: `s${CLOCK_VERSION + 3}`, clockVersion: CLOCK_VERSION + 3, scenarioNow: '2026-09-30T09:00:00+08:00', activityWeekId: '2026-09-28' }));
});

// Writes a join without reading the team first, so the Rules decide on the write itself rather than on a denied read.
const directJoin = async (uid, memberId, id = TEAM_ID) => {
  const t = await rawTeam(id);
  const db = memberDb(uid);
  const revision = t.revision + 1;
  const batch = writeBatch(db);
  batch.set(teamRef(db, id), { ...t, memberIds: [...t.memberIds, memberId], status: 'active', everFormed: true,
    nextJoinOrder: t.nextJoinOrder + 1, revision });
  batch.set(membershipRef(db, memberId), activeIndex(memberId, t.nextJoinOrder, { teamId: id }));
  batch.set(eventRef(db, revision, id), eventValue({ scenarioNow: NOW, activityWeekId: WEEK }, id, revision, 'join', memberId, memberId));
  return batch.commit();
};

test('team: an archived team rejects a direct join write, while the same write joins a recruiting team', async () => {
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(leaveOp('uid-m01', 'YOI-M01')); // cancel recruiting -> archived
  await assertFails(directJoin('uid-m02', 'YOI-M02'));
  const archived = await rawTeam();
  assert.equal(archived.status, 'archived');
  assert.deepEqual(archived.memberIds, []);
  await seedTeam(['YOI-M03'], {}, OTHER_TEAM_ID);
  await assertSucceeds(directJoin('uid-m02', 'YOI-M02', OTHER_TEAM_ID)); // control: the write technique itself is valid

  // A reachable archived team has an empty roster, which the roster-slice check also rejects. Seed an
  // (unreachable) archived team with a non-empty roster so the status check alone decides the outcome.
  const ARCHIVED_ID = 'E1B2C3D4E5F60718';
  await seedTeam(['YOI-M06'], { status: 'archived', everFormed: true }, ARCHIVED_ID);
  await assertFails(directJoin('uid-m05', 'YOI-M05', ARCHIVED_ID));
  assert.deepEqual((await rawTeam(ARCHIVED_ID)).memberIds, ['YOI-M06']);
});

test('P11: a member already in a team or holding an open recruiting team cannot join another team', async () => {
  await seedTeam(['YOI-M01', 'YOI-M02']);
  await seedTeam(['YOI-M03'], {}, OTHER_TEAM_ID);
  await assertFails(joinOp('uid-m02', 'YOI-M02', OTHER_TEAM_ID));
  await assertFails(directJoin('uid-m02', 'YOI-M02', OTHER_TEAM_ID));
  await assertSucceeds(createTeamOp('uid-m05', 'YOI-M05', 'C1B2C3D4E5F60718'));
  await assertFails(joinOp('uid-m05', 'YOI-M05', OTHER_TEAM_ID));
  await assertFails(directJoin('uid-m05', 'YOI-M05', OTHER_TEAM_ID));
  assert.deepEqual((await rawTeam(OTHER_TEAM_ID)).memberIds, ['YOI-M03']);
  await assertSucceeds(leaveOp('uid-m05', 'YOI-M05')); // cancel the recruiting team first
  await assertSucceeds(joinOp('uid-m05', 'YOI-M05', OTHER_TEAM_ID));
});

test('03B: a week-locked member stays locked when activityWeekId is missing; unlocked members are unaffected', async () => {
  await seedTeam(['YOI-M01', 'YOI-M02', 'YOI-M03']);
  await assertSucceeds(leaveOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(createTeamOp('uid-m05', 'YOI-M05', OTHER_TEAM_ID));
  await assertSucceeds(leaveOp('uid-m05', 'YOI-M05')); // cancelled recruiting: no week lock
  await setDemo({ activityWeekId: undefined });
  await assertFails(joinOp('uid-m01', 'YOI-M01'));
  await assertFails(createTeamOp('uid-m01', 'YOI-M01', 'C1B2C3D4E5F60718'));
  await assertSucceeds(createTeamOp('uid-m05', 'YOI-M05', 'D1B2C3D4E5F60718'));
  await assertSucceeds(joinOp('uid-m06', 'YOI-M06', 'D1B2C3D4E5F60718'));
});

test('03B: a tombstone cannot be rewritten, and leaving cannot be batched with creating or joining', async () => {
  await seedTeam(['YOI-M01', 'YOI-M02', 'YOI-M03']);
  await seedTeam(['YOI-M05'], {}, OTHER_TEAM_ID);
  const db = memberDb();
  const NEW_ID = 'C1B2C3D4E5F60718';
  const leaveAndMove = (second, indexMode) => runTransaction(db, async (tx) => {
    const t = (await tx.get(teamRef(db))).data();
    const m = (await tx.get(membershipRef(db))).data();
    const o = (await tx.get(teamRef(db, OTHER_TEAM_ID))).data();
    const clock = { scenarioNow: NOW, activityWeekId: WEEK };
    tx.set(teamRef(db), { ...t, memberIds: ['YOI-M02', 'YOI-M03'], leaderMemberId: 'YOI-M02', revision: 1 });
    tx.set(eventRef(db, 1), eventValue(clock, TEAM_ID, 1, 'leave', 'YOI-M01', 'YOI-M01'));
    if (second === 'create') {
      tx.set(teamRef(db, NEW_ID), teamValue(['YOI-M01'], { teamId: NEW_ID, inviteCode: NEW_ID }));
    } else {
      tx.set(teamRef(db, OTHER_TEAM_ID), { ...o, memberIds: [...o.memberIds, 'YOI-M01'], status: 'active', everFormed: true,
        nextJoinOrder: o.nextJoinOrder + 1, revision: o.revision + 1 });
      tx.set(eventRef(db, o.revision + 1, OTHER_TEAM_ID), eventValue(clock, OTHER_TEAM_ID, o.revision + 1, 'join', 'YOI-M01', 'YOI-M01'));
    }
    const target = second === 'create' ? NEW_ID : OTHER_TEAM_ID;
    tx.set(membershipRef(db), indexMode === 'left'
      ? { ...m, teamId: null, status: 'left', leftTeamId: TEAM_ID, leftWeekId: WEEK, leftAt: NOW }
      : activeIndex('YOI-M01', second === 'create' ? 0 : o.nextJoinOrder, { teamId: target }));
  });
  for (const second of ['create', 'join']) {
    for (const indexMode of ['left', 'active']) await assertFails(leaveAndMove(second, indexMode));
  }
  assert.equal((await rawTeam()).revision, 0);

  await assertSucceeds(leaveOp('uid-m01', 'YOI-M01'));
  await assertFails(updateDoc(membershipRef(db), { leftWeekId: null }));
  await assertFails(updateDoc(membershipRef(db), { leftWeekId: '2026-09-21', clockVersion: CLOCK_VERSION }));
  assert.equal((await rawMembership('YOI-M01')).leftWeekId, WEEK);
  await assertFails(joinOp('uid-m01', 'YOI-M01', OTHER_TEAM_ID));
});

test('03B: read matrix — former members read only unarchived teams, events stay team-private, other sessions are closed', async () => {
  await seedTeam(['YOI-M01', 'YOI-M02']);
  await seedTeam(['YOI-M03', 'YOI-M05'], {}, OTHER_TEAM_ID);
  await assertSucceeds(transferOp('uid-m01', 'YOI-M01', 'YOI-M02'));
  await assertFails(getDoc(eventRef(memberDb('uid-m03'), 1))); // current member of a different team
  await assertSucceeds(leaveOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(getDoc(teamRef(memberDb()))); // former member, team paused (unarchived)
  await assertSucceeds(leaveOp('uid-m02', 'YOI-M02'));
  await assertFails(getDoc(teamRef(memberDb()))); // archived

  const other = 'other-session-2';
  await env.withSecurityRulesDisabled(async (context) => {
    const raw = context.firestore();
    await setDoc(doc(raw, `teams/${other}/items/${OTHER_TEAM_ID}`), teamValue(['YOI-M03'], { sessionId: other, teamId: OTHER_TEAM_ID, inviteCode: OTHER_TEAM_ID }));
    await setDoc(doc(raw, `teamMembership/${other}/members/YOI-M03`), activeIndex('YOI-M03', 0, { sessionId: other, teamId: OTHER_TEAM_ID }));
  });
  // A complete, otherwise-valid create (team + own index) by a member with no index there: only the session check can deny it.
  const m06 = memberDb('uid-m06');
  const otherCreate = writeBatch(m06);
  otherCreate.set(doc(m06, `teams/${other}/items/C1B2C3D4E5F60718`), teamValue(['YOI-M06'], { sessionId: other, teamId: 'C1B2C3D4E5F60718', inviteCode: 'C1B2C3D4E5F60718' }));
  otherCreate.set(doc(m06, `teamMembership/${other}/members/YOI-M06`), activeIndex('YOI-M06', 0, { sessionId: other, teamId: 'C1B2C3D4E5F60718' }));
  await assertFails(otherCreate.commit());
  const m03 = memberDb('uid-m03');
  await assertFails(getDoc(doc(m03, `teams/${other}/items/${OTHER_TEAM_ID}`)));
  await assertFails(getDoc(doc(m03, `teamMembership/${other}/members/YOI-M03`)));
  await assertFails(getDoc(doc(m03, `teams/${other}/items/${OTHER_TEAM_ID}/events/1`)));
  await assertFails(getDoc(doc(m03, `dailySteps/${other}/members/YOI-M03/days/${DAY}`)));
});

test('03B: next Monday also unlocks creating a new team', async () => {
  await seedTeam(['YOI-M01', 'YOI-M02']);
  await assertSucceeds(leaveOp('uid-m01', 'YOI-M01'));
  await assertFails(createTeamOp('uid-m01', 'YOI-M01', OTHER_TEAM_ID));
  await setDemo({ clockVersion: CLOCK_VERSION + 1, scenarioNow: '2026-10-05T09:00:00+08:00', activityWeekId: '2026-10-05' });
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01', OTHER_TEAM_ID));
});

// ===== FSD-03C-1: team contribution ledger =====
const contribRef = (db, entryId, teamId = TEAM_ID, sessionId = SESSION) => doc(db, `teamContrib/${sessionId}/teams/${teamId}/entries/${entryId}`);
const weekOfDay = (day) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
// Builds an entry from the stored event exactly as src/team/contrib-service.ts does; `tweak` corrupts it.
const contribWrite = async (uid, member, seq, { day = DAY, teamId = TEAM_ID, joinRevision = 0, tweak } = {}) => {
  const e = await rawData(`dailySteps/${SESSION}/members/${member}/days/${day}/events/${seq}`);
  const v = { sessionId: SESSION, teamId, weekId: weekOfDay(day), memberId: member, taskDate: day, seq, kind: e.kind,
    eligibleRawDelta: e.kind === 'steps' ? e.rawDelta : 0, occurredAt: e.occurredAt, syncedAt: e.syncedAt, joinRevision, recordedAt: serverTimestamp() };
  const w = { v, entryId: `${member}_${day}_${seq}` };
  tweak?.(w);
  return setDoc(contribRef(memberDb(uid), w.entryId, teamId), w.v);
};
const seedDays = async (members, day = DAY) => { for (const m of members) await seedDaily(dailyDoc({ memberId: m, taskDate: day }), day); };
const step = (uid, member, value, day = DAY) => dailyWrite('steps', value, { uid, member, day });
const at = (hhmmss, clockVersion = CLOCK_VERSION, day = DAY) => setDemo({ scenarioNow: `${day}T${hhmmss}+08:00`, clockVersion });

test('03C-1 contribution: only steps after formation and after the member joined count, tie broken by server time (B1)', async () => {
  await seedDays(['YOI-M01', 'YOI-M02', 'YOI-M03']);
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(step('uid-m01', 'YOI-M01', 1000));          // M01 seq 1: before formation, same scenario time
  await assertFails(contribWrite('uid-m01', 'YOI-M01', 1));          // recruiting: no events/1 yet
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));                // formation = events/1
  await assertFails(contribWrite('uid-m01', 'YOI-M01', 1));          // same scenario time, synced before formation
  await assertFails(contribWrite('uid-m01', 'YOI-M01', 1, { tweak: (w) => { w.v.syncedAt = new Date(Date.now() + 3600_000); } })); // forged later server time
  await assertSucceeds(step('uid-m01', 'YOI-M01', 1500));          // M01 seq 2: after formation
  await assertSucceeds(contribWrite('uid-m01', 'YOI-M01', 2));       // founder: joinRevision 0
  await assertFails(contribWrite('uid-m01', 'YOI-M01', 2));          // duplicate entry ID (create-only)
  await assertSucceeds(step('uid-m02', 'YOI-M02', 800));           // M02 seq 1 after its join
  await assertFails(contribWrite('uid-m02', 'YOI-M02', 1));          // non-founder posing as founder (joinRevision 0)
  await assertSucceeds(contribWrite('uid-m02', 'YOI-M02', 1, { joinRevision: 1 }));
  // M03 syncs, then joins in the same scenario time: its earlier steps must not count.
  await assertSucceeds(step('uid-m03', 'YOI-M03', 700));
  await assertSucceeds(joinOp('uid-m03', 'YOI-M03'));                // revision 2
  await assertFails(contribWrite('uid-m03', 'YOI-M03', 1, { joinRevision: 2 }));
  await assertSucceeds(step('uid-m03', 'YOI-M03', 900));
  await assertFails(contribWrite('uid-m03', 'YOI-M03', 2, { joinRevision: 1 })); // another member's join event
  await assertSucceeds(contribWrite('uid-m03', 'YOI-M03', 2, { joinRevision: 2 }));
  const stored = await rawData(`teamContrib/${SESSION}/teams/${TEAM_ID}/entries/YOI-M01_${DAY}_2`);
  assert.deepEqual([stored.eligibleRawDelta, stored.kind, stored.weekId], [500, 'steps', WEEK]);
  await assertFails(updateDoc(contribRef(memberDb('uid-m01'), `YOI-M01_${DAY}_2`), { eligibleRawDelta: 9999 }));
  await assertFails(deleteDoc(contribRef(memberDb('uid-m01'), `YOI-M01_${DAY}_2`)));
});

test('03C-1 contribution: a founder impersonation by a member who joined at the creation time is refused', async () => {
  await seedDays(['YOI-M01', 'YOI-M02']);
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02')); // joinedAt == createdAt (same scenario time)
  await assertSucceeds(step('uid-m02', 'YOI-M02', 1000));
  await assertFails(contribWrite('uid-m02', 'YOI-M02', 1, { joinRevision: 0 }));
  await assertSucceeds(contribWrite('uid-m02', 'YOI-M02', 1, { joinRevision: 1 }));
  await at('13:00:00');
  await assertSucceeds(step('uid-m02', 'YOI-M02', 1500));           // later than the join: still not a founder
  await assertFails(contribWrite('uid-m02', 'YOI-M02', 2, { joinRevision: 0 }));
  await assertSucceeds(contribWrite('uid-m02', 'YOI-M02', 2, { joinRevision: 1 }));
});

test('03C-1 contribution: entry fields must match the event; claims, other members, weeks and IDs are refused', async () => {
  await seedDays(['YOI-M01', 'YOI-M02']);
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));
  await assertSucceeds(step('uid-m01', 'YOI-M01', 6000));
  const bad = [
    (w) => { w.v.eligibleRawDelta = 6001; }, (w) => { w.v.kind = 'ride'; }, (w) => { w.v.occurredAt = `${DAY}T11:00:00+08:00`; },
    (w) => { w.v.syncedAt = new Date('2020-01-01T00:00:00Z'); }, (w) => { w.v.occurredAt = `${DAY}T13:00:00+08:00`; },
    (w) => { w.v.kind = 'ride'; w.v.eligibleRawDelta = 0; }, (w) => { w.v.weekId = '2026-09-21'; }, (w) => { w.entryId = `YOI-M01_${DAY}_01`; },
    (w) => { w.v.seq = '1'; }, (w) => { w.v.extra = 1; }, (w) => { delete w.v.joinRevision; }, (w) => { w.v.recordedAt = new Date(); },
    (w) => { w.v.memberId = 'YOI-M02'; }, (w) => { w.v.joinRevision = -1; }, (w) => { w.v.taskDate = '2026-9-30'; },
  ];
  for (const tweak of bad) await assertFails(contribWrite('uid-m01', 'YOI-M01', 1, { tweak }));
  // Writing an entry for a teammate's event is refused even with every field copied.
  await assertSucceeds(step('uid-m02', 'YOI-M02', 500));
  await assertFails(contribWrite('uid-m01', 'YOI-M02', 1, { joinRevision: 1 }));
  // A claim event never becomes an entry.
  await assertSucceeds(dailyWrite('claim', 3));                      // M01 seq 2 = claim
  await assertFails(contribWrite('uid-m01', 'YOI-M01', 2));
  await assertSucceeds(contribWrite('uid-m01', 'YOI-M01', 1));
});

test('03C-1 contribution: a paused team refuses new steps but accepts fragments from before the pause (B3)', async () => {
  await seedDays(['YOI-M01', 'YOI-M02', 'YOI-M03']);
  await seedDays(['YOI-M01'], YESTERDAY);
  await at('10:00:00', CLOCK_VERSION, YESTERDAY);                     // the team forms yesterday
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));
  await at('13:00:00');                                                // today
  await assertSucceeds(step('uid-m01', 'YOI-M01', 1000));           // seq 1, before the pause
  await at('14:00:00');
  await assertSucceeds(leaveOp('uid-m02', 'YOI-M02'));               // paused (latest event = this leave)
  await assertSucceeds(step('uid-m01', 'YOI-M01', 2000));           // seq 2, during the pause
  await assertFails(contribWrite('uid-m01', 'YOI-M01', 2));
  await assertSucceeds(contribWrite('uid-m01', 'YOI-M01', 1));      // pre-pause fragment credited late
  // Yesterday's catch-up (23:59:59) is before today's pause: the remaining member may credit it (B3).
  await assertSucceeds(step('uid-m01', 'YOI-M01', 300, YESTERDAY));
  await assertSucceeds(contribWrite('uid-m01', 'YOI-M01', 1, { day: YESTERDAY }));
  // Resume: the Rules' approximation now accepts the paused-period fragment (accepted risk 2, ruling N1).
  await at('15:00:00');
  await assertSucceeds(joinOp('uid-m03', 'YOI-M03'));
  await assertSucceeds(contribWrite('uid-m01', 'YOI-M01', 2));
});

test('03C-1 contribution: a departed member credits only fragments from before leaving', async () => {
  await seedDays(['YOI-M01', 'YOI-M02', 'YOI-M03']);
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));
  await assertSucceeds(joinOp('uid-m03', 'YOI-M03'));
  await at('13:00:00');
  await assertSucceeds(step('uid-m02', 'YOI-M02', 1000));           // seq 1 in the team
  await at('14:00:00');
  await assertSucceeds(leaveOp('uid-m02', 'YOI-M02'));
  await assertSucceeds(step('uid-m02', 'YOI-M02', 2000));           // seq 2 after leaving
  await assertFails(contribWrite('uid-m02', 'YOI-M02', 2, { joinRevision: 1 }));
  await assertSucceeds(contribWrite('uid-m02', 'YOI-M02', 1, { joinRevision: 1 }));
  // Its client cannot read team events and sends 0: a strict scenario-time bound applies.
  await at('15:00:00');
  await assertSucceeds(dailyWrite('steps', 3000, { uid: 'uid-m02', member: 'YOI-M02', day: DAY }));
  await assertFails(contribWrite('uid-m02', 'YOI-M02', 3));          // after leftAt
});

test('03C-1 contribution: a departed member sending joinRevision 0 is bounded by a strict joinedAt', async () => {
  await seedDays(['YOI-M01', 'YOI-M02', 'YOI-M03']);
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));
  await at('13:00:00');
  await assertSucceeds(joinOp('uid-m03', 'YOI-M03'));                // M03 joinedAt 13:00
  await assertSucceeds(step('uid-m03', 'YOI-M03', 400));             // seq 1 at 13:00 (tie with joinedAt)
  await at('14:00:00');
  await assertSucceeds(step('uid-m03', 'YOI-M03', 900));             // seq 2 at 14:00
  await at('15:00:00');
  await assertSucceeds(leaveOp('uid-m03', 'YOI-M03'));
  await assertFails(contribWrite('uid-m03', 'YOI-M03', 1));          // tie on joinedAt: conservative refusal
  await assertSucceeds(contribWrite('uid-m03', 'YOI-M03', 2));
});

test('03C-1 contribution: rides need no start bound but are refused while paused or after leaving (ruling b1)', async () => {
  await seedDays(['YOI-M01', 'YOI-M02', 'YOI-M03']);
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(dailyWrite('ride', null, { uid: 'uid-m01', member: 'YOI-M01' })); // seq 1, before formation
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));
  await assertFails(contribWrite('uid-m01', 'YOI-M01', 1, { joinRevision: 1 }));
  await assertSucceeds(contribWrite('uid-m01', 'YOI-M01', 1));
  await at('13:00:00');
  await assertSucceeds(leaveOp('uid-m01', 'YOI-M01'));               // M02 alone: paused
  await at('14:00:00');
  await assertSucceeds(dailyWrite('ride', null, { uid: 'uid-m02', member: 'YOI-M02' })); // ride during the pause
  await assertFails(contribWrite('uid-m02', 'YOI-M02', 1));
});

test('03C-1 contribution: same-request join and sync share request.time and are refused (conservative)', async () => {
  await seedDays(['YOI-M01', 'YOI-M02']);
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  const t = await rawTeam();
  const db = memberDb('uid-m02');
  const batch = writeBatch(db);
  batch.set(teamRef(db), { ...t, memberIds: [...t.memberIds, 'YOI-M02'], status: 'active', everFormed: true, nextJoinOrder: t.nextJoinOrder + 1, revision: 1 });
  batch.set(membershipRef(db, 'YOI-M02'), activeIndex('YOI-M02', t.nextJoinOrder));
  batch.set(eventRef(db, 1), eventValue({ scenarioNow: NOW, activityWeekId: WEEK }, TEAM_ID, 1, 'join', 'YOI-M02', 'YOI-M02'));
  batch.set(dailyRef(db, SESSION, 'YOI-M02'), dailyDoc({ memberId: 'YOI-M02', rawSteps: 600, effectiveSteps: 600, eventSeq: 1 }));
  batch.set(dailyEventRef(db, 1, DAY, 'YOI-M02'), eventDoc({ memberId: 'YOI-M02', seq: 1, kind: 'steps', rawDelta: 600 }));
  await assertSucceeds(batch.commit());
  await assertFails(contribWrite('uid-m02', 'YOI-M02', 1, { joinRevision: 1 }));
});

test('03C-1 contribution: entries close with the D+1 window, and a Sunday fragment belongs to the previous week (P13)', async () => {
  await setDemo({ scenarioNow: '2026-10-04T09:00:00+08:00', activityWeekId: '2026-09-28' }); // Sunday
  const SUN = '2026-10-04';
  await seedDays(['YOI-M01', 'YOI-M02'], SUN);
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));
  await setDemo({ scenarioNow: '2026-10-04T10:00:00+08:00', activityWeekId: '2026-09-28' });
  await assertSucceeds(step('uid-m01', 'YOI-M01', 1000, SUN));
  // Monday: the Sunday fragment is credited to the previous week.
  await setDemo({ scenarioNow: '2026-10-05T09:00:00+08:00', activityWeekId: '2026-10-05', clockVersion: CLOCK_VERSION + 1 });
  await assertFails(contribWrite('uid-m01', 'YOI-M01', 1, { day: SUN, tweak: (w) => { w.v.weekId = '2026-10-05'; } }));
  await assertSucceeds(contribWrite('uid-m01', 'YOI-M01', 1, { day: SUN }));
  assert.equal((await rawData(`teamContrib/${SESSION}/teams/${TEAM_ID}/entries/YOI-M01_${SUN}_1`)).weekId, '2026-09-28');
  // Tuesday: Sunday is outside the window.
  await setDemo({ scenarioNow: '2026-10-06T09:00:00+08:00', activityWeekId: '2026-10-05', clockVersion: CLOCK_VERSION + 2 });
  await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), `dailySteps/${SESSION}/members/YOI-M02/days/${SUN}/events/9`),
    eventDoc({ memberId: 'YOI-M02', taskDate: SUN, seq: 9, kind: 'steps', rawDelta: 10, occurredAt: '2026-10-04T10:00:00+08:00' })));
  await assertFails(contribWrite('uid-m02', 'YOI-M02', 9, { day: SUN, joinRevision: 1 }));
});

test('03C-1 contribution reads: teammates read and list (including former members\' entries); others cannot', async () => {
  await seedDays(['YOI-M01', 'YOI-M02', 'YOI-M03']);
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));
  await assertSucceeds(joinOp('uid-m03', 'YOI-M03'));
  await at('13:00:00');
  await assertSucceeds(step('uid-m02', 'YOI-M02', 1000));
  await assertSucceeds(contribWrite('uid-m02', 'YOI-M02', 1, { joinRevision: 1 }));
  await at('14:00:00');
  await assertSucceeds(leaveOp('uid-m02', 'YOI-M02'));
  const id = `YOI-M02_${DAY}_1`;
  const entries = (db) => getDocs(query(collection(db, `teamContrib/${SESSION}/teams/${TEAM_ID}/entries`), where('weekId', 'in', [WEEK, '2026-09-21'])));
  assert.equal((await assertSucceeds(entries(memberDb('uid-m01')))).size, 1); // a current member sees the former member's entry
  await assertSucceeds(getDoc(contribRef(memberDb('uid-m03'), id)));
  await assertFails(entries(memberDb('uid-m02')));                           // the former member cannot list
  await assertFails(getDoc(contribRef(memberDb('uid-m02'), `YOI-M01_${DAY}_1`))); // nor read a teammate's entry
  await assertSucceeds(getDoc(contribRef(memberDb('uid-m02'), id)));          // but may check its own entry
  await assertSucceeds(getDoc(contribRef(memberDb('uid-m02'), `YOI-M02_${DAY}_7`))); // even a missing one
  await assertFails(entries(memberDb('uid-m05')));                           // not a member
  await assertFails(getDoc(contribRef(memberDb('uid-m05'), id)));
  await assertFails(getDoc(contribRef(env.unauthenticatedContext().firestore(), id)));
  await assertFails(getDoc(contribRef(memberDb('uid-m01'), id, TEAM_ID, 'other-session')));
  await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'membersByUid/uid-m01'), { memberId: 'YOI-M01', role: 'member', active: false }));
  await assertFails(entries(memberDb('uid-m01')));                           // inactive account
});

test('03C-1 contribution: an entry cannot be written into another team, even one created at the same scenario time', async () => {
  await seedDays(['YOI-M01', 'YOI-M02', 'YOI-M03', 'YOI-M05']);
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));                   // team X (founder M01)
  await assertSucceeds(createTeamOp('uid-m03', 'YOI-M03', OTHER_TEAM_ID));    // team Y, same createdAt
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));
  await assertSucceeds(joinOp('uid-m05', 'YOI-M05', OTHER_TEAM_ID));
  await at('13:00:00');
  await assertSucceeds(step('uid-m01', 'YOI-M01', 2000));
  // M01's joinedAt equals Y's createdAt and its joinOrder is 0: only the teamId check stops this.
  await assertFails(contribWrite('uid-m01', 'YOI-M01', 1, { teamId: OTHER_TEAM_ID }));
  await assertSucceeds(contribWrite('uid-m01', 'YOI-M01', 1));
  // A member of another team can neither list nor read this team's entries.
  const entries = (db, teamId) => getDocs(query(collection(db, `teamContrib/${SESSION}/teams/${teamId}/entries`), where('weekId', 'in', [WEEK])));
  await assertFails(entries(memberDb('uid-m05'), TEAM_ID));
  await assertFails(getDoc(contribRef(memberDb('uid-m05'), `YOI-M01_${DAY}_1`)));
  await assertSucceeds(entries(memberDb('uid-m05'), OTHER_TEAM_ID));
});

test('03C-1 contribution: an entry pointing at a missing event is refused', async () => {
  await seedDays(['YOI-M01', 'YOI-M02']);
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));
  await at('13:00:00');
  const v = { sessionId: SESSION, teamId: TEAM_ID, weekId: WEEK, memberId: 'YOI-M01', taskDate: DAY, seq: 1, kind: 'steps',
    eligibleRawDelta: 100, occurredAt: `${DAY}T13:00:00+08:00`, syncedAt: new Date(), joinRevision: 0, recordedAt: serverTimestamp() };
  await assertFails(setDoc(contribRef(memberDb('uid-m01'), `YOI-M01_${DAY}_1`), v));
});

test('03C-1 contribution: joinRevision must point at the current join of the member, not a captain transfer or an earlier join', async () => {
  await seedDays(['YOI-M01', 'YOI-M02']);
  await at('10:00:00');
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));                  // rev 1, joinedAt 10:00
  await assertSucceeds(transferOp('uid-m01', 'YOI-M01', 'YOI-M02'));   // rev 2, also 10:00 and targeting M02
  await at('11:00:00');
  await assertSucceeds(step('uid-m02', 'YOI-M02', 500));
  await assertFails(contribWrite('uid-m02', 'YOI-M02', 1, { joinRevision: 2 }));
  await assertSucceeds(contribWrite('uid-m02', 'YOI-M02', 1, { joinRevision: 1 }));
});

test('03C-1 contribution: after rejoining the same team next week, an earlier join cannot backfill the gap', async () => {
  const SUN = '2026-10-04', MON = '2026-10-05';
  await setDemo({ scenarioNow: `${SUN}T09:00:00+08:00`, activityWeekId: '2026-09-28' });
  await seedDays(['YOI-M02'], SUN);
  await seedDays(['YOI-M02'], MON);
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));                  // rev 1
  await assertSucceeds(joinOp('uid-m03', 'YOI-M03'));                  // rev 2
  await setDemo({ scenarioNow: `${SUN}T10:00:00+08:00`, activityWeekId: '2026-09-28' });
  await assertSucceeds(leaveOp('uid-m02', 'YOI-M02'));                 // rev 3, week locked
  await setDemo({ scenarioNow: `${SUN}T11:00:00+08:00`, activityWeekId: '2026-09-28' });
  await assertSucceeds(step('uid-m02', 'YOI-M02', 700, SUN));         // outside the team
  await setDemo({ scenarioNow: `${MON}T09:00:00+08:00`, activityWeekId: '2026-10-05', clockVersion: CLOCK_VERSION + 1 });
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));                  // rev 4, joinedAt Monday 09:00
  await assertFails(contribWrite('uid-m02', 'YOI-M02', 1, { day: SUN, joinRevision: 1 }));
  await assertFails(contribWrite('uid-m02', 'YOI-M02', 1, { day: SUN, joinRevision: 4 }));
});

test('03C-1 contribution: a departed member cannot write into a team it never left', async () => {
  await seedDays(['YOI-M01', 'YOI-M02', 'YOI-M03', 'YOI-M05']);
  await at('09:00:00');
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));
  await assertSucceeds(createTeamOp('uid-m03', 'YOI-M03', OTHER_TEAM_ID));
  await assertSucceeds(joinOp('uid-m05', 'YOI-M05', OTHER_TEAM_ID));   // the other team is formed too
  await assertSucceeds(joinOp('uid-m06', 'YOI-M06'));
  await at('10:00:00');
  await assertSucceeds(step('uid-m02', 'YOI-M02', 800));
  await at('11:00:00');
  await assertSucceeds(leaveOp('uid-m02', 'YOI-M02'));
  await assertFails(contribWrite('uid-m02', 'YOI-M02', 1, { teamId: OTHER_TEAM_ID }));
  await assertSucceeds(contribWrite('uid-m02', 'YOI-M02', 1));
});

test('03C-1 contribution: a ride while recruiting is refused after the recruiting is cancelled', async () => {
  await seedDays(['YOI-M01']);
  await at('09:00:00');
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await at('10:00:00');
  await assertSucceeds(dailyWrite('ride', null, { uid: 'uid-m01', member: 'YOI-M01' }));
  await at('11:00:00');
  await assertSucceeds(leaveOp('uid-m01', 'YOI-M01'));                 // cancelRecruiting: archived, never formed
  await assertFails(contribWrite('uid-m01', 'YOI-M01', 1));
});

// ----- Shared scenario table (tests/fixtures/contrib-scenarios.json; the client side runs in contrib-state.test.mjs) -----
const CONTRIB_SCENARIOS = JSON.parse(readFileSync(new URL('./fixtures/contrib-scenarios.json', import.meta.url), 'utf8')).scenarios;
for (const scenario of CONTRIB_SCENARIOS) {
  test(`03C-1 shared scenario (Emulator): ${scenario.name}`, async () => {
    const dayOf = (d) => (d === 'Y' ? YESTERDAY : DAY);
    const id = (m) => `YOI-${m}`;
    const uid = (m) => `uid-${m.toLowerCase()}`;
    const members = [...new Set(scenario.ops.map((o) => o.member))].map(id);
    await seedDays(members, YESTERDAY);
    await seedDays(members);
    for (const o of scenario.ops) {
      const label = JSON.stringify(o);
      try {
        if (o.op === 'check') {
          const write = contribWrite(uid(o.member), id(o.member), o.seq, { day: dayOf(o.taskDay), joinRevision: o.joinRevision });
          await (o.rules ? assertSucceeds(write) : assertFails(write));
          continue;
        }
        await at(o.at, CLOCK_VERSION, dayOf(o.day));
        const who = { uid: uid(o.member), member: id(o.member) };
        if (o.op === 'create') await assertSucceeds(createTeamOp(who.uid, who.member));
        else if (o.op === 'join') await assertSucceeds(joinOp(who.uid, who.member));
        else if (o.op === 'leave') await assertSucceeds(leaveOp(who.uid, who.member));
        else if (o.op === 'steps') await assertSucceeds(dailyWrite('steps', o.value, { ...who, day: dayOf(o.taskDay ?? o.day) }));
        else if (o.op === 'ride') await assertSucceeds(dailyWrite('ride', null, { ...who, day: dayOf(o.day) }));
        else throw new Error(`unknown op ${o.op}`);
      } catch (error) { throw new Error(`${label}: ${error.message}`); }
    }
  });
}

// ===== FSD-03C-2: week results and chest awards =====
const weekRef = (db, weekId = WEEK, teamId = TEAM_ID, sessionId = SESSION) => doc(db, `teamWeeks/${sessionId}/teams/${teamId}/weeks/${weekId}`);
const awardRef = (db, member, weekId = WEEK, sessionId = SESSION) => doc(db, `chestAwards/${sessionId}/weeks/${weekId}/awards/${member}`);
const entryPath = (entryId, teamId = TEAM_ID) => `teamContrib/${SESSION}/teams/${teamId}/entries/${entryId}`;
const weekPath = (weekId = WEEK, teamId = TEAM_ID) => `teamWeeks/${SESSION}/teams/${teamId}/weeks/${weekId}`;
// Mirror src/team/week-result-service.ts payloads; `tweak` corrupts them so the Rules alone decide.
const createWeek = async (uid, member, entryId, { weekId = WEEK, teamId = TEAM_ID, tweak } = {}) => {
  const e = await rawData(entryPath(entryId, teamId));
  const v = { sessionId: SESSION, teamId, weekId, firstReachedAt: e.occurredAt, firstReachedSyncedAt: e.syncedAt, reachedAt: e.occurredAt,
    reachedSyncedAt: e.syncedAt, reachingEntryId: entryId, revision: 0, firstRecordedAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: member };
  tweak?.(v);
  return setDoc(weekRef(memberDb(uid), weekId, teamId), v);
};
const advanceWeek = async (uid, member, entryId, { weekId = WEEK, teamId = TEAM_ID, tweak } = {}) => {
  const e = await rawData(entryPath(entryId, teamId));
  const o = await rawData(weekPath(weekId, teamId));
  const v = { ...o, reachedAt: e.occurredAt, reachedSyncedAt: e.syncedAt, reachingEntryId: entryId, revision: o.revision + 1,
    updatedAt: serverTimestamp(), updatedBy: member };
  tweak?.(v);
  return setDoc(weekRef(memberDb(uid), weekId, teamId), v);
};
const awardWrite = async (uid, writer, target, { which = 'first', joinRevision = 0, leaveRevision = 0, weekId = WEEK, teamId = TEAM_ID, tweak } = {}) => {
  const w = await rawData(weekPath(weekId, teamId));
  const first = which === 'first';
  const v = { sessionId: SESSION, weekId, memberId: target, teamId, reachedAt: first ? w.firstReachedAt : w.reachedAt,
    reachedSyncedAt: first ? w.firstReachedSyncedAt : w.reachedSyncedAt, joinRevision, leaveRevision, basis: first ? 'first' : 'reissue',
    grantedBy: writer, grantedAt: serverTimestamp() };
  tweak?.(v);
  return setDoc(awardRef(memberDb(uid), target, weekId), v);
};
// Founder M01 09:00, M02 joins 09:00 (rev1), M01 steps 10:00, M03 joins 11:00 (rev2), M02 steps 12:00,
// M02 leaves 13:00 (rev3), M03 steps 14:00, M01 steps 15:00. Entries are credited as the client does.
const reachedTeam = async () => {
  await seedDays(['YOI-M01', 'YOI-M02', 'YOI-M03', 'YOI-M05']);
  await at('09:00:00');
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));
  await at('10:00:00');
  await assertSucceeds(step('uid-m01', 'YOI-M01', 1000));
  await assertSucceeds(contribWrite('uid-m01', 'YOI-M01', 1));
  await at('11:00:00');
  await assertSucceeds(joinOp('uid-m03', 'YOI-M03'));
  await at('12:00:00');
  await assertSucceeds(step('uid-m02', 'YOI-M02', 500));
  await assertSucceeds(contribWrite('uid-m02', 'YOI-M02', 1, { joinRevision: 1 }));
  await at('13:00:00');
  await assertSucceeds(leaveOp('uid-m02', 'YOI-M02'));
  await at('14:00:00');
  await assertSucceeds(step('uid-m03', 'YOI-M03', 800));
  await assertSucceeds(contribWrite('uid-m03', 'YOI-M03', 1, { joinRevision: 2 }));
  await at('15:00:00');
  await assertSucceeds(step('uid-m01', 'YOI-M01', 1500));
  await assertSucceeds(contribWrite('uid-m01', 'YOI-M01', 2));
};
const E = { m01a: `YOI-M01_${DAY}_1`, m02: `YOI-M02_${DAY}_1`, m03: `YOI-M03_${DAY}_1`, m01b: `YOI-M01_${DAY}_2` };

test('03C-2 week result: a team member creates it from an existing entry; others and malformed records are refused', async () => {
  await reachedTeam();
  await assertFails(createWeek('uid-m05', 'YOI-M05', E.m03));                          // not a member
  await assertFails(createWeek('uid-m02', 'YOI-M02', E.m03));                          // departed
  await assertFails(createWeek('uid-m01', 'YOI-M01', E.m03, { tweak: (v) => { v.reachingEntryId = `YOI-M01_${DAY}_9`; } })); // no such entry
  const bad = [
    (v) => { v.reachedAt = `${DAY}T13:30:00+08:00`; v.firstReachedAt = v.reachedAt; },  // does not match the entry
    (v) => { v.firstReachedAt = `${DAY}T16:00:00+08:00`; },                             // M1 != Mc on create
    (v) => { v.revision = 1; }, (v) => { v.updatedBy = 'YOI-M03'; }, (v) => { v.firstRecordedAt = new Date(); }, (v) => { v.extra = 1; },
    (v) => { v.weekId = '2026-09-21'; }, (v) => { v.reachingEntryId = 'x/../y'; },
  ];
  for (const tweak of bad) await assertFails(createWeek('uid-m01', 'YOI-M01', E.m03, { tweak }));
  await assertSucceeds(createWeek('uid-m01', 'YOI-M01', E.m03));                       // M1 = Mc = 14:00
  await assertFails(createWeek('uid-m03', 'YOI-M03', E.m03));                          // exists: a re-create is an update
  await assertFails(deleteDoc(weekRef(memberDb('uid-m01'))));
});

test('03C-2 week result: Mc only moves earlier, one revision at a time, and M1 never changes', async () => {
  await reachedTeam();
  await assertSucceeds(createWeek('uid-m01', 'YOI-M01', E.m03));
  await assertFails(advanceWeek('uid-m01', 'YOI-M01', E.m01b));                        // later
  await assertFails(advanceWeek('uid-m01', 'YOI-M01', E.m03));                         // same moment
  await assertFails(advanceWeek('uid-m01', 'YOI-M01', E.m02, { tweak: (v) => { v.revision += 1; } }));
  await assertFails(advanceWeek('uid-m01', 'YOI-M01', E.m02, { tweak: (v) => { v.firstReachedAt = v.reachedAt; v.firstReachedSyncedAt = v.reachedSyncedAt; } }));
  await assertFails(advanceWeek('uid-m01', 'YOI-M01', E.m02, { tweak: (v) => { v.firstRecordedAt = new Date(); } }));
  await assertFails(advanceWeek('uid-m02', 'YOI-M02', E.m02));                         // departed
  await assertSucceeds(advanceWeek('uid-m03', 'YOI-M03', E.m02));                      // Mc = 12:00
  await assertSucceeds(advanceWeek('uid-m01', 'YOI-M01', E.m01a));                     // Mc = 10:00
  const w = await rawData(weekPath());
  assert.deepEqual([w.revision, w.firstReachedAt, w.reachedAt], [2, `${DAY}T14:00:00+08:00`, `${DAY}T10:00:00+08:00`]);
});

test('03C-2 awards: in the team at M1 or Mc (D1-B), with matching join/leave events and basis; one per member per week', async () => {
  await reachedTeam();
  await assertSucceeds(createWeek('uid-m01', 'YOI-M01', E.m03));                       // M1 = 14:00: M01, M03
  await assertSucceeds(awardWrite('uid-m01', 'YOI-M01', 'YOI-M01'));                   // founder awards itself
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M02', { joinRevision: 1, leaveRevision: 3 })); // left before M1
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M01'));                      // duplicate
  await assertSucceeds(advanceWeek('uid-m01', 'YOI-M01', E.m02));                      // Mc = 12:00: M01, M02, M03
  await assertSucceeds(advanceWeek('uid-m01', 'YOI-M01', E.m01a));                     // Mc = 10:00: M01, M02 (M03 joined 11:00)
  // M03 was on the M1 list but not written yet: it still gets the award by M1, not by Mc.
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M03', { which: 'current', joinRevision: 2 }));
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M03', { joinRevision: 1 }));                 // another member's join
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M03', { joinRevision: 0 }));                 // not the founder
  await assertSucceeds(awardWrite('uid-m03', 'YOI-M03', 'YOI-M03', { joinRevision: 2 }));
  // M02 left at 13:00, after Mc: a reissue with its leave event.
  const m02 = { which: 'current', joinRevision: 1, leaveRevision: 3 };
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M02', { ...m02, leaveRevision: 0 }));
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M02', { ...m02, leaveRevision: 1 }));       // a join, not a leave
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M02', { ...m02, tweak: (v) => { v.basis = 'first'; } }));
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M02', { ...m02, tweak: (v) => { v.reachedAt = `${DAY}T11:30:00+08:00`; } }));
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M02', { ...m02, tweak: (v) => { v.grantedBy = 'YOI-M03'; } }));
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M02', { ...m02, tweak: (v) => { v.teamId = 'a1b2c3d4e5f60718'; } }));
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M02', { ...m02, tweak: (v) => { v.extra = 1; } }));
  await assertFails(awardWrite('uid-m02', 'YOI-M02', 'YOI-M02', m02));                 // a departed member cannot write
  await assertFails(awardWrite('uid-m05', 'YOI-M05', 'YOI-M02', m02));                 // nor a non-member
  await assertSucceeds(awardWrite('uid-m01', 'YOI-M01', 'YOI-M02', m02));
  const a = await rawData(`chestAwards/${SESSION}/weeks/${WEEK}/awards/YOI-M02`);
  assert.deepEqual([a.basis, a.leaveRevision, a.reachedAt], ['reissue', 3, `${DAY}T10:00:00+08:00`]);
  await assertFails(updateDoc(awardRef(memberDb('uid-m01'), 'YOI-M02'), { basis: 'first' }));
  await assertFails(deleteDoc(awardRef(memberDb('uid-m01'), 'YOI-M02')));
});

test('03C-2 awards: a join or leave at the same scenario time as M is decided by the server time', async () => {
  await seedDays(['YOI-M01', 'YOI-M02', 'YOI-M03']);
  await at('09:00:00');
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));                                  // rev 1
  await at('14:00:00');
  await assertSucceeds(step('uid-m01', 'YOI-M01', 1000));
  await assertSucceeds(contribWrite('uid-m01', 'YOI-M01', 1));                         // M at 14:00
  await assertSucceeds(joinOp('uid-m03', 'YOI-M03'));                                  // rev 2, 14:00 but after M
  await assertSucceeds(leaveOp('uid-m02', 'YOI-M02'));                                 // rev 3, 14:00 but after M
  await assertSucceeds(createWeek('uid-m01', 'YOI-M01', E.m01a));
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M03', { joinRevision: 2 }));  // joined after M
  await assertSucceeds(awardWrite('uid-m01', 'YOI-M01', 'YOI-M02', { joinRevision: 1, leaveRevision: 3 })); // left after M
});

test('03C-2 awards: a teammate reads a missing award inside a transaction and then creates it', async () => {
  await reachedTeam();
  await assertSucceeds(createWeek('uid-m01', 'YOI-M01', E.m03));
  const w = await rawData(weekPath());
  const db = memberDb('uid-m01');
  await assertSucceeds(runTransaction(db, async (tx) => {
    const ref = awardRef(db, 'YOI-M03');
    assert.equal((await tx.get(ref)).exists(), false);
    tx.set(ref, { sessionId: SESSION, weekId: WEEK, memberId: 'YOI-M03', teamId: TEAM_ID, reachedAt: w.firstReachedAt, reachedSyncedAt: w.firstReachedSyncedAt,
      joinRevision: 2, leaveRevision: 0, basis: 'first', grantedBy: 'YOI-M01', grantedAt: serverTimestamp() });
  }));
});

test('03C-2 reads: team members read the week and list the team awards; departed members read only their own award', async () => {
  await reachedTeam();
  await assertSucceeds(createTeamOp('uid-m05', 'YOI-M05', OTHER_TEAM_ID));             // M05 is in another team
  await assertSucceeds(createWeek('uid-m01', 'YOI-M01', E.m03));
  await assertSucceeds(advanceWeek('uid-m01', 'YOI-M01', E.m02));
  await assertSucceeds(awardWrite('uid-m01', 'YOI-M01', 'YOI-M02', { which: 'current', joinRevision: 1, leaveRevision: 3 }));
  const awards = (db, teamId) => getDocs(query(collection(db, `chestAwards/${SESSION}/weeks/${WEEK}/awards`), where('teamId', '==', teamId)));
  await assertSucceeds(getDoc(weekRef(memberDb('uid-m03'))));
  await assertSucceeds(getDocs(collection(memberDb('uid-m03'), `teamWeeks/${SESSION}/teams/${TEAM_ID}/weeks`)));
  await assertFails(getDoc(weekRef(memberDb('uid-m02'))));                             // departed
  await assertFails(getDoc(weekRef(memberDb('uid-m05'))));                             // other team
  assert.equal((await assertSucceeds(awards(memberDb('uid-m01'), TEAM_ID))).size, 1);
  await assertFails(getDocs(collection(memberDb('uid-m01'), `chestAwards/${SESSION}/weeks/${WEEK}/awards`))); // unfiltered
  await assertFails(awards(memberDb('uid-m05'), TEAM_ID));
  await assertSucceeds(getDoc(awardRef(memberDb('uid-m02'), 'YOI-M02')));             // own award after leaving
  await assertSucceeds(getDoc(awardRef(memberDb('uid-m02'), 'YOI-M02', '2026-09-21'))); // own path, missing
  await assertFails(getDoc(awardRef(memberDb('uid-m02'), 'YOI-M01')));                 // departed reads a teammate's
  await assertSucceeds(getDoc(awardRef(memberDb('uid-m01'), 'YOI-M03')));             // teammate, missing (transaction read)
  await assertSucceeds(getDoc(awardRef(memberDb('uid-m05'), 'YOI-M03')));             // any current team member, missing
  await assertFails(getDoc(awardRef(memberDb('uid-m05'), 'YOI-M02')));                 // existing award of another team
  await assertFails(getDoc(awardRef(env.unauthenticatedContext().firestore(), 'YOI-M02')));
  await assertFails(getDoc(awardRef(memberDb('uid-m02'), 'YOI-M02', WEEK, 'other-session')));
  await assertFails(getDoc(weekRef(memberDb('uid-m01'), WEEK, TEAM_ID, 'other-session')));
  await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'membersByUid/uid-m01'), { memberId: 'YOI-M01', role: 'member', active: false }));
  await assertFails(getDoc(weekRef(memberDb('uid-m01'))));
});

test('03C-2 window: Monday settles the previous week until 23:59:59; Tuesday, two weeks back and a missing week ID are refused', async () => {
  const SUN = '2026-10-04';
  await setDemo({ scenarioNow: `${SUN}T09:00:00+08:00`, activityWeekId: '2026-09-28' });
  await seedDays(['YOI-M01', 'YOI-M02'], SUN);
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));
  await setDemo({ scenarioNow: `${SUN}T10:00:00+08:00`, activityWeekId: '2026-09-28' });
  await assertSucceeds(step('uid-m01', 'YOI-M01', 1000, SUN));
  await assertSucceeds(contribWrite('uid-m01', 'YOI-M01', 1, { day: SUN }));
  const id = `YOI-M01_${SUN}_1`;
  await setDemo({ scenarioNow: '2026-10-05T00:00:00+08:00', activityWeekId: '2026-10-05', clockVersion: CLOCK_VERSION + 1 });
  await assertFails(createWeek('uid-m01', 'YOI-M01', id, { weekId: '2026-09-21' }));
  await setDemo({ scenarioNow: '2026-10-05T00:00:00+08:00', clockVersion: CLOCK_VERSION + 1, activityWeekId: undefined });
  await assertFails(createWeek('uid-m01', 'YOI-M01', id, { weekId: '2026-09-28' }));    // no activityWeekId: fail closed
  await setDemo({ scenarioNow: '2026-10-06T00:00:00+08:00', activityWeekId: '2026-10-05', clockVersion: CLOCK_VERSION + 2 });
  await assertFails(createWeek('uid-m01', 'YOI-M01', id, { weekId: '2026-09-28' }));    // Tuesday 00:00: closed
  await setDemo({ scenarioNow: '2026-10-05T00:00:00+08:00', activityWeekId: '2026-10-05', clockVersion: CLOCK_VERSION + 1 });
  // A week ID that is not a Monday, or not a date at all, is refused (the entry week check also refuses
  // these, so the window's own date checks cannot be isolated here; see the mutation list).
  await assertFails(createWeek('uid-m01', 'YOI-M01', id, { weekId: '2026-09-29' }));
  await assertFails(createWeek('uid-m01', 'YOI-M01', id, { weekId: '2026-09-31' }));
  await assertSucceeds(createWeek('uid-m01', 'YOI-M01', id, { weekId: '2026-09-28' }));   // Monday 00:00
  await setDemo({ scenarioNow: '2026-10-05T23:59:59+08:00', activityWeekId: '2026-10-05', clockVersion: CLOCK_VERSION + 1 });
  await assertSucceeds(awardWrite('uid-m01', 'YOI-M01', 'YOI-M02', { weekId: '2026-09-28', joinRevision: 1 })); // Monday 23:59:59
});

test('03C-2 window: the previous week across a year boundary, and the current week on a Sunday', async () => {
  const SUN = '2027-01-03', MON = '2027-01-04';
  await setDemo({ scenarioNow: `${SUN}T09:00:00+08:00`, activityWeekId: '2026-12-28' });
  await seedDays(['YOI-M01', 'YOI-M02'], SUN);
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));
  await setDemo({ scenarioNow: `${SUN}T10:00:00+08:00`, activityWeekId: '2026-12-28' });
  await assertSucceeds(step('uid-m01', 'YOI-M01', 1000, SUN));
  await assertSucceeds(contribWrite('uid-m01', 'YOI-M01', 1, { day: SUN }));
  await assertSucceeds(step('uid-m02', 'YOI-M02', 900, SUN));
  await assertSucceeds(contribWrite('uid-m02', 'YOI-M02', 1, { day: SUN, joinRevision: 1 }));
  await assertSucceeds(createWeek('uid-m01', 'YOI-M01', `YOI-M02_${SUN}_1`, { weekId: '2026-12-28' }));   // Sunday: current week
  await setDemo({ scenarioNow: `${MON}T08:00:00+08:00`, activityWeekId: MON, clockVersion: CLOCK_VERSION + 1 });
  await assertSucceeds(advanceWeek('uid-m02', 'YOI-M02', `YOI-M01_${SUN}_1`, { weekId: '2026-12-28' }));  // Monday: previous week
});

test('03C-2 accepted risk 3(b): a late-credited reach cannot award a member who already joined another team', async () => {
  const SUN = '2026-10-04', MON = '2026-10-05';
  await setDemo({ scenarioNow: `${SUN}T09:00:00+08:00`, activityWeekId: '2026-09-28' });
  await seedDays(['YOI-M01', 'YOI-M02', 'YOI-M03'], SUN);
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));                                  // rev 1
  await assertSucceeds(joinOp('uid-m03', 'YOI-M03'));                                  // rev 2
  await setDemo({ scenarioNow: `${SUN}T10:00:00+08:00`, activityWeekId: '2026-09-28' });
  await assertSucceeds(step('uid-m01', 'YOI-M01', 1000, SUN));                       // not credited yet
  await setDemo({ scenarioNow: `${SUN}T12:00:00+08:00`, activityWeekId: '2026-09-28' });
  await assertSucceeds(leaveOp('uid-m02', 'YOI-M02'));                                 // rev 3, locked for 09-28
  await setDemo({ scenarioNow: `${MON}T09:00:00+08:00`, activityWeekId: MON, clockVersion: CLOCK_VERSION + 1 });
  await assertSucceeds(createTeamOp('uid-m05', 'YOI-M05', OTHER_TEAM_ID));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02', OTHER_TEAM_ID));                   // M02 moves on in the new week
  await assertSucceeds(contribWrite('uid-m01', 'YOI-M01', 1, { day: SUN }));           // late credit: Sunday 10:00
  await assertSucceeds(createWeek('uid-m01', 'YOI-M01', `YOI-M01_${SUN}_1`, { weekId: '2026-09-28' }));
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M02', { weekId: '2026-09-28', joinRevision: 1, leaveRevision: 3 }));
  await assertSucceeds(awardWrite('uid-m01', 'YOI-M01', 'YOI-M03', { weekId: '2026-09-28', joinRevision: 2 }));
});

test('03C-2 awards: forged events, founders of another team, forged fields and wrong readers are refused', async () => {
  await seedDays(['YOI-M01', 'YOI-M02', 'YOI-M03', 'YOI-M05']);
  await at('09:00:00');
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));                           // team X, createdAt 09:00
  await assertSucceeds(createTeamOp('uid-m05', 'YOI-M05', OTHER_TEAM_ID));             // team Y, also 09:00
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));                                  // rev 1, joinedAt == X.createdAt
  await assertSucceeds(transferOp('uid-m01', 'YOI-M01', 'YOI-M02'));                   // rev 2, also 09:00, targets M02
  await assertSucceeds(joinOp('uid-m03', 'YOI-M03'));                                  // rev 3, also 09:00
  await at('10:00:00');
  await assertSucceeds(step('uid-m01', 'YOI-M01', 1000));
  await assertSucceeds(contribWrite('uid-m01', 'YOI-M01', 1));
  await at('13:00:00');
  await assertSucceeds(leaveOp('uid-m02', 'YOI-M02'));                                 // rev 4 (captain passes to M01)
  await assertSucceeds(transferOp('uid-m01', 'YOI-M01', 'YOI-M03'));                   // rev 5, 13:00, targets M03
  await assertSucceeds(leaveOp('uid-m03', 'YOI-M03'));                                 // rev 6, same scenario time
  await assertFails(createWeek('uid-m01', 'YOI-M01', E.m01a, { weekId: WEEK, tweak: (v) => { v.updatedAt = new Date(); } }));
  await assertSucceeds(createWeek('uid-m01', 'YOI-M01', E.m01a));                      // M = 10:00: M01, M02, M03
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M02', { joinRevision: 2, leaveRevision: 4 }));  // a captain transfer is not a join
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M02', { joinRevision: 0, leaveRevision: 4 }));  // joined at createdAt, not the founder
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M02', { joinRevision: 1, leaveRevision: 6 }));  // another member's leave
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M03', { joinRevision: 1, leaveRevision: 6 }));  // another member's join at the same time
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M03', { joinRevision: 3, leaveRevision: 5 }));  // a transfer at the leave time is not a leave
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M01', { tweak: (v) => { v.basis = 'reissue'; } })); // M1 is always 'first'
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M05'));                      // founder of team Y at the same time
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M01', { joinRevision: 1 }));  // the founder with someone's join
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M01', { leaveRevision: 4 }));  // still in the team
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M01', { tweak: (v) => { v.grantedAt = new Date(); } }));
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M01', { tweak: (v) => { v.memberId = 'YOI-M03'; } }));
  await assertSucceeds(awardWrite('uid-m01', 'YOI-M01', 'YOI-M02', { joinRevision: 1, leaveRevision: 4 }));
  await assertSucceeds(awardWrite('uid-m01', 'YOI-M01', 'YOI-M03', { joinRevision: 3, leaveRevision: 6 }));
  await assertSucceeds(awardWrite('uid-m01', 'YOI-M01', 'YOI-M01'));
  // Readers of a missing award: a current member of any team may, a departed or teamless member may not.
  await assertFails(getDoc(awardRef(memberDb('uid-m02'), 'YOI-M06')));               // departed
  await assertFails(getDoc(awardRef(memberDb('uid-m06'), 'YOI-M02', '2026-09-21')));   // never in a team
  await assertSucceeds(getDoc(awardRef(memberDb('uid-m05'), 'YOI-M06')));             // in team Y
});

test('03C-2 week result: forged server times and another week\'s entry are refused; Tuesday closes the awards too', async () => {
  const SUN = '2026-10-04';
  await setDemo({ scenarioNow: `${SUN}T09:00:00+08:00`, activityWeekId: '2026-09-28' });
  await seedDays(['YOI-M01', 'YOI-M02'], SUN);
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));
  await setDemo({ scenarioNow: `${SUN}T10:00:00+08:00`, activityWeekId: '2026-09-28' });
  await assertSucceeds(step('uid-m01', 'YOI-M01', 1000, SUN));
  await assertSucceeds(contribWrite('uid-m01', 'YOI-M01', 1, { day: SUN }));
  const id = `YOI-M01_${SUN}_1`;
  const forged = new Date('2026-10-04T01:00:00Z');
  await assertFails(createWeek('uid-m01', 'YOI-M01', id, { weekId: '2026-09-28', tweak: (v) => { v.reachedSyncedAt = forged; v.firstReachedSyncedAt = forged; } }));
  await setDemo({ scenarioNow: '2026-10-05T09:00:00+08:00', activityWeekId: '2026-10-05', clockVersion: CLOCK_VERSION + 1 });
  await assertFails(createWeek('uid-m01', 'YOI-M01', id, { weekId: '2026-10-05' }));    // last week's entry in this week
  await assertSucceeds(createWeek('uid-m01', 'YOI-M01', id, { weekId: '2026-09-28' }));
  await setDemo({ scenarioNow: '2026-10-06T09:00:00+08:00', activityWeekId: '2026-10-05', clockVersion: CLOCK_VERSION + 2 });
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M01', { weekId: '2026-09-28' }));  // Tuesday: closed
});

test('03C-2 awards: rejoining the same team next week makes last week\'s earlier stint unprovable (accepted risk 3)', async () => {
  const SUN = '2026-10-04', MON = '2026-10-05';
  await setDemo({ scenarioNow: `${SUN}T08:00:00+08:00`, activityWeekId: '2026-09-28' });
  await seedDays(['YOI-M01', 'YOI-M02', 'YOI-M03'], SUN);
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));                                  // rev 1
  await assertSucceeds(joinOp('uid-m03', 'YOI-M03'));                                  // rev 2
  await setDemo({ scenarioNow: `${SUN}T09:30:00+08:00`, activityWeekId: '2026-09-28' });
  await assertSucceeds(step('uid-m01', 'YOI-M01', 1000, SUN));
  await assertSucceeds(contribWrite('uid-m01', 'YOI-M01', 1, { day: SUN }));
  await assertSucceeds(createWeek('uid-m01', 'YOI-M01', `YOI-M01_${SUN}_1`, { weekId: '2026-09-28' })); // M = Sunday 09:30
  await setDemo({ scenarioNow: `${SUN}T10:00:00+08:00`, activityWeekId: '2026-09-28' });
  await assertSucceeds(leaveOp('uid-m02', 'YOI-M02'));                                 // rev 3
  await setDemo({ scenarioNow: `${MON}T09:00:00+08:00`, activityWeekId: MON, clockVersion: CLOCK_VERSION + 1 });
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));                                  // rev 4: a new stint
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M02', { weekId: '2026-09-28', joinRevision: 1 }));
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M02', { weekId: '2026-09-28', joinRevision: 4 }));
});

test('03C-2 week result: at the same scenario time, the earlier server time is the earlier moment', async () => {
  await seedDays(['YOI-M01', 'YOI-M02']);
  await at('09:00:00');
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));
  await at('14:00:00');
  await assertSucceeds(step('uid-m01', 'YOI-M01', 1000));
  await assertSucceeds(contribWrite('uid-m01', 'YOI-M01', 1));                         // 14:00, earlier server time
  await assertSucceeds(step('uid-m02', 'YOI-M02', 900));
  await assertSucceeds(contribWrite('uid-m02', 'YOI-M02', 1, { joinRevision: 1 }));    // 14:00, later server time
  await assertSucceeds(createWeek('uid-m01', 'YOI-M01', `YOI-M01_${DAY}_1`));
  await assertFails(advanceWeek('uid-m01', 'YOI-M01', `YOI-M02_${DAY}_1`));         // same time, later server time
  await deleteWeekForTest();
  await assertSucceeds(createWeek('uid-m01', 'YOI-M01', `YOI-M02_${DAY}_1`));
  await assertSucceeds(advanceWeek('uid-m02', 'YOI-M02', `YOI-M01_${DAY}_1`));       // same time, earlier server time
});
const deleteWeekForTest = () => env.withSecurityRulesDisabled((c) => deleteDoc(weekRef(c.firestore())));

test('03C-2 awards: the founder is in the team only from its creation on (Security Low-1)', async () => {
  await seedDays(['YOI-M01', 'YOI-M02']);
  await at('08:00:00');
  await assertSucceeds(dailyWrite('ride', null, { uid: 'uid-m02', member: 'YOI-M02' }));  // ride before the team exists
  await at('09:00:00');
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));
  await assertSucceeds(contribWrite('uid-m02', 'YOI-M02', 1));                         // the ride counts (ruling b1)
  await assertSucceeds(createWeek('uid-m02', 'YOI-M02', `YOI-M02_${DAY}_1`));         // a dishonest M at 08:00
  await assertFails(awardWrite('uid-m02', 'YOI-M02', 'YOI-M01'));                      // the founder, before creation
  await assertFails(awardWrite('uid-m02', 'YOI-M02', 'YOI-M02', { joinRevision: 1 }));  // the joiner, before joining
});

// ----- 03C-2 shared scenario table (tests/fixtures/week-scenarios.json; the client side runs in week-result-state.test.mjs) -----
const WEEK_SCENARIOS = JSON.parse(readFileSync(new URL('./fixtures/week-scenarios.json', import.meta.url), 'utf8')).scenarios;
for (const scenario of WEEK_SCENARIOS) {
  test(`03C-2 shared scenario (Emulator): ${scenario.name}`, async () => {
    const id = (m) => `YOI-${m}`;
    const uid = (m) => `uid-${m.toLowerCase()}`;
    await seedDays(['YOI-M01', 'YOI-M02', 'YOI-M03']);
    let steps = 0;
    for (const o of scenario.ops) {
      const label = JSON.stringify(o);
      try {
        if (o.op === 'check') {
          const write = awardWrite('uid-m01', 'YOI-M01', id(o.member), { joinRevision: o.joinRevision, leaveRevision: o.leaveRevision });
          await (o.rules ? assertSucceeds(write) : assertFails(write));
          continue;
        }
        await at(o.at);
        if (o.op === 'create') await assertSucceeds(createTeamOp(uid(o.member), id(o.member)));
        else if (o.op === 'join') await assertSucceeds(joinOp(uid(o.member), id(o.member)));
        else if (o.op === 'leave') await assertSucceeds(leaveOp(uid(o.member), id(o.member)));
        else if (o.op === 'transfer') await assertSucceeds(transferOp(uid(o.member), id(o.member), id(o.target)));
        else if (o.op === 'reach') {
          steps += 1;
          await assertSucceeds(step('uid-m01', 'YOI-M01', 1000 * steps));
          await assertSucceeds(contribWrite('uid-m01', 'YOI-M01', steps));
          await assertSucceeds(createWeek('uid-m01', 'YOI-M01', `YOI-M01_${DAY}_${steps}`));
        } else throw new Error(`unknown op ${o.op}`);
      } catch (error) { throw new Error(`${label}: ${error.message}`); }
    }
  });
}

test('03C-2 awards: the founder at one second before the creation is out, at the creation second it is in (Info-1)', async () => {
  await seedDays(['YOI-M01', 'YOI-M02', 'YOI-M03']);
  await at('08:59:59');
  await assertSucceeds(dailyWrite('ride', null, { uid: 'uid-m02', member: 'YOI-M02' }));
  await at('09:00:00');
  await assertSucceeds(dailyWrite('ride', null, { uid: 'uid-m03', member: 'YOI-M03' }));  // same second, before the creation
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));                                  // rev 1
  await assertSucceeds(joinOp('uid-m03', 'YOI-M03'));                                  // rev 2
  await assertSucceeds(contribWrite('uid-m02', 'YOI-M02', 1));
  await assertSucceeds(contribWrite('uid-m03', 'YOI-M03', 1));
  await assertSucceeds(createWeek('uid-m02', 'YOI-M02', `YOI-M02_${DAY}_1`));         // M = 08:59:59
  await assertFails(awardWrite('uid-m02', 'YOI-M02', 'YOI-M01'));
  await deleteWeekForTest();
  await assertSucceeds(createWeek('uid-m03', 'YOI-M03', `YOI-M03_${DAY}_1`));         // M = 09:00:00, earlier server time
  await assertSucceeds(awardWrite('uid-m03', 'YOI-M03', 'YOI-M01'));                   // the founder: from the creation second on
  await assertFails(awardWrite('uid-m03', 'YOI-M03', 'YOI-M02', { joinRevision: 1 }));  // the joiner: its join came later
});

test('03C-2 awards: a founder who left and rejoined is judged by its new join, not as the founder', async () => {
  const SUN = '2026-10-04', MON = '2026-10-05';
  await setDemo({ scenarioNow: `${SUN}T09:00:00+08:00`, activityWeekId: '2026-09-28' });
  await seedDays(['YOI-M01'], MON);
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));                                  // rev 1
  await assertSucceeds(joinOp('uid-m03', 'YOI-M03'));                                  // rev 2
  await setDemo({ scenarioNow: `${SUN}T10:00:00+08:00`, activityWeekId: '2026-09-28' });
  await assertSucceeds(leaveOp('uid-m01', 'YOI-M01'));                                 // rev 3
  await setDemo({ scenarioNow: `${MON}T09:00:00+08:00`, activityWeekId: MON, clockVersion: CLOCK_VERSION + 1 });
  await assertSucceeds(joinOp('uid-m01', 'YOI-M01'));                                  // rev 4: joinOrder >= 1 now
  await setDemo({ scenarioNow: `${MON}T10:00:00+08:00`, activityWeekId: MON, clockVersion: CLOCK_VERSION + 1 });
  await assertSucceeds(step('uid-m01', 'YOI-M01', 1000, MON));
  await assertSucceeds(contribWrite('uid-m01', 'YOI-M01', 1, { day: MON, joinRevision: 4 }));
  await assertSucceeds(createWeek('uid-m01', 'YOI-M01', `YOI-M01_${MON}_1`, { weekId: MON }));
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M01', { weekId: MON, joinRevision: 0 }));
  await assertFails(awardWrite('uid-m01', 'YOI-M01', 'YOI-M01', { weekId: MON, joinRevision: 1 }));
  await assertSucceeds(awardWrite('uid-m01', 'YOI-M01', 'YOI-M01', { weekId: MON, joinRevision: 4 }));
});

test('03C-2 window: Monday settles the previous week across a leap-year month end', async () => {
  const SUN = '2028-03-05', MON = '2028-03-06';
  await setDemo({ scenarioNow: `${SUN}T09:00:00+08:00`, activityWeekId: '2028-02-28' });
  await seedDays(['YOI-M01', 'YOI-M02'], SUN);
  await assertSucceeds(createTeamOp('uid-m01', 'YOI-M01'));
  await assertSucceeds(joinOp('uid-m02', 'YOI-M02'));
  await setDemo({ scenarioNow: `${SUN}T10:00:00+08:00`, activityWeekId: '2028-02-28' });
  await assertSucceeds(step('uid-m01', 'YOI-M01', 1000, SUN));
  await assertSucceeds(contribWrite('uid-m01', 'YOI-M01', 1, { day: SUN }));
  await setDemo({ scenarioNow: `${MON}T23:59:59+08:00`, activityWeekId: MON, clockVersion: CLOCK_VERSION + 1 });
  await assertSucceeds(createWeek('uid-m01', 'YOI-M01', `YOI-M01_${SUN}_1`, { weekId: '2028-02-28' }));
  await assertSucceeds(awardWrite('uid-m01', 'YOI-M01', 'YOI-M02', { weekId: '2028-02-28', joinRevision: 1 }));
});

// ===== FSD-04A: weekly perfect-attendance ride coupons =====
const couponRef = (db, member, weekId, sessionId = SESSION) => doc(db, `rideCoupons/${sessionId}/members/${member}/weeks/${weekId}`);
const isoDay = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
const weekDays = (weekId) => { const [y, m, d] = weekId.split('-').map(Number); return Array.from({ length: 7 }, (_, i) => isoDay(y, m, d + i)); };
const plusDaysIso = (iso, n) => { const [day, time] = iso.split('T'); const [y, m, d] = day.split('-').map(Number); return `${isoDay(y, m, d + n)}T${time}`; };
// Seven daily documents of a week (6,000 effective steps each, no points claimed: FSD-04B); `override[i]`
// changes day i, and null removes it. Written with the Rules off (01C's own rules are tested elsewhere).
const seedPerfectWeek = async (member, weekId, override = {}, sessionId = SESSION) => {
  for (const [i, day] of weekDays(weekId).entries()) {
    await env.withSecurityRulesDisabled(async (c) => {
      const ref = doc(c.firestore(), `dailySteps/${sessionId}/members/${member}/days/${day}`);
      if (override[i] === null) return deleteDoc(ref);
      return setDoc(ref, dailyDoc({ sessionId, memberId: member, taskDate: day, rawSteps: 6000, effectiveSteps: 6000, claimed: 0, eventSeq: 4, ...override[i] }));
    });
  }
};
// Mirrors src/weekly/perfect-week-service.ts; `tweak` corrupts the payload so the Rules alone decide.
const couponWrite = async (uid, member, weekId, { tweak, sessionId = SESSION } = {}) => {
  const c = await rawData('demo/current');
  const v = { sessionId, memberId: member, weekId, faceValue: 50, minFare: 150, issuedAt: c.scenarioNow, expiresAt: plusDaysIso(c.scenarioNow, 30),
    clockVersion: c.clockVersion, recordedAt: serverTimestamp(), kind: 'weeklyPerfect' };
  tweak?.(v);
  return setDoc(couponRef(memberDb(uid), member, weekId, sessionId), v);
};
const PW = '2026-09-28';                                   // crosses a month: Monday 09-28 .. Sunday 10-04
const sundayNoon = () => setDemo({ scenarioNow: '2026-10-04T12:00:00+08:00', activityWeekId: PW });

test('04A coupon: seven 6,000-step days issue one coupon with no points claimed (reads 9 documents); it never changes', async () => {
  await seedPerfectWeek('YOI-M01', PW);
  await sundayNoon();
  await assertSucceeds(couponWrite('uid-m01', 'YOI-M01', PW));
  const c = await rawData(`rideCoupons/${SESSION}/members/YOI-M01/weeks/${PW}`);
  assert.deepEqual([c.issuedAt, c.expiresAt, c.faceValue, c.minFare], ['2026-10-04T12:00:00+08:00', '2026-11-03T12:00:00+08:00', 50, 150]);
  await assertFails(couponWrite('uid-m01', 'YOI-M01', PW));                         // one per member and week
  await setDemo({ scenarioNow: '2026-11-10T12:00:00+08:00', activityWeekId: '2026-11-09', clockVersion: CLOCK_VERSION + 1 });
  await assertFails(updateDoc(couponRef(memberDb('uid-m01'), 'YOI-M01', PW), { expiresAt: '2026-12-10T12:00:00+08:00' }));
  await assertFails(deleteDoc(couponRef(memberDb('uid-m01'), 'YOI-M01', PW)));
  assert.equal((await rawData(`rideCoupons/${SESSION}/members/YOI-M01/weeks/${PW}`)).expiresAt, '2026-11-03T12:00:00+08:00');
});

test('04A coupon: weeks across a month, a year and a leap February build the right seven daily paths (N1)', async () => {
  for (const [member, uid, weekId, sunday] of [
    ['YOI-M01', 'uid-m01', '2026-09-28', '2026-10-04'],
    ['YOI-M02', 'uid-m02', '2026-12-28', '2027-01-03'],
    ['YOI-M03', 'uid-m03', '2028-02-28', '2028-03-05'],                     // includes 2028-02-29
  ]) {
    await seedPerfectWeek(member, weekId);
    await setDemo({ scenarioNow: `${sunday}T20:00:00+08:00`, activityWeekId: weekId });
    await assertSucceeds(couponWrite(uid, member, weekId));
  }
});

test('04A coupon: expiresAt is exactly 30 days later at the same time, across a year end and a leap day', async () => {
  for (const [member, uid, weekId, now, expected] of [
    ['YOI-M01', 'uid-m01', '2026-11-23', '2026-12-02T23:30:00+08:00', '2027-01-01T23:30:00+08:00'],
    ['YOI-M02', 'uid-m02', '2028-01-24', '2028-01-30T00:00:00+08:00', '2028-02-29T00:00:00+08:00'],
    ['YOI-M03', 'uid-m03', '2027-01-25', '2027-01-30T23:59:59+08:00', '2027-03-01T23:59:59+08:00'],
  ]) {
    await seedPerfectWeek(member, weekId);
    await setDemo({ scenarioNow: now, activityWeekId: weekId });
    assert.equal(plusDaysIso(now, 30), expected);
    for (const bad of [plusDaysIso(now, 29), plusDaysIso(now, 31), `${expected.slice(0, 11)}12:00:00+08:00`]) {
      if (bad === expected) continue;
      await assertFails(couponWrite(uid, member, weekId, { tweak: (v) => { v.expiresAt = bad; } }));
    }
    await assertSucceeds(couponWrite(uid, member, weekId));
  }
});

test('04A coupon: there is no issuing deadline; a frozen qualifying week still issues three weeks later', async () => {
  await seedPerfectWeek('YOI-M01', PW);
  await setDemo({ scenarioNow: '2026-10-25T09:00:00+08:00', activityWeekId: '2026-10-19', clockVersion: CLOCK_VERSION + 3 });
  await assertSucceeds(couponWrite('uid-m01', 'YOI-M01', PW));
  assert.equal((await rawData(`rideCoupons/${SESSION}/members/YOI-M01/weeks/${PW}`)).issuedAt, '2026-10-25T09:00:00+08:00');
});

// FSD-04B: perfect attendance is seven 6,000-step days; the points claimed (Sunday's too) no longer matter.
test('04A/04B coupon: Sunday with 0, 1, 2 or 3 points claimed still issues the coupon', async () => {
  await sundayNoon();
  for (const [member, uid, claimed] of [['YOI-M01', 'uid-m01', 0], ['YOI-M02', 'uid-m02', 1], ['YOI-M03', 'uid-m03', 2], ['YOI-M05', 'uid-m05', 3]]) {
    await seedPerfectWeek(member, PW, { 6: { claimed }, 2: { claimed: 1 } });
    await assertSucceeds(couponWrite(uid, member, PW), `Sunday claimed ${claimed}`);
  }
});

test('04A coupon: a week that is not perfect is refused, whatever points are claimed', async () => {
  await sundayNoon();
  const refused = async (override, label) => {
    await seedPerfectWeek('YOI-M01', PW, override);
    await assertFails(couponWrite('uid-m01', 'YOI-M01', PW), label);
  };
  for (let i = 0; i < 7; i += 1) await refused({ [i]: { effectiveSteps: 5999, claimed: i === 6 ? 3 : 0 } }, `day ${i} 5,999`);
  await refused({ 3: null }, 'Thursday missing');
  await refused({ 6: null }, 'Sunday not reached yet');
  await seedPerfectWeek('YOI-M01', PW);
  await assertSucceeds(couponWrite('uid-m01', 'YOI-M01', PW));
});

test('04A coupon: forged week IDs, times, values and owners are refused', async () => {
  // Only the real week is seeded for M01: a Tuesday-based "week" would overwrite this week's Sunday.
  await seedPerfectWeek('YOI-M01', PW);
  await sundayNoon();
  for (const weekId of ['2026-9-28', '2026-09-31']) await assertFails(couponWrite('uid-m01', 'YOI-M01', weekId), weekId);
  // A complete Tuesday-based "week" (M02's own documents): only the Monday check refuses it.
  await seedPerfectWeek('YOI-M02', '2026-09-29');
  await assertFails(couponWrite('uid-m02', 'YOI-M02', '2026-09-29'));
  // A complete week in an old session: only the current-session check refuses a coupon there.
  await seedPerfectWeek('YOI-M01', PW, {}, 'old-session');
  await assertFails(couponWrite('uid-m01', 'YOI-M01', PW, { sessionId: 'old-session' }));
  const bad = [
    (v) => { v.issuedAt = '2026-10-04T11:00:00+08:00'; v.expiresAt = '2026-11-03T11:00:00+08:00'; },
    (v) => { v.issuedAt = '2026-10-04 12:00'; },
    (v) => { v.expiresAt = '2026-11-03T12:00:00'; },                              // no +08:00
    (v) => { v.expiresAt = '2026-11-03T24:00:00+08:00'; },
    (v) => { v.expiresAt = '2026-11-3T12:00:00+08:00'; },                          // an alias of the right date
    (v) => { v.expiresAt = '2026-10-34T12:00:00+08:00'; },                         // an impossible date that would roll over
    (v) => { v.expiresAt = '2026-11-03T12:00:00+08:00Tforged'; },                  // the right date and time plus a trailing part
    (v) => { v.faceValue = 100; }, (v) => { v.minFare = 149; }, (v) => { v.kind = 'other'; },
    (v) => { v.clockVersion = CLOCK_VERSION + 1; }, (v) => { v.recordedAt = new Date(); },
    (v) => { v.extra = 1; }, (v) => { delete v.kind; }, (v) => { v.memberId = 'YOI-M02'; }, (v) => { v.weekId = '2026-10-05'; },
    (v) => { v.sessionId = 'old-session'; },                                       // the right path, another session in the field
  ];
  for (const tweak of bad) await assertFails(couponWrite('uid-m01', 'YOI-M01', PW, { tweak }));
  await assertFails(couponWrite('uid-m02', 'YOI-M01', PW));                        // someone else's coupon
  await assertFails(couponWrite('uid-m01', 'YOI-M01', PW, { sessionId: 'other-session' }));
  await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'membersByUid/uid-m01'), { memberId: 'YOI-M01', role: 'member', active: false }));
  await assertFails(couponWrite('uid-m01', 'YOI-M01', PW));                        // inactive
  // Control: the same data and an untouched payload are accepted, so every refusal above came from its own forgery.
  await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'membersByUid/uid-m01'), { memberId: 'YOI-M01', role: 'member', active: true }));
  await assertSucceeds(couponWrite('uid-m01', 'YOI-M01', PW));
});

test('04A coupon reads: only the owner reads and lists its coupons; a transaction may read a missing coupon first', async () => {
  await seedPerfectWeek('YOI-M01', PW);
  await sundayNoon();
  const db = memberDb('uid-m01');
  const c = await rawData('demo/current');
  await assertSucceeds(runTransaction(db, async (tx) => {
    const ref = couponRef(db, 'YOI-M01', PW);
    assert.equal((await tx.get(ref)).exists(), false);
    tx.set(ref, { sessionId: SESSION, memberId: 'YOI-M01', weekId: PW, faceValue: 50, minFare: 150, issuedAt: c.scenarioNow,
      expiresAt: plusDaysIso(c.scenarioNow, 30), clockVersion: c.clockVersion, recordedAt: serverTimestamp(), kind: 'weeklyPerfect' });
  }));
  const list = (uid, member = 'YOI-M01', sessionId = SESSION) => getDocs(collection(memberDb(uid), `rideCoupons/${sessionId}/members/${member}/weeks`));
  assert.equal((await assertSucceeds(list('uid-m01'))).size, 1);
  await assertSucceeds(getDoc(couponRef(memberDb('uid-m01'), 'YOI-M01', PW)));
  await assertFails(getDoc(couponRef(memberDb('uid-m02'), 'YOI-M01', PW)));
  await assertFails(list('uid-m02'));
  await assertFails(getDoc(couponRef(env.unauthenticatedContext().firestore(), 'YOI-M01', PW)));
  await assertFails(list('uid-m01', 'YOI-M01', 'other-session'));
  await assertFails(getDoc(couponRef(memberDb('uid-m01'), 'YOI-M01', PW, 'other-session')));
  await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), `rideCoupons/${SESSION}/members/YOI-M01/weeks`)));
  await env.withSecurityRulesDisabled((x) => setDoc(doc(x.firestore(), 'membersByUid/uid-m01'), { memberId: 'YOI-M01', role: 'member', active: false }));
  await assertFails(list('uid-m01'));
  await assertFails(getDoc(couponRef(memberDb('uid-m01'), 'YOI-M01', PW)));
});

// ===== FSD-03E: team names (only the current captain writes; only current members read) =====
const teamNameRef = (db, id = TEAM_ID, sessionId = SESSION) => doc(db, `teamNames/${sessionId}/items/${id}`);
const teamNameDoc = (name = '步行小隊', overrides = {}) => ({ sessionId: SESSION, teamId: TEAM_ID, name, updatedBy: 'YOI-M01',
  updatedAt: serverTimestamp(), clockVersion: CLOCK_VERSION, ...overrides });
const nameWrite = (uid, value, id = TEAM_ID, sessionId = SESSION) => setDoc(teamNameRef(memberDb(uid), id, sessionId), value);
const seedTeamName = (name = '步行小隊', id = TEAM_ID, sessionId = SESSION) => env.withSecurityRulesDisabled((c) =>
  setDoc(teamNameRef(c.firestore(), id, sessionId), { sessionId, teamId: id, name, updatedBy: 'YOI-M01', updatedAt: new Date(), clockVersion: CLOCK_VERSION }));

test('03E team name reads: current members read a missing or a set name; others never read or list', async () => {
  await seedTeam(['YOI-M01', 'YOI-M02', 'YOI-M04']);
  assert.equal((await assertSucceeds(getDoc(teamNameRef(memberDb('uid-m02'))))).exists(), false);
  await seedTeamName('走走隊');
  for (const uid of ['uid-m01', 'uid-m02']) assert.equal((await assertSucceeds(getDoc(teamNameRef(memberDb(uid))))).data().name, '走走隊');
  await assertFails(getDoc(teamNameRef(memberDb('uid-m03'))));                       // not a member
  await assertFails(getDoc(teamNameRef(memberDb('uid-inactive'))));                  // inactive, even though listed
  await assertFails(getDoc(teamNameRef(env.unauthenticatedContext().firestore())));
  await assertFails(getDoc(doc(memberDb(), `teamNames/${SESSION}/items/${TEAM_ID}/extra/x`)));
  await assertFails(getDocs(collection(memberDb(), `teamNames/${SESSION}/items`)));
  await assertFails(getDocs(query(collectionGroup(memberDb(), 'items'), where('teamId', '==', TEAM_ID))));
  // other session: same IDs under a session that is not current
  await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), `teams/other-session/items/${TEAM_ID}`), teamValue(['YOI-M01', 'YOI-M02'], { sessionId: 'other-session' })));
  await seedTeamName('舊場次', TEAM_ID, 'other-session');
  await assertFails(getDoc(teamNameRef(memberDb(), TEAM_ID, 'other-session')));
  // a member who has just left no longer reads it
  await assertSucceeds(leaveOp('uid-m02', 'YOI-M02'));
  await assertFails(getDoc(teamNameRef(memberDb('uid-m02'))));
  assert.equal((await assertSucceeds(getDoc(teamNameRef(memberDb('uid-m01'))))).data().name, '走走隊');
  // no team document: nobody reads
  await env.withSecurityRulesDisabled((c) => deleteDoc(teamRef(c.firestore())));
  await assertFails(getDoc(teamNameRef(memberDb('uid-m01'))));
});

test('03E team name writes: only the current captain of a team that is not archived names it; nobody deletes', async () => {
  await seedTeam(['YOI-M01']);                                                       // recruiting, one person
  await assertSucceeds(nameWrite('uid-m01', teamNameDoc('一人隊')));
  await assertSucceeds(nameWrite('uid-m01', teamNameDoc('改名了')));                  // rename = update, any number of times
  await assertSucceeds(updateDoc(teamNameRef(memberDb('uid-m01')), { name: '再改', updatedAt: serverTimestamp() }));
  assert.equal((await rawData(`teamNames/${SESSION}/items/${TEAM_ID}`)).name, '再改');
  await assertFails(deleteDoc(teamNameRef(memberDb('uid-m01'))));
  await seedTeam(['YOI-M01', 'YOI-M02']);                                            // active
  await assertFails(nameWrite('uid-m02', teamNameDoc('隊員改', { updatedBy: 'YOI-M02' })));
  await assertFails(nameWrite('uid-m03', teamNameDoc('外人改', { updatedBy: 'YOI-M03' })));
  await assertFails(nameWrite('uid-m02', teamNameDoc('冒名')));                      // member forging the captain
  await assertSucceeds(nameWrite('uid-m01', teamNameDoc('隊長改')));
  await seedTeam(['YOI-M01'], { status: 'paused', everFormed: true });
  await assertSucceeds(nameWrite('uid-m01', teamNameDoc('暫停中')));
  await seedTeam(['YOI-M01'], { status: 'archived' });                               // listed captain, archived team
  await assertFails(nameWrite('uid-m01', teamNameDoc('封存後')));
  await assertFails(nameWrite('uid-m01', teamNameDoc('沒有隊', { teamId: OTHER_TEAM_ID }), OTHER_TEAM_ID));   // no team document
  await seedTeam(['YOI-M04', 'YOI-M01']);                                            // inactive captain
  await assertFails(nameWrite('uid-inactive', teamNameDoc('停用', { updatedBy: 'YOI-M04' })));
});

test('03E team name succession: after a captain leaves or hands over, only the new captain names the team', async () => {
  await seedTeam(['YOI-M01', 'YOI-M02', 'YOI-M03']);
  await assertSucceeds(transferOp('uid-m01', 'YOI-M01', 'YOI-M02'));
  await assertFails(nameWrite('uid-m01', teamNameDoc('舊隊長')));                    // still a member, no longer captain
  await assertSucceeds(nameWrite('uid-m02', teamNameDoc('新隊長', { updatedBy: 'YOI-M02' })));
  await assertSucceeds(leaveOp('uid-m02', 'YOI-M02'));                               // the captain leaves: the first remaining member takes over
  assert.equal((await rawTeam()).leaderMemberId, 'YOI-M01');
  await assertFails(nameWrite('uid-m02', teamNameDoc('走了還改', { updatedBy: 'YOI-M02' })));
  await assertFails(nameWrite('uid-m03', teamNameDoc('不是隊長', { updatedBy: 'YOI-M03' })));
  await assertSucceeds(nameWrite('uid-m01', teamNameDoc('接任')));
});

test('03E team name values: the Rules accept and refuse exactly the shared case table (escapes, size unit)', async () => {
  const { TEAM_NAME_CASES } = await import('./fixtures/team-name-cases.mjs');
  await seedTeam(['YOI-M01']);
  for (const { label, name, rules } of TEAM_NAME_CASES) {
    const write = nameWrite('uid-m01', teamNameDoc(name));
    try { if (rules) await assertSucceeds(write); else await assertFails(write); } catch (error) { throw new Error(`${label}: ${error.message}`); }
  }
  for (const bad of [12, null, ['小隊'], { name: '小隊' }]) await assertFails(nameWrite('uid-m01', teamNameDoc(bad)), `non-string ${JSON.stringify(bad)}`);
});

test('03E team name shape: forged owner, time, clock, session, team ID and fields are refused', async () => {
  await seedTeam(['YOI-M01']);
  const refused = async (overrides, label, drop) => {
    const v = teamNameDoc('步行小隊', overrides);
    if (drop) delete v[drop];
    await assertFails(nameWrite('uid-m01', v), label);
  };
  await refused({ updatedBy: 'YOI-M02' }, 'updatedBy forged');
  await refused({ updatedAt: new Date('2026-09-30T04:00:00Z') }, 'updatedAt not request.time');
  await refused({ clockVersion: CLOCK_VERSION - 1 }, 'old clockVersion');
  await refused({ sessionId: 'other-session' }, 'sessionId field');
  await refused({ teamId: OTHER_TEAM_ID }, 'teamId field');
  await refused({ extra: 1 }, 'extra field');
  for (const field of ['sessionId', 'teamId', 'name', 'updatedBy', 'updatedAt', 'clockVersion']) await refused({}, `missing ${field}`, field);
  // a lower-case path ID is not a team ID, even with a team document behind it
  const lower = TEAM_ID.toLowerCase();
  await seedTeam(['YOI-M01'], {}, lower);
  await assertFails(nameWrite('uid-m01', teamNameDoc('小寫', { teamId: lower }), lower));
  // a session that is not current
  await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), `teams/other-session/items/${TEAM_ID}`), teamValue(['YOI-M01'], { sessionId: 'other-session' })));
  await assertFails(nameWrite('uid-m01', teamNameDoc('他場次', { sessionId: 'other-session' }), TEAM_ID, 'other-session'));
  // control: the untouched payload is accepted
  await assertSucceeds(nameWrite('uid-m01', teamNameDoc()));
});
