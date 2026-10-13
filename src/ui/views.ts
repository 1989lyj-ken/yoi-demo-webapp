/**
 * Pure markup for the login page, the shared-mode screen and the stale-context overlay (FSD-UI01).
 * Shared by main.ts and the dev-only ui-preview page; nothing here may import Firebase or a service.
 */
import { escapeHtml } from "./html.ts";
import { count } from "./components.ts";
import { icon, squareArrow, type IconName } from "./icons.ts";
import { menuItems, PAGE_LABEL, type InviteCard, type ShellPage } from "../app/shell-state.ts";
import { noticeDayLabel, type NoticeList, type NoticeType } from "../app/notices.ts";
import { wanOne, wanOneUp, type ChestStage } from "../rewards/chest-stage.ts";
import { claimableOf, nodeStates, rideRowNote, todaySentence, trackFraction, walkFor, type NodeState, type RideCelebration } from "../daily/today-card.ts";
import { walkTip, weatherKind, weatherText, type Forecast, type WeatherKind } from "../weather/weather-state.ts";

/** The official platform name (product owner, 2026-10-04). */
export const PLATFORM_NAME = "yoi 遊移遊戲";

/** The yoi logo (squid and wordmark), cropped from the delivered image by CSS; `text` follows it as the subtitle. */
export function yoiBrand(text: string, small = false): string {
  return `<span class="yoi-logo" role="img" aria-label="yoi"><span class="yoi-logo-squid"></span><span class="yoi-logo-word"></span></span><span class="yoi-brand-text${small ? " yoi-brand-text--small" : ""}">${escapeHtml(text)}</span>`;
}

const brandHeader = (actions = "") => `
  <header class="brand-header" aria-label="${PLATFORM_NAME}">
    <span class="brand-name">${yoiBrand("遊移遊戲")}</span>${actions}
  </header>`;

export function loginView(): string {
  return `
  <main class="page-shell flex flex-col">
    ${brandHeader()}
    <section class="login-card" aria-labelledby="login-title">
      <p class="eyebrow">步行移動・日常集點</p>
      <h1 id="login-title">登入展示版</h1>
      <p class="intro">使用團隊提供的個人帳號體驗 yoi 遊移遊戲。</p>
      <form id="login-form">
        <label for="email">電子郵件</label>
        <input id="email" name="email" type="email" autocomplete="username" inputmode="email" required />
        <label for="password">密碼</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required />
        <p id="login-error" class="error-message" role="alert" aria-live="polite" hidden></p>
        <button id="login-button" class="primary-button" type="submit">登入</button>
      </form>
      <p class="demo-notice">內部展示版・步數與獎勵皆為模擬資料</p>
      <button id="login-home" class="text-button login-home" type="button">回到 yoxi 首頁</button>
    </section>
    <footer>帳號登入遇到問題？請聯絡產品管理者協助處理。</footer>
  </main>`;
}

export interface SharedShellInput {
  displayName: string;
  memberId: string;
  role: "member" | "admin";
  sessionId: string;
  scenarioNow: string;
}

export function sharedShellView(input: SharedShellInput): string {
  const actions = `
    ${input.role === "admin" ? `<button id="admin-button" class="text-button" type="button">管理</button>` : ""}
    <button id="showcase-button" class="text-button" type="button">回到主畫面</button>
    <button id="logout-button" class="text-button" type="button">登出</button>`;
  return `
    <main class="page-shell flex flex-col">
      ${brandHeader(actions)}
      <section class="login-card welcome-card" aria-labelledby="welcome-title">
        <p class="eyebrow">展示帳號已驗證</p>
        <h1 id="welcome-title">嗨，${escapeHtml(input.displayName)}</h1>
        <p class="intro">今日模擬步數與里程碑領點。跨裝置僅同步本人資料。</p>
        <dl class="session-details">
          <div><dt>展示身分</dt><dd>${escapeHtml(input.memberId)}</dd></div>
          <div><dt>權限</dt><dd>${input.role === "admin" ? "管理者" : "團隊成員"}</dd></div>
          <div><dt>展示場次</dt><dd>${escapeHtml(input.sessionId)}</dd></div>
        </dl>
        <p id="yesterday-reminder" class="demo-notice" role="status" hidden></p>
        ${dailyPanelView("today", { stepsInSheet: false })}
        ${dailyPanelView("yesterday", { stepsInSheet: false })}
        ${perfectWeekSection()}
        ${couponsSection()}
        ${rewardsSection()}
        ${teamSection()}
        ${referralSection()}
        <p id="session-error" class="error-message" role="alert" aria-live="polite" hidden></p>
        <p class="demo-notice">本共享薄片含今日／昨日步數、乘車加成、領點與昨日補同步補領、七日全勤與模擬乘車券、已獲得點數與寶箱開箱、推薦新戶；點數與獎勵皆為模擬，不得視為正式入帳。</p>
      </section>
      <footer>共用情境時間：${escapeHtml(input.scenarioNow)}</footer>
    </main>`;
}

// FSD-08A-1: the shared panels' markup, used by the app shell and the admin diagnostics view (never both at once:
// the panels find their elements by ID). FSD-08A-3: the showcase's card layout; IDs and data-* hooks are unchanged.
export function perfectWeekSection(): string {
  return `<section class="yo-week-panel perfect-week-panel" aria-labelledby="perfect-week-title">
          <div class="yo-panel-head"><h2 id="perfect-week-title">七日全勤挑戰</h2><span class="pw-prize">拿 <b>$50</b> 乘車券</span></div>
          <div id="perfect-week-content"><p>正在讀取本週進度…</p></div>
          <div id="perfect-week-error" class="error-message" role="alert" aria-live="assertive" hidden></div>
        </section>`;
}

export function couponsSection(): string {
  return `<section id="coupons" class="app-block" aria-labelledby="coupons-title" tabindex="-1">
          <h2 id="coupons-title" class="app-block-title">我的獎勵券</h2>
          <div id="coupons-content"><p>正在讀取獎勵券…</p></div>
        </section>`;
}

export function rewardsSection(): string {
  return `<section id="rewards" class="app-block" aria-labelledby="rewards-title" tabindex="-1">
          <div class="yo-page-heading"><h2 id="rewards-title">獎勵與寶箱</h2><p>點數、寶箱與獎勵券都在這裡。</p></div>
          <div id="rewards-content"><p>正在讀取點數…</p></div>
          <div id="rewards-error" class="error-message" role="alert" aria-live="assertive" hidden></div>
        </section>`;
}

export function teamSection(): string {
  return `<section class="app-block team-panel" aria-labelledby="team-title">
          <div class="yo-page-heading"><h2 id="team-title" tabindex="-1">團隊任務</h2><p>找隊友一起累積每週步數，達標後解鎖團隊寶箱。</p></div>
          <p id="team-status" class="yo-status" role="status" aria-live="polite">從共享服務讀取隊伍…</p>
          <div id="team-error" class="error-message" role="alert" aria-live="assertive" hidden></div>
          <div id="team-content"><p>正在確認您的團隊狀態…</p></div>
        </section>`;
}

export function referralSection(): string {
  return `<section id="referral" class="yo-panel" aria-labelledby="referral-title">
          <h2 id="referral-title">您的新戶推薦碼</h2>
          <div id="referral-content"><p>正在讀取推薦狀態…</p></div>
          <p id="referral-status" class="yo-status" role="status" aria-live="polite"></p>
          <div id="referral-error" class="error-message" role="alert" aria-live="assertive" hidden></div>
        </section>
        <aside class="yo-panel app-privacy-card" aria-label="推薦新戶說明"><p class="yo-muted">推薦新戶為模擬流程：不建立新帳號、不產生真實訂單或付款。</p></aside>`;
}

/** The steps field (AC1 R1); its IDs are what the daily controller looks up, so it is emitted in exactly one place (FSD-08A-4 C7). */
function stepsFormView(day: "today" | "yesterday"): string {
  const today = day === "today";
  const id = (name: string) => `${day}-${name}`;
  return `<form id="${id("steps-form")}" class="yo-step-form">
            <label for="${id("steps-input")}">${today ? "只能往上加" : "補上昨天的步數（只能往上加）"}</label>
            <div><input id="${id("steps-input")}" type="number" min="0" max="1000000" step="1" required /><button class="yo-primary" type="submit">儲存步數</button></div>
            <p id="${id("steps-hint")}" class="yo-hint" role="status" aria-live="polite"></p>
          </form>`;
}

/**
 * One task-day block; element IDs are prefixed with the day ("today-…" / "yesterday-…") and every one the
 * daily controller looks up must exist (FSD-08A-3 C1). With `stepsInSheet` today's steps field lives in the steps
 * sheet (the app shell) instead of the card (diagnostics).
 * FSD-08C (2026-10-07): today is the points track (four circles, the shoe floating above), one sentence, the claim
 * button (only while there is something to claim) and the ride task row; yesterday shows its steps, the points
 * left to claim and the ride bonus, then the claim button and the catch-up field.
 */
export function dailyPanelView(day: "today" | "yesterday", options: { stepsInSheet: boolean }): string {
  const id = (name: string) => `${day}-${name}`;
  const status = `<p id="${id("status")}" class="yo-status" role="status" aria-live="polite">讀取中…</p>
          <p id="${id("error")}" class="error-message" role="alert" aria-live="assertive" hidden></p>`;
  const claim = `<button id="${id("claim-all")}" class="yo-primary yo-full" type="button" hidden>${day === "today" ? "領取" : "補領"} 0 點</button>`;
  if (day === "today") {
    return `
        <section class="yo-panel app-day" aria-labelledby="today-title" data-day="today">
          <p id="today-date" class="yo-kicker" hidden></p>
          <div class="yo-panel-head"><h2 id="today-title" tabindex="-1">今天的點數</h2><span id="today-points">${count("0／3", "點")}</span></div>
          <div id="today-trip">${pointsTrackView(0, 0)}</div>
          <p id="today-ride-note" class="pt-ride" hidden></p>
          <div id="today-say" class="pt-say" tabindex="-1">${todaySayView(0, 0)}</div>
          <div id="today-zero" class="pt-zero" hidden><button type="button" class="yo-primary yo-full" data-open-steps>輸入今天的步數</button></div>
          ${options.stepsInSheet ? "" : stepsFormView("today")}
          ${claim}
          ${status}
          <div class="ride-task">
            <span class="ride-reward" aria-hidden="true">${icon("car", { size: 24 })}<b>步數<br>1.5 倍</b></span>
            <div class="ride-mid"><strong>搭一趟 yoxi</strong><small id="today-ride-state">${rideRowNote(0, 0, false)}</small></div>
            <button id="today-simulate-ride" class="ride-go" type="button" aria-label="模擬一趟（模擬完成一趟 yoxi）">模擬一趟</button>
            <span id="today-ride-done" class="ride-done" hidden>${RIDE_DONE_CHECK}已完成</span>
          </div>
        </section>`;
  }
  return `
        <section class="yo-panel app-day" aria-labelledby="yesterday-title" data-day="yesterday">
          <p id="yesterday-date" class="yo-kicker" hidden></p>
          <div class="yo-panel-head"><h2 id="yesterday-title" tabindex="-1">昨天的點數</h2><span id="yesterday-points">${count("0／3", "點")}</span></div>
          <dl class="yd-stats">
            <div><dt>昨天走了</dt><dd><b id="yesterday-steps">0</b> 步<small id="yesterday-ride-note" hidden></small></dd></div>
            <div><dt>可以補領</dt><dd><b id="yesterday-claimable">0</b> 點</dd></div>
            <div><dt>搭車加成</dt><dd id="yesterday-ride-state">沒有搭乘</dd></div>
          </dl>
          ${claim}
          <p id="yesterday-deadline" class="yo-muted"></p>
          ${stepsFormView("yesterday")}
          ${status}
        </section>`;
}

