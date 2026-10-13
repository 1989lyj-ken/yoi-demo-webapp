/** FSD-01C canonical daily document, minus the server audit field `lastSyncedAt`. */
export interface DailyState {
  sessionId: string;
  memberId: string;
  taskDate: string;
  clockVersion: number;
  rawSteps: number;
  effectiveSteps: number;
  rideCompletedAt: string | null;
  claimed: number;
  eventSeq: number;
}

export type DailyDay = "today" | "yesterday";

const DAILY_KEYS = ["sessionId", "memberId", "taskDate", "clockVersion", "rawSteps", "effectiveSteps", "rideCompletedAt", "claimed", "eventSeq", "lastSyncedAt"];

export class DailyFormatError extends Error {}

export function effectiveStepsOf(rawSteps: number, rideCompletedAt: string | null): number {
  return Math.floor(rawSteps * (rideCompletedAt === null ? 1 : 1.5));
}

export function unlockedPoints(effectiveSteps: number): number {
  return Math.min(3, Math.floor(effectiveSteps / 2000));
}

/** Points unlocked on this task day but not claimed yet. */
export function claimablePoints(state: DailyState): number {
  return Math.max(0, unlockedPoints(state.effectiveSteps) - state.claimed);
}

/** The Asia/Taipei calendar day before `taskDate`, computed in UTC so the device time zone never matters. */
export function previousTaskDate(taskDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(taskDate);
  if (!match) throw new Error("任務日格式錯誤。");
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (day.toISOString().slice(0, 10) !== taskDate) throw new Error("任務日格式錯誤。");
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

/**
 * Strictly parses a stored daily document. Earlier FSD-01A/01B shapes are refused rather than
 * upgraded: a session only ever holds the canonical schema (new sessions only, no migration).
 */
export function parseDaily(data: unknown, expected: Pick<DailyState, "sessionId" | "memberId" | "taskDate">): DailyState {
  if (typeof data !== "object" || data === null) throw new DailyFormatError("每日資料格式錯誤。");
  const d = data as Record<string, unknown>;
  const keys = Object.keys(d);
  if (keys.length !== DAILY_KEYS.length || !DAILY_KEYS.every((key) => keys.includes(key))) {
    throw new DailyFormatError("每日資料格式不符（可能是舊場次格式），請由管理者重設場次。");
  }
  const ints = [d.clockVersion, d.rawSteps, d.effectiveSteps, d.claimed, d.eventSeq];
  const ride = d.rideCompletedAt;
  // lastSyncedAt is a server Timestamp; a pending local write may still show null.
  if (d.sessionId !== expected.sessionId || d.memberId !== expected.memberId || d.taskDate !== expected.taskDate
    || !ints.every((value) => Number.isSafeInteger(value) && Number(value) >= 0)
    || (ride !== null && (typeof ride !== "string" || !ride.startsWith(`${expected.taskDate}T`)))
    || (d.lastSyncedAt !== null && typeof d.lastSyncedAt !== "object")) throw new DailyFormatError("每日資料格式錯誤。");
  const state = {
    sessionId: expected.sessionId, memberId: expected.memberId, taskDate: expected.taskDate,
    clockVersion: Number(d.clockVersion), rawSteps: Number(d.rawSteps), effectiveSteps: Number(d.effectiveSteps),
    rideCompletedAt: ride as string | null, claimed: Number(d.claimed), eventSeq: Number(d.eventSeq),
  };
  if (state.rawSteps > 1_000_000 || state.effectiveSteps !== effectiveStepsOf(state.rawSteps, state.rideCompletedAt)
    || state.claimed > 3 || state.claimed * 2000 > state.effectiveSteps) throw new DailyFormatError("每日資料格式錯誤。");
  return state;
}

/**
 * True only when `candidate` is at least as new as `previous`. Every write advances eventSeq by one,
 * so it orders states of one document; clockVersion is not compared because a document written
 * yesterday legitimately carries an older clock than today's page.
 */
export function dailyStateDominates(candidate: DailyState, previous: DailyState): boolean {
  const rideIsAtLeastAsNew = previous.rideCompletedAt === null || candidate.rideCompletedAt === previous.rideCompletedAt;
  return candidate.sessionId === previous.sessionId
    && candidate.memberId === previous.memberId
    && candidate.taskDate === previous.taskDate
    && candidate.eventSeq >= previous.eventSeq
    && candidate.rawSteps >= previous.rawSteps
    && candidate.effectiveSteps >= previous.effectiveSteps
    && candidate.claimed >= previous.claimed
    && rideIsAtLeastAsNew;
}

/**
 * FSD-AC1 R1: the save / catch-up button is enabled only for a whole number from 0 to 1,000,000 that is
 * greater than the server-confirmed steps. A UX rule only: the Rules still accept any legal increase.
 */
export function canSubmitSteps(value: string, confirmed: number): { ok: boolean; hint: string } {
  const text = value.trim();
  if (!/^\d+$/.test(text) || Number(text) > 1_000_000) return { ok: false, hint: "請輸入 0 到 1,000,000 的整數。" };
  const steps = Number(text);
  if (steps > confirmed) return { ok: true, hint: "" };
  return { ok: false, hint: steps < confirmed ? `步數只能增加，請輸入大於 ${confirmed.toLocaleString()} 的數字。` : "" };
}
