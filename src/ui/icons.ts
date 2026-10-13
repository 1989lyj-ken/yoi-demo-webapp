/*!
 * Icons. Spec 1.24.0 ch. 7: solid two-tone (navy body + icon-red accent).
 * - bell: drawn in-house for the notice bell (FSD-08A-2), navy body with an icon-red clapper.
 * - menu: three bars with icon-red ends, as on the official yoxi app's menu button (FSD-08A-5 11), drawn in-house.
 * - sunny, cloudy, rainy, storm: drawn in-house for the map weather icon (FSD-08B); chevron: the drawer's disclosure arrow; yoika: three gold sparkles; menuLines, close, star (2026-10-07).
 * - shoe, team, car, spark, fwd arrow: redrawn from the designer's symbols in UI-design/03_畫面稿/3-0_主要畫面.html.
 * - lock, confetti, user-plus, plus, gear, ticket, check, map-pin, gift, footprints, pencil-simple, info: Phosphor Icons (Fill), MIT License,
 *   Copyright (c) 2023 Phosphor Icons. Originals and the full license: src/ui/icons/phosphor/.
 *   Accent parts were split out by hand for the two-tone treatment.
 */
import { escapeHtml } from "./html.ts";

export type IconSize = 16 | 20 | 24 | 28;
export type IconName = "shoe" | "team" | "car" | "spark" | "lock" | "confetti" | "userPlus" | "plus" | "gear" | "ticket" | "check" | "pin" | "gift" | "menu" | "bell" | "footprints" | "pencil" | "info" | "sunny" | "cloudy" | "rainy" | "storm" | "chevron" | "yoika" | "menuLines" | "close" | "star";

// Body paths use currentColor (navy by default); accent/knockout/apricot/link are coloured from tokens in CSS.
const A = 'class="yx-i-accent"';
const K = 'class="yx-i-knock"';
// Accent that sits inside a cut-out of the body: hidden in mono so it cannot fill the cut-out in.
const I = 'class="yx-i-accent yx-i-accent-inset"';

