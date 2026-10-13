import { escapeHtml } from "./html.ts";
import { icon } from "./icons.ts";

/** Spec 2.7: values are a red number with a navy unit, using tabular figures. */
export function count(value: string | number, unit: string): string {
  const text = typeof value === "number" ? value.toLocaleString() : value;
  return `<span class="yx-count"><b>${escapeHtml(text)}</b><span>${escapeHtml(unit)}</span></span>`;
}

/**
 * Spec 8.11 / 8.12 Progress/Trip: a 5pt track with a marker at the current position (FSD-08A-3 D6/Q1: footprints
 * instead of the spec's car, product owner deviation).
 * With `segments` (today's points) the track is split into equal parts; reached parts are navy and the
 * final part turns brand-red once full. The navy fill follows the marker inside a segment (FSD-08A-3 D12). The marker keeps moving continuously inside its segment.
 */
export function progressTrip(fraction: number, options: { segments?: number; label: string; marks?: string[]; tone?: "navy" | "red" }): string {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const segments = options.segments ?? 1;
  // FSD-08A-3 D12: navy fills continuously up to the marker (a reached segment is fully navy; the last one turns red when full).
  const parts = Array.from({ length: segments }, (_, index) => {
    const fill = Math.max(0, Math.min(1, clamped * segments - index + 1e-9));
    // FSD-08A-5 10: a full bar is navy to the end (the spec's red last segment is dropped).
    const state = fill >= 1 ? "done" : "";
    return `<span class="yx-trip-seg ${state}" style="--fill:${Math.round(fill * 1000) / 10}%"></span>`;
  }).join("");
  const percent = Math.round(clamped * 1000) / 10;
  // FSD-08A-6: optional labels under the boundaries between segments (e.g. 2000步, 4000步).
  const marks = options.marks?.length ? `<div class="yx-trip-marks" aria-hidden="true">${options.marks.map((m, i) => `<span style="--at:${Math.round(((i + 1) / segments) * 1000) / 10}%">${escapeHtml(m)}</span>`).join("")}</div>` : "";
  return `<div class="yx-trip${options.tone === "red" ? " yx-trip--red" : ""}${marks ? " yx-trip--marks" : ""}" role="progressbar" aria-label="${escapeHtml(options.label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" style="--trip:${percent}%"><div class="yx-trip-track">${parts}</div><span class="yx-trip-car">${icon("footprints", { size: 24 })}</span>${marks}</div>`;
}
