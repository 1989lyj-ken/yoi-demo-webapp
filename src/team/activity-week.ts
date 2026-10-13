import type { DemoContext } from "../identity/contracts.ts";

/** The scenario clock is explicitly Asia/Taipei. Never use the device clock. */
export function activityWeekOf(scenarioNow: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(scenarioNow)) throw new Error("情境時間格式錯誤。");
  const date = scenarioNow.slice(0, 10);
  const midnight = new Date(`${date}T00:00:00+08:00`);
  if (!Number.isFinite(midnight.getTime())) throw new Error("情境日期格式錯誤。");
  const taipeiDay = new Date(midnight.getTime() + 8 * 60 * 60 * 1000).getUTCDay();
  midnight.setUTCDate(midnight.getUTCDate() - ((taipeiDay + 6) % 7));
  return new Date(midnight.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function requireActivityWeek(context: DemoContext): string {
  const expected = activityWeekOf(context.scenarioNow);
  if (!context.activityWeekId) throw new Error("管理者尚未設定活動週；退團與轉讓暫停。");
  if (context.activityWeekId !== expected) throw new Error("活動週與情境日期不一致；請聯絡管理者修正。");
  return expected;
}
