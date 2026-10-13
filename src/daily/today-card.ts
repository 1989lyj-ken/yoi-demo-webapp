import { unlockedPoints } from "./daily-state.ts";

/**
 * FSD-08C (2026-10-07 steps page redesign): the wording of today's points card, its ride row and the ride
 * celebration. Pure functions over the confirmed state; "steps" always means the effective steps (raw × 1.5
 * after a ride), as the points do.
 */
export const DAY_GOAL = 6000;
const STEP = 2000;

const n = (value: number) => value.toLocaleString("en-US");

/** Unlocked but not yet claimed points. */
export function claimableOf(effectiveSteps: number, claimed: number): number {
  return Math.max(0, unlockedPoints(effectiveSteps) - claimed);
}

/** Steps to the next threshold not reached yet (null once 6,000 is reached). */
export function stepsToNext(effectiveSteps: number): number | null {
  if (effectiveSteps >= DAY_GOAL) return null;
  return (Math.floor(effectiveSteps / STEP) + 1) * STEP - effectiveSteps;
}

/**
 * UX-1010 F16: what the member still has to walk. After a ride every further step counts 1.5 times, so the gap in
 * effective steps is divided by 1.5 and rounded up (1,000 to go reads 667).
 */
export function walkFor(gap: number, ride: boolean): number {
  return ride ? Math.ceil(gap / 1.5) : gap;
}

/** S3: the sentence under the track. `points` is the number shown in red bold inside `lead`. */
export interface TodaySentence { lead: string; points: number | null; sub: string | null }

export function todaySentence(effectiveSteps: number, claimed: number, ride = false): TodaySentence {
  if (claimed >= 3) return { lead: "今天的 3 點都領到了", points: null, sub: null };
  const claimable = claimableOf(effectiveSteps, claimed);
  const gap = stepsToNext(effectiveSteps);
  const next = gap === null ? null : walkFor(gap, ride);
  if (claimable > 0) {
    return { lead: `有 ${claimable} 點可以領`, points: claimable, sub: next === null ? "今天的目標達成了" : `再走 ${n(next)} 步，就可以再領 1 點` };
  }
  return { lead: `再走 ${n(next ?? 0)} 步，就可以領 1 點`, points: null, sub: null };
}

/** S5: the ride row's description; the goal line only when the ride really reaches 6,000 (raw ≥ 4,000). */
export function rideRowNote(rawSteps: number, effectiveSteps: number, rideDone: boolean): string {
  if (rideDone) return "1 / 1・今天的步數變 1.5 倍";
  if (effectiveSteps < DAY_GOAL && rawSteps * 1.5 >= DAY_GOAL) return "0 / 1・搭一趟，今天的目標直接達成";
  return "0 / 1・今天的步數變 1.5 倍";
}

/** S8: the ride line (UX-1010 F16: in the card under the track's labels; the actual steps are drawn bold by the view). */
export function rideMapNote(rawSteps: number): string {
  return `實際走了 ${n(rawSteps)} 步，搭 yoxi 變 1.5 倍`;
}

export interface RideDay { rawSteps: number; effectiveSteps: number; claimed: number }

/** S6: the celebration after a confirmed ride (`before` without the ride, `after` with it). */
export interface RideCelebration { from: number; to: number; note: string; claimable: number; /** UX-1010 F17: a ride with no steps yet. */ zero?: boolean }

export function rideCelebration(before: RideDay, after: RideDay): RideCelebration {
  const gained = unlockedPoints(after.effectiveSteps) - unlockedPoints(before.effectiveSteps);
  const claimable = claimableOf(after.effectiveSteps, after.claimed);
  // F17: no steps yet: say what happens next and lead to the steps field.
  if (after.rawSteps === 0) return { from: 0, to: 0, note: "還沒有步數，先輸入今天走了幾步", claimable, zero: true };
  const gap = stepsToNext(after.effectiveSteps);
  const next = gap === null ? null : walkFor(gap, true);
  const note = gained > 0 ? `多了 ${gained} 點可以領`
    : next !== null ? `再走 ${n(next)} 步，就可以領 1 點`
    : claimable > 0 ? "今天的目標達成了"
    : "今天的 3 點都領到了";
  return { from: after.rawSteps, to: after.effectiveSteps, note, claimable };
}

/** S2: a threshold circle (1..3). */
export type NodeState = "done" | "ready" | "locked";
export function nodeStates(effectiveSteps: number, claimed: number): NodeState[] {
  const unlocked = unlockedPoints(effectiveSteps);
  return [1, 2, 3].map((i) => (claimed >= i ? "done" : unlocked >= i ? "ready" : "locked"));
}

/** S2: how far the track is filled and where the shoe floats (0..1). */
export function trackFraction(effectiveSteps: number): number {
  return Math.max(0, Math.min(1, effectiveSteps / DAY_GOAL));
}
