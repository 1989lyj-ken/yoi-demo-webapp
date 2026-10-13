import { compareMoments, weekOfTaskDate, type Moment, type ServerTime, type TeamEventLite } from "./contrib-state.ts";

/** FSD-03C-2 week result: M1 (first reach, immutable) and Mc (current, only earlier). */
export interface WeekResult {
  sessionId: string;
  teamId: string;
  weekId: string;
  first: Moment;
  current: Moment;
  reachingEntryId: string;
  revision: number;
}

/** One chest award (create-only; one per member per week). */
export interface ChestAward {
  sessionId: string;
  weekId: string;
  memberId: string;
  teamId: string;
  at: Moment;
  joinRevision: number;
  leaveRevision: number;
  basis: "first" | "reissue";
}

export class WeekResultFormatError extends Error {}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SCENARIO = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\+08:00$/;
const TEAM_ID = /^[A-F0-9]{16}$/;
const RESULT_KEYS = ["sessionId", "teamId", "weekId", "firstReachedAt", "firstReachedSyncedAt", "reachedAt", "reachedSyncedAt", "reachingEntryId", "revision", "firstRecordedAt", "updatedAt", "updatedBy"];
const AWARD_KEYS = ["sessionId", "weekId", "memberId", "teamId", "reachedAt", "reachedSyncedAt", "joinRevision", "leaveRevision", "basis", "grantedBy", "grantedAt"];
const FORMAT = "週結果或寶箱資格資料格式不符，請由管理者重設場次。";

function serverTime(value: unknown): ServerTime | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return Number.isSafeInteger(v.seconds) && Number.isSafeInteger(v.nanoseconds) ? { seconds: Number(v.seconds), nanoseconds: Number(v.nanoseconds) } : null;
}

function hasExactly(d: Record<string, unknown>, keys: string[]): boolean {
  const own = Object.keys(d);
  return own.length === keys.length && keys.every((k) => own.includes(k));
}

const moment = (at: unknown, server: unknown): Moment | null => {
  const s = serverTime(server);
  return typeof at === "string" && SCENARIO.test(at) && s ? { at, server: s } : null;
};

export function sameMoment(a: Moment, b: Moment): boolean {
  return compareMoments(a, b) === 0;
}

export function parseWeekResult(value: unknown, sessionId: string, teamId: string, weekId: string): WeekResult {
  if (!value || typeof value !== "object") throw new WeekResultFormatError(FORMAT);
  const d = value as Record<string, unknown>;
  const first = moment(d.firstReachedAt, d.firstReachedSyncedAt);
  const current = moment(d.reachedAt, d.reachedSyncedAt);
  if (!hasExactly(d, RESULT_KEYS) || d.sessionId !== sessionId || d.teamId !== teamId || d.weekId !== weekId
    || !first || !current || compareMoments(current, first) > 0 || typeof d.reachingEntryId !== "string"
    || !Number.isSafeInteger(d.revision) || Number(d.revision) < 0 || (Number(d.revision) === 0) !== sameMoment(first, current)) {
    throw new WeekResultFormatError(FORMAT);
  }
  return { sessionId, teamId, weekId, first, current, reachingEntryId: d.reachingEntryId, revision: Number(d.revision) };
}

export function parseAward(value: unknown, sessionId: string, weekId: string, memberId: string): ChestAward {
  if (!value || typeof value !== "object") throw new WeekResultFormatError(FORMAT);
  const d = value as Record<string, unknown>;
  const at = moment(d.reachedAt, d.reachedSyncedAt);
  if (!hasExactly(d, AWARD_KEYS) || d.sessionId !== sessionId || d.weekId !== weekId || d.memberId !== memberId
    || typeof d.teamId !== "string" || !TEAM_ID.test(d.teamId) || !at
    || !Number.isSafeInteger(d.joinRevision) || Number(d.joinRevision) < 0 || !Number.isSafeInteger(d.leaveRevision) || Number(d.leaveRevision) < 0
    || (d.basis !== "first" && d.basis !== "reissue")) {
    throw new WeekResultFormatError(FORMAT);
  }
  return { sessionId, weekId, memberId, teamId: d.teamId, at, joinRevision: Number(d.joinRevision), leaveRevision: Number(d.leaveRevision), basis: d.basis };
}

// ----- Who was in the team at M (from team events only; clients cannot read other members' indexes) -----

/** A member's latest stint in the team; `start` null means the founder since creation (creation time unknown). */
export interface Stint {
  memberId: string;
  joinRevision: number;
  leaveRevision: number;
  start: Moment | null;
  end: Moment | null;
}

const momentOf = (e: TeamEventLite): Moment => ({ at: e.effectiveAt, server: e.serverRecordedAt });

/**
 * Rebuilds each member's latest stint. The founder has no join event, so the roster is replayed
 * backwards from `memberIds` (join removes, leave adds back, transferCaptain is skipped) down to
 * revision 0, where exactly the founder must remain. Any inconsistency returns null (fail closed).
 * `events` must be revisions 1..N of the same team revision as `memberIds`. With `createdAt`, the
 * founder's stint starts at the creation (the Rules require M >= createdAt for the founder).
 */
