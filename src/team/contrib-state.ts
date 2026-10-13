import { previousTaskDate } from "../daily/daily-state.ts";
import { isFirebaseError } from "../firebase/error-kind.ts";

/** Firestore Timestamp shape (seconds + nanoseconds); compared exactly, never through floats. */
export interface ServerTime { seconds: number; nanoseconds: number }

/** One FSD-03C-1 ledger entry (create-only; one per step/ride event). */
export interface ContribEntry {
  sessionId: string;
  teamId: string;
  weekId: string;
  memberId: string;
  taskDate: string;
  seq: number;
  kind: "steps" | "ride";
  eligibleRawDelta: number;
  occurredAt: string;
  syncedAt: ServerTime;
  joinRevision: number;
}

/** A team event as needed here (FSD-03B events/{revision}). */
export interface TeamEventLite {
  revision: number;
  type: "join" | "leave" | "cancelRecruiting" | "transferCaptain";
  targetMemberId: string;
  effectiveAt: string;
  serverRecordedAt: ServerTime;
}

export class ContribFormatError extends Error {}

export const TEAM_WEEK_TARGET = 300_000;
const ENTRY_KEYS = ["sessionId", "teamId", "weekId", "memberId", "taskDate", "seq", "kind", "eligibleRawDelta", "occurredAt", "syncedAt", "joinRevision", "recordedAt"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SCENARIO = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\+08:00$/;

export function entryIdOf(memberId: string, taskDate: string, seq: number): string {
  return `${memberId}_${taskDate}_${seq}`;
}

/** Monday (Asia/Taipei calendar date) of the week containing `taskDate`, in UTC arithmetic. */
export function weekOfTaskDate(taskDate: string): string {
  if (!DATE.test(taskDate)) throw new Error("任務日格式錯誤。");
  const day = new Date(`${taskDate}T00:00:00Z`);
  if (day.toISOString().slice(0, 10) !== taskDate) throw new Error("任務日格式錯誤。");
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

/** Current week and, on a Monday (previous week still open for catch-up), the previous week too. */
export function visibleWeeks(today: string): { current: string; previous: string | null } {
  const current = weekOfTaskDate(today);
  return { current, previous: today === current ? weekOfTaskDate(previousTaskDate(today)) : null };
}

const NETWORK_CODES = new Set(["unavailable", "deadline-exceeded", "aborted", "unknown", "internal", "cancelled"]);

/** A network-type failure cannot say whether anything landed (pending); everything else is a refusal. */
export function classifyFailure(error: unknown): "unconfirmed" | "refused" {
  return isFirebaseError(error) && NETWORK_CODES.has(error.code) ? "unconfirmed" : "refused";
}

function asServerTime(value: unknown): ServerTime | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return Number.isSafeInteger(v.seconds) && Number.isSafeInteger(v.nanoseconds) ? { seconds: Number(v.seconds), nanoseconds: Number(v.nanoseconds) } : null;
}

export function compareServerTime(a: ServerTime, b: ServerTime): number {
  return a.seconds !== b.seconds ? a.seconds - b.seconds : a.nanoseconds - b.nanoseconds;
}

/** Strictly parses a stored entry; anything else is refused (a session only holds this schema). */
export function parseEntry(value: unknown, sessionId: string, teamId: string, entryId: string): ContribEntry {
  if (!value || typeof value !== "object") throw new ContribFormatError("團隊貢獻資料格式不符，請由管理者重設場次。");
  const d = value as Record<string, unknown>;
  const keys = Object.keys(d);
  const syncedAt = asServerTime(d.syncedAt);
  if (keys.length !== ENTRY_KEYS.length || !ENTRY_KEYS.every((k) => keys.includes(k))
    || d.sessionId !== sessionId || d.teamId !== teamId || typeof d.memberId !== "string" || d.memberId.includes("_")
    || typeof d.taskDate !== "string" || !DATE.test(d.taskDate) || !Number.isSafeInteger(d.seq) || Number(d.seq) < 1
    || entryId !== entryIdOf(d.memberId, d.taskDate, Number(d.seq)) || d.weekId !== weekOfTaskDate(d.taskDate)
    || (d.kind !== "steps" && d.kind !== "ride") || !Number.isSafeInteger(d.eligibleRawDelta) || Number(d.eligibleRawDelta) < 0
    || (d.kind === "ride" && d.eligibleRawDelta !== 0) || typeof d.occurredAt !== "string" || !SCENARIO.test(d.occurredAt)
    || !syncedAt || !Number.isSafeInteger(d.joinRevision) || Number(d.joinRevision) < 0) {
    throw new ContribFormatError("團隊貢獻資料格式不符，請由管理者重設場次。");
  }
  return { sessionId, teamId, weekId: d.weekId as string, memberId: d.memberId, taskDate: d.taskDate, seq: Number(d.seq),
    kind: d.kind, eligibleRawDelta: Number(d.eligibleRawDelta), occurredAt: d.occurredAt, syncedAt, joinRevision: Number(d.joinRevision) };
}

// ----- Ordering of moments: scenario time first, then server time (B1) -----

export interface Moment { at: string; server: ServerTime }

export function compareMoments(a: Moment, b: Moment): number {
  if (a.at !== b.at) return a.at < b.at ? -1 : 1;
  return compareServerTime(a.server, b.server);
}

const momentOf = (e: TeamEventLite): Moment => ({ at: e.effectiveAt, server: e.serverRecordedAt });

export interface ActiveInterval { start: Moment; end: Moment | null }

/**
 * Rebuilds the periods in which the team was formed and not paused, from its events (FSD-03B: a
 * team starts with one member at revision 0; join adds, leave removes, cancelRecruiting archives).
 */
export function activeIntervals(events: TeamEventLite[]): ActiveInterval[] {
  const sorted = [...events].sort((a, b) => a.revision - b.revision);
  const out: ActiveInterval[] = [];
  let count = 1;
  for (const e of sorted) {
    const before = count;
    if (e.type === "join") count += 1;
    else if (e.type === "leave") count -= 1;
    else if (e.type === "cancelRecruiting") count = 0;
    if (before < 2 && count >= 2) out.push({ start: momentOf(e), end: null });
    else if (before >= 2 && count < 2 && out.length > 0) out[out.length - 1].end = momentOf(e);
  }
  return out;
}

const inside = (m: Moment, i: ActiveInterval) => compareMoments(m, i.start) > 0 && (i.end === null || compareMoments(m, i.end) < 0);

/** A pause is a gap between two active intervals, or after the last one ended; before formation is not a pause. */
function inPause(m: Moment, intervals: ActiveInterval[]): boolean {
  return intervals.some((interval, i) => interval.end !== null && compareMoments(m, interval.end) >= 0
    && (i + 1 >= intervals.length || compareMoments(m, intervals[i + 1].start) <= 0));
}

export interface EligibilityInput {
  kind: "steps" | "ride";
  occurredAt: string;
  syncedAt: ServerTime;
  taskDate: string;
  /** Today's task date (Asia/Taipei) from the shared scenario clock. */
  today: string;
  selfId: string;
  membership: { status: "active" | "left"; teamId: string | null; leftTeamId: string | null; joinOrder: number; joinedAt: string | null; leftAt: string | null } | null;
  team: { teamId: string; status: string; everFormed: boolean; createdAt: string; revision: number } | null;
  /** All team events 1..revision; null when this member may not read them (a departed member). */
  events: TeamEventLite[] | null;
}

export interface Eligibility { eligible: boolean; teamId: string | null; joinRevision: number; reason: string }

const no = (reason: string): Eligibility => ({ eligible: false, teamId: null, joinRevision: 0, reason });

/** Mirrors the Rules' `taskDate >= joinedAt.split('T')[0]` (string comparison of ISO dates). */
const rideOnOrAfterJoinDay = (taskDate: string, joinedAt: string | null) => joinedAt !== null && taskDate >= joinedAt.split("T")[0];

/**
 * Client-side decision before writing an entry: the PRD's exact rule (no backfill of a paused period)
 * AND the Rules' known conservative limits (today/yesterday window, latest stint only, strict leftAt,
 * team formed now). By construction, eligible here implies accepted by the Rules.
 */
export function contributionEligibility(input: EligibilityInput): Eligibility {
  if (input.taskDate !== input.today && input.taskDate !== previousTaskDate(input.today)) return no("窗口外");
  const m = input.membership;
  if (!m) return no("不在隊伍中");
  const at: Moment = { at: input.occurredAt, server: input.syncedAt };
  if (m.status === "left") {
    // A departed member cannot read team events: attempt with a conservative bound (ruling N1 (c)).
    if (!m.leftTeamId || !m.leftAt || !(input.occurredAt < m.leftAt)) return no("退團後的片段");
    if (input.kind === "ride" && !rideOnOrAfterJoinDay(input.taskDate, m.joinedAt)) return no("入隊日前的乘車");
    if (input.kind === "steps" && !(m.joinOrder === 0) && !(m.joinedAt !== null && input.occurredAt > m.joinedAt)) return no("入隊前的片段");
    return { eligible: true, teamId: m.leftTeamId, joinRevision: 0, reason: "已退團者退團前的片段" };
  }
  const team = input.team;
  if (!m.teamId || !team || team.teamId !== m.teamId) return no("不在隊伍中");
  if (!team.everFormed || (team.status !== "active" && team.status !== "paused") || !input.events) return no("隊伍未成團");
  const events = input.events;
  if (events.find((e) => e.revision === 1)?.type !== "join") return no("隊伍未成團");
  const intervals = activeIntervals(events);
  if (input.kind === "ride") {
    // Ruling b1: no start moment for a ride, but not before the join day (one ride, one team); a pause excludes it.
    if (!rideOnOrAfterJoinDay(input.taskDate, m.joinedAt)) return no("入隊日前的乘車");
    return inPause(at, intervals) ? no("暫停期間的乘車") : { eligible: true, teamId: team.teamId, joinRevision: 0, reason: "乘車" };
  }
  if (!intervals.some((interval) => inside(at, interval))) return no("成團前或暫停期間的片段");
  const founder = m.joinOrder === 0 && m.joinedAt === team.createdAt;
  if (founder) return { eligible: true, teamId: team.teamId, joinRevision: 0, reason: "創辦人" };
  const join = [...events].reverse().find((e) => e.type === "join" && e.targetMemberId === input.selfId && e.effectiveAt === m.joinedAt);
  if (!join) return no("找不到入隊紀錄");
  if (compareMoments(at, momentOf(join)) <= 0) return no("入隊前的片段");
  return { eligible: true, teamId: team.teamId, joinRevision: join.revision, reason: "在隊期間" };
}

// ----- Replay -----

export interface MemberWeek { memberId: string; contribution: number }
export interface TeamWeek {
  weekId: string;
  total: number;
  members: MemberWeek[];
  /** First moment the cumulative total reached the target (display only; not a settlement). */
  reachedAt: string | null;
  /** The entry that reached the target (FSD-03C-2 records it as the week result's M). */
  reaching: { entryId: string; occurredAt: string; syncedAt: ServerTime } | null;
  /** 2026-10-06: team-counted steps per `memberId|taskDate` (only what the ledger credited, i.e. after forming). */
  memberDays: Record<string, number>;
}

function compareEntries(a: ContribEntry, b: ContribEntry): number {
  return compareMoments({ at: a.occurredAt, server: a.syncedAt }, { at: b.occurredAt, server: b.syncedAt })
    || (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0)
    || (a.taskDate < b.taskDate ? -1 : a.taskDate > b.taskDate ? 1 : 0)
    || a.seq - b.seq;
}

/**
 * Deterministic replay of one week (any input order). Per member-day: eff = floor(raw × (ride ? 1.5 : 1));
 * a step adds its eligible raw, a ride switches the bonus on once at its own moment (never earlier).
 */
export function replayTeamWeek(entries: ContribEntry[], weekId: string, target = TEAM_WEEK_TARGET): TeamWeek {
  const unique = new Map<string, ContribEntry>();
  for (const e of entries) if (e.weekId === weekId) unique.set(entryIdOf(e.memberId, e.taskDate, e.seq), e);
  const ordered = [...unique.values()].sort(compareEntries);
  const days = new Map<string, { raw: number; bonus: boolean }>();
  const byMember = new Map<string, number>();
  const memberDays: Record<string, number> = Object.create(null);
  let total = 0;
  let reachedAt: string | null = null;
  let reaching: TeamWeek["reaching"] = null;
  for (const e of ordered) {
    const key = `${e.memberId}|${e.taskDate}`;
    const day = days.get(key) ?? { raw: 0, bonus: false };
    const before = Math.floor(day.raw * (day.bonus ? 1.5 : 1));
    if (e.kind === "steps") day.raw += e.eligibleRawDelta;
    else day.bonus = true;
    days.set(key, day);
    const delta = Math.floor(day.raw * (day.bonus ? 1.5 : 1)) - before;
    byMember.set(e.memberId, (byMember.get(e.memberId) ?? 0) + delta);
    memberDays[key] = (memberDays[key] ?? 0) + delta;
    total += delta;
    if (reachedAt === null && total >= target) {
      reachedAt = e.occurredAt;
      reaching = { entryId: entryIdOf(e.memberId, e.taskDate, e.seq), occurredAt: e.occurredAt, syncedAt: e.syncedAt };
    }
  }
  return { weekId, total, reachedAt, reaching, members: [...byMember.entries()].map(([memberId, contribution]) => ({ memberId, contribution })), memberDays };
}

/** Own step/ride events (today and yesterday) that have no entry yet; seq compared as numbers. */
export function missingCredits(ownEvents: { taskDate: string; seq: number; kind: string }[], credited: Set<string>, memberId: string): { taskDate: string; seq: number }[] {
  return ownEvents
    .filter((e) => (e.kind === "steps" || e.kind === "ride") && !credited.has(entryIdOf(memberId, e.taskDate, e.seq)))
    .sort((a, b) => (a.taskDate < b.taskDate ? -1 : a.taskDate > b.taskDate ? 1 : a.seq - b.seq))
    .map(({ taskDate, seq }) => ({ taskDate, seq }));
}

/**
 * FSD-AC1 R5: true when the team was created before the given week's Monday (it existed last week).
 * A malformed createdAt returns true so the page falls back to showing the previous week.
 */
export function teamCreatedBefore(createdAt: string, weekId: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/.test(createdAt)) return true;
  return createdAt.slice(0, 10) < weekId;
}

/** FSD-AC1 R5: hide the previous-week line only for a team created this week with nothing to show for last week. */
export function showPreviousWeek(createdAt: string, currentWeekId: string, previousTotal: number, hasOfficialResult: boolean): boolean {
  return teamCreatedBefore(createdAt, currentWeekId) || previousTotal !== 0 || hasOfficialResult;
}
