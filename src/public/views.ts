/** FSD-PA: markup of the public test build's own cards and dialogs (pure strings, existing classes and tokens). */
import { escapeHtml } from "../ui/html.ts";
import { icon } from "../ui/icons.ts";
import { NEWCOMER, TEAMMATES } from "./world.ts";

/** The menu keeps what belongs to no page; the clock and the shortcuts sit in their own tabs (product owner 2026-10-12). */
/** 2026-10-12: the feedback form (a Google Form the product owner runs; visitors fill it in themselves). */
export const FEEDBACK_URL = "https://forms.gle/6Pgw6uG15NGRVqsSA";

export const PUBLIC_TOOLS = [
  { id: "tool-rename", label: "修改我的名稱" },
  { id: "tool-about", label: "關於公開測試版" },
  { id: "tool-restart", label: "重新開始體驗" },
  { id: "tool-feedback", label: "給我們回饋（另開 Google 表單）" },
];

/** 模擬隊友 card on the team page. */
export function teammatesCardView(input: { hasTeam: boolean; joined: string[]; busy: boolean; message: string }): string {
  const full = input.joined.length >= TEAMMATES.length;
  const lead = !input.hasTeam ? "先在上方「組建隊伍」，就能邀請模擬隊友加入。"
    : full ? "四位模擬隊友都在隊上了，他們每天會自己走路。"
    : "邀請模擬隊友一起走，他們每天會自己走路，步數會算進團隊。";
  const who = TEAMMATES.map((t) => `${escapeHtml(t.name)}${input.joined.includes(t.name) ? "（已加入）" : ""}`).join("、");
  return `<section class="yo-panel pub-card" aria-labelledby="pub-team-title"><h2 id="pub-team-title">模擬隊友</h2>
    <p>${lead}</p><p class="yo-muted">${who}</p>
    <button id="pub-invite" class="yo-secondary yo-full" type="button" ${!input.hasTeam || full || input.busy ? "disabled" : ""}>邀請一位模擬隊友</button>
    <p class="yo-status" role="status">${escapeHtml(input.message)}</p></section>`;
}

/** FSD-PA: a shortcut card inside the tab it belongs to (清單 2026-10-12: no need to open the menu). */
export function toolCardView(id: string, title: string, text: string, buttons: { action: string; label: string; primary?: boolean; disabled?: boolean }[]): string {
  return `<section class="yo-panel pub-card pub-tool" aria-labelledby="${id}-title"><p class="pub-tag">體驗工具</p><h2 id="${id}-title">${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p>`
    + buttons.map((b) => `<button type="button" class="${b.primary ? "yo-primary" : "yo-secondary"} yo-full" data-pub-action="${escapeHtml(b.action)}"${b.disabled ? " disabled" : ""}>${escapeHtml(b.label)}</button>`).join("")
    + `<p class="yo-status" role="status" data-pub-status></p></section>`;
}

/** 模擬新朋友 card on the 新戶 tab. */
export function newcomerCardView(input: { state: "none" | "bound" | "rode"; busy: boolean; message: string; michaelCode: string }): string {
  const step = input.state === "none" ? `<button id="pub-bind" class="yo-secondary yo-full" type="button" ${input.busy ? "disabled" : ""}>模擬新朋友填我的推薦碼</button>`
    : input.state === "bound" ? `<button id="pub-ride" class="yo-secondary yo-full" type="button" ${input.busy ? "disabled" : ""}>模擬新朋友第一次搭 yoxi</button>`
    : `<p>${escapeHtml(NEWCOMER.name)}已完成首趟搭乘，推薦獎勵已發放。</p>`;
  return `<section class="yo-panel pub-card" aria-labelledby="pub-new-title"><h2 id="pub-new-title">模擬新朋友</h2>
    <p>沒有朋友在身邊也能試：讓一位模擬的新朋友填您的推薦碼，再模擬他第一次搭乘。</p>${step}
    <p class="yo-muted">想體驗當新戶？上方已幫您填好 Michael 的推薦碼 <b>${escapeHtml(input.michaelCode)}</b>，按「綁定推薦碼」就完成。</p>
    <p class="yo-status" role="status">${escapeHtml(input.message)}</p></section>`;
}

/** The busy screen while the clock moves (the page reloads afterwards). */
export function clockBusyView(text: string): string {
  return `<section class="login-card" role="status" aria-live="polite"><p class="eyebrow">公開測試版</p><h1 id="pub-busy-title">正在快轉…</h1><p class="intro">${escapeHtml(text)}</p></section>`;
}

