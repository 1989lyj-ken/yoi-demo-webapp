import type { AuthenticatedSession } from "../identity/contracts";
import { couponPromptView, couponsView, perfectWeekView, type CouponCard, type PerfectWeekCard, type PerfectWeekState } from "../ui/views";
import { isFirebaseError } from "../firebase/error-kind";
import { CouponSettler } from "./perfect-week-settler";
import type { PerfectWeekService } from "./perfect-week-service";
import {
  couponActive, CouponFormatError, promptKey, promptPlan, settledWeeks, weekDays, weekVerdict,
  type Coupon, type DayDoc, firstUseDay } from "./perfect-week-state";

export interface PerfectWeekPanel {
  stop(): void;
  isPromptOpen(): boolean;
  /** Re-evaluates the congratulation (after another dialog closed). */
  evaluatePrompt(): void;
  /** Re-renders after outside data changed (FSD-07A referral coupons). */
  refresh(): void;
  /** FSD-08A-2 M3: the viewer's weekly coupons, null while not server-confirmed (read-only, for the bell). */
  confirmedCoupons(): Coupon[] | null;
}

interface Hooks {
  isStale(): boolean;
  /** FSD-07A referral coupons; null while not server-confirmed (the whole list then shows syncing). */
  extraCoupons(): CouponCard[] | null;
  /** FSD-08A-1 M2: called before scrolling to the coupons (the shell switches to their page first). */
  beforeGoCoupons?(): void;
  /** FSD-08A-2 M3: called after every render (the bell re-derives its notices). */
  onRendered?(): void;
  /** Another dialog (team dialog or yesterday prompt) is open: postpone the congratulation. */
  otherDialogOpen(): boolean;
  /** The congratulation closed: the page re-evaluates postponed dialogs (yesterday prompt first). */
  onPromptClosed(): void;
}

/** Seen coupons for this page (all mounts), used when localStorage is unavailable. */
const seenInMemory = new Set<string>();

function storage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

/**
 * FSD-04A in the shared screen: the current and previous week's seven days (both settled every day,
 * Q1-A; the previous week is shown on Mondays only), the coupon list with the simulated fare check, and
 * the once-per-device congratulation. Only server-confirmed snapshots count.
 */
