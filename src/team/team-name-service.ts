import { type Auth } from "firebase/auth";
import { doc, getDocFromServer, onSnapshot, runTransaction, serverTimestamp, type Firestore, type Unsubscribe } from "firebase/firestore";
import { isFirebaseError } from "../firebase/error-kind";
import type { AuthenticatedSession } from "../identity/contracts";
import { checkTeamName, parseTeamName } from "./team-name";
import { classifyTeamError, parseTeam } from "./team-state";

/** saved: on the server. notSaved: the server shows another name (nothing landed). unknown: could not reread; do not resend. */
export type TeamNameOutcome = "saved" | "notSaved" | "unknown";

/**
 * FSD-03E: reads and writes `teamNames/{sessionId}/items/{teamId}`. The Rules decide who may write
 * (the current captain of a team that is not archived); this only keeps the browser from asking for
 * what would be refused, and never resends on its own (B1).
 */
export class TeamNameService {
  constructor(private readonly auth: Auth, private readonly db: Firestore) {}

  private nameRef(session: AuthenticatedSession, teamId: string) { return doc(this.db, "teamNames", session.context.sessionId, "items", teamId); }

  /** Only server-confirmed snapshots reach `onName` (null: confirmed unnamed); cache and pending writes are skipped. */
  subscribe(session: AuthenticatedSession, teamId: string, onName: (name: string | null) => void, onError: (error: Error) => void): Unsubscribe {
    return onSnapshot(this.nameRef(session, teamId), { includeMetadataChanges: true }, (snap) => {
      if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) return;
      if (!snap.exists()) { onName(null); return; }
      try { onName(parseTeamName(snap.data(), session.context.sessionId, teamId)); } catch (error) { onError(error as Error); }
    }, onError);
  }

  async save(session: AuthenticatedSession, teamId: string, raw: string): Promise<TeamNameOutcome> {
    if (this.auth.currentUser?.uid !== session.account.authUid) throw new Error("登入身分已變更，請重新登入。");
    const check = checkTeamName(raw);
    if (!check.ok) throw new Error(check.message);
    const { sessionId, clockVersion, scenarioNow } = session.context;
    const memberId = session.member.memberId;
    const ref = this.nameRef(session, teamId);
    try {
      await runTransaction(this.db, async (tx) => {
        let demo, team;
        try {
          [demo, team] = await Promise.all([tx.get(doc(this.db, "demo", "current")), tx.get(doc(this.db, "teams", sessionId, "items", teamId))]);
        } catch (error) {
          // A refused read is a precondition (no longer in this team), never an unconfirmed write.
          if (isFirebaseError(error) && classifyTeamError(error.code, "read") === "precondition") throw new Error("只有隊長可以改隊名。");
          throw error;
        }
        const current = demo.data();
        if (!current || current.sessionId !== sessionId || current.clockVersion !== clockVersion || current.scenarioNow !== scenarioNow) {
          throw new Error("共用場次或情境時間已變更，請重新載入。");
        }
        if (!team.exists()) throw new Error("隊伍已不存在，請重新載入。");
        const t = parseTeam(team.data(), sessionId, teamId);
        if (t.status === "archived") throw new Error("隊伍已封存，無法改名。");
        if (t.leaderMemberId !== memberId) throw new Error("只有隊長可以改隊名。");
        tx.set(ref, { sessionId, teamId, name: check.name, updatedBy: memberId, updatedAt: serverTimestamp(), clockVersion });
      });
      return "saved";
    } catch (error) {
      if (!isFirebaseError(error)) throw error;
      if (classifyTeamError(error.code, "commit") !== "unconfirmed") throw new Error(`共享服務暫時無法處理這次操作（${error.code}），請重新載入後再試。`);
      // The commit may have landed: compare what the server holds, and never send again from here.
      try {
        const snap = await getDocFromServer(ref);
        const d = snap.exists() ? snap.data() : null;
        return d && d.name === check.name && d.updatedBy === memberId ? "saved" : "notSaved";
      } catch { return "unknown"; }
    }
  }
}
