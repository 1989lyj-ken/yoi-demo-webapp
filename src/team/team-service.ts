import { type Auth } from "firebase/auth";
import { isFirebaseError } from "../firebase/error-kind";
import { doc, getDocFromServer, onSnapshot, runTransaction, serverTimestamp, type Firestore, type Unsubscribe } from "firebase/firestore";
import type { AuthenticatedSession } from "../identity/contracts";
import { emptyDaily, parseDaily, taskDateOf } from "../daily/daily-service";
import type { DailyState } from "../daily/daily-state";
import { requireActivityWeek } from "./activity-week";
import {
  classifyTeamError, matchesLeaveExpectation, matchesTransferExpectation, memberLock, parseMembership, parseTeam,
  type LeaveExpectation, type MembershipState, type TeamState, type TransferExpectation,
} from "./team-state";
export { TeamFormatError } from "./team-state";
export type { MembershipState, TeamState } from "./team-state";

export interface TeamRosterEntry {
  memberId: string;
  daily: DailyState;
  exists: boolean;
  pending: boolean;
  fromCache: boolean;
}

/** A confirmed team snapshot for the signed-in member, plus the tombstone that carries the week lock. */
export type TeamMembershipView = { team: TeamState; joinOrder: number } | null;

/** The commit may or may not have landed: reread the server and decide with team-state outcomes. */
export class TeamUnconfirmedError extends Error {}

/** The team changed after the confirmation dialog was opened; nothing was sent. Re-confirm on the new state. */
export class TeamChangedError extends Error {}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
}

const CLOCK_CHANGED = "共用場次或情境時間已變更，請重新載入。";

/**
 * A rejected transaction read is a precondition (the data is not available to this member), never an
 * unconfirmed write: only the commit phase may have landed, and both phases share one error code.
 */
async function readPhase<T>(read: Promise<T>, unavailable: string): Promise<T> {
  try {
    return await read;
  } catch (error) {
    if (isFirebaseError(error) && classifyTeamError(error.code, "read") === "precondition") throw new Error(unavailable);
    throw error;
  }
}

function lockMessage(reason: "sameWeek" | "noWeek", action: "建立" | "加入"): string {
  return reason === "noWeek" ? "管理者尚未設定活動週，暫時無法建立或加入隊伍。" : `本週退出後，下週才能重新${action === "建立" ? "建隊" : "加入"}。`;
}

export class TeamService {
  constructor(private readonly auth: Auth, private readonly db: Firestore) {}

  private ensureUid(session: AuthenticatedSession): void {
    if (this.auth.currentUser?.uid !== session.account.authUid) throw new Error("登入身分已變更，請重新登入。");
  }
  private memberRef(session: AuthenticatedSession) {
    return doc(this.db, "teamMembership", session.context.sessionId, "members", session.member.memberId);
  }
  private teamRef(session: AuthenticatedSession, id: string) { return doc(this.db, "teams", session.context.sessionId, "items", id); }
  private eventRef(session: AuthenticatedSession, teamId: string, revision: number) {
    return doc(this.db, "teams", session.context.sessionId, "items", teamId, "events", String(revision));
  }
  private dailyRef(session: AuthenticatedSession, memberId: string) {
    return doc(this.db, "dailySteps", session.context.sessionId, "members", memberId, "days", taskDateOf(session.context));
  }

  /** Runs a team transaction; only commit-phase failures that may have landed become TeamUnconfirmedError. */
  private async run<T>(body: Parameters<typeof runTransaction<T>>[1]): Promise<T> {
    try {
      return await runTransaction(this.db, body);
    } catch (error) {
      if (isFirebaseError(error)) {
        if (classifyTeamError(error.code, "commit") === "unconfirmed") {
          throw new TeamUnconfirmedError("結果未確認：操作可能已生效也可能沒有。已改為重新讀取伺服器狀態，請核對後再決定。");
        }
        throw new Error(`共享服務暫時無法處理這次操作（${error.code}），請重新載入後再試。`);
      }
      throw error;
    }
  }

  private assertCurrent(session: AuthenticatedSession, current: Record<string, unknown> | undefined, weekId?: string): void {
    if (!current || current.sessionId !== session.context.sessionId || current.clockVersion !== session.context.clockVersion
      || current.scenarioNow !== session.context.scenarioNow || (weekId !== undefined && current.activityWeekId !== weekId)) {
      throw new Error(weekId === undefined ? CLOCK_CHANGED : "活動週或情境時間已變更，請重新載入。");
    }
  }

