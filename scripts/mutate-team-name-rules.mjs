// FSD-03E mutation check (local Emulator only). Run through the pinned runner:
//   npm run test:rules:mutation:teamname
// See scripts/rules-mutation-runner.mjs for how each mutation is applied and judged.
import { runMutations } from './rules-mutation-runner.mjs';

const NAME_RE = String.raw`d.name.matches('^[^\\s\\p{Z}\\p{Cc}]([^\\p{Cc}]*[^\\s\\p{Z}\\p{Cc}])?$')`;
const GET = 'allow get: if activeMember() && currentSession(sessionId) && teamNameMemberNow(sessionId, teamId);';
const WRITE = 'allow create, update: if activeMember() && currentSession(sessionId)\n';

const MUTATIONS = [
  // Reads
  ['t01 get: active member', GET, 'allow get: if currentSession(sessionId) && teamNameMemberNow(sessionId, teamId);'],
  ['t02 get: current session', GET, 'allow get: if activeMember() && teamNameMemberNow(sessionId, teamId);'],
  ['t03 get: members only', GET, 'allow get: if activeMember() && currentSession(sessionId);'],
  ['t04 get: member check is a real membership', '.memberIds.hasAll([actorMemberId()]);', '.memberIds.size() > 0;'],
  // Writes: who
  ['t05 write: active member', WRITE, 'allow create, update: if currentSession(sessionId)\n'],
  ['t06 write: current session', WRITE, 'allow create, update: if activeMember()\n'],
  ['t07 write: captain, not any member', '&& t.leaderMemberId == actorMemberId();', '&& t.memberIds.hasAll([actorMemberId()]);'],
  ['t08 write: archived teams excluded', "return t.status in ['recruiting', 'active', 'paused'] && ", 'return '],
  ['t09 write: archived not in the list', "t.status in ['recruiting', 'active', 'paused']", "t.status in ['recruiting', 'active', 'paused', 'archived']"],
  ['t10 write: paused captains allowed', "t.status in ['recruiting', 'active', 'paused']", "t.status in ['recruiting', 'active']"],
  // Writes: shape
  ['t11 shape: field count', 'return d.keys().size() == 6\n        && ', 'return ', 'hasOnly with six names plus a check that reads each of the six fields already requires exactly those six (t11 and t12 guard each other; t13 removes both and the extra-field test catches it)'],
  ['t12 shape: allowed fields', "\n        && d.keys().hasOnly(['sessionId', 'teamId', 'name', 'updatedBy', 'updatedAt', 'clockVersion'])", '', 'with size() == 6 kept: six keys that each pass a check on a named field can only be the six names'],
  ['t13 shape: field count and allowed fields', "d.keys().size() == 6\n        && d.keys().hasOnly(['sessionId', 'teamId', 'name', 'updatedBy', 'updatedAt', 'clockVersion'])\n        && ", ''],
  ['t14 path: sessionId field', 'd.sessionId == sessionId && ', ''],
  ['t15 path: teamId field', 'd.teamId == teamId && ', ''],
  ['t16 path: team ID format', " && teamId.matches('^[A-F0-9]{16}$')", ''],
  ['t17 name: string', 'd.name is string && ', '', 'every other name check (size and matches) errors on a non-string, which denies the write'],
  ['t18 name: at most 12', 'd.name.size() <= 12', 'd.name.size() <= 13'],
  ['t19 name: no size limit', '&& d.name.size() <= 12\n', '\n'],
  ['t20 name: pattern', `\n        && ${NAME_RE}`, ''],
  ['t21 name: separators at the ends', NAME_RE, String.raw`d.name.matches('^[^\\s\\p{Cc}]([^\\p{Cc}]*[^\\s\\p{Cc}])?$')`],
  ['t22 name: control characters inside', NAME_RE, String.raw`d.name.matches('^[^\\s\\p{Z}\\p{Cc}](.*[^\\s\\p{Z}\\p{Cc}])?$')`],
  ['t23 name: trailing end', NAME_RE, String.raw`d.name.matches('^[^\\s\\p{Z}\\p{Cc}][^\\p{Cc}]*$')`],
  ['t24 audit: updatedBy', '&& d.updatedBy == actorMemberId() ', ''],
  ['t25 audit: updatedAt', ' && d.updatedAt == request.time', ''],
  ['t26 clock: clockVersion', '\n        && d.clockVersion == currentClockVersion();', ';'],
  // Never listed or deleted; documents only
  ['t27 list stays closed', 'allow list, delete: if false;', 'allow list: if activeMember();\n      allow delete: if false;'],
  ['t28 delete stays closed', 'allow list, delete: if false;', 'allow delete: if activeMember();\n      allow list: if false;'],
  // t29 is killed because teamId becomes a path and teamId.matches errors (the positive writes fail), not by the subcollection read.
  ['t29 path: documents only', 'match /teamNames/{sessionId}/items/{teamId} {', 'match /teamNames/{sessionId}/items/{teamId=**} {'],
];

await runMutations({ marker: '// ===== FSD-03E >>>', testPattern: '^03E team name', expectedTests: 5, mutations: MUTATIONS });
