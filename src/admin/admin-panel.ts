import type { AuthenticatedSession } from "../identity/contracts";
import { yoiBrand } from "../ui/views";
import { AdminActionError, planClockChange, type AdminService, type ClockChangeKind, type ClockChangePlan } from "./admin-service";
import { escapeHtml } from "../ui/html";
import { addHours, fromDatetimeLocal, nextDayAt9, nextMondayAt9, toDatetimeLocal } from "./clock-time";
import { AUTO_WEEK_DAY_LABEL, AUTO_WEEK_STEPS, autoWeekPlan, AutoWeekError, runAutoWeek, type AutoWeekPorts } from "./auto-week";

/** 2026-10-06 (14): what the "自動七天" section needs from the page (the daily writes and pausing the stale watch). */
export interface AutoWeekHost { ports: Omit<AutoWeekPorts, "apply">; pauseContextWatch(): void }

/** FSD-02B admin controls, rendered as a separate screen from the member UI (PRD §8). */
export function showAdminPanel(session: AuthenticatedSession, service: Pick<AdminService, "apply">, onBack: () => void, autoWeek?: AutoWeekHost): void {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root || session.member.role !== "admin") return;
  const ctx = session.context;
  let pending: ClockChangePlan | null = null;
  let busy = false;
  // A Console-written context in an older format must not blank this screen; the reset path still works.
  const safeLocal = (value: string) => { try { return toDatetimeLocal(value); } catch { return ""; } };
  const formatWarning = safeLocal(ctx.scenarioNow) ? "" : `<p class="error-message">目前情境時間「${escapeHtml(ctx.scenarioNow)}」不是標準格式；推進時間前請先重設場次，或請產品負責人在 Console 修正。</p>`;

  root.innerHTML = `
    <main class="page-shell flex flex-col">
      <header class="brand-header" aria-label="yoi 遊移遊戲管理工具">
        <span class="brand-name">${yoiBrand("管理工具")}</span>
        <button id="admin-back" class="text-button" type="button">返回</button>
      </header>
      <section class="login-card" aria-labelledby="admin-title">
        <p class="eyebrow">僅管理者可見</p>
        <h1 id="admin-title">共用情境管理</h1>
        <dl class="session-details">
          <div><dt>目前場次</dt><dd>${escapeHtml(ctx.sessionId)}</dd></div>
          <div><dt>情境時間</dt><dd>${escapeHtml(ctx.scenarioNow)}</dd></div>
          <div><dt>活動週（週一）</dt><dd>${escapeHtml(ctx.activityWeekId ?? "未設定")}</dd></div>
          <div><dt>版本</dt><dd>${ctx.clockVersion}</dd></div>
        </dl>
        ${formatWarning}
        <section class="daily-panel" aria-labelledby="advance-title">
          <h2 id="advance-title">推進情境時間</h2>
          <p class="intro">同一場次只能往前推進；所有成員的裝置會提示重新載入。</p>
          <div class="admin-quick">
            <button class="secondary-button" type="button" data-quick="hour">+1 小時</button>
            <button class="secondary-button" type="button" data-quick="day">隔天 09:00</button>
            <button class="secondary-button" type="button" data-quick="monday">下週一 09:00</button>
          </div>
          <label for="advance-input">新的情境時間（台北時間）</label>
          <input id="advance-input" type="datetime-local" step="60" value="${safeLocal(ctx.scenarioNow)}" />
          <button id="advance-review" class="primary-button" type="button">檢查推進內容</button>
        </section>
        <section class="daily-panel" aria-labelledby="reset-title">
          <h2 id="reset-title">重設展示場次</h2>
          <p class="intro">另起新場次版本，所有成員從未組團、零步數重新開始；舊場次資料保留不刪，帳號與身分不變。</p>
          <label for="reset-input">新場次的起始時間（台北時間）</label>
          <input id="reset-input" type="datetime-local" step="60" value="${safeLocal(ctx.scenarioNow)}" />
          <button id="reset-review" class="secondary-button admin-wide" type="button">檢查重設內容</button>
        </section>
        ${autoWeek ? `<section id="auto-week" class="daily-panel" aria-labelledby="auto-week-title" tabindex="-1">
          <h2 id="auto-week-title">模擬七日達標（自動七天）</h2>
          <p class="intro">從下週一 09:00 起，自動把<strong>您自己</strong>每天的步數設為 ${AUTO_WEEK_STEPS.toLocaleString()} 並領取點數，一天一天推進到週日，完成七日全勤並取得乘車券。</p>
          <p class="demo-notice">整個場次會快轉一週：所有成員的裝置都要重新載入；其他成員那七天不會被補，本週全勤會失敗；您自己這七天的團隊週進度不保證全部計入。建議在錄影前、剛重設場次時使用。</p>
          <button id="auto-week-review" class="secondary-button admin-wide" type="button">檢查自動七天內容</button>
        </section>` : ""}
        <section id="admin-confirm" class="admin-confirm" aria-live="polite" hidden></section>
        <p id="admin-status" role="status" aria-live="polite"></p>
        <p id="admin-error" class="error-message" role="alert" hidden></p>
        <p class="demo-notice">變更會寫入稽核紀錄，無法刪除或改寫。</p>
      </section>
    </main>`;

  const advanceInput = root.querySelector<HTMLInputElement>("#advance-input")!;
  const resetInput = root.querySelector<HTMLInputElement>("#reset-input")!;
  const confirmBox = root.querySelector<HTMLElement>("#admin-confirm")!;
  const status = root.querySelector<HTMLElement>("#admin-status")!;
  const errorBox = root.querySelector<HTMLElement>("#admin-error")!;

  const showError = (message: string) => { errorBox.textContent = message; errorBox.hidden = false; };
  const setBusy = (value: boolean) => {
    busy = value;
    root.querySelectorAll<HTMLButtonElement>("button:not(#admin-back)").forEach((button) => { button.disabled = value; });
  };

  function review(kind: ClockChangeKind, input: HTMLInputElement): void {
    errorBox.hidden = true;
    status.textContent = "";
    try {
      pending = planClockChange(ctx, kind, fromDatetimeLocal(input.value));
    } catch (error) {
      pending = null;
      confirmBox.hidden = true;
      showError(error instanceof Error ? error.message : "無法建立變更內容。");
      return;
    }
    const to = pending.to;
    const weekNote = to.activityWeekId !== ctx.activityWeekId ? "<p><strong>將進入新活動週</strong>：上週退團的鎖定會解除。</p>" : "";
    confirmBox.innerHTML = kind === "advance"
      ? `<h2>確認推進情境時間</h2><dl class="session-details">
          <div><dt>場次</dt><dd>${escapeHtml(to.sessionId)}（不變）</dd></div>
          <div><dt>情境時間</dt><dd>${escapeHtml(ctx.scenarioNow)} → ${escapeHtml(to.scenarioNow)}</dd></div>
          <div><dt>活動週</dt><dd>${escapeHtml(ctx.activityWeekId ?? "未設定")} → ${escapeHtml(to.activityWeekId)}</dd></div></dl>${weekNote}
         <button id="admin-apply" class="primary-button" type="button">確認推進</button>`
      : `<h2>確認重設展示場次</h2><dl class="session-details">
          <div><dt>目前場次</dt><dd>${escapeHtml(ctx.sessionId)}</dd></div>
          <div><dt>新場次</dt><dd>${escapeHtml(to.sessionId)}</dd></div>
          <div><dt>起始時間</dt><dd>${escapeHtml(to.scenarioNow)}</dd></div>
          <div><dt>受影響成員</dt><dd>全部展示成員（六人）</dd></div></dl>
         <p>目前場次的隊伍、步數與點數將退出展示畫面（不刪除），所有人從未組團重新開始。</p>
         <button id="admin-apply" class="primary-button" type="button">確認重設場次</button>`;
    confirmBox.hidden = false;
    confirmBox.querySelector<HTMLButtonElement>("#admin-apply")?.addEventListener("click", () => void apply());
    confirmBox.scrollIntoView({ block: "nearest" });
  }

  async function apply(): Promise<void> {
    if (!pending || busy) return;
    setBusy(true);
    errorBox.hidden = true;
    status.textContent = "寫入中；等待共享端確認…";
    try {
      await service.apply(session, pending);
      status.textContent = "共享端已確認變更。所有裝置（包含這一台）需要重新載入。";
      confirmBox.hidden = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "變更失敗。";
      // Only an explicit refusal proves nothing changed; stale and unknown outcomes are reported as they are.
      showError(error instanceof AdminActionError && error.kind === "denied" ? `${message} 情境未變更。` : message);
      status.textContent = "";
      setBusy(false);
    }
  }

  const quick: Record<string, (value: string) => string> = { hour: (v) => addHours(v, 1), day: nextDayAt9, monday: nextMondayAt9 };
  root.querySelectorAll<HTMLButtonElement>("[data-quick]").forEach((button) => button.addEventListener("click", () => {
    try { advanceInput.value = toDatetimeLocal(quick[button.dataset.quick!](ctx.scenarioNow)); }
    catch (error) { showError(error instanceof Error ? error.message : "無法計算新的情境時間。"); return; }
    review("advance", advanceInput);
  }));
  root.querySelector("#advance-review")?.addEventListener("click", () => review("advance", advanceInput));
  root.querySelector("#reset-review")?.addEventListener("click", () => review("reset", resetInput));
  // Security B2: once 自動七天 paused the stale watch, this page's clock is old; "返回" then reloads (fail-closed).
  let watchPaused = false;
  const backButton = root.querySelector<HTMLButtonElement>("#admin-back");
  backButton?.addEventListener("click", () => { if (watchPaused) window.location.reload(); else onBack(); });

  // ----- 2026-10-06 (14): 自動七天 -----
  function reviewAutoWeek(): void {
    errorBox.hidden = true;
    status.textContent = "";
    pending = null;
    let days: string[];
    try { days = autoWeekPlan(ctx.scenarioNow); } catch (error) { showError(error instanceof Error ? error.message : "無法計算自動七天的日期。"); return; }
    confirmBox.innerHTML = `<h2>確認自動七天</h2><dl class="session-details">
        <div><dt>場次</dt><dd>${escapeHtml(ctx.sessionId)}（不變）</dd></div>
        <div><dt>情境時間</dt><dd>${escapeHtml(ctx.scenarioNow)} → ${escapeHtml(days[6])}</dd></div>
        <div><dt>補步數的成員</dt><dd>只有您（${escapeHtml(session.member.memberId)}）</dd></div></dl>
      <p>共推進 7 次（${days.map((d, i) => `${AUTO_WEEK_DAY_LABEL[i]} ${escapeHtml(d.slice(5, 10))}`).join("、")}），每次都寫入稽核紀錄。完成後重新載入，回到主畫面即可看到乘車券與恭喜提示。</p>
      <button id="auto-week-apply" class="primary-button" type="button">開始自動七天</button>`;
    confirmBox.hidden = false;
    confirmBox.querySelector<HTMLButtonElement>("#auto-week-apply")?.addEventListener("click", () => void startAutoWeek());
    confirmBox.scrollIntoView({ block: "nearest" });
  }

  async function startAutoWeek(): Promise<void> {
    if (!autoWeek || busy) return;
    setBusy(true);
    errorBox.hidden = true;
    confirmBox.hidden = true;
    // The page's stale watch would cover this screen after the first day; the run reports its own outcome.
    autoWeek.pauseContextWatch();
    watchPaused = true;
    const back = backButton;
    if (back) back.disabled = true;
    const reload = `<button id="auto-week-reload" class="primary-button" type="button">重新載入</button>`;
    try {
      await runAutoWeek(session, { apply: (s, plan) => service.apply(s, plan), ...autoWeek.ports },
        (day, phase) => { status.textContent = `${AUTO_WEEK_DAY_LABEL[day]}：${phase === "clock" ? "推進情境時間…" : `設定 ${AUTO_WEEK_STEPS.toLocaleString()} 步並領點…`}（${day + 1}／7）`; });
      status.textContent = "自動七天完成：七天都已達標。請重新載入，回到主畫面確認乘車券。";
    } catch (error) {
      status.textContent = "";
      showError(error instanceof AutoWeekError ? error.message : "自動七天失敗；請重新載入後確認目前情境。");
    }
    if (back) { back.disabled = false; back.textContent = "重新載入"; }
    confirmBox.innerHTML = reload;
    confirmBox.hidden = false;
    const button = confirmBox.querySelector<HTMLButtonElement>("#auto-week-reload")!;
    button.addEventListener("click", () => window.location.reload());
    button.focus();
  }
  root.querySelector("#auto-week-review")?.addEventListener("click", reviewAutoWeek);
}
