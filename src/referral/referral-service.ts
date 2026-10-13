import { type Auth } from "firebase/auth";
import {
  collection, doc, getDocFromServer, onSnapshot, query, runTransaction, serverTimestamp, where, type Firestore,
} from "firebase/firestore";
import type { AuthenticatedSession } from "../identity/contracts";
import { bindRefusal, checkCode, parseReferral, type Referral } from "./referral-state";

/** The clock or session moved under the transaction: the page's reload overlay takes over. */
class StaleContextError extends Error {}
class IdentityChangedError extends Error {}
/** Refused before writing, with the message to show (already bound, mutual, first ride done). */
class RefusedError extends Error {}

export type ReferralResult = { ok: true } | { ok: false; message: string; stale?: boolean };

/** What every reader of referral data sees (Architect suggestion 2: one subscription, three readers). */
export interface ReferralSnapshot {
  /** The viewer's own referral (as referee); undefined while not server-confirmed. */
  own: Referral | null | undefined;
  /** Referrals naming the viewer as referrer; undefined while not server-confirmed. */
  mine: Referral[] | undefined;
  error: Error | null;
}

export interface ReferralFeed {
  snapshot(): ReferralSnapshot;
  /** Calls back on every change; returns an unsubscribe. */
  listen(onChange: () => void): () => void;
  stop(): void;
}

/** FSD-07A: simulated referrals (Firestore access only; decisions live in referral-state). */
export class ReferralService {
  constructor(private readonly auth: Auth, private readonly db: Firestore) {}

  private ensureUid(session: AuthenticatedSession): void {
    if (this.auth.currentUser?.uid !== session.account.authUid) throw new Error("登入身分已變更，請重新登入。");
  }

  private ref(session: AuthenticatedSession, refereeId: string) {
    return doc(this.db, "referrals", session.context.sessionId, "referees", refereeId);
  }

  /** One subscription to the own referral and the list of referrals naming the viewer, shared by every reader. */
  feed(session: AuthenticatedSession): ReferralFeed {
    this.ensureUid(session);
    const { sessionId } = session.context;
    const self = session.member.memberId;
    const state: ReferralSnapshot = { own: undefined, mine: undefined, error: null };
    const listeners = new Set<() => void>();
    const notify = () => { for (const l of [...listeners]) l(); };
    const fail = (error: Error) => { state.error = error; notify(); };
    const stopOwn = onSnapshot(this.ref(session, self), { includeMetadataChanges: true }, (snap) => {
      try { state.own = snap.metadata.fromCache || snap.metadata.hasPendingWrites ? undefined : snap.exists() ? parseReferral(snap.data(), sessionId, self) : null; }
      catch (error) { fail(error as Error); return; }
      notify();
    }, fail);
    const stopMine = onSnapshot(query(collection(this.db, "referrals", sessionId, "referees"), where("referrerId", "==", self)), { includeMetadataChanges: true }, (snapshot) => {
      try { state.mine = snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites ? undefined : snapshot.docs.map((d) => parseReferral(d.data(), sessionId, d.id)); }
      catch (error) { fail(error as Error); return; }
      notify();
    }, fail);
    return {
      snapshot: () => state,
      listen: (onChange) => { listeners.add(onChange); return () => listeners.delete(onChange); },
      stop: () => { stopOwn(); stopMine(); listeners.clear(); },
    };
  }

  /** Whether a code names a member (AC1 name table), read from the server, never the cache. */
  async codeExists(code: string): Promise<boolean | null> {
    if (!/^[A-Za-z0-9-]{1,40}$/.test(code)) return false;
    try { return (await getDocFromServer(doc(this.db, "memberProfiles", code))).exists(); } catch { return null; }
  }

  private async context(tx: Parameters<Parameters<typeof runTransaction>[1]>[0], session: AuthenticatedSession) {
    const current = (await tx.get(doc(this.db, "demo", "current"))).data() as Record<string, unknown> | undefined;
    const member = (await tx.get(doc(this.db, "membersByUid", session.account.authUid))).data() as Record<string, unknown> | undefined;
    if (!current || current.sessionId !== session.context.sessionId || current.clockVersion !== session.context.clockVersion
      || current.scenarioNow !== session.context.scenarioNow) throw new StaleContextError();
    if (!member || member.active !== true || member.memberId !== session.member.memberId) throw new IdentityChangedError();
    return current;
  }

