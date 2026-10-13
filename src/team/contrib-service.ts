import { type Auth } from "firebase/auth";
import { collection, doc, getDocFromServer, onSnapshot, query, runTransaction, serverTimestamp, where, type Firestore, type Unsubscribe } from "firebase/firestore";
import type { AuthenticatedSession } from "../identity/contracts";
import { taskDateOf } from "../daily/daily-service";
import { isFirebaseError } from "../firebase/error-kind";
import { previousTaskDate } from "../daily/daily-state";
import { parseMembership, parseTeam, type MembershipState, type TeamState } from "./team-state";
import {
  classifyFailure, contributionEligibility, entryIdOf, missingCredits, parseEntry, weekOfTaskDate,
  type ContribEntry, type TeamEventLite,
} from "./contrib-state";

export { visibleWeeks } from "./contrib-state";

/**
 * - credited: written now. already: an entry existed. ineligible: the client rule says no (not an error).
 * - final: the Rules refused after one reread; never retried on this page. unconfirmed: network-type
 *   failure (also while checking whether the entry exists); retried by a later reconcile.
 */
export type CreditResult = "credited" | "already" | "ineligible" | "final" | "unconfirmed";

/** What a credit decision needs besides the event; read once per reconcile and reused. */
export interface ContribContext { membership: MembershipState | null; team: TeamState | null; events: TeamEventLite[] | null }


/** FSD-03C-1: writes the member's own ledger entries (a second write, never blocking personal steps). */
export class ContribService {
  /** Entries the Rules refused on this page load (final for the page: no loops). */
  private readonly finalized = new Set<string>();
  /** One attempt per entry at a time; a second caller shares the running one. */
  private readonly inflight = new Map<string, Promise<CreditResult>>();

  constructor(private readonly auth: Auth, private readonly db: Firestore) {}

  private ensureUid(session: AuthenticatedSession): void {
    if (this.auth.currentUser?.uid !== session.account.authUid) throw new Error("登入身分已變更，請重新登入。");
  }

  private entryRef(session: AuthenticatedSession, teamId: string, entryId: string) {
    return doc(this.db, "teamContrib", session.context.sessionId, "teams", teamId, "entries", entryId);
  }

  private dayRef(session: AuthenticatedSession, taskDate: string) {
    return doc(this.db, "dailySteps", session.context.sessionId, "members", session.member.memberId, "days", taskDate);
  }

