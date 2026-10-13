/**
 * FSD-PA: the public test build's controls — the menu (checklist, name, about, restart), the shortcut cards in their
 * tabs (clock, 自動七天, 一鍵模擬團隊達標), the 模擬隊友 card on the team page and the 模擬新朋友 card on the 新戶 tab. Only loaded by main.ts when IS_PUBLIC.
 */
import { listen } from "../local/store.ts";
import { inviteTeammate, joinedTeammates, newcomerBinds, newcomerRides, newcomerState, reachTeamGoal, runClock, visitorTeam, type SimPorts } from "./sim.ts";
import { checklistView, clockBusyView, FEEDBACK_URL, newcomerCardView, publicDialogView, PUBLIC_TOOLS, teammatesCardView, toolCardView } from "./views.ts";
import { checklist, firstChecklistDue, markBellOpened, markTeamGoalUsed, markWeatherOpened, teamGoalUsed } from "./checklist.ts";
import { currentContext, renameVisitor, restartWorld, TEAMMATES, visitorName } from "./world.ts";
import { simulatedWeatherFetch } from "./weather-sim.ts";

export interface PublicControls {
  tools(): { id: string; label: string }[];
  onTool(id: string): void;
  weatherFetch(url: string, init?: RequestInit): Promise<Response>;
  /** The play guide was closed: on the first visit the 功能體驗清單 follows. */
  onGuideClosed(): void;
  stop(): void;
}

