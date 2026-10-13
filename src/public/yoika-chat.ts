/**
 * FSD-PA-10: the 和 Yoika 聊聊 sheet (public test build only). Each question carries a read-only snapshot of the
 * visitor's own world; Gemini only words the answer. When Gemini is slow or busy, the suggested questions are
 * answered from the same snapshot by the system, labelled as such (2026-10-14). Nothing here writes to the world.
 */
import { readDoc } from "../local/store.ts";
import { escapeHtml } from "../ui/html.ts";
import { icon } from "../ui/icons.ts";
import { GUIDE_ROWS, PERFECT_WEEK_RULE } from "../ui/views.ts";
import { previousTaskDate } from "../daily/daily-state.ts";
import { TEAM_WEEK_TARGET } from "../team/contrib-state.ts";
import { WEATHER_KIND_LABEL, weatherKind } from "../weather/weather-state.ts";
import { checkInput, countSent, dayStatus, fallbackAnswer, parseReply, sendBlock, sentToday, systemInstruction, walkOrRide, withSnapshot, YOIKA_BUSY, YOIKA_FALLBACK_LEAD, YOIKA_LIMITS, YOIKA_NOT_READY, YOIKA_SUGGESTIONS, type YoikaSnapshot } from "./yoika-core.ts";
import { teamWeekTotal, visitorTeam } from "./sim.ts";
import { currentContext, VISITOR } from "./world.ts";
import { simulatedForecast } from "./weather-sim.ts";
import type { YoikaChat, YoikaTools } from "./yoika-gemini.ts";
import type { YoikaConfig } from "./yoika-config.ts";

const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/** The rules Yoika may explain: the play guide's rows (the same text visitors read). */
export function rulesText(): string {
  return GUIDE_ROWS.map((r) => `・${r.title}（${strip(r.value)}）：${r.sub}。${r.bullets.join("；")}`).join("\n") + `\n・七日全勤：${PERFECT_WEEK_RULE}`;
}

function day(which: "today" | "yesterday"): Record<string, unknown> {
  const context = currentContext();
  const today = context.scenarioNow.slice(0, 10);
  const taskDate = which === "yesterday" ? previousTaskDate(today) : today;
  const d = readDoc(`dailySteps/${context.sessionId}/members/${VISITOR.memberId}/days/${taskDate}`) as { rawSteps?: number; effectiveSteps?: number; rideCompletedAt?: string | null; claimed?: number } | undefined;
  return dayStatus({ rawSteps: d?.rawSteps ?? 0, effectiveSteps: d?.effectiveSteps ?? 0, rideDone: Boolean(d?.rideCompletedAt), claimed: d?.claimed ?? 0, taskDate });
}

function team(): Record<string, unknown> {
  const context = currentContext();
  const t = visitorTeam(context);
  if (!t) return { hasTeam: false, note: "還沒有隊伍，可以到「團隊」頁組建隊伍或輸入邀請碼加入。" };
  return { hasTeam: true, members: t.memberIds.length, weekTotalSteps: teamWeekTotal(context), weekTarget: TEAM_WEEK_TARGET };
}

function weather(): Record<string, unknown> {
  const f = simulatedForecast(currentContext().scenarioNow) as { current: { temperature_2m: number; precipitation_probability: number; weather_code: number }; hourly: { precipitation_probability: number[] } };
  const kind = weatherKind(f.current.weather_code);
  return {
    simulated: true, now: kind ? WEATHER_KIND_LABEL[kind] : "不明", temperatureC: f.current.temperature_2m,
    rainChancePercent: f.current.precipitation_probability, nextHoursRainPercent: f.hourly.precipitation_probability,
  };
}

/** Everything Yoika may quote, read fresh for each question. */
function snapshot(): YoikaSnapshot {
  return { now: currentContext().scenarioNow, today: day("today"), yesterday: day("yesterday"), team: team(), weather: weather() };
}

function tools(): YoikaTools {
  return { compare_walk_or_ride: (args) => walkOrRide(Number(args.distanceKm)) };
}

/** `system`: worded by the system from the snapshot (Gemini busy), shown differently from AI replies. */
interface Line { who: "me" | "yoika"; text: string; system?: boolean }

