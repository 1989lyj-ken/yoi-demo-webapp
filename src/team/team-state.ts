import { activityWeekOf } from "./activity-week.ts";

export type TeamStatus = "recruiting" | "active" | "paused" | "archived";

/** Canonical FSD-03B team document (11 fields). */
export interface TeamState {
  sessionId: string;
  teamId: string;
  leaderMemberId: string | null;
  memberIds: string[];
  inviteCode: string;
  status: TeamStatus;
  clockVersion: number;
  createdAt: string;
  everFormed: boolean;
  nextJoinOrder: number;
  revision: number;
}

/** Canonical FSD-03B member index (10 fields); `left` is the tombstone that carries the week lock. */
export interface MembershipState {
  sessionId: string;
  memberId: string;
  teamId: string | null;
  joinOrder: number;
  clockVersion: number;
  status: "active" | "left";
  joinedAt: string | null;
  leftTeamId: string | null;
  leftWeekId: string | null;
  leftAt: string | null;
}

export class TeamFormatError extends Error {}

const TEAM_KEYS = ["sessionId", "teamId", "leaderMemberId", "memberIds", "inviteCode", "status", "clockVersion", "createdAt", "everFormed", "nextJoinOrder", "revision"];
const MEMBERSHIP_KEYS = ["sessionId", "memberId", "teamId", "joinOrder", "clockVersion", "status", "joinedAt", "leftTeamId", "leftWeekId", "leftAt"];
const FORMAT_HINT = "隊伍資料格式不符，請由管理者重設場次。";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isInt = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const isStringOrNull = (value: unknown): value is string | null => value === null || typeof value === "string";
const hasExactKeys = (data: Record<string, unknown>, keys: string[]) => {
  const present = Object.keys(data);
  return present.length === keys.length && keys.every((key) => present.includes(key));
};
const fail = (): never => { throw new TeamFormatError(FORMAT_HINT); };

/** Strictly parses a stored team: exactly the 11 canonical fields and the invariants the Rules keep. */
export function parseTeam(value: unknown, sessionId: string, teamId: string): TeamState {
  if (!value || typeof value !== "object") return fail();
  const d = value as Record<string, unknown>;
  if (!hasExactKeys(d, TEAM_KEYS)) return fail();
  const ids = d.memberIds;
  if (d.sessionId !== sessionId || d.teamId !== teamId || d.inviteCode !== teamId || !/^[A-F0-9]{16}$/.test(teamId)
    || !isStringOrNull(d.leaderMemberId) || !Array.isArray(ids) || ids.length > 5
    || ids.some((id) => typeof id !== "string") || new Set(ids).size !== ids.length
    || !["recruiting", "active", "paused", "archived"].includes(String(d.status))
    || !isInt(d.clockVersion) || typeof d.createdAt !== "string"
    || typeof d.everFormed !== "boolean" || !isInt(d.nextJoinOrder) || !isInt(d.revision)
    || d.nextJoinOrder < ids.length) return fail();
  const members = ids as string[];
  const status = d.status as TeamStatus;
  const leader = d.leaderMemberId;
  const ok = status === "archived" ? members.length === 0 && leader === null
    : members.length >= 1 && typeof leader === "string" && members.includes(leader)
      && (status === "recruiting" ? members.length === 1 && d.everFormed === false
        : status === "paused" ? members.length === 1 && d.everFormed === true
          : members.length >= 2 && d.everFormed === true);
  if (!ok) return fail();
  return d as unknown as TeamState;
}

/** Strictly parses a stored member index: exactly the 10 canonical fields, active/left shapes kept apart. */
export function parseMembership(value: unknown, sessionId: string, memberId: string): MembershipState {
  if (!value || typeof value !== "object") return fail();
  const d = value as Record<string, unknown>;
  if (!hasExactKeys(d, MEMBERSHIP_KEYS)) return fail();
  if (d.sessionId !== sessionId || d.memberId !== memberId || !isInt(d.joinOrder) || !isInt(d.clockVersion)
    || !isStringOrNull(d.teamId) || !isStringOrNull(d.joinedAt) || !isStringOrNull(d.leftTeamId)
    || !isStringOrNull(d.leftWeekId) || !isStringOrNull(d.leftAt)
    || (d.leftWeekId !== null && !DATE.test(String(d.leftWeekId)))) return fail();
  const ok = d.status === "active"
    ? typeof d.teamId === "string" && typeof d.joinedAt === "string" && d.leftTeamId === null && d.leftWeekId === null && d.leftAt === null
    : d.status === "left" && d.teamId === null && typeof d.leftTeamId === "string" && typeof d.leftAt === "string";
  if (!ok) return fail();
  return d as unknown as MembershipState;
}

