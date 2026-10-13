/**
 * FSD-PA-03/04/05: the visitor's clock tools, the simulated teammates and the simulated new member. They act
 * through the same services as everyone else (each with its own services signed in as that member), so the team ledger, the
 * week result, the chests and the referral rewards follow the very rules of the internal demo.
 */
import { readCollection, readDoc } from "../local/store.ts";
import { parseEntry, replayTeamWeek, TEAM_WEEK_TARGET, weekOfTaskDate } from "../team/contrib-state.ts";
import { nextDayAt9, nextMondayAt9 } from "../admin/clock-time.ts";
import type { DailyCommand, DailyDay, DailyState } from "../daily/daily-service";
import type { AuthenticatedSession, DemoContext } from "../identity/contracts";
import { currentContext, NEWCOMER, sessionFor, setClock, TEAMMATES, VISITOR, type SimMember } from "./world.ts";

/** One member's services (each simulated member has its own signed-in services, so the visitor's never switch identity). */
export interface MemberPorts {
  ensureDay(session: AuthenticatedSession, day: DailyDay): Promise<void>;
  execute(session: AuthenticatedSession, day: DailyDay, command: DailyCommand): Promise<DailyState>;
  refresh(session: AuthenticatedSession, day: DailyDay): Promise<{ state: DailyState; exists: boolean }>;
  credit(session: AuthenticatedSession, taskDate: string, seq: number): Promise<unknown>;
  joinTeam(session: AuthenticatedSession, code: string): Promise<unknown>;
  createTeam(session: AuthenticatedSession): Promise<unknown>;
  bind(session: AuthenticatedSession, code: string): Promise<{ ok: boolean; message?: string }>;
  firstRide(session: AuthenticatedSession): Promise<{ ok: boolean; message?: string }>;
}

export interface SimPorts extends MemberPorts {
  /** The services signed in as another simulated member. */
  as(uid: string): MemberPorts;
}