function sheetView(lines: Line[], state: { busy: boolean; slow: boolean; hint: string; ready: boolean }): string {
  const bubbles = lines.map((l) => `<li class="yoika-msg yoika-msg--${l.who}${l.system ? " yoika-msg--system" : ""}"><span class="yo-sr-only">${l.who === "me" ? "您" : l.system ? "系統資料" : "Yoika"}：</span>${l.system ? `<small class="yoika-system-tag">系統資料（非 AI 生成）</small>` : ""}${escapeHtml(l.text)}</li>`).join("")
    + (state.busy ? `<li class="yoika-msg yoika-msg--yoika yoika-typing">${state.slow ? "Gemini 比較忙，請再等一下…" : "Yoika 正在想…"}</li>` : "");
  const chips = YOIKA_SUGGESTIONS.map((q) => `<button type="button" class="yoika-chip" data-yoika-ask="${escapeHtml(q)}"${state.busy || !state.ready ? " disabled" : ""}>${escapeHtml(q)}</button>`).join("");
  return `<div class="guide-sheet yoika-sheet" role="dialog" aria-modal="true" aria-labelledby="yoika-title">
    <button id="yoika-close" class="guide-close" type="button" aria-label="關閉">${icon("close", { size: 24 })}</button>
    <h2 id="yoika-title"><span class="guide-squid guide-squid--small" aria-hidden="true"></span>和 Yoika 聊聊</h2>
    <p class="guide-lead">問我今天的步數、天氣，或走路還是搭 yoxi。回答由 Google Gemini 產生，資料都是模擬的。</p>
    <ul class="yoika-log" aria-live="polite">${bubbles}</ul>
    <div class="yoika-chips">${chips}</div>
    <form id="yoika-form" class="yoika-form"><label for="yoika-input" class="yo-sr-only">輸入問題</label>
      <input id="yoika-input" maxlength="${YOIKA_LIMITS.inputChars}" autocomplete="off" placeholder="${state.ready ? "輸入問題（最多 100 字）" : "準備中"}"${state.busy || !state.ready ? " disabled" : ""}>
      <button class="yo-primary" type="submit"${state.busy || !state.ready ? " disabled" : ""}>送出</button></form>
    <p class="yo-status" role="status">${escapeHtml(state.hint)}</p>
  </div>`;
}

/** Opens the sheet. `config` null: not set up yet, the sheet says so and nothing is sent. */
export function openYoika(config: YoikaConfig | null, onClose: () => void): void {
  if (document.querySelector("#yoika")) return;
  const root = document.createElement("div");
  root.id = "yoika";
  root.className = "notices guide-overlay guide-shown";
  document.body.append(root);
  const shell = document.querySelector<HTMLElement>(".app-shell");
  shell?.setAttribute("inert", "");

  const lines: Line[] = [{ who: "yoika", text: config ? "嗨，我是 Yoika！想知道今天還差多少步、天氣如何，或走路還是搭 yoxi，都可以問我。" : YOIKA_NOT_READY }];
  let busy = false;
  let slow = false;
  let hint = "";
  let sentHere = 0;
  let lastSentAt: number | null = null;
  let chat: Promise<YoikaChat> | null = null;

  const render = (focusInput = false) => {
    root.innerHTML = sheetView(lines, { busy, slow, hint, ready: config !== null });
    const log = root.querySelector<HTMLElement>(".yoika-log");
    if (log) log.scrollTop = log.scrollHeight;
    if (focusInput) root.querySelector<HTMLInputElement>("#yoika-input")?.focus();
  };

  const close = () => {
    root.remove();
    shell?.removeAttribute("inert");
    document.removeEventListener("keydown", onKey, true);
    onClose();
  };
  const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.isComposing) { event.preventDefault(); close(); } };

  async function ask(raw: string) {
    if (!config || busy) return;
    const checked = checkInput(raw);
    if (!checked.ok) { hint = checked.hint; render(true); return; }
    const now = Date.now();
    const blocked = sendBlock({ inConversation: sentHere, today: sentToday(localStorage, now), lastSentAt, now });
    if (blocked) { hint = blocked; render(true); return; }
    sentHere += 1;
    lastSentAt = now;
    countSent(localStorage, now);
    lines.push({ who: "me", text: checked.text });
    busy = true;
    slow = false;
    hint = "";
    render();
    const slowTimer = window.setTimeout(() => { slow = true; if (busy && root.isConnected) render(); }, 8000);
    const data = snapshot();
    try {
      const cfg = config;
      chat ??= import("./yoika-gemini.ts").then((m) => m.startYoika(cfg, systemInstruction(rulesText()), tools()));
      const reply = parseReply(await (await chat).send(withSnapshot(checked.text, data)));
      lines.push({ who: "yoika", text: reply.text });
    } catch {
      // Not resent automatically (the free tier may be busy or used up). The suggested questions still get an answer,
      // worded by the system from the same data and labelled as such (product owner 2026-10-14, option B).
      const fallback = fallbackAnswer(checked.text, data);
      lines.push(fallback ? { who: "yoika", text: `${YOIKA_FALLBACK_LEAD}${fallback}`, system: true } : { who: "yoika", text: YOIKA_BUSY });
    } finally {
      window.clearTimeout(slowTimer);
      busy = false;
      slow = false;
      if (root.isConnected) render(true);
    }
  }

  root.addEventListener("click", (event) => {
    const el = event.target as HTMLElement;
    if (el === root || el.closest("#yoika-close")) { close(); return; }
    const q = el.closest<HTMLElement>("[data-yoika-ask]")?.dataset.yoikaAsk;
    if (q) void ask(q);
  });
  root.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = root.querySelector<HTMLInputElement>("#yoika-input");
    if (input) void ask(input.value);
  });
  document.addEventListener("keydown", onKey, true);
  render(true);
}
