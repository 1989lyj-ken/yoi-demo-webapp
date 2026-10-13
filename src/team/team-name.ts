/**
 * FSD-03E: team names. The browser check is stricter than or equal to the Rules (B2): it trims every
 * `[\s\p{Z}]` at both ends, refuses any control character and counts UTF-16 units, which is what the
 * Rules' string.size() counts (B3, pinned on the Firestore Emulator: an emoji counts 2).
 */
export const TEAM_NAME_MAX = 12;

/** Shown under the input (FSD-03E 隊名規則與輸入提示; the first line follows the B3 result). */
export const TEAM_NAME_HINTS = [
  "1～12 個字（表情符號算 2 個字），中文、英文、數字、符號或表情符號都可以",
  "前後的空白會自動去掉，不能只有空白",
  "只有隊長可以取名或改名，隨時都能改",
  "隊名會顯示給所有隊員看，請取個友善的名字",
];

const EDGE_SPACE = /^[\s\p{Z}]+|[\s\p{Z}]+$/gu;
const CONTROL = /\p{Cc}/u;

export const normalizeTeamName = (raw: string) => raw.replace(EDGE_SPACE, "");

/** The counter's number: UTF-16 units of the trimmed name (the Rules' unit). */
export const teamNameUnits = (raw: string) => normalizeTeamName(raw).length;

export type TeamNameCheck = { ok: true; name: string } | { ok: false; reason: "empty" | "long" | "control"; message: string };

export function checkTeamName(raw: string): TeamNameCheck {
  const name = normalizeTeamName(raw);
  if (name.length === 0) return { ok: false, reason: "empty", message: "請輸入隊名" };
  if (CONTROL.test(name)) return { ok: false, reason: "control", message: "隊名不能換行" };
  if (name.length > TEAM_NAME_MAX) return { ok: false, reason: "long", message: `隊名最多 ${TEAM_NAME_MAX} 個字` };
  return { ok: true, name };
}

export class TeamNameFormatError extends Error {}

/**
 * FSD-03E (QA S7): the banner title. The last confirmed name is used only for the same team (another team
 * never inherits it); otherwise the C5 fallback. A failed or unconfirmed read keeps the last confirmed name.
 */
export function pickTeamTitle(confirmed: { teamId: string; name: string | null } | null, teamId: string, fallback: string): string {
  return confirmed && confirmed.teamId === teamId && confirmed.name ? confirmed.name : fallback;
}

const NAME_KEYS = ["sessionId", "teamId", "name", "updatedBy", "updatedAt", "clockVersion"];

/** A confirmed teamNames document; anything else is a format error (never shown as data; the panel keeps the last confirmed name). */
export function parseTeamName(value: unknown, sessionId: string, teamId: string): string {
  const bad = () => new TeamNameFormatError("隊名資料格式不符。");
  if (!value || typeof value !== "object") throw bad();
  const d = value as Record<string, unknown>;
  const keys = Object.keys(d);
  if (keys.length !== NAME_KEYS.length || !NAME_KEYS.every((k) => keys.includes(k)) || d.sessionId !== sessionId || d.teamId !== teamId
    || typeof d.name !== "string" || typeof d.updatedBy !== "string" || !Number.isSafeInteger(d.clockVersion)) throw bad();
  const check = checkTeamName(d.name);
  if (!check.ok || check.name !== d.name) throw bad();
  return d.name;
}
