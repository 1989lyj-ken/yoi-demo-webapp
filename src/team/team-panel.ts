import type { AuthenticatedSession } from "../identity/contracts";
import type { MemberNames } from "../identity/member-names";
import type { TeamSummary } from "../app/shell-state";
import { teamDialogView, teamEmptyView, teamRenameDialogView, teamTitleOf, teamView, type TeamDialogInput } from "../ui/views";
import { checkTeamName, pickTeamTitle, TEAM_NAME_HINTS, TEAM_NAME_MAX, teamNameUnits } from "./team-name";
import type { TeamNameService } from "./team-name-service";
import { isFirebaseError } from "../firebase/error-kind";
import { TeamChangedError, TeamFormatError, TeamUnconfirmedError, type TeamRosterEntry, type TeamService } from "./team-service";
import { taskDateOf } from "../daily/daily-service";
import { showToast } from "../app/toast";
import { visibleWeeks, type ContribService, type CreditResult } from "./contrib-service";
import { compareMoments, ContribFormatError, entryIdOf, replayTeamWeek, showPreviousWeek, TEAM_WEEK_TARGET, type ContribEntry } from "./contrib-state";
import type { WeekResultService } from "./week-result-service";
import { WeekSettler } from "./week-settler";
import { daysLeftInWeek, type ChestTeamContext } from "../rewards/chest-stage";
import { dailyNeed, ownAwardStatus, WeekResultFormatError, type ChestAward, type WeekResult } from "./week-result-state";

/** One visible week's result and awards (FSD-03C-2), with its single-flight settler. */
interface WeekSlot { record: WeekResult | null; recordConfirmed: boolean; awards: ChestAward[]; awardsConfirmed: boolean; settler: WeekSettler; stop: () => void }
import {
  joinOutcome, leaveDialogCopy, leaveExpectation, leaveOutcome, matchesLeaveExpectation, matchesTransferExpectation,
  teamControls, transferConfirmCopy, transferExpectation, transferOutcome, transferPickCopy,
  type LeaveExpectation, type MembershipState, type TeamState, type TransferExpectation,
} from "./team-state";

export interface TeamPanel {
  stop(): void;
  closeDialog(silent?: boolean): void;
  isDialogOpen(): boolean;
  /** FSD-03C-1: a new own step/ride event was confirmed; credit it to the team (never blocks personal steps). */
  onOwnEvent(taskDate: string, seq: number): void;
  /** Credit any own events of today/yesterday that are still missing (e.g. after an unconfirmed daily write). */
  reconcileContrib(): void;
  /** Re-renders after something outside changed (FSD-06A M2: today's daily document was confirmed). */
  refresh(): void;
  /** FSD-08A-1 M1: read-only summary for the invite page's card (never used for decisions). */
  teamSummary(): TeamSummary;
  /** FSD-08A-6: what the chest card needs about this week (display only; null while the team is unknown). */
  chestContext(): ChestTeamContext | null;
}

type DialogState =
  | { kind: "leave"; trigger: string; expected: LeaveExpectation; notice: string | null; busy: boolean }
  | { kind: "transfer"; trigger: string; step: "pick"; chosen: string | null; notice: string | null; busy: boolean }
  | { kind: "transfer"; trigger: string; step: "confirm"; target: string; expected: TransferExpectation; notice: string | null; busy: boolean }
  /** FSD-03E: the draft lives here so a re-render never clears what the captain typed. */
  | { kind: "rename"; trigger: string; draft: string; notice: string | null; busy: boolean }
  /** UX-1010 F10: 組建隊伍 asks first; nothing is written until 建立隊伍. */
  | { kind: "create"; trigger: string; notice: string | null; busy: boolean };

type DialogKind = DialogState["kind"];

const CHANGED_NOTICE = "隊伍剛有變動，上方文字已更新，請重新確認。";

/**
 * The team block of the shared screen (FSD-03B-UI): subscriptions, the create/join/leave/transfer
 * actions and the two-step confirmation dialog. Only server-confirmed snapshots enable anything; the
 * Rules stay the guarantee, this is UX. `onDialogClosed` lets the page show a postponed yesterday prompt.
 */