export function mountPublic(ports: SimPorts, hooks: { isBusy(): boolean }): PublicControls {
  let busy = false;
  let teamMessage = "";
  let newMessage = "";
  const teamCard = document.createElement("div");
  teamCard.id = "pub-team";
  document.querySelector('[data-page="team"]')?.append(teamCard);
  const newCard = document.createElement("div");
  newCard.id = "pub-new";
  const referralPanel = document.querySelector("#invite-panel-referral");
  referralPanel?.insertBefore(newCard, referralPanel.querySelector(".app-privacy-card"));

  // 2026-10-12: shortcuts inside the tabs they belong to (no menu needed).
  const toolCards: HTMLElement[] = [];
  const place = (panel: string, html: string, before = ".app-privacy-card") => {
    const host = document.querySelector(panel);
    if (!host) return;
    const box = document.createElement("div");
    box.innerHTML = html;
    host.insertBefore(box, host.querySelector(before));
    toolCards.push(box);
  };
  place("#steps-panel-today", toolCardView("pub-tool-today", "時間快轉", "想試試補領昨天的點數？快轉到明天，今天的點數就能在「昨日」補領。", [{ action: "tomorrow", label: "快轉到明天 09:00" }]));
  place("#steps-panel-yesterday", toolCardView("pub-tool-yesterday", "時間快轉", "快轉到明天，今天的步數就會變成「昨天」，可以在這裡補領。", [{ action: "tomorrow", label: "快轉到明天 09:00" }]));
  place("#steps-panel-week", toolCardView("pub-tool-week", "一鍵完成七日全勤", "自動走過下週一到週日，每天 6,000 步並領點，第七天就拿到 $50 乘車券；模擬隊友也會一起走。", [{ action: "week", label: "自動七天", primary: true }, { action: "monday", label: "快轉到下週一 09:00" }]));
  place("#rewards-panel-chests", toolCardView("pub-tool-chest", "一鍵模擬團隊達標", "還沒有隊伍會先幫您建立並邀齊四位模擬隊友；接著時間一天天往前，隊友每天走路、搭 yoxi，直到全隊本週走滿 30 萬步，就能開團隊寶箱。", [{ action: "goal", label: teamGoalUsed() ? "已使用過一鍵模擬團隊達標" : "一鍵模擬團隊達標", primary: true, disabled: teamGoalUsed() }]), ":scope > :not(*)");
  for (const box of toolCards) box.addEventListener("click", (event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>("[data-pub-action]")?.dataset.pubAction;
    if (action === "tomorrow" || action === "monday" || action === "week") void clock(action);
    if (action === "goal") void teamGoal();
  });

  // 2026-10-12: the 填寫朋友的推薦碼 field starts with Michael's code, so binding works with one tap.
  const prefill = () => {
    const input = document.querySelector<HTMLInputElement>("#referral-input");
    if (input && !input.dataset.prefilled) { input.value = TEAMMATES[0].memberId; input.dataset.prefilled = "1"; }
  };
  const referralBox = document.querySelector("#referral-content");
  const prefillWatch = referralBox ? new MutationObserver(prefill) : null;
  if (referralBox) prefillWatch?.observe(referralBox, { childList: true, subtree: true });
  prefill();

  function render() {
    const context = currentContext();
    const joined = joinedTeammates(context).map((t) => t.name);
    const teamHtml = teammatesCardView({ hasTeam: visitorTeam(context) !== null, joined, busy, message: teamMessage });
    if (teamCard.dataset.html !== teamHtml) { teamCard.innerHTML = teamHtml; teamCard.dataset.html = teamHtml; }
    const newHtml = newcomerCardView({ state: newcomerState(context), busy, message: newMessage, michaelCode: TEAMMATES[0].memberId });
    if (newCard.dataset.html !== newHtml) { newCard.innerHTML = newHtml; newCard.dataset.html = newHtml; }
  }

  /** Tool buttons are off while anything runs; 一鍵模擬團隊達標 stays off once it has been used. */
  function syncToolButtons(running: boolean) {
    toolCards.forEach((b) => b.querySelectorAll<HTMLButtonElement>("button").forEach((x) => { x.disabled = running || (x.dataset.pubAction === "goal" && teamGoalUsed()); }));
  }

  async function run(action: () => Promise<void>) {
    if (busy || hooks.isBusy()) return;
    busy = true;
    render();
    syncToolButtons(true);
    try { await action(); } finally { busy = false; render(); syncToolButtons(false); }
  }

  teamCard.addEventListener("click", (event) => {
    if (!(event.target as HTMLElement).closest("#pub-invite")) return;
    void run(async () => {
      try {
        const who = await inviteTeammate(ports);
        teamMessage = who ? `${who.name} 加入了隊伍。` : "隊伍已滿或還沒有隊伍。";
      } catch (error) { teamMessage = error instanceof Error ? error.message : "邀請沒有成功，請再試一次。"; }
    });
  });
  newCard.addEventListener("click", (event) => {
    const el = event.target as HTMLElement;
    if (el.closest("#pub-bind")) void run(async () => { const r = await newcomerBinds(ports); newMessage = r.ok ? "新朋友填了您的推薦碼。" : r.message ?? "沒有成功。"; });
    if (el.closest("#pub-ride")) void run(async () => { const r = await newcomerRides(ports); newMessage = r.ok ? "新朋友完成第一次搭乘，推薦獎勵已發放。" : r.message ?? "沒有成功。"; });
  });

  const off = listen(() => render());
  render();
  // The bell counts as tried once it is opened.
  const onBell = (event: MouseEvent) => {
    const el = event.target as HTMLElement;
    if (el.closest?.("#bell-button")) markBellOpened();
    if (el.closest?.("#weather-open")) markWeatherOpened();
  };
  document.addEventListener("click", onBell, true);

  // ----- FSD-PA-07: the 功能體驗清單 -----
  let sheet: HTMLElement | null = null;
  function closeChecklist() {
    sheet?.remove(); sheet = null;
    document.querySelector<HTMLElement>(".app-shell")?.removeAttribute("inert");
    document.removeEventListener("keydown", onSheetKey, true);
  }
  const onSheetKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.isComposing) { event.preventDefault(); closeChecklist(); document.querySelector<HTMLElement>("#menu-button")?.focus(); } };
  const goTo = (page: string, then?: () => void) => {
    location.hash = `#${page}`;
    window.setTimeout(() => then?.(), 50);
  };
  const tab = (id: string) => () => document.querySelector<HTMLElement>(`[data-subtab="${id}"]`)?.click();
  const GO: Record<string, () => void> = {
    steps: () => goTo("steps", () => { tab("today")(); document.querySelector<HTMLElement>("#steps-sheet-open")?.click(); }),
    claim: () => goTo("steps", tab("today")),
    ride: () => goTo("steps", () => { tab("today")(); document.querySelector<HTMLElement>("#today-simulate-ride")?.scrollIntoView({ block: "center" }); }),
    yesterday: () => goTo("steps", () => { tab("today")(); document.querySelector<HTMLElement>("#pub-tool-today-title")?.scrollIntoView({ block: "center" }); }),
    team: () => goTo("team"),
    name: () => goTo("team"),
    chest: () => goTo("rewards", () => { tab("chests")(); document.querySelector<HTMLElement>("#pub-tool-chest-title")?.scrollIntoView({ block: "center" }); }),
    coupon: () => goTo("steps", () => { tab("week")(); document.querySelector<HTMLElement>("#pub-tool-week-title")?.scrollIntoView({ block: "center" }); }),
    referral: () => goTo("invite", tab("referral")),
    bell: () => document.querySelector<HTMLElement>("#bell-button")?.click(),
    // Asks for the location (the browser shows its own prompt); the weather button appears once it is found.
    weather: () => goTo("steps", () => { window.scrollTo(0, 0); (document.querySelector<HTMLElement>("#map-locate") ?? document.querySelector<HTMLElement>("#weather-open"))?.click(); }),
    restart: () => dialog("restart"),
  };
  function openChecklist() {
    if (sheet) return;
    sheet = document.createElement("div");
    sheet.id = "pub-checklist";
    sheet.className = "notices guide-overlay guide-shown";
    sheet.innerHTML = checklistView(checklist());
    document.body.append(sheet);
    document.querySelector<HTMLElement>(".app-shell")?.setAttribute("inert", "");
    document.addEventListener("keydown", onSheetKey, true);
    sheet.addEventListener("click", (event) => {
      const el = event.target as HTMLElement;
      if (el === sheet || el.closest("#pub-check-close")) { closeChecklist(); document.querySelector<HTMLElement>("#menu-button")?.focus(); return; }
      const go = el.closest<HTMLElement>("[data-check-go]")?.dataset.checkGo;
      if (go && GO[go]) { closeChecklist(); GO[go](); }
    });
    sheet.querySelector<HTMLElement>("#pub-check-close")?.focus();
  }

  // ----- the menu tools -----
  function busyScreen(text: string): HTMLElement {
    const el = document.createElement("div");
    el.className = "stale-overlay";
    el.innerHTML = clockBusyView(text);
    document.body.append(el);
    document.querySelector<HTMLElement>("#app")?.setAttribute("inert", "");
    return el;
  }

  /** 一鍵模擬團隊達標: days go by until the teammates reach 30 萬 this week, then the page reloads. */
  async function teamGoal() {
    if (busy || hooks.isBusy() || teamGoalUsed()) return;
    busy = true;
    // One use per experience: the button is grey from now on (重新開始體驗 brings it back).
    markTeamGoalUsed();
    syncToolButtons(true);
    const screen = busyScreen("模擬隊友每天走路、搭 yoxi，直到全隊本週走滿 30 萬步。");
    const text = screen.querySelector<HTMLElement>(".intro");
    try {
      await reachTeamGoal(ports, (day) => { if (text) text.textContent = `快轉第 ${day} 天…`; });
    } finally {
      window.location.hash = "#rewards";
      window.location.reload();
    }
  }

  async function clock(kind: "tomorrow" | "monday" | "week") {
    if (busy) return;
    busy = true;
    const screen = busyScreen("時間往前走，模擬隊友也會跟著走路。");
    const text = screen.querySelector<HTMLElement>(".intro");
    try {
      await runClock(ports, kind, (i, total) => { if (text) text.textContent = total > 1 ? `第 ${i + 1}／${total} 天…` : "時間往前走…"; });
    } finally {
      window.location.reload();
    }
  }

  function dialog(kind: "rename" | "restart" | "about") {
    if (document.querySelector("#pub-dialog")) return;
    const scrim = document.createElement("div");
    scrim.id = "pub-dialog";
    scrim.className = "confirm-scrim";
    scrim.innerHTML = publicDialogView(kind, visitorName());
    document.body.append(scrim);
    const app = document.querySelector<HTMLElement>("#app");
    app?.setAttribute("inert", "");
    const close = () => { scrim.remove(); app?.removeAttribute("inert"); document.removeEventListener("keydown", onKey, true); document.querySelector<HTMLElement>("#menu-button")?.focus(); };
    const confirm = () => {
      if (kind === "about") { close(); return; }
      if (kind === "restart") { restartWorld(); window.location.reload(); return; }
      const input = scrim.querySelector<HTMLInputElement>("#pub-name");
      if (!input || renameVisitor(input.value) === null) {
        const status = scrim.querySelector<HTMLElement>("#pub-dialog-status");
        if (status) status.textContent = "名稱需要 1 到 20 個字。";
        return;
      }
      window.location.reload();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) { event.preventDefault(); close(); return; }
      if (event.key === "Enter" && kind === "rename" && !event.isComposing && (event.target as HTMLElement).id === "pub-name") { event.preventDefault(); confirm(); return; }
      if (event.key !== "Tab") return;
      const focusable = [...scrim.querySelectorAll<HTMLElement>("button, input")];
      const at = focusable.indexOf(document.activeElement as HTMLElement);
      event.preventDefault();
      focusable[(at + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length]?.focus();
    };
    document.addEventListener("keydown", onKey, true);
    scrim.addEventListener("click", (event) => {
      const el = event.target as HTMLElement;
      if (el.closest("#pub-dialog-dismiss")) close();
      else if (el.closest("#pub-dialog-confirm")) confirm();
    });
    (scrim.querySelector<HTMLElement>("#pub-name") ?? scrim.querySelector<HTMLElement>("#pub-dialog-confirm"))?.focus();
  }

  return {
    tools: () => {
      const items = checklist();
      return [{ id: "tool-checklist", label: `功能體驗清單（${items.filter((i) => i.done).length}／${items.length}）` }, ...PUBLIC_TOOLS];
    },
    onTool(id) {
      if (id === "tool-checklist") openChecklist();
      else if (id === "tool-feedback") window.open(FEEDBACK_URL, "_blank", "noopener,noreferrer");
      else if (id === "tool-rename") dialog("rename");
      else if (id === "tool-restart") dialog("restart");
      else if (id === "tool-about") dialog("about");
    },
    weatherFetch: simulatedWeatherFetch(() => currentContext().scenarioNow),
    onGuideClosed() { if (firstChecklistDue()) window.setTimeout(() => openChecklist(), 150); },
    stop() { off(); closeChecklist(); prefillWatch?.disconnect(); document.removeEventListener("click", onBell, true); teamCard.remove(); newCard.remove(); toolCards.forEach((b) => b.remove()); },
  };
}