export function latestStints(events: TeamEventLite[], memberIds: string[], createdAt?: string): Stint[] | null {
  const sorted = [...events].sort((a, b) => a.revision - b.revision);
  if (sorted.some((e, i) => e.revision !== i + 1)) return null;
  const roster = [...memberIds];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const e = sorted[i];
    const at = roster.indexOf(e.targetMemberId);
    if (e.type === "join") { if (at < 0) return null; roster.splice(at, 1); }
    else if (e.type === "leave") { if (at >= 0) return null; roster.push(e.targetMemberId); }
    else if (e.type !== "transferCaptain") return null; // cancelRecruiting: never formed, no week result
  }
  if (roster.length !== 1) return null;
  const founder = roster[0];
  const ids = new Set([founder, ...sorted.filter((e) => e.type === "join" || e.type === "leave").map((e) => e.targetMemberId)]);
  const stints: Stint[] = [];
  for (const memberId of ids) {
    const join = [...sorted].reverse().find((e) => e.type === "join" && e.targetMemberId === memberId);
    if (!join && memberId !== founder) return null;
    const from = join?.revision ?? 0;
    const leave = sorted.find((e) => e.type === "leave" && e.targetMemberId === memberId && e.revision > from);
    if (!leave && !memberIds.includes(memberId)) return null;
    stints.push({ memberId, joinRevision: from, leaveRevision: leave?.revision ?? 0, start: join ? momentOf(join) : createdAt ? { at: createdAt, server: { seconds: -1, nanoseconds: 0 } } : null, end: leave ? momentOf(leave) : null });
  }
  return stints.sort((a, b) => (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0));
}

/** Members in the team at M: started strictly before M and not gone until strictly after M. */
export function membersAt(stints: Stint[], m: Moment): Stint[] {
  return stints.filter((s) => (s.start === null || compareMoments(m, s.start) > 0) && (s.end === null || compareMoments(m, s.end) < 0));
}

// ----- Settlement plan -----

export interface Reaching { entryId: string; occurredAt: string; syncedAt: ServerTime }

export interface PendingAward { memberId: string; joinRevision: number; leaveRevision: number; at: Moment; basis: "first" | "reissue" }

export interface SettlementPlan {
  /** create: no record yet; advance: the replay reaches earlier than the record's Mc. */
  week: { action: "create" | "advance"; reaching: Reaching } | null;
  /** Awards still missing for the record as it is now (M1 first, then Mc). */
  awards: PendingAward[];
  /** Everyone eligible for the current record (M1 ∪ Mc); null without a record or a consistent history. */
  eligible: string[] | null;
}

export function settlementPlan(record: WeekResult | null, reaching: Reaching | null, awarded: Set<string>, stints: Stint[] | null): SettlementPlan {
  const replayAt = reaching ? { at: reaching.occurredAt, server: reaching.syncedAt } : null;
  const week = reaching && replayAt && (!record || compareMoments(replayAt, record.current) < 0)
    ? { action: record ? "advance" as const : "create" as const, reaching } : null;
  if (!record || !stints) return { week, awards: [], eligible: null };
  const first = membersAt(stints, record.first);
  const current = sameMoment(record.first, record.current) ? [] : membersAt(stints, record.current);
  const awards: PendingAward[] = [];
  const seen = new Set<string>();
  // Eligible at both moments: always M1 (deterministic, and an M1 award never goes stale).
  for (const s of first) { seen.add(s.memberId); if (!awarded.has(s.memberId)) awards.push({ memberId: s.memberId, joinRevision: s.joinRevision, leaveRevision: s.leaveRevision, at: record.first, basis: "first" }); }
  for (const s of current) {
    if (seen.has(s.memberId)) continue;
    seen.add(s.memberId);
    if (!awarded.has(s.memberId)) awards.push({ memberId: s.memberId, joinRevision: s.joinRevision, leaveRevision: s.leaveRevision, at: record.current, basis: "reissue" });
  }
  return { week, awards, eligible: [...seen].sort() };
}

/** The viewer's own award line: null when there is nothing definite to say. */
export function ownAwardStatus(selfId: string, record: WeekResult | null, awarded: Set<string>, eligible: string[] | null): "awarded" | "pending" | "not-in-team" | null {
  if (awarded.has(selfId)) return "awarded";
  if (!record || !eligible) return null;
  return eligible.includes(selfId) ? "pending" : "not-in-team";
}

/**
 * "About N steps per person per day for the rest of this week" (today included). Only for a formed,
 * active team of the current week that has not reached the target.
 */
export function dailyNeed(total: number, target: number, today: string, weekId: string, memberCount: number, status: string): number | null {
  if (status !== "active" || memberCount < 2 || total >= target || !DATE.test(today) || weekOfTaskDate(today) !== weekId) return null;
  const elapsed = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${weekId}T00:00:00Z`)) / 86_400_000);
  const daysLeft = 7 - elapsed;
  return Math.ceil((target - total) / daysLeft / memberCount);
}
