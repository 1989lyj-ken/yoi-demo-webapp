import { previousTaskDate } from "../daily/daily-state.ts";
import { weekOfTaskDate } from "../team/contrib-state.ts";

/** FSD-04A: a day counts with 6,000 effective steps (the ride bonus is 01C's). */
export const DAILY_TARGET = 6000;

/** What this block reads from a 01C daily document. */
export interface DayDoc { taskDate: string; effectiveSteps: number; claimed: number; eventSeq: number; /** UX-1010 F14: a ride counts this day. */ ride?: boolean }

/**
 * UX-1010 F14: the first day the member used the app, from the days this page reads (this week and last week):
 * the earliest day with a document. Days before it are "not started yet", never "missed". null: none of them.
 */
export function firstUseDay(days: readonly { taskDate: string; doc: DayDoc | null | undefined }[]): string | null {
  const used = days.filter((d) => d.doc).map((d) => d.taskDate).sort();
  return used[0] ?? null;
}

/** One weekly perfect-attendance ride coupon (create-only, one per member and week). */
export interface Coupon {
  sessionId: string;
  memberId: string;
  weekId: string;
  faceValue: number;
  minFare: number;
  issuedAt: string;
  expiresAt: string;
  clockVersion: number;
  kind: "weeklyPerfect";
}

export class CouponFormatError extends Error {}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SCENARIO = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\+08:00$/;
const COUPON_KEYS = ["sessionId", "memberId", "weekId", "faceValue", "minFare", "issuedAt", "expiresAt", "clockVersion", "recordedAt", "kind"];

/**
 * Adds days to a task date or a scenario time. Only the date part is moved (UTC calendar arithmetic);
 * the time of day and +08:00 are kept as they are. Never through Date.getTime()/toISOString() of the
 * whole value, which would switch to "Z" and move late-evening times to the next day.
 */
export function plusDays(value: string, days: number): string {
  const [date, time] = value.split("T");
  const match = DATE.exec(date);
  if (!match) throw new Error("日期格式錯誤。");
  const moved = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days)).toISOString().slice(0, 10);
  return time === undefined ? moved : `${moved}T${time}`;
}

/** The seven task dates (Monday..Sunday) of a week. */
export function weekDays(weekId: string): string[] {
  return Array.from({ length: 7 }, (_, i) => plusDays(weekId, i));
}

/** The week before (its Monday). */
export function previousWeek(weekId: string): string {
  return plusDays(weekId, -7);
}

export type DayStatus = "achieved" | "syncable" | "missed" | "future" | "unknown";

/**
 * achieved: confirmed with 6,000 effective steps. syncable: today or yesterday (still open for a sync)
 * and not achieved. missed: past the sync deadline and not achieved. future: after today. unknown: not
 * confirmed yet (`doc === undefined`). Uses only the scenario date (no local time zone).
 */
export function dayStatus(taskDate: string, doc: DayDoc | null | undefined, today: string): DayStatus {
  if (taskDate > today) return "future";
  if (doc === undefined) return "unknown";
  if (doc && doc.effectiveSteps >= DAILY_TARGET) return "achieved";
  return taskDate === today || taskDate === previousTaskDate(today) ? "syncable" : "missed";
}

export interface WeekVerdict {
  weekId: string;
  days: { taskDate: string; status: DayStatus }[];
  achievedCount: number;
  /** All seven days achieved (server-confirmed). FSD-04B: the points claimed no longer matter. */
  eligible: boolean;
  /** No coupon can ever be issued for this week any more. */
  closed: boolean;
  confirmed: boolean;
}

/** `docs[i]` is day i of the week: a confirmed document, null (confirmed absent) or undefined (unconfirmed). */
export function weekVerdict(weekId: string, docs: (DayDoc | null | undefined)[], today: string): WeekVerdict {
  const dates = weekDays(weekId);
  const days = dates.map((taskDate, i) => ({ taskDate, status: dayStatus(taskDate, docs[i], today) }));
  const confirmed = docs.length === 7 && docs.every((d) => d !== undefined);
  const achievedCount = days.filter((d) => d.status === "achieved").length;
  const eligible = confirmed && achievedCount === 7;
  // FSD-04B: only a day past its sync deadline closes the week (Sunday stays open until Monday 24:00).
  const closed = !eligible && days.some((d) => d.status === "missed");
  return { weekId, days, achievedCount, eligible, closed, confirmed };
}