/** A small dialog: rename, restart or about. */
export function publicDialogView(kind: "rename" | "restart" | "about", name = ""): string {
  if (kind === "rename") {
    return `<div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="pub-dialog-title"><h2 id="pub-dialog-title">修改我的名稱</h2>
      <label class="rename-label" for="pub-name">名稱（最多 20 個字）</label><input id="pub-name" class="rename-input" type="text" maxlength="40" autocomplete="off" value="${escapeHtml(name)}">
      <p id="pub-dialog-status" class="dialog-status" role="status"></p>
      <div class="dialog-actions"><button id="pub-dialog-dismiss" class="secondary-button" type="button">取消</button><button id="pub-dialog-confirm" class="primary-button" type="button">儲存</button></div></div>`;
  }
  if (kind === "restart") {
    return `<div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="pub-dialog-title"><h2 id="pub-dialog-title">重新開始體驗？</h2>
      <p>步數、點數、隊伍和獎勵都會清除，時間回到今天 09:00。</p>
      <div class="dialog-actions"><button id="pub-dialog-dismiss" class="secondary-button" type="button">先不要</button><button id="pub-dialog-confirm" class="primary-button" type="button">重新開始</button></div></div>`;
  }
  return `<div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="pub-dialog-title"><h2 id="pub-dialog-title">關於公開測試版</h2>
    ${ABOUT_ITEMS.map((t) => `<p>${t}</p>`).join("")}
    <div class="dialog-actions"><button id="pub-dialog-confirm" class="primary-button" type="button">知道了</button></div></div>`;
}

/** FSD-PA-08: what a visitor must know. */
export const ABOUT_ITEMS = [
  "這是 yoi 遊移遊戲的公開測試版，所有步數、點數、乘車券與寶箱都是模擬資料，不是正式 yoxi 服務或和泰 Points。",
  "體驗資料只存在您這台裝置的瀏覽器，3 天沒有使用會自動清除；只有使用「和 Yoika 聊聊」時，會送出下方說明的內容。",
  "時間只會在您按「快轉」時前進；模擬隊友與模擬新朋友只存在您的體驗裡。",
  "「給我們回饋」會另開一份 Google 表單，由您自行填寫送出；App 不會自動帶入任何資料。",
  "「和 Yoika 聊聊」的回答由 Google Gemini 產生：只會送出您輸入的問題，以及回答需要的模擬步數、點數、天氣與規則，不含位置與個人身分；請勿輸入個人資料。",
  "僅供展示與體驗，不得作為商業用途。地圖資料來自 OpenStreetMap contributors；天氣為模擬資料。",
];

/** FSD-PA-07: the 功能體驗清單 as a bottom sheet (the guide's sheet styles). */
export function checklistView(items: { id: string; label: string; hint: string; done: boolean; optional?: boolean }[]): string {
  const count = items.filter((i) => i.done).length;
  // The location item may be skipped: everything else done is 全部體驗完成.
  const all = items.every((i) => i.done || i.optional);
  const rows = items.map((i) => `<li class="pub-check${i.done ? " done" : ""}"><span class="pub-check-mark" aria-hidden="true">${i.done ? icon("check", { size: 20, mono: true }) : ""}</span>`
    + `<span class="pub-check-text"><span>${escapeHtml(i.label)}</span><small>${i.done ? "完成" : escapeHtml(i.hint)}</small></span>`
    + `${i.done ? "" : `<button type="button" class="ride-go" data-check-go="${escapeHtml(i.id)}">去試試</button>`}</li>`).join("");
  return `<div class="guide-sheet" role="dialog" aria-modal="true" aria-labelledby="pub-check-title">
    <button id="pub-check-close" class="guide-close" type="button" aria-label="關閉">${icon("close", { size: 24 })}</button>
    <h2 id="pub-check-title">功能體驗清單</h2>
    <p class="guide-lead">${all ? "全部體驗完成！" : `已完成 ${count}／${items.length} 項`}</p>
    <ul class="pub-checks">${rows}</ul>
    ${all ? `<a class="yo-primary yo-full pub-feedback" href="${FEEDBACK_URL}" target="_blank" rel="noopener noreferrer">填寫回饋（約 1 分鐘）</a><button type="button" class="yo-secondary yo-full" data-check-go="restart">重新開始體驗</button>` : ""}
  </div>`;
}