const ICONS: Record<IconName, { viewBox: string; svg: string }> = {
  bell: { viewBox: "0 0 24 24", svg: `<path d="M12 2.5a6.5 6.5 0 0 0-6.5 6.5v3.6l-1.7 3.1a.9.9 0 0 0 .8 1.3h14.8a.9.9 0 0 0 .8-1.3l-1.7-3.1V9A6.5 6.5 0 0 0 12 2.5z" fill="currentColor"/><path class="yx-i-accent" d="M9.2 18.6h5.6a2.8 2.8 0 0 1-5.6 0z"/>` },
  menu: { viewBox: "0 0 24 24", svg: `<rect x="5.5" y="6" width="13" height="2.2" fill="currentColor"/><rect x="5.5" y="10.9" width="13" height="2.2" fill="currentColor"/><rect x="5.5" y="15.8" width="13" height="2.2" fill="currentColor"/><path ${A} d="M3 6h2.5v2.2H3zM18.5 6H21v2.2h-2.5zM3 10.9h2.5v2.2H3zM18.5 10.9H21v2.2h-2.5zM3 15.8h2.5v2.2H3zM18.5 15.8H21v2.2h-2.5z"/>` },
  shoe: { viewBox: "0 0 32 32", svg: `<path d="M5 20c0-6 2-12 3-15h7l1 6c3 1 9 3 11 6 1 2 1 4-1 5H7c-1 0-2-1-2-2z" fill="currentColor"/><rect ${A} x="5" y="23" width="22" height="3"/><path class="yx-i-apricot" d="M12 11h4M12 14h5" stroke-width="1.6" fill="none"/>` },
  team: { viewBox: "0 0 32 32", svg: `<circle cx="11" cy="9" r="5" fill="currentColor"/><path d="M1 27c0-6 4.5-10 10-10s10 4 10 10z" fill="currentColor"/><circle ${A} cx="23" cy="11" r="4"/><path ${A} d="M17.5 27c.3-5 2.6-8.3 5.5-8.3 3.5 0 7 3 7 8.3z"/>` },
  // FSD-08A-3 D6/Q1: the Progress/Trip marker (product owner deviation from the car): soles navy, heels icon-red.
  footprints: { viewBox: "0 0 256 256", svg: `<path d="M76,16C64.36,16,53.07,26.31,44.2,45c-13.93,29.38-18.56,73,.29,96a8,8,0,0,0,6.2,2.93h50.55a8,8,0,0,0,6.2-2.93c18.85-23,14.22-66.65.29-96C98.85,26.31,87.57,16,76,16Zm78.8,152h50.55a8,8,0,0,0,6.2-2.93c18.85-23,14.22-66.65.29-96C202.93,50.31,191.64,40,180,40s-22.89,10.31-31.77,29c-13.93,29.38-18.56,73,.29,96A8,8,0,0,0,154.76,168Z" fill="currentColor"/><path ${A} d="M216.06,192v12A36,36,0,0,1,144,204V192a8,8,0,0,1,8-8h56A8,8,0,0,1,216.06,192ZM104,160h-56a8,8,0,0,0-8,8v12A36,36,0,0,0,112,180V168A8,8,0,0,0,104,160Z"/>` },
  // FSD-08A-6: the play guide button; the dot and stem (cut-outs of the disc) are the icon-red accent.
  info: { viewBox: "0 0 256 256", svg: `<path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm-4,48a12,12,0,1,1-12,12A12,12,0,0,1,124,72Zm12,112a16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40a8,8,0,0,1,0,16Z" fill="currentColor"/><path ${I} d="M124,72a12,12,0,1,1-12,12A12,12,0,0,1,124,72Zm12,112a16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40a8,8,0,0,1,0,16Z"/>` },
  // 2026-10-07: the header menu as three plain navy lines; the sheet close cross; the play guide's perfect-week star (drawn in-house).
  menuLines: { viewBox: "0 0 24 24", svg: `<path d="M4 6.5h16M4 12h16M4 17.5h16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/>` },
  close: { viewBox: "0 0 24 24", svg: `<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>` },
  star: { viewBox: "0 0 24 24", svg: `<path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z" fill="currentColor"/>` },
  // 2026-10-06: Yoika (AI 智行秘書): three gold sparkles, large, medium and small (product owner's pick).
  yoika: { viewBox: "0 0 24 24", svg: `<path class="yx-i-gold" transform="translate(10 13.5) scale(2.9)" d="M0 -3 .85 -.85 3 0 .85 .85 0 3 -.85 .85 -3 0 -.85 -.85Z"/><path class="yx-i-gold" transform="translate(18.6 5.6) scale(1.45)" d="M0 -3 .85 -.85 3 0 .85 .85 0 3 -.85 .85 -3 0 -.85 -.85Z"/><path class="yx-i-gold" transform="translate(19.2 18.4) scale(0.85)" d="M0 -3 .85 -.85 3 0 .85 .85 0 3 -.85 .85 -3 0 -.85 -.85Z"/>` },
  // 2026-10-06: the drawer's disclosure arrow (drawn in-house; rotated in CSS when open).
  chevron: { viewBox: "0 0 24 24", svg: `<path d="M6.7 8.6 12 13.9l5.3-5.3 1.7 1.7-7 7-7-7z" fill="currentColor"/>` },
  // FSD-08B: weather (drawn in-house): navy cloud bodies; the sun, rain drops and lightning are the icon-red accent.
  sunny: { viewBox: "0 0 24 24", svg: `<circle cx="12" cy="12" r="4.6" fill="currentColor"/><path ${A} d="M11 1.5h2v3.2h-2zM11 19.3h2v3.2h-2zM1.5 11h3.2v2H1.5zM19.3 11h3.2v2h-3.2zM4.2 5.6l1.4-1.4 2.3 2.3-1.4 1.4zM16.1 17.5l1.4-1.4 2.3 2.3-1.4 1.4zM4.2 18.4l2.3-2.3 1.4 1.4-2.3 2.3zM16.1 6.5l2.3-2.3 1.4 1.4-2.3 2.3z"/>` },
  cloudy: { viewBox: "0 0 24 24", svg: `<circle ${A} cx="8" cy="8" r="3.4"/><path d="M7.5 19.5a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17.4 10.2a4.65 4.65 0 0 1-.4 9.3z" fill="currentColor"/>` },
  rainy: { viewBox: "0 0 24 24", svg: `<path d="M7.5 15a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17.4 5.7a4.65 4.65 0 0 1-.4 9.3z" fill="currentColor"/><path ${A} d="M7.6 17.2l1.7.6-1.3 3.7-1.7-.6zM11.6 17.2l1.7.6-1.3 3.7-1.7-.6zM15.6 17.2l1.7.6-1.3 3.7-1.7-.6z"/>` },
  storm: { viewBox: "0 0 24 24", svg: `<path d="M7.5 15a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17.4 5.7a4.65 4.65 0 0 1-.4 9.3z" fill="currentColor"/><path ${A} d="M12.6 13.2h3.2l-2.2 3.6h2.2l-5 6 1.4-4.6H9.9z"/>` },
  // FSD-08A-4 D2: the steps sheet button; the eraser end (a cut-out of the body) is the icon-red accent.
  pencil: { viewBox: "0 0 256 256", svg: `<path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM192,108.68,147.31,64l24-24L216,84.68Z" fill="currentColor"/><path ${I} d="M192,108.68,147.31,64l24-24L216,84.68Z"/>` },
  // Designer exception: the car body is icon-red and the cabin navy (spec 8.11 Progress/Trip).
  car: { viewBox: "0 0 34 22", svg: `<path ${A} d="M3 10h5l4-7h10l5 7h3a2 2 0 0 1 2 2v5H1v-5a2 2 0 0 1 2-2z"/><path d="M20 3h2l5 7h-7z" fill="currentColor"/><circle cx="9" cy="17" r="3.6" fill="currentColor"/><circle ${K} cx="9" cy="17" r="1.3"/><circle cx="25" cy="17" r="3.6" fill="currentColor"/><circle ${K} cx="25" cy="17" r="1.3"/>` },
  // Decorative, single-colour link-blue in the designer's file ([延伸] exception to two-tone).
  spark: { viewBox: "0 0 16 16", svg: `<path class="yx-i-link" d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6z"/>` },
  lock: { viewBox: "0 0 256 256", svg: `<path d="M208,80H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80Zm-80,84a12,12,0,1,1,12-12A12,12,0,0,1,128,164Zm32-84H96V56a32,32,0,0,1,64,0Z" fill="currentColor"/><circle ${I} cx="128" cy="152" r="12"/>` },
  confetti: { viewBox: "0 0 256 256", svg: `<path d="M111.49,52.63a15.8,15.8,0,0,0-26,5.77L33,202.78A15.83,15.83,0,0,0,47.76,224a16,16,0,0,0,5.46-1l144.37-52.5a15.8,15.8,0,0,0,5.78-26ZM65.14,161.13l19.2-52.79,63.32,63.32-52.8,19.2Z" fill="currentColor"/><path ${A} d="M160,72a37.8,37.8,0,0,1,3.84-15.58C169.14,45.83,179.14,40,192,40c6.7,0,11-2.29,13.65-7.21A22,22,0,0,0,208,23.94,8,8,0,0,1,224,24c0,12.86-8.52,32-32,32-6.7,0-11,2.29-13.65,7.21A22,22,0,0,0,176,72.06,8,8,0,0,1,160,72ZM136,40V16a8,8,0,0,1,16,0V40a8,8,0,0,1-16,0Zm101.66,82.34a8,8,0,1,1-11.32,11.31l-16-16a8,8,0,0,1,11.32-11.32Zm4.87-42.75-24,8a8,8,0,0,1-5.06-15.18l24-8a8,8,0,0,1,5.06,15.18Z"/>` },
  userPlus: { viewBox: "0 0 256 256", svg: `<path d="M144,157.68a68,68,0,1,0-71.9,0c-20.65,6.76-39.23,19.39-54.17,37.17A8,8,0,0,0,24,208H192a8,8,0,0,0,6.13-13.15C183.18,177.07,164.6,164.44,144,157.68Z" fill="currentColor"/><path ${A} d="M256,136a8,8,0,0,1-8,8H232v16a8,8,0,0,1-16,0V144H200a8,8,0,0,1,0-16h16V112a8,8,0,0,1,16,0v16h16A8,8,0,0,1,256,136Z"/>` },
  plus: { viewBox: "0 0 256 256", svg: `<path d="M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM184,136H136v48a8,8,0,0,1-16,0V136H72a8,8,0,0,1,0-16h48V72a8,8,0,0,1,16,0v48h48a8,8,0,0,1,0,16Z" fill="currentColor"/><path ${I} d="M184,136H136v48a8,8,0,0,1-16,0V136H72a8,8,0,0,1,0-16h48V72a8,8,0,0,1,16,0v48h48a8,8,0,0,1,0,16Z"/>` },
  gear: { viewBox: "0 0 256 256", svg: `<path d="M216,130.16q.06-2.16,0-4.32l14.92-18.64a8,8,0,0,0,1.48-7.06,107.6,107.6,0,0,0-10.88-26.25,8,8,0,0,0-6-3.93l-23.72-2.64q-1.48-1.56-3-3L186,40.54a8,8,0,0,0-3.94-6,107.29,107.29,0,0,0-26.25-10.86,8,8,0,0,0-7.06,1.48L130.16,40Q128,40,125.84,40L107.2,25.11a8,8,0,0,0-7.06-1.48A107.6,107.6,0,0,0,73.89,34.51a8,8,0,0,0-3.93,6L67.32,64.27q-1.56,1.49-3,3L40.54,70a8,8,0,0,0-6,3.94,107.71,107.71,0,0,0-10.87,26.25,8,8,0,0,0,1.49,7.06L40,125.84Q40,128,40,130.16L25.11,148.8a8,8,0,0,0-1.48,7.06,107.6,107.6,0,0,0,10.88,26.25,8,8,0,0,0,6,3.93l23.72,2.64q1.49,1.56,3,3L70,215.46a8,8,0,0,0,3.94,6,107.71,107.71,0,0,0,26.25,10.87,8,8,0,0,0,7.06-1.49L125.84,216q2.16.06,4.32,0l18.64,14.92a8,8,0,0,0,7.06,1.48,107.21,107.21,0,0,0,26.25-10.88,8,8,0,0,0,3.93-6l2.64-23.72q1.56-1.48,3-3L215.46,186a8,8,0,0,0,6-3.94,107.71,107.71,0,0,0,10.87-26.25,8,8,0,0,0-1.49-7.06ZM128,168a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z" fill="currentColor"/><circle ${I} cx="128" cy="128" r="22"/>` },
  ticket: { viewBox: "0 0 256 256", svg: `<path d="M232,104a8,8,0,0,0,8-8V64a16,16,0,0,0-16-16H32A16,16,0,0,0,16,64V96a8,8,0,0,0,8,8,24,24,0,0,1,0,48,8,8,0,0,0-8,8v32a16,16,0,0,0,16,16H224a16,16,0,0,0,16-16V160a8,8,0,0,0-8-8,24,24,0,0,1,0-48ZM32,167.2a40,40,0,0,0,0-78.4V64H88V192H32Z" fill="currentColor"/><path ${I} d="M32,167.2a40,40,0,0,0,0-78.4V64H88V192H32Z"/>` },
  check: { viewBox: "0 0 256 256", svg: `<path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM205.66,85.66l-96,96a8,8,0,0,1-11.32,0l-40-40a8,8,0,0,1,11.32-11.32L104,164.69l90.34-90.35a8,8,0,0,1,11.32,11.32Z" fill="currentColor"/><path class="yx-i-accent-stroke" d="M64 136l40 40 96-96" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` },
  pin: { viewBox: "0 0 256 256", svg: `<path d="M128,16a88.1,88.1,0,0,0-88,88c0,75.3,80,132.17,83.41,134.55a8,8,0,0,0,9.18,0C136,236.17,216,179.3,216,104A88.1,88.1,0,0,0,128,16Zm0,56a32,32,0,1,1-32,32A32,32,0,0,1,128,72Z" fill="currentColor"/><circle ${I} cx="128" cy="104" r="18"/>` },
  gift: { viewBox: "0 0 256 256", svg: `<path d="M216,72H180.92c.39-.33.79-.65,1.17-1A29.53,29.53,0,0,0,192,49.57,32.62,32.62,0,0,0,158.44,16,29.53,29.53,0,0,0,137,25.91a54.94,54.94,0,0,0-9,14.48,54.94,54.94,0,0,0-9-14.48A29.53,29.53,0,0,0,97.56,16,32.62,32.62,0,0,0,64,49.57,29.53,29.53,0,0,0,73.91,71c.38.33.78.65,1.17,1H40A16,16,0,0,0,24,88v32a16,16,0,0,0,16,16v64a16,16,0,0,0,16,16h60a4,4,0,0,0,4-4V120H40V88h80v32h16V88h80v32H136v92a4,4,0,0,0,4,4h60a16,16,0,0,0,16-16V136a16,16,0,0,0,16-16V88A16,16,0,0,0,216,72Z" fill="currentColor"/><path ${A} d="M84.51,59a13.69,13.69,0,0,1-4.5-10A16.62,16.62,0,0,1,96.59,32h.49a13.69,13.69,0,0,1,10,4.5c8.39,9.48,11.35,25.2,12.39,34.92C109.71,70.39,94,67.43,84.51,59Zm87,0c-9.49,8.4-25.24,11.36-35,12.4C137.7,60.89,141,45.5,149,36.51a13.69,13.69,0,0,1,10-4.5h.49A16.62,16.62,0,0,1,176,49.08,13.69,13.69,0,0,1,171.49,59Z"/>` },
};

/**
 * Inline SVG icon. Decorative by default (aria-hidden); pass `label` for a standalone, meaningful icon.
 * `mono` renders every part in currentColor, for icons on coloured surfaces such as navy buttons ([延伸]).
 */
export function icon(name: IconName, options: { size?: IconSize; label?: string; mono?: boolean } = {}): string {
  const { viewBox, svg } = ICONS[name];
  const size = options.size ?? 20;
  const a11y = options.label ? `role="img" aria-label="${escapeHtml(options.label)}"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="yx-icon${options.mono ? " yx-icon--mono" : ""}" width="${size}" height="${size}" viewBox="${viewBox}" ${a11y}>${svg}</svg>`;
}

/** The spec's red-square arrow (ch. 7): the square always sits at the arrow's tail. */
export function squareArrow(): string {
  return `<span class="yx-sq-arrow" aria-hidden="true"><i></i><svg class="yx-icon" width="16" height="14" viewBox="0 0 16 14" focusable="false"><path d="M9 1l6 6-6 6M15 7H1" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linejoin="round"/></svg></span>`;
}
