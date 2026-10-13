/** Walking-style count-up: fast for the first ~90 %, then slowing as it nears the target (ease-out quart). */
export const easeOutQuart = (t: number): number => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 4);

export function valueAt(from: number, to: number, t: number): number {
  return t >= 1 ? to : from + Math.round((to - from) * easeOutQuart(t));
}

/** 0.9 s for tiny changes, growing with the square root of the gap, capped at 3 s. */
export function durationFor(diff: number): number {
  return Math.max(900, Math.min(3000, 900 + Math.sqrt(Math.max(0, diff)) * 60));
}

/**
 * Animates from `from` to `to`, calling `onFrame` with each shown value and `onDone` once at the end.
 * Returns a cancel function. With reduced motion (or no change) it finishes immediately.
 */
export function animateCount(from: number, to: number, onFrame: (value: number) => void, onDone: () => void): () => void {
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduce || to <= from) { onDone(); return () => {}; }
  const duration = durationFor(to - from);
  const start = performance.now();
  let frame = 0;
  let cancelled = false;
  const tick = (now: number) => {
    if (cancelled) return;
    const t = (now - start) / duration;
    onFrame(valueAt(from, to, t));
    if (t >= 1) onDone(); else frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => { cancelled = true; cancelAnimationFrame(frame); };
}
