import { type Auth } from "firebase/auth";
import {
  collection, doc, getDocFromServer, onSnapshot, query, runTransaction, serverTimestamp, Timestamp, where,
  type Firestore, type Unsubscribe,
} from "firebase/firestore";
import type { AuthenticatedSession } from "../identity/contracts";
import { classifyFailure, compareMoments, type Moment, type TeamEventLite } from "./contrib-state";
import { parseTeam, type TeamState } from "./team-state";
import type { SettlerPort, WriteResult } from "./week-settler";
import {
  latestStints, parseAward, parseWeekResult, sameMoment,
  type ChestAward, type PendingAward, type Reaching, type Stint, type WeekResult,
} from "./week-result-state";



const ts = (m: Moment["server"]) => new Timestamp(m.seconds, m.nanoseconds);

/** FSD-03C-2: week results and chest awards (Firestore access only; decisions live in week-result-state). */
export class WeekResultService {
  /** The settler's view of this service for one signed-in session. */
  portFor(session: AuthenticatedSession): SettlerPort {
    return {
      readStints: (teamId) => this.readStints(session, teamId),
      writeWeek: (teamId, weekId, reaching) => this.writeWeek(session, teamId, weekId, reaching),
      writeAward: (teamId, weekId, award) => this.writeAward(session, teamId, weekId, award),
    };
  }

  constructor(private readonly auth: Auth, private readonly db: Firestore) {}

  private ensureUid(session: AuthenticatedSession): void {
    if (this.auth.currentUser?.uid !== session.account.authUid) throw new Error("登入身分已變更，請重新登入。");
  }

  private weekRef(session: AuthenticatedSession, teamId: string, weekId: string) {
    return doc(this.db, "teamWeeks", session.context.sessionId, "teams", teamId, "weeks", weekId);
  }

  private awardRef(session: AuthenticatedSession, weekId: string, memberId: string) {
    return doc(this.db, "chestAwards", session.context.sessionId, "weeks", weekId, "awards", memberId);
  }

  subscribeWeek(session: AuthenticatedSession, teamId: string, weekId: string,
    onState: (record: WeekResult | null, confirmed: boolean) => void, onError: (error: Error) => void): Unsubscribe {
    this.ensureUid(session);
    return onSnapshot(this.weekRef(session, teamId, weekId), { includeMetadataChanges: true }, (snap) => {
      let record: WeekResult | null = null;
      try { record = snap.exists() ? parseWeekResult(snap.data(), session.context.sessionId, teamId, weekId) : null; }
      catch (error) { onError(error as Error); return; }
      onState(record, !snap.metadata.fromCache && !snap.metadata.hasPendingWrites);
    }, (error) => onError(error));
  }

