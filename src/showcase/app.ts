/**
 * RETIRED (FSD-08A-1, 2026-10-04): the local-only showcase is no longer reachable from main.ts; the four-page
 * shell in src/app/ now shows the same design backed by shared data. Kept per the project rule not to delete
 * existing files; only the dev preview still renders it.
 */
import type { AuthenticatedSession } from "../identity/contracts";
import { escapeHtml } from "../ui/html";
import { icon, squareArrow, type IconName } from "../ui/icons";
import { count, progressTrip } from "../ui/components";
import { animateCount } from "../ui/count-up";

type DemoState = {
  rawSteps: number;
  points: number;
  weeklyDays: Record<string, { rawSteps: number; points: number }>;
  team: null | { name: string; code: string; members: string[]; weeklyGoalReached: boolean };
  weeklyComplete: boolean;
  couponClaimed: boolean;
  chestEarned: boolean;
  chestOpened: boolean;
  chestOpening: boolean;
  chestReward: string;
  referralProgress: number;
};

function emptyState(): DemoState {
  return {
    rawSteps: 0, points: 0, weeklyDays: {}, team: null, weeklyComplete: false, couponClaimed: false,
    chestEarned: false, chestOpened: false, chestOpening: false, chestReward: "", referralProgress: 0,
  };
}

type Page = "steps" | "team" | "rewards" | "invite";

function taipeiDate(value: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function datesOfWeek(date: string): string[] {
  const [year, month, day] = date.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const mondayOffset = (utcDate.getUTCDay() + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(utcDate);
    current.setUTCDate(utcDate.getUTCDate() + index);
    return `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}-${String(current.getUTCDate()).padStart(2, "0")}`;
  });
}

function readState(storageKey: string): DemoState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return emptyState();
    const value = JSON.parse(raw) as Partial<DemoState>;
    const integer = (input: unknown, max: number) => typeof input === "number" && Number.isSafeInteger(input) ? Math.max(0, Math.min(max, input)) : 0;
    const text = (input: unknown, max: number) => typeof input === "string" ? input.slice(0, max) : "";
    const team = value.team && typeof value.team === "object" ? value.team : null;
    return {
      rawSteps: integer(value.rawSteps, 1_000_000), points: integer(value.points, 3),
      weeklyDays: value.weeklyDays && typeof value.weeklyDays === "object" ? Object.fromEntries(Object.entries(value.weeklyDays).slice(-70).flatMap(([date, day]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day || typeof day !== "object") return [];
        const record = day as { rawSteps?: unknown; points?: unknown };
        return [[date, { rawSteps: integer(record.rawSteps, 1_000_000), points: integer(record.points, 3) }]];
      })) : {},
      team: team && Array.isArray(team.members) ? { name: text(team.name, 60), code: text(team.code, 12), members: team.members.slice(0, 5).map((member) => text(member, 40)), weeklyGoalReached: team.weeklyGoalReached === true } : null,
      weeklyComplete: value.weeklyComplete === true, couponClaimed: value.couponClaimed === true,
      chestEarned: value.chestEarned === true, chestOpened: value.chestOpened === true,
      chestOpening: value.chestOpening === true, chestReward: text(value.chestReward, 80),
      referralProgress: integer(value.referralProgress, 3),
    };
  } catch { return emptyState(); }
}

