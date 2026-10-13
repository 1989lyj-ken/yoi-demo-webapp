import type { AuthenticatedSession } from "../identity/contracts";
import { chestOverlayView, rewardsRecordView, rewardsView, type ChestOverlayPhase } from "../ui/views";
import { chestStage, type ChestTeamContext } from "./chest-stage";
import { previousWeek } from "../weekly/perfect-week-state";
import { weekOfTaskDate } from "../team/contrib-state";
import { isFirebaseError } from "../firebase/error-kind";
import type { ChestService } from "./chest-service";
import { DailyFormatError } from "../daily/daily-state";
import { balance, ChestFormatError, chestWeeks, ledgerRows, TIER_LABEL, unopenedChests, type ChestOpen, type DayClaim, type PointBonus } from "./chest-state";

export interface RewardsPanel {
  stop(): void;
  isOverlayOpen(): boolean;
  /** Another dialog opened or closed: refresh whether "open chest" may be pressed. */
  refresh(): void;
  /** FSD-08A-1 M1: the points balance as shown (null while anything is unconfirmed). */
  balance(): number | null;
  /** FSD-08A-2 M3: unopened chests, only when every week's chest is confirmed (null otherwise). */
  unopenedCount(): number | null;
  /** UX-1010 F12: the viewer's own chest of a week (null while unconfirmed or without one). */
  ownChest(weekId: string): "unopened" | "opened" | null;
}

interface Hooks {
  isStale(): boolean;
  /** The yesterday prompt, the coupon congratulation or the team dialog is open: opening waits. */
  otherDialogOpen(): boolean;
  /** The opening dialog closed: the page re-evaluates postponed prompts (yesterday first, then the coupon). */
  onOverlayClosed(): void;
  /** FSD-07A referral bonus points; null while not server-confirmed (balance and record then show syncing). */
  bonuses(): PointBonus[] | null;
  /** FSD-08A-2 M3: called after every render (the bell re-derives its notices). */
  onRendered?(): void;
  /** FSD-08A-6: the team block's view of this week for the chest card (null while unknown). */
  teamContext?(): ChestTeamContext | null;
}

/** Minimum time the animation plays before revealing a confirmed result (skipping shortens it). */
const REVEAL_MS = 1600;

/**
 * FSD-06A in the shared screen: the points balance (claimed daily points + opened chests, nothing
 * stored), unopened chests with the opening dialog, and the points record. Only server-confirmed
 * snapshots count: anything unconfirmed or malformed shows "—" / "syncing" instead of a number.
 */