export function mountPerfectWeekPanel(session: AuthenticatedSession, service: PerfectWeekService, hooks: Hooks): PerfectWeekPanel {
  const content = document.querySelector<HTMLElement>("#perfect-week-content")!;
  const couponsBox = document.querySelector<HTMLElement>("#coupons-content")!;
  const errorBox = document.querySelector<HTMLElement>("#perfect-week-error")!;
  const today = session.context.scenarioNow.slice(0, 10);
  const now = session.context.scenarioNow;
  const weeks = settledWeeks(today);
  const isMonday = today === weeks.current;
  const docs = new Map<string, (DayDoc | null | undefined)[]>([[weeks.current, Array(7).fill(undefined)], [weeks.previous, Array(7).fill(undefined)]]);
  let coupons: Coupon[] = [];
  let couponsConfirmed = false;
  let stopped = false;
  let promptEl: HTMLElement | null = null;
  const unsubscribes: (() => void)[] = [];
  const port = service.portFor(session);
  const settlers = new Map([weeks.current, weeks.previous].map((weekId) => [weekId, new CouponSettler(port, () => render())]));

  const showError = (message: string) => { errorBox.textContent = message; errorBox.hidden = false; };
  const failed = (error: Error) => {
    if (stopped || hooks.isStale()) return;
    showError(error instanceof CouponFormatError || (error instanceof Error && error.name === "DailyFormatError") ? error.message
      : isFirebaseError(error) ? "無法讀取全勤進度或乘車券；請確認連線或重新載入。" : error.message);
  };

  function card(weekId: string, label: "本週" | "上週"): PerfectWeekCard {
    const days = docs.get(weekId)!;
    const verdict = weekVerdict(weekId, days, today);
    const settler = settlers.get(weekId)!;
    const has = couponsConfirmed && coupons.some((c) => c.weekId === weekId);
    const state: PerfectWeekState = !verdict.confirmed || !couponsConfirmed ? "unconfirmed"
      : has ? "issued" : verdict.eligible ? (settler.identityChanged ? "identity" : settler.issuing ? "issuing" : settler.pending || settler.blocked ? "pending" : "issuing")
      : verdict.closed ? "closed" : "open";
    // FSD-08A-3 B3: the picked day's line reads the documents this panel already subscribes to (no new reads).
    // UX-1010 F14: days before the first one with a document (this or last week) are "not started", not missed.
    const all = [weeks.previous, weeks.current].flatMap((w) => weekDays(w).map((taskDate, i) => ({ taskDate, doc: docs.get(w)![i] })));
    const start = all.some((d) => d.doc === undefined) ? null : firstUseDay(all);
    const shown = verdict.days.map((d, i) => { const doc = days[i]; return { ...d, effectiveSteps: doc ? doc.effectiveSteps : doc === null ? 0 : null, claimed: doc ? doc.claimed : doc === null ? 0 : null,
      ride: !!doc?.ride, beforeStart: start !== null && d.taskDate < start && d.status !== "achieved" }; });
    return { label, confirmed: verdict.confirmed, achievedCount: verdict.achievedCount, days: shown, state, today };
  }

  let cards: CouponCard[] = [];
  /** UX-1010 F14: the picked day (none by default); it survives the re-render of every snapshot. */
  let selected: string | null = null;
  function render() {
    if (stopped || hooks.isStale()) return;
    if ([...settlers.values()].some((s) => s.identityChanged)) showError("展示身分已變更，請重新登入。");
    const current = card(weeks.current, "本週");
    const focused = (document.activeElement as HTMLElement | null)?.closest?.("[data-select-date]")?.getAttribute("data-select-date") ?? null;
    content.innerHTML = perfectWeekView(current, isMonday ? card(weeks.previous, "上週") : null, selected);
    if (focused) content.querySelector<HTMLElement>(`[data-select-date="${CSS.escape(focused)}"]`)?.focus();
    // Keep a fare being typed: re-render the list only when the coupons themselves change.
    const extra = hooks.extraCoupons();
    cards = couponsConfirmed && extra ? [...coupons.map((c): CouponCard => ({ key: `week-${c.weekId}`, kind: "weeklyPerfect", issuedAt: c.issuedAt, expiresAt: c.expiresAt,
      active: couponActive(c, now), faceValue: c.faceValue, minFare: c.minFare })), ...extra] : [];
    const html = couponsView(couponsConfirmed && extra ? cards : null);
    if (couponsBox.dataset.html !== html) { couponsBox.innerHTML = html; couponsBox.dataset.html = html; }
    hooks.onRendered?.();
  }

  function offer(weekId: string) {
    if (stopped || hooks.isStale()) return;
    settlers.get(weekId)!.offer({ weekId, docs: docs.get(weekId)!, hasCoupon: coupons.some((c) => c.weekId === weekId),
      confirmed: couponsConfirmed, today });
  }

  // ----- Congratulation (once per coupon per device) -----

  const seenKey = (c: Coupon) => promptKey(session.context.sessionId, session.member.memberId, c.weekId);
  function isSeen(c: Coupon): boolean {
    if (seenInMemory.has(seenKey(c))) return true;
    try { return storage()?.getItem(seenKey(c)) === "1"; } catch { return false; }
  }
  function markSeen(c: Coupon) {
    seenInMemory.add(seenKey(c));
    try { storage()?.setItem(seenKey(c), "1"); } catch { /* memory only */ }
  }

  /** The member closed it: only now is the shown coupon recorded as seen (a reload or clock change re-shows it). */
  function closePrompt(shown: Coupon, after?: () => void) {
    markSeen(shown);
    promptEl?.remove();
    promptEl = null;
    after?.();                // move focus first, then let a postponed dialog open on top
    hooks.onPromptClosed();
  }

  function evaluatePrompt() {
    if (stopped || hooks.isStale() || promptEl || !couponsConfirmed || hooks.otherDialogOpen()) return;
    const plan = promptPlan(coupons, isSeen);
    const shown = plan.show;
    if (!shown) return;
    // Older unseen coupons are recorded silently (one dialog only); the shown one waits for the member.
    plan.markSeen.filter((c) => c.weekId !== shown.weekId).forEach(markSeen);
    promptEl = document.createElement("div");
    promptEl.id = "coupon-prompt";
    promptEl.className = "stale-overlay";
    promptEl.setAttribute("role", "alertdialog");
    promptEl.setAttribute("aria-modal", "true");
    promptEl.setAttribute("aria-labelledby", "coupon-prompt-title");
    promptEl.innerHTML = couponPromptView();
    document.body.append(promptEl);
    promptEl.querySelector<HTMLButtonElement>("#coupon-prompt-close")?.addEventListener("click", () => closePrompt(shown));
    promptEl.querySelector<HTMLButtonElement>("#coupon-prompt-go")?.addEventListener("click", () => closePrompt(shown, () => {
      hooks.beforeGoCoupons?.();
      const target = document.querySelector<HTMLElement>("#coupons");
      target?.scrollIntoView({ block: "start" });
      target?.focus();
    }));
    promptEl.querySelector<HTMLButtonElement>("#coupon-prompt-go")?.focus();
  }

  content.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-select-date]");
    if (!button || !button.dataset.selectDate) return;
    // Tapping the same day again shows the whole week again.
    selected = selected === button.dataset.selectDate ? null : button.dataset.selectDate;
    render();
  });
  // A tap anywhere else also goes back to the whole week.
  const onOutside = (event: MouseEvent) => {
    if (selected === null || (event.target as HTMLElement).closest?.("[data-select-date]")) return;
    selected = null;
    render();
  };
  document.addEventListener("click", onOutside);

  // ----- Subscriptions: 14 own daily documents and the coupon list -----

  for (const weekId of [weeks.current, weeks.previous]) {
    weekDays(weekId).forEach((taskDate, i) => {
      unsubscribes.push(service.subscribeDay(session, taskDate, (day, confirmed) => {
        docs.get(weekId)![i] = confirmed ? day : undefined;
        offer(weekId);
        render();
      }, (error) => { docs.get(weekId)![i] = undefined; failed(error); render(); }));
    });
  }
  unsubscribes.push(service.subscribeCoupons(session, (list, confirmed) => {
    coupons = list;
    couponsConfirmed = confirmed;
    offer(weeks.current);
    offer(weeks.previous);
    render();
    if (confirmed) evaluatePrompt();
  }, (error) => { couponsConfirmed = false; failed(error); render(); }));
  render();

  return {
    stop() {
      stopped = true;
      document.removeEventListener("click", onOutside);
      unsubscribes.forEach((u) => u());
      settlers.forEach((s) => s.cancel());
      promptEl?.remove();
      promptEl = null;
    },
    isPromptOpen: () => promptEl !== null,
    evaluatePrompt,
    refresh: () => render(),
    confirmedCoupons: () => (couponsConfirmed ? [...coupons] : null),
  };
}