export function showShowcaseApp(
  session: AuthenticatedSession,
  onSharedMode: () => void,
  onLogout: () => void,
  onAdmin?: () => void,
): void {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) return;
  const appRoot = root;
  // Each local run is immutable; restarting creates a fresh run rather than lowering today's steps.
  const runKey = `yoxi-showcase-run-v5:${session.context.sessionId}:${session.member.memberId}`;
  let runId = localStorage.getItem(runKey);
  if (!runId) {
    runId = crypto.randomUUID();
    localStorage.setItem(runKey, runId);
  }
  let storageKey = `yoxi-showcase-v5:${session.context.sessionId}:${session.member.memberId}:${runId}`;
  let state = readState(storageKey);
  const weekDates = datesOfWeek(taipeiDate(session.context.scenarioNow));
  let selectedDate = taipeiDate(session.context.scenarioNow);
  state.rawSteps = state.weeklyDays[selectedDate]?.rawSteps ?? 0;
  state.points = state.weeklyDays[selectedDate]?.points ?? 0;
  state.weeklyComplete = weekDates.every((date) => (state.weeklyDays[date]?.rawSteps ?? 0) >= 6000);
  if (state.chestOpening) { state.chestOpening = false; state.chestOpened = true; }
  let page: Page = "steps";
  let mapPosition = 0;
  let settingsOpen = false;
  let chestAnimating = false;
  let toast = "";
  // The shown step count lags the real one while it counts up (display only; state.rawSteps is always the truth).
  let shown = state.rawSteps;
  let animateNext = false;
  let cancelCount: (() => void) | undefined;
  let countTarget = 0;
  const persist = () => localStorage.setItem(storageKey, JSON.stringify(state));
  const saveSelectedDay = () => { state.weeklyDays[selectedDate] = { rawSteps: state.rawSteps, points: state.points }; };
  const isDayReached = (date: string) => (date === selectedDate ? state.rawSteps : state.weeklyDays[date]?.rawSteps ?? 0) >= 6000;
  const refreshWeekCompletion = () => {
    saveSelectedDay();
    state.weeklyComplete = weekDates.every(isDayReached);
    const couponWasClaimed = state.couponClaimed;
    // FSD-04B: seven 6,000-step days are enough (Sunday's third point is no longer required).
    if (state.weeklyComplete) state.couponClaimed = true;
    return !couponWasClaimed && state.couponClaimed;
  };
  if (state.chestOpened && state.chestReward) persist();
  const announce = (message: string) => { toast = message; render(); window.setTimeout(() => { toast = ""; render(); }, 2400); };

  /** Renders with the shown (possibly mid-count) steps; claim buttons unlock only once the count reaches the target. */
  function render(): void {
    const real = state.rawSteps;
    const counting = cancelCount !== undefined && countTarget === real; // e.g. the toast timer re-rendering mid-count
    if (!counting && !(animateNext && real > shown)) { cancelCount?.(); cancelCount = undefined; shown = real; }
    state.rawSteps = shown;
    try { renderView(); } finally { state.rawSteps = real; }
    if (!counting && animateNext && real > shown) startCount(real);
    animateNext = false;
  }

  function startCount(target: number): void {
    cancelCount?.();
    countTarget = target;
    const setText = (selector: string, text: string) => { const el = appRoot.querySelector<HTMLElement>(selector); if (el) el.textContent = text; };
    cancelCount = animateCount(shown, target, (value) => {
      shown = value;
      setText(".yo-step-overlay strong", String(value));
      setText(".yo-step-meta span:first-child", `原始步數 ${value.toLocaleString()}`);
      appRoot.querySelector<HTMLElement>(".yo-step-card .yx-trip")?.style.setProperty("--trip", `${Math.min(100, value / 6000 * 100)}%`);
    }, () => { cancelCount = undefined; shown = target; render(); });
  }

  function renderView(): void {
    const name = escapeHtml(session.member.displayName);
    const unlocks = Math.min(3, Math.floor(state.rawSteps / 2000));
    const completedDays = weekDates.filter(isDayReached).length;
    const weekdayNames = ["一","二","三","四","五","六","日"];
    const pageContent = page === "steps" ? `
      <section class="yo-walk-week-card" aria-label="步數、地圖與個人週任務">
      <div class="yo-walk-map">
        <div class="yo-map-art" style="--map-shift:${mapPosition % 3 * -12}px" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><b></b><span>南京東路</span><em>松江路</em><small>長春路</small></div>
        <div class="yo-map-top"><span class="yo-location-pill">${icon("pin", { size: 16 })} ${["台北市・南京東路","台北市・松江路","台北市・長春路"][mapPosition % 3]}</span><span class="yo-gps-state">模擬定位</span></div>
        <div class="yo-step-overlay"><strong>${state.rawSteps}</strong><span>步</span><small>${selectedDate}・當日模擬累計</small></div>
        <div class="yo-map-marker" style="--marker-x:${[20,80,22][mapPosition % 3]}%;--marker-y:${[68,31,31][mapPosition % 3]}%" aria-hidden="true"></div>
        <button class="yo-map-move" data-action="move-location">移動模擬位置 ${squareArrow()}</button>
      </div>
      <div class="yo-week-panel"><div class="yo-panel-head"><div><p class="yo-kicker">個人週任務</p><h2>七日全勤挑戰</h2></div>${count(`${completedDays}／7`, "天")}</div><p>每天達 6,000 模擬步數可完成當日任務；點選日期可切換展示紀錄。</p><div class="yo-week-strip">${weekDates.map((date, index) => `<button type="button" data-select-date="${date}" aria-label="${date}，${isDayReached(date) ? "已達標" : "未達標"}" class="yo-day-chip ${isDayReached(date) ? "done" : ""} ${selectedDate === date ? "selected" : ""}"><span>${weekdayNames[index]}</span><b>${Number(date.slice(-2))}</b></button>`).join("")}</div><small class="yo-muted">${selectedDate}：${isDayReached(selectedDate) ? "已達標" : "尚未達標"}。日期、步數及點數只儲存在此裝置的純展示資料。</small></div>
      </section>
      <section class="yo-panel yo-step-card"><div class="yo-panel-head"><div><p class="yo-kicker">${selectedDate} 個人任務</p><h2>步數點數</h2></div></div><p>每 2,000 步解鎖 1 點，必須依序領取。</p>${progressTrip(state.rawSteps / 6000, { segments: 3, label: "今日點數進度" })}<div class="yo-step-meta"><span>原始步數 ${state.rawSteps.toLocaleString()}</span><span>最多 3 點／日</span></div></section>
      <section class="yo-panel"><div class="yo-panel-head"><div><p class="yo-kicker">今日里程碑</p><h2>步數點數</h2></div>${count(`${state.points}／3`, "點")}</div><div class="yo-milestones">${[1,2,3].map(n => {const got=state.points>=n; const unlocked=unlocks>=n; const enabled=!got&&unlocked&&state.points===n-1; return `<article class="yo-milestone ${got?"claimed":enabled?"ready":""}"><span class="yo-mile-icon">${got?icon("check", { size: 20, label: "已領取" }):n}</span><div><strong>${(n*2000).toLocaleString()} 步</strong><small>${got?"已領取":unlocked?"已達標，等您領取":`再走 ${Math.max(0,n*2000-state.rawSteps).toLocaleString()} 步解鎖`}</small></div><button data-claim="${n}" ${enabled?"":"disabled"}>${got?"已領":enabled?"領取 1 點":"未解鎖"}</button></article>`;}).join("")}</div><button class="yo-primary yo-full" data-action="claim-all" ${unlocks<=state.points?"disabled":""}>全部領取已達標點數</button></section>
      <section class="yo-note"><strong>展示體驗說明</strong><p>地圖位置、步數與點數均為本機模擬資料，不讀取 GPS，也不會跨裝置同步。</p></section>
    ` : page === "team" ? `
      <section class="yo-page-heading"><p class="yo-kicker">一起走更有趣</p><h1>團隊任務</h1><p>找隊友一起累積每週步數，達標後解鎖團隊寶箱。</p></section>
      ${state.team ? `<section class="yo-team-banner"><div><small>本機展示隊伍</small><h2>${escapeHtml(state.team.name)}</h2><p>邀請碼 <strong>${escapeHtml(state.team.code)}</strong></p></div><span>${icon("shoe", { size: 28, mono: true })}</span></section><section class="yo-panel"><div class="yo-panel-head"><div><p class="yo-kicker">本週進度</p><h2>${state.team.weeklyGoalReached ? "300,000" : Math.min(300000,state.rawSteps*state.team.members.length).toLocaleString()}／300,000 步</h2></div>${count(`${state.team.members.length}／5`, "人")}</div>${progressTrip(state.team.weeklyGoalReached ? 1 : state.rawSteps * state.team.members.length / 300000, { label: "團隊本週進度" })}<div class="yo-roster">${state.team.members.map((m,i)=>`<div><span class="yo-avatar">${i?"M":escapeHtml(name.slice(0,1))}</span><span><strong>${escapeHtml(m)}</strong><small>${i?"隊員・展示模擬":"隊長・您"}</small></span><b>${i?"12,400":state.rawSteps.toLocaleString()} 步</b></div>`).join("")}</div><button class="yo-secondary yo-full" data-action="add-teammate" ${state.team.members.length>=5?"disabled":""}>${icon("plus", { size: 20 })} 模擬一位隊友加入</button><button class="yo-primary yo-full" data-action="team-goal" ${state.team.weeklyGoalReached||state.team.members.length<2?"disabled":""}>${state.team.weeklyGoalReached?`團隊已達標 ${icon("check", { size: 20, mono: true })}`:state.team.members.length<2?"至少 2 人才能達標":"展示：模擬團隊達標並解鎖寶箱"}</button></section><section class="yo-note"><p>這是本機互動展示，隊伍與隊員不會出現在其他人的裝置上。</p></section>` : `<section class="yo-panel yo-empty"><div class="yo-empty-icon">${icon("team", { size: 28 })}</div><h2>目前還沒有加入隊伍</h2><p>建立招募隊伍，邀請夥伴一起走；或輸入隊友分享的邀請碼。</p><button class="yo-primary yo-full" data-action="create-team">建立招募隊伍</button><div class="yo-divider">或加入現有隊伍</div><form id="yo-join-form"><label for="yo-team-code">隊伍邀請碼</label><div class="yo-inline"><input id="yo-team-code" placeholder="輸入邀請碼" maxlength="12"><button class="yo-primary" type="submit">加入</button></div></form></section><section class="yo-note"><p>此處建立／加入僅在目前裝置模擬，不會同步給其他成員。</p></section>`}
    ` : page === "rewards" ? `
      <section class="yo-page-heading"><p class="yo-kicker">努力值得被看見</p><h1>獎勵與寶箱</h1><p>查看您解鎖的展示獎勵。</p></section>
      <section class="yo-coupon ${state.couponClaimed?"active":""}"><div class="yo-coupon-icon">${icon("ticket", { size: 28 })}</div><div><small>每週七日全勤獎勵</small><h2>NT$50 乘車獎勵券</h2><p>最低車資 NT$150｜效期 30 天</p><strong>${state.couponClaimed?"已領取":"完成七日全勤後自動獲得"}</strong></div></section>
      <section class="yo-note"><strong>想快速體驗？</strong><p>此按鈕會在本機建立週一至週日的合成資料（可能包含尚未發生的日期）。要體驗領券，請切換至週日完成當日三點並依序領取。</p><button class="yo-demo-shortcut" data-action="simulate-week" ${state.weeklyComplete?"disabled":""}>建立本週七日合成紀錄 ${squareArrow()}</button></section>
      <section class="yo-panel"><div class="yo-panel-head"><div><p class="yo-kicker">團隊驚喜</p><h2>本週寶箱</h2></div><span class="yo-chest">${state.chestOpened?icon("confetti", { size: 28, label: "寶箱已開啟" }):state.chestEarned?icon("gift", { size: 28, label: "寶箱可開啟" }):icon("lock", { size: 28, label: "寶箱未解鎖" })}</span></div><p>${state.chestOpened?`您抽中了 <strong>${escapeHtml(state.chestReward)}</strong>（展示模擬）`:state.chestEarned?"團隊任務已達標，打開您的寶箱！":"和隊友一起完成團隊目標，解鎖本週寶箱。"}</p>${state.chestEarned&&!state.chestOpened?`<button class="yo-primary yo-full" data-action="open-chest">打開寶箱</button>`:""}<small class="yo-muted">獎勵點數為模擬結果，不代表真實 Points 入帳。</small></section>
      <section class="yo-panel"><div class="yo-panel-head"><div><p class="yo-kicker">點數紀錄</p><h2>我的集點</h2></div>${count(state.points, "點")}</div><p>今日步數任務領取 ${state.points} 點</p><button class="yo-demo-shortcut" data-page="steps">前往今日任務 ${squareArrow()}</button></section>
    ` : `
      <section class="yo-page-heading"><p class="yo-kicker">邀請朋友</p><h1>讓好隊友一起加入</h1><p>邀請入隊和推薦新戶是不同任務，這裡都可試玩模擬流程。</p></section>
      <section class="yo-panel"><p class="yo-kicker">邀請入隊</p><h2>您的隊伍邀請碼</h2>${state.team?`<div class="yo-code">${escapeHtml(state.team.code)}</div><button class="yo-secondary yo-full" data-action="copy-code">複製邀請碼</button><p class="yo-muted">隊友輸入邀請碼即可加入（此展示模式不會跨裝置配對）。</p>`:`<p>先建立一支招募隊伍，就能取得專屬邀請碼。</p><button class="yo-primary yo-full" data-page="team">建立或查看隊伍</button>`}</section>
      <section class="yo-panel"><p class="yo-kicker">推薦新戶（模擬）</p><h2>推薦進度</h2><div class="yo-referral-steps"><span data-step="1" class="${state.referralProgress>=1?"done":""}"><small>輸入推薦碼</small></span><i></i><span data-step="2" class="${state.referralProgress>=2?"done":""}"><small>完成註冊任務</small></span><i></i><span data-step="3" class="${state.referralProgress>=3?"done":""}"><small>完成首乘任務</small></span></div><p>${["尚未開始","已輸入推薦碼","已完成註冊模擬","已完成首乘模擬"][state.referralProgress]}</p><button class="yo-primary yo-full" data-action="referral-step" ${state.referralProgress>=3?"disabled":""}>${state.referralProgress>=3?"模擬任務已完成":"模擬下一步"}</button><small class="yo-muted">不會建立真實新戶、訂單或付款。</small></section>
    `;

    appRoot.innerHTML = `<div class="yo-app"><header class="yo-topbar"><div class="yo-brand"><span class="brand-mark">y</span><span>yoxi <b>智行遊移</b></span></div><div class="yo-top-actions"><span class="yo-demo-tag">純展示模式</span>${onAdmin ? `<button class="yo-settings-toggle" data-action="open-admin">管理</button>` : ""}<button class="yo-settings-toggle" data-action="toggle-settings" aria-expanded="${settingsOpen}">${icon("gear", { size: 20 })} 設定</button><button class="text-button" id="yo-logout">登出</button></div></header>${settingsOpen ? `<section class="yo-settings-panel"><div class="yo-panel-head"><h2>展示體驗設定</h2><button class="yo-link" data-action="toggle-settings">收合</button></div><p>正在編輯 ${selectedDate}（台北時間週一至週日）；步數只能維持或增加。</p><form id="yo-steps-form" class="yo-step-form"><label for="yo-steps">設定模擬累計步數</label><div><input id="yo-steps" type="number" min="${state.rawSteps}" max="1000000" step="1" value="${state.rawSteps}" required><button class="yo-primary" type="submit">更新步數</button></div></form><button class="yo-demo-shortcut" data-action="set-6000">快速體驗：設為 6,000 步 ${squareArrow()}</button><button class="yo-secondary yo-full" data-action="restart-showcase">重新開始本機展示情境（步數歸零）</button><small class="yo-muted">重新開始會建立新情境並保留舊紀錄，不影響共享資料。</small></section>` : ""}<div class="yo-banner"><span>此為單機模擬體驗，資料不會跨裝置共享</span><button data-action="switch-shared">切換共享模式</button></div><main class="yo-content">${pageContent}</main><nav class="yo-bottom-nav" aria-label="主要導覽">${([ ["steps","步數","shoe"],["team","團隊","team"],["rewards","獎勵","gift"],["invite","邀請","userPlus"]] as [Page,string,IconName][]).map(([id,label,name])=>`<button data-page="${id}" class="${page===id?"selected":""}" ${page===id?'aria-current="page"':""}>${icon(name, { size: 24, mono: page===id })}<span>${label}</span></button>`).join("")}</nav>${chestAnimating?`<div class="yo-chest-overlay" role="dialog" aria-modal="true" aria-label="寶箱開啟動畫"><div class="yo-chest-animation"><span>${icon("spark", { size: 28 })}</span><div class="yo-chest-box">${icon("gift", { size: 28 })}</div><strong>寶箱開啟中…</strong><small>正在揭曉已抽出的展示獎勵</small></div></div>`:""}${toast?`<div class="yo-toast" role="status">${escapeHtml(toast)}</div>`:""}</div>`;

    appRoot.querySelectorAll<HTMLElement>("[data-page]").forEach((el) => el.addEventListener("click", () => { page = el.dataset.page as Page; render(); window.scrollTo(0,0); }));
    appRoot.querySelector<HTMLButtonElement>("#yo-logout")?.addEventListener("click", onLogout);
    appRoot.querySelector<HTMLButtonElement>("[data-action='open-admin']")?.addEventListener("click", () => onAdmin?.());
    appRoot.querySelector<HTMLElement>("[data-action='switch-shared']")?.addEventListener("click", onSharedMode);
    appRoot.querySelectorAll<HTMLElement>("[data-action='toggle-settings']").forEach((el) => el.addEventListener("click", () => { settingsOpen = !settingsOpen; render(); }));
    appRoot.querySelectorAll<HTMLButtonElement>("[data-select-date]").forEach((button) => button.addEventListener("click", () => {
      saveSelectedDay();
      selectedDate = button.dataset.selectDate ?? selectedDate;
      state.rawSteps = state.weeklyDays[selectedDate]?.rawSteps ?? 0;
      state.points = state.weeklyDays[selectedDate]?.points ?? 0;
      refreshWeekCompletion(); persist(); render();
    }));
    appRoot.querySelector<HTMLFormElement>("#yo-steps-form")?.addEventListener("submit", (event) => {
      event.preventDefault(); const input = appRoot.querySelector<HTMLInputElement>("#yo-steps"); const value = Number(input?.value);
      if (!Number.isSafeInteger(value) || value < state.rawSteps || value > 1_000_000) return announce("步數只能維持或增加，且不得超過 1,000,000。 ");
      state.rawSteps = value; animateNext = true; const couponAwarded = refreshWeekCompletion(); persist(); announce(couponAwarded ? "恭喜完成全勤！NT$50 乘車券已模擬入帳。" : "模擬步數已更新。");
    });
    appRoot.querySelectorAll<HTMLButtonElement>("[data-claim]").forEach((button) => button.addEventListener("click", () => {
      const n = Number(button.dataset.claim); if (n !== state.points + 1 || state.rawSteps < n * 2000) return;
      state.points = n; const couponAwarded = refreshWeekCompletion(); persist(); announce(couponAwarded ? "恭喜完成全勤！NT$50 乘車券已模擬入帳。" : `第 ${n} 點已領取！`);
    }));
    appRoot.querySelector<HTMLButtonElement>("[data-action='set-6000']")?.addEventListener("click", () => { state.rawSteps = Math.max(6000,state.rawSteps); animateNext = true; const couponAwarded = refreshWeekCompletion(); persist(); announce(couponAwarded ? "恭喜完成全勤！NT$50 乘車券已模擬入帳。" : "已設為至少 6,000 步，記得依序領點！"); });
    appRoot.querySelector<HTMLButtonElement>("[data-action='restart-showcase']")?.addEventListener("click", () => {
      if (!window.confirm("要開啟一個全新的本機展示情境嗎？步數、點數、隊伍與獎勵會從頭開始；舊情境會保留，不會影響 Firebase 共享資料。")) return;
      runId = crypto.randomUUID();
      localStorage.setItem(runKey, runId);
      storageKey = `yoxi-showcase-v5:${session.context.sessionId}:${session.member.memberId}:${runId}`;
      state = emptyState();
      selectedDate = taipeiDate(session.context.scenarioNow);
      mapPosition = 0;
      persist();
      announce("新的本機展示情境已開始，步數為 0。");
    });
    appRoot.querySelector<HTMLButtonElement>("[data-action='claim-all']")?.addEventListener("click", () => { const newlyClaimed = unlocks - state.points; state.points = unlocks; const couponAwarded = refreshWeekCompletion(); persist(); announce(couponAwarded ? `依序領取完成，本次新增 ${newlyClaimed} 點；全勤券已模擬入帳。` : `依序領取完成，本次新增 ${newlyClaimed} 點。`); });
    appRoot.querySelector<HTMLButtonElement>("[data-action='create-team']")?.addEventListener("click", () => { state.team={name:`${session.member.displayName}的步行小隊`,code:`YOI-${Math.random().toString(36).slice(2,6).toUpperCase()}`,members:[session.member.displayName],weeklyGoalReached:false}; persist(); announce("招募隊伍已建立（本機模擬）。"); });
    appRoot.querySelector<HTMLFormElement>("#yo-join-form")?.addEventListener("submit", (event) => { event.preventDefault(); const code=appRoot.querySelector<HTMLInputElement>("#yo-team-code")?.value.trim(); if(!code)return announce("請先輸入邀請碼。"); state.team={name:"隊友的步行小隊",code:code.toUpperCase(),members:["展示成員",session.member.displayName],weeklyGoalReached:false}; persist(); announce("已模擬加入隊伍。"); });
    appRoot.querySelector<HTMLButtonElement>("[data-action='add-teammate']")?.addEventListener("click", () => { if(state.team&&state.team.members.length<5){state.team.members.push(`展示隊員 ${state.team.members.length}`);persist();announce("已加入一位模擬隊員。");} });
    appRoot.querySelector<HTMLButtonElement>("[data-action='team-goal']")?.addEventListener("click", () => { if(state.team&&state.team.members.length>=2){state.team.weeklyGoalReached=true;state.chestEarned=true;persist();announce("展示團隊已達標，寶箱已解鎖！");} });
    appRoot.querySelector<HTMLButtonElement>("[data-action='open-chest']")?.addEventListener("click", () => {
      if (state.chestOpened || chestAnimating) return;
      // Decide and persist once before animation. Animation never draws or changes the reward.
      state.chestReward = ["1 和泰 Points","2 和泰 Points","3 和泰 Points","5 和泰 Points"][Math.floor(Math.random()*4)];
      state.chestOpening = true;
      persist();
      chestAnimating = true;
      render();
      window.setTimeout(() => {
        state.chestOpened = true;
        state.chestOpening = false;
        chestAnimating = false;
        persist();
        announce(`您抽中了 ${state.chestReward}（展示模擬）。`);
      }, 1400);
    });
    appRoot.querySelector<HTMLButtonElement>("[data-action='simulate-week']")?.addEventListener("click", () => { for (const date of weekDates) { const existing = state.weeklyDays[date] ?? { rawSteps: 0, points: 0 }; state.weeklyDays[date] = { ...existing, rawSteps: Math.max(6000, existing.rawSteps, date === selectedDate ? state.rawSteps : 0) }; } state.rawSteps = Math.max(6000, state.rawSteps); animateNext = true; refreshWeekCompletion(); persist(); announce(state.couponClaimed?"本週全勤券已模擬入帳。":"已建立一組本機七日合成展示紀錄（包含未來日期），前往步數頁依序領點。"); });
    appRoot.querySelector<HTMLButtonElement>("[data-action='referral-step']")?.addEventListener("click", () => { state.referralProgress=Math.min(3,state.referralProgress+1);persist();announce("推薦任務模擬進度已更新。"); });
    appRoot.querySelector<HTMLButtonElement>("[data-action='move-location']")?.addEventListener("click", () => {
      mapPosition = (mapPosition + 1) % 3;
      const labels = ["台北市・南京東路","台北市・松江路","台北市・長春路"];
      const location = appRoot.querySelector<HTMLElement>(".yo-location-pill");
      const marker = appRoot.querySelector<HTMLElement>(".yo-map-marker");
      const art = appRoot.querySelector<HTMLElement>(".yo-map-art");
      if (location) location.innerHTML = `${icon("pin", { size: 16 })} ${escapeHtml(labels[mapPosition])}`;
      if (marker) { marker.style.setProperty("--marker-x", `${[20,80,22][mapPosition]}%`); marker.style.setProperty("--marker-y", `${[68,31,31][mapPosition]}%`); }
      if (art) art.style.setProperty("--map-shift", `${mapPosition * -12}px`);
    });
    appRoot.querySelector<HTMLButtonElement>("[data-action='copy-code']")?.addEventListener("click", async () => { if(state.team){try{await navigator.clipboard.writeText(state.team.code);announce("邀請碼已複製。");}catch{announce(`邀請碼：${state.team.code}`);}} });
  }
  render();
}
