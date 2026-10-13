/**
 * FSD-08A-6: which stage the team chest card shows (附圖三). Pure: inputs are server-confirmed snapshots only
 * (null while unconfirmed), so an unconfirmed source shows "syncing" rather than a guess.
 */
import { TIER_LABEL, type ChestOpen } from "./chest-state.ts";

/** What the team block knows about the current week (FSD-03C-1 replay, FSD-03C-2 result). */
export interface ChestTeamContext {
  confirmed: boolean;
  hasTeam: boolean;
  total: number;
  target: number;
  /** The current week reached the target (official result or the replay). */
  reached: boolean;
  /** Days left in this week, today included (Monday 7 … Sunday 1). */
  daysLeft: number;
  /** Last week's total and award count (only known on Mondays, when the team block shows last week). */
  previous: { weekId: string; total: number; awardCount: number } | null;
  /** UX-1010 F5: a team with only the viewer in it (recruiting or paused): no team steps count yet. */
  solo?: boolean;
  /** UX-1010 F11: this week's official award count (null until recorded). */
  currentAwards?: number | null;
}

export type ChestStage =
  | { kind: "syncing" }
  | { kind: "open"; weekId: string; more: number; teamTotal: number | null; awardCount: number | null; thisWeek?: boolean }
  | { kind: "opened"; points: number; tier: string; thisWeek?: boolean }
  | { kind: "solo" }
  | { kind: "reached" }
  | { kind: "progress"; remaining: number; daysLeft: number }
  | { kind: "noTeam" };

/**
 * Order: an unopened chest first (the oldest, with how many more), then last week's chest already opened,
 * then this week's progress (reached, or how far to go), else no team.
 */
export function chestStage(chests: readonly string[] | null, opens: readonly ChestOpen[] | null, team: ChestTeamContext | null, previousWeekId: string,
  currentWeekId: string | null = null): ChestStage {
  if (chests === null || opens === null) return { kind: "syncing" };
  if (chests.length > 0) {
    const weekId = chests[0];
    // UX-1010 F11 (rule A, 2026-10-12): a chest can be opened in the week the team reached the target.
    if (weekId === currentWeekId) {
      const total = team?.confirmed ? team.total : null;
      return { kind: "open", weekId, more: chests.length - 1, teamTotal: total, awardCount: team?.confirmed ? team.currentAwards ?? null : null, thisWeek: true };
    }
    const prev = team?.confirmed && team.previous?.weekId === weekId ? team.previous : null;
    return { kind: "open", weekId, more: chests.length - 1, teamTotal: prev ? prev.total : null, awardCount: prev ? prev.awardCount : null };
  }
  // Opened this week: say so (never "you can open one" again).
  const openedNow = currentWeekId ? opens.find((o) => o.weekId === currentWeekId) : undefined;
  if (openedNow) return { kind: "opened", points: openedNow.points, tier: TIER_LABEL[openedNow.tier], thisWeek: true };
  const opened = opens.find((o) => o.weekId === previousWeekId);
  if (!team || !team.confirmed) return opened ? { kind: "opened", points: opened.points, tier: TIER_LABEL[opened.tier] } : { kind: "syncing" };
  if (!team.hasTeam) return opened ? { kind: "opened", points: opened.points, tier: TIER_LABEL[opened.tier] } : { kind: "noTeam" };
  if (team.solo) return { kind: "solo" };
  if (team.reached) return { kind: "reached" };
  if (opened) return { kind: "opened", points: opened.points, tier: TIER_LABEL[opened.tier] };
  return { kind: "progress", remaining: Math.max(0, team.target - team.total), daysLeft: team.daysLeft };
}

/** "18.6"-style ten-thousands with one decimal, rounded down (never shows a target as reached early). */
export const wanOne = (steps: number) => (Math.floor(Math.max(0, steps) / 1000) / 10).toFixed(1);

/** The same, rounded up: for what is still missing (QA: 500 steps left reads 0.1, never 0.0). */
export const wanOneUp = (steps: number) => (Math.ceil(Math.max(0, steps) / 1000) / 10).toFixed(1);

/** Days left in a week (Monday-start, Asia/Taipei task dates), today included. */
export function daysLeftInWeek(weekId: string, today: string): number {
  const elapsed = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${weekId}T00:00:00Z`)) / 86_400_000);
  return Math.min(7, Math.max(1, 7 - elapsed));
}
