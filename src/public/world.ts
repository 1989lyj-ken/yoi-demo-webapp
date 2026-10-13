/**
 * FSD-PA: the visitor's own world (public test build only). First visit: a private session whose clock starts
 * today 09:00 (Asia/Taipei), the visitor Ken, four simulated teammates and one simulated new member.
 */
import { commit, loadWorld, readDoc, touch, wipeWorld, type Write } from "../local/store.ts";
import { VISITOR_UID } from "../local/auth.ts";
import { activityWeekOf } from "../team/activity-week.ts";
import type { AuthenticatedSession, DemoContext } from "../identity/contracts";

export interface SimMember { uid: string; memberId: string; name: string; /** Usual steps a day (teammates only). */ steps: number }

export const VISITOR: SimMember = { uid: VISITOR_UID, memberId: "YOI-K01", name: "Ken", steps: 0 };
/** Product owner 2026-10-12: Michael, KC, Rosie, Show. Steps chosen so a full team reaches 30 萬 by Saturday with Ken at 6,000 a day. */
export const TEAMMATES: SimMember[] = [
  { uid: "sim-michael", memberId: "YOI-M01", name: "Michael", steps: 13_000 },
  { uid: "sim-kc", memberId: "YOI-C01", name: "KC", steps: 11_500 },
  { uid: "sim-rosie", memberId: "YOI-R01", name: "Rosie", steps: 12_000 },
  { uid: "sim-show", memberId: "YOI-S01", name: "Show", steps: 10_500 },
];
export const NEWCOMER: SimMember = { uid: "sim-new", memberId: "YOI-N01", name: "新朋友", steps: 0 };

/** Today 09:00 in Asia/Taipei, as the scenario clocks write it. */
export function todayAt9(now = Date.now()): string {
  const taipei = new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
  return `${taipei}T09:00:00+08:00`;
}

function seed(now: number): void {
  const scenarioNow = todayAt9(now);
  const sessionId = `pub-${Math.random().toString(36).slice(2, 8)}`;
  const writes: Write[] = [
    { path: "demo/current", data: { sessionId, scenarioNow, clockVersion: 1, activityWeekId: activityWeekOf(scenarioNow) } },
  ];
  for (const m of [VISITOR, ...TEAMMATES, NEWCOMER]) {
    writes.push({ path: `membersByUid/${m.uid}`, data: { memberId: m.memberId, role: "member", displayName: m.name, active: true } });
    writes.push({ path: `memberProfiles/${m.memberId}`, data: { displayName: m.name } });
  }
  commit(writes);
}

/** Loads the visitor's world, or starts a new one (first visit, or unused for 3 days). */
export function ensureWorld(now = Date.now()): void {
  if (!loadWorld(now) || !readDoc("demo/current") || !readDoc(`membersByUid/${VISITOR.uid}`)) { wipeWorld(); seed(now); }
  touch(now);
}

/** 重新開始體驗: a brand-new world. */
export function restartWorld(): void {
  wipeWorld();
  seed(Date.now());
}

export function currentContext(): DemoContext {
  const d = readDoc("demo/current") as { sessionId: string; scenarioNow: string; clockVersion: number; activityWeekId: string };
  return { sessionId: d.sessionId, scenarioNow: d.scenarioNow, clockVersion: d.clockVersion, activityWeekId: d.activityWeekId };
}

/** The visitor's current name (it can be changed). */
export function visitorName(): string {
  return String((readDoc(`membersByUid/${VISITOR.uid}`) as { displayName?: string } | undefined)?.displayName ?? VISITOR.name);
}

/** 修改名稱: 1–20 characters after trimming. */
export function renameVisitor(raw: string): string | null {
  const name = raw.trim();
  if (!name || [...name].length > 20) return null;
  const member = readDoc(`membersByUid/${VISITOR.uid}`) ?? {};
  commit([{ path: `membersByUid/${VISITOR.uid}`, data: { ...member, displayName: name } }, { path: `memberProfiles/${VISITOR.memberId}`, data: { displayName: name } }]);
  return name;
}

export function sessionFor(m: SimMember, context: DemoContext = currentContext()): AuthenticatedSession {
  return { account: { authUid: m.uid, email: `${m.uid}@local` }, member: { memberId: m.memberId, role: "member", displayName: m.uid === VISITOR.uid ? visitorName() : m.name }, context };
}

/** Moves the visitor's clock (only the visitor's world sees it). */
export function setClock(target: string): DemoContext {
  const now = currentContext();
  const next = { sessionId: now.sessionId, scenarioNow: target, clockVersion: now.clockVersion + 1, activityWeekId: activityWeekOf(target) };
  commit([{ path: "demo/current", data: next }]);
  return next;
}