/** A teammate's steps on a day: the usual amount ±10 % (fixed per member and day, so a replay gives the same). */
export function teammateSteps(m: SimMember, taskDate: string): number {
  let h = 0;
  for (const c of `${m.memberId}|${taskDate}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return Math.round((m.steps * (0.9 + (h % 201) / 1000)) / 10) * 10;
}

/** By 09:00 a teammate has walked a third of the day. */
const MORNING = 0.35;

function previousDate(taskDate: string): string {
  const d = new Date(`${taskDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** The visitor's team (id and invite code), or null. */
export function visitorTeam(context: DemoContext = currentContext()): { teamId: string; memberIds: string[] } | null {
  const m = readDoc(`teamMembership/${context.sessionId}/members/${VISITOR.memberId}`) as { status?: string; teamId?: string } | undefined;
  if (!m || m.status !== "active" || !m.teamId) return null;
  const team = readDoc(`teams/${context.sessionId}/items/${m.teamId}`) as { memberIds?: string[] } | undefined;
  return team?.memberIds ? { teamId: m.teamId, memberIds: team.memberIds } : null;
}

/** Teammates already in the visitor's team. */
export function joinedTeammates(context: DemoContext = currentContext()): SimMember[] {
  const team = visitorTeam(context);
  return team ? TEAMMATES.filter((t) => team.memberIds.includes(t.memberId)) : [];
}

/** Raises one member's steps of a day to `value` (never down) and credits the new event to the team. */
async function walk(all: SimPorts, m: SimMember, context: DemoContext, day: DailyDay, value: number): Promise<void> {
  const session = sessionFor(m, context);
  const ports = all.as(m.uid);
  await ports.ensureDay(session, day);
  const { state } = await ports.refresh(session, day);
  if (value <= state.rawSteps) return;
  const after = await ports.execute(session, day, { type: "steps", value });
  if (after.eventSeq > state.eventSeq) await ports.credit(session, after.taskDate, after.eventSeq).catch(() => undefined);
}

/** A teammate takes today's yoxi ride (steps count 1.5 times), credited to the team. */
async function ride(all: SimPorts, m: SimMember, context: DemoContext): Promise<void> {
  const session = sessionFor(m, context);
  const ports = all.as(m.uid);
  await ports.ensureDay(session, "today");
  const { state } = await ports.refresh(session, "today");
  if (state.rideCompletedAt !== null) return;
  const after = await ports.execute(session, "today", { type: "ride" });
  if (after.eventSeq > state.eventSeq) await ports.credit(session, after.taskDate, after.eventSeq).catch(() => undefined);
}

/** Teammates finish yesterday and walk this morning (only those in the visitor's team); `rides`: each also rides yoxi today. */
export async function teammatesWalk(ports: SimPorts, context: DemoContext = currentContext(), rides = false): Promise<void> {
  const today = context.scenarioNow.slice(0, 10);
  for (const m of joinedTeammates(context)) {
    await walk(ports, m, context, "yesterday", teammateSteps(m, previousDate(today))).catch(() => undefined);
    await walk(ports, m, context, "today", Math.round(teammateSteps(m, today) * MORNING / 10) * 10);
    if (rides) await ride(ports, m, context).catch(() => undefined);
  }
}

/** The team's total of the current week, from the ledger (the same replay the team page uses). */
export function teamWeekTotal(context: DemoContext = currentContext()): number {
  const team = visitorTeam(context);
  if (!team) return 0;
  const weekId = weekOfTaskDate(context.scenarioNow.slice(0, 10));
  const entries = readCollection(`teamContrib/${context.sessionId}/teams/${team.teamId}/entries`)
    .flatMap((d) => { try { return [parseEntry(d.data, context.sessionId, team.teamId, d.id)]; } catch { return []; } });
  return replayTeamWeek(entries, weekId).total;
}

/** 邀請模擬隊友: the next teammate not in the team joins with the visitor's invite code, then walks this morning. */
export async function inviteTeammate(ports: SimPorts): Promise<SimMember | null> {
  const context = currentContext();
  const team = visitorTeam(context);
  if (!team || team.memberIds.length >= 5) return null;
  const next = TEAMMATES.find((t) => !team.memberIds.includes(t.memberId));
  if (!next) return null;
  await ports.as(next.uid).joinTeam(sessionFor(next, context), team.teamId);
  const today = context.scenarioNow.slice(0, 10);
  await walk(ports, next, context, "today", Math.round(teammateSteps(next, today) * MORNING / 10) * 10);
  return next;
}

/** At most this many days are fast-forwarded (a new week starts over at Monday, so two weeks are always enough). */
export const GOAL_MAX_DAYS = 12;

/**
 * 一鍵模擬團隊達標 (product owner 2026-10-12: fast-forward until the teammates reach it): a team for the visitor
 * (created when there is none) with all four teammates; then day by day at 09:00 the teammates walk their usual
 * steps and each rides yoxi (×1.5), until the team passes 30 萬 within one week. The page reloads afterwards and
 * the team page records the result, so every member gets a chest. Returns the days fast-forwarded.
 */
export async function reachTeamGoal(ports: SimPorts, onDay: (day: number) => void): Promise<number> {
  let context = currentContext();
  if (!visitorTeam(context)) await ports.createTeam(sessionFor(VISITOR, context));
  for (let i = 0; i < TEAMMATES.length; i += 1) if (!(await inviteTeammate(ports))) break;
  context = currentContext();
  for (const m of joinedTeammates(context)) await ride(ports, m, context).catch(() => undefined);
  let days = 0;
  while (teamWeekTotal() < TEAM_WEEK_TARGET && days < GOAL_MAX_DAYS) {
    days += 1;
    onDay(days);
    context = setClock(nextDayAt9(currentContext().scenarioNow));
    await teammatesWalk(ports, context, true);
  }
  return days;
}

/** The days a clock change passes through (each at 09:00), so teammates walk every one of them. */
export function clockTargets(kind: "tomorrow" | "monday" | "week", scenarioNow: string): string[] {
  if (kind === "tomorrow") return [nextDayAt9(scenarioNow)];
  const monday = nextMondayAt9(scenarioNow);
  const days: string[] = [];
  for (let t = nextDayAt9(scenarioNow); t <= monday; t = nextDayAt9(t)) days.push(t);
  if (kind === "monday") return days;
  for (let i = 0; i < 6; i += 1) days.push(nextDayAt9(days[days.length - 1]));
  return days;
}

/**
 * 快轉到明天／快轉到下週一／自動七天. Day by day: move the clock, teammates walk; 自動七天 also has the visitor walk
 * 6,000 and claim on each day of next week (Monday to Sunday). The page reloads afterwards.
 */
export async function runClock(ports: SimPorts, kind: "tomorrow" | "monday" | "week", onDay: (index: number, total: number) => void): Promise<void> {
  const start = currentContext();
  const targets = clockTargets(kind, start.scenarioNow);
  const firstMonday = nextMondayAt9(start.scenarioNow);
  for (const [i, target] of targets.entries()) {
    onDay(i, targets.length);
    const context = setClock(target);
    await teammatesWalk(ports, context);
    if (kind === "week" && target >= firstMonday) {
      const session = sessionFor(VISITOR, context);
      await ports.ensureDay(session, "today");
      const before = await ports.refresh(session, "today");
      if (before.state.rawSteps < 6000) {
        const after = await ports.execute(session, "today", { type: "steps", value: 6000 });
        if (visitorTeam(context) && after.eventSeq > before.state.eventSeq) await ports.credit(session, after.taskDate, after.eventSeq).catch(() => undefined);
      }
      await ports.execute(session, "today", { type: "claimAll" });
    }
  }
}

/** 模擬新朋友填我的推薦碼. */
export async function newcomerBinds(ports: SimPorts): Promise<{ ok: boolean; message?: string }> {
  return ports.as(NEWCOMER.uid).bind(sessionFor(NEWCOMER), VISITOR.memberId);
}

/** 模擬新朋友首趟搭乘. */
export async function newcomerRides(ports: SimPorts): Promise<{ ok: boolean; message?: string }> {
  return ports.as(NEWCOMER.uid).firstRide(sessionFor(NEWCOMER));
}

/** Where the simulated new member stands (for the buttons). */
export function newcomerState(context: DemoContext = currentContext()): "none" | "bound" | "rode" {
  const r = readDoc(`referrals/${context.sessionId}/referees/${NEWCOMER.memberId}`) as { firstRideAt?: string | null } | undefined;
  return !r ? "none" : r.firstRideAt ? "rode" : "bound";
}
