import { bellView, drawerView, guideSeenKey, guideView, type GuidePage, introPageView, inviteCardView, navButtonView, noticesView, rideCelebrationView, UPCOMING_NOTE, weatherButtonView, weatherDialogView } from "../ui/views";
import type { RideCelebration } from "../daily/today-card";
import { createWeatherController } from "../weather/weather-controller";
import type { Forecast } from "../weather/weather-state";
import { mountMapHero } from "./map-hero";
import { deriveNotices, noticeKey, unreadCount, type NoticeInputs, type NoticeList, type NoticeType, noticeClearedKey, visibleNotices } from "./notices";
import { closesSheet, inviteCard, UPCOMING_INTRO, parsePage, sheetMessage, SHELL_PAGES, type ShellPage, type StepsResult, type TeamSummary } from "./shell-state";

export interface AppShell {
  /** M2: switch to a page first (unhides it synchronously), so a scroll or focus that follows works. */
  goto(page: ShellPage, focusTitle?: boolean): void;
  /** The menu drawer or the notice panel is open (both postpone the prompts, FSD-08A-2 M5). */
  isDrawerOpen(): boolean;
  /** Silently closes the drawer and the notice panel and removes their key handling (stop and the stale overlay). */
  closeDrawer(silent?: boolean): void;
  /** FSD-08A-2: re-derive the bell's notices (called when any of their sources changed). */
  refreshNotices(): void;
  /** Re-renders the parts fed by the panels (invite card, the drawer's balance). */
  refresh(): void;
  /**
   * Today's server-confirmed steps (null while unconfirmed). The map's big count shows the effective steps with the
   * ride line under it (FSD-08C S8); the steps sheet's field uses the raw steps. Held while the sheet is open (FSD-08A-4 B2).
   */
  setTodaySteps(day: TodaySteps | null): void;
  /** FSD-08C S6: the celebration after a confirmed ride; `onClaim` runs when its button claims (it closes first). */
  celebrateRide(c: RideCelebration, onClaim: () => void): void;
  /** FSD-08A-4 B3: today's "save steps" command started or ended. */
  stepsResult(result: StepsResult): void;
  /** FSD-08A-6: selects the tab holding this element (if it sits in a tab panel) so a scroll or focus can follow. */
  reveal(selector: string): void;
  stop(): void;
}

export interface ShellHooks {
  isStale(): boolean;
  /** Another dialog (yesterday prompt, coupon congratulation, team dialog, chest opening) is open. */
  otherDialogOpen(): boolean;
  /** The drawer closed: re-evaluate postponed prompts (yesterday first, then the coupon) and refresh rewards. */
  onDrawerChanged(open: boolean): void;
  balance(): number | null;
  teamSummary(): TeamSummary;
  onLogout(): void;
  onAdmin?(): void;
  /** FSD-08A-2: back to the yoxi home mock. */
  onHome(): void;
  /** 2026-10-12: the image of an upcoming feature's intro page (index into UPCOMING_INTRO). */
  introImage?(index: number): string | null;
  /** FSD-PA: the public build's tools in the menu (ids start with "tool-") and what they do. */
  tools?(): { id: string; label: string }[];
  onTool?(id: string): void;
  /** FSD-PA-09: the public build answers the weather from its simulation instead of Open-Meteo. */
  weatherFetch?(url: string, init?: RequestInit): Promise<Response>;
  /** FSD-PA: the member closed the play guide (the public build then shows the 功能體驗清單 once). */
  onGuideClosed?(): void;
  /** FSD-08A-2: the bell's sources (null = not server-confirmed). */
  notices(): NoticeInputs;
}

export interface TodaySteps { raw: number; effective: number; ride: boolean }

export interface ShellIdentity { displayName: string; memberId: string; role: "member" | "admin"; sessionId: string; taskDate: string }

/** Read notices on this device; memory fallback when storage is unavailable (as 04A's seen coupons). */
const readInMemory = new Map<string, string>();
function storage(): Storage | null { try { return window.localStorage; } catch { return null; } }

const TAB_TARGETS = "button:not([disabled]), input:not([disabled])";
/** FSD-08B QA B1: the weather dialog also has links and a scrollable hour list in the Tab loop. */
const WEATHER_TAB_TARGETS = "button:not([disabled]), a[href], [tabindex=\"0\"]";

