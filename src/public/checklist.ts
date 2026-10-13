/**
 * FSD-PA-07 (product owner 2026-10-12): the 功能體驗清單. Each item is done when the visitor's own world shows it
 * (nothing extra is tracked, except that the bell was opened); "去試試" goes where it can be tried.
 */
import { commit, readCollection, readDoc } from "../local/store.ts";
import { newcomerState, visitorTeam } from "./sim.ts";
import { currentContext, VISITOR } from "./world.ts";

export interface CheckItem { id: string; label: string; hint: string; done: boolean; /** Not needed for 全部體驗完成 (the location item). */ optional: boolean }

const BELL = "publicProgress/visitor";

/** Remembered inside the world, so 重新開始體驗 clears it too. */
export function firstChecklistDue(): boolean {
  if ((readDoc(BELL) as { checklistShown?: boolean } | undefined)?.checklistShown) return false;
  commit([{ path: BELL, data: { ...(readDoc(BELL) ?? {}), checklistShown: true } }]);
  return true;
}

/** 2026-10-12: 一鍵模擬團隊達標 can be used once per experience (its button then turns grey). */
export function teamGoalUsed(): boolean { return !!(readDoc(BELL) as { goal?: boolean } | undefined)?.goal; }
export function markTeamGoalUsed(): void {
  if (teamGoalUsed()) return;
  commit([{ path: BELL, data: { ...(readDoc(BELL) ?? {}), goal: true } }]);
}

/** 2026-10-12: the weather dialog was opened (it only exists once the location is allowed and found). */
export function markWeatherOpened(): void {
  if ((readDoc(BELL) as { weather?: boolean } | undefined)?.weather) return;
  commit([{ path: BELL, data: { ...(readDoc(BELL) ?? {}), weather: true } }]);
}

export function markBellOpened(): void {
  if ((readDoc(BELL) as { bell?: boolean } | undefined)?.bell) return;
  commit([{ path: BELL, data: { ...(readDoc(BELL) ?? {}), bell: true } }]);
}

export function checklist(): CheckItem[] {
  const context = currentContext();
  const s = context.sessionId;
  const me = VISITOR.memberId;
  const days = readCollection(`dailySteps/${s}/members/${me}/days`);
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  const caughtUp = days.some((d) => readCollection(`${d.path}/events`).some((e) => e.data.kind === "claim" && String(e.data.occurredAt ?? "").slice(0, 10) > d.id));
  const team = visitorTeam(context);
  const named = !!team && typeof (readDoc(`teamNames/${s}/items/${team.teamId}`) as { name?: unknown } | undefined)?.name === "string";
  const done: Record<string, boolean> = {
    steps: days.some((d) => num(d.data.rawSteps) > 0),
    claim: days.some((d) => num(d.data.claimed) > 0),
    ride: days.some((d) => typeof d.data.rideCompletedAt === "string"),
    yesterday: caughtUp,
    team: !!team && team.memberIds.length >= 2,
    name: named,
    chest: readCollection(`chestOpens/${s}/members/${me}/weeks`).length > 0,
    coupon: readCollection(`rideCoupons/${s}/members/${me}/weeks`).length > 0,
    referral: newcomerState(context) === "rode",
    bell: !!(readDoc(BELL) as { bell?: boolean } | undefined)?.bell,
    weather: !!(readDoc(BELL) as { weather?: boolean } | undefined)?.weather,
  };
  return CHECK_ITEMS.map(([id, label, hint]) => ({ id, label, hint, done: done[id], optional: id === "weather" }));
}

export const CHECK_ITEMS: [string, string, string][] = [
  ["steps", "輸入今天的步數", "點步數下面的「輸入步數」"],
  ["claim", "領取點數", "每 2,000 步可以領 1 點"],
  ["ride", "搭一趟 yoxi", "今天的步數變 1.5 倍"],
  ["yesterday", "補領昨天的點數", "先在「今日」按「快轉到明天」"],
  ["team", "組隊並邀請隊友", "建立隊伍，再邀請模擬隊友"],
  ["name", "幫隊伍取名", "隊長可以在團隊頁編輯隊名"],
  ["chest", "團隊達標，開寶箱", "寶箱頁的「一鍵模擬團隊達標」"],
  ["coupon", "拿到七日全勤乘車券", "本週頁的「自動七天」"],
  ["referral", "推薦新朋友", "邀請頁「新戶」的模擬新朋友"],
  ["bell", "看看 Yoika 的提醒", "點右上角的鈴鐺"],
  ["weather", "開啟定位，看地圖與天氣", "地圖上按「顯示我的位置」並允許定位，再點天氣（不想分享位置可略過）"],
];
