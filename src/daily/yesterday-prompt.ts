/** The part of Web Storage the prompt uses; either call may throw (private mode, blocked site data). */
export interface PromptStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function yesterdayPromptKey(sessionId: string, memberId: string, taskDate: string): string {
  return `yoi:yesterday-prompt:${sessionId}:${memberId}:${taskDate}`;
}

/**
 * Decides whether the first-entry prompt for yesterday's claimable points should show (P28), and
 * marks it shown on this device. Without usable storage it shows on every entry rather than never.
 */
export function claimYesterdayPrompt(storage: PromptStorage | null, key: string, points: number): boolean {
  if (points <= 0) return false;
  if (storage === null) return true;
  try {
    if (storage.getItem(key) !== null) return false;
  } catch { return true; }
  try { storage.setItem(key, "shown"); } catch { /* Still show it this time. */ }
  return true;
}
