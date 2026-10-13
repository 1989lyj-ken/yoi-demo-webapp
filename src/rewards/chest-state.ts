import { weekOfTaskDate } from "../team/contrib-state.ts";
import { plusDays } from "../weekly/perfect-week-state.ts";

/** FSD-06A: the four prize tiers (PRD §6.2). Every prize is simulated Hotai Points. */
export type ChestTier = "basic" | "small" | "big" | "super";

export const TIER_LABEL: Record<ChestTier, string> = { basic: "基本獎", small: "小獎", big: "大獎", super: "超級獎" };

/** One opened chest (create-only, one per member and week). */
export interface ChestOpen { weekId: string; tier: ChestTier; points: number; openedAt: string }

/** What this block reads from a 01C daily document: the points claimed on that task day. */
export interface DayClaim { taskDate: string; claimed: number }

export class ChestFormatError extends Error { override name = "ChestFormatError"; }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SCENARIO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/;

/** The same check as the Rules' chestPoints(): the points must belong to the tier. */
export function legalChest(tier: unknown, points: unknown): tier is ChestTier {
  if (typeof points !== "number" || !Number.isInteger(points)) return false;
  return tier === "basic" ? points >= 1 && points <= 3
    : tier === "small" ? points === 5
    : tier === "big" ? points >= 10 && points <= 20
    : tier === "super" && points === 50;
}

/**
 * Q1-B: the browser draws the prize when the chest is opened (70 % basic 1–3, 20 % small 5, 9 % big
 * 10–20, 1 % super 50; equal chances inside a tier). The draw is only a proposal: the page shows the
 * value the server confirms. `random` returns [0, 1); it is injectable for tests.
 */
export function drawChest(random: () => number): { tier: ChestTier; points: number } {
  const roll = random();
  const pick = (from: number, count: number) => from + Math.min(count - 1, Math.floor(random() * count));
  if (roll < 0.7) return { tier: "basic", points: pick(1, 3) };
  if (roll < 0.9) return { tier: "small", points: 5 };
  if (roll < 0.99) return { tier: "big", points: pick(10, 11) };
  return { tier: "super", points: 50 };
}

/** A uniform [0, 1) number from the browser's cryptographic generator. */
export function secureRandom(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] / 2 ** 32;
}

const OPEN_KEYS = ["sessionId", "memberId", "weekId", "tier", "points", "openedAt", "clockVersion", "recordedAt"];

/** A chest opening as stored by the Rules; anything else is a format error (the page fails closed). */
export function parseChestOpen(value: unknown, sessionId: string, memberId: string, weekId: string): ChestOpen {
  const bad = () => new ChestFormatError("寶箱資料格式不符，請由管理者重設場次。");
  if (!value || typeof value !== "object") throw bad();
  const d = value as Record<string, unknown>;
  const keys = Object.keys(d);
  if (keys.length !== OPEN_KEYS.length || !OPEN_KEYS.every((k) => keys.includes(k))) throw bad();
  if (d.sessionId !== sessionId || d.memberId !== memberId || d.weekId !== weekId || !DATE.test(weekId)) throw bad();
  if (!legalChest(d.tier, d.points) || typeof d.openedAt !== "string" || !SCENARIO.test(d.openedAt)) throw bad();
  return { weekId, tier: d.tier as ChestTier, points: d.points as number, openedAt: d.openedAt };
}

/**
 * Every week that may hold an own chest: from the week of the earliest own daily document to the
 * current week (M2: team create/join waits for today's confirmed daily document, so no chest is older).
 * At most 60 weeks (Security Info), far beyond any demonstration session.
 * No daily document yet → no weeks; the caller shows "syncing" instead of guessing.
 */
export function chestWeeks(dayDates: readonly string[], today: string): string[] {
  if (dayDates.length === 0) return [];
  const first = weekOfTaskDate([...dayDates].sort()[0]);
  const last = weekOfTaskDate(today);
  // The newest 60 weeks: walk back from this week (a far-future clock never opens hundreds of listeners).
  const weeks: string[] = [];
  for (let w = last; w >= first && weeks.length < 60; w = plusDays(w, -7)) weeks.push(w);
  return weeks.reverse();
}

/** Q2-A: the balance is the sum of claimed daily points and opened chests (nothing is stored). */
/** FSD-07A: bonus points with an expiry (the referrer's 50 points per first ride); `label` is shown as is. */
export interface PointBonus { points: number; at: string; expiresAt: string; expired: boolean; label: string }

/** Balance = claimed daily points + opened chests + bonuses not expired yet (FSD-07A Q4; nothing is stored). */
export function balance(days: readonly DayClaim[], opens: readonly ChestOpen[], bonuses: readonly PointBonus[] = []): number {
  return days.reduce((sum, d) => sum + d.claimed, 0) + opens.reduce((sum, o) => sum + o.points, 0)
    + bonuses.reduce((sum, b) => sum + (b.expired ? 0 : b.points), 0);
}

export interface LedgerRow {
  kind: "daily" | "chest" | "referral";
  date: string;
  points: number;
  label: string;
  at: string | null;
  /** Bonuses only: shown as expired and not counted in the balance. */
  expired?: boolean;
  expiresAt?: string;
}

const KIND_ORDER: Record<LedgerRow["kind"], number> = { chest: 0, referral: 1, daily: 2 };

/** One row per task day with points, per opened chest and per bonus, newest day first. */
export function ledgerRows(days: readonly DayClaim[], opens: readonly ChestOpen[], bonuses: readonly PointBonus[] = []): LedgerRow[] {
  const rows: LedgerRow[] = [
    ...days.filter((d) => d.claimed > 0).map((d): LedgerRow => ({ kind: "daily", date: d.taskDate, points: d.claimed, label: `${d.taskDate} 每日任務`, at: null })),
    ...opens.map((o): LedgerRow => ({ kind: "chest", date: o.openedAt.slice(0, 10), points: o.points, label: `${o.weekId} 週團隊寶箱・${TIER_LABEL[o.tier]}`, at: o.openedAt })),
    ...bonuses.map((b): LedgerRow => ({ kind: "referral", date: b.at.slice(0, 10), points: b.points, label: b.label, at: b.at, expired: b.expired, expiresAt: b.expiresAt })),
  ];
  // Newest day first; on the same day: chests, then bonuses, then that day's points.
  return rows.sort((a, b) => (a.date === b.date ? KIND_ORDER[a.kind] - KIND_ORDER[b.kind] : a.date < b.date ? 1 : -1));
}

/**
 * Weeks with a confirmed own chest that is not opened yet, oldest first. A week whose chest
 * could not be read (`null`) is never offered, even if an opening already exists.
 */
export function unopenedChests(awards: ReadonlyMap<string, boolean | null>, opens: readonly ChestOpen[]): string[] {
  const opened = new Set(opens.map((o) => o.weekId));
  return [...awards].filter(([weekId, has]) => has === true && !opened.has(weekId)).map(([weekId]) => weekId).sort();
}