/** The Monday after `weekId` (an Asia/Taipei Monday date), computed in UTC so the device time zone never matters. */
export function nextMonday(weekId: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekId);
  if (!match) throw new Error("活動週格式錯誤。");
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (day.toISOString().slice(0, 10) !== weekId) throw new Error("活動週格式錯誤。");
  day.setUTCDate(day.getUTCDate() + 7);
  return day.toISOString().slice(0, 10);
}

export type WeekState = "ok" | "missing" | "mismatch";

/** Non-throwing counterpart of requireActivityWeek: the shared week must exist and match the scenario date. */
export function weekStateOf(context: { scenarioNow: string; activityWeekId?: string | null }): WeekState {
  if (!context.activityWeekId) return "missing";
  try { return activityWeekOf(context.scenarioNow) === context.activityWeekId ? "ok" : "mismatch"; } catch { return "mismatch"; }
}

export interface MemberLock {
  locked: boolean;
  reason: "sameWeek" | "noWeek" | null;
  unlockDate: string | null;
}

/**
 * Mirrors the Rules' canJoin: a tombstone with a week blocks creating or joining while the shared week
 * is missing (fail closed) or equal to the week of leaving; a cancelled recruitment (null week) never blocks.
 */
export function memberLock(tombstone: { leftWeekId: string | null } | null, activityWeekId: string | null | undefined): MemberLock {
  if (!tombstone || tombstone.leftWeekId === null) return { locked: false, reason: null, unlockDate: null };
  if (!activityWeekId) return { locked: true, reason: "noWeek", unlockDate: null };
  if (tombstone.leftWeekId === activityWeekId) return { locked: true, reason: "sameWeek", unlockDate: nextMonday(activityWeekId) };
  return { locked: false, reason: null, unlockDate: null };
}

/** Leaving an unformed recruitment cancels it (no lock); anything that ever formed is a real leave (locks the week). */
export function leaveMode(team: Pick<TeamState, "everFormed">): "cancel" | "leave" {
  return team.everFormed ? "leave" : "cancel";
}

/** The member who becomes captain if the leader leaves: the first remaining member in join order. */
export function successorOf(team: Pick<TeamState, "memberIds">, selfId: string): string | null {
  return team.memberIds.filter((id) => id !== selfId)[0] ?? null;
}

export interface LeaveExpectation { teamId: string; everFormed: boolean; leaderMemberId: string | null; firstMemberId: string | null }
export interface TransferExpectation { teamId: string; revision: number }

/** What the open confirmation dialog promised; leaving does not depend on revision, so a join does not interrupt it. */
export function leaveExpectation(team: TeamState): LeaveExpectation {
  return { teamId: team.teamId, everFormed: team.everFormed, leaderMemberId: team.leaderMemberId, firstMemberId: team.memberIds[0] ?? null };
}

export function matchesLeaveExpectation(team: TeamState, expected: LeaveExpectation): boolean {
  const now = leaveExpectation(team);
  return now.teamId === expected.teamId && now.everFormed === expected.everFormed
    && now.leaderMemberId === expected.leaderMemberId && now.firstMemberId === expected.firstMemberId;
}

export function transferExpectation(team: TeamState): TransferExpectation {
  return { teamId: team.teamId, revision: team.revision };
}

export function matchesTransferExpectation(team: TeamState, expected: TransferExpectation): boolean {
  return team.teamId === expected.teamId && team.revision === expected.revision;
}

/**
 * Result of rereading the server after an unconfirmed write.
 * - effective: this operation (or its aftermath) is visible.
 * - not-effective: provably nothing changed; the member may start over (re-confirm), never auto-resend.
 * - changed: state moved on (own earlier write, another member's write, or a later own action); only refresh the screen.
 */
export type Outcome = "effective" | "not-effective" | "changed";

export function leaveOutcome(membership: MembershipState | null, before: { teamId: string }): Outcome {
  if (membership && membership.status === "left" && membership.leftTeamId === before.teamId) return "effective";
  if (membership && membership.status === "active" && membership.teamId === before.teamId) return "not-effective";
  return "changed";
}

/** Uses the monotonic revision, never "leader equals target": later transfers or leaves would make that lie. */
export function transferOutcome(membership: MembershipState | null, team: TeamState | null, before: TransferExpectation): Outcome {
  if (membership && membership.status === "active" && membership.teamId === before.teamId && team
    && team.teamId === before.teamId && team.revision === before.revision) return "not-effective";
  return "changed";
}

export function joinOutcome(membership: MembershipState | null, targetTeamId: string): Outcome {
  if (membership && membership.status === "active" && membership.teamId === targetTeamId) return "effective";
  if (membership && membership.status === "left" && membership.leftTeamId === targetTeamId) return "changed";
  return "not-effective";
}

export type TeamErrorKind = "unconfirmed" | "precondition" | "other";