const RIDE_DONE_CHECK = `<svg class="ride-done-check" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12l5 5L20 6" stroke="currentColor" stroke-width="3" fill="none"/></svg>`;
const NODE_CHECK = `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2.5 6.2l2.4 2.4 4.6-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const TRACK_LABELS = ["0", "2,000", "4,000", "6,000"];

/** FSD-08C S2: the three threshold circles (rewritten on every change; the shoe and the fill are updated in place). */
export function pointsNodesView(effectiveSteps: number, claimed: number): string {
  return pointsNodesFrom(nodeStates(effectiveSteps, claimed));
}
function pointsNodesFrom(states: NodeState[]): string {
  return states.map((s, i) =>
    `<span class="pt-node pt-node--${s}" data-at="${i + 1}">${s === "done" ? NODE_CHECK : "P"}</span>`).join("");
}

/** FSD-08C S2: a five-high track in three parts (filled navy up to the steps), the circles on it, the shoe above. */
export function pointsTrackView(effectiveSteps: number, claimed: number): string {
  return milestoneTrackView({ fraction: trackFraction(effectiveSteps), nodes: nodeStates(effectiveSteps, claimed), labels: TRACK_LABELS, marker: "shoe",
    check: false, label: pointsTrackLabel(effectiveSteps, claimed) });
}

/** The track shared by today's points and the team's week (2026-10-07): three parts, four circles, a floating marker. */
export function milestoneTrackView(t: { fraction: number; nodes: NodeState[]; labels: string[]; marker: IconName; check: boolean; label: string }): string {
  const f = Math.max(0, Math.min(1, t.fraction));
  const part = (i: number) => Math.max(0, Math.min(1, f * 3 - i)) * 100;
  const nodes = t.check ? t.nodes.map((s, i) => `<span class="pt-node pt-node--${s}" data-at="${i + 1}">${NODE_CHECK}</span>`).join("")
    : pointsNodesFrom(t.nodes);
  return `<div class="pt" role="img" aria-label="${escapeHtml(t.label)}">
            <div class="pt-rail">
              <div class="pt-bar">${[0, 1, 2].map((i) => `<i><b style="--w:${part(i).toFixed(2)}%"></b></i>`).join("")}</div>
              <span class="pt-start"></span>
              <span class="pt-nodes">${nodes}</span>
              <span class="pt-shoe" style="--at:${(f * 100).toFixed(2)}%"><span class="pt-shoe-b">${icon(t.marker, { size: 16 })}</span></span>
            </div>
            <div class="pt-labels" aria-hidden="true">${t.labels.map((x, i) => `<span data-at="${i}">${escapeHtml(x)}</span>`).join("")}</div>
          </div>`;
}

export function pointsTrackLabel(effectiveSteps: number, claimed: number): string {
  const ready = claimableOf(effectiveSteps, claimed);
  return `今日點數進度：${Math.min(effectiveSteps, 6000).toLocaleString("en-US")} / 6,000 步，已領 ${claimed} 點${ready > 0 ? `，${ready} 點可以領` : ""}`;
}

/** FSD-08C S3: the sentence under the track; the points in red bold. */
export function todaySayView(effectiveSteps: number, claimed: number, ride = false, rawSteps: number | null = null): string {
  // UX-1010 F9: no steps yet today: what to do first (the button under it opens the steps field).
  if (rawSteps === 0) return `<p class="pt-lead">先加一些步數試試</p><p class="pt-sub">這是展示版，步數用輸入的。每 2,000 步可以領 1 點</p>`;
  const s = todaySentence(effectiveSteps, claimed, ride);
  const lead = s.points === null ? escapeHtml(s.lead) : escapeHtml(s.lead).replace(`${s.points} 點`, `<b>${s.points} 點</b>`);
  return `<p class="pt-lead">${lead}</p>${s.sub ? `<p class="pt-sub">${escapeHtml(s.sub)}</p>` : ""}`;
}

/** UX-1010 F16: the ride line in the card (actual steps bold); empty when there is nothing to say. */
export function rideNoteView(rawSteps: number, ride: boolean): string {
  return ride && rawSteps > 0 ? `實際走了 <b>${rawSteps.toLocaleString("en-US")}</b> 步，搭 yoxi 變 1.5 倍` : "";
}

/** FSD-08C: the location note as its own small card at the bottom of the 今日、本週、昨日 tabs (the first one carries the id the locate button points at). */
export function locationPrivacyCardView(withId: boolean): string {
  return `<aside class="yo-panel app-privacy-card"${withId ? ' id="map-privacy"' : ""} aria-label="定位隱私說明"><ul class="app-privacy-list">${LOCATION_PRIVACY_ITEMS.map((t) => `<li>${t}</li>`).join("")}</ul></aside>`;
}

/** Confetti pieces of the ride celebration (UI-design 32-demo-ride-feedback.html, copied as drawn). */
const RIDE_CONFETTI: [number, number, string, "rect" | "dot" | "bar", number, number, number, number][] = [
  [256, 111, "yellow", "bar", -108, -41, 71, 359], [67, 114, "blue", "bar", 81, -44, 83, 328],
  [223, 35, "red", "dot", -75, 35, 68, 268], [43, 80, "red", "dot", 105, -10, 144, 307],
  [60, 91, "red", "rect", 88, -21, 110, 257], [29, 36, "navy", "rect", 119, 34, 147, 349],
  [235, 37, "blue", "bar", -87, 33, -41, 287], [41, 102, "apricot", "rect", 107, -32, 1, 315],
  [37, 84, "red", "rect", 111, -14, 45, 358], [37, 14, "red", "rect", 111, 56, -51, 368],
  [253, 18, "yellow", "bar", -105, 52, 32, 300], [70, 111, "apricot", "rect", 78, -41, 12, 289],
  [266, 64, "red", "rect", -118, 6, -92, 340], [45, 13, "red", "dot", 103, 57, 78, 272],
  [68, 69, "blue", "bar", 80, 1, -63, 348], [53, 65, "yellow", "dot", 95, 5, -101, 303],
];

/** FSD-08C S6: the celebration after a confirmed ride. The scrim never closes it; only the button does. */
export function rideCelebrationView(c: RideCelebration): string {
  const confetti = RIDE_CONFETTI.map(([x, y, color, shape, dx, dy, r, delay]) =>
    `<i class="rc-c rc-c--${color} rc-c--${shape}" style="--x:${x}px;--y:${y}px;--dx:${dx}px;--dy:${dy}px;--r:${r}deg;--delay:${delay}ms"></i>`).join("");
  const action = c.zero ? "輸入步數" : c.claimable > 0 ? `領取 ${c.claimable} 點` : "知道了";
  const does = c.zero ? "steps" : c.claimable > 0 ? "claim" : "close";
  return `<div class="rc-panel" role="dialog" aria-modal="true" aria-labelledby="rc-title" aria-describedby="rc-text">
      <div class="rc-conf" aria-hidden="true">${confetti}</div>
      <div class="rc-tile" aria-hidden="true">${icon("car", { size: 28 })}</div>
      <h2 id="rc-title" class="rc-slogan">Nice Ride!</h2>
      <div id="rc-text"><p class="rc-t">${c.zero ? "今天走的步數都會變 1.5 倍" : "今天的步數變 1.5 倍"}</p>
      <p class="rc-n"${c.zero ? " hidden" : ""}><span>${c.from.toLocaleString("en-US")}</span><svg class="rc-ar" width="16" height="14" viewBox="0 0 16 14" aria-hidden="true" focusable="false"><path d="M9 1l6 6-6 6M15 7H1" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linejoin="round"/></svg><b id="rc-num" data-from="${c.from}" data-to="${c.to}">${c.to.toLocaleString("en-US")}</b><span>步</span></p>
      <p class="rc-c-note">${escapeHtml(c.note)}</p></div>
      <button id="rc-action" class="yo-primary yo-full rc-btn" type="button" data-action="${does}">${action}</button>
    </div>`;
}

/** FSD-08A-4 D2: the steps sheet (a sibling of .app-shell, B1); it holds today's steps field. */
export function stepsSheetView(): string {
  return `<div id="steps-sheet" class="steps-sheet" hidden>
    <div class="steps-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="steps-sheet-title">
      <div class="drawer-head"><h2 id="steps-sheet-title" tabindex="-1">今天走了幾步？</h2><button id="steps-sheet-close" class="text-button" type="button">關閉</button></div>
      ${stepsFormView("today")}
      <p id="steps-sheet-msg" class="yo-status" role="status" aria-live="polite"></p>
      <p class="yo-muted">儲存後視窗會關閉，地圖上的步數會滾動到新數字。</p>
    </div>
  </div>`;
}

/** First-entry prompt for yesterday's claimable points (P28); shown once per device. */
export function yesterdayPromptView(points: number, taskDate: string): string {
  return `<section class="login-card"><p class="eyebrow">昨日補領提醒</p><h1 id="yesterday-prompt-title">昨日還有 ${points} 點可領</h1><p class="intro">${escapeHtml(taskDate)} 的點數可補領至今日 24:00，逾期不再發點。關閉後仍可在記步頁的固定提醒找到。</p><div class="dialog-actions"><button id="yesterday-prompt-close" class="secondary-button" type="button">稍後再說</button><button id="yesterday-prompt-go" class="primary-button" type="button">前往補領</button></div></section>`;
}

export function dailyPointsView(points: number): string {
  return count(`${points}／3`, "點");
}

/**
 * 2026-10-06 (4)(5): display-only rows for today and yesterday; points are claimed only with the button below.
 * Unreached: "再走 N 步解鎖" + grey "未解鎖"; reached: "已達標，等您領取" + navy "待領 1 點"; claimed: "已領取" +
 * navy outlined "獎勵 1 點" on the navy row. The states never depend on whether the page can act.
 */
export function milestoneRowsView(points: number, effectiveSteps: number): string {
  const unlocked = Math.min(3, Math.floor(effectiveSteps / 2000));
  return [1, 2, 3].map((n) => {
    const claimed = points >= n;
    const reached = unlocked >= n;
    const [state, label] = claimed ? ["done", "獎勵 1 點"] : reached ? ["ready", "待領 1 點"] : ["locked", "未解鎖"];
    const note = claimed ? "已領取" : reached ? "已達標，等您領取" : `再走 ${Math.max(0, n * 2000 - effectiveSteps).toLocaleString()} 步解鎖`;
    const mark = claimed ? icon("check", { size: 20, mono: true }) : String(n);
    return `<article class="yo-milestone${claimed ? " claimed" : reached ? " ready" : ""}"><span class="yo-mile-icon">${mark}</span><div><strong>${(n * 2000).toLocaleString()} 步</strong><small>${note}</small></div><span class="yo-mile-state yo-mile-state--${state}"><span class="yo-sr-only">狀態：</span>${label}</span></article>`;
  }).join("");
}

export function teamEmptyView(enabled: boolean, notice: string | null = null, awardNotes: string[] = []): string {
  const disabled = enabled ? "" : "disabled";
  const lock = notice ? `<p id="team-lock-notice" class="demo-notice" role="status">${escapeHtml(notice)}</p>` : "";
  const awards = awardNotes.map((note) => `<p class="demo-notice">${escapeHtml(note)}</p>`).join("");
  return `<section class="yo-panel yo-empty team-empty"><h2>目前還沒有加入隊伍</h2><p>組建隊伍，招募夥伴一起走；或輸入隊友分享的邀請碼。</p>${awards}${lock}<button id="create-team" class="yo-primary yo-full" type="button" data-team-action="create" ${disabled}>組建隊伍</button><div class="yo-divider">或加入現有隊伍</div><form id="join-team-form" class="team-join-form"><label for="team-invite-code">輸入隊友的 16 碼邀請碼</label><div class="yo-inline"><input id="team-invite-code" maxlength="16" autocomplete="off" placeholder="例如：A1B2C3D4E5F60718" required><button class="yo-primary" type="submit" ${disabled}>加入</button></div></form><p class="yo-muted">成員加入後即成團；每隊最多 5 人。</p></section>`;
}

export interface TeamViewInput {
  status: "recruiting" | "active" | "paused" | "archived";
  memberCount: number;
  inviteCode: string;
  leaderMemberId: string | null;
  /** FSD-08A-3 C5: banner title computed by the panel; the fallback when absent. FSD-03E: the confirmed team name first. */
  title?: string;
  /** FSD-03E: the current captain of a confirmed team that is not archived sees the edit button. */
  canRename?: boolean;
}

export interface RosterViewEntry {
  memberId: string;
  exists: boolean;
  pending: boolean;
  fromCache: boolean;
  rawSteps: number;
  effectiveSteps: number;
  rideCompleted: boolean;
}

export interface TeamActionsInput {
  canLeave: boolean;
  canTransfer: boolean;
  leaveMode: "cancel" | "leave" | null;
  notice: string | null;
}

/** FSD-03C-1 weekly progress (replayed from the contribution ledger). */
export interface TeamWeekInput {
  total: number;
  target: number;
  /** Display-only "reached" moment from the replay; settlement belongs to 03C-2. */
  reachedAt: string | null;
  confirmed: boolean;
  /** An own entry could not be confirmed yet (network); it will be credited later. */
  pending: boolean;
  contributions: Record<string, number>;
  /** 2026-10-06: today's team-counted steps per member (the roster's right column). */
  todayContributions?: Record<string, number>;
  /** Members with entries this week who are no longer in the roster. */
  pastMembers: string[];
  previous: ({ total: number; reachedAt: string | null } & WeekOutcome) | null;
  /** FSD-03C-2 official result of the current week. */
  official: WeekOutcome["official"];
  settling: boolean;
  own: WeekOutcome["own"];
  /** "About N steps per person per day" for the rest of the week; null when not shown. */
  need: number | null;
  /** FSD-08A-6: the same with one more member (null at 5 or when not shown), and days left this week (today included). */
  needPlusOne?: number | null;
  daysLeft?: number;
  /** UX-1010 F12: the viewer's own chest of this week (null while unknown or without one). */
  chest?: "unopened" | "opened" | null;
}

/** A week's official result (FSD-03C-2), only from server-confirmed snapshots. */
export interface WeekOutcome {
  official: { firstAt: string; advancedAt: string | null; awardCount: number } | null;
  /** The replay reached but the result is not recorded yet, or a write is still unconfirmed. */
  settling: boolean;
  own: "awarded" | "pending" | "not-in-team" | null;
}


function outcomeView(outcome: WeekOutcome, reachedAt: string | null, label: "本週" | "上週", merged = false): string {
  // UX-1010 F12: plain words, no time and no 寶箱資格; the current week's reached message lives in the card box.
  const official = merged ? ""
    : outcome.official ? `<p class="demo-notice">${label}達標了！${outcome.official.awardCount} 個人都可以開寶箱</p>`
    : reachedAt ? `<p class="demo-notice">${label}達標了！寶箱準備中</p>` : "";
  const own = outcome.own === "pending" ? "您的寶箱準備中。"
    : outcome.own === "not-in-team" ? `${label}達標時您不在隊上，這次沒有寶箱。` : "";
  const settling = outcome.settling && outcome.official ? `<p class="team-progress-note" role="status">寶箱準備中，下次同步或重新載入頁面時會補上。</p>` : "";
  return `${official}${own ? `<p class="team-progress-note">${own}</p>` : ""}${settling}`;
}


/** FSD-08A-6 (附圖二): the team card — name, rule, days left, 萬步 total, red three-part bar, the per-day box. */
function teamWeekView(week: TeamWeekInput | null, team: TeamViewInput, status: string): string {
  // FSD-03E: the edit button sits next to the name (both branches below); the name is element text only.
  const rename = team.canRename ? `<button id="team-rename" class="yo-link team-rename" type="button" data-team-action="rename" aria-label="編輯隊名">${icon("pencil", { size: 16, mono: true })}編輯</button>` : "";
  const title = `<div class="team-card-head"><h2 id="team-name" class="team-card-title">${escapeHtml(team.title ?? TEAM_TITLE_FALLBACK)}</h2>${rename}</div>`;
  const rule = `<p class="yo-muted team-card-rule">全隊 30 萬步，寶箱人人有份</p>`;
  // 2026-10-06 (A): one member (recruiting, or paused after forming): no team steps yet, the empty seat and the invite.
  if (team.memberCount < 2 && team.status !== "archived") {
    const paused = team.status === "paused";
    const seats = `<div class="team-seats" aria-hidden="true"><span class="team-seat filled">我</span><span class="team-seat empty">等待隊友</span></div>`;
    const lead = paused ? "隊伍暫停中，再邀 1 人恢復挑戰" : "再邀 1 人成團，成團後才開始累計團隊步數";
    return `<section class="yo-panel team-card team-recruit">${title}${rule}<p class="team-card-status">${paused ? "暫停中" : "招募中"}</p>${seats}<p class="team-recruit-count"><b>1</b>／2 人</p><p class="team-recruit-lead">${lead}</p><button type="button" class="yo-primary yo-full" data-goto-page="invite">邀請成員</button></section>`;
  }
  if (!week) return `<section class="yo-panel team-card">${title}${rule}<p class="team-card-status">${status}・${team.memberCount}/5 人</p></section>`;
  const days = week.daysLeft ? `・還有 ${week.daysLeft} 天` : "";
  const reached = week.confirmed && week.total >= week.target;
  const big = week.confirmed ? `<b class="${reached ? "team-wan reached" : "team-wan"}">${wanOne(week.total)}</b>` : `<b class="team-wan">—</b>`;
  const meta = `<div class="team-card-meta"><span>${status}・本週${days}</span><span class="team-wan-line">${big}<span> / ${(week.target / 10_000).toLocaleString()} 萬步</span></span></div>`;
  // 2026-10-07: the same track as today's points; every circle is a check (grey until reached), the team icon floats above.
  const third = week.target / 3;
  const bar = week.confirmed ? milestoneTrackView({ fraction: week.total / week.target, nodes: [1, 2, 3].map((i) => (week.total >= third * i ? "done" : "locked")),
    labels: [0, 1, 2, 3].map((i) => (i === 0 ? "0" : `${(third * i / 10_000).toLocaleString()}萬`)), marker: "team", check: true,
    label: `本週團隊進度：${wanOne(week.total)} / ${(week.target / 10_000).toLocaleString()} 萬步` }) : "";
  const badge = reached ? `<p class="team-reached">已達標</p>` : "";
  let box: string;
  if (!week.confirmed) box = `<p>團隊貢獻同步中；未確認的數字不顯示。</p>`;
  else if (team.memberCount < 2) box = `<p>${team.status === "paused" ? "隊伍暫停中：再邀 1 人恢復挑戰；暫停期間的步數不計入團隊。" : "再邀 1 人成團，開始累計步數。"}</p>`;
  else if (reached) {
    const n = week.official?.awardCount ?? null;
    box = `<p class="team-done">${n !== null ? `達標了！${n} 個人都可以開寶箱` : "達標了！寶箱準備中"}</p>`
      + (week.chest === "unopened" ? `<button type="button" class="yo-primary yo-full" data-goto-page="rewards" data-reveal="#rewards-chests">去開寶箱</button>`
        : week.chest === "opened" ? `<p class="team-progress-note">這週的寶箱開過了</p>` : "");
  }
  else box = (week.need !== null ? `<p>${team.memberCount >= 5 ? "5 人到齊" : `目前 ${team.memberCount} 人`}，每人每天約需 <b>${week.need.toLocaleString()} 步</b></p>` : "")
    + (week.needPlusOne ? `<p>再邀 1 人，每人每天只要 <b>${week.needPlusOne.toLocaleString()} 步</b></p>` : "");
  const invite = team.memberCount < 5 && team.status !== "archived" ? `<button type="button" class="yo-link team-invite-link" data-goto-page="invite">邀請成員 ${squareArrow()}</button>` : "";
  // UX-1010 F12: once reached, the box above says it all (no time, no 寶箱資格); only problems still show below.
  const outcome = week.confirmed ? outcomeView(week, reached ? null : week.reachedAt, "本週", reached) : "";
  const previous = week.previous ? `<p class="team-progress-note">上週（補同步至今日 24:00）${wanOne(week.previous.total)} / ${(week.target / 10_000).toLocaleString()} 萬步${week.previous.total >= week.target ? "・已達標" : ""}</p>${outcomeView(week.previous, week.previous.reachedAt, "上週")}` : "";
  const pending = week.pending ? `<p class="team-progress-note" role="status">團隊貢獻待補記，下次同步或重新載入頁面時會補上。</p>` : "";
  return `<section class="yo-panel team-card">${title}${rule}${meta}${bar}${badge}<div class="team-card-box">${box}${invite}</div>${outcome}${previous}${pending}</section>`;
}

/** The fallback banner title while a team has no name (FSD-08A-3 Q2; FSD-03E will add team names). */
export const TEAM_TITLE_FALLBACK = "我的步行小隊";

/** C5: "（目前隊長名稱）的步行小隊"; `confirmedName` returns a teammate's name only once confirmed (never the memberId). */
export function teamTitleOf(leaderId: string | null, selfId: string, selfName: string, confirmedName: (memberId: string) => string | null): string {
  const name = leaderId === null ? null : leaderId === selfId ? selfName : confirmedName(leaderId);
  return name ? `${name}的步行小隊` : TEAM_TITLE_FALLBACK;
}

/** First character for the avatar; Array.from keeps a surrogate pair whole (C5). */
const initial = (name: string) => Array.from(name.trim())[0] ?? "?";

/**
 * FSD-08A-3: navy banner (status, title, 16-character invite code with a copy button), the weekly progress card
 * and the roster cards. `nameOf` (FSD-AC1 R3) turns a memberId into the text shown; it is always escaped here and
 * never used in attributes. `team.title` is computed by the panel (C5); `selfId` marks the viewer's own row.
 */
export function teamView(team: TeamViewInput, entries: RosterViewEntry[], rosterConfirmed: boolean, actions: TeamActionsInput | null = null, week: TeamWeekInput | null = null,
  nameOf: (memberId: string) => string = (memberId) => memberId, selfId: string | null = null): string {
  const weekOf = (memberId: string) => !week || !week.confirmed ? "本週 —" : `本週 ${(week.contributions[memberId] ?? 0).toLocaleString()} 步`;
  // 2026-10-06 (2): the roster shows only team-counted steps (after forming, from the ledger); personal steps stay on the steps page.
  const counted = (memberId: string) => (week && week.confirmed ? week.todayContributions?.[memberId] ?? 0 : null);
  const forming = team.memberCount < 2;
  const top = Math.max(0, ...entries.map((e) => counted(e.memberId) ?? 0));
  const rank = (e: RosterViewEntry) => counted(e.memberId) ?? -1;
  const rows = [...entries].sort((x, y) => rank(y) - rank(x)).map((entry) => {
    const name = nameOf(entry.memberId);
    const self = entry.memberId === selfId;
    const leader = entry.memberId === team.leaderMemberId ? "・隊長" : "";
    const avatar = `<span class="yo-avatar${self ? " self" : ""}" aria-hidden="true">${self ? "我" : escapeHtml(initial(name))}</span>`;
    if (forming) return `<article class="team-row">${avatar}<span class="team-row-main"><span class="team-row-name"><strong>${escapeHtml(name)}${leader}</strong></span><small>${team.status === "paused" ? "暫停中" : "招募中"}</small></span></article>`;
    const value = counted(entry.memberId);
    const first = value !== null && top > 0 && value === top ? `<span class="team-first">${icon("spark", { size: 16 })}今日第一</span>` : "";
    const ride = entry.rideCompleted && !(entry.pending || entry.fromCache) ? `<small>今日乘車加成</small>` : "";
    const today = value === null ? `<b>—</b>` : `<b>${value.toLocaleString()}</b><span>步</span>`;
    return `<article class="team-row">${avatar}<span class="team-row-main"><span class="team-row-name"><strong>${escapeHtml(name)}${leader}</strong>${first}</span><small>${escapeHtml(weekOf(entry.memberId))}</small>${ride}</span><span class="team-row-today">${today}<small>今天</small></span></article>`;
  }).join("") + (week && week.confirmed ? week.pastMembers.map((memberId) =>
    `<article class="team-row team-row-past"><span class="yo-avatar" aria-hidden="true">${escapeHtml(initial(nameOf(memberId)))}</span><span class="team-row-main"><span class="team-row-name"><strong>${escapeHtml(nameOf(memberId))}・歷史成員</strong></span><small>本週 ${(week.contributions[memberId] ?? 0).toLocaleString()} 步（退團前的貢獻保留）</small></span></article>`).join("") : "");
  const status = team.status === "recruiting" ? "招募中" : team.status === "paused" ? "未滿兩人・暫停" : team.status === "archived" ? "已封存" : "已成團";
  const leaveLabel = actions?.leaveMode === "cancel" ? "取消招募" : "退出隊伍";
  const actionRow = actions ? `<div class="team-actions"><button id="team-leave" class="yo-secondary" type="button" data-team-action="leave" ${actions.canLeave ? "" : "disabled"}>${leaveLabel}</button>${actions.canTransfer || team.leaderMemberId ? `<button id="team-transfer" class="yo-secondary" type="button" data-team-action="transfer" ${actions.canTransfer ? "" : "hidden"}>更換隊長</button>` : ""}</div>${actions.notice ? `<p id="team-actions-notice" class="demo-notice" role="status">${escapeHtml(actions.notice)}</p>` : ""}` : "";
  const head = `<p class="team-members-head">成員（${team.memberCount} 人，${team.memberCount >= 5 ? "已滿" : "最多 5 人"}）</p><p class="team-members-note">加入隊伍之後走的步數才會計入</p>`;
  const roster = `<section class="team-members">${head}<div class="team-roster-list">${rows || "<p>等待伺服器同步隊伍成員…</p>"}</div>${actionRow}${rosterConfirmed ? "" : `<p class="yo-muted">正在等待每位隊員的今日狀態由伺服器確認；快取不視為已同步。</p>`}</section>`;
  return `${teamWeekView(week, team, status)}${roster}`;
}

export interface TeamDialogInput {
  title: string;
  body: string;
  dismissLabel: string;
  confirmLabel: string;
  /** Step one of a captain transfer: pick one of these members; `label` is the display name (FSD-AC1), `memberId` the value. */
  choices?: { memberId: string; label: string; checked: boolean }[];
  busy?: boolean;
  /** A line that explains why the text changed while the dialog was open. */
  notice?: string | null;
}

/** Overlay/Dialog-Confirm: title and body, two equal buttons (left dismiss, right the verb). The dialog never closes by itself. */
export function teamDialogView(input: TeamDialogInput): string {
  const choices = input.choices ? `<div class="dialog-choices" role="radiogroup" aria-label="選擇新隊長">${input.choices.map((choice) =>
    `<label class="dialog-choice"><input type="radio" name="team-transfer-target" value="${escapeHtml(choice.memberId)}" ${choice.checked ? "checked" : ""} ${input.busy ? "disabled" : ""}><span>${escapeHtml(choice.label)}</span></label>`).join("")}</div>` : "";
  const statusText = input.busy ? "處理中，請稍候…" : (input.notice ?? "");
  const status = statusText ? `<p id="team-dialog-status" class="dialog-status" role="status">${escapeHtml(statusText)}</p>` : "";
  return `<div class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="team-dialog-title" aria-describedby="team-dialog-body"><h2 id="team-dialog-title">${escapeHtml(input.title)}</h2><p id="team-dialog-body">${escapeHtml(input.body)}</p>${choices}${status}<div class="dialog-actions"><button id="team-dialog-dismiss" class="secondary-button" type="button" ${input.busy ? "disabled" : ""}>${escapeHtml(input.dismissLabel)}</button><button id="team-dialog-confirm" class="primary-button" type="button" ${input.busy ? "disabled" : ""}>${escapeHtml(input.confirmLabel)}</button></div></div>`;
}

/** FSD-03E: the rename dialog. The draft is set as input.value by the panel (never an attribute); count and save follow the draft. */
export interface TeamRenameInput { units: number; max: number; hints: string[]; busy: boolean; notice: string | null }
export function teamRenameDialogView(input: TeamRenameInput): string {
  const over = input.units > input.max;
  const statusText = input.busy ? "儲存中，請稍候…" : (input.notice ?? "");
  return `<div class="confirm-dialog rename-dialog" role="dialog" aria-modal="true" aria-labelledby="team-dialog-title"><h2 id="team-dialog-title">隊伍名稱</h2>`
    + `<label class="rename-label" for="team-rename-input">輸入隊名</label><input id="team-rename-input" class="rename-input" type="text" autocomplete="off" enterkeyhint="done" aria-describedby="team-rename-count team-rename-hints team-dialog-status" ${input.busy ? "disabled" : ""}>`
    + `<p id="team-rename-count" class="rename-count${over ? " over" : ""}" aria-live="polite">${input.units}／${input.max}</p>`
    + `<ul id="team-rename-hints" class="rename-hints">${input.hints.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>`
    + `<p id="team-dialog-status" class="dialog-status" role="status">${escapeHtml(statusText)}</p>`
    + `<div class="dialog-actions"><button id="team-dialog-dismiss" class="secondary-button" type="button" ${input.busy ? "disabled" : ""}>取消</button><button id="team-dialog-confirm" class="primary-button" type="button" ${input.busy || over ? "disabled" : ""}>儲存</button></div></div>`;
}

export function staleOverlayView(): string {
  return `<section class="login-card"><p class="eyebrow">共用情境已更新</p><h1 id="stale-title">請重新載入</h1><p class="intro">管理者已推進共用時間或重設展示場次。這個畫面的資料已過期，共享操作已停用。</p><button id="stale-reload" class="primary-button" type="button">重新載入</button></section>`;
}

// ----- FSD-04A: weekly perfect attendance and ride coupons -----

export type PerfectWeekState = "unconfirmed" | "open" | "issuing" | "pending" | "issued" | "closed" | "identity";

export interface PerfectWeekCard {
  label: "本週" | "上週";
  confirmed: boolean;
  achievedCount: number;
  /** FSD-08A-3 B3: effective steps and claimed points from the confirmed daily documents (null without one). */
  days: { taskDate: string; status: "achieved" | "syncable" | "missed" | "future" | "unknown"; effectiveSteps?: number | null; claimed?: number | null;
    /** UX-1010 F14: today's ride (the steps still to walk count 1.5 times) and days before the member first used the app. */
    ride?: boolean; beforeStart?: boolean }[];
  /** FSD-08A-3 B3: the task date of today (the ringed cell, picked by default). */
  today?: string;
  state: PerfectWeekState;
}

/** FSD-04A weekly coupons and FSD-07A referral coupons in one list (Architect M4); `key` is unique per card. */
export interface CouponCard {
  key: string;
  kind: "weeklyPerfect" | "referralWelcome" | "referralReward";
  issuedAt: string;
  expiresAt: string;
  active: boolean;
  faceValue: number;
  /** null: no minimum fare (referral coupons). */
  minFare: number | null;
}

const COUPON_TITLE: Record<CouponCard["kind"], string> = { weeklyPerfect: "乘車獎勵券", referralWelcome: "推薦獎勵券", referralReward: "推薦獎勵券" };
/** FSD-08A-5 follow-up: who the referral coupon is for, on its own line under the amount. */
const COUPON_ROLE: Record<CouponCard["kind"], string> = { weeklyPerfect: "", referralWelcome: "（新戶）", referralReward: "（推薦人）" };

const WEEKDAY = ["一", "二", "三", "四", "五", "六", "日"];
const md = (date: string) => escapeHtml(date.slice(5, 10).replace("-", "/"));
const stamp = (at: string) => `${md(at)} ${escapeHtml(at.slice(11, 16))}`;
const steps = (value: number) => value.toLocaleString("en-US");

/** UX-1010 F14: what one circle shows. */
export type WeekDot = "done" | "missed" | "today" | "future" | "unknown";

export function weekDot(d: PerfectWeekCard["days"][number], today: string | undefined): WeekDot {
  if (d.status === "achieved") return "done";
  if (d.status === "future" || d.beforeStart) return "future";
  if (d.status === "unknown") return "unknown";
  return d.taskDate === today ? "today" : "missed";
}

/** UX-1010 F14: the sentence under the circles (whole week), or the picked day's line. */
export function weekSentence(card: PerfectWeekCard, selected: string | null): { lead: string; sub: string } {
  const at = card.days.findIndex((d) => d.taskDate === selected);
  const day = at >= 0 ? card.days[at] : null;
  if (day && day.effectiveSteps !== null && day.effectiveSteps !== undefined && (weekDot(day, card.today) !== "future" && weekDot(day, card.today) !== "unknown")) {
    const isToday = day.taskDate === card.today;
    const name = isToday ? "今天" : `週${WEEKDAY[at]}`;
    const walked = day.effectiveSteps;
    const lead = `${name}走了 <b>${steps(walked)}</b> 步`;
    if (walked >= 6000) return { lead, sub: "達標" };
    if (isToday) return { lead, sub: `再走 ${steps(walkFor(6000 - walked, !!day.ride))} 步就達標` };
    return { lead, sub: `差 ${steps(6000 - walked)} 步，這天沒有算進去` };
  }
  if (!card.confirmed || card.state === "unconfirmed") return { lead: "全勤進度同步中", sub: "未確認的資料不顯示為已達標" };
  if (card.state === "identity") return { lead: "請重新登入", sub: "展示身分已變更，請重新登入後再確認乘車券" };
  const n = card.achievedCount;
  if (n === 7 || card.state === "issued" || card.state === "issuing" || card.state === "pending") {
    return { lead: "這週七天都達標了！", sub: card.state === "issued" ? "$50 乘車券已經放進獎勵" : "$50 乘車券發放中" };
  }
  const dots = card.days.map((d) => weekDot(d, card.today));
  const missed = dots.filter((d) => d === "missed").length;
  if (card.days.some((d) => d.beforeStart)) return { lead: "下週一開始挑戰", sub: "週一到週日每天走滿 6,000 步，就能拿到 $50 乘車券。今天的步數照樣可以領點數" };
  if (missed > 0) return { lead: `這週有 ${missed} 天沒走滿`, sub: "下週一重新開始。今天的步數照樣可以領點數" };
  const lead = `已經 <b>${n} 天</b>，再 ${7 - n} 天就拿到了`;
  const today = card.days.find((d) => d.taskDate === card.today);
  if (today && today.status === "achieved") return { lead, sub: "今天達標了，明天繼續" };
  return { lead, sub: `今天走滿 6,000 步就算一天・目前 ${steps(today?.effectiveSteps ?? 0)} 步` };
}

const DOT_CHECK = `<svg width="16" height="16" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2.5 6.2l2.4 2.4 4.6-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const DOT_TEXT: Record<WeekDot, string> = { done: "已達標", missed: "未達標", today: "今天，進行中", future: "還沒到", unknown: "同步中" };

function perfectWeekCardView(card: PerfectWeekCard, selected: string | null): string {
  const current = card.label === "本週";
  const today = current ? card.today ?? null : null;
  const cells = card.days.map((d, i) => {
    const dot = weekDot(d, card.today);
    const isToday = d.taskDate === today;
    const pick = current && dot !== "future" && dot !== "unknown";
    const picked = current && selected === d.taskDate;
    const pct = Math.max(0, Math.min(100, Math.round(((d.effectiveSteps ?? 0) / 6000) * 100)));
    const inner = dot === "done" ? DOT_CHECK
      : dot === "missed" ? `<i class="pw-dash"></i>`
      : dot === "today" ? `<svg class="pw-ring" width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" focusable="false"><circle class="pw-ring-bg" cx="18" cy="18" r="15.5"/><circle class="pw-ring-fg" cx="18" cy="18" r="15.5" pathLength="100" style="--p:${pct}"/></svg>`
      : "";
    const label = `週${WEEKDAY[i]} ${md(d.taskDate)} ${dot === "today" && d.status === "achieved" ? "已達標" : DOT_TEXT[dot]}${isToday ? "（今天）" : ""}`;
    const circle = pick
      ? `<button type="button" class="pw-dot pw-dot--${dot}" data-select-date="${escapeHtml(d.taskDate)}" aria-pressed="${picked}"><span class="yo-sr-only">${label}</span>${inner}</button>`
      : `<span class="pw-dot pw-dot--${dot}"><span class="yo-sr-only">${label}</span>${inner}</span>`;
    return `<li class="${picked ? "picked" : ""}">${circle}<span class="pw-day${isToday ? " today" : ""}" aria-hidden="true">${isToday ? "今天" : WEEKDAY[i]}</span></li>`;
  }).join("");
  const strip = `<ol class="pw-dots" aria-label="${card.label}週一到週日">${cells}</ol>`;
  if (!current) {
    // Mondays: last week as a compact line under this week (not clickable).
    const line = card.state === "issued" ? "上週七天都達標了！$50 乘車券已經放進獎勵" : card.state === "issuing" || card.state === "pending" ? "上週七天都達標了！$50 乘車券發放中"
      : !card.confirmed ? "上週進度同步中" : `上週達標 ${card.achievedCount} 天`;
    return `<div class="pw-card pw-card-compact" data-week-label="上週"><p class="pw-compact-title">上週</p>${strip}<p class="pt-sub">${escapeHtml(line)}</p></div>`;
  }
  const s = weekSentence(card, selected);
  return `<div class="pw-card" data-week-label="本週">${strip}<div class="pw-say" role="status"><p class="pt-lead">${s.lead}</p><p class="pt-sub">${escapeHtml(s.sub)}</p></div><p class="yo-muted pw-rule">${PERFECT_WEEK_RULE}</p></div>`;
}

/** FSD-04B / UX-1010 F14: the rule as it is enforced (seven achieved days; the points claimed do not matter). */
export const PERFECT_WEEK_RULE = "週一到週日每天走滿 6,000 步，就能拿到一張 $50 乘車券";

/** This week's card; on Mondays the previous week follows as a compact strip (Q4: not clickable). `selected` is the picked day. */
export function perfectWeekView(current: PerfectWeekCard, previous: PerfectWeekCard | null, selected: string | null = null): string {
  return perfectWeekCardView(current, selected) + (previous ? perfectWeekCardView(previous, null) : "");
}

const COUPON_KIND: Record<CouponCard["kind"], string> = { weeklyPerfect: "每週七日全勤獎勵", referralWelcome: "推薦新戶獎勵", referralReward: "推薦新戶獎勵" };

/**
 * FSD-08A-5: my reward coupons — only coupons in hand that are still valid (expired ones drop off the list; no stamp,
 * no not-yet-earned weekly card, no fare check).
 */
export function couponsView(coupons: CouponCard[] | null): string {
  if (coupons === null) return "<p>獎勵券同步中…</p>";
  const valid = coupons.filter((c) => c.active);
  if (valid.length === 0) return `<p class="yo-muted">還沒有獎勵券。完成一週七日全勤，或推薦新戶，即可獲得。</p>`;
  // Newest first; the same moment (a referee's two welcome coupons) keeps a stable order by key.
  const cards = [...valid].sort((a, b) => (a.issuedAt !== b.issuedAt ? (a.issuedAt < b.issuedAt ? 1 : -1) : a.key < b.key ? -1 : 1)).map((c) => {
    const fare = c.minFare === null ? "無最低車資" : `最低車資 NT$${c.minFare}（含）`;
    return `<article class="yo-coupon coupon-card"><div class="yo-coupon-row"><div class="yo-coupon-icon">${icon("ticket", { size: 28 })}</div><div><small>${COUPON_KIND[c.kind]}</small><h3>NT$${c.faceValue} ${COUPON_TITLE[c.kind]}${COUPON_ROLE[c.kind] ? `<span class="yo-coupon-role">${COUPON_ROLE[c.kind]}</span>` : ""}</h3><p>${fare}</p><p class="team-progress-note">獲得：${stamp(c.issuedAt)}<br>到期：${stamp(c.expiresAt)}</p></div></div></article>`;
  }).join("");
  return `${cards}<p class="yo-muted">僅展示模擬獎勵，不能在正式 yoxi 使用。</p>`;
}

export function couponPromptView(): string {
  return `<section class="login-card"><p class="eyebrow">七日全勤</p><h1 id="coupon-prompt-title">恭喜完成本週七日挑戰！</h1><p class="intro">已獲得 NT$50 乘車獎勵券。每天為自己多走一點，也別忘了適時休息，下一段路讓 yoxi 陪您。</p><div class="dialog-actions"><button id="coupon-prompt-close" class="secondary-button" type="button">關閉</button><button id="coupon-prompt-go" class="primary-button" type="button">查看獎勵券</button></div></section>`;
}

// ----- FSD-06A: points balance, chests and the points record -----

export interface RewardsViewInput {
  /** null while the daily list or the openings are not server-confirmed (or a document failed to parse). */
  balance: number | null;
  /** Weeks with an own unopened chest, oldest first; null while not confirmed. */
  chests: string[] | null;
  rows: { label: string; date: string; points: number; at: string | null; kind?: string; expired?: boolean; expiresAt?: string }[] | null;
  /** Opening is disabled while another dialog is open or an opening runs. */
  canOpen: boolean;
  /** FSD-08A-6: the chest card's stage (附圖三); without it the plain chest list is shown (diagnostics). */
  stage?: ChestStage;
}

/**
 * FSD-08A-3: three showcase cards — my points, team chests (the "團隊驚喜" card) and the points record. The shell shows
 * the record after the coupons (`part` "top" here, `rewardsRecordView` below them); the diagnostics view keeps all.
 */
export function rewardsView(input: RewardsViewInput, part: "all" | "top" | "balance" | "chests" = "all"): string {
  const balance = `<section class="yo-panel"><p class="team-progress-head pw-head"><span class="points-balance-label">已獲得點數</span>${input.balance === null ? "<b>—</b>" : count(input.balance.toLocaleString(), "點")}</p><p class="points-use">1 點可折 1 元 yoxi 車資</p></section>`;
  const has = input.chests !== null && input.chests.length > 0;
  const tile = input.chests === null ? "" : `<span class="yo-chest">${has ? icon("gift", { size: 28, label: "寶箱可開啟" }) : icon("lock", { size: 28, label: "沒有未開的寶箱" })}</span>`;
  const chestBody = input.chests === null ? "<p>寶箱同步中…</p>"
    : !has ? `<p>目前沒有未開的寶箱。和隊友一起完成團隊目標，合資格成員各得一箱。</p>`
    : `<p>團隊任務已達標，打開您的寶箱！</p><ul class="chest-list">${input.chests!.map((w) => `<li class="chest-item"><span>${icon("gift", { size: 24 })}<span>${escapeHtml(w)} 週團隊寶箱</span></span><button class="yo-primary" type="button" data-open-chest="${escapeHtml(w)}" ${input.canOpen ? "" : "disabled"}>打開寶箱</button></li>`).join("")}</ul>`;
  const chests = input.stage ? chestStageView(input.stage, input.canOpen) : `<section class="yo-panel"><div class="yo-panel-head"><div><p class="yo-kicker">團隊驚喜</p><h2>團隊寶箱</h2></div>${tile}</div>${chestBody}</section>`;
  if (part === "balance") return balance;
  if (part === "chests") return chests;
  return part === "top" ? `${balance}${chests}` : `${balance}${chests}${rewardsRecordView(input.rows)}`;
}

export function rewardsRecordView(inputRows: RewardsViewInput["rows"]): string {
  const input = { rows: inputRows };
  const rows = input.rows === null ? "" : input.rows.length === 0 ? `<p class="team-progress-note">還沒有獲得紀錄。</p>`
    : `<ol class="points-record" aria-label="獲得紀錄">${input.rows.map((r) => {
    const note = r.kind === "referral" ? `<small>獲得：${stamp(r.at ?? "")}・到期：${stamp(r.expiresAt ?? "")}${r.expired ? "・已到期（不計入餘額）" : ""}</small>`
      : r.at ? `<small>開箱：${stamp(r.at)}</small>` : "";
    return `<li class="${r.expired ? "points-expired" : ""}"><span>${escapeHtml(r.label)}${note}</span><b>+${r.points} 點</b></li>`;
  }).join("")}</ol>`;
  return `<section class="yo-panel"><h2>獲得紀錄</h2>${rows}<p class="yo-muted">點數為展示模擬，不代表真實發放和泰 Points。</p></section>`;
}

/** FSD-08A-6 (附圖三): the team chest card by stage; "活動說明" opens the play guide. */
/** 2026-10-06 (12): the chest card pictures of UI-design 3-5 (grey box / red-ribbon gift / opened with flying tickets), colours from tokens. */
type ChestCardIcon = "locked" | "gift" | "opened";
function chestCardIcon(kind: ChestCardIcon): string {
  // Colours live in CSS (.cc-*; the locked box is all grey), as the opening overlay does.
  const lid = `<path class="cc-face" d="M100,30 L152,56 L100,82 L48,56 Z"/><path class="cc-ribbon cc-lid-band" d="M71.4,67.7 L79.2,71.6 L131.2,45.6 L123.4,41.7 Z"/><path class="cc-ribbon cc-lid-band" d="M128.6,67.7 L120.8,71.6 L68.8,45.6 L76.6,41.7 Z"/>`;
  const body = `<path class="cc-face" d="M100,82 L152,56 L152,102 L100,128 Z"/><path class="cc-face cc-face-l" d="M48,56 L100,82 L100,128 L48,102 Z"/>`;
  const ribbons = `<path class="cc-ribbon" d="M71.4,67.7 L79.2,71.6 L79.2,117.6 L71.4,113.7 Z"/><path class="cc-ribbon" d="M120.8,71.6 L128.6,67.7 L128.6,113.7 L120.8,117.6 Z"/>`;
  const inner = kind === "opened"
    ? `<path class="cc-swirl" d="M34,60 q4,-6 9,-3"/><path class="cc-swirl" d="M168,74 q5,-5 9,-1"/><circle class="cc-dot" cx="38" cy="82" r="2.6"/><circle class="cc-dot" cx="172" cy="96" r="2.2"/>`
      + body + `<path class="cc-inner" d="M52,57.5 L100,81 L148,57.5 L100,34 Z"/><path class="cc-edge" d="M48,56 L100,82 L152,56"/>` + ribbons
      + `<path class="cc-trail" d="M100,74 C112,52 124,44 138,38"/>`
      + `<g transform="rotate(-14 96 40)"><rect class="cc-ticket cc-ticket-sm" x="76" y="28" width="38" height="22" rx="5"/><path class="cc-tline" d="M83,39 h10"/></g>`
      + `<g transform="rotate(9 144 44)"><rect class="cc-ticket" x="116" y="24" width="56" height="34" rx="7"/><path class="cc-tline cc-tline-lg" d="M126,38 h20"/><path class="cc-tline cc-tline-soft" d="M126,47 h12"/></g>`
      + `<g transform="translate(-30,-44) rotate(-12 100 56)">${lid}</g>`
    : body + ribbons + `<g>${lid}</g>`;
  return `<svg class="chest-card-svg chest-card-svg--${kind}" width="64" height="54" viewBox="0 0 200 170" aria-hidden="true" focusable="false"><ellipse class="cc-shadow" cx="100" cy="146" rx="44" ry="6"/>${inner}</svg>`;
}

export function chestStageView(stage: ChestStage, canOpen: boolean): string {
  const help = `<button type="button" class="yo-link chest-help" data-open-guide>活動說明 ${squareArrow()}</button>`;
  const card = (iconName: ChestCardIcon, title: string, caption: string, body: string, foot: string) =>
    `<section class="yo-panel chest-card"><div class="chest-card-head"><span class="yo-chest">${chestCardIcon(iconName)}</span><div><h2>${title}</h2><p class="chest-card-caption">${caption}</p></div></div>${body}<div class="chest-card-foot"><span>${foot}</span>${help}</div></section>`;
  switch (stage.kind) {
    case "syncing": return card("locked", "團隊寶箱", "寶箱同步中…", "", "");
    case "open": {
      const caption = stage.teamTotal !== null && stage.awardCount !== null
        ? `${stage.thisWeek ? "本週" : "上週"}全隊走了 <b class="chest-red">${wanOne(stage.teamTotal)} 萬步</b>・${stage.awardCount} 人都有份`
        : stage.thisWeek ? "本週達標了，每人可以開一次" : `${escapeHtml(stage.weekId)} 週團隊寶箱`;
      const more = stage.more > 0 ? `<p class="team-progress-note">還有 ${stage.more} 個寶箱沒開</p>` : "";
      return card("gift", "團隊寶箱可以開了", caption, `<button class="yo-primary yo-full" type="button" data-open-chest="${escapeHtml(stage.weekId)}" ${canOpen ? "" : "disabled"}>開團隊寶箱</button>${more}`, "");
    }
    // UX-1010 F11: opened is opened; the next chest comes when the team reaches the target again.
    case "opened": return stage.thisWeek
      ? card("opened", "這週的寶箱開過了", `抽到 <b class="chest-red">${stage.points} 點</b>・下週一重新開始累計`, "", "")
      : card("opened", "上週的寶箱開過了", `抽到 <b class="chest-red">${stage.points} 點</b>・這週達標就能再開一次`, "", "");
    case "reached": return card("gift", "本週達標了！", "寶箱準備中，稍後就能開", "", "接下來走的步數照樣算進個人點數");
    case "solo": return card("locked", "團隊寶箱", "還沒解鎖・再邀 1 人成團，才開始累計步數", `<button type="button" class="yo-secondary yo-full" data-goto-page="team">前往團隊</button>`, "");
    case "progress": return card("locked", "團隊寶箱", `本週還差 <b class="chest-red">${wanOneUp(stage.remaining)} 萬步</b>・剩 ${stage.daysLeft} 天<br>達標後每人可以開一次`, "", "週一 00:00 結算");
    case "noTeam": return card("locked", "團隊寶箱", "加入或建立隊伍，一週全隊走滿 30 萬步就能開寶箱", `<button type="button" class="yo-secondary yo-full" data-goto-page="team">前往團隊</button>`, "");
  }
}

export type ChestOverlayPhase = { kind: "opening"; skipped: boolean } | { kind: "result"; points: number; tier: string } | { kind: "failed"; message: string };

/** FSD-08A-6: the isometric chest from UI-design 3-6 (colours come from CSS tokens). */
function chestBoxSvg(): string {
  return `<svg class="chest-svg" width="200" height="170" viewBox="0 0 200 170" aria-hidden="true" focusable="false"><g class="chest-box">
    <ellipse class="cb-shadow" cx="100" cy="146" rx="44" ry="6"/>
    <g class="cb-cf"><path class="cb-line-minor" d="M34,60 q4,-6 9,-3"/><path class="cb-line-minor" d="M168,74 q5,-5 9,-1"/><path class="cb-line-navy" d="M44,96 l5,-4"/><path class="cb-line-minor" d="M160,40 l6,-3"/><circle class="cb-dot" cx="38" cy="82" r="2.6"/><circle class="cb-dot" cx="172" cy="96" r="2.2"/></g>
    <path class="cb-face-r" d="M100,82 L152,56 L152,102 L100,128 Z"/><path class="cb-face-l" d="M48,56 L100,82 L100,128 L48,102 Z"/>
    <path class="cb-inner" d="M52,57.5 L100,81 L148,57.5 L100,34 Z"/><path class="cb-edge" d="M48,56 L100,82 L152,56"/>
    <path class="cb-ribbon" d="M71.4,67.7 L79.2,71.6 L79.2,117.6 L71.4,113.7 Z"/><path class="cb-ribbon" d="M120.8,71.6 L128.6,67.7 L128.6,113.7 L120.8,117.6 Z"/>
    <path class="cb-trail" d="M100,74 C112,52 124,44 138,38"/>
    <g class="cb-fly cb-f2"><g transform="rotate(-14 96 40)"><rect class="cb-ticket" x="76" y="28" width="38" height="22" rx="5"/><path class="cb-ticket-line" d="M83,39 h10"/></g></g>
    <g class="cb-fly"><g transform="rotate(9 144 44)"><rect class="cb-ticket" x="116" y="24" width="56" height="34" rx="7"/><path class="cb-ticket-line" d="M126,38 h20"/><path class="cb-ticket-line2" d="M126,47 h12"/></g></g>
    <g class="cb-lid"><path class="cb-lid-top" d="M100,30 L152,56 L100,82 L48,56 Z"/><path class="cb-ribbon cb-ribbon-lid" d="M71.4,67.7 L79.2,71.6 L131.2,45.6 L123.4,41.7 Z"/><path class="cb-ribbon cb-ribbon-lid" d="M128.6,67.7 L120.8,71.6 L68.8,45.6 L76.6,41.7 Z"/></g>
  </g></svg>`;
}

/**
 * The opening dialog (FSD-08A-6, UI-design 3-6): the box shakes until the server confirms, then the lid flies, the
 * decorative tickets fly out, the prize card rises and its number rolls to the confirmed points. Never shows a
 * number before the server's confirmation ("確認中…" when skipped).
 */
export function chestOverlayView(phase: ChestOverlayPhase): string {
  if (phase.kind === "opening") {
    return `<div class="chest-panel" data-phase="opening">${chestBoxSvg()}<strong id="chest-overlay-title" tabindex="-1">${phase.skipped ? "確認中…" : "團隊寶箱開啟中…"}</strong><small role="status">${phase.skipped ? "正在等待伺服器確認發放狀態" : "正在揭曉您的獎勵"}</small>${phase.skipped ? "" : `<button id="chest-skip" class="text-button" type="button">跳過</button>`}</div>`;
  }
  if (phase.kind === "result") {
    const big = phase.tier === "大獎" || phase.tier === "超級獎";
    return `<div class="chest-panel opened${big ? " chest-big" : ""}" data-phase="result">${chestBoxSvg()}<div class="chest-slogan" aria-hidden="true">${big ? "Lucky Day!" : "Nice!"}</div><div class="chest-prize"><div class="chest-prize-name">和泰 Points</div><div class="chest-prize-amt"><span class="chest-reel" data-target="${phase.points}"><span class="chest-strip"><i>${phase.points}</i></span></span> 點</div><div class="chest-prize-note">已存入您的點數（模擬）</div><div class="chest-tier">${escapeHtml(phase.tier)}</div></div><strong id="chest-overlay-title" class="yo-sr-only">您抽中了 ${phase.points} 和泰 Points</strong><small role="status" class="yo-sr-only">${escapeHtml(phase.tier)}・已發放（模擬）</small><button id="chest-close" class="yo-primary yo-full chest-take" type="button">收下</button></div>`;
  }
  return `<div class="chest-panel" data-phase="failed"><strong id="chest-overlay-title">寶箱未開啟</strong><small role="status">${escapeHtml(phase.message)}</small><button id="chest-close" class="yo-primary yo-full" type="button">關閉</button></div>`;
}

// ----- FSD-07A: referrals (simulated) -----

export interface ReferralViewInput {
  myCode: string;
  /** The viewer as referee: undefined while syncing, null when not bound yet. */
  own: { referrerName: string; boundAt: string; firstRideAt: string | null } | null | undefined;
  /** People the viewer referred: undefined while syncing. */
  mine: { name: string; firstRide: boolean }[] | undefined;
  busy: boolean;
  /** FSD-08A-6: why the last binding attempt was refused (shown under the field). */
  formError?: string | null;
}

export function referralView(input: ReferralViewInput): string {
  const code = `<div class="referral-code"><div class="yo-code" id="referral-code">${escapeHtml(input.myCode)}</div><button id="referral-copy" class="yo-secondary yo-full" type="button">複製推薦碼</button><p class="yo-muted">朋友填您的推薦碼並完成首乘，您獲得 NT$100 推薦獎勵券（60 天內有效）與 50 點和泰 Points（一年內有效）。</p></div>`;
  const step = input.own ? (input.own.firstRideAt ? 3 : 2) : 0;
  const steps = `<div class="yo-referral-steps" aria-label="推薦進度">${["輸入推薦碼", "完成註冊", "完成首乘"].map((label, i) =>
    `<span data-step="${i + 1}" class="${i < step ? "done" : ""}"><small>${label}${i < step ? "（已完成）" : ""}</small></span>`).join("<i></i>")}</div>`;
  let mine: string;
  if (input.own === undefined) {
    mine = "<p>推薦狀態同步中…</p>";
  } else if (input.own === null) {
    // FSD-08A-6: a wrong code is explained right under the field; the panel keeps what was typed.
    const error = input.formError ? `<p id="referral-form-error" class="error-message" role="alert">${escapeHtml(input.formError)}</p>` : "";
    mine = `${steps}<form id="referral-form" class="referral-form"><label for="referral-input" class="referral-label">填寫朋友的推薦碼（只能綁定一次）</label><div class="yo-inline"><input id="referral-input" maxlength="40" autocomplete="off" ${input.busy ? "disabled" : ""}><button class="yo-primary" type="submit" ${input.busy ? "disabled" : ""}>綁定推薦碼</button></div>${error}<p class="yo-muted">新戶首次登入後 3 天內綁定即完成註冊任務，可得 NT$50 推薦獎勵券 ×2。</p></form>`;
  } else {
    mine = `<p>推薦人：${escapeHtml(input.own.referrerName)}</p>${steps}${input.own.firstRideAt
      ? `<p class="demo-notice" role="status">首乘已完成，推薦獎勵已發放給推薦人。</p>`
      : `<button id="referral-ride" class="yo-primary yo-full" type="button" ${input.busy ? "disabled" : ""}>模擬完成首次乘車（信用卡付款）</button><p class="yo-muted">只能按一次；與每日任務的「模擬完成一趟 yoxi」分開計算。</p>`}`;
  }
  const people = input.mine === undefined ? "<p>同步中…</p>"
    : input.mine.length === 0 ? `<p class="team-progress-note">還沒有人填您的推薦碼。</p>`
    : `<ul class="points-record">${input.mine.map((p) => `<li><span>${escapeHtml(p.name)}</span><b>${p.firstRide ? "已首乘" : "已註冊"}</b></li>`).join("")}</ul>`;
  return `${code}<h3 class="points-record-title referral-bullet">您推薦的新戶狀態</h3>${people}<h3 class="points-record-title referral-bullet">您的新戶狀態</h3>${mine}`;
}

// ----- FSD-08A-1: the app shell (four pages, menu drawer, map hero, invite card) -----

export interface AppShellInput { role: "member" | "admin" }

/** FSD-08A-6: tabs inside a page (今日／本週／昨日 …); the first is selected until the shell restores the last choice. */
export const STEP_TABS: [string, string][] = [["today", "今日"], ["week", "本週"], ["yesterday", "昨日"]];
export const REWARD_TABS: [string, string][] = [["points", "我的點數"], ["chests", "寶箱"], ["coupons", "獎勵券"]];
export const INVITE_TABS: [string, string][] = [["team", "組隊"], ["referral", "新戶"]];
const TAB_GROUP_LABEL: Record<string, string> = { steps: "步數分頁", rewards: "獎勵分頁", invite: "邀請分頁" };
export function subTabsView(group: string, tabs: [string, string][]): string {
  return `<div class="app-tabs" role="tablist" aria-label="${TAB_GROUP_LABEL[group] ?? group}" data-tabs="${group}">${tabs.map(([id, label], i) =>
    `<button type="button" role="tab" id="${group}-tab-${id}" class="app-tab${i === 0 ? " selected" : ""}" data-subtab="${id}" aria-selected="${i === 0}" aria-controls="${group}-panel-${id}">${label}</button>`).join("")}</div>`;
}

/** 2026-10-07: the play guide, two pages in a bottom sheet (page 1 meets Yoika; page 2 explains how to play). */
/** 2026-10-07: Yoika's examples (what it sensed, what it says), swiped left and right. */
export const YOIKA_EXAMPLES: [string, string][] = [
  ["天氣・時段・習慣", "一小時後降雨機率 70%，也快到您平常下班的時間，要先幫您預約 yoxi 嗎？"],
  ["步數・位置", "今天只差 1,200 步就能再領 1 點，附近公園繞一圈剛好，大約 12 分鐘。"],
];

export type GuidePage = "yoika" | "rules";
interface GuideRow { icon: IconName; title: string; sub: string; value: string; bullets: string[] }
export const GUIDE_ROWS: GuideRow[] = [
  { icon: "shoe", title: "每走 2,000 步", sub: "一天最多領 3 點", value: `<b>1</b><span>點</span>`,
    bullets: ["走到 2,000、4,000、6,000 步，各領 1 點", "昨天忘了領？今天 24:00 前還能補領"] },
  { icon: "car", title: "搭一趟 yoxi", sub: "當天的步數自動加成", value: `<b>1.5</b><span>倍</span>`,
    bullets: ["例如走 4,000 步再搭一趟，就算 6,000 步"] },
  { icon: "star", title: "天天走滿 6,000 步", sub: "週一到週日都達標，送乘車券", value: `<b>$50</b>`,
    bullets: ["$50 乘車券一張，30 天內有效", "車資滿 $150 可用"] },
  { icon: "team", title: "組隊走 30 萬步", sub: "2–5 人一隊，一週內達標", value: `<strong>團隊寶箱</strong>`,
    bullets: ["達標後，每位隊員可以開一次寶箱，抽和泰 Points", "一個人一週只能幫一隊累積步數", "退出已成團的隊伍後，下週一才能加入別隊"] },
  { icon: "userPlus", title: "推薦朋友", sub: "朋友首次搭乘，再送 50 點", value: `<b>$100</b>`,
    bullets: ["朋友輸入您的推薦碼，他先拿到兩張 $50 券", "朋友第一次搭乘後，您拿到 $100 券（60 天內有效）和 50 點（一年內有效）"] },
  { icon: "bell", title: "Yoika提醒您", sub: "該領、該補，鈴鐺都會先說", value: `<strong>即時</strong>`,
    bullets: ["可領的點數、昨天的補領期限", "新拿到的乘車券、推薦獎勵、還沒開的寶箱", "看過之後按「全部已讀」，一次清掉"] },
];
const sheetClose = `<button id="guide-close" class="guide-close" type="button" aria-label="關閉">${icon("close", { size: 24 })}</button>`;

export function guideView(page: GuidePage = "rules", openRow: number | null = null): string {
  if (page === "yoika") {
    return `<div class="guide-sheet guide-sheet--yoika" role="dialog" aria-modal="true" aria-labelledby="guide-title">${sheetClose}
      <span class="guide-squid" aria-hidden="true"></span>
      <h2 id="guide-title">嗨，我是 Yoika</h2>
      <p class="guide-lead">我會隨時留意天氣、時段、您的位置和平常的搭車及走路節奏，在剛好的時機提醒您一聲。</p>
      <div class="guide-example">
        <div id="guide-slides" class="guide-slides" aria-label="Yoika 提醒範例">${YOIKA_EXAMPLES.map(([sense, text], i) =>
          `<div class="guide-slide" role="group" aria-label="第 ${i + 1} 則，共 ${YOIKA_EXAMPLES.length} 則"><p class="guide-sense">${icon("spark", { size: 16 })}感知到 ${sense}</p><p>「${text}」</p></div>`).join("")}</div>
      </div>
      <div class="guide-dots" role="group" aria-label="切換範例">${YOIKA_EXAMPLES.map((_, i) =>
        `<button type="button" class="guide-dot${i === 0 ? " on" : ""}" data-guide-slide="${i}" aria-label="第 ${i + 1} 則範例"${i === 0 ? ' aria-current="true"' : ""}><i></i></button>`).join("")}</div>
      <button id="guide-next" class="yo-primary yo-full" type="button">看看怎麼玩</button>
    </div>`;
  }
  const rows = GUIDE_ROWS.map((r, i) => {
    const open = openRow === i;
    return `<li class="guide-row${open ? " open" : ""}"><button type="button" class="guide-row-head" data-guide-row="${i}" aria-expanded="${open}" aria-controls="guide-row-${i}">
        <span class="guide-icon">${icon(r.icon, { size: 24 })}</span><span class="guide-row-text"><strong>${r.title}</strong><small>${r.sub}</small></span>
        <span class="guide-row-value">${r.value}</span><span class="guide-chevron" aria-hidden="true">${icon("chevron", { size: 20 })}</span></button>
      <div id="guide-row-${i}" class="guide-collapse" ${open ? "" : 'aria-hidden="true"'}><div class="guide-collapse-inner"><ul class="guide-bullets">${r.bullets.map((t) => `<li>${t}</li>`).join("")}</ul></div></div></li>`;
  }).join("");
  return `<div class="guide-sheet" role="dialog" aria-modal="true" aria-labelledby="guide-title">${sheetClose}
    <h2 id="guide-title">怎麼玩</h2>
    <p class="guide-sub">走路就能存和泰 Points，還有乘車券和寶箱</p>
    <ul class="guide-rows">${rows}</ul>
    <button id="guide-yoika" class="guide-yoika" type="button"><span class="guide-squid guide-squid--small" aria-hidden="true"></span><span class="guide-row-text"><strong>認識 Yoika</strong><small>之後幫您留意天氣和出門習慣</small></span>${squareArrow()}</button>
    <p class="guide-foot"><b>展示版</b>　點步數下面的「輸入步數」就能輸入今天的步數。步數、點數和券都是模擬資料；Yoika 的提醒是概念展示，不會讀取您的個人資料。</p>
  </div>`;
}

/** 2026-10-07: page 1 opens by itself once per member and device (versioned, so everyone sees the new guide once). */
export const guideSeenKey = (memberId: string) => `yoi:guide-v2-seen:${memberId}`;

const SHELL_NAV: [ShellPage, IconName][] = [["steps", "shoe"], ["team", "team"], ["rewards", "gift"], ["invite", "userPlus"]];

/** The shell around the shared panels; all four pages are mounted, only one is visible (the shell toggles `hidden`). */
export function appShellView(_input: AppShellInput): string {
  const page = (id: ShellPage, body: string) =>
    `<section class="app-page" data-page="${id}" aria-labelledby="page-${id}-title" ${id === "steps" ? "" : "hidden"}><h1 id="page-${id}-title" class="app-page-title" tabindex="-1">${PAGE_LABEL[id]}</h1>${body}</section>`;
  return `<div class="yo-app app-shell">
    <header class="yo-topbar app-topbar">
      <button id="menu-button" class="app-icon-button" type="button" aria-label="開啟選單" aria-expanded="false" aria-controls="drawer">${icon("menuLines", { size: 24 })}</button>
      <div class="yo-brand app-brand-center" aria-label="${PLATFORM_NAME}">${yoiBrand("遊移", true)}</div>
      <div class="app-top-right"><button id="info-button" class="app-icon-button" type="button" aria-label="遊玩指南" aria-expanded="false" aria-controls="guide">${icon("info", { size: 24 })}</button><div id="bell-slot" class="app-bell-slot">${bellView(undefined)}</div></div>
    </header>
    <main class="yo-content app-content">
      ${page("steps", /* FSD-08A-4 D5: map, today card, weekly task, yesterday (top to bottom) */ `<div class="yo-walk-week-card"><div id="map-hero">${mapHeroView({ label: "尚未開啟定位", offerLocate: true, ownPosition: false, steps: null, effective: null, fallback: false })}</div></div>
        ${subTabsView("steps", STEP_TABS)}
        <div class="app-subpanel" data-subgroup="steps" data-subpanel="today" id="steps-panel-today" role="tabpanel" aria-labelledby="steps-tab-today">${dailyPanelView("today", { stepsInSheet: true })}${locationPrivacyCardView(true)}</div>
        <div class="app-subpanel" data-subgroup="steps" data-subpanel="week" id="steps-panel-week" role="tabpanel" aria-labelledby="steps-tab-week" hidden><section class="yo-walk-week-card app-week-card" aria-label="個人週任務">${perfectWeekSection()}</section>${locationPrivacyCardView(false)}</div>
        <div class="app-subpanel" data-subgroup="steps" data-subpanel="yesterday" id="steps-panel-yesterday" role="tabpanel" aria-labelledby="steps-tab-yesterday" hidden>${dailyPanelView("yesterday", { stepsInSheet: true })}${locationPrivacyCardView(false)}</div>
`)}
      ${page("team", teamSection())}
      ${page("rewards", `<div class="yo-page-heading"><h2 id="rewards-title">獎勵與寶箱</h2><p>點數、寶箱與獎勵券都在這裡。</p></div>
        ${subTabsView("rewards", REWARD_TABS)}
        <div class="app-subpanel" data-subgroup="rewards" data-subpanel="points" id="rewards-panel-points" role="tabpanel" aria-labelledby="rewards-tab-points"><section id="rewards" class="app-block" aria-label="我的點數" tabindex="-1"><div id="rewards-content"><p>正在讀取點數…</p></div><div id="rewards-error" class="error-message" role="alert" aria-live="assertive" hidden></div></section><div id="rewards-record"></div></div>
        <div class="app-subpanel" data-subgroup="rewards" data-subpanel="chests" id="rewards-panel-chests" role="tabpanel" aria-labelledby="rewards-tab-chests" hidden><div id="rewards-chests" tabindex="-1"></div></div>
        <div class="app-subpanel" data-subgroup="rewards" data-subpanel="coupons" id="rewards-panel-coupons" role="tabpanel" aria-labelledby="rewards-tab-coupons" hidden>${couponsSection()}</div>`)}
      ${page("invite", `<div class="yo-page-heading"><h2>讓好隊友一起加入</h2><p>邀請入隊和推薦新戶是不同任務。</p></div>
        ${subTabsView("invite", INVITE_TABS)}
        <div class="app-subpanel" data-subgroup="invite" data-subpanel="team" id="invite-panel-team" role="tabpanel" aria-labelledby="invite-tab-team"><section class="yo-panel" aria-labelledby="invite-card-title"><h2 id="invite-card-title">您的隊伍邀請碼</h2><div id="invite-card">${inviteCardView({ kind: "syncing" })}</div></section></div>
        <div class="app-subpanel" data-subgroup="invite" data-subpanel="referral" id="invite-panel-referral" role="tabpanel" aria-labelledby="invite-tab-referral" hidden>${referralSection()}</div>`)}
      <p id="session-error" class="error-message" role="alert" aria-live="polite" hidden></p>
    </main>
    <nav class="yo-bottom-nav" aria-label="主要導覽">${SHELL_NAV.map(([id]) =>
      `<button type="button" data-nav="${id}" class="${id === "steps" ? "selected" : ""}" ${id === "steps" ? 'aria-current="page"' : ""}>${navButtonView(id, id === "steps")}</button>`).join("")}</nav>
  </div>${stepsSheetView()}`;
}

/** Bottom navigation button content (the shell rewrites it on a page change). */
export function navButtonView(id: ShellPage, selected: boolean): string {
  const name = SHELL_NAV.find(([p]) => p === id)![1];
  return `${icon(name, { size: 24, mono: selected })}<span>${PAGE_LABEL[id]}</span>`;
}

export interface DrawerInput {
  displayName: string;
  memberId: string;
  role: "member" | "admin";
  sessionId: string;
  /** null while the balance is not server-confirmed. */
  balance: number | null;
  /** A short message shown inside the drawer (an upcoming feature, the about text). */
  note: string | null;
  /** 2026-10-06 (7): the account details are folded under the name. */
  accountOpen?: boolean;
  /** FSD-PA: the public test build's tools (clock, name, restart); it has no sign-out. */
  tools?: { id: string; label: string }[];
}

/** The menu drawer (left side sheet). Upcoming features never navigate; they only show a note. */
export function drawerView(input: DrawerInput): string {
  const items = menuItems(input.role);
  const action = (id: string, label: string, extra = "") => `<li><button type="button" class="drawer-item" data-menu="${id}">${escapeHtml(label)}${extra}</button></li>`;
  const points = input.balance === null ? "—" : `${input.balance.toLocaleString()} 點`;
  const admin = items.filter((i) => i.id === "admin");
  const upcoming = items.filter((i) => i.kind === "upcoming");
  return `<div class="drawer-sheet" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
    <div class="drawer-head"><h2 id="drawer-title">選單</h2><button id="drawer-close" class="text-button" type="button">關閉</button></div>
    <p id="drawer-note" class="demo-notice" role="status" ${input.note ? "" : "hidden"}>${escapeHtml(input.note ?? "")}</p>
    <section class="drawer-account" aria-labelledby="drawer-account-title"><p id="drawer-account-title" class="drawer-group">個人帳戶資料</p>
      <button id="drawer-account-toggle" class="drawer-item drawer-account-name" type="button" aria-expanded="${input.accountOpen ? "true" : "false"}" aria-controls="drawer-account-details"><strong>${escapeHtml(input.displayName)}</strong><span class="drawer-chevron${input.accountOpen ? " open" : ""}" aria-hidden="true">${icon("chevron", { size: 20 })}</span><span class="yo-sr-only">帳戶明細</span></button>
      <dl id="drawer-account-details" class="session-details" ${input.accountOpen ? "" : "hidden"}><div><dt>成員編號</dt><dd>${escapeHtml(input.memberId)}</dd></div><div><dt>身分</dt><dd>${input.role === "admin" ? "管理者" : "團隊成員"}</dd></div><div><dt>展示場次</dt><dd>${escapeHtml(input.sessionId)}</dd></div></dl></section>
    <ul class="drawer-list">
      ${action("points", "已獲得和泰 Points 點數", `<b>${points}</b>`)}
      ${admin.length ? `<li class="drawer-group">管理</li>${admin.map((i) => action(i.id, i.label)).join("")}` : ""}
      ${input.tools ? `<li class="drawer-group">體驗工具</li>${input.tools.map((t) => action(t.id, t.label)).join("")}` : ""}
      <li class="drawer-group">即將推出</li>
      ${upcoming.map((i) => `<li><button type="button" class="drawer-item drawer-upcoming" data-menu="${i.id}" aria-describedby="drawer-note"><span class="drawer-upcoming-label">${escapeHtml(i.label)}</span><small>即將推出</small></button></li>`).join("")}
      <li class="drawer-group">其他</li>
      ${action("home", "回到 yoxi 首頁")}
      ${input.tools ? "" : action("logout", "登出")}
    </ul>
  </div>`;
}

/** 2026-10-12: an upcoming feature's intro page (opened from the menu); the image is passed in (views.ts imports no images). */
export function introPageView(input: { title: string; alt: string; src: string; width: number; height: number }): string {
  return `<div class="intro-panel" role="dialog" aria-modal="true" aria-labelledby="intro-title">
    <div class="intro-head"><button id="intro-back" class="intro-back" type="button" aria-label="返回">${icon("chevron", { size: 24 })}</button><h2 id="intro-title">${escapeHtml(input.title)}</h2></div>
    <div class="intro-body"><img src="${escapeHtml(input.src)}" width="${input.width}" height="${input.height}" alt="${escapeHtml(input.alt)}" decoding="async"></div>
  </div>`;
}

export const UPCOMING_NOTE = "這項功能將在後續版本開放。";

export interface MapHeroInput {
  label: string;
  offerLocate: boolean;
  ownPosition: boolean;
  /** Today's server-confirmed raw / effective steps; null while unconfirmed. */
  steps: number | null;
  effective: number | null;
  /** The map library or tiles could not load: draw the illustration instead. */
  fallback: boolean;
}

/**
 * The steps page hero: the map (Leaflet fills #map-canvas, aria-hidden). FSD-08A-3 D9/B2: the status pill and the
 * locate button share the top row; the big step count sits at the bottom (above the OSM attribution) on a 60 %
 * white veil, with the "denied" hint above it.
 */
export function mapHeroView(input: MapHeroInput): string {
  return `<section class="yo-walk-map app-map" aria-label="今日步數與地圖">
    <div id="map-canvas" class="app-map-canvas" aria-hidden="true">${input.fallback ? `<div class="yo-map-art"><i></i><i></i><i></i><i></i><i></i><b></b></div>` : ""}</div>
    <div class="yo-map-top"><div id="map-status" class="app-map-status">${mapStatusView(input)}</div><div id="map-actions">${input.offerLocate ? `<button id="map-locate" class="yo-map-move" type="button" aria-describedby="map-privacy">顯示我的位置</button>` : ""}</div><div id="map-weather"></div></div>
    <div class="app-map-bottom"><div id="map-note"></div><div class="app-map-row"><div class="yo-step-overlay">${mapStepsView(input.steps)}</div></div>
    <button id="steps-sheet-open" class="yo-map-move app-steps-open" type="button" aria-haspopup="dialog" aria-controls="steps-sheet">${icon("pencil", { size: 16 })}<span>輸入步數</span></button></div>
  </section>`;
}

/** The status pill (rewritten on every location change; the map canvas is kept). C10: the demonstration spot is `!ownPosition`. */
export function mapStatusView(input: Pick<MapHeroInput, "label" | "ownPosition">): string {
  // The pill is focusable only so focus can land on it after the locate button is replaced.
  return `<span class="yo-location-pill" role="status" tabindex="-1">${icon("pin", { size: 16 })} ${input.ownPosition ? "" : "示意位置・"}${escapeHtml(input.label)}</span>`;
}

/** Q3: only the number and "步" (no thousands separator, as in the showcase; B1 (d)). */
export function mapStepsView(steps: number | null): string {
  return `<strong id="map-steps"${steps !== null && String(steps).length >= 7 ? ' class="long"' : ""}>${steps === null ? "—" : String(steps)}</strong><span>步</span>`;
}

/** 2026-10-06 (3): the location privacy note, one bullet per point (FSD-08C: its own card, see locationPrivacyCardView). */
export const LOCATION_PRIVACY_ITEMS = [
  "位置只在您的手機上使用，不存檔、不給隊友看。",
  "地圖與天氣會用到約 1 公里範圍的位置（OpenStreetMap、Open-Meteo）。",
];

// ----- FSD-08B: weather on the map -----

const WEATHER_ICON: Record<WeatherKind, IconName> = { sunny: "sunny", cloudy: "cloudy", rainy: "rainy", storm: "storm" };
const deg = (value: number) => `${Math.round(value)}°C`;
const hhmm = (time: string) => escapeHtml(time.slice(11, 16));

/** The map button (in #map-weather, written only by the weather controller); empty without a usable forecast. */
export function weatherButtonView(f: Forecast | null): string {
  const kind = f ? weatherKind(f.code) : null;
  const text = f ? weatherText(f.code) : null;
  if (!f || !kind || !text) return "";
  return `<button id="weather-open" class="yo-map-move app-weather-button" type="button" aria-haspopup="dialog" aria-label="目前天氣：${text} ${deg(f.temperature)}，開啟天氣詳情">${icon(WEATHER_ICON[kind], { size: 24 })}<span aria-hidden="true">${deg(f.temperature)}</span></button>`;
}

/** The weather dialog: now, the next six hours, today and tomorrow, one walking tip, source and update time. */
export function weatherDialogView(f: Forecast, updatedAt: string): string {
  const kind = weatherKind(f.code);
  const small = (code: number, label: string) => { const k = weatherKind(code); return k ? icon(WEATHER_ICON[k], { size: 24, label }) : ""; };
  const hours = f.hours.length ? `<section aria-labelledby="weather-hours-title"><h3 id="weather-hours-title">接下來 6 小時</h3><ol class="weather-hours" tabindex="0" aria-label="接下來 6 小時的天氣">${f.hours.map((h) =>
    `<li><span>${hhmm(h.time)}</span>${small(h.code, weatherText(h.code) ?? "")}<b>${deg(h.temperature)}</b><small>降雨 ${Math.round(h.precipitation)}%</small></li>`).join("")}</ol></section>` : "";
  const dayLabel = ["今天", "明天"];
  const days = `<section aria-labelledby="weather-days-title"><h3 id="weather-days-title">今天／明天</h3><ul class="weather-days">${f.days.map((d, i) =>
    `<li><span>${dayLabel[i]}</span>${small(d.code, weatherText(d.code) ?? "")}<span>${escapeHtml(weatherText(d.code) ?? "")}</span><b>${deg(d.min)}–${deg(d.max)}</b><small>降雨 ${Math.round(d.precipitation)}%</small></li>`).join("")}</ul></section>`;
  return `<div class="notice-sheet weather-sheet" role="dialog" aria-modal="true" aria-labelledby="weather-title">
    <div class="drawer-head"><h2 id="weather-title">目前天氣</h2><button id="weather-close" class="text-button" type="button">關閉</button></div>
    <div class="weather-now">${kind ? icon(WEATHER_ICON[kind], { size: 28 }) : ""}<div><p class="weather-now-main"><b>${deg(f.temperature)}</b><span>${escapeHtml(weatherText(f.code) ?? "")}</span></p>
      <p class="weather-now-meta">體感 ${deg(f.apparent)}・降雨機率 ${Math.round(f.precipitation)}%・風速 ${Math.round(f.wind)} km/h</p></div></div>
    <p class="weather-tip" role="note">${escapeHtml(walkTip(f))}</p>
    ${hours}
    ${days}
    <p class="weather-source">天氣資料：<a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo.com</a>（<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>）・更新 ${escapeHtml(updatedAt)}</p>
    <p class="weather-source">天氣為實際時間的資料，與展示用的情境時間無關。</p>
  </div>`;
}

export function inviteCardView(card: InviteCard): string {
  switch (card.kind) {
    case "syncing": return "<p>隊伍狀態同步中…</p>";
    case "noTeam": return `<p>${card.locked ? "您本週已退出正式隊伍，下週一才能重新組隊或加入。" : "先建立一支招募隊伍，就能取得專屬邀請碼。"}</p><button class="yo-primary yo-full" type="button" data-goto="team">前往團隊</button>`;
    case "archived": return "<p>隊伍已封存，無法再邀請。</p>";
    case "full": return `<div class="yo-code" id="invite-card-code">${escapeHtml(card.code)}</div><p>隊伍已滿 5 人，無法再邀請。</p>`;
    case "paused": return `<div class="yo-code" id="invite-card-code">${escapeHtml(card.code)}</div><p>隊伍暫停中：再邀 1 人即可恢復挑戰。</p><button id="invite-card-copy" class="yo-secondary yo-full" type="button">複製邀請碼</button>`;
    case "share": return `<div class="yo-code" id="invite-card-code">${escapeHtml(card.code)}</div><button id="invite-card-copy" class="yo-secondary yo-full" type="button">複製邀請碼</button><p class="yo-muted">目前 ${card.memberCount}／5 人<br>隊友在「團隊功能」輸入邀請碼即可加入。</p>`;
  }
}

// ----- FSD-08A-2: bell notices and the yoxi home mock -----

/** The bell's content (rewritten on every notice change); `unread` undefined = not confirmed (no badge, M4). */
export function bellView(unread: number | undefined): string {
  const label = unread === undefined ? "通知（同步中）" : unread > 0 ? `通知，${unread} 則未讀` : "通知，沒有未讀";
  return `<button id="bell-button" class="app-icon-button app-bell" type="button" aria-label="${label}" aria-expanded="false" aria-controls="notices">${icon("bell", { size: 24 })}${unread ? `<span class="app-bell-badge" aria-hidden="true">${unread}</span>` : ""}</button>`;
}

/** The notice panel; only confirmed lists are shown, otherwise "syncing" (never "no notices" on unconfirmed data). */
/** `list` holds only the notices not cleared today; 2026-10-06: one font for all, "全部已讀" clears them. */
export function noticesView(list: NoticeList, isRead: (type: NoticeType) => boolean, today: string | null = null): string {
  const body = !list.confirmed ? `<p class="team-progress-note" role="status">部分資料同步中，通知稍後更新。</p>`
    : list.items.length === 0 ? `<p class="team-progress-note">沒有新通知。</p>`
    : `<ul class="notice-list">${[...list.items].sort((a, b) => Number(isRead(a.type)) - Number(isRead(b.type))).map((n) =>
      // UX-1010 F13: the whole notice is a button (an arrow says so), with when it happened under the text.
      `<li><button type="button" class="notice-item" data-notice="${n.type}"><span class="notice-text"><span>${escapeHtml(n.text)}</span><small>${escapeHtml(noticeDayLabel(n.day, today ?? n.day))}</small></span>${icon("chevron", { size: 20 })}</button></li>`).join("")}</ul>`;
  // F13: with a single notice there is nothing to clear all at once.
  const clear = list.confirmed && list.items.length > 1 ? `<button id="notices-clear" class="text-button" type="button">全部已讀</button>` : "";
  return `<div class="notice-sheet" role="dialog" aria-modal="true" aria-labelledby="notices-title">
    <div class="drawer-head"><h2 id="notices-title">Yoika提醒您</h2><div class="notices-actions">${clear}<button id="notices-close" class="text-button" type="button">關閉</button></div></div>
    ${body}
  </div>`;
}

/**
 * The yoxi home mock (PRD §9 item 2): the screenshot (already cropped and with the greeting blanked in the file,
 * Security M1), the greeting rewritten,
 * and the yoi entry under yoxi's own menu button. Image URLs are passed in (views.ts imports no images, M8).
 */
export function homeView(input: { screenshotUrl: string }): string {
  return `<main class="home-mock" aria-label="yoxi 首頁示意">
    <div class="home-frame">
      <img class="home-shot" src="${escapeHtml(input.screenshotUrl)}" width="1206" height="2478" alt="yoxi App 首頁示意" decoding="async" fetchpriority="high">
      <p class="home-greeting">嗨，今天要去哪？</p>
      <span class="home-demo-tag">示意畫面</span>
      <div class="home-squid-pos"><div class="home-squid-float">
        <button id="home-enter" class="home-squid" type="button" aria-label="進入 yoi 遊移遊戲（新功能）"><span class="home-squid-art" aria-hidden="true"></span></button>
        <span class="home-new" aria-hidden="true">NEW</span>
      </div></div>
      <p id="home-hint" class="home-hint" role="status" hidden>這是 yoxi 首頁示意，點左上角的 yoi 進入遊移遊戲</p>
    </div>
  </main>`;
}
