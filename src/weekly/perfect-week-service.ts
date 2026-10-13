import { type Auth } from "firebase/auth";
import {
  collection, doc, getDocFromServer, onSnapshot, runTransaction, serverTimestamp, type Firestore, type Unsubscribe,
} from "firebase/firestore";
import type { AuthenticatedSession } from "../identity/contracts";
import { parseDaily } from "../daily/daily-state";
import { classifyFailure } from "../team/contrib-state";
import { parseCoupon, plusDays, weekDays, type Coupon, type DayDoc } from "./perfect-week-state";
import type { CouponPort, IssueResult } from "./perfect-week-settler";

/** The clock or session moved under the transaction: the page's reload overlay takes over. */
class StaleContextError extends Error {}
/** The account was deactivated or mapped to another member: no retry; the member must sign in again. */
class IdentityChangedError extends Error {}

const toDayDoc = (state: { taskDate: string; effectiveSteps: number; claimed: number; eventSeq: number; rideCompletedAt: string | null }): DayDoc =>
  ({ taskDate: state.taskDate, effectiveSteps: state.effectiveSteps, claimed: state.claimed, eventSeq: state.eventSeq, ride: state.rideCompletedAt !== null });

/** FSD-04A: the member's own daily documents (read only) and weekly ride coupons. */
export class PerfectWeekService {
  constructor(private readonly auth: Auth, private readonly db: Firestore) {}

  private ensureUid(session: AuthenticatedSession): void {
    if (this.auth.currentUser?.uid !== session.account.authUid) throw new Error("登入身分已變更，請重新登入。");
  }

  private dayRef(session: AuthenticatedSession, taskDate: string) {
    return doc(this.db, "dailySteps", session.context.sessionId, "members", session.member.memberId, "days", taskDate);
  }

  private couponRef(session: AuthenticatedSession, weekId: string) {
    return doc(this.db, "rideCoupons", session.context.sessionId, "members", session.member.memberId, "weeks", weekId);
  }

  /** One own daily document; `confirmed` is false for cache or pending snapshots. */
  subscribeDay(session: AuthenticatedSession, taskDate: string,
    onState: (day: DayDoc | null, confirmed: boolean) => void, onError: (error: Error) => void): Unsubscribe {
    this.ensureUid(session);
    const expected = { sessionId: session.context.sessionId, memberId: session.member.memberId, taskDate };
    return onSnapshot(this.dayRef(session, taskDate), { includeMetadataChanges: true }, (snap) => {
      let day: DayDoc | null = null;
      try { day = snap.exists() ? toDayDoc(parseDaily(snap.data(), expected)) : null; }
      catch (error) { onError(error as Error); return; }
      onState(day, !snap.metadata.fromCache && !snap.metadata.hasPendingWrites);
    }, (error) => onError(error));
  }

  subscribeCoupons(session: AuthenticatedSession, onState: (coupons: Coupon[], confirmed: boolean) => void, onError: (error: Error) => void): Unsubscribe {
    this.ensureUid(session);
    const ref = collection(this.db, "rideCoupons", session.context.sessionId, "members", session.member.memberId, "weeks");
    return onSnapshot(ref, { includeMetadataChanges: true }, (snapshot) => {
      let coupons: Coupon[];
      try { coupons = snapshot.docs.map((d) => parseCoupon(d.data(), session.context.sessionId, session.member.memberId, d.id)); }
      catch (error) { onError(error as Error); return; }
      onState(coupons, !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites);
    }, (error) => onError(error));
  }

  /** The settler's view of this service for one signed-in session. */
  portFor(session: AuthenticatedSession): CouponPort {
    return {
      issue: (weekId) => this.issue(session, weekId),
      couponExists: async (weekId) => (await getDocFromServer(this.couponRef(session, weekId))).exists(),
      readDays: async (weekId) => Promise.all(weekDays(weekId).map(async (taskDate) => {
        const snap = await getDocFromServer(this.dayRef(session, taskDate));
        return snap.exists()
          ? toDayDoc(parseDaily(snap.data(), { sessionId: session.context.sessionId, memberId: session.member.memberId, taskDate }))
          : null;
      })),
    };
  }

  /**
   * Issues the week's coupon in a transaction: rereads demo/current and the member mapping and checks
   * session, clock version and scenario time against the page (else "stale"); an existing coupon is
   * "exists"; issuedAt is the checked scenario time and expiresAt the same time 30 days later.
   */
  async issue(session: AuthenticatedSession, weekId: string): Promise<IssueResult> {
    this.ensureUid(session);
    const ref = this.couponRef(session, weekId);
    try {
      return await runTransaction(this.db, async (tx) => {
        const current = (await tx.get(doc(this.db, "demo", "current"))).data() as Record<string, unknown> | undefined;
        const member = (await tx.get(doc(this.db, "membersByUid", session.account.authUid))).data() as Record<string, unknown> | undefined;
        if (!current || current.sessionId !== session.context.sessionId || current.clockVersion !== session.context.clockVersion
          || current.scenarioNow !== session.context.scenarioNow) throw new StaleContextError();
        if (!member || member.active !== true || member.memberId !== session.member.memberId) throw new IdentityChangedError();
        if ((await tx.get(ref)).exists()) return "exists" as const;
        const issuedAt = String(current.scenarioNow);
        tx.set(ref, {
          sessionId: session.context.sessionId, memberId: session.member.memberId, weekId, faceValue: 50, minFare: 150,
          issuedAt, expiresAt: plusDays(issuedAt, 30), clockVersion: Number(current.clockVersion), recordedAt: serverTimestamp(), kind: "weeklyPerfect",
        });
        return "issued" as const;
      });
    } catch (error) {
      if (error instanceof StaleContextError) return "stale";
      if (error instanceof IdentityChangedError) return "identity";
      return classifyFailure(error);
    }
  }
}