export function mountTeamPanel(session: AuthenticatedSession, service: TeamService, app: HTMLElement,
  hooks: { isStale(): boolean; onDialogClosed(): void; todayReady(): boolean; onRendered?(): void; ownChest?(weekId: string): "unopened" | "opened" | null }, contrib: ContribService, weekResults: WeekResultService, names: MemberNames,
  teamNames: TeamNameService): TeamPanel {
  const status = document.querySelector<HTMLElement>("#team-status")!;
  const errorBox = document.querySelector<HTMLElement>("#team-error")!;
  const content = document.querySelector<HTMLElement>("#team-content")!;
  const selfId = session.member.memberId;
  const state = {
    team: null as TeamState | null, tombstone: null as MembershipState | null, confirmed: false, busy: false,
    entries: [] as TeamRosterEntry[], rosterConfirmed: false, rosterKey: "", rosterFailed: false, rereading: false, rereadKey: null as string | null, generation: 0,
    dialog: null as DialogState | null,
    contribEntries: [] as ContribEntry[], contribConfirmed: false, contribKey: "", contribFailed: false, contribRetryGeneration: -1,
    /** Own entries whose last attempt was unconfirmed; cleared by any other result or by the ledger. */
    pendingIds: new Set<string>(), reconcileFailed: false,
    /** Ledger key (team + formed) already reconciled on this page; a newly formed or joined team reconciles again. */
    reconciledKey: "", leftReconciled: false,
    /** The viewer's own awards of the visible weeks while not in a team (read by own path). */
    ownAwardNotes: [] as string[],
    /** FSD-03E: the last server-confirmed name of a team (kept while unconfirmed; another team never shows it). */
    teamName: null as { teamId: string; name: string | null } | null, nameKey: "", nameFailed: false, nameRetryGeneration: -1,
    /** The current subscription has delivered a confirmed snapshot (QA S4: editing waits for it). */
    nameConfirmed: false,
  };
  let stopName: (() => void) | undefined;
  const weekSlots = new Map<string, WeekSlot>();
  let weekKey = "";
  let weekRetryGeneration = -1;
  let stopContrib: (() => void) | undefined;
  const weeks = visibleWeeks(taskDateOf(session.context));
  const weekIds = weeks.previous ? [weeks.current, weeks.previous] : [weeks.current];
  let stopMembership: (() => void) | undefined;
  let stopRoster: (() => void) | undefined;
  let dialogEl: HTMLElement | null = null;
  let removeKeys: (() => void) | undefined;

  // FSD-06A M2: creating or joining waits for today's confirmed daily document, so every team week is
  // at or after the member's earliest daily document (the rewards panel looks for chests from there).
  const controls = () => {
    const c = teamControls({ confirmed: state.confirmed, busy: state.busy, selfId, context: session.context, team: state.team, tombstone: state.tombstone });
    return c.canCreateJoin && !hooks.todayReady() ? { ...c, canCreateJoin: false, notice: c.notice ?? "今日步數同步中，完成後即可建立或加入隊伍。" } : c;
  };

  function showError(message: string) { errorBox.textContent = message; errorBox.hidden = false; }
  function clearError() { errorBox.hidden = true; }
  /** Our own errors carry Chinese messages; anything from the SDK gets a fixed text (never SDK internals). */
  function errorText(error: unknown, fallback: string): string {
    return error instanceof Error && !isFirebaseError(error) ? error.message : fallback;
  }

  /** FSD-AC1 R3: own name from the verified mapping, teammates' from memberProfiles, else the memberId. */
  const nameOf = (memberId: string) => memberId === selfId ? session.member.displayName : names.label(memberId);
  function onNames() {
    if (hooks.isStale() || !state.team) return;
    render();
    // QA S1: the rename dialog does not use teammates' names; re-rendering it would break an input method mid-word.
    if (state.dialog?.kind !== "rename") renderDialog(true);
  }

  /** FSD-03E: only the current captain of a confirmed team that is not archived (the Rules decide; this is UX). */
  // QA S4: also only once this team's name is confirmed, so the captain never overwrites a name not yet seen.
  const canRename = () => state.confirmed && !state.busy && !!state.team && state.team.leaderMemberId === selfId && state.team.status !== "archived"
    && state.nameConfirmed && state.teamName?.teamId === state.team.teamId;

  /** FSD-03E C4: one name subscription per team; a dead one resubscribes once per membership snapshot; failures stay silent. */
  function ensureName(team: TeamState) {
    const key = `${session.context.sessionId}|${team.teamId}`;
    if (key === state.nameKey && !state.nameFailed) return;
    stopName?.();
    state.nameKey = key;
    state.nameFailed = false;
    state.nameConfirmed = false;
    stopName = teamNames.subscribe(session, team.teamId, (name) => {
      if (hooks.isStale()) return;
      state.teamName = { teamId: team.teamId, name };
      state.nameConfirmed = true;
      render();
    }, () => {
      if (hooks.isStale()) return;
      state.nameFailed = true;
      state.nameConfirmed = false;
      render();
      if (state.team && state.nameRetryGeneration !== state.generation) {
        state.nameRetryGeneration = state.generation;
        ensureName(state.team);
      }
    });
  }

  function clearName() {
    stopName?.(); stopName = undefined;
    state.nameKey = ""; state.nameFailed = false; state.nameConfirmed = false;
  }

  /** FSD-08A-3 C5: the banner title (a teammate's name only once confirmed). */
  const teamTitle = (leaderId: string | null) => teamTitleOf(leaderId, selfId, session.member.displayName, (id) => names.name(id));

  function render() {
    const c = controls();
    const team = state.team;
    if (!team) {
      content.innerHTML = teamEmptyView(c.canCreateJoin, c.notice, state.ownAwardNotes);
    } else {
      const week = weekInput(team);
      names.request([...team.memberIds, ...week.pastMembers].filter((id) => id !== selfId), state.rosterKey, onNames);
      content.innerHTML = teamView(
        { status: team.status, memberCount: team.memberIds.length, inviteCode: team.inviteCode, leaderMemberId: team.leaderMemberId,
          title: pickTeamTitle(state.teamName, team.teamId, teamTitle(team.leaderMemberId)), canRename: canRename() },
        state.entries.map((entry) => ({ memberId: entry.memberId, exists: entry.exists, pending: entry.pending, fromCache: entry.fromCache,
          rawSteps: entry.daily.rawSteps, effectiveSteps: entry.daily.effectiveSteps, rideCompleted: entry.daily.rideCompletedAt !== null })),
        state.rosterConfirmed,
        { canLeave: c.canLeave, canTransfer: c.canTransfer, leaveMode: c.leaveMode, notice: c.notice },
        week, nameOf, selfId,
      );
    }
    hooks.onRendered?.();
  }

  /** The official result of a week as the progress block shows it (only from confirmed snapshots). */
  function weekOutcome(weekId: string) {
    const slot = weekSlots.get(weekId);
    const replay = replayTeamWeek(state.contribEntries, weekId);
    const ok = !!slot && slot.recordConfirmed && slot.awardsConfirmed;
    const record = ok ? slot.record : null;
    return {
      official: record ? { firstAt: record.first.at, advancedAt: compareMoments(record.current, record.first) < 0 ? record.current.at : null, awardCount: slot!.awards.length } : null,
      settling: (replay.reachedAt !== null && !record) || !!slot?.settler.pending,
      // Eligibility is used only for the record revision it was computed for; an award found in another
      // team (each member has one per week) also counts as already awarded.
      own: ok ? ownAwardStatus(selfId, record, new Set([...slot.awards.map((a) => a.memberId), ...slot.settler.existing]),
        record && slot.settler.eligibleFor === record.revision ? slot.settler.eligible : null) : null,
    };
  }

  /** Replays the subscribed ledger into the progress block; the official result comes from 03C-2. */
  function weekInput(team: TeamState) {
    const current = replayTeamWeek(state.contribEntries, weeks.current);
    const contributions: Record<string, number> = Object.create(null);
    for (const m of current.members) contributions[m.memberId] = m.contribution;
    // 2026-10-06 (2): today's team-counted steps per member (after forming; personal steps stay on the steps page).
    const todayDate = taskDateOf(session.context);
    const todayContributions: Record<string, number> = Object.create(null);
    for (const id of team.memberIds) todayContributions[id] = current.memberDays[`${id}|${todayDate}`] ?? 0;
    return {
      total: current.total, target: TEAM_WEEK_TARGET, reachedAt: current.reachedAt,
      confirmed: state.contribConfirmed, pending: state.pendingIds.size > 0 || state.reconcileFailed, contributions, todayContributions,
      // A departed member shows only with a contribution (a ride-only entry adds nothing on its own).
      pastMembers: Object.keys(contributions).filter((id) => !team.memberIds.includes(id) && contributions[id] > 0).sort(),
      previous: previousWeekInput(team),
      ...weekOutcome(weeks.current),
      need: state.contribConfirmed ? dailyNeed(current.total, TEAM_WEEK_TARGET, taskDateOf(session.context), weeks.current, team.memberIds.length, team.status) : null,
      // FSD-08A-6: "再邀 1 人" — the same need with one more member (only below five).
      needPlusOne: state.contribConfirmed && team.memberIds.length < 5 ? dailyNeed(current.total, TEAM_WEEK_TARGET, taskDateOf(session.context), weeks.current, team.memberIds.length + 1, team.status) : null,
      daysLeft: daysLeftInWeek(weeks.current, taskDateOf(session.context)),
      chest: hooks.ownChest?.(weeks.current) ?? null,
    };
  }

  /**
   * The previous week (Mondays only). FSD-AC1 R5: hidden for a team created this week that has nothing
   * for last week; only the display changes, the previous week's subscriptions and settler keep running.
   */
  function previousWeekInput(team: TeamState) {
    if (!weeks.previous) return null;
    const replay = replayTeamWeek(state.contribEntries, weeks.previous);
    const outcome = weekOutcome(weeks.previous);
    if (!showPreviousWeek(team.createdAt, weeks.current, replay.total, outcome.official !== null)) return null;
    return { total: replay.total, reachedAt: replay.reachedAt, ...outcome };
  }

  // ----- Week results and chest awards (FSD-03C-2) -----

  function ensureWeeks(team: TeamState) {
    if (team.teamId === weekKey) return;
    clearWeeks();
    weekKey = team.teamId;
    for (const weekId of weekIds) {
      const slot: WeekSlot = { record: null, recordConfirmed: false, awards: [], awardsConfirmed: false, stop: () => undefined,
        settler: new WeekSettler(weekResults.portFor(session), () => { if (slot.settler.formatError) showError(slot.settler.formatError); render(); }) };
      // A failed listener is dead: mark the team key stale so the next membership snapshot resubscribes.
      const failed = (error: Error) => {
        if (hooks.isStale()) return;
        weekKey = "";
        if (error instanceof WeekResultFormatError) { showError(error.message); render(); return; }
        // Resubscribe once per membership snapshot (as the ledger does), so a dead listener cannot freeze the result.
        if (state.team && weekRetryGeneration !== state.generation) { weekRetryGeneration = state.generation; ensureWeeks(state.team); }
        render();
      };
      const stopRecord = weekResults.subscribeWeek(session, team.teamId, weekId, (record, confirmed) => {
        slot.record = record; slot.recordConfirmed = confirmed; offerWeek(weekId); render();
      }, (error) => { slot.recordConfirmed = false; failed(error); });
      const stopAwards = weekResults.subscribeAwards(session, team.teamId, weekId, (awards, confirmed) => {
        slot.awards = awards; slot.awardsConfirmed = confirmed; offerWeek(weekId); render(); syncDialog();
      }, (error) => { slot.awardsConfirmed = false; failed(error); });
      slot.stop = () => { stopRecord(); stopAwards(); slot.settler.cancel(); };
      weekSlots.set(weekId, slot);
    }
  }

  function clearWeeks() {
    for (const slot of weekSlots.values()) slot.stop();
    weekSlots.clear();
    weekKey = "";
  }

  /** Hands the latest confirmed inputs of a week to its settler (which ignores unconfirmed ones). */
  function offerWeek(weekId: string) {
    const slot = weekSlots.get(weekId);
    const team = state.team;
    if (!slot || !team || hooks.isStale()) return;
    slot.settler.offer({ teamId: team.teamId, teamRevision: team.revision, weekId, reaching: replayTeamWeek(state.contribEntries, weekId).reaching, record: slot.record,
      awarded: new Set(slot.awards.map((a) => a.memberId)), confirmed: state.contribConfirmed && slot.recordConfirmed && slot.awardsConfirmed });
  }

  /** While not in a team, the viewer's own awards of the visible weeks (own path; also after leaving). */
  async function loadOwnAwards() {
    const generation = state.generation;
    const notes: string[] = [];
    for (const weekId of weekIds) {
      try {
        if (await weekResults.ownAward(session, weekId)) notes.push(`您已取得${weekId === weeks.current ? "本週" : "上週"}寶箱資格，可到獎勵頁開箱。`);
      } catch { /* not shown: only a confirmed award is ever displayed */ }
    }
    if (generation !== state.generation || hooks.isStale()) return;
    state.ownAwardNotes = notes;
    render();
  }

  // ----- Contribution ledger (FSD-03C-1) -----

  function ensureContrib(team: TeamState) {
    const key = team.teamId;
    // A listener that already errored is dead: the same team must resubscribe, not be skipped.
    if (key === state.contribKey && !state.contribFailed) return;
    stopContrib?.();
    state.contribKey = key;
    state.contribFailed = false;
    state.contribEntries = [];
    state.contribConfirmed = false;
    stopContrib = contrib.subscribeWeeks(session, team.teamId, weeks.previous ? [weeks.current, weeks.previous] : [weeks.current], (entries, confirmed) => {
      state.contribEntries = entries;
      state.contribConfirmed = confirmed;
      const ids = new Set(entries.map((e) => entryIdOf(e.memberId, e.taskDate, e.seq)));
      for (const id of state.pendingIds) if (ids.has(id)) state.pendingIds.delete(id); // The ledger shows it landed.
      maybeReconcile();
      for (const weekId of weekIds) offerWeek(weekId);
      render();
    }, (error) => {
      if (hooks.isStale()) return;
      state.contribConfirmed = false;
      state.contribFailed = true;
      if (error instanceof ContribFormatError) { showError(error.message); render(); return; }
      // Leaving or switching teams also fails the listener (the membership snapshot then clears it); otherwise
      // resubscribe once per membership snapshot, so a dead listener cannot freeze progress on "同步中".
      if (state.team && state.contribRetryGeneration !== state.generation) {
        state.contribRetryGeneration = state.generation;
        ensureContrib(state.team);
      }
      render();
    });
  }

  function clearContrib() {
    stopContrib?.(); stopContrib = undefined;
    state.contribKey = ""; state.contribFailed = false; state.contribEntries = []; state.contribConfirmed = false;
    state.reconciledKey = "";
    clearWeeks();
    clearName();
  }

  /**
   * After the first server-confirmed ledger of a team, and again once that team forms (a ride from the
   * recruiting days becomes creditable then; formation brings no new ledger snapshot): credit missing events.
   */
  function maybeReconcile() {
    const team = state.team;
    if (!team || !state.contribConfirmed || state.contribKey !== team.teamId) return;
    const key = `${team.teamId}|${team.everFormed}`;
    if (key === state.reconciledKey) return;
    state.reconciledKey = key;
    runReconcile(new Set(state.contribEntries.map((e) => entryIdOf(e.memberId, e.taskDate, e.seq))), null);
  }

  function applyCredit(entryId: string, result: CreditResult) {
    if (result === "unconfirmed") state.pendingIds.add(entryId);
    else state.pendingIds.delete(entryId);
  }

  function runReconcile(credited: Set<string> | null, ownTeamId: string | null) {
    if (hooks.isStale()) return;
    contrib.reconcile(session, credited, ownTeamId)
      .then((results) => { state.reconcileFailed = false; for (const [id, result] of results) applyCredit(id, result); render(); })
      .catch(() => {
        state.reconcileFailed = true;
        if (ownTeamId) state.leftReconciled = false; else state.reconciledKey = "";
        render();
      });
  }

  // ----- Roster -----

  function ensureRoster(team: TeamState) {
    const key = `${team.teamId}|${team.memberIds.join(",")}`;
    // A listener that already errored is dead: the same member list must resubscribe, not be skipped.
    if (key === state.rosterKey && !state.rosterFailed) return;
    stopRoster?.();
    state.rosterKey = key;
    state.rosterFailed = false;
    state.entries = [];
    state.rosterConfirmed = false;
    status.textContent = "隊伍已由伺服器確認；讀取今日隊員狀態…";
    stopRoster = service.subscribeRoster(session, team, (entries, confirmed) => {
      state.entries = entries;
      state.rosterConfirmed = confirmed;
      if (confirmed) status.textContent = ""; // FSD-08A-5 2: no message once confirmed
      render();
    }, () => { state.rosterFailed = true; void recoverRoster(); });
  }

  function clearRoster() {
    stopRoster?.(); stopRoster = undefined;
    state.rosterKey = ""; state.rosterFailed = false; state.entries = []; state.rosterConfirmed = false;
  }

  /** A rejected roster read is not a sync failure by itself (a teammate may have just left, or I did): reread once per revision. */
  async function recoverRoster() {
    if (hooks.isStale() || !state.team || state.rereading) return; // Single flight: other errors of the same moment wait for it.
    const key = `${state.team.teamId}:${state.team.revision}`;
    const syncError = () => {
      state.rosterConfirmed = false;
      showError("無法讀取同隊今日資料；請檢查連線或重新登入。");
      status.textContent = "團隊同步中斷，未確認資料不會標記為已同步。";
      render();
    };
    if (state.rereadKey === key) { syncError(); return; }
    state.rereadKey = key;
    state.rereading = true;
    const generation = state.generation;
    try {
      const fresh = await service.readState(session);
      if (generation !== state.generation || hooks.isStale()) return;
      if (!fresh.membership || fresh.membership.status !== "active" || !fresh.team) {
        // No longer in the team: the membership snapshot is about to say so; do not show a sync error.
        state.rosterConfirmed = false;
        status.textContent = "正在更新隊伍狀態…";
        render();
        return;
      }
      if (state.team && fresh.team.revision < state.team.revision) return; // Older than what the page already shows.
      if (!state.team || fresh.team.memberIds.join("|") !== state.team.memberIds.join("|")) {
        state.team = fresh.team;
        ensureRoster(fresh.team);
        render();
        syncDialog();
        return;
      }
      syncError();
    } catch { if (generation === state.generation && !hooks.isStale()) syncError(); }
    finally { state.rereading = false; }
  }

  // ----- Membership snapshots -----

  function applyMembership(view: { team: TeamState } | null, confirmed: boolean, tombstone: MembershipState | null) {
    state.generation += 1;
    state.rereadKey = null;
    state.confirmed = confirmed;
    clearError();
    if (!confirmed) {
      clearRoster();
      clearContrib();
      state.team = null; state.tombstone = null;
      status.textContent = "隊伍資料未從伺服器確認；操作暫停。";
    } else if (!view) {
      clearRoster();
      clearContrib();
      state.team = null; state.tombstone = tombstone;
      // A departed member may still credit fragments from before leaving (once per page; ruling N1 (c)).
      if (tombstone?.leftTeamId && !state.leftReconciled) { state.leftReconciled = true; runReconcile(null, tombstone.leftTeamId); }
      status.textContent = ""; // 2026-10-06: the empty-team card says it; no extra confirmation line
      void loadOwnAwards();
    } else {
      state.team = view.team; state.tombstone = null;
      ensureRoster(view.team);
      ensureContrib(view.team);
      ensureWeeks(view.team);
      ensureName(view.team);
      maybeReconcile();
      state.ownAwardNotes = [];
      status.textContent = state.rosterConfirmed ? "" : "隊伍已確認；今日隊員資料同步中…";
    }
    render();
    syncDialog();
  }

  // ----- Create / join -----

  async function mutate(action: "create" | "join", invite = "") {
    if (!controls().canCreateJoin) return;
    state.busy = true;
    clearError();
    status.textContent = action === "create" ? "正在原子建立隊伍…" : "正在確認邀請碼並加入…";
    render();
    try {
      if (action === "create") await service.createTeam(session);
      else await service.joinTeam(session, invite);
      status.textContent = "寫入完成；等待伺服器隊伍快照確認。";
      // UX-1010 F8: steps walked before joining never count for the team; say so the moment it happens.
      if (action === "join") showToast("加入了！從現在開始走的步數會算進團隊");
    } catch (error) {
      showError(errorText(error, "隊伍操作失敗，請確認連線後再試。"));
      if (error instanceof TeamUnconfirmedError) await rereadAfterUnconfirmed((membership) => {
        if (action === "create") return membership?.status === "active" ? "effective" : "not-effective";
        return joinOutcome(membership, invite.trim().toUpperCase());
      }, action === "create" ? "建立隊伍" : "加入隊伍");
      else status.textContent = "未送出；請依提示修正後再試。";
    } finally { state.busy = false; render(); }
  }

  /** After an unconfirmed commit: reread the server, say what is true, and never resend on its own. */
  async function rereadAfterUnconfirmed(decide: (membership: MembershipState | null, team: TeamState | null) => "effective" | "not-effective" | "changed", label: string) {
    status.textContent = "結果未確認；正在重新讀取伺服器狀態，請勿視為已完成。";
    try {
      const { membership, team } = await service.readState(session);
      const outcome = decide(membership, team);
      clearError();
      if (outcome === "effective") status.textContent = `已確認：${label}已生效。`;
      else if (outcome === "changed") status.textContent = "隊伍狀態已有變動，畫面已更新；請核對後再決定是否操作。";
      else status.textContent = `已確認：${label}未送達，隊伍沒有變動。如要繼續，請重新操作並確認。`;
    } catch { status.textContent = "結果未確認且無法重新讀取；請勿重送，等待連線恢復。"; }
  }

  // ----- Confirmation dialog -----

  function inputFor(dialog: Exclude<DialogState, { kind: "rename" }>): TeamDialogInput {
    if (dialog.kind === "create") {
      return { title: "建立一支新隊伍？", body: "建立後可以邀請朋友加入，2 個人就成團。隊名之後可以改", dismissLabel: "先不要", confirmLabel: "建立隊伍", notice: dialog.notice, busy: dialog.busy };
    }
    const team = state.team!;
    if (dialog.kind === "leave") {
      const slot = weekSlots.get(weeks.current);
      const hasAward = !!slot && slot.awardsConfirmed && slot.awards.some((a) => a.memberId === selfId);
      return { ...leaveDialogCopy(team, selfId, session.context, hasAward, (id) => (id === selfId ? session.member.displayName : names.name(id))), notice: dialog.notice, busy: dialog.busy };
    }
    if (dialog.step === "pick") {
      return { ...transferPickCopy(), notice: dialog.notice, busy: dialog.busy,
        choices: team.memberIds.filter((id) => id !== selfId).map((memberId) => ({ memberId, label: nameOf(memberId), checked: memberId === dialog.chosen })) };
    }
    return { ...transferConfirmCopy(nameOf(dialog.target)), notice: dialog.notice, busy: dialog.busy };
  }

  /** `safeFocus`: put focus on the left (dismiss) button after a step switch or a changed text, never on the verb button. */
  function renderDialog(safeFocus = false) {
    if (!dialogEl || !state.dialog || (!state.team && state.dialog.kind !== "create")) return;
    const hadFocus = dialogEl.contains(document.activeElement) ? (document.activeElement as HTMLElement).id : "";
    if (state.dialog.kind === "rename") { renderRename(state.dialog, hadFocus); return; }
    dialogEl.innerHTML = teamDialogView(inputFor(state.dialog));
    const keep = !safeFocus && hadFocus ? dialogEl.querySelector<HTMLElement>(`#${CSS.escape(hadFocus)}`) : null;
    (keep ?? dialogEl.querySelector<HTMLElement>("#team-dialog-dismiss"))?.focus();
  }

  /** FSD-03E: the rename dialog; the draft goes in as input.value (never an attribute), focus stays in the field. */
  function renderRename(dialog: Extract<DialogState, { kind: "rename" }>, hadFocus: string) {
    if (!dialogEl) return;
    dialogEl.innerHTML = teamRenameDialogView({ units: teamNameUnits(dialog.draft), max: TEAM_NAME_MAX, hints: TEAM_NAME_HINTS, busy: dialog.busy, notice: dialog.notice });
    const input = dialogEl.querySelector<HTMLInputElement>("#team-rename-input")!;
    input.value = dialog.draft;
    const target = hadFocus && hadFocus !== "team-rename-input" ? dialogEl.querySelector<HTMLElement>(`#${CSS.escape(hadFocus)}:not([disabled])`) : null;
    if (target) target.focus();
    else if (!dialog.busy) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  }

  /** FSD-03E: typing only updates the counter, the save button and the status line (no re-render, so no lost caret). */
  function updateRenameCounter(dialog: Extract<DialogState, { kind: "rename" }>) {
    if (!dialogEl) return;
    const units = teamNameUnits(dialog.draft);
    const count = dialogEl.querySelector<HTMLElement>("#team-rename-count");
    if (count) { count.textContent = `${units}／${TEAM_NAME_MAX}`; count.classList.toggle("over", units > TEAM_NAME_MAX); }
    const save = dialogEl.querySelector<HTMLButtonElement>("#team-dialog-confirm");
    if (save) save.disabled = dialog.busy || units > TEAM_NAME_MAX;
    const status = dialogEl.querySelector<HTMLElement>("#team-dialog-status");
    if (status && dialog.notice !== null) { dialog.notice = null; status.textContent = ""; }
  }

  function openDialog(kind: DialogKind, trigger: string) {
    const c = controls();
    const team = state.team;
    if (state.dialog || (!team && kind !== "create") || hooks.isStale() || document.querySelector("#yesterday-prompt, .stale-overlay, #chest-overlay, #drawer, #notices, #guide, #weather-dialog, #steps-sheet:not([hidden])")) return;
    if (kind === "create" ? !c.canCreateJoin : kind === "leave" ? !c.canLeave : kind === "transfer" ? !c.canTransfer : !canRename()) return;
    state.dialog = kind === "create" ? { kind: "create", trigger, notice: null, busy: false }
      : kind === "leave" ? { kind: "leave", trigger, expected: leaveExpectation(team!), notice: null, busy: false }
      : kind === "transfer" ? { kind: "transfer", trigger, step: "pick", chosen: null, notice: null, busy: false }
      : { kind: "rename", trigger, draft: pickTeamTitle(state.teamName, team!.teamId, ""), notice: null, busy: false };
    dialogEl = document.createElement("div");
    dialogEl.id = "team-dialog";
    dialogEl.className = "confirm-scrim";
    document.body.append(dialogEl);
    app.inert = true;
    const onKey = (event: KeyboardEvent) => {
      if (!dialogEl) return;
      // QA S2: Escape that cancels an input method's composition must not close the dialog (and drop the draft).
      if (event.key === "Escape" && (event.isComposing || event.keyCode === 229)) return;
      if (event.key === "Escape" && !state.dialog?.busy) { event.preventDefault(); closeDialog(); return; }
      // FSD-03E: Enter in the name field saves, but never while an input method is composing a character.
      if (event.key === "Enter" && state.dialog?.kind === "rename" && (event.target as HTMLElement).id === "team-rename-input") {
        if (event.isComposing || event.keyCode === 229) return;
        event.preventDefault(); void confirmDialog(); return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...dialogEl.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])")];
      if (focusable.length === 0) { event.preventDefault(); return; }
      const first = focusable[0], last = focusable[focusable.length - 1];
      const inside = dialogEl.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !inside)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !inside)) { event.preventDefault(); first.focus(); }
    };
    const onClick = (event: MouseEvent) => {
      const el = event.target as HTMLElement;
      if (el.closest("#team-dialog-dismiss")) { if (!state.dialog?.busy) closeDialog(); }
      else if (el.closest("#team-dialog-confirm")) void confirmDialog();
    };
    const onChange = (event: Event) => {
      const el = event.target as HTMLInputElement;
      if (state.dialog?.kind === "transfer" && state.dialog.step === "pick" && el.name === "team-transfer-target") {
        state.dialog.chosen = el.value; state.dialog.notice = null;
      }
    };
    const onInput = (event: Event) => {
      const el = event.target as HTMLInputElement;
      if (state.dialog?.kind === "rename" && el.id === "team-rename-input" && !state.dialog.busy) { state.dialog.draft = el.value; updateRenameCounter(state.dialog); }
    };
    document.addEventListener("keydown", onKey, true);
    dialogEl.addEventListener("click", onClick);
    dialogEl.addEventListener("change", onChange);
    dialogEl.addEventListener("input", onInput);
    removeKeys = () => document.removeEventListener("keydown", onKey, true);
    renderDialog();
  }

  /** Always restores the page (inert, focus, listeners); safe to call when nothing is open. */
  function closeDialog(silent = false) {
    if (!state.dialog) return;
    const trigger = state.dialog.trigger;
    state.dialog = null;
    removeKeys?.(); removeKeys = undefined;
    dialogEl?.remove(); dialogEl = null;
    app.inert = false;
    (content.querySelector<HTMLElement>(`[data-team-action="${CSS.escape(trigger)}"]:not([hidden]):not([disabled])`)
      ?? document.querySelector<HTMLElement>("#team-title"))?.focus();
    if (!silent) hooks.onDialogClosed();
  }

  /** A confirmed snapshot may invalidate what the open dialog promised: update the text or close it. */
  function syncDialog() {
    const dialog = state.dialog;
    if (!dialog) return;
    const team = state.team;
    const c = controls();
    if (dialog.kind === "create") {
      if (!c.canCreateJoin) { closeDialog(); status.textContent = "隊伍狀態已變動，已關閉確認視窗；請核對後再操作。"; }
      return;
    }
    if (dialog.kind === "rename") {
      if (!dialog.busy && (!state.confirmed || !team || team.leaderMemberId !== selfId || team.status === "archived")) {
        closeDialog(); status.textContent = "您已不是隊長或隊伍狀態已變動，已關閉改名視窗。";
      }
      return;
    }
    if (!state.confirmed || !team || (dialog.kind === "leave" ? !c.canLeave && !dialog.busy : !team.memberIds.includes(selfId) || team.leaderMemberId !== selfId || team.memberIds.length < 2)) {
      if (!dialog.busy) { closeDialog(); status.textContent = "隊伍狀態已變動，已關閉確認視窗；請核對後再操作。"; }
      return;
    }
    if (dialog.busy) return;
    if (dialog.kind === "leave") {
      if (!matchesLeaveExpectation(team, dialog.expected)) { dialog.expected = leaveExpectation(team); dialog.notice = CHANGED_NOTICE; }
    } else if (dialog.step === "pick") {
      if (dialog.chosen && !team.memberIds.includes(dialog.chosen)) dialog.chosen = null;
    } else {
      if (!team.memberIds.includes(dialog.target)) { Object.assign(dialog, { step: "pick", chosen: null, notice: "您選的隊員已不在隊伍中，請重新選擇。" }); }
      else if (!matchesTransferExpectation(team, dialog.expected)) { dialog.expected = transferExpectation(team); dialog.notice = CHANGED_NOTICE; }
    }
    renderDialog(dialog.notice !== null);
  }

  async function confirmDialog() {
    const dialog = state.dialog;
    const team = state.team;
    if (dialog?.kind === "create") { if (!dialog.busy) { closeDialog(true); void mutate("create"); } return; }
    if (!dialog || !team || dialog.busy) return;
    if (dialog.kind === "rename") { await saveName(dialog, team); return; }
    if (dialog.kind === "transfer" && dialog.step === "pick") {
      if (!dialog.chosen || !team.memberIds.includes(dialog.chosen)) { dialog.notice = "請先選擇一位隊員。"; renderDialog(); return; }
      Object.assign(dialog, { step: "confirm", target: dialog.chosen, expected: transferExpectation(team), notice: null });
      renderDialog(true); // The verb button must not inherit focus from "next": a double click would skip the summary.
      return;
    }
    dialog.busy = true;
    state.busy = true;
    clearError();
    renderDialog();
    render();
    const before = { teamId: team.teamId, revision: team.revision };
    const label = dialog.kind === "leave" ? (team.everFormed ? "退出隊伍" : "取消招募") : "更換隊長";
    // The panel may be stopped (stale clock) while the write is in flight: this dialog is then already gone.
    const stopped = () => state.dialog !== dialog;
    try {
      if (dialog.kind === "leave") await service.leaveTeam(session, dialog.expected);
      else if (dialog.step === "confirm") await service.transferCaptain(session, dialog.target, dialog.expected);
      dialog.busy = false;
      if (!stopped()) { closeDialog(); status.textContent = "寫入完成；等待伺服器隊伍快照確認。"; }
    } catch (error) {
      dialog.busy = false;
      if (stopped()) return;
      closeDialog();
      showError(errorText(error, "隊伍操作失敗，請確認連線後再試。"));
      if (error instanceof TeamUnconfirmedError) {
        await rereadAfterUnconfirmed(dialog.kind === "leave"
          ? (membership) => leaveOutcome(membership, before)
          : (membership, fresh) => transferOutcome(membership, fresh, before), label);
      } else if (error instanceof TeamChangedError) {
        status.textContent = "隊伍剛有變動，沒有送出任何變更；請依最新狀態重新確認。";
      } else status.textContent = "未送出；請依提示修正後再試。";
    } finally { state.busy = false; render(); }
  }

  /** FSD-03E B1: one transaction; failure keeps the dialog open with the reason, and nothing is ever resent on its own. */
  async function saveName(dialog: Extract<DialogState, { kind: "rename" }>, team: TeamState) {
    const check = checkTeamName(dialog.draft);
    if (!check.ok) { dialog.notice = check.message; renderDialog(); return; }
    dialog.busy = true;
    renderDialog();
    const stopped = () => state.dialog !== dialog;
    try {
      const outcome = await teamNames.save(session, team.teamId, check.name);
      dialog.busy = false;
      if (stopped()) return;
      if (outcome === "saved") { closeDialog(); status.textContent = "隊名已儲存；隊員畫面會在同步後更新。"; return; }
      dialog.notice = outcome === "notSaved" ? "目前伺服器上尚未看到新隊名；請確認您仍是隊長，稍後重新載入核對後再決定是否重試。" : "結果未確認，請勿重送；請稍後重新載入確認隊名。";
    } catch (error) {
      dialog.busy = false;
      if (stopped()) return;
      dialog.notice = errorText(error, "隊名儲存失敗，請確認連線後再試。");
    }
    renderDialog();
    // QA S3: a captain change or archive that arrived while saving closes the dialog now.
    syncDialog();
  }

  // ----- Events -----

  content.addEventListener("click", (event) => {
    const el = event.target as HTMLElement;
    if (el.closest("#create-team")) { openDialog("create", "create"); return; }
    const button = el.closest<HTMLButtonElement>("[data-team-action]");
    // FSD-03E C5: explicit routing, so a new action can never fall through to leaving the team.
    const action = button?.dataset.teamAction;
    if (action === "leave" || action === "transfer" || action === "rename") openDialog(action, action);
  });
  content.addEventListener("submit", (event) => {
    if (!(event.target as HTMLElement).closest("#join-team-form")) return;
    event.preventDefault();
    void mutate("join", content.querySelector<HTMLInputElement>("#team-invite-code")?.value ?? "");
  });

  stopMembership = service.subscribeMembership(session, (view, confirmed, tombstone) => applyMembership(view, confirmed, tombstone), (error) => {
    if (hooks.isStale()) return;
    state.confirmed = false;
    clearRoster();
    clearContrib(); // also stops the week results and cancels their settlers
    state.team = null; state.tombstone = null;
    showError(error instanceof TeamFormatError ? error.message : "無法讀取隊伍狀態；操作已停用，請確認連線或重新載入。");
    status.textContent = "團隊資料無法確認；操作暫停。";
    render();
    syncDialog();
  });
  render();

  return {
    stop() { closeDialog(true); state.generation += 1; stopMembership?.(); stopMembership = undefined; clearRoster(); clearContrib(); },
    onOwnEvent(taskDate, seq) {
      if (hooks.isStale()) return;
      const entryId = entryIdOf(selfId, taskDate, seq);
      Promise.resolve().then(() => contrib.credit(session, taskDate, seq))
        .then((result) => { applyCredit(entryId, result); render(); })
        .catch(() => { applyCredit(entryId, "unconfirmed"); render(); });
    },
    refresh() { if (!hooks.isStale()) render(); },
    chestContext(): ChestTeamContext | null {
      if (!state.confirmed) return null;
      const team = state.team;
      const daysLeft = daysLeftInWeek(weeks.current, taskDateOf(session.context));
      if (!team) return { confirmed: true, hasTeam: false, total: 0, target: TEAM_WEEK_TARGET, reached: false, daysLeft, previous: null };
      if (!state.contribConfirmed) return { confirmed: false, hasTeam: true, total: 0, target: TEAM_WEEK_TARGET, reached: false, daysLeft, previous: null };
      const week = weekInput(team);
      const prev = week.previous && weeks.previous && week.previous.official ? { weekId: weeks.previous, total: week.previous.total, awardCount: week.previous.official.awardCount } : null;
      return { confirmed: true, hasTeam: true, total: week.total, target: week.target, reached: week.total >= week.target || week.official !== null, daysLeft, previous: prev,
        solo: team.memberIds.length < 2 && team.status !== "archived", currentAwards: week.official ? week.official.awardCount : null };
    },
    teamSummary(): TeamSummary {
      const team = state.team;
      const c = controls();
      return { confirmed: state.confirmed, hasTeam: !!team, inviteCode: team?.inviteCode ?? null, status: team?.status ?? null,
        memberCount: team?.memberIds.length ?? 0, weekLocked: !team && state.confirmed && state.tombstone !== null && !c.canCreateJoin };
    },
    reconcileContrib() {
      if (state.team) runReconcile(new Set(state.contribEntries.map((e) => entryIdOf(e.memberId, e.taskDate, e.seq))), null);
      else if (state.tombstone?.leftTeamId) runReconcile(null, state.tombstone.leftTeamId);
    },
    closeDialog: (silent) => closeDialog(silent),
    isDialogOpen: () => state.dialog !== null,
  };
}
