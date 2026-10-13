/** FSD-08A-1: pure decisions of the app shell (no DOM, no services), shared by the shell and the preview. */

export type ShellPage = "steps" | "team" | "rewards" | "invite";
export const SHELL_PAGES: readonly ShellPage[] = ["steps", "team", "rewards", "invite"];
export const PAGE_LABEL: Record<ShellPage, string> = { steps: "步數", team: "團隊", rewards: "獎勵", invite: "邀請" };

/** "#team" → "team"; anything else falls back to the steps page. */
export function parsePage(hash: string): ShellPage {
  const id = hash.replace(/^#/, "");
  return (SHELL_PAGES as readonly string[]).includes(id) ? (id as ShellPage) : "steps";
}

/** Upcoming features shown greyed out in the menu (Q1; the product owner adjusts this list). */
export const UPCOMING_FEATURES = ["Yoika 智慧感知 2.0", "人生願望清單", "外籍人士社交平台"] as const;
/** 2026-10-12: each upcoming feature opens its own intro page (a designed image); the text says what the image shows. */
export const UPCOMING_INTRO: { title: string; alt: string; width: number; height: number }[] = [
  { title: "Yoika 智慧感知 2.0", width: 981, height: 4716,
    alt: "即將推出：Yoika 走路小幫手。用聊天問附近有什麼好逛，只照您勾選的喜好推薦，每個地方都能走過去，或直接叫 yoxi。示意畫面：與 Yoika 對話，以及偏好設定。" },
  { title: "人生願望清單", width: 981, height: 2790,
    alt: "即將推出：人生願望清單。把家人想去的地方存成心願，Yoika 依天氣和花季幫您挑日子，一鍵幫家人預約接送。示意畫面：媽媽想去陽明山看海芋。照片：lienyuan lee, CC BY 3.0, via Wikimedia Commons。" },
  { title: "外籍人士社交平台", width: 981, height: 4641,
    alt: "即將推出：外籍人士社交平台，在台外籍朋友的社群地圖。同鄉推薦的店都標在地圖上，每段文字中文、母語對照，走過去拿步數，或一鍵叫 yoxi。示意畫面：同鄉地圖與店家，以及推薦一家店。" },
];

export interface MenuItem { id: string; label: string; kind: "action" | "upcoming" }

/** The drawer's actions; the admin entries only for role admin (an entry point, not a security boundary). */
export function menuItems(role: string): MenuItem[] {
  const items: MenuItem[] = [{ id: "points", label: "已獲得和泰 Points 點數", kind: "action" }];
  // 2026-10-06: one admin entry; advancing, resetting and 自動七天 all live on that screen.
  if (role === "admin") items.push({ id: "admin", label: "共用情境管理", kind: "action" });
  items.push(...UPCOMING_FEATURES.map((label, i) => ({ id: `upcoming-${i}`, label, kind: "upcoming" as const })));
  items.push({ id: "home", label: "回到 yoxi 首頁", kind: "action" }, { id: "logout", label: "登出", kind: "action" });
  return items;
}

// ----- Location (M7): when to watch and what the pill says -----

export type LocationStatus = "idle" | "locating" | "located" | "stale" | "denied" | "unavailable" | "unsupported";

export interface LocationState {
  status: LocationStatus;
  /** Rounded metres of the last fix, when one exists. */
  accuracy: number | null;
  /** True once a position was shown (a later timeout keeps it and only says "may be outdated"). */
  hasFix: boolean;
}

export const INITIAL_LOCATION: LocationState = { status: "idle", accuracy: null, hasFix: false };

export type LocationEvent =
  | { type: "request" }
  | { type: "fix"; accuracy: number }
  | { type: "error"; code: "denied" | "timeout" | "unavailable" }
  | { type: "unsupported" };

export function nextLocation(state: LocationState, event: LocationEvent): LocationState {
  switch (event.type) {
    case "request": return state.status === "denied" || state.status === "unsupported" ? state : { ...state, status: state.hasFix ? state.status : "locating" };
    case "fix": return { status: "located", accuracy: Math.max(1, Math.round(event.accuracy)), hasFix: true };
    case "unsupported": return { ...state, status: "unsupported" };
    case "error":
      if (event.code === "denied") return { status: "denied", accuracy: null, hasFix: false };
      return state.hasFix ? { ...state, status: "stale" } : { ...state, status: "unavailable" };
  }
}

/** The pill text (product owner, 2026-10-04); positions are never shown as an address. */
export function locationLabel(state: LocationState): string {
  switch (state.status) {
    case "idle": return "尚未開啟定位";
    case "locating": return "定位中…";
    case "located": return `已定位・精度約 ${state.accuracy} 公尺`;
    case "stale": return "位置可能過時";
    case "denied": return "未允許定位";
    case "unavailable": return "暫時無法取得位置";
    case "unsupported": return "此裝置無法定位";
  }
}

/** Whether the map shows the user's own position (otherwise the fixed demonstration spot). */
export const showsOwnPosition = (state: LocationState) => state.hasFix && (state.status === "located" || state.status === "stale");

/** Whether the "show my location" button is offered. */
export const offersLocate = (state: LocationState) => state.status === "idle" || state.status === "unavailable";

/** M7: watch only while all of these hold; any change to false clears the watch. */
export function shouldWatch(input: { stepsPageShown: boolean; documentVisible: boolean; stopped: boolean; stale: boolean; requested: boolean; status: LocationStatus }): boolean {
  return input.requested && input.stepsPageShown && input.documentVisible && !input.stopped && !input.stale
    && input.status !== "denied" && input.status !== "unsupported";
}

/** The demonstration spot when the user has not shared a position: 緯育 TibaMe 附設台北職訓中心 (南京東路三段 219 號). */
export const DEFAULT_CENTER: readonly [number, number] = [25.0517, 121.5428];

// ----- Invite card on the invite page (Architect suggestion 5) -----

export interface TeamSummary {
  confirmed: boolean;
  hasTeam: boolean;
  inviteCode: string | null;
  status: string | null;
  memberCount: number;
  weekLocked: boolean;
}

export type InviteCard =
  | { kind: "syncing" } | { kind: "noTeam"; locked: boolean } | { kind: "share"; code: string; memberCount: number }
  | { kind: "full"; code: string } | { kind: "paused"; code: string } | { kind: "archived" };

export function inviteCard(t: TeamSummary): InviteCard {
  if (!t.confirmed) return { kind: "syncing" };
  if (!t.hasTeam || !t.inviteCode) return { kind: "noTeam", locked: t.weekLocked };
  if (t.status === "archived") return { kind: "archived" };
  if (t.memberCount >= 5) return { kind: "full", code: t.inviteCode };
  if (t.status === "paused") return { kind: "paused", code: t.inviteCode };
  return { kind: "share", code: t.inviteCode, memberCount: t.memberCount };
}

// ----- FSD-08A-3 B1: the map's big step count (count-up only between confirmed values) -----

export type StepsDisplay = { kind: "dash" } | { kind: "show"; value: number } | { kind: "animate"; from: number; to: number };

/**
 * `previous` is the last confirmed value on screen (null = "—" or nothing yet). Only a confirmed increase animates,
 * starting from the previous confirmed value; the first value (or "—" → number) is shown directly; null shows "—".
 */
export function stepsDisplay(previous: number | null, next: number | null): StepsDisplay {
  if (next === null) return { kind: "dash" };
  if (previous === null || next <= previous) return { kind: "show", value: next };
  return { kind: "animate", from: previous, to: next };
}

// ----- FSD-08A-4: the steps sheet -----

export type StepsOutcome = "confirmed" | "unconfirmed" | "failed";
/** B3: a "save steps" command started, or ended with an outcome and the panel's own status and error texts. */
export type StepsResult = { phase: "saving" } | { phase: "done"; outcome: StepsOutcome; status: string; error: string | null };

/** Only a server-confirmed save (including "no change") closes the sheet; unconfirmed or failed keeps it open. */
export const closesSheet = (result: StepsResult) => result.phase === "done" && result.outcome === "confirmed";

/** C3: the sheet's message — a kept failure first, then a subscription error, then "syncing", else nothing. */
export function sheetMessage(input: { failure: string | null; subscriptionError: string | null; syncing: boolean }): string {
  if (input.failure) return input.failure;
  if (input.subscriptionError) return input.subscriptionError;
  return input.syncing ? "同步中，暫時無法儲存。" : "";
}
