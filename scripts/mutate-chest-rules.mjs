// FSD-06A mutation check (local Emulator only). Run through the pinned runner:
//   npm run test:rules:mutation:chest
// See scripts/rules-mutation-runner.mjs for how each mutation is applied and judged.
import { runMutations } from './rules-mutation-runner.mjs';

const CHEST = [
  // Access
  ['c01 owner: active member', 'return activeMember() && currentSession(sessionId) && actorMemberId() == memberId;', 'return currentSession(sessionId) && actorMemberId() == memberId;'],
  ['c02 owner: current session', 'return activeMember() && currentSession(sessionId) && actorMemberId() == memberId;', 'return activeMember() && actorMemberId() == memberId;'],
  ['c03 owner: own path', 'return activeMember() && currentSession(sessionId) && actorMemberId() == memberId;', 'return activeMember() && currentSession(sessionId);'],
  ['c04 create: needs the open check', 'allow create: if dailyOwnerList(sessionId, memberId) && chestOpenCreate(sessionId, memberId, weekId);', 'allow create: if dailyOwnerList(sessionId, memberId);'],
  ['c05 opened once', 'allow update, delete: if false;', 'allow update, delete: if true;'],
  // Shape
  ['c06 shape: field count', 'v.keys().size() == 8', 'true', 'hasOnly with exactly 8 names plus checks on every field already require all 8'],
  ['c07 shape: allowed fields', "&& v.keys().hasOnly(['sessionId','memberId','weekId','tier','points','openedAt','clockVersion','recordedAt'])", '', 'with size() == 8 kept: eight keys that each pass a check can only be the eight names (c06 and c07 guard each other; the extra-field test catches both removed)'],
  ['c08 path: sessionId field', '&& v.sessionId == sessionId && v.memberId', '&& v.memberId'],
  ['c09 path: memberId field', 'v.memberId == memberId && v.weekId', 'v.weekId'],
  ['c10 path: weekId field', '&& v.weekId == weekId\n', '\n'],
  // Points and tier
  ['c11 points: integer', 'return points is int && (', 'return ('],
  ['c12 basic: at least 1', 'points >= 1 && points <= 3', 'points <= 3'],
  ['c13 basic: at most 3', 'points >= 1 && points <= 3', 'points >= 1'],
  ['c14 small: 5', "tier == 'small' ? points == 5", "tier == 'small' ? points >= 4"],
  ['c15 big: at least 10', 'points >= 10 && points <= 20', 'points <= 20'],
  ['c16 big: at most 20', 'points >= 10 && points <= 20', 'points >= 10'],
  ['c17 super: 50', "tier == 'super' && points == 50", "tier == 'super' && points >= 50"],
  ['c18 tier: known names only', ": tier == 'super' && points == 50", ': points == 50'],
  ['c19 tier/points check', '&& chestPoints(v.tier, v.points)\n', '\n'],
  // Time, clock, audit and the chest itself
  ['c20 openedAt is now', '&& v.openedAt == currentScenarioNow() && v.clockVersion', '&& v.clockVersion'],
  ['c21 clockVersion', '&& v.clockVersion == currentClockVersion()\n', '\n'],
  ['c22 recordedAt', '&& v.recordedAt == request.time\n', '\n'],
  ['c23 chest exists', '\n        && exists(/databases/$(database)/documents/chestAwards/$(sessionId)/weeks/$(weekId)/awards/$(memberId));', ';'],
  ['c24 chest is the own one', '/awards/$(memberId));', '/awards/YOI-M02);'],
  // Reads
  // Security L1/L2: tier and points must match; only the weeks collection exists
  ['c26 small: not 50', "tier == 'small' ? points == 5", "tier == 'small' ? (points == 5 || points == 50)"],
  ['c27 basic: named tier only', "return points is int && (tier == 'basic' ?", "return points is int && (!(tier in ['small', 'big', 'super']) ?"],
  ['c28 path: weeks collection only', 'match /chestOpens/{sessionId}/members/{memberId}/weeks/{weekId} {', 'match /chestOpens/{sessionId}/members/{memberId}/{coll}/{weekId} {'],
  ['c25 read: owner only', 'allow get, list: if dailyOwnerList(sessionId, memberId);', 'allow get, list: if activeMember();'],
];

const DAILY_LIST = [
  ['d01 list: owner check', 'allow list: if dailyOwnerList(sessionId, memberId);', 'allow list: if activeMember();'],
  ['d02 list: open to all', 'allow list: if dailyOwnerList(sessionId, memberId);', 'allow list: if true;'],
  ['d03 list: signed in', 'allow list: if dailyOwnerList(sessionId, memberId);', 'allow list: if request.auth != null;'],
  ['d04 list: current session', 'allow list: if dailyOwnerList(sessionId, memberId);', 'allow list: if activeMember() && actorMemberId() == memberId;'],
];

await runMutations({ marker: '// ===== FSD-06A >>>', testPattern: '06A chest', expectedTests: 3, mutations: CHEST });
await runMutations({ marker: '// ===== FSD-06A daily-list >>>', testPattern: '06A daily list', expectedTests: 1, mutations: DAILY_LIST });
