import { type Auth } from "firebase/auth";
import { doc, getDocFromServer, runTransaction, serverTimestamp, type Firestore } from "firebase/firestore";
import type { AuthenticatedSession, DemoContext } from "../identity/contracts";
import { activityWeekOf } from "../team/activity-week.ts";
import { assertScenarioNow } from "./clock-time.ts";

export type ClockChangeKind = "advance" | "reset";

export interface ClockChangePlan {
  kind: ClockChangeKind;
  from: DemoContext;
  to: Required<DemoContext>;
}

/** Outcome classes from FSD-02B: denied (Rules said no), unknown (re-read to decide), stale (reload first). */
export class AdminActionError extends Error {
  readonly kind: "denied" | "unknown" | "stale";
  constructor(kind: "denied" | "unknown" | "stale", message: string) { super(message); this.kind = kind; }
}

/** The exact next context a clock change will write; the Rules recheck every field. */
export function planClockChange(context: DemoContext, kind: ClockChangeKind, scenarioNow: string): ClockChangePlan {
  const target = assertScenarioNow(scenarioNow);
  if (kind === "advance" && target < context.scenarioNow) throw new Error("同一場次的情境時間只能往前推進；要重來請改用重設場次。");
  const clockVersion = context.clockVersion + 1;
  return {
    kind,
    from: context,
    to: {
      sessionId: kind === "advance" ? context.sessionId : `s${clockVersion}`,
      scenarioNow: target,
      clockVersion,
      activityWeekId: activityWeekOf(target),
    },
  };
}

export class AdminService {
  // Plain fields (not parameter properties) so node --experimental-strip-types can load this file in tests.
  private readonly auth: Auth;
  private readonly db: Firestore;
  constructor(auth: Auth, db: Firestore) { this.auth = auth; this.db = db; }

  async apply(session: AuthenticatedSession, plan: ClockChangePlan): Promise<void> {
    if (session.member.role !== "admin") throw new AdminActionError("denied", "只有管理者可以變更共用時間或場次。");
    if (this.auth.currentUser?.uid !== session.account.authUid) throw new AdminActionError("stale", "登入身分已變更，請重新登入。");
    const demoRef = doc(this.db, "demo", "current");
    const logRef = doc(this.db, "demoClockLog", String(plan.to.clockVersion));
    try {
      await runTransaction(this.db, async (tx) => {
        const current = (await tx.get(demoRef)).data();
        // The on-screen clockVersion is the idempotency base: a replay after success no longer matches.
        if (!current || current.sessionId !== plan.from.sessionId || current.clockVersion !== plan.from.clockVersion
          || current.scenarioNow !== plan.from.scenarioNow) throw new AdminActionError("stale", "共用情境已被變更，請重新載入後再操作。");
        tx.set(demoRef, { ...plan.to });
        tx.set(logRef, {
          clockVersion: plan.to.clockVersion, kind: plan.kind, actorMemberId: session.member.memberId,
          fromSessionId: current.sessionId, toSessionId: plan.to.sessionId,
          fromScenarioNow: current.scenarioNow, toScenarioNow: plan.to.scenarioNow,
          fromWeekId: typeof current.activityWeekId === "string" ? current.activityWeekId : null,
          toWeekId: plan.to.activityWeekId, serverRecordedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      if (error instanceof AdminActionError) {
        // The SDK retries a transaction whose reply was lost; the retry then sees our own committed write.
        if (error.kind === "stale" && await this.applied(plan)) return;
        throw error;
      }
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code === "permission-denied") throw new AdminActionError("denied", "共享端拒絕此變更（權限、時間或週 ID 不符規則）。");
      // Aborted, offline or no reply: the write may or may not have landed. Decide from the server.
      if (await this.applied(plan)) return;
      throw new AdminActionError("unknown", "無法確認是否已變更；已重新讀取共享端，請確認目前情境後再決定是否重試。");
    }
  }

  private async applied(plan: ClockChangePlan): Promise<boolean> {
    try {
      const now = (await getDocFromServer(doc(this.db, "demo", "current"))).data();
      return !!now && now.sessionId === plan.to.sessionId && now.clockVersion === plan.to.clockVersion
        && now.scenarioNow === plan.to.scenarioNow;
    } catch { return false; }
  }
}
