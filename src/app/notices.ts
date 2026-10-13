/**
 * FSD-08A-2: bell notices, derived from server-confirmed data only (nothing is stored in Firestore).
 * Pure functions (no Firebase, no DOM) so the shell, the preview and the tests share them.
 */
import type { ShellPage } from "./shell-state.ts";

export type NoticeType = "move" | "claim" | "yesterday" | "coupon" | "chest" | "referral";

export interface Notice {
  type: NoticeType;
  text: string;
  page: ShellPage;
  /** The element focused after switching page and scrolling (a tabindex=-1 anchor). */
  anchor: string;
  /** UX-1010 F13: the task day it happened (shown as 今天／昨天／M/D). */
  day: string;
}

/** What the notices are derived from; `null` means "not server-confirmed yet" (fail closed, M4). */
export interface NoticeInputs {
  /** Validated scenario time (YYYY-MM-DDTHH:MM:SS+08:00) and its task date. */
  scenarioNow: string;
  taskDate: string;
  today: { rawSteps: number; effectiveSteps: number; claimable: number } | null;
  /** Points still claimable for yesterday (0 when none or past the deadline). */
  yesterdayClaimable: number | null;
  /** issuedAt of the viewer's weekly coupons. */
  couponIssuedAt: string[] | null;
  unopenedChests: number | null;
  /** Moments the viewer earned referral rewards (boundAt as referee, firstRideAt of people referred). */
  referralRewardAt: string[] | null;
  /** UX-1010 F13: which of those were the viewer's own welcome (as referee); the rest are referrer rewards. */
  referralWelcomeAt?: string[] | null;
}

export interface NoticeList { confirmed: boolean; items: Notice[] }

const day = (at: string) => at.slice(0, 10);

/** N1–N6 (product owner, 2026-10-04): only types whose condition holds now; a type disappears when it stops holding. */
export function deriveNotices(input: NoticeInputs): NoticeList {
  const confirmed = input.today !== null && input.yesterdayClaimable !== null && input.couponIssuedAt !== null
    && input.unopenedChests !== null && input.referralRewardAt !== null;
  if (!confirmed) return { confirmed: false, items: [] };
  const items: Notice[] = [];
  const today = input.today!;
  const hour = Number(input.scenarioNow.slice(11, 13));
  const on = input.taskDate;
  // UX-1010 F13: say what happened and how much; the notice itself takes the member there.
  if (hour >= 12 && today.rawSteps < 1000) items.push({ type: "move", text: `今天走了 ${today.rawSteps.toLocaleString("en-US")} 步，出門走走就能領點數`, page: "steps", anchor: "#today-say", day: on });
  if (today.claimable > 0) items.push({ type: "claim", text: `今天有 ${today.claimable} 點可以領`, page: "steps", anchor: "#today-say", day: on });
  if (input.yesterdayClaimable! > 0) {
    items.push({ type: "yesterday", text: `昨天還有 ${input.yesterdayClaimable} 點可以補領，今晚 23:59 前`, page: "steps", anchor: "#yesterday-title", day: on });
  }
  const coupons = input.couponIssuedAt!.filter((at) => day(at) === on).length;
  if (coupons > 0) items.push({ type: "coupon", text: `拿到 ${coupons} 張 $50 乘車獎勵券`, page: "rewards", anchor: "#coupons", day: on });
  if (input.unopenedChests! > 0) {
    items.push({ type: "chest", text: input.unopenedChests === 1 ? "團隊寶箱可以開了" : `有 ${input.unopenedChests} 個團隊寶箱可以開`, page: "rewards", anchor: "#rewards-chests", day: on });
  }
  const todays = input.referralRewardAt!.filter((at) => day(at) === on);
  if (todays.length > 0) {
    const welcome = (input.referralWelcomeAt ?? []).filter((at) => day(at) === on).length;
    const rewards = todays.length - welcome;
    const parts = [welcome > 0 ? `${welcome * 2} 張 $50 推薦獎勵券` : "", rewards > 0 ? `${rewards} 張 $100 推薦獎勵券和 ${rewards * 50} 點` : ""].filter(Boolean);
    items.push({ type: "referral", text: `拿到 ${parts.join("，")}`, page: "rewards", anchor: "#coupons", day: on });
  }
  return { confirmed: true, items };
}

/** UX-1010 F13: 今天／昨天／M/D for a notice's task day. */
export function noticeDayLabel(day: string, today: string): string {
  if (day === today) return "今天";
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`);
  if (ms === 86_400_000) return "昨天";
  return `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
}

/** The read-state key (M2): one per session, member, task day and type ("once per day"). */
export const noticeKey = (sessionId: string, memberId: string, taskDate: string, type: NoticeType) =>
  `yoi:notice:${sessionId}:${memberId}:${taskDate}:${type}`;

/** 2026-10-06: "全部已讀" hides exactly the notices shown (by text); a new or changed one of the same type shows again the same day. */
export const noticeClearedKey = (sessionId: string, memberId: string, taskDate: string, type: NoticeType) =>
  `yoi:notice-cleared:${sessionId}:${memberId}:${taskDate}:${type}`;

/** The notices still shown (not cleared today). */
export function visibleNotices(list: NoticeList, isCleared: (type: NoticeType) => boolean): NoticeList {
  return list.confirmed ? { confirmed: true, items: list.items.filter((n) => !isCleared(n.type)) } : list;
}

/** Unread count for the badge; undefined while unconfirmed (no badge, M4). */
export function unreadCount(list: NoticeList, isRead: (type: NoticeType) => boolean): number | undefined {
  return list.confirmed ? list.items.filter((n) => !isRead(n.type)).length : undefined;
}
