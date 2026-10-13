import { type Auth } from "firebase/auth";
import {
  collection, doc, getDocFromServer, onSnapshot, runTransaction, serverTimestamp, type Firestore, type Unsubscribe,
} from "firebase/firestore";
import type { AuthenticatedSession } from "../identity/contracts";
import { parseDaily } from "../daily/daily-state";
import { drawChest, parseChestOpen, secureRandom, type ChestOpen, type DayClaim } from "./chest-state";

/** The clock or session moved under the transaction: the page's reload overlay takes over. */
class StaleContextError extends Error {}
/** The account was deactivated or mapped to another member: the member must sign in again. */
class IdentityChangedError extends Error {}
/** No own chest for that week (it was never awarded, or not readable): nothing is written. */
class NoChestError extends Error {}

/**
 * "opened": this call wrote the opening; "exists": it was already opened (shown with the stored value);
 * "missing": no chest; "stale"/"identity": as in 04A; "failed": not booked (rechecked on the server).
 */
export type OpenResult =
  | { kind: "opened" | "exists"; open: ChestOpen }
  | { kind: "missing" | "stale" | "identity" | "failed" };

/** FSD-06A: the member's own daily documents (list), chests (03C-2, own path) and chest openings. */
export class ChestService {
  constructor(private readonly auth: Auth, private readonly db: Firestore) {}

  private ensureUid(session: AuthenticatedSession): void {
    if (this.auth.currentUser?.uid !== session.account.authUid) throw new Error("登入身分已變更，請重新登入。");
  }

  private openRef(session: AuthenticatedSession, weekId: string) {
    return doc(this.db, "chestOpens", session.context.sessionId, "members", session.member.memberId, "weeks", weekId);
  }

  private awardRef(session: AuthenticatedSession, weekId: string) {
    return doc(this.db, "chestAwards", session.context.sessionId, "weeks", weekId, "awards", session.member.memberId);
  }

  /** Every own daily document of the session; any malformed one fails the whole list (fail closed). */
  subscribeDays(session: AuthenticatedSession, onState: (days: DayClaim[], confirmed: boolean) => void, onError: (error: Error) => void): Unsubscribe {
    this.ensureUid(session);
    const { sessionId } = session.context;
    const { memberId } = session.member;
    return onSnapshot(collection(this.db, "dailySteps", sessionId, "members", memberId, "days"), { includeMetadataChanges: true }, (snapshot) => {
      let days: DayClaim[];
      try { days = snapshot.docs.map((d) => { const s = parseDaily(d.data(), { sessionId, memberId, taskDate: d.id }); return { taskDate: s.taskDate, claimed: s.claimed }; }); }
      catch (error) { onError(error as Error); return; }
      onState(days, !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites);
    }, (error) => onError(error));
  }

  subscribeOpens(session: AuthenticatedSession, onState: (opens: ChestOpen[], confirmed: boolean) => void, onError: (error: Error) => void): Unsubscribe {
    this.ensureUid(session);
    const { sessionId } = session.context;
    const { memberId } = session.member;
    return onSnapshot(collection(this.db, "chestOpens", sessionId, "members", memberId, "weeks"), { includeMetadataChanges: true }, (snapshot) => {
      let opens: ChestOpen[];
      try { opens = snapshot.docs.map((d) => parseChestOpen(d.data(), sessionId, memberId, d.id)); }
      catch (error) { onError(error as Error); return; }
      onState(opens, !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites);
    }, (error) => onError(error));
  }

  /** Whether the own chest of one week exists (03C-2 lets the owner read its own path, present or not). */
  subscribeAward(session: AuthenticatedSession, weekId: string, onState: (has: boolean, confirmed: boolean) => void, onError: (error: Error) => void): Unsubscribe {
    this.ensureUid(session);
    return onSnapshot(this.awardRef(session, weekId), { includeMetadataChanges: true },
      (snap) => onState(snap.exists(), !snap.metadata.fromCache && !snap.metadata.hasPendingWrites), (error) => onError(error));
  }

  /**
   * Opens one chest. The draw is a proposal: the transaction rereads demo/current and the mapping
   * (else "stale"/"identity"), needs the own chest, and returns an existing opening instead of writing.
   * Any other failure rereads the opening from the server and never infers "already opened" from an
   * error code (creating an existing document is evaluated as an update and is also permission-denied).
   */
  async open(session: AuthenticatedSession, weekId: string): Promise<OpenResult> {
    this.ensureUid(session);
    const ref = this.openRef(session, weekId);
    const { sessionId } = session.context;
    const { memberId } = session.member;
    const draw = drawChest(secureRandom);
    try {
      return await runTransaction(this.db, async (tx) => {
        const current = (await tx.get(doc(this.db, "demo", "current"))).data() as Record<string, unknown> | undefined;
        const member = (await tx.get(doc(this.db, "membersByUid", session.account.authUid))).data() as Record<string, unknown> | undefined;
        if (!current || current.sessionId !== sessionId || current.clockVersion !== session.context.clockVersion
          || current.scenarioNow !== session.context.scenarioNow) throw new StaleContextError();
        if (!member || member.active !== true || member.memberId !== memberId) throw new IdentityChangedError();
        if (!(await tx.get(this.awardRef(session, weekId))).exists()) throw new NoChestError();
        const existing = await tx.get(ref);
        if (existing.exists()) return { kind: "exists" as const, open: parseChestOpen(existing.data(), sessionId, memberId, weekId) };
        const openedAt = String(current.scenarioNow);
        tx.set(ref, { sessionId, memberId, weekId, tier: draw.tier, points: draw.points, openedAt,
          clockVersion: Number(current.clockVersion), recordedAt: serverTimestamp() });
        return { kind: "opened" as const, open: { weekId, tier: draw.tier, points: draw.points, openedAt } };
      });
    } catch (error) {
      if (error instanceof StaleContextError) return { kind: "stale" };
      if (error instanceof IdentityChangedError) return { kind: "identity" };
      if (error instanceof NoChestError) return { kind: "missing" };
      try {
        const snap = await getDocFromServer(ref);
        return snap.exists() ? { kind: "exists", open: parseChestOpen(snap.data(), sessionId, memberId, weekId) } : { kind: "failed" };
      } catch { return { kind: "failed" }; }
    }
  }
}
