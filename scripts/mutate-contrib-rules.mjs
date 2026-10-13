// FSD-03C-1 mutation check (local Emulator only). Run through the pinned runner:
//   npm run test:rules:mutation
// See scripts/rules-mutation-runner.mjs for how each mutation is applied and judged.
import { runMutations } from './rules-mutation-runner.mjs';

const MUTATIONS = [
  ['m01 contribAfter tie ignores server time', 't > ref.effectiveAt || (t == ref.effectiveAt && s > ref.serverRecordedAt)', 't >= ref.effectiveAt'],
  ['m02 contribBefore tie ignores server time', 't < ref.effectiveAt || (t == ref.effectiveAt && s < ref.serverRecordedAt)', 't <= ref.effectiveAt'],
  ['m03 reader: membership status', "&& get(p).data.status == 'active' ", '', 'a departed index always has teamId null (FSD-03B Rules), so the teamId check alone excludes it'],
  ['m04 reader: membership teamId', '&& get(p).data.teamId == teamId;', ';'],
  ['m05 own path: entry prefix', "entryId.split('_')[0] == actorMemberId()", 'true'],
  ['m06 founder must send joinRevision 0', 'ms.joinedAt == ts.createdAt ? v.joinRevision == 0', 'ms.joinedAt == ts.createdAt ? true'],
  ['m07 joinRevision 0: strict joinedAt', "(ms.status == 'left' && v.occurredAt > ms.joinedAt)", "(ms.status == 'left')"],
  ['m08 joinRevision 0: departed only', "(ms.status == 'left' && v.occurredAt > ms.joinedAt)", '(v.occurredAt > ms.joinedAt)'],
  ['m09 join event: type', "je.type == 'join' && ", ''],
  ['m10 join event: target member', 'je.targetMemberId == m && ', ''],
  ['m11 join event: matches joinedAt', 'je.effectiveAt == ms.joinedAt', 'true'],
  ['m12 join event: fragment after join', '&& contribAfter(v.occurredAt, v.syncedAt, je)', ''],
  ['m13 pause event: type', "pe.type == 'leave' && ", '', "a paused team's latest event is always the pausing leave (no other operation is possible while paused)"],
  ['m14 pause: fragment before pause', '&& contribBefore(v.occurredAt, v.syncedAt, pe)', ''],
  ['m15 team ever formed', 'ts.everFormed == true && ', '', 'with events/1.type == join still required: a join is what sets everFormed (FSD-03B), so one guard implies the other'],
  ['m16 events/1 is a join', "formed.type == 'join'", 'true', 'with everFormed still required: the first event of a formed team is its forming join; a recruiting team only gets a cancel, which leaves everFormed false'],
  ['m17 active member: same team', 'ms.teamId == teamId && (', '('],
  ['m18 active member: team active or paused-before', "(ts.status == 'active' || (ts.status == 'paused' && contribBeforePause(sessionId, teamId, ts, v)))", 'true'],
  ['m19 departed: left this team', 'ms.leftTeamId == teamId && ', ''],
  ['m20 departed: before leftAt', '&& v.occurredAt < ms.leftAt', ''],
  ['m21 ride: joinRevision 0', "v.joinRevision == 0 && v.taskDate >= ms.joinedAt.split('T')[0]", "v.taskDate >= ms.joinedAt.split('T')[0]"],
  ['m22 ride: not before the join day (Low-1)', "&& v.taskDate >= ms.joinedAt.split('T')[0]", ''],
  ['m23 step: after formation', 'contribAfter(v.occurredAt, v.syncedAt, formed) && contribJoinStart', 'contribJoinStart'],
  ['m24 event: kind', 'e.kind == v.kind && ', ''],
  ['m25 event: occurredAt', 'e.occurredAt == v.occurredAt && ', ''],
  ['m26 event: syncedAt', 'e.syncedAt == v.syncedAt', 'true'],
  ['m27 event: amount', "v.eligibleRawDelta == (v.kind == 'steps' ? e.rawDelta : 0)", 'true'],
  ['m28 entry: own memberId', '&& v.teamId == teamId && v.memberId == m', '&& v.teamId == teamId'],
  ['m29 entry: ID shape', "&& entryId == m + '_' + v.taskDate + '_' + string(v.seq)", ''],
  ['m30 entry: weekId', "&& v.weekId is string && weekMatches(v.taskDate + 'T', v.weekId)", ''],
  ['m31 entry: today/yesterday window', "&& dailyWindow(v.taskDate, currentScenarioNow()) != ''", ''],
  ['m32 entry: recordedAt is server time', 'v.recordedAt == request.time', 'true'],
  ['m33 entry: kind steps or ride', "v.kind in ['steps', 'ride']", 'true'],
  ['m34 entry: eligibility', '&& contribEligible(sessionId, teamId, m, v);', ';'],
  ['m35 entry: event link', '&& contribEvent(sessionId, m, v)', ''],
  ['m36 entries are immutable', 'allow update, delete: if false;', 'allow update, delete: if true;'],
  ['m37 list needs team membership', 'allow list: if teamContribReader(sessionId, teamId);', 'allow list: if activeMember();'],
];

await runMutations({ marker: '// ===== FSD-03C-1', testPattern: '03C-1', expectedTests: 22, mutations: MUTATIONS });
