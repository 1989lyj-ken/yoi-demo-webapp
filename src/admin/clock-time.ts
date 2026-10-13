/**
 * Asia/Taipei wall-clock helpers for the admin clock (FSD-02B). Taipei has no DST, so a wall time
 * is held as a UTC Date carrying the same Y-M-D h:m:s fields. Self-contained so it can be unit tested.
 */
export const SCENARIO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)\+08:00$/;

const pad = (value: number) => String(value).padStart(2, "0");

function toWall(scenarioNow: string): Date {
  const match = SCENARIO_PATTERN.exec(scenarioNow);
  if (!match) throw new Error("情境時間格式須為 YYYY-MM-DDTHH:MM:SS+08:00。");
  const [y, m, d, h, mi, s] = match.slice(1).map(Number);
  const wall = new Date(Date.UTC(y, m - 1, d, h, mi, s));
  if (wall.getUTCFullYear() !== y || wall.getUTCMonth() !== m - 1 || wall.getUTCDate() !== d) throw new Error("情境日期不存在。");
  return wall;
}

function fromWall(wall: Date): string {
  return `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}:${pad(wall.getUTCSeconds())}+08:00`;
}

/** Throws unless the value is a real Asia/Taipei date-time in the exact format the Rules accept. */
export function assertScenarioNow(scenarioNow: string): string {
  return fromWall(toWall(scenarioNow));
}

export function addHours(scenarioNow: string, hours: number): string {
  return fromWall(new Date(toWall(scenarioNow).getTime() + hours * 3_600_000));
}

/** The next calendar day at 09:00. */
export function nextDayAt9(scenarioNow: string): string {
  const wall = toWall(scenarioNow);
  return fromWall(new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + 1, 9)));
}

/** The following Monday at 09:00 (always a later week, even when today is Monday). */
export function nextMondayAt9(scenarioNow: string): string {
  const wall = toWall(scenarioNow);
  const daysToMonday = 7 - ((wall.getUTCDay() + 6) % 7);
  return fromWall(new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + daysToMonday, 9)));
}

/** `<input type="datetime-local">` value, read as Asia/Taipei wall time regardless of the device zone. */
export function toDatetimeLocal(scenarioNow: string): string {
  return assertScenarioNow(scenarioNow).slice(0, 16);
}

/** Accepts `HH:MM` or, as some mobile browsers return, `HH:MM:SS`. */
export function fromDatetimeLocal(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) throw new Error("請選擇完整的日期與時間。");
  return assertScenarioNow(`${value.length === 16 ? `${value}:00` : value}+08:00`);
}