  /** Subscribes to the team's entries of the given weeks (no orderBy: single-field index only; sorted by replay). */
  subscribeWeeks(session: AuthenticatedSession, teamId: string, weekIds: string[],
    onState: (entries: ContribEntry[], confirmed: boolean) => void, onError: (error: Error) => void): Unsubscribe {
    this.ensureUid(session);
    const q = query(collection(this.db, "teamContrib", session.context.sessionId, "teams", teamId, "entries"), where("weekId", "in", weekIds));
    return onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      let entries: ContribEntry[];
      try {
        entries = snapshot.docs.map((d) => parseEntry(d.data(), session.context.sessionId, teamId, d.id));
      } catch (error) { onError(error as Error); return; }
      onState(entries, !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites);
    }, (error) => onError(error));
  }

  private async readTeamEvents(session: AuthenticatedSession, team: TeamState): Promise<TeamEventLite[]> {
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

  private async readContext(session: AuthenticatedSession): Promise<ContribContext> {
    const ms = await getDocFromServer(doc(this.db, "teamMembership", session.context.sessionId, "members", session.member.memberId));
    if (!ms.exists()) return { membership: null, team: null, events: null };
    const membership = parseMembership(ms.data(), session.context.sessionId, session.member.memberId);
    // A departed member cannot read the team's events; it attempts with the conservative rule (ruling N1 (c)).
    if (membership.status !== "active" || !membership.teamId) return { membership, team: null, events: null };
    const ts = await getDocFromServer(doc(this.db, "teams", session.context.sessionId, "items", membership.teamId));
    if (!ts.exists()) return { membership, team: null, events: null };
    const team = parseTeam(ts.data(), session.context.sessionId, membership.teamId);
    return { membership, team, events: await this.readTeamEvents(session, team) };
  }

  /**
   * Credits one own event (today or yesterday) if the client rule allows. `ctx` may be shared by a
   * reconcile; a Rules refusal rereads the context once (state race) before it becomes final.
   */
  credit(session: AuthenticatedSession, taskDate: string, seq: number, ctx?: ContribContext): Promise<CreditResult> {
    this.ensureUid(session);
    const entryId = entryIdOf(session.member.memberId, taskDate, seq);
    if (this.finalized.has(entryId)) return Promise.resolve("final");
    const running = this.inflight.get(entryId);
    if (running) return running;
    const attempt = this.attempt(session, taskDate, seq, entryId, ctx).finally(() => this.inflight.delete(entryId));
    this.inflight.set(entryId, attempt);
    return attempt;
  }

  private async attempt(session: AuthenticatedSession, taskDate: string, seq: number, entryId: string, shared?: ContribContext): Promise<CreditResult> {
    try {
      const eventSnap = await getDocFromServer(doc(this.dayRef(session, taskDate), "events", String(seq)));
      if (!eventSnap.exists()) return "ineligible";
      const e = eventSnap.data() as Record<string, unknown>;
      if (e.kind !== "steps" && e.kind !== "ride") return "ineligible";
      const kind = e.kind;
      const syncedAt = e.syncedAt as { seconds: number; nanoseconds: number };
      const decide = (ctx: ContribContext) => contributionEligibility({
        kind, occurredAt: String(e.occurredAt), syncedAt: { seconds: syncedAt.seconds, nanoseconds: syncedAt.nanoseconds },
        taskDate, today: taskDateOf(session.context), selfId: session.member.memberId,
        membership: ctx.membership, team: ctx.team ? { teamId: ctx.team.teamId, status: ctx.team.status, everFormed: ctx.team.everFormed, createdAt: ctx.team.createdAt, revision: ctx.team.revision } : null,
        events: ctx.events,
      });
      let decision = decide(shared ?? await this.readContext(session));
      for (let round = 0; ; round += 1) {
        if (!decision.eligible || !decision.teamId) return "ineligible";
        const teamId = decision.teamId;
        const joinRevision = decision.joinRevision;
        const ref = this.entryRef(session, teamId, entryId);
        try {
          return await runTransaction(this.db, async (tx) => {
            if ((await tx.get(ref)).exists()) return "already" as const;
            tx.set(ref, {
              sessionId: session.context.sessionId, teamId, weekId: weekOfTaskDate(taskDate), memberId: session.member.memberId,
              taskDate, seq, kind, eligibleRawDelta: kind === "steps" ? Number(e.rawDelta) : 0, occurredAt: String(e.occurredAt),
              syncedAt: e.syncedAt, joinRevision, recordedAt: serverTimestamp(),
            });
            return "credited" as const;
          });
        } catch (error) {
          if (classifyFailure(error) === "unconfirmed") return "unconfirmed";
        }
        // Refused: the entry may already exist (a second create is refused too) or the Rules said no.
        // A network error here propagates to the outer catch as "unconfirmed" (whether it landed is unknown).
        if ((await getDocFromServer(ref)).exists()) return "already";
        if (round > 0) break;
        // Contract: a client-eligible entry the Rules refused is reread once (the team may have just changed).
        const fresh = decide(await this.readContext(session));
        if (fresh.eligible && fresh.teamId === teamId && fresh.joinRevision === joinRevision) break;
        decision = fresh;
      }
      this.finalized.add(entryId);
      return "final";
    } catch (error) {
      // A read failed. Network-type errors and read refusals (e.g. the team's events right after leaving,
      // before the tombstone reconcile) are retried by a later reconcile; only other errors (a malformed
      // document) end this page's attempts. Only a refused write after one reread is final (above).
      if (classifyFailure(error) === "unconfirmed" || (isFirebaseError(error) && error.code === "permission-denied")) return "unconfirmed";
      this.finalized.add(entryId);
      return "final";
    }
  }

  /**
   * Credits own step/ride events of today and yesterday that have no entry yet. `credited` comes from
   * the team subscription; a departed member (no subscription) passes null and each entry is checked by
   * its own path. Returns the result of every attempted entry, keyed by entry ID.
   */
  async reconcile(session: AuthenticatedSession, credited: Set<string> | null, teamIdForOwnCheck: string | null): Promise<Map<string, CreditResult>> {
    this.ensureUid(session);
    const today = taskDateOf(session.context);
    const own: { taskDate: string; seq: number; kind: string }[] = [];
    for (const taskDate of [previousTaskDate(today), today]) {
      const day = await getDocFromServer(this.dayRef(session, taskDate));
      if (!day.exists()) continue;
      const eventSeq = Number((day.data() as Record<string, unknown>).eventSeq);
      for (let seq = 1; Number.isSafeInteger(eventSeq) && seq <= eventSeq; seq += 1) {
        const ev = await getDocFromServer(doc(this.dayRef(session, taskDate), "events", String(seq)));
        if (ev.exists()) own.push({ taskDate, seq, kind: String((ev.data() as Record<string, unknown>).kind) });
      }
    }
    let known = credited ?? new Set<string>();
    if (!credited && teamIdForOwnCheck) {
      known = new Set<string>();
      for (const e of own) {
        const id = entryIdOf(session.member.memberId, e.taskDate, e.seq);
        if ((await getDocFromServer(this.entryRef(session, teamIdForOwnCheck, id))).exists()) known.add(id);
      }
    }
    const results = new Map<string, CreditResult>();
    const missing = missingCredits(own, known, session.member.memberId);
    // One context read for the whole reconcile (a refusal still rereads it inside credit()).
    const ctx = missing.length > 0 ? await this.readContext(session) : undefined;
    for (const { taskDate, seq } of missing) {
      results.set(entryIdOf(session.member.memberId, taskDate, seq), await this.credit(session, taskDate, seq, ctx));
    }
    return results;
  }
}