  /** Server read of the member's index and (when still in a team) the team, for outcome checks and recovery. */
  async readState(session: AuthenticatedSession): Promise<{ membership: MembershipState | null; team: TeamState | null }> {
    this.ensureUid(session);
    const snap = await getDocFromServer(this.memberRef(session));
    if (!snap.exists()) return { membership: null, team: null };
    const membership = parseMembership(snap.data(), session.context.sessionId, session.member.memberId);
    if (membership.status !== "active" || !membership.teamId) return { membership, team: null };
    try {
      const teamSnap = await getDocFromServer(this.teamRef(session, membership.teamId));
      return { membership, team: teamSnap.exists() ? parseTeam(teamSnap.data(), session.context.sessionId, membership.teamId) : null };
    } catch (error) {
      if (isFirebaseError(error) && error.code === "permission-denied") return { membership, team: null };
      throw error;
    }
  }

  async readMembership(session: AuthenticatedSession): Promise<{ team: TeamState; joinOrder: number } | null> {
    const { membership, team } = await this.readState(session);
    if (!membership || membership.status !== "active" || !membership.teamId) return null;
    if (!team) throw new Error("隊伍資料尚未同步完整，請重新載入。");
    if (!team.memberIds.includes(session.member.memberId)) throw new Error("隊伍名單與成員索引不一致。");
    return { team, joinOrder: membership.joinOrder };
  }

  async createTeam(session: AuthenticatedSession): Promise<TeamState> {
    this.ensureUid(session);
    const inviteCode = randomCode();
    const teamId = inviteCode;
    const teamRef = this.teamRef(session, teamId);
    const memberRef = this.memberRef(session);
    const demoRef = doc(this.db, "demo", "current");
    return this.run(async (tx) => {
      const [demo, membership, teamCollision] = await readPhase(Promise.all([
        tx.get(demoRef), tx.get(memberRef), tx.get(teamRef),
      ]), "共享服務拒絕讀取，請重新載入或重新登入。");
      const current = demo.data();
      this.assertCurrent(session, current);
      const prior = membership.exists() ? parseMembership(membership.data(), session.context.sessionId, session.member.memberId) : null;
      if (prior?.status === "active") throw new Error("您已在一支隊伍中。");
      const lock = memberLock(prior, current?.activityWeekId as string | undefined);
      if (lock.locked && lock.reason) throw new Error(lockMessage(lock.reason, "建立"));
      if (teamCollision.exists()) throw new Error("邀請碼已被使用，請重試。");
      const team: TeamState = { sessionId: session.context.sessionId, teamId, leaderMemberId: session.member.memberId,
        memberIds: [session.member.memberId], inviteCode, status: "recruiting", clockVersion: session.context.clockVersion,
        createdAt: session.context.scenarioNow, everFormed: false, nextJoinOrder: 1, revision: 0 };
      tx.set(teamRef, team);
      tx.set(memberRef, { sessionId: session.context.sessionId, memberId: session.member.memberId, teamId, joinOrder: 0, clockVersion: session.context.clockVersion,
        status: "active", joinedAt: session.context.scenarioNow, leftTeamId: null, leftWeekId: null, leftAt: null });
      return team;
    });
  }

  async joinTeam(session: AuthenticatedSession, rawCode: string): Promise<TeamState> {
    this.ensureUid(session);
    const inviteCode = rawCode.trim().toUpperCase();
    if (!/^[A-F0-9]{16}$/.test(inviteCode)) throw new Error("邀請碼格式不正確。");
    const memberRef = this.memberRef(session);
    const demoRef = doc(this.db, "demo", "current");
    // The high-entropy invite code is also the team document ID; a code-holder
    // can perform one exact team get, without reading or enumerating code indexes.
    const teamId = inviteCode;
    const teamRef = this.teamRef(session, teamId);
    return this.run(async (tx) => {
      const [demo, membership] = await readPhase(Promise.all([tx.get(demoRef), tx.get(memberRef)]), "共享服務拒絕讀取，請重新載入或重新登入。");
      // An archived team is unreadable for non-members (Rules), which means "no longer valid", not "unconfirmed".
      const teamSnap = await readPhase(tx.get(teamRef), "此邀請碼已失效或隊伍已封存。");
      const current = demo.data();
      this.assertCurrent(session, current);
      const prior = membership.exists() ? parseMembership(membership.data(), session.context.sessionId, session.member.memberId) : null;
      if (prior?.status === "active") throw new Error("您已在一支隊伍中。");
      const lock = memberLock(prior, current?.activityWeekId as string | undefined);
      if (lock.locked && lock.reason) throw new Error(lockMessage(lock.reason, "加入"));
      if (!teamSnap.exists()) throw new Error("找不到此邀請碼。");
      const team = parseTeam(teamSnap.data(), session.context.sessionId, teamId);
      if (team.status === "archived") throw new Error("此隊伍已封存。");
      if (team.memberIds.length >= 5) throw new Error("隊伍已額滿。");
      if (team.memberIds.includes(session.member.memberId)) throw new Error("您已在此隊伍中。");
      const memberIds = [...team.memberIds, session.member.memberId];
      const next: TeamState = { ...team, memberIds, status: "active", everFormed: true,
        nextJoinOrder: team.nextJoinOrder + 1, revision: team.revision + 1, clockVersion: session.context.clockVersion };
      tx.set(teamRef, next);
      tx.set(memberRef, { sessionId: session.context.sessionId, memberId: session.member.memberId, teamId,
        joinOrder: team.nextJoinOrder, clockVersion: session.context.clockVersion, status: "active",
        joinedAt: session.context.scenarioNow, leftTeamId: null, leftWeekId: null, leftAt: null });
      tx.set(this.eventRef(session, teamId, next.revision), { sessionId: session.context.sessionId,
        teamId, revision: next.revision, type: "join", actorMemberId: session.member.memberId,
        targetMemberId: session.member.memberId, effectiveAt: session.context.scenarioNow,
        serverRecordedAt: serverTimestamp(), activityWeekId: current?.activityWeekId ?? null });
      return next;
    });
  }

