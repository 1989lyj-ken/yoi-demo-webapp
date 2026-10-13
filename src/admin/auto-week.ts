import type { AuthenticatedSession, DemoContext } from "../identity/contracts";
import type { DailyCommand, DailyDay } from "../daily/daily-service";
import { planClockChange, type ClockChangePlan } from "./admin-service.ts";
import { nextDayAt9, nextMondayAt9 } from "./clock-time.ts";

/**
 * 2026-10-06 (14) 管理頁「自動七天」: no Rules change. The admin's own seven days of the next week are filled
 * through the normal paths: advance the shared clock to next Monday 09:00, then each day set today's steps
 * to 6,000 and claim the reached points, advancing one day at a time until Sunday. Every member's device
 * sees the clock move (reload); other members' days of that week stay as they are.
 */
export interface AutoWeekPorts {
  apply(session: AuthenticatedSession, plan: ClockChangePlan): Promise<void>;
  ensureDay(session: AuthenticatedSession, day: DailyDay): Promise<void>;
  execute(session: AuthenticatedSession, day: DailyDay, command: DailyCommand): Promise<unknown>;
}

export const AUTO_WEEK_STEPS = 6000;
export const AUTO_WEEK_DAY_LABEL = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"];

/** The seven clock targets: next Monday 09:00, then six more days at 09:00 (pure; for the confirmation and tests). */
export function autoWeekPlan(scenarioNow: string): string[] {
  const days = [nextMondayAt9(scenarioNow)];
  for (let i = 1; i < 7; i += 1) days.push(nextDayAt9(days[i - 1]));
  return days;
}

export class AutoWeekError extends Error {
  /** `completedDays`: how many days already reached 6,000 (the clock may already have moved). */
  readonly completedDays: number;
  constructor(message: string, completedDays: number) { super(message); this.completedDays = completedDays; }
}

/** Runs the seven days in order; never retries on its own (a failure stops and says how far it got). */
export async function runAutoWeek(session: AuthenticatedSession, ports: AutoWeekPorts,
  onProgress: (day: number, phase: "clock" | "steps") => void): Promise<DemoContext> {
  if (session.member.role !== "admin") throw new AutoWeekError("只有管理者可以執行自動七天。", 0);
  let context: DemoContext = session.context;
  let done = 0;
  const targets = autoWeekPlan(context.scenarioNow);
  try {
    for (const [day, target] of targets.entries()) {
      onProgress(day, "clock");
      const plan = planClockChange(context, "advance", target);
      await ports.apply({ ...session, context }, plan);
      context = plan.to;
      onProgress(day, "steps");
      const daySession = { ...session, context };
      await ports.ensureDay(daySession, "today");
      await ports.execute(daySession, "today", { type: "steps", value: AUTO_WEEK_STEPS });
      await ports.execute(daySession, "today", { type: "claimAll" });
      done = day + 1;
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "未知錯誤";
    throw new AutoWeekError(`自動七天在${AUTO_WEEK_DAY_LABEL[done] ?? "最後"}停止（${reason}）。已完成 ${done} 天；不會自動重試，請重新載入後確認目前情境再決定。`, done);
  }
  return context;
}