  /**
   * Binds the referee to a code. The transaction reads the own referral (must be missing) and, when
   * readable, the referrer's referral to rule out a mutual pair (a referrer's referral that is not
   * readable exists with another referrer and can never become mutual). A refusal is explained from a
   * server reread, never from an error code.
   */
  async bind(session: AuthenticatedSession, code: string): Promise<ReferralResult> {
    this.ensureUid(session);
    const self = session.member.memberId;
    const check = checkCode(code, self);
    if (!check.ok || check.code !== code) return { ok: false, message: check.ok ? "找不到這個推薦碼。" : check.message };
    const { sessionId } = session.context;
    const write = (readTheirs: boolean) => runTransaction(this.db, async (tx) => {
      const current = await this.context(tx, session);
      if ((await tx.get(this.ref(session, self))).exists()) throw new RefusedError("您已經綁定推薦碼，不能更改。");
      if (readTheirs) {
        const theirs = await tx.get(this.ref(session, code));
        if (theirs.exists() && parseReferral(theirs.data(), sessionId, code).referrerId === self) throw new RefusedError("對方已由您推薦，不能互相推薦。");
      }
      tx.set(this.ref(session, self), { sessionId, refereeId: self, referrerId: code, boundAt: String(current.scenarioNow), firstRideAt: null,
        clockVersion: Number(current.clockVersion), recordedAt: serverTimestamp(), firstRideRecordedAt: null });
    });
    try {
      let theirsReadable = true;
      try { await getDocFromServer(this.ref(session, code)); } catch { theirsReadable = false; }
      await write(theirsReadable);
      return { ok: true };
    } catch (error) {
      if (error instanceof StaleContextError) return { ok: false, message: "共用情境已更新，請重新載入。", stale: true };
      if (error instanceof IdentityChangedError) return { ok: false, message: "展示身分已變更，請重新登入。" };
      if (error instanceof RefusedError) return { ok: false, message: error.message };
      const message = await this.explainBind(session, code);
      return message === "" ? { ok: true } : { ok: false, message };
    }
  }

  private async explainBind(session: AuthenticatedSession, code: string): Promise<string> {
    const self = session.member.memberId;
    const { sessionId } = session.context;
    try {
      const own = await getDocFromServer(this.ref(session, self));
      if (own.exists()) return parseReferral(own.data(), sessionId, self).referrerId === code ? "" : bindRefusal(parseReferral(own.data(), sessionId, self), null, code, self, null);
      let theirs: Referral | null | "unreadable" = "unreadable";
      try { const t = await getDocFromServer(this.ref(session, code)); theirs = t.exists() ? parseReferral(t.data(), sessionId, code) : null; } catch { /* exists with another referrer */ }
      return bindRefusal(null, theirs, code, self, await this.codeExists(code));
    } catch { return "結果未確認且無法重新讀取；請稍後重新整理再看。"; }
  }

  /** Marks the referee's simulated first ride (once); a refusal is explained from a server reread. */
  async firstRide(session: AuthenticatedSession): Promise<ReferralResult> {
    this.ensureUid(session);
    const self = session.member.memberId;
    const { sessionId } = session.context;
    try {
      await runTransaction(this.db, async (tx) => {
        const current = await this.context(tx, session);
        const own = await tx.get(this.ref(session, self));
        if (!own.exists()) throw new RefusedError("請先綁定推薦碼。");
        if (parseReferral(own.data(), sessionId, self).firstRideAt) throw new RefusedError("首乘已完成，推薦獎勵已發放。");
        tx.update(this.ref(session, self), { firstRideAt: String(current.scenarioNow), firstRideRecordedAt: serverTimestamp() });
      });
      return { ok: true };
    } catch (error) {
      if (error instanceof StaleContextError) return { ok: false, message: "共用情境已更新，請重新載入。", stale: true };
      if (error instanceof IdentityChangedError) return { ok: false, message: "展示身分已變更，請重新登入。" };
      if (error instanceof RefusedError) return { ok: false, message: error.message };
      try {
        const own = await getDocFromServer(this.ref(session, self));
        if (own.exists() && parseReferral(own.data(), sessionId, self).firstRideAt) return { ok: true };
        return { ok: false, message: "首乘未記錄，可再試一次。" };
      } catch { return { ok: false, message: "結果未確認且無法重新讀取；請稍後重新整理再看。" }; }
    }
  }
}