  subscribeAwards(session: AuthenticatedSession, teamId: string, weekId: string,
    onState: (awards: ChestAward[], confirmed: boolean) => void, onError: (error: Error) => void): Unsubscribe {
    this.ensureUid(session);
    const q = query(collection(this.db, "chestAwards", session.context.sessionId, "weeks", weekId, "awards"), where("teamId", "==", teamId));
    return onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      let awards: ChestAward[];
      try { awards = snapshot.docs.map((d) => parseAward(d.data(), session.context.sessionId, weekId, d.id)); }
      catch (error) { onError(error as Error); return; }
      onState(awards, !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites);
    }, (error) => onError(error));
  }

  /** The viewer's own award of a week (also after leaving the team); null when there is none. */
  async ownAward(session: AuthenticatedSession, weekId: string): Promise<ChestAward | null> {
    this.ensureUid(session);
    const snap = await getDocFromServer(this.awardRef(session, weekId, session.member.memberId));
    return snap.exists() ? parseAward(snap.data(), session.context.sessionId, weekId, session.member.memberId) : null;
  }

  /**
   * Latest stints from one consistent team revision: the team is reread after the events and the
   * whole read is retried once when it moved. Null on an inconsistent history (fail closed).
   */
  async readStints(session: AuthenticatedSession, teamId: string): Promise<{ revision: number; stints: Stint[] | null } | null> {
    this.ensureUid(session);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const team = await this.readTeam(session, teamId);
      if (!team) return null;
      const events = await this.readEvents(session, team);
      const again = await this.readTeam(session, teamId);
      if (again && again.revision === team.revision) return { revision: team.revision, stints: latestStints(events, team.memberIds, team.createdAt) };
    }
    return null;
  }

  private async readTeam(session: AuthenticatedSession, teamId: string): Promise<TeamState | null> {
    const snap = await getDocFromServer(doc(this.db, "teams", session.context.sessionId, "items", teamId));
    return snap.exists() ? parseTeam(snap.data(), session.context.sessionId, teamId) : null;
  }

  private async readEvents(session: AuthenticatedSession, team: TeamState): Promise<TeamEventLite[]> {
    const events: TeamEventLite[] = [];
    for (let revision = 1; revision <= team.revision; revision += 1) {
      const snap = await getDocFromServer(doc(this.db, "teams", session.context.sessionId, "items", team.teamId, "events", String(revision)));
      if (!snap.exists()) throw new Error("隊伍事件不完整。");
      const d = snap.data() as Record<string, unknown>;
      const server = d.serverRecordedAt as { seconds: number; nanoseconds: number } | undefined;
      if (!server || typeof d.effectiveAt !== "string" || typeof d.targetMemberId !== "string") throw new Error("隊伍事件格式不符。");
      events.push({ revision, type: d.type as TeamEventLite["type"], targetMemberId: d.targetMemberId, effectiveAt: d.effectiveAt,
        serverRecordedAt: { seconds: server.seconds, nanoseconds: server.nanoseconds } });
    }
    return events;
  }

  /** Creates the week result, or moves Mc earlier; a record that is already as early is left alone. */
  async writeWeek(session: AuthenticatedSession, teamId: string, weekId: string, reaching: Reaching): Promise<WriteResult> {
    this.ensureUid(session);
    const ref = this.weekRef(session, teamId, weekId);
    const at: Moment = { at: reaching.occurredAt, server: reaching.syncedAt };
    try {
      return await runTransaction(this.db, async (tx) => {
        const snap = await tx.get(ref);
        const base = { reachedAt: reaching.occurredAt, reachedSyncedAt: ts(reaching.syncedAt), reachingEntryId: reaching.entryId,
          updatedAt: serverTimestamp(), updatedBy: session.member.memberId };
        if (!snap.exists()) {
          tx.set(ref, { sessionId: session.context.sessionId, teamId, weekId, firstReachedAt: reaching.occurredAt,
            firstReachedSyncedAt: ts(reaching.syncedAt), revision: 0, firstRecordedAt: serverTimestamp(), ...base });
          return "done" as const;
        }
        const record = parseWeekResult(snap.data(), session.context.sessionId, teamId, weekId);
        if (compareMoments(at, record.current) >= 0) return "skip" as const; // someone already recorded it as early
        tx.update(ref, { ...base, revision: record.revision + 1 });
        return "done" as const;
      });
    } catch (error) { return classifyFailure(error); }
  }

  /**
   * Creates one award for the record as it is at commit time: the transaction rereads the week result
   * and gives up ("skip") when the planned moment is no longer its M1 or Mc, or the award already exists.
   */
  async writeAward(session: AuthenticatedSession, teamId: string, weekId: string, award: PendingAward): Promise<WriteResult> {
    this.ensureUid(session);
    const weekRef = this.weekRef(session, teamId, weekId);
    const ref = this.awardRef(session, weekId, award.memberId);
    try {
      return await runTransaction(this.db, async (tx) => {
        const week = await tx.get(weekRef);
        if (!week.exists()) return "skip" as const;
        const record = parseWeekResult(week.data(), session.context.sessionId, teamId, weekId);
        const valid = award.basis === "first" ? sameMoment(award.at, record.first)
          : sameMoment(award.at, record.current) && !sameMoment(record.current, record.first);
        if (!valid) return "skip" as const;
        if ((await tx.get(ref)).exists()) return "exists" as const;
        tx.set(ref, { sessionId: session.context.sessionId, weekId, memberId: award.memberId, teamId,
          reachedAt: award.at.at, reachedSyncedAt: ts(award.at.server), joinRevision: award.joinRevision, leaveRevision: award.leaveRevision,
          basis: award.basis, grantedBy: session.member.memberId, grantedAt: serverTimestamp() });
        return "done" as const;
      });
    } catch (error) { return classifyFailure(error); }
  }
}