  /** Cancels an unformed recruitment or leaves a formed team; `expected` is what the confirmation dialog promised. */
  async leaveTeam(session: AuthenticatedSession, expected: LeaveExpectation): Promise<void> {
    this.ensureUid(session);
    const weekId = requireActivityWeek(session.context);
    const memberRef = this.memberRef(session);
    const demoRef = doc(this.db, "demo", "current");
    await this.run(async (tx) => {
      const [demo, membership] = await readPhase(Promise.all([tx.get(demoRef), tx.get(memberRef)]), "共享服務拒絕讀取，請重新載入或重新登入。");
      this.assertCurrent(session, demo.data(), weekId);
      if (!membership.exists()) throw new Error("目前沒有隊伍。");
      const own = parseMembership(membership.data(), session.context.sessionId, session.member.memberId);
      if (own.status !== "active" || !own.teamId) throw new Error("您已退出隊伍。");
      const teamRef = this.teamRef(session, own.teamId);
      const teamSnap = await readPhase(tx.get(teamRef), "找不到原隊伍或已無權限讀取，請重新載入。");
      if (!teamSnap.exists()) throw new Error("找不到原隊伍，請重新載入。");
      const team = parseTeam(teamSnap.data(), session.context.sessionId, own.teamId);
      if (!team.memberIds.includes(session.member.memberId)) throw new Error("隊伍名單與成員索引不一致。");
      // The mode (cancel vs leave, i.e. week lock) must be the one the member confirmed.
      if (!matchesLeaveExpectation(team, expected)) throw new TeamChangedError("隊伍剛有變動，請重新確認。");
      const memberIds = team.memberIds.filter((id) => id !== session.member.memberId);
      const wasFormed = team.everFormed;
      const next: TeamState = { ...team, memberIds, leaderMemberId: memberIds.length === 0 ? null
        : team.leaderMemberId === session.member.memberId ? memberIds[0] : team.leaderMemberId,
        status: memberIds.length === 0 ? "archived" : memberIds.length === 1 ? (wasFormed ? "paused" : "recruiting") : "active",
        revision: team.revision + 1, clockVersion: session.context.clockVersion };
      tx.set(teamRef, next);
      tx.set(memberRef, { sessionId: session.context.sessionId, memberId: session.member.memberId,
        teamId: null, joinOrder: own.joinOrder, clockVersion: session.context.clockVersion, status: "left",
        joinedAt: own.joinedAt, leftTeamId: own.teamId, leftWeekId: wasFormed ? weekId : null,
        leftAt: session.context.scenarioNow });
      tx.set(this.eventRef(session, own.teamId, next.revision), { sessionId: session.context.sessionId,
        teamId: own.teamId, revision: next.revision, type: wasFormed ? "leave" : "cancelRecruiting",
        actorMemberId: session.member.memberId, targetMemberId: session.member.memberId,
        effectiveAt: session.context.scenarioNow, serverRecordedAt: serverTimestamp(), activityWeekId: weekId });
    });
  }

