// FSD-07A mutation check (local Emulator only). Run through the pinned runner:
//   npm run test:rules:mutation:referral
// See scripts/rules-mutation-runner.mjs for how each mutation is applied and judged.
import { runMutations } from './rules-mutation-runner.mjs';

const MUTATIONS = [
  // Binding: shape and values
  ['r01 shape: field count', 'v.keys().size() == 8', 'true', 'hasOnly with exactly 8 names plus checks on every field already require all 8'],
  ['r02 shape: allowed fields', "&& v.keys().hasOnly(['sessionId','refereeId','referrerId','boundAt','firstRideAt','clockVersion','recordedAt','firstRideRecordedAt'])", '', 'with size() == 8 kept: eight keys that each pass a check can only be the eight names (r01 and r02 guard each other; the extra-field test catches both removed)'],
  ['r03 path: sessionId field', '&& v.sessionId == sessionId && v.refereeId', '&& v.refereeId'],
  ['r04 path: refereeId field', 'v.refereeId == refereeId\n', 'true\n'],
  ['r05 code: plain id only', "&& v.referrerId is string && v.referrerId.matches('^[A-Za-z0-9-]{1,40}$')", '&& v.referrerId is string', 'a value with "/" builds a path with an even number of segments or one the profile check cannot find, so it is refused anyway; kept as defence in depth (the "not a plain id" test still passes)'],
  ['r06 no self referral', '&& v.referrerId != refereeId\n', '\n'],
  ['r07 boundAt is now', '&& v.boundAt == currentScenarioNow() && v.clockVersion', '&& v.clockVersion'],
  ['r08 clockVersion', '&& v.clockVersion == currentClockVersion() && v.recordedAt', '&& v.recordedAt'],
  ['r09 recordedAt', '&& v.recordedAt == request.time\n', '\n'],
  ['r10 no ride on binding', '&& v.firstRideAt == null && v.firstRideRecordedAt == null', '&& v.firstRideRecordedAt == null'],
  ['r11 no ride time on binding', 'v.firstRideAt == null && v.firstRideRecordedAt == null', 'v.firstRideAt == null'],
  ['r12 valid code', '&& exists(/databases/$(database)/documents/memberProfiles/$(v.referrerId))\n', '\n'],
  ['r13 no mutual referral', '\n        && (!exists(referralPath(sessionId, v.referrerId)) || get(referralPath(sessionId, v.referrerId)).data.referrerId != refereeId);', ';'],
  ['r14 mutual: compares the referee', '.data.referrerId != refereeId);', '.data.referrerId != v.referrerId);'],
  // First ride
  ['r15 ride: only once', 'return resource.data.firstRideAt == null\n        &&', 'return'],
  ['r16 ride: only the two fields', ".affectedKeys().hasOnly(['firstRideAt','firstRideRecordedAt'])", ".affectedKeys().hasAny(['firstRideAt'])"],
  ['r17 ride: both fields', "\n        && v.diff(resource.data).affectedKeys().hasAll(['firstRideAt','firstRideRecordedAt'])", '', 'firstRideAt goes from null (r15) to the scenario time and firstRideRecordedAt from null to request.time, so both always change; hasAll is defence in depth'],
  ['r18 ride: time is now', '&& v.firstRideAt == currentScenarioNow() && v.firstRideRecordedAt', '&& v.firstRideRecordedAt'],
  ['r19 ride: recorded now', '&& v.firstRideRecordedAt == request.time;', ';'],
  // Access
  ['r20 get: own or missing or referrer', '(refereeId == actorMemberId() || resource == null || resource.data.referrerId == actorMemberId())', 'true'],
  ['r21 get: referrer branch', '|| resource.data.referrerId == actorMemberId())', '|| true)'],
  ['r22 list: referrer only', 'allow list: if activeMember() && currentSession(sessionId) && resource.data.referrerId == actorMemberId();', 'allow list: if activeMember() && currentSession(sessionId);'],
  ['r23 create: own referral', '&& refereeId == actorMemberId() && referralCreate', '&& referralCreate'],
  ['r24 create: current session', 'allow create: if activeMember() && currentSession(sessionId) &&', 'allow create: if activeMember() &&'],
  ['r25 create: active member', 'allow create: if activeMember() && currentSession', 'allow create: if currentSession'],
  ['r26 update: own referral', '&& refereeId == actorMemberId() && referralFirstRide', '&& referralFirstRide'],
  ['r27 update: current session', 'allow update: if activeMember() && currentSession(sessionId) &&', 'allow update: if activeMember() &&'],
  ['r29 list: current session', 'allow list: if activeMember() && currentSession(sessionId) && resource.data.referrerId', 'allow list: if activeMember() && resource.data.referrerId'],
  ['r30 update: active member', 'allow update: if activeMember() && currentSession', 'allow update: if currentSession'],
  ['r28 delete denied', 'allow delete: if false;', 'allow delete: if true;'],
];

await runMutations({ marker: '// ===== FSD-07A >>>', testPattern: '07A referral', expectedTests: 5, mutations: MUTATIONS });