/** The current week and the one before (both are always settled: FSD-04A Q1-A). */
export function settledWeeks(today: string): { current: string; previous: string } {
  const current = weekOfTaskDate(today);
  return { current, previous: previousWeek(current) };
}

/** Final-for-this-page key after a refusal: a later legal sync changes an eventSeq and allows a retry. */
export function finalKey(weekId: string, docs: (DayDoc | null | undefined)[]): string {
  return `${weekId}|${docs.map((d) => (d ? d.eventSeq : "-")).join(",")}`;
}

function serverTime(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Number.isSafeInteger(v.seconds) && Number.isSafeInteger(v.nanoseconds);
}

export function parseCoupon(value: unknown, sessionId: string, memberId: string, weekId: string): Coupon {
  const bad = () => new CouponFormatError("乘車券資料格式不符，請由管理者重設場次。");
  if (!value || typeof value !== "object") throw bad();
  const d = value as Record<string, unknown>;
  const keys = Object.keys(d);
  if (keys.length !== COUPON_KEYS.length || !COUPON_KEYS.every((k) => keys.includes(k))
    || d.sessionId !== sessionId || d.memberId !== memberId || d.weekId !== weekId || d.faceValue !== 50 || d.minFare !== 150
    || typeof d.issuedAt !== "string" || !SCENARIO.test(d.issuedAt) || typeof d.expiresAt !== "string" || !SCENARIO.test(d.expiresAt)
    || d.expiresAt !== plusDays(d.issuedAt, 30) || !Number.isSafeInteger(d.clockVersion) || d.kind !== "weeklyPerfect" || !serverTime(d.recordedAt)) {
    throw bad();
  }
  return { sessionId, memberId, weekId, faceValue: 50, minFare: 150, issuedAt: d.issuedAt, expiresAt: d.expiresAt, clockVersion: Number(d.clockVersion), kind: "weeklyPerfect" };
}

/** Fixed-format scenario times compare as strings (as validScenarioNow keeps them). */
export function couponActive(coupon: { expiresAt: string }, now: string): boolean {
  return now < coupon.expiresAt;
}

/** The simulated fare check of P21: whole non-negative NT$ amounts only; never redeems anything. */
/** FSD-07A: a referral coupon has no minimum fare (`minFare` null). */
export function canUse(coupon: { expiresAt: string; minFare: number | null }, fareInput: string, now: string): { ok: boolean; message: string } {
  const text = fareInput.trim();
  if (!/^\d{1,6}$/.test(text)) return { ok: false, message: "請輸入金額（整數）。" };
  if (!couponActive(coupon, now)) return { ok: false, message: "已過期，不能使用。" };
  if (coupon.minFare !== null && Number(text) < coupon.minFare) return { ok: false, message: `車資未達 NT$${coupon.minFare}，不能使用（試算）。` };
  return { ok: true, message: "可以使用（試算，不會實際核銷）。" };
}

export const promptKey = (sessionId: string, memberId: string, weekId: string) => `yoxi-coupon-seen:${sessionId}:${memberId}:${weekId}`;

/**
 * Which coupon the congratulation shows: of the coupons not seen yet on this device, only the latest
 * (the others are marked seen silently, so a new device never stacks several dialogs).
 */
export function promptPlan(coupons: Coupon[], seen: (coupon: Coupon) => boolean): { show: Coupon | null; markSeen: Coupon[] } {
  const unseen = coupons.filter((c) => !seen(c)).sort((a, b) => (a.issuedAt < b.issuedAt ? -1 : a.issuedAt > b.issuedAt ? 1 : a.weekId < b.weekId ? -1 : 1));
  return { show: unseen.length > 0 ? unseen[unseen.length - 1] : null, markSeen: unseen };
}
