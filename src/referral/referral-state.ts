import { plusDays } from "../weekly/perfect-week-state.ts";

/** FSD-07A: one referral per referee and session (create-only, the first ride set once). */
export interface Referral { refereeId: string; referrerId: string; boundAt: string; firstRideAt: string | null }

export class ReferralFormatError extends Error { override name = "ReferralFormatError"; }

/** Rewards are valid 60 days from the moment they are earned (PRD §6.3), in scenario time. */
export const REFERRAL_DAYS = 60;
export const WELCOME_FACE_VALUE = 50;
export const REWARD_FACE_VALUE = 100;
export const BONUS_POINTS = 50;

const ID = /^[A-Za-z0-9-]{1,40}$/;
const SCENARIO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/;
const KEYS = ["sessionId", "refereeId", "referrerId", "boundAt", "firstRideAt", "clockVersion", "recordedAt", "firstRideRecordedAt"];

export function parseReferral(value: unknown, sessionId: string, refereeId: string): Referral {
  const bad = () => new ReferralFormatError("推薦資料格式不符，請由管理者重設場次。");
  if (!value || typeof value !== "object") throw bad();
  const d = value as Record<string, unknown>;
  const keys = Object.keys(d);
  if (keys.length !== KEYS.length || !KEYS.every((k) => keys.includes(k))) throw bad();
  if (d.sessionId !== sessionId || d.refereeId !== refereeId || typeof d.referrerId !== "string" || !ID.test(d.referrerId) || d.referrerId === refereeId) throw bad();
  if (typeof d.boundAt !== "string" || !SCENARIO.test(d.boundAt)) throw bad();
  if (d.firstRideAt !== null && (typeof d.firstRideAt !== "string" || !SCENARIO.test(d.firstRideAt))) throw bad();
  return { refereeId, referrerId: d.referrerId, boundAt: d.boundAt, firstRideAt: d.firstRideAt as string | null };
}

/** Q7 checks that need no server; the Rules decide the rest (and refusals are explained after a server reread). */
export function checkCode(raw: string, selfId: string): { ok: true; code: string } | { ok: false; message: string } {
  const code = raw.trim();
  if (code === "") return { ok: false, message: "請輸入推薦碼。" };
  if (!ID.test(code)) return { ok: false, message: "找不到這個推薦碼。" };
  if (code === selfId) return { ok: false, message: "不能填自己的推薦碼。" };
  return { ok: true, code };
}

/** Why a binding did not happen, decided from what the server says now (never from an error code). */
export function bindRefusal(own: Referral | null, theirs: Referral | null | "unreadable", code: string, selfId: string, codeExists: boolean | null): string {
  if (own) return "您已經綁定推薦碼，不能更改。";
  if (codeExists === false) return "找不到這個推薦碼。";
  if (theirs !== "unreadable" && theirs?.referrerId === selfId) return "對方已由您推薦，不能互相推薦。";
  if (code === selfId) return "不能填自己的推薦碼。";
  return "未綁定，請稍後再試。";
}

export const expiryOf = (at: string) => plusDays(at, REFERRAL_DAYS);

/** 0 none, 2 code entered (registration done at the same moment), 3 first ride done. */
export function referralStep(own: Referral | null): 0 | 2 | 3 {
  return !own ? 0 : own.firstRideAt ? 3 : 2;
}

export interface ReferralCoupon {
  key: string;
  kind: "referralWelcome" | "referralReward";
  faceValue: number;
  issuedAt: string;
  expiresAt: string;
}

/** The referee's two NT$50 welcome coupons and the referrer's NT$100 coupon per first ride (derived, not stored). */
export function referralCoupons(own: Referral | null, mine: readonly Referral[]): ReferralCoupon[] {
  const out: ReferralCoupon[] = [];
  if (own) {
    for (const n of [1, 2]) out.push({ key: `ref-${own.refereeId}-${n}`, kind: "referralWelcome", faceValue: WELCOME_FACE_VALUE, issuedAt: own.boundAt, expiresAt: expiryOf(own.boundAt) });
  }
  for (const r of mine) {
    if (r.firstRideAt) out.push({ key: `refbonus-${r.refereeId}`, kind: "referralReward", faceValue: REWARD_FACE_VALUE, issuedAt: r.firstRideAt, expiresAt: expiryOf(r.firstRideAt) });
  }
  return out;
}

/** The referrer's 50 bonus points per first ride; `expired` once the scenario time reaches the expiry. */
export interface ReferralBonus { refereeId: string; points: number; at: string; expiresAt: string; expired: boolean }

export function referralBonuses(mine: readonly Referral[], now: string): ReferralBonus[] {
  return mine.filter((r) => r.firstRideAt).map((r) => {
    const at = r.firstRideAt as string;
    const expiresAt = expiryOf(at);
    return { refereeId: r.refereeId, points: BONUS_POINTS, at, expiresAt, expired: !(now < expiresAt) };
  });
}
