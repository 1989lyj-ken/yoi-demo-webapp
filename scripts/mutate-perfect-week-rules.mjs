// FSD-04A/04B mutation check (local Emulator only). Run through the pinned runner:
//   npm run test:rules:mutation:coupon
// See scripts/rules-mutation-runner.mjs for how each mutation is applied and judged.
import { runMutations } from './rules-mutation-runner.mjs';

const MUTATIONS = [
  // Date helpers (N1: the daily paths are built by the Rules)
  ['p01 pad2: zero padding', "(n < 10 ? '0' : '') + string(n)", 'string(n)'],
  ['p02 dayStr: separators', "string(t.year()) + '-' + pad2(t.month()) + '-' + pad2(t.day())", "string(t.year()) + pad2(t.month()) + pad2(t.day())"],
  ['p03 couponDay: day offset', "$(dayStr(monday + duration.value(i, 'd')))", '$(dayStr(monday))'],
  // Expiry
  ['p04 expiry: format', 'return validScenarioNow(expiresAt) && b[1] == a[1]', 'return b[1] == a[1]'],
  ['p05 expiry: same time of day', '&& b[1] == a[1]', ''],
  ['p06 expiry: exactly 30 days', "+ duration.value(30, 'd')", "+ duration.value(31, 'd')"],
  // Shape and values
  ['p07 shape: field count', 'v.keys().size() == 10', 'true', 'hasOnly with exactly 10 names plus the equality checks on every field already require all 10'],
  ['p08 shape: allowed fields', "&& v.keys().hasOnly(['sessionId','memberId','weekId','faceValue','minFare','issuedAt','expiresAt','clockVersion','recordedAt','kind'])", '', 'with size() == 10 kept: ten keys that each pass an equality check can only be the ten names (p07 and p08 guard each other; the extra-field test catches both removed)'],
  ['p09 path: sessionId field', '&& v.sessionId == sessionId && v.memberId == memberId', '&& v.memberId == memberId'],
  ['p10 path: memberId field', 'v.memberId == memberId && v.weekId == weekId', 'v.weekId == weekId'],
  ['p11 path: weekId field', '&& v.weekId == weekId\n', '\n'],
  ['p12 value: faceValue', 'v.faceValue == 50 && ', ''],
  ['p13 value: minFare', 'v.minFare == 150 && ', ''],
  ['p14 value: kind', "&& v.kind == 'weeklyPerfect'", ''],
  ['p15 audit: recordedAt', 'v.recordedAt == request.time && ', ''],
  ['p16 clock: clockVersion', '&& v.clockVersion == currentClockVersion()', ''],
  // Week ID
  ['p17 week: format', "&& weekId.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')", '', 'equivalent in reachable states: dayStr(monday) == weekId requires the canonical spelling except for years below 1000 (no zero padding), and no daily document can exist for such weeks (01C requires a 4-digit year)'],
  ['p38 expiry: date round trip', ' && dayStr(e) == b[0]', '', 'defence in depth while p04 (the format check) is kept: the format excludes aliases and timestamp.date throws on impossible dates (Security I2)'],
  ['p18 week: Monday', '&& monday.dayOfWeek() == 1', ''],
  ['p19 week: canonical spelling', '&& dayStr(monday) == weekId', '', 'with the YYYY-MM-DD format kept, timestamp.date throwing on impossible dates leaves only the canonical spelling (p17 and p19 guard each other; the alias test catches both removed)'],
  ['p20 time: issuedAt is now', 'v.issuedAt == currentScenarioNow() && ', ''],
  ['p21 time: expiry check', '&& v.expiresAt is string && couponExpiry(v.issuedAt, v.expiresAt)', ''],
  // The seven days
  ['p22 day 0 (Monday) 6,000', '&& couponDay(sessionId, memberId, monday, 0).effectiveSteps >= 6000', ''],
  ['p35 day 1 (Tuesday) 6,000', '&& couponDay(sessionId, memberId, monday, 1).effectiveSteps >= 6000', ''],
  ['p23 day 2 (Wednesday) 6,000', '&& couponDay(sessionId, memberId, monday, 2).effectiveSteps >= 6000', ''],
  ['p24 day 3 (Thursday) 6,000', '&& couponDay(sessionId, memberId, monday, 3).effectiveSteps >= 6000', ''],
  ['p36 day 4 (Friday) 6,000', '&& couponDay(sessionId, memberId, monday, 4).effectiveSteps >= 6000', ''],
  ['p37 day 5 (Saturday) 6,000', '&& couponDay(sessionId, memberId, monday, 5).effectiveSteps >= 6000', ''],
  // FSD-04B: Sunday's third point is no longer required, so Sunday's 6,000 must now be caught on its own.
  ['p25 day 6 (Sunday) 6,000', '&& couponDay(sessionId, memberId, monday, 6).effectiveSteps >= 6000', ''],
  ['p26 threshold 6,000', 'monday, 1).effectiveSteps >= 6000', 'monday, 1).effectiveSteps >= 5999'],
  ['p39 04B regression: Sunday third point required again', 'monday, 6).effectiveSteps >= 6000;', 'monday, 6).effectiveSteps >= 6000\n        && couponDay(sessionId, memberId, monday, 6).claimed == 3;'],
  // Access
  ['p28 create: owner', "allow create: if activeMember() && currentSession(sessionId) && actorMemberId() == memberId\n        && couponCreate", 'allow create: if activeMember() && currentSession(sessionId)\n        && couponCreate'],
  ['p29 create: current session', "allow create: if activeMember() && currentSession(sessionId) && actorMemberId()", "allow create: if activeMember() && actorMemberId()"],
  ['p30 create: active member', "allow create: if activeMember() && currentSession(sessionId)", "allow create: if currentSession(sessionId)"],
  ['p31 read: owner', "allow get, list: if activeMember() && currentSession(sessionId) && actorMemberId() == memberId;", "allow get, list: if activeMember() && currentSession(sessionId);"],
  ['p32 read: current session', "allow get, list: if activeMember() && currentSession(sessionId) &&", "allow get, list: if activeMember() &&"],
  ['p33 read: active member', "allow get, list: if activeMember() && currentSession", "allow get, list: if currentSession"],
  ['p34 never changed', 'allow update, delete: if false;\n    }\n\n    // All feature data', 'allow update, delete: if true;\n    }\n\n    // All feature data'],
];

await runMutations({ marker: '// ===== FSD-04A', testPattern: '^04A', expectedTests: 8, mutations: MUTATIONS });