export function mountRewardsPanel(session: AuthenticatedSession, service: ChestService, hooks: Hooks): RewardsPanel {
  const content = document.querySelector<HTMLElement>("#rewards-content")!;
  // FSD-08A-3: the shell shows the points record after the coupons (its own box); the diagnostics view has none.
  const recordBox = document.querySelector<HTMLElement>("#rewards-record");
  // FSD-08A-6: the shell's chest tab (the diagnostics view keeps the chest card inside #rewards-content).
  const chestsBox = document.querySelector<HTMLElement>("#rewards-chests");
  const errorBox = document.querySelector<HTMLElement>("#rewards-error")!;
  const today = session.context.scenarioNow.slice(0, 10);
  let days: DayClaim[] = [];
  let daysConfirmed = false;
  let opens: ChestOpen[] = [];
  let opensConfirmed = false;
  let failedRead = false;
  let failedAwards = false;
  const awards = new Map<string, boolean | null>();
  const awardStops = new Map<string, () => void>();
  const stops: (() => void)[] = [];
  let stopped = false;
  let busy = false;
  let overlay: HTMLElement | null = null;
  let lastUnopened: number | null = null;
  let chestsKnown = false;

  const showError = (message: string) => { errorBox.textContent = message; errorBox.hidden = false; };
  const failed = (error: Error, awardsOnly = false) => {
    if (stopped || hooks.isStale()) return;
    if (awardsOnly) failedAwards = true; else failedRead = true;
    showError(error instanceof ChestFormatError || error instanceof DailyFormatError ? error.message
      : isFirebaseError(error) ? "無法讀取點數或寶箱；請確認連線或重新載入。" : error.message);
    render();
  };

  function render() {
    if (stopped || hooks.isStale()) return;
    const bonuses = hooks.bonuses();
    const listsOk = daysConfirmed && opensConfirmed && !failedRead && bonuses !== null;
    const weeks = daysConfirmed ? chestWeeks(days.map((d) => d.taskDate), today) : [];
    const awardsOk = listsOk && !failedAwards && weeks.length > 0 && weeks.every((w) => awards.get(w) !== undefined && awards.get(w) !== null);
    const rows = listsOk ? ledgerRows(days, opens, bonuses ?? []) : null;
    const chestList = awardsOk ? unopenedChests(awards, opens) : null;
    chestsKnown = awardsOk;
    const input = {
      balance: listsOk ? balance(days, opens, bonuses ?? []) : null,
      chests: chestList,
      rows,
      canOpen: !busy && !hooks.otherDialogOpen() && !overlay,
      stage: chestsBox ? chestStage(chestList, listsOk ? opens : null, hooks.teamContext?.() ?? null, previousWeek(weekOfTaskDate(today)), weekOfTaskDate(today)) : undefined,
    };
    const html = rewardsView(input, chestsBox ? "balance" : recordBox ? "top" : "all");
    if (content.dataset.html !== html) { content.innerHTML = html; content.dataset.html = html; }
    if (chestsBox) {
      const chestHtml = rewardsView(input, "chests");
      if (chestsBox.dataset.html !== chestHtml) { chestsBox.innerHTML = chestHtml; chestsBox.dataset.html = chestHtml; }
    }
    if (recordBox) {
      const record = rewardsRecordView(rows);
      if (recordBox.dataset.html !== record) { recordBox.innerHTML = record; recordBox.dataset.html = record; }
    }
    lastUnopened = awardsOk ? unopenedChests(awards, opens).length : null;
    hooks.onRendered?.();
  }

  /** M2: one listener per week from the earliest own daily document to this week (weekOfTaskDate, as everywhere). */
  function syncAwardWeeks() {
    if (!daysConfirmed || stopped) return;
    for (const weekId of chestWeeks(days.map((d) => d.taskDate), today)) {
      if (awardStops.has(weekId)) continue;
      awardStops.set(weekId, service.subscribeAward(session, weekId,
        (has, confirmed) => { awards.set(weekId, confirmed ? has : null); render(); },
        (error) => { awards.set(weekId, null); failed(error, true); }));
    }
  }

  stops.push(service.subscribeDays(session, (next, confirmed) => {
    days = next; daysConfirmed = confirmed; syncAwardWeeks(); render();
  }, failed));
  stops.push(service.subscribeOpens(session, (next, confirmed) => { opens = next; opensConfirmed = confirmed; render(); }, failed));

  // ----- Opening dialog -----

  let removeKeys: (() => void) | undefined;

  function setOverlay(phase: ChestOverlayPhase) {
    if (!overlay) return;
    overlay.innerHTML = chestOverlayView(phase);
    overlay.querySelector<HTMLButtonElement>("#chest-close")?.addEventListener("click", () => closeOverlay());
    if (phase.kind === "result") rollReel(overlay, phase.points, phase.tier === "大獎" || phase.tier === "超級獎");
    // After "skip" the button is gone: focus the title so the keyboard stays inside the dialog.
    (overlay.querySelector<HTMLElement>("#chest-skip, #chest-close") ?? overlay.querySelector<HTMLElement>("#chest-overlay-title"))?.focus();
  }

  /**
   * FSD-08A-6 (UI-design 3-6): the prize number rolls and lands on the confirmed points (display only; the value is
   * already confirmed). With the system's reduced-motion setting it shows the number at once.
   */
  // FSD-08A-6 (4): 基本獎／小獎 use the design's basic reel (1 lap, 400 ms); 大獎／超級獎 the super reel (4 laps, 900 ms).
  function rollReel(root: HTMLElement, points: number, big: boolean) {
    const strip = root.querySelector<HTMLElement>(".chest-strip");
    if (!strip || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const lap = (big ? [10, 20, 30, 40, 50] : [1, 2, 3, 5, 8]).filter((v) => v !== points);
    const values = Array.from({ length: big ? 4 : 1 }, () => lap).flat();
    strip.innerHTML = [...values, points].map((v) => `<i>${v}</i>`).join("");
    const height = strip.firstElementChild?.getBoundingClientRect().height || 31;
    const distance = values.length * height;
    const duration = big ? 900 : 400;
    const start = performance.now() + 420; // after the prize card rises
    const step = (now: number) => {
      if (!strip.isConnected) return;
      const p = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = 1 - Math.pow(1 - p, 4);
      strip.style.setProperty("--reel", `${-distance * eased}px`);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function trapKeys() {
    const onKey = (event: KeyboardEvent) => {
      if (!overlay) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (overlay.querySelector("#chest-close")) closeOverlay();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...overlay.querySelectorAll<HTMLElement>("button:not([disabled])")];
      event.preventDefault();
      if (focusable.length === 0) { overlay.querySelector<HTMLElement>("#chest-overlay-title")?.focus(); return; }
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length].focus();
    };
    document.addEventListener("keydown", onKey, true);
    removeKeys = () => document.removeEventListener("keydown", onKey, true);
  }

  function closeOverlay() {
    removeKeys?.(); removeKeys = undefined;
    // FSD-08A-6 QA B3: in the shell the chest card is on the 寶箱 tab (the #rewards section may be hidden there).
    (chestsBox ?? document.querySelector<HTMLElement>("#rewards"))?.focus();
    overlay?.remove();
    overlay = null;
    render();
    if (!stopped && !hooks.isStale()) hooks.onOverlayClosed();
  }

  async function openChest(weekId: string) {
    if (busy || overlay || stopped || hooks.isStale() || hooks.otherDialogOpen()) return;
    busy = true;
    errorBox.hidden = true;
    overlay = document.createElement("div");
    overlay.id = "chest-overlay";
    overlay.className = "yo-chest-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "chest-overlay-title");
    document.body.append(overlay);
    trapKeys();
    let revealAt = Date.now() + REVEAL_MS;
    let wake: (() => void) | null = null;
    setOverlay({ kind: "opening", skipped: false });
    overlay.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).id !== "chest-skip") return;
      // Skipping never shows a number early: it waits for the server's confirmation only.
      revealAt = 0; setOverlay({ kind: "opening", skipped: true }); wake?.();
    });
    render();
    let result: Awaited<ReturnType<ChestService["open"]>>;
    try { result = await service.open(session, weekId); }
    catch (error) { result = { kind: error instanceof Error && error.message.includes("登入身分") ? "identity" : "failed" }; }
    const wait = revealAt - Date.now();
    if (wait > 0) await new Promise<void>((resolve) => { wake = resolve; setTimeout(resolve, wait); });
    busy = false;
    if (stopped || hooks.isStale() || !overlay) return;
    if (result.kind === "opened" || result.kind === "exists") {
      setOverlay({ kind: "result", points: result.open.points, tier: TIER_LABEL[result.open.tier] });
    } else {
      setOverlay({ kind: "failed", message: result.kind === "missing" ? "找不到這個寶箱；請重新載入後再試。"
        : result.kind === "identity" ? "展示身分已變更，請重新登入。"
        : result.kind === "stale" ? "共用情境已更新，請重新載入。"
        : "開箱未完成，請再試一次。" });
    }
  }

  const onChestClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-open-chest]");
    if (button && !button.disabled) void openChest(button.dataset.openChest ?? "");
  };
  content.addEventListener("click", onChestClick);
  chestsBox?.addEventListener("click", onChestClick);

  const observer = new MutationObserver(() => render());
  observer.observe(document.body, { childList: true });

  render();
  return {
    stop() {
      stopped = true;
      observer.disconnect();
      removeKeys?.(); removeKeys = undefined;
      for (const stop of stops) stop();
      for (const stop of awardStops.values()) stop();
      awardStops.clear();
      overlay?.remove();
      overlay = null;
    },
    isOverlayOpen: () => overlay !== null,
    refresh: () => render(),
    unopenedCount: () => lastUnopened,
    ownChest: (weekId) => (!chestsKnown ? null : opens.some((o) => o.weekId === weekId) ? "opened" : awards.get(weekId) === true ? "unopened" : null),
    balance: () => {
      const bonuses = hooks.bonuses();
      return daysConfirmed && opensConfirmed && !failedRead && bonuses !== null ? balance(days, opens, bonuses) : null;
    },
  };
}