const UNCONFIRMED_CODES = new Set(["permission-denied", "aborted", "unavailable", "deadline-exceeded", "unknown", "internal", "cancelled"]);

/**
 * `permission-denied` is the same code whether a transaction read or its commit was rejected, so the
 * phase decides: a rejected read means the data is not available to this member (a precondition),
 * and only a commit-phase failure may have landed.
 */
export function classifyTeamError(code: string | undefined, phase: "read" | "commit"): TeamErrorKind {
  if (code === undefined || !UNCONFIRMED_CODES.has(code)) return "other";
  if (phase === "read") return code === "permission-denied" ? "precondition" : "unconfirmed";
  return "unconfirmed";
}

export interface TeamControlsInput {
  confirmed: boolean;
  busy: boolean;
  selfId: string;
  context: { scenarioNow: string; activityWeekId?: string | null };
  team: TeamState | null;
  tombstone: { leftWeekId: string | null } | null;
}

export interface TeamControls {
  canCreateJoin: boolean;
  canLeave: boolean;
  canTransfer: boolean;
  leaveMode: "cancel" | "leave" | null;
  notice: string | null;
}

/** Everything the buttons need, derived only from server-confirmed state; the Rules remain the guarantee. */
export function teamControls(input: TeamControlsInput): TeamControls {
  const week = weekStateOf(input.context);
  const idle = input.confirmed && !input.busy;
  const team = input.team;
  if (!team) {
    const lock = memberLock(input.tombstone, input.context.activityWeekId);
    let notice: string | null = null;
    if (lock.reason === "sameWeek") notice = `您本週已退出正式隊伍，下週一（${lock.unlockDate}）才能重新組隊或加入。`;
    else if (lock.reason === "noWeek") notice = "管理者尚未設定活動週，暫時無法建立或加入隊伍。";
    return { canCreateJoin: idle && !lock.locked, canLeave: false, canTransfer: false, leaveMode: null, notice };
  }
  const weekNotice = week === "missing" ? "管理者尚未設定活動週；取消招募、退出與更換隊長暫停。"
    : week === "mismatch" ? "活動週與情境日期不一致；請聯絡管理者修正。取消招募、退出與更換隊長暫停。" : null;
  const operable = idle && week === "ok" && team.status !== "archived";
  return {
    canCreateJoin: false,
    canLeave: operable && team.memberIds.includes(input.selfId),
    canTransfer: operable && team.leaderMemberId === input.selfId && team.memberIds.length >= 2,
    leaveMode: leaveMode(team),
    notice: weekNotice,
  };
}

export interface DialogCopy { title: string; body: string; dismissLabel: string; confirmLabel: string }

/** Confirmation text (PRD §6.1.1 fixed wording plus the contract's "chests come later" line; contributions are live since 03C-1). */
export function leaveDialogCopy(team: TeamState, selfId: string, context: { activityWeekId?: string | null }, hasAward = false,
  nameOf: (memberId: string) => string | null = () => null): DialogCopy {
  if (leaveMode(team) === "cancel") {
    return { title: "取消這次招募？", body: "隊伍會封存，邀請碼失效。您可以馬上建立新隊伍。", dismissLabel: "保留招募", confirmLabel: "取消招募" };
  }
  // FSD-03C-2: someone who already holds this week's chest award keeps it after leaving.
  const parts = [hasAward ? "已貢獻的步數會保留；您已取得本週寶箱資格，退團後仍保留。" : "已貢獻的步數會保留、尚未取得的寶箱資格可能失去。"];
  const unlock = context.activityWeekId ? nextMonday(context.activityWeekId) : null;
  parts.push(unlock ? `本週不能再加入或建立隊伍（下週一 ${unlock} 起可以）。` : "本週不能再加入或建立隊伍。");
  parts.push("您的個人每日點數不受影響。");
  if (team.leaderMemberId === selfId) {
    const next = successorOf(team, selfId);
    // FSD-08A-6: the successor's display name (a confirmed one only; never the memberId).
    parts.push(next ? `您是隊長，退出後由 ${nameOf(next) ?? "下一位隊員"} 接任。` : "退出後隊伍會封存。");
  }
  return { title: "退出隊伍？", body: parts.join(""), dismissLabel: "先不要", confirmLabel: "確認退出" };
}

export function transferPickCopy(): DialogCopy {
  return { title: "更換隊長", body: "選擇一位現有隊員接任隊長。您會變成一般隊員。", dismissLabel: "先不要", confirmLabel: "下一步" };
}

/** `targetName` is the text shown for the chosen member (display name or memberId, FSD-AC1); the views escape it. */
export function transferConfirmCopy(targetName: string): DialogCopy {
  return { title: `把隊長交給 ${targetName}？`, body: "您會變成一般隊員，步數、週期與獎勵資格都不變。",
    dismissLabel: "先不要", confirmLabel: "確認交棒" };
}