/** Keeps Tab inside an open sheet and closes it on Escape. Returns the remover. */
function trapKeys(sheet: () => HTMLElement | null, close: () => void, targets = TAB_TARGETS): () => void {
  const onKey = (event: KeyboardEvent) => {
    const el = sheet();
    if (!el) return;
    // FSD-08B C4: an Escape that cancels an input method's composition never closes the sheet.
    if (event.key === "Escape") { if (event.isComposing || event.keyCode === 229) return; event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    // FSD-08A-4 C1: the steps sheet has a field, so inputs take part in the Tab loop too.
    const focusable = [...el.querySelectorAll<HTMLElement>(targets)];
    if (focusable.length === 0) return;
    event.preventDefault();
    const index = focusable.indexOf(document.activeElement as HTMLElement);
    focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length].focus();
  };
  document.addEventListener("keydown", onKey, true);
  return () => document.removeEventListener("keydown", onKey, true);
}

/**
 * FSD-08A-1: the four-page shell around the shared panels. Pages only toggle `hidden` (the panels stay
 * mounted); the page is kept in the URL hash with replaceState (M4: no history entries, and a hash change
 * while any overlay is open is reverted). The drawer lives on <body> and makes #app inert while open (M3).
 */
export function mountAppShell(root: HTMLElement, identity: ShellIdentity, hooks: ShellHooks): AppShell {
  const app = root.querySelector<HTMLElement>(".app-shell")!;
  const menuButton = root.querySelector<HTMLButtonElement>("#menu-button")!;
  const inviteBox = root.querySelector<HTMLElement>("#invite-card")!;
  let page: ShellPage = parsePage(location.hash);
  let drawer: HTMLElement | null = null;
  let drawerNote: string | null = null;
  let accountOpen = false;
  let removeKeys: (() => void) | undefined;
  let stopped = false;
  let lastInvite = "";
  const sheet = root.querySelector<HTMLElement>("#steps-sheet");
  const sheetButton = () => root.querySelector<HTMLButtonElement>("#steps-sheet-open");
  let sheetOpen = false;
  let sheetSaving = false;
  let sheetFailure: string | null = null;
  let removeSheetKeys: (() => void) | undefined;
  /** The latest confirmed raw steps (B2: held while the sheet is open). */
  let todaySteps: number | null = null;
  /** FSD-08C S8: the latest confirmed effective steps, for the map (UX-1010 F16: the ride line now sits in the card). */
  let todayDay: TodaySteps | null = null;
  function showMapSteps() {
    map.setSteps(todayDay ? todayDay.effective : null);
  }
  // ----- FSD-08B: weather on the map (the controller writes only #map-weather; the dialog is #weather-dialog) -----
  const weatherBox = root.querySelector<HTMLElement>("#map-weather");
  let forecast: Forecast | null = null;
  let forecastAt: number | null = null;
  let weather: HTMLElement | null = null;
  let removeWeatherKeys: (() => void) | undefined;
  const weatherCtl = createWeatherController({
    fetch: (url, init) => (hooks.weatherFetch ? hooks.weatherFetch(url, init) : window.fetch(url, init)),
    now: () => Date.now(),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (id) => window.clearTimeout(id as number),
    onChange: (next, at) => {
      if (stopped) return;
      forecast = next; forecastAt = at;
      renderWeatherButton();
      if (!next) closeWeather();
    },
  });
  function renderWeatherButton() {
    if (!weatherBox) return;
    const hadFocus = weatherBox.contains(document.activeElement);
    weatherBox.innerHTML = weatherButtonView(forecast);
    if (hadFocus) (weatherBox.querySelector<HTMLElement>("#weather-open") ?? root.querySelector<HTMLElement>(".yo-location-pill"))?.focus();
  }
  const map = mountMapHero(root.querySelector<HTMLElement>("#map-hero")!, {
    isStale: hooks.isStale,
    onFix: (lat, lng) => weatherCtl.onFix(lat, lng),
    onLost: () => weatherCtl.onLost(),
    onPause: () => weatherCtl.pause(),
  });

  let panel: HTMLElement | null = null;
  let removePanelKeys: (() => void) | undefined;
  const bellSlot = root.querySelector<HTMLElement>("#bell-slot")!;
  // FSD-08C S6: the ride celebration (declared before overlayOpen, which reads it).
  let ride: HTMLElement | null = null;
  let removeRideKeys: (() => void) | undefined;
  let rideTimer: number | undefined;
  const overlayOpen = () => drawer !== null || panel !== null || sheetOpen || guide !== null || weather !== null || ride !== null || intro !== null || hooks.otherDialogOpen() || document.querySelector(".stale-overlay, #chest-overlay, #yesterday-prompt, #coupon-prompt") !== null;

  function show(next: ShellPage, focusTitle: boolean) {
    page = next;
    for (const id of SHELL_PAGES) {
      const section = root.querySelector<HTMLElement>(`[data-page="${id}"]`);
      if (section) section.hidden = id !== next;
      const nav = root.querySelector<HTMLButtonElement>(`[data-nav="${id}"]`);
      if (nav) {
        nav.classList.toggle("selected", id === next);
        if (id === next) nav.setAttribute("aria-current", "page"); else nav.removeAttribute("aria-current");
        nav.innerHTML = navButtonView(id, id === next);
      }
    }
    history.replaceState(null, "", `#${next}`);
    map.setVisible(next === "steps");
    if (focusTitle) { window.scrollTo(0, 0); root.querySelector<HTMLElement>(`#page-${next}-title`)?.focus(); }
  }

  function goto(next: ShellPage, focusTitle = false) {
    if (stopped) return;
    show(next, focusTitle);
  }

  const onHash = () => {
    const next = parsePage(location.hash);
    if (next === page) { if (location.hash !== `#${page}`) history.replaceState(null, "", `#${page}`); return; }
    if (overlayOpen()) { history.replaceState(null, "", `#${page}`); return; }
    show(next, true);
  };
  window.addEventListener("hashchange", onHash);

  root.querySelector<HTMLElement>(".yo-bottom-nav")!.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-nav]");
    if (button) goto(button.dataset.nav as ShellPage, true);
  });

  // ----- Invite card -----

  function renderInvite() {
    const html = inviteCardView(inviteCard(hooks.teamSummary()));
    if (html !== lastInvite) { inviteBox.innerHTML = html; lastInvite = html; }
  }
  inviteBox.addEventListener("click", (event) => {
    const el = event.target as HTMLElement;
    if (el.closest("[data-goto]")) goto("team", true);
    else if (el.closest("#invite-card-copy")) {
      const code = inviteBox.querySelector("#invite-card-code")?.textContent ?? "";
      const done = (text: string) => { el.textContent = text; setTimeout(() => { lastInvite = ""; renderInvite(); }, 2500); };
      if (!navigator.clipboard) { done(`請手動複製：${code}`); return; }
      void navigator.clipboard.writeText(code).then(() => done("已複製"), () => done(`請手動複製：${code}`));
    }
  });

  // ----- Drawer -----

  let lastDrawer = "";
  /** Re-renders only when something shown changed, so focus inside the drawer is not reset by unrelated updates. */
  function renderDrawer() {
    if (!drawer) return;
    const html = drawerView({ ...identity, balance: hooks.balance(), note: drawerNote, accountOpen, tools: hooks.tools?.() });
    if (html === lastDrawer) return;
    lastDrawer = html;
    const focusedMenu = (document.activeElement as HTMLElement | null)?.dataset?.menu;
    drawer.innerHTML = html;
    const again = focusedMenu ? drawer.querySelector<HTMLElement>(`[data-menu="${CSS.escape(focusedMenu)}"]`) : null;
    (again ?? drawer.querySelector<HTMLElement>("#drawer-close"))?.focus();
  }

  function openDrawer() {
    if (drawer || panel || sheetOpen || guide || weather || ride || intro || stopped || hooks.isStale() || hooks.otherDialogOpen()) return;
    drawerNote = null;
    accountOpen = false;
    lastDrawer = "";
    drawer = document.createElement("div");
    drawer.id = "drawer";
    drawer.className = "drawer";
    document.body.append(drawer);
    app.inert = true;
    menuButton.setAttribute("aria-expanded", "true");
    renderDrawer();
    drawer.addEventListener("click", onDrawerClick);
    removeKeys = trapKeys(() => drawer, () => closeDrawer());
    hooks.onDrawerChanged(true);
  }

  function closeDrawer(silent = false) {
    if (silent) closePanel(true);
    if (!drawer) return;
    removeKeys?.(); removeKeys = undefined;
    drawer.remove();
    drawer = null;
    app.inert = false;
    menuButton.setAttribute("aria-expanded", "false");
    if (silent) return;
    menuButton.focus();
    hooks.onDrawerChanged(false);
  }

  function onDrawerClick(event: MouseEvent) {
    const el = event.target as HTMLElement;
    if (el.closest("#drawer-close") || el === drawer) { closeDrawer(); return; }
    // 2026-10-06 (7): fold or unfold the account details (kept while the drawer re-renders; reset on the next open).
    if (el.closest("#drawer-account-toggle")) { accountOpen = !accountOpen; renderDrawer(); drawer?.querySelector<HTMLElement>("#drawer-account-toggle")?.focus(); return; }
    const id = el.closest<HTMLElement>("[data-menu]")?.dataset.menu;
    if (!id) return;
    if (id === "points") { goto("rewards"); reveal("#rewards-content"); closeDrawer(); }
    else if (id === "admin") { closeDrawer(true); hooks.onAdmin?.(); }
    else if (id === "logout") { closeDrawer(); hooks.onLogout(); }
    else if (id === "home") { closeDrawer(true); hooks.onHome(); }
    else if (id.startsWith("tool-")) { closeDrawer(true); hooks.onTool?.(id); }
    else if (id.startsWith("upcoming-")) {
      // 2026-10-12: an upcoming feature opens its intro page (the note stays as the fallback without an image).
      const index = Number(id.slice("upcoming-".length));
      if (UPCOMING_INTRO[index] && hooks.introImage?.(index)) { closeDrawer(true); openIntro(index); }
      else { drawerNote = UPCOMING_NOTE; renderDrawer(); }
    }
  }

  // ----- 2026-10-12: an upcoming feature's intro page (full screen, back closes it) -----
  let intro: HTMLElement | null = null;
  let removeIntroKeys: (() => void) | undefined;
  function openIntro(index: number) {
    const item = UPCOMING_INTRO[index];
    const src = hooks.introImage?.(index);
    if (intro || !item || !src || stopped || hooks.isStale()) return;
    intro = document.createElement("div");
    intro.id = "intro-page";
    intro.className = "intro-page";
    intro.innerHTML = introPageView({ ...item, src });
    document.body.append(intro);
    app.inert = true;
    intro.addEventListener("click", (event) => { if ((event.target as HTMLElement).closest("#intro-back")) closeIntro(); });
    removeIntroKeys = trapKeys(() => intro, () => closeIntro(), "button:not([disabled])");
    intro.querySelector<HTMLElement>("#intro-back")?.focus({ preventScroll: true });
    hooks.onDrawerChanged(true);
  }
  function closeIntro(silent = false) {
    if (!intro) return;
    removeIntroKeys?.(); removeIntroKeys = undefined;
    intro.remove();
    intro = null;
    app.inert = false;
    if (silent) return;
    menuButton.focus();
    hooks.onDrawerChanged(false);
  }

  menuButton.addEventListener("click", openDrawer);

  // ----- Bell and notice panel (FSD-08A-2) -----

  const key = (type: NoticeType) => noticeKey(identity.sessionId, identity.memberId, identity.taskDate, type);
  // 2026-10-06 (5): read and cleared states store the notice's text, so a new or changed notice of the same type shows again today.
  let derived: NoticeList = { confirmed: false, items: [] };
  const textOf = (type: NoticeType) => derived.items.find((n) => n.type === type)?.text ?? "";
  const stored = (k: string) => { if (readInMemory.has(k)) return readInMemory.get(k); try { return storage()?.getItem(k) ?? undefined; } catch { return undefined; } };
  const remember = (k: string, text: string) => { readInMemory.set(k, text); try { storage()?.setItem(k, text); } catch { /* memory only */ } };
  const isRead = (type: NoticeType) => stored(key(type)) === textOf(type);
  const markRead = (type: NoticeType) => remember(key(type), textOf(type));
  // 2026-10-06 (4): cleared types (memory fallback when storage is unavailable).
  const clearedKey = (type: NoticeType) => noticeClearedKey(identity.sessionId, identity.memberId, identity.taskDate, type);
  const isCleared = (type: NoticeType) => stored(clearedKey(type)) === textOf(type);
  const markCleared = (type: NoticeType) => remember(clearedKey(type), textOf(type));
  let list: NoticeList = { confirmed: false, items: [] };
  let lastBell = "";
  let lastPanel = "";
  /** Types unread when the panel opened: they stay bold while it is open, although they are now marked read. */
  let shownUnread = new Set<NoticeType>();
  const panelRead = (type: NoticeType) => !shownUnread.has(type) && isRead(type);

  function renderNotices() {
    if (stopped) return;
    derived = deriveNotices(hooks.notices());
    list = visibleNotices(derived, isCleared);
    // M2: while the panel is open, what it shows is read (a later notice opened in front of the user, too).
    if (panel) for (const n of list.items) markRead(n.type);
    const bell = bellView(unreadCount(list, isRead));
    if (bell !== lastBell) {
      const hadFocus = bellSlot.contains(document.activeElement);
      bellSlot.innerHTML = bell;
      lastBell = bell;
      bellSlot.querySelector("#bell-button")?.setAttribute("aria-expanded", String(panel !== null));
      if (hadFocus) bellSlot.querySelector<HTMLElement>("#bell-button")?.focus();
    }
    if (panel) {
      const html = noticesView(list, panelRead, identity.taskDate);
      if (html !== lastPanel) {
        const focused = (document.activeElement as HTMLElement | null)?.dataset?.notice;
        panel.innerHTML = html;
        lastPanel = html;
        const again = focused ? panel.querySelector<HTMLElement>(`[data-notice="${CSS.escape(focused)}"]`) : null;
        (again ?? panel.querySelector<HTMLElement>("#notices-close"))?.focus();
      }
    }
  }

  function openPanel() {
    if (panel || drawer || sheetOpen || guide || weather || ride || intro || stopped || hooks.isStale() || hooks.otherDialogOpen()) return;
    panel = document.createElement("div");
    panel.id = "notices";
    panel.className = "notices";
    document.body.append(panel);
    app.inert = true;
    shownUnread = new Set(list.items.filter((n) => !isRead(n.type)).map((n) => n.type));
    lastPanel = "";
    for (const n of list.items) markRead(n.type);
    lastBell = "";
    renderNotices();
    panel.querySelector<HTMLElement>("#notices-close")?.focus();
    panel.addEventListener("click", onPanelClick);
    removePanelKeys = trapKeys(() => panel, () => closePanel());
    hooks.onDrawerChanged(true);
  }

  /** `silent`: no focus return and no prompt re-evaluation (stop, stale, or a notice click that navigates). */
  function closePanel(silent = false, reevaluate = !silent) {
    if (!panel) return;
    removePanelKeys?.(); removePanelKeys = undefined;
    panel.remove();
    panel = null;
    shownUnread = new Set();
    app.inert = false;
    lastBell = "";
    renderNotices();
    if (!silent) bellSlot.querySelector<HTMLElement>("#bell-button")?.focus();
    if (reevaluate) hooks.onDrawerChanged(false);
  }

  function onPanelClick(event: MouseEvent) {
    const el = event.target as HTMLElement;
    if (el.closest("#notices-close") || el === panel) { closePanel(); return; }
    if (el.closest("#notices-clear")) {
      for (const n of list.items) { markRead(n.type); markCleared(n.type); }
      renderNotices();
      panel?.querySelector<HTMLElement>("#notices-close")?.focus();
      return;
    }
    const type = el.closest<HTMLElement>("[data-notice]")?.dataset.notice;
    const notice = list.items.find((n) => n.type === type);
    if (!notice) return;
    // M5: close without returning focus to the bell, switch page, scroll and focus the anchor, then re-evaluate prompts.
    closePanel(true, false);
    goto(notice.page);
    reveal(notice.anchor);
    const target = root.querySelector<HTMLElement>(notice.anchor);
    target?.scrollIntoView({ block: "start" });
    target?.focus();
    hooks.onDrawerChanged(false);
  }

  bellSlot.addEventListener("click", (event) => { if ((event.target as HTMLElement).closest("#bell-button")) openPanel(); });

  // ----- FSD-08A-6: tabs inside a page (remembered per page for this browser tab) -----

  const tabKey = (group: string) => `yoi-subtab:${group}`;
  function selectTab(group: string, id: string, remember = true) {
    const tabs = root.querySelector<HTMLElement>(`[data-tabs="${group}"]`);
    if (!tabs || !tabs.querySelector(`[data-subtab="${CSS.escape(id)}"]`)) return;
    tabs.querySelectorAll<HTMLButtonElement>("[data-subtab]").forEach((b) => {
      const on = b.dataset.subtab === id;
      b.classList.toggle("selected", on);
      b.setAttribute("aria-selected", String(on));
    });
    root.querySelectorAll<HTMLElement>(`[data-subgroup="${group}"]`).forEach((p) => { p.hidden = p.dataset.subpanel !== id; });
    if (remember) { try { sessionStorage.setItem(tabKey(group), id); } catch { /* memory only */ } }
  }
  root.querySelectorAll<HTMLElement>("[data-tabs]").forEach((tabs) => {
    const group = tabs.dataset.tabs!;
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(tabKey(group)); } catch { saved = null; }
    if (saved) selectTab(group, saved, false);
    tabs.addEventListener("click", (event) => {
      const b = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-subtab]");
      if (b) selectTab(group, b.dataset.subtab!);
    });
  });
  function reveal(selector: string) {
    const panelEl = root.querySelector<HTMLElement>(selector)?.closest<HTMLElement>("[data-subpanel]");
    if (panelEl?.dataset.subgroup && panelEl.dataset.subpanel) selectTab(panelEl.dataset.subgroup, panelEl.dataset.subpanel);
  }

  // ----- FSD-08A-6: the play guide -----

  let guide: HTMLElement | null = null;
  let removeGuideKeys: (() => void) | undefined;
  // 2026-10-07: two pages (Yoika, how to play) and one open row at a time.
  let guidePage: GuidePage = "rules";
  let guideRow: number | null = null;
  const infoButton = root.querySelector<HTMLButtonElement>("#info-button");
  function renderGuide(focus: string) {
    if (!guide) return;
    guide.innerHTML = guideView(guidePage, guideRow);
    guide.querySelector<HTMLElement>(focus)?.focus();
  }
  function guideSlides() { return guide?.querySelector<HTMLElement>("#guide-slides") ?? null; }
  function syncGuideDots() {
    const box = guideSlides();
    if (!box || box.clientWidth === 0) return;
    const at = Math.round(box.scrollLeft / box.clientWidth);
    guide?.querySelectorAll<HTMLElement>(".guide-dot").forEach((d, i) => {
      d.classList.toggle("on", i === at);
      if (i === at) d.setAttribute("aria-current", "true"); else d.removeAttribute("aria-current");
    });
  }
  function showGuideSlide(i: number) {
    const box = guideSlides();
    if (!box) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    box.scrollTo({ left: i * box.clientWidth, behavior: reduce ? "auto" : "smooth" });
    if (reduce) syncGuideDots();
  }
  function syncGuideRows() {
    guide?.querySelectorAll<HTMLElement>(".guide-row").forEach((li, i) => {
      const open = guideRow === i;
      li.classList.toggle("open", open);
      li.querySelector(".guide-row-head")?.setAttribute("aria-expanded", String(open));
      const body = li.querySelector(".guide-collapse");
      if (open) body?.removeAttribute("aria-hidden"); else body?.setAttribute("aria-hidden", "true");
    });
  }
  function openGuide(page: GuidePage = "rules") {
    if (guide || drawer || panel || sheetOpen || weather || ride || intro || stopped || hooks.isStale() || hooks.otherDialogOpen()) return;
    guidePage = page;
    guideRow = null;
    guide = document.createElement("div");
    guide.id = "guide";
    guide.className = "notices guide-overlay";
    document.body.append(guide);
    renderGuide(page === "yoika" ? "#guide-next" : "#guide-close");
    const shown = guide;
    window.setTimeout(() => shown.classList.add("guide-shown"), 300);
    app.inert = true;
    infoButton?.setAttribute("aria-expanded", "true");
    guide.addEventListener("click", (event) => {
      const el = event.target as HTMLElement;
      if (el === guide || el.closest("#guide-close")) { closeGuide(); return; }
      if (el.closest("#guide-next")) { guidePage = "rules"; guideRow = null; renderGuide("#guide-title"); return; }
      if (el.closest("#guide-yoika")) { guidePage = "yoika"; renderGuide("#guide-next"); return; }
      // 2026-10-07: the dots switch Yoika's examples (the slides also swipe; see the scroll listener below).
      const slide = el.closest<HTMLElement>("[data-guide-slide]")?.dataset.guideSlide;
      if (slide !== undefined) { showGuideSlide(Number(slide)); return; }
      // 2026-10-07: rows fold in place (no re-render, so nothing flashes); the height animates in CSS.
      const row = el.closest<HTMLElement>("[data-guide-row]")?.dataset.guideRow;
      if (row !== undefined) { guideRow = guideRow === Number(row) ? null : Number(row); syncGuideRows(); }
    });
    // Scroll does not bubble: listen in the capture phase so a swipe on the examples updates the dots.
    guide.addEventListener("scroll", (event) => { if ((event.target as HTMLElement).id === "guide-slides") syncGuideDots(); }, true);
    removeGuideKeys = trapKeys(() => guide, () => closeGuide(), "button:not([disabled])");
    hooks.onDrawerChanged(true);
  }
  function closeGuide(silent = false) {
    if (!guide) return;
    removeGuideKeys?.(); removeGuideKeys = undefined;
    guide.remove();
    guide = null;
    app.inert = false;
    infoButton?.setAttribute("aria-expanded", "false");
    if (silent) return;
    infoButton?.focus();
    hooks.onDrawerChanged(false);
    hooks.onGuideClosed?.();
  }
  infoButton?.addEventListener("click", () => openGuide("rules"));
  // 2026-10-07: the first visit of a member on this device opens page 1 (Yoika) once; other prompts wait until it closes.
  queueMicrotask(() => {
    if (stopped || hooks.isStale()) return;
    const k = guideSeenKey(identity.memberId);
    try { if (storage()?.getItem(k) === "1") return; storage()?.setItem(k, "1"); } catch { return; }
    openGuide("yoika");
  });

  /** FSD-08B: the weather dialog, one overlay among the others (Architect B2). */
  function openWeather() {
    if (weather || !forecast || forecastAt === null || stopped || hooks.isStale() || overlayOpen()) return;
    weather = document.createElement("div");
    weather.id = "weather-dialog";
    weather.className = "notices";
    weather.innerHTML = weatherDialogView(forecast, new Date(forecastAt + 8 * 3600_000).toISOString().slice(11, 16));
    document.body.append(weather);
    app.inert = true;
    weather.querySelector<HTMLElement>("#weather-close")?.focus();
    weather.addEventListener("click", (event) => { const el = event.target as HTMLElement; if (el === weather || el.closest("#weather-close")) closeWeather(); });
    removeWeatherKeys = trapKeys(() => weather, () => closeWeather(), WEATHER_TAB_TARGETS);
    hooks.onDrawerChanged(true);
  }
  function closeWeather(silent = false) {
    if (!weather) return;
    removeWeatherKeys?.(); removeWeatherKeys = undefined;
    weather.remove();
    weather = null;
    app.inert = false;
    if (silent) return;
    (root.querySelector<HTMLElement>("#weather-open") ?? root.querySelector<HTMLElement>(".yo-location-pill"))?.focus();
    hooks.onDrawerChanged(false);
  }
  weatherBox?.addEventListener("click", (event) => { if ((event.target as HTMLElement).closest("#weather-open")) openWeather(); });
  // FSD-08A-6: in-page links — "邀請成員 →" / "前往團隊" switch pages, "活動說明 →" opens the guide.
  app.addEventListener("click", (event) => {
    const el = event.target as HTMLElement;
    const page = el.closest<HTMLElement>("[data-goto-page]")?.dataset.gotoPage;
    if (page && (SHELL_PAGES as readonly string[]).includes(page)) {
      goto(page as ShellPage, true);
      // UX-1010 F12: 去開寶箱 lands on the 寶箱 tab.
      const target = el.closest<HTMLElement>("[data-goto-page]")?.dataset.reveal;
      if (target) reveal(target); else if (page === "invite") reveal("#invite-card");
      return;
    }
    if (el.closest("[data-open-guide]")) openGuide("rules");
    // UX-1010 F9: the card's big button opens the same steps field as the map's 輸入步數.
    if (el.closest("[data-open-steps]")) openSheet();
  });

  // ----- FSD-08A-4: the steps sheet (a sibling of .app-shell in #app, B1) -----

  function sheetSubscriptionError(): string | null {
    const box = root.querySelector<HTMLElement>("#today-error");
    return box && !box.hidden ? box.textContent : null;
  }
  function renderSheet() {
    if (!sheet) return;
    const msg = sheet.querySelector<HTMLElement>("#steps-sheet-msg");
    if (msg) msg.textContent = sheetMessage({ failure: sheetFailure, subscriptionError: sheetSubscriptionError(), syncing: todaySteps === null });
    const close = sheet.querySelector<HTMLButtonElement>("#steps-sheet-close");
    if (close) close.disabled = sheetSaving; // C5: no closing while a save is in flight
  }

  function openSheet() {
    if (!sheet || sheetOpen || guide || stopped || hooks.isStale() || overlayOpen()) return;
    sheetOpen = true;
    sheetFailure = null;
    sheetSaving = false;
    // 2026-10-06 (1): keep the steps page (map and big count) at the top behind the sheet; the page cannot scroll meanwhile.
    window.scrollTo(0, 0);
    document.documentElement.classList.add("sheet-lock");
    sheet.hidden = false;
    app.inert = true;
    sheetButton()?.setAttribute("aria-expanded", "true");
    // C4: the field shows the confirmed steps; the synthetic input event re-checks the AC1 R1 button and hint.
    // Security I2: nothing may write or submit on the input event (this synthetic one fires it too).
    const input = sheet.querySelector<HTMLInputElement>("#today-steps-input");
    if (input && todaySteps !== null) { input.value = String(todaySteps); input.dispatchEvent(new Event("input")); }
    renderSheet();
    // 2026-10-07: focus the title, so the field shows first and the keyboard opens only when the member taps it.
    sheet.querySelector<HTMLElement>("#steps-sheet-title")?.focus({ preventScroll: true });
    removeSheetKeys = trapKeys(() => (sheetOpen ? sheet.querySelector<HTMLElement>(".steps-sheet-panel") : null), () => closeSheet());
    hooks.onDrawerChanged(true);
  }

  /** `silent`: stop or stale — no focus return, no prompt re-evaluation, no count-up. */
  function closeSheet(silent = false) {
    if (!sheet || !sheetOpen) return;
    if (sheetSaving && !silent) return;
    removeSheetKeys?.(); removeSheetKeys = undefined;
    sheetOpen = false;
    sheetSaving = false;
    sheetFailure = null;
    sheet.hidden = true;
    app.inert = false;
    document.documentElement.classList.remove("sheet-lock");
    sheetButton()?.setAttribute("aria-expanded", "false");
    if (silent) return;
    // B2: the map hears the latest confirmed steps only now, so the count-up plays in view (2026-10-06 (1): at the top).
    window.scrollTo(0, 0);
    showMapSteps();
    sheetButton()?.focus({ preventScroll: true });
    hooks.onDrawerChanged(false);
  }

  if (sheet) {
    // QA suggestion 2: on the map hero (replaced with the shell), so listeners never pile up on #app across re-entries.
    root.querySelector<HTMLElement>("#map-hero")?.addEventListener("click", (event) => { if ((event.target as HTMLElement).closest("#steps-sheet-open")) openSheet(); });
    sheet.addEventListener("click", (event) => {
      const el = event.target as HTMLElement;
      if (el === sheet || el.closest("#steps-sheet-close")) closeSheet(); // the scrim itself, not clicks inside the panel
    });
    sheet.addEventListener("input", (event) => {
      if ((event.target as HTMLElement).id === "today-steps-input" && sheetFailure !== null && event.isTrusted) { sheetFailure = null; renderSheet(); }
    });
  }

  // The invite card follows the team panel and the drawer follows the points block: both re-render on their changes.
  const observer = new MutationObserver(() => { if (!stopped) { renderInvite(); renderDrawer(); } });
  for (const id of ["#team-content", "#rewards-content"]) {
    const el = root.querySelector(id);
    if (el) observer.observe(el, { childList: true, subtree: true, characterData: true });
  }

  // ----- FSD-08C S6/S7: the ride celebration (plays once; the scrim never closes it) -----
  function celebrateRide(c: RideCelebration, onClaim: () => void) {
    if (ride || stopped || hooks.isStale()) return;
    // Another overlay opened meanwhile (rare): skip the celebration; the card already shows the new state.
    if (overlayOpen()) return;
    ride = document.createElement("div");
    ride.id = "ride-celebration";
    ride.className = "rc-overlay";
    ride.innerHTML = rideCelebrationView(c);
    document.body.append(ride);
    app.inert = true;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (!reduce) ride.classList.add("rc-play");
    // S7: the new count rolls from the old one, fast then slow (0.4 s delay, 0.9 s); reduced motion shows the end.
    const num = ride.querySelector<HTMLElement>("#rc-num");
    if (num && !reduce && document.visibilityState === "visible") {
      const from = c.from, to = c.to, t0 = performance.now();
      num.textContent = from.toLocaleString("en-US");
      const step = (t: number) => {
        if (!ride) return;
        const p = Math.min(1, Math.max(0, (t - t0 - 400) / 900));
        num.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))).toLocaleString("en-US");
        if (p < 1) rideTimer = requestAnimationFrame(step);
      };
      rideTimer = requestAnimationFrame(step);
    }
    const button = ride.querySelector<HTMLButtonElement>("#rc-action");
    button?.addEventListener("click", () => {
      const action = button.dataset.action;
      closeRide();
      if (action === "claim") onClaim();
      // UX-1010 F17: a ride with no steps yet leads straight to the steps field.
      if (action === "steps") openSheet();
    });
    button?.focus({ preventScroll: true });
    // Escape works like 知道了 (closes without claiming); Tab stays on the one button.
    removeRideKeys = trapKeys(() => ride, () => closeRide(), "button:not([disabled])");
    hooks.onDrawerChanged(true);
  }
  function closeRide(silent = false) {
    if (!ride) return;
    if (rideTimer !== undefined) cancelAnimationFrame(rideTimer);
    rideTimer = undefined;
    removeRideKeys?.(); removeRideKeys = undefined;
    ride.remove();
    ride = null;
    app.inert = false;
    if (silent) return;
    root.querySelector<HTMLElement>("#today-claim-all:not([hidden])")?.focus({ preventScroll: true })
      ?? root.querySelector<HTMLElement>("#today-say")?.focus({ preventScroll: true });
    hooks.onDrawerChanged(false);
  }

  show(page, false);
  renderInvite();
  renderNotices();
  return {
    goto,
    isDrawerOpen: () => drawer !== null || panel !== null || sheetOpen || guide !== null || weather !== null || ride !== null || intro !== null,
    reveal,
    closeDrawer,
    refreshNotices: () => renderNotices(),
    refresh() { if (stopped) return; renderInvite(); renderDrawer(); },
    setTodaySteps(day) {
      todaySteps = day ? day.raw : null;
      todayDay = day;
      if (sheetOpen) renderSheet(); else showMapSteps();
    },
    celebrateRide,
    stepsResult(result) {
      if (!sheetOpen || stopped) return;
      if (result.phase === "saving") { sheetSaving = true; sheetFailure = null; renderSheet(); return; }
      sheetSaving = false;
      if (closesSheet(result)) { closeSheet(); return; }
      sheetFailure = result.error ?? result.status;
      renderSheet();
      sheet?.querySelector<HTMLElement>("#today-steps-input")?.focus(); // C5: focus back to the field after a failure
    },
    stop() {
      stopped = true;
      observer.disconnect();
      closeDrawer(true);
      closeSheet(true);
      closeGuide(true);
      closeWeather(true);
      closeRide(true);
      closeIntro(true);
      weatherCtl.stop();
      window.removeEventListener("hashchange", onHash);
      map.stop();
    },
  };
}