  async transferCaptain(session: AuthenticatedSession, targetMemberId: string, expected: TransferExpectation): Promise<void> {
    this.ensureUid(session);
    const weekId = requireActivityWeek(session.context);
    const memberRef = this.memberRef(session);
    const demoRef = doc(this.db, "demo", "current");
    await this.run(async (tx) => {
      const [demo, membership] = await readPhase(Promise.all([tx.get(demoRef), tx.get(memberRef)]), "共享服務拒絕讀取，請重新載入或重新登入。");
      this.assertCurrent(session, demo.data(), weekId);
      if (!membership.exists()) throw new Error("目前沒有隊伍。");
      const own = parseMembership(membership.data(), session.context.sessionId, session.member.memberId);
      if (own.status !== "active" || !own.teamId) throw new Error("您已退出隊伍。");
      const teamRef = this.teamRef(session, own.teamId);
      const snap = await readPhase(tx.get(teamRef), "找不到原隊伍或已無權限讀取，請重新載入。");
      if (!snap.exists()) throw new Error("找不到隊伍。");
      const team = parseTeam(snap.data(), session.context.sessionId, own.teamId);
      if (team.leaderMemberId !== session.member.memberId) throw new Error("只有現任隊長可轉讓。");
      if (targetMemberId === session.member.memberId || !team.memberIds.includes(targetMemberId)) throw new Error("請選擇現有其他隊員。");
      if (!matchesTransferExpectation(team, expected)) throw new TeamChangedError("隊伍剛有變動，請重新確認。");
      const revision = team.revision + 1;
      tx.set(teamRef, { ...team, leaderMemberId: targetMemberId, revision, clockVersion: session.context.clockVersion });
      tx.set(this.eventRef(session, own.teamId, revision), { sessionId: session.context.sessionId,
        teamId: own.teamId, revision, type: "transferCaptain", actorMemberId: session.member.memberId,
        targetMemberId, effectiveAt: session.context.scenarioNow, serverRecordedAt: serverTimestamp(), activityWeekId: weekId });
    });
  }

  /**
   * `onState(view, confirmed, tombstone)`: `confirmed` only for non-cache, non-pending server snapshots;
   * `tombstone` is the member's own `left` index (carries the week lock) and is null whenever unconfirmed.
   * Parse failures go to `onError` (never an uncaught exception).
   */
  subscribeMembership(session: AuthenticatedSession, onState: (view: TeamMembershipView, confirmed: boolean, tombstone: MembershipState | null) => void, onError: (error: Error) => void): Unsubscribe {
    this.ensureUid(session);
    let stopTeam: Unsubscribe | undefined;
    let closed = false;
    const stopMembership = onSnapshot(this.memberRef(session), { includeMetadataChanges: true }, (membership) => {
      if (closed) return;
      stopTeam?.();
      stopTeam = undefined;
      if (membership.metadata.fromCache || membership.metadata.hasPendingWrites) { onState(null, false, null); return; }
      if (!membership.exists()) { onState(null, true, null); return; }
      let index: MembershipState;
      try { index = parseMembership(membership.data(), session.context.sessionId, session.member.memberId); }
      catch (error) { onError(error as Error); return; }
      if (index.status === "left" || !index.teamId) { onState(null, true, index); return; }
      const teamId = index.teamId;
      stopTeam = onSnapshot(this.teamRef(session, teamId), { includeMetadataChanges: true }, (teamSnap) => {
        if (closed) return;
        if (teamSnap.metadata.fromCache || teamSnap.metadata.hasPendingWrites || !teamSnap.exists()) { onState(null, false, null); return; }
        try {
          const team = parseTeam(teamSnap.data(), session.context.sessionId, teamId);
          if (!team.memberIds.includes(session.member.memberId)) throw new Error("隊伍名單與成員索引不一致。");
          onState({ team, joinOrder: index.joinOrder }, true, null);
        } catch (error) { onError(error as Error); }
      }, onError);
    }, (error) => { if (!closed) { stopTeam?.(); onError(error); } });
    return () => { closed = true; stopMembership(); stopTeam?.(); stopTeam = undefined; };
  }

  subscribeRoster(session: AuthenticatedSession, team: TeamState, onState: (entries: TeamRosterEntry[], confirmed: boolean) => void, onError: (error: Error) => void): Unsubscribe {
    this.ensureUid(session);
    const stops: Unsubscribe[] = [];
    const entries = new Map<string, TeamRosterEntry>();
    let closed = false;
    for (const memberId of team.memberIds) {
      const memberSession = { ...session, member: { ...session.member, memberId } };
      stops.push(onSnapshot(this.dailyRef(session, memberId), { includeMetadataChanges: true }, (snap) => {
        if (closed) return;
        if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) {
          entries.set(memberId, { memberId, daily: emptyDaily(memberSession), exists: snap.exists(), pending: snap.metadata.hasPendingWrites, fromCache: snap.metadata.fromCache });
        } else {
          try {
            entries.set(memberId, { memberId, daily: snap.exists() ? parseDaily(snap.data(), emptyDaily(memberSession)) : emptyDaily(memberSession), exists: snap.exists(), pending: false, fromCache: false });
          } catch (error) { onError(error as Error); return; }
        }
        const confirmed = entries.size === team.memberIds.length && [...entries.values()].every((entry) => !entry.pending && !entry.fromCache);
        onState(team.memberIds.map((id) => entries.get(id)).filter((entry): entry is TeamRosterEntry => !!entry), confirmed);
      }, onError));
    }
    return () => { closed = true; stops.forEach((stop) => stop()); };
  }
}
