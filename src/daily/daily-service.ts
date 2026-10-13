import { type Auth } from "firebase/auth";
import { isFirebaseError } from "../firebase/error-kind";
import { doc, getDocFromServer, onSnapshot, runTransaction, serverTimestamp, type Firestore, type Unsubscribe } from "firebase/firestore";
import type { AuthenticatedSession, DemoContext } from "../identity/contracts";
import { effectiveStepsOf, parseDaily, previousTaskDate, unlockedPoints, type DailyDay, type DailyState } from "./daily-state";
type DailyEventInput = { kind: "steps" | "ride" | "claim"; rawDelta: number; pointsDelta: number; occurredAt: string };
type DailyWrite = (next: DailyState, event: DailyEventInput | null) => DailyState;
export type { DailyDay, DailyState } from "./daily-state";
export { parseDaily } from "./daily-state";

export type DailyCommand = { type: "steps"; value: number } | { type: "ride" } | { type: "claim"; milestone: number } | { type: "claimAll" };

/** The write may or may not have landed (network, contention or a rule decided on newer data): reread before retrying. */
export class DailyUnconfirmedError extends Error {}

export function taskDateOf(context: DemoContext): string {
  if (!/^\d{4}-\d{2}-\d{2}T.*\+08:00$/.test(context.scenarioNow)) {
    throw new Error("共用情境時間須為 Asia/Taipei（+08:00）格式。");
  }
  return context.scenarioNow.slice(0, 10);
}

export function taskDateFor(context: DemoContext, day: DailyDay): string {
  const today = taskDateOf(context);
  return day === "today" ? today : previousTaskDate(today);
}

export function emptyDaily(session: AuthenticatedSession, day: DailyDay = "today"): DailyState {
  return {
    sessionId: session.context.sessionId,
    memberId: session.member.memberId,
    taskDate: taskDateFor(session.context, day),
    clockVersion: session.context.clockVersion,
    rawSteps: 0,
    effectiveSteps: 0,
    rideCompletedAt: null,
    claimed: 0,
    eventSeq: 0,
  };
}

const UNCONFIRMED_CODES = new Set(["permission-denied", "aborted", "unavailable", "deadline-exceeded", "unknown", "internal", "cancelled"]);

export class DailyService {
  constructor(private readonly auth: Auth, private readonly db: Firestore) {}

  private stateRef(session: AuthenticatedSession, day: DailyDay) {
    return doc(this.db, "dailySteps", session.context.sessionId, "members", session.member.memberId, "days", taskDateFor(session.context, day));
  }

  private eventRef(session: AuthenticatedSession, day: DailyDay, seq: number) {
    return doc(this.stateRef(session, day), "events", String(seq));
  }

  private ensureUid(session: AuthenticatedSession): void {
    if (this.auth.currentUser?.uid !== session.account.authUid) throw new Error("登入身分已變更，請重新登入。");
  }

  subscribe(session: AuthenticatedSession, day: DailyDay, onState: (state: DailyState, meta: { pending: boolean; fromCache: boolean; exists: boolean }) => void, onError: (error: Error) => void): Unsubscribe {
    this.ensureUid(session);
    const empty = emptyDaily(session, day);
    return onSnapshot(this.stateRef(session, day), { includeMetadataChanges: true }, (snapshot) => {
      let state: DailyState;
      // Only parsing is guarded: a rendering error in onState must not be reported as bad data.
      try {
        state = snapshot.exists() ? parseDaily(snapshot.data({ serverTimestamps: "estimate" }), empty) : empty;
      } catch (error) { onError(error as Error); return; }
      onState(state, { pending: snapshot.metadata.hasPendingWrites, fromCache: snapshot.metadata.fromCache, exists: snapshot.exists() });
    }, (error) => onError(error));
  }

  /** Server read used after an unconfirmed write, so the page shows what actually landed. */
  async refresh(session: AuthenticatedSession, day: DailyDay): Promise<{ state: DailyState; exists: boolean }> {
    this.ensureUid(session);
    const snapshot = await getDocFromServer(this.stateRef(session, day));
    const empty = emptyDaily(session, day);
    return { state: snapshot.exists() ? parseDaily(snapshot.data(), empty) : empty, exists: snapshot.exists() };
  }

  /** Creates the zero document of a task day if it is missing (today on entry; yesterday only on a catch-up sync). */
  async ensureDay(session: AuthenticatedSession, day: DailyDay): Promise<void> {
    this.ensureUid(session);
    await this.run(session, day, (state, exists, write) => exists ? state : write(state, null));
  }

  async execute(session: AuthenticatedSession, day: DailyDay, command: DailyCommand): Promise<DailyState> {
    this.ensureUid(session);
    if (command.type === "steps" && (!Number.isSafeInteger(command.value) || command.value < 0 || command.value > 1000000)) {
      throw new Error("步數須為 0 至 1,000,000 的整數。");
    }
    if (command.type === "ride" && day !== "today") throw new Error("乘車只能計入今日，不能補到昨日。");
    return this.run(session, day, (state, exists, write) => {
      if (!exists) throw new Error("每日資料尚未初始化，請重新載入。");
      const scenarioNow = session.context.scenarioNow;
      let next: DailyState;
      let event: DailyEventInput;
      if (command.type === "steps") {
        if (command.value < state.rawSteps) throw new Error("步數不可下修；請輸入不低於目前數值的步數。");
        if (command.value === state.rawSteps) return state; // Same-value resend writes nothing (no segment).
        next = { ...state, rawSteps: command.value, effectiveSteps: effectiveStepsOf(command.value, state.rideCompletedAt) };
        // Yesterday's catch-up segments are stamped at 23:59:59 of that day (PRD D14, 2026-10-01).
        event = { kind: "steps", rawDelta: command.value - state.rawSteps, pointsDelta: 0,
          occurredAt: day === "today" ? scenarioNow : `${state.taskDate}T23:59:59+08:00` };
      } else if (command.type === "ride") {
        if (state.rideCompletedAt !== null) return state;
        next = { ...state, rideCompletedAt: scenarioNow, effectiveSteps: effectiveStepsOf(state.rawSteps, scenarioNow) };
        event = { kind: "ride", rawDelta: 0, pointsDelta: 0, occurredAt: scenarioNow };
      } else {
        const unlocked = unlockedPoints(state.effectiveSteps);
        let target: number;
        if (command.type === "claim") {
          const needed = state.claimed + 1;
          if (command.milestone < needed) return state; // Idempotent replay.
          if (command.milestone !== needed) throw new Error(`請先領取第 ${needed} 點。`);
          if (unlocked < needed) throw new Error("尚未達到此里程碑。");
          target = needed;
        } else {
          if (unlocked <= state.claimed) return state;
          target = unlocked;
        }
        next = { ...state, claimed: target };
        event = { kind: "claim", rawDelta: 0, pointsDelta: target - state.claimed, occurredAt: scenarioNow };
      }
      return write(next, event);
    });
  }

  /**
   * One transaction: re-read the shared clock and identity, then write the daily document and (for a
   * change) its single event, keyed by the next eventSeq.
   */
  private async run(session: AuthenticatedSession, day: DailyDay,
    body: (state: DailyState, exists: boolean, write: DailyWrite) => DailyState): Promise<DailyState> {
    const stateRef = this.stateRef(session, day);
    const currentRef = doc(this.db, "demo", "current");
    const memberRef = doc(this.db, "membersByUid", session.account.authUid);
    try {
      return await runTransaction(this.db, async (transaction) => {
        const currentSnap = await transaction.get(currentRef);
        const memberSnap = await transaction.get(memberRef);
        const stateSnap = await transaction.get(stateRef);
        const current = currentSnap.data() as Record<string, unknown> | undefined;
        const member = memberSnap.data() as Record<string, unknown> | undefined;
        // The same scenarioNow keeps both task days (today and yesterday) unchanged.
        if (!current || current.sessionId !== session.context.sessionId || current.clockVersion !== session.context.clockVersion
          || current.scenarioNow !== session.context.scenarioNow) {
          throw new Error("共用情境時間或場次已變更，請重新載入。");
        }
        if (!member || member.active !== true || member.memberId !== session.member.memberId) throw new Error("展示身分已變更，請重新登入。");
        const empty = emptyDaily(session, day);
        const exists = stateSnap.exists();
        const state = exists ? parseDaily(stateSnap.data(), empty) : empty;
        return body(state, exists, (next, event) => {
          const clockVersion = session.context.clockVersion;
          if (event === null) {
            const stored = { ...next, clockVersion };
            transaction.set(stateRef, { ...stored, lastSyncedAt: serverTimestamp() });
            return stored;
          }
          const seq = state.eventSeq + 1;
          const stored = { ...next, clockVersion, eventSeq: seq };
          transaction.set(stateRef, { ...stored, lastSyncedAt: serverTimestamp() });
          transaction.set(this.eventRef(session, day, seq), {
            sessionId: next.sessionId, memberId: next.memberId, taskDate: next.taskDate, seq, kind: event.kind,
            rawDelta: event.rawDelta, pointsDelta: event.pointsDelta, claimedAfter: next.claimed,
            occurredAt: event.occurredAt, syncedAt: serverTimestamp(), clockVersion,
          });
          return stored;
        });
      });
    } catch (error) {
      if (isFirebaseError(error) && UNCONFIRMED_CODES.has(error.code)) {
        throw new DailyUnconfirmedError("結果未確認：寫入可能已生效也可能沒有。已改為重新讀取伺服器狀態，請確認數值後再決定是否重送。");
      }
      // Other SDK errors (e.g. failed-precondition, resource-exhausted) get a fixed Chinese message.
      if (isFirebaseError(error)) throw new Error(`共享服務暫時無法處理這次操作（${error.code}），請重新載入後再試。`);
      throw error;
    }
  }
}
