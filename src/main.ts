import { IdentityError } from "./identity/contracts";
import { SessionService } from "./identity/session-service";
import { FirebaseIdentityProvider } from "./identity/firebase-identity-provider";
import { FirestoreSharedContextStore } from "./identity/firestore-shared-context";
import { firebaseAuth, firestore } from "./firebase/config";
import { DailyService, DailyUnconfirmedError, emptyDaily, taskDateOf, type DailyCommand, type DailyDay, type DailyState } from "./daily/daily-service";
import { canSubmitSteps, claimablePoints, DailyFormatError, dailyStateDominates } from "./daily/daily-state";
import { claimYesterdayPrompt, yesterdayPromptKey, type PromptStorage } from "./daily/yesterday-prompt";
import { TeamService } from "./team/team-service";
import { TeamNameService } from "./team/team-name-service";
import { mountTeamPanel, type TeamPanel } from "./team/team-panel";
import { MemberNames } from "./identity/member-names";
import { ChestService } from "./rewards/chest-service";
import { mountRewardsPanel, type RewardsPanel } from "./rewards/rewards-panel";
import { ReferralService, type ReferralFeed } from "./referral/referral-service";
import { mountReferralPanel, type ReferralPanel } from "./referral/referral-panel";
import { referralBonuses, referralCoupons } from "./referral/referral-state";
import { ContribService } from "./team/contrib-service";
import { WeekResultService } from "./team/week-result-service";
import { PerfectWeekService } from "./weekly/perfect-week-service";
import { mountPerfectWeekPanel, type PerfectWeekPanel } from "./weekly/perfect-week-panel";
import { AdminService } from "./admin/admin-service";
import { showAdminPanel } from "./admin/admin-panel";
import { doc, getDocFromServer, onSnapshot } from "firebase/firestore";
import type { StepsOutcome, StepsResult } from "./app/shell-state";
import { showToast, claimToast } from "./app/toast";
import { appShellView, dailyPointsView, rideNoteView, homeView, loginView, pointsNodesView, pointsTrackLabel, pointsTrackView, staleOverlayView, todaySayView, yesterdayPromptView } from "./ui/views";
import { claimableOf, rideCelebration, rideRowNote, trackFraction } from "./daily/today-card";
import { mountAppShell, type AppShell } from "./app/app-shell";
import { SHELL_PAGES, type ShellPage } from "./app/shell-state";
import type { NoticeInputs } from "./app/notices";
import yoxiHomeUrl from "./assets/yoxi-home.jpg";
import introYoikaUrl from "./assets/intro-yoika.png";
import introWishlistUrl from "./assets/intro-wishlist.png";
import introKampungUrl from "./assets/intro-kampung.png";
import "./style.css";
import { IS_PUBLIC } from "./app/edition";
import { ensureWorld } from "./public/world";
import { mountPublic, type PublicControls } from "./public/mount";
import { authFor } from "./local/auth";

// FSD-PA: the public test build opens (or starts) the visitor's own world before anything reads it.
if (IS_PUBLIC) ensureWorld();

const sessionService = new SessionService(
  new FirebaseIdentityProvider(firebaseAuth),
  new FirestoreSharedContextStore(firebaseAuth, firestore),
);
const dailyService = new DailyService(firebaseAuth, firestore);
const teamService = new TeamService(firebaseAuth, firestore);
const teamNameService = new TeamNameService(firebaseAuth, firestore); // FSD-03E
const contribService = new ContribService(firebaseAuth, firestore);
// FSD-AC1 R3: teammates' display names (read-only, server reads only; a missing document resolves undefined).
const readProfile = (memberId: string) => getDocFromServer(doc(firestore, "memberProfiles", memberId)).then((snap) => snap.exists() ? snap.data() : undefined);
const memberNames = new MemberNames(readProfile);
// FSD-07A M6: the referral block keeps its own names, so the team block's roster key never interferes.
const referralNames = new MemberNames(readProfile);
const weekResultService = new WeekResultService(firebaseAuth, firestore);
const perfectWeekService = new PerfectWeekService(firebaseAuth, firestore);
const chestService = new ChestService(firebaseAuth, firestore);
const referralService = new ReferralService(firebaseAuth, firestore);
const adminService = new AdminService(firebaseAuth, firestore);
let stopDaily: (() => void) | undefined;
let teamPanel: TeamPanel | undefined;
let perfectWeek: PerfectWeekPanel | undefined;
let rewards: RewardsPanel | undefined;
let referralFeed: ReferralFeed | undefined;
let referral: ReferralPanel | undefined;
/** FSD-08A-1: the four-page shell (undefined in the diagnostics view, the admin panel and before sign-in). */
let shell: AppShell | undefined;
/** FSD-PA: the public build's tools and simulation cards (undefined in the internal demo). */
let publicControls: PublicControls | undefined;
let stopContextWatch: (() => void) | undefined;
// Set once demo/current moved past the context this page loaded with (FSD-02B); everything else stops.
let contextStale = false;

/**
 * Stops every shared subscription and removes the dialogs living on document.body (team dialog,
 * yesterday prompt, coupon congratulation, chest opening), so none outlives the shared screen: showcase, admin, sign-out
 * and a stale clock all pass here, and the stale overlay is then the only overlay left.
 */
function stopSharedSubscriptions(): void {
  shell?.stop(); shell = undefined;
  publicControls?.stop(); publicControls = undefined;
  stopDaily?.(); teamPanel?.stop(); perfectWeek?.stop(); rewards?.stop(); referral?.stop(); referralFeed?.stop(); memberNames.clear(); referralNames.clear();
  stopDaily = undefined; teamPanel = undefined; perfectWeek = undefined; rewards = undefined; referral = undefined; referralFeed = undefined;
  document.querySelector("#yesterday-prompt")?.remove();
  document.querySelector("#coupon-prompt")?.remove();
  document.querySelector("#weather-dialog")?.remove(); // FSD-08B: the shell closes it on stop; this is the backstop
}

function markContextStale(): void {
  if (contextStale) return;
  // FSD-PA: only the visitor moves the public clock (and reloads right after); a reload is all it takes.
  if (IS_PUBLIC) { contextStale = true; window.location.reload(); return; }
  contextStale = true;
  stopSharedSubscriptions();
  stopContextWatch?.();
  // Only a reload can recover: keep the screen inert behind the stale overlay (it is the top of the overlay order).
  document.querySelector<HTMLElement>("#app")?.setAttribute("inert", "");
  // Yesterday's prompt belongs to the old clock: remove it so it never outlives the deadline.
  document.querySelector("#yesterday-prompt")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "stale-overlay";
  overlay.setAttribute("role", "alertdialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "stale-title");
  overlay.innerHTML = staleOverlayView();
  document.body.append(overlay);
  overlay.querySelector<HTMLButtonElement>("#stale-reload")?.addEventListener("click", () => window.location.reload());
  overlay.querySelector<HTMLButtonElement>("#stale-reload")?.focus();
}

/** One watcher per signed-in page, independent of showcase/shared/admin views. */
function startContextWatch(session: Awaited<ReturnType<SessionService["signIn"]>>): void {
  stopContextWatch?.();
  stopContextWatch = onSnapshot(doc(firestore, "demo", "current"), (snapshot) => {
    if (snapshot.metadata.fromCache || !snapshot.exists()) return;
    const data = snapshot.data();
    if (data.sessionId !== session.context.sessionId || data.clockVersion !== session.context.clockVersion) markContextStale();
  }, () => { /* A failed watch is not proof of a change; individual writes still recheck the clock. */ });
}

function enterApp(session: Awaited<ReturnType<SessionService["signIn"]>>): void {
  if (contextStale) return;
  startContextWatch(session);
  showApp(session);
}

function openAdmin(session: Awaited<ReturnType<SessionService["signIn"]>>, back: () => void): void {
  if (contextStale) return;
  stopSharedSubscriptions();
  // 2026-10-06 (14): the "自動七天" section writes the admin's own days through the normal daily service.
  showAdminPanel(session, adminService, back, {
    ports: { ensureDay: (s, day) => dailyService.ensureDay(s, day), execute: (s, day, command) => dailyService.execute(s, day, command) },
    pauseContextWatch: () => { stopContextWatch?.(); stopContextWatch = undefined; },
  });
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing app root");

/** M1: the provider-persisted sign-in, checked once at load; the home mock decides what to do with it. */
let restored: Promise<{ session: SignedInSession | null; error: string | null }> = checkRestore();
function checkRestore() {
  return sessionService.restoreSession().then((session) => ({ session, error: null }), (error: unknown) => ({ session: null, error: userFacingIdentityError(error) }));
}
let homeHintTimer: number | undefined;
/** Bumped by showHome: a sign-in check or sign-in still running from an earlier entry is abandoned. */
let navToken = 0;
/** QA 2: the load-time check is fresh on the first entry; later entries (after "back to home") re-check. */
let restoredUsed = false;

/** The yoxi home mock (PRD §9 item 2): the squid button enters yoi. No history entries (M10). */
function showHome(): void {
  navToken += 1;
  stopSharedSubscriptions();
  window.clearTimeout(homeHintTimer);
  history.replaceState(null, "", location.pathname + location.search);
  app!.innerHTML = homeView({ screenshotUrl: yoxiHomeUrl });
  const hint = app!.querySelector<HTMLElement>("#home-hint")!;
  app!.querySelector<HTMLElement>(".home-frame")!.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("#home-enter")) { window.clearTimeout(homeHintTimer); void enterFromHome(); return; }
    hint.hidden = false;
    window.clearTimeout(homeHintTimer);
    homeHintTimer = window.setTimeout(() => { hint.hidden = true; }, 2500);
  });
}

/** M1/M10: signed in → the app with a fresh context (stale → nothing to remount); else the login page. */
async function enterFromHome(): Promise<void> {
  if (contextStale) return;
  const token = navToken;
  showLogin(true);
  // A fresh context on a later entry (the cached one may be behind if the context watch failed silently).
  if (restoredUsed) restored = checkRestore();
  restoredUsed = true;
  const result = await restored;
  if (token !== navToken || contextStale) return;
  if (result.session) { enterApp(result.session); return; }
  showLogin(false, result.error);
}

/** The login page; its form is bound on every render (M1). `checking` keeps it disabled while the sign-in is checked. */
function showLogin(checking: boolean, error: string | null = null): void {
  window.clearTimeout(homeHintTimer);
  app!.innerHTML = loginView();
  const form = app!.querySelector<HTMLFormElement>("#login-form")!;
  const button = app!.querySelector<HTMLButtonElement>("#login-button")!;
  const errorBox = app!.querySelector<HTMLParagraphElement>("#login-error")!;
  form.querySelectorAll<HTMLInputElement>("input").forEach((input) => { input.disabled = checking; });
  button.disabled = checking;
  button.textContent = checking ? "檢查登入狀態…" : "登入";
  if (error) { errorBox.textContent = error; errorBox.hidden = false; }
  // PRD §9 item 2: a way back to the home mock.
  app!.querySelector<HTMLButtonElement>("#login-home")?.addEventListener("click", () => showHome());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    errorBox.hidden = true;
    button.disabled = true;
    button.textContent = "登入中…";
    const token = navToken;
    try {
      const session = await sessionService.signIn(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
      restored = Promise.resolve({ session, error: null });
      restoredUsed = false;
      if (token !== navToken) return;               // the member went back to the home mock meanwhile
      enterApp(session);
    } catch (signInError) {
      if (token !== navToken) return;
      errorBox.textContent = userFacingIdentityError(signInError);
      errorBox.classList.remove("success-message");
      errorBox.hidden = false;
    } finally {
      if (button.isConnected) { button.disabled = false; button.textContent = "登入"; }
    }
  });
}

/** What the panels need from the view around them (the app shell). */
interface PanelHost {
  drawerOpen(): boolean;
  goto(page: ShellPage): void;
  onToday(state: DailyState | null): void;
  /** FSD-08C S6: a ride was confirmed by the server; `claimAll` claims every claimable point of today. */
  onRide(before: DailyState, after: DailyState, claimAll: () => void): void;
  /** FSD-08A-4 B3: today's "save steps" command started or ended (the shell's steps sheet). */
  onStepsResult(result: StepsResult): void;
}


let signingOut = false;
async function signOutAndReload(errorBox: HTMLElement | null, button?: HTMLButtonElement | null): Promise<void> {
  if (signingOut) return;
  signingOut = true;
  if (button) button.disabled = true;
  try {
    await sessionService.signOut();
    stopSharedSubscriptions();
    window.location.reload();
  } catch {
    signingOut = false;
    if (errorBox) { errorBox.textContent = "目前無法完成登出，請確認網路後再試。"; errorBox.hidden = false; errorBox.scrollIntoView({ block: "center" }); }
    if (button) button.disabled = false;
  }
}

/** FSD-08A-1: the main screen after sign-in — the four-page shell around the shared panels. */
function showApp(session: Awaited<ReturnType<SessionService["signIn"]>>) {
  if (contextStale) return;
  stopSharedSubscriptions();
  app!.innerHTML = appShellView({ role: session.member.role });
  const host: PanelHost = {
    drawerOpen: () => !!shell?.isDrawerOpen(),
    goto: (page) => shell?.goto(page),
    onToday: (state) => { shell?.setTodaySteps(state ? { raw: state.rawSteps, effective: state.effectiveSteps, ride: state.rideCompletedAt !== null } : null); shell?.refreshNotices(); },
    onRide: (before, after, claimAll) => shell?.celebrateRide(rideCelebration(before, after), claimAll),
    onStepsResult: (result) => shell?.stepsResult(result),
  };
  const { today, yesterday } = mountSharedPanels(session, host);
  if (IS_PUBLIC) {
    // Each simulated member gets its own services, signed in as that member (the visitor's never switch identity).
    const memberPorts = (auth: typeof firebaseAuth) => {
      const daily = new DailyService(auth, firestore), team = new TeamService(auth, firestore), contrib = new ContribService(auth, firestore), referral = new ReferralService(auth, firestore);
      return {
        ensureDay: (s: SignedInSession, day: DailyDay) => daily.ensureDay(s, day),
        execute: (s: SignedInSession, day: DailyDay, command: DailyCommand) => daily.execute(s, day, command),
        refresh: (s: SignedInSession, day: DailyDay) => daily.refresh(s, day),
        credit: (s: SignedInSession, taskDate: string, seq: number) => contrib.credit(s, taskDate, seq),
        joinTeam: (s: SignedInSession, code: string) => team.joinTeam(s, code),
        createTeam: (s: SignedInSession) => team.createTeam(s),
        bind: (s: SignedInSession, code: string) => referral.bind(s, code),
        firstRide: (s: SignedInSession) => referral.firstRide(s),
      };
    };
    const others = new Map<string, ReturnType<typeof memberPorts>>();
    const as = (uid: string) => { let p = others.get(uid); if (!p) { p = memberPorts(authFor(uid) as unknown as typeof firebaseAuth); others.set(uid, p); } return p; };
    publicControls = mountPublic({ ...memberPorts(firebaseAuth), as }, { isBusy: () => !!shell?.isDrawerOpen() });
  }
  shell = mountAppShell(app!, { displayName: session.member.displayName, memberId: session.member.memberId, role: session.member.role, sessionId: session.context.sessionId, taskDate: taskDateOf(session.context) }, {
    isStale: () => contextStale,
    otherDialogOpen: () => !!teamPanel?.isDialogOpen() || !!perfectWeek?.isPromptOpen() || !!rewards?.isOverlayOpen() || document.querySelector("#yesterday-prompt") !== null,
    // M3 (c): after the drawer closes, the same order as after any dialog: yesterday prompt, then the coupon.
    onDrawerChanged: (open) => {
      rewards?.refresh();
      if (!open && !contextStale) { showYesterdayReminder(session, yesterday, true); perfectWeek?.evaluatePrompt(); }
    },
    balance: () => rewards?.balance() ?? null,
    teamSummary: () => teamPanel?.teamSummary() ?? { confirmed: false, hasTeam: false, inviteCode: null, status: null, memberCount: 0, weekLocked: false },
    onLogout: () => void signOutAndReload(document.querySelector<HTMLElement>("#session-error")),
    onAdmin: session.member.role === "admin" && !IS_PUBLIC ? () => openAdmin(session, () => showApp(session)) : undefined,
    tools: publicControls ? () => publicControls?.tools() ?? [] : undefined,
    onTool: publicControls ? (id) => publicControls?.onTool(id) : undefined,
    weatherFetch: publicControls?.weatherFetch,
    onGuideClosed: publicControls ? () => publicControls?.onGuideClosed() : undefined,
    onHome: () => showHome(),
    introImage: (index) => [introYoikaUrl, introWishlistUrl, introKampungUrl][index] ?? null, // order of UPCOMING_FEATURES
    notices: () => noticeInputs(session, today, yesterday),
  });
}

/** FSD-08A-2 M3: the bell's sources, each null until server-confirmed. */
function noticeInputs(session: SignedInSession, today: DailyPanel, yesterday: DailyPanel): NoticeInputs {
  const t = today.confirmed();
  const referrals = confirmedReferralSnapshot();
  return {
    scenarioNow: session.context.scenarioNow,
    taskDate: taskDateOf(session.context),
    today: t ? { rawSteps: t.rawSteps, effectiveSteps: t.effectiveSteps, claimable: claimablePoints(t) } : null,
    yesterdayClaimable: yesterdayClaimable(yesterday),
    couponIssuedAt: perfectWeek?.confirmedCoupons()?.map((c) => c.issuedAt) ?? null,
    unopenedChests: rewards?.unopenedCount() ?? null,
    referralRewardAt: referrals ? [...(referrals.own ? [referrals.own.boundAt] : []), ...referrals.mine.flatMap((r) => (r.firstRideAt ? [r.firstRideAt] : []))] : null,
    referralWelcomeAt: referrals ? (referrals.own ? [referrals.own.boundAt] : []) : null,
  };
}

/** P28: one source for the yesterday reminder, the first-visit prompt and the bell (null while unconfirmed). */
function yesterdayClaimable(panel: DailyPanel): number | null {
  const confirmed = panel.confirmed();
  if (confirmed) return claimablePoints(confirmed);
  return panel.settled() ? 0 : null;
}

function confirmedReferralSnapshot() {
  const snap = referralFeed?.snapshot();
  return !snap || snap.error || snap.own === undefined || snap.mine === undefined ? null : { own: snap.own, mine: snap.mine };
}

/** Mounts every shared panel into the current view; returns the yesterday panel (the prompts need it). */
function mountSharedPanels(session: Awaited<ReturnType<SessionService["signIn"]>>, host: PanelHost): { today: DailyPanel; yesterday: DailyPanel } {
  // A new own step/ride event is credited to the team ledger (FSD-03C-1); seq null asks for a reconcile.
  const onEvent = (taskDate: string, seq: number | null) => { if (seq === null) teamPanel?.reconcileContrib(); else teamPanel?.onOwnEvent(taskDate, seq); };
  // FSD-06A M2: the team panel enables create/join once today's daily document is confirmed.
  let todayWasReady = false;
  const todayHolder: { panel?: DailyPanel } = {};
  const today: DailyPanel = todayHolder.panel = mountDailyPanel(session, "today", () => {
    const confirmed = todayHolder.panel ? todayHolder.panel.confirmed() : null;
    host.onToday(confirmed);
    const ready = confirmed !== null;
    if (ready !== todayWasReady) { todayWasReady = ready; teamPanel?.refresh(); }
  }, onEvent, (result) => host.onStepsResult(result), (before, after, claimAll) => host.onRide(before, after, claimAll));
  const yesterday: DailyPanel = mountDailyPanel(session, "yesterday", (fromSnapshot) => showYesterdayReminder(session, yesterday, fromSnapshot), onEvent);
  stopDaily = () => { today.stop(); yesterday.stop(); };
  teamPanel = mountTeamPanel(session, teamService, app!, {
    isStale: () => contextStale,
    // A yesterday prompt postponed while the dialog was open is evaluated now.
    onDialogClosed: () => { if (!contextStale) { showYesterdayReminder(session, yesterday, true); perfectWeek?.evaluatePrompt(); rewards?.refresh(); } },
    todayReady: () => today.confirmed() !== null,
    onRendered: () => rewards?.refresh(), // FSD-08A-6: the chest card follows this week's team progress
    ownChest: (weekId) => rewards?.ownChest(weekId) ?? null, // UX-1010 F12: 去開寶箱 or 開過了
  }, contribService, weekResultService, memberNames, teamNameService);
  // FSD-07A: one referral subscription read by the referral block, the coupon list and the points balance.
  const now = session.context.scenarioNow;
  const feed = referralFeed = referralService.feed(session);
  const confirmedReferrals = () => {
    const snap = feed.snapshot();
    return snap.error || snap.own === undefined || snap.mine === undefined ? null : { own: snap.own, mine: snap.mine };
  };
  // FSD-04A: one overlay at a time; after any dialog closes, the yesterday prompt is evaluated first, then the coupon.
  perfectWeek = mountPerfectWeekPanel(session, perfectWeekService, {
    isStale: () => contextStale,
    extraCoupons: () => {
      const r = confirmedReferrals();
      return r ? referralCoupons(r.own, r.mine).map((c) => ({ ...c, minFare: null, active: now < c.expiresAt })) : null;
    },
    otherDialogOpen: () => !!teamPanel?.isDialogOpen() || document.querySelector("#yesterday-prompt") !== null || !!rewards?.isOverlayOpen() || host.drawerOpen(),
    beforeGoCoupons: () => { host.goto("rewards"); shell?.reveal("#coupons"); }, // FSD-08A-6: the 獎勵券 tab
    onRendered: () => shell?.refreshNotices(),
    onPromptClosed: () => { if (!contextStale) { showYesterdayReminder(session, yesterday, true); perfectWeek?.evaluatePrompt(); rewards?.refresh(); } },
  });
  // FSD-06A: points balance and chests; the opening dialog waits for every other dialog (M4).
  let lastUnopened: number | null = null;
  rewards = mountRewardsPanel(session, chestService, {
    isStale: () => contextStale,
    teamContext: () => teamPanel?.chestContext() ?? null,
    otherDialogOpen: () => !!teamPanel?.isDialogOpen() || !!perfectWeek?.isPromptOpen() || document.querySelector("#yesterday-prompt") !== null || host.drawerOpen(),
    onOverlayClosed: () => { if (!contextStale) { showYesterdayReminder(session, yesterday, true); perfectWeek?.evaluatePrompt(); } },
    // UX-1010 F12: the team card follows an opened chest (refreshed only when the unopened count changes, so no loop).
    onRendered: () => { shell?.refreshNotices(); const u = rewards?.unopenedCount() ?? null; if (u !== lastUnopened) { lastUnopened = u; teamPanel?.refresh(); } },
    bonuses: () => {
      const r = confirmedReferrals();
      return r ? referralBonuses(r.mine, now).map((b) => ({ ...b, label: `推薦新戶首乘加碼（${referralNames.label(b.refereeId)}）` })) : null;
    },
  });
  feed.listen(() => { perfectWeek?.refresh(); rewards?.refresh(); shell?.refreshNotices(); });
  referral = mountReferralPanel(session, referralService, feed, referralNames, {
    isStale: () => contextStale,
    onStale: () => markContextStale(),
    onNames: () => rewards?.refresh(),
  });
  return { today, yesterday };
}

type SignedInSession = Awaited<ReturnType<SessionService["signIn"]>>;

interface DailyPanel {
  stop(): void;
  /** The last server-confirmed state of an existing document, or null while unconfirmed or absent. */
  confirmed(): DailyState | null;
  /** True once the server has confirmed this day (including a confirmed absence). */
  settled(): boolean;
}

function dailyErrorMessage(error: Error): string {
  return error instanceof DailyFormatError ? error.message : "無法從共享服務讀取每日資料；操作已停用，請確認連線或重新載入。";
}

/**
 * One task-day panel ("today" or "yesterday"). Only server-confirmed snapshots enable actions;
 * an unconfirmed write result triggers a server reread instead of a blind resend.
 * `onChange(fromSnapshot)` runs after every render; `fromSnapshot` is false after a local action.
 */
function mountDailyPanel(session: SignedInSession, day: DailyDay, onChange: (fromSnapshot: boolean) => void,
  onEvent: (taskDate: string, seq: number | null) => void = () => undefined, onStepsResult: (result: StepsResult) => void = () => undefined,
  onRide: (before: DailyState, after: DailyState, claimAll: () => void) => void = () => undefined): DailyPanel {
  const q = <T extends HTMLElement = HTMLElement>(name: string) => document.querySelector<T>(`#${day}-${name}`)!;
  const status = q("status");
  const errorBox = q("error");
  const input = q<HTMLInputElement>("steps-input");
  const form = q<HTMLFormElement>("steps-form");
  const submitButton = form.querySelector<HTMLButtonElement>("button")!;
  const hint = q("steps-hint");
  const allButton = q<HTMLButtonElement>("claim-all");
  const rideButton = day === "today" ? q<HTMLButtonElement>("simulate-ride") : null;
  const state = {
    current: emptyDaily(session, day), exists: false, ready: false, busy: false,
    subscriptionFailed: false, serverConfirmed: false,
  };
  // FSD-08A-3 C2: the card kicker; yesterday keeps the full deadline rule below it.
  q("date").textContent = day === "today" ? `${state.current.taskDate} 個人任務` : `${state.current.taskDate}・補同步至今日 24:00`;
  // FSD-08A-6 (9): one line under the claim-all button.
  if (day === "yesterday") q("deadline").textContent = "今晚 23:59 前可以補領";
  // Yesterday may have no document yet: a confirmed absence still allows a catch-up sync.
  const updateReady = () => { state.ready = state.serverConfirmed && !state.subscriptionFailed && (state.exists || day === "yesterday"); };
  function render() {
    const current = state.current;
    const canAct = state.ready && !state.busy;
    const rode = current.rideCompletedAt !== null;
    const claimable = claimableOf(current.effectiveSteps, current.claimed);
    q("points").innerHTML = dailyPointsView(current.claimed);
    if (day === "today") {
      // FSD-08C S2/S3/S5: the track (shoe and fill move in place), the sentence and the ride task row.
      syncPointsTrack(q("trip"), current.effectiveSteps, current.claimed);
      // UX-1010 F9: with no steps yet the card says what to do first and offers the steps field; F16: the ride line.
      q("say").innerHTML = todaySayView(current.effectiveSteps, current.claimed, rode, state.exists ? current.rawSteps : null);
      q("zero").hidden = !(state.exists && current.rawSteps === 0);
      const rideLine = rideNoteView(current.rawSteps, rode);
      q("ride-note").hidden = rideLine === "";
      q("ride-note").innerHTML = rideLine;
      q("ride-state").textContent = rideRowNote(current.rawSteps, current.effectiveSteps, rode);
      if (rideButton) rideButton.hidden = rode;
      q("ride-done").hidden = !rode;
    } else {
      // FSD-08C: yesterday's steps (effective), the points left to claim and the ride bonus.
      q("steps").textContent = current.effectiveSteps.toLocaleString("en-US");
      const note = q("ride-note");
      note.hidden = !rode;
      note.textContent = rode ? `實際走了 ${current.rawSteps.toLocaleString("en-US")} 步` : "";
      q("claimable").textContent = String(claimable);
      q("ride-state").textContent = rode ? "已加成，步數 × 1.5 倍" : "沒有搭乘";
    }
    if (rideButton) rideButton.disabled = !canAct || rode;
    input.min = String(current.rawSteps);
    if (!state.busy && document.activeElement !== input) input.value = String(current.rawSteps);
    input.disabled = !canAct;
    updateSubmit();
    // FSD-08C S4: "領取 N 點" claims everything at once; with nothing to claim the button is not shown at all.
    allButton.hidden = claimable === 0;
    allButton.textContent = `${day === "today" ? "領取" : "補領"} ${claimable} 點`;
    allButton.disabled = !canAct || !state.exists || claimable === 0;
  }
  // FSD-AC1 R1: shared by render() and the input event, so a newer snapshot also re-checks a value being typed.
  function updateSubmit() {
    const check = canSubmitSteps(input.value, state.current.rawSteps);
    submitButton.disabled = !(state.ready && !state.busy) || !check.ok;
    hint.textContent = state.ready && !state.busy ? check.hint : "";
  }
  function showError(message: string) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }
  // FSD-08A-4 B3: the steps sheet hears the start and the outcome of a "save steps" command (today only).
  const reportsSteps = (command: DailyCommand) => day === "today" && command.type === "steps";
  const stepsMessage = () => ({ status: status.textContent ?? "", error: errorBox.hidden ? null : errorBox.textContent });
  async function perform(command: DailyCommand) {
    if (!state.ready || state.busy) return;
    errorBox.hidden = true;
    let outcome: StepsOutcome = "failed";
    let rode: DailyState | null = null;
    // The early returns below are unreachable from the form (canSubmitSteps blocks them first) but still report.
    const early = () => { if (reportsSteps(command)) onStepsResult({ phase: "done", outcome: "failed", ...stepsMessage() }); };
    // Checks that need no server: nothing is written (not even yesterday's zero document) when they fail.
    if (command.type === "steps") {
      if (!Number.isSafeInteger(command.value) || command.value < 0 || command.value > 1000000) {
        showError("步數須為 0 至 1,000,000 的整數。");
        early();
        return;
      }
      if (command.value < state.current.rawSteps) {
        showError("步數不可下修；請輸入不低於目前數值的步數。");
        early();
        return;
      }
      if (command.value === state.current.rawSteps) {
        status.textContent = "數值與目前相同；沒有變更，未寫入。";
        early();
        return;
      }
    }
    state.busy = true;
    status.textContent = "儲存中；等待伺服器確認…";
    render();
    if (reportsSteps(command)) onStepsResult({ phase: "saving" });
    const before = state.current;
    try {
      // Yesterday's zero document is created only when the member actually syncs it.
      if (!state.exists) await dailyService.ensureDay(session, day);
      const confirmed = await dailyService.execute(session, day, command);
      // A newer server snapshot may arrive before this transaction promise resolves.
      if (dailyStateDominates(confirmed, state.current)) state.current = confirmed;
      status.textContent = confirmed.eventSeq === before.eventSeq
        ? "沒有變更（已領取、已乘車或數值相同），未寫入。"
        : "寫入完成；等待伺服器快照確認畫面狀態…";
      // Only a new event (eventSeq advanced) can become a team entry; claims are skipped by the service.
      if (confirmed.eventSeq > before.eventSeq && command.type !== "claim" && command.type !== "claimAll") onEvent(confirmed.taskDate, confirmed.eventSeq);
      // FSD-08C S6: only a ride the server confirmed in this transaction celebrates (never an unconfirmed one).
      if (command.type === "ride" && confirmed.eventSeq > before.eventSeq && before.rideCompletedAt === null && confirmed.rideCompletedAt !== null) rode = confirmed;
      // UX-1010 F15: a confirmed claim says how many points it was.
      if (command.type === "claimAll" && confirmed.claimed > before.claimed) showToast(claimToast(day, confirmed.claimed - before.claimed));
      outcome = "confirmed";
    } catch (error) {
      showError(error instanceof Error ? error.message : "儲存失敗，請確認網路後重試。");
      if (error instanceof DailyUnconfirmedError) {
        outcome = "unconfirmed";
        state.serverConfirmed = false;
        status.textContent = "結果同步中；正在重新讀取伺服器狀態，請稍等。";
        try {
          const fresh = await dailyService.refresh(session, day);
          if (dailyStateDominates(fresh.state, state.current)) state.current = fresh.state;
          state.exists = fresh.exists;
          state.serverConfirmed = dailyStateDominates(state.current, fresh.state);
          status.textContent = "已重新讀取伺服器狀態；請核對數值後再決定是否重送。";
          if (fresh.state.eventSeq > before.eventSeq) onEvent(fresh.state.taskDate, null); // an unconfirmed write landed
        } catch {
          status.textContent = "結果未確認且無法重新讀取；請勿重送，等待連線恢復。";
        }
      } else {
        status.textContent = "未送出；請依提示修正後再試。";
      }
    } finally {
      state.busy = false; updateReady(); render();
      if (reportsSteps(command)) onStepsResult({ phase: "done", outcome, ...stepsMessage() });
      onChange(false);
      // S8: the card and the map already show the new state behind the celebration.
      if (rode && !contextStale) onRide(before, rode, () => void perform({ type: "claimAll" }));
    }
  }
  input.addEventListener("input", updateSubmit);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    // FSD-AC1 R1 (Security L1): Enter follows the button rule; "" or "1e3" never reach perform as numbers.
    if (!canSubmitSteps(input.value, state.current.rawSteps).ok) { updateSubmit(); return; }
    void perform({ type: "steps", value: Number(input.value.trim()) });
  });
  allButton.addEventListener("click", () => void perform({ type: "claimAll" }));
  rideButton?.addEventListener("click", () => void perform({ type: "ride" }));
  render();
  const stop = dailyService.subscribe(session, day, (incoming, meta) => {
    if (meta.pending || meta.fromCache) {
      state.serverConfirmed = false;
      updateReady();
      status.textContent = meta.pending ? "同步中；尚未確認。" : "僅有本機快取；操作已停用。";
      render(); onChange(true);
      return;
    }
    state.subscriptionFailed = false;
    state.exists = meta.exists;
    if (!meta.exists) {
      state.serverConfirmed = state.current.eventSeq === 0;
      if (!state.busy) status.textContent = day === "today" ? "尚無伺服器文件；初始化中…" : ""; // 2026-10-06: no line for a confirmed empty yesterday
    } else if (dailyStateDominates(incoming, state.current)) {
      state.current = incoming;
      state.serverConfirmed = true;
      if (!state.busy) status.textContent = ""; // FSD-08A-5 2: no message once in sync (problems still show)
    } else {
      state.serverConfirmed = false;
      status.textContent = "等待伺服器顯示最新已確認數值；操作暫停。";
    }
    updateReady(); render(); onChange(true);
  }, (error) => {
    if (contextStale) return;
    state.subscriptionFailed = true;
    updateReady();
    showError(dailyErrorMessage(error));
    status.textContent = "連線中斷或資料無法確認；畫面可能是上次讀取值，操作已停用。";
    render(); onChange(true);
  });
  if (day === "today") {
    void dailyService.ensureDay(session, "today").catch((error: unknown) => {
      if (contextStale) return;
      showError(error instanceof Error ? error.message : "初始化失敗。");
      status.textContent = "未能連接共享服務，操作已停用。";
    });
  }
  const settled = () => state.serverConfirmed && !state.subscriptionFailed;
  return { stop, settled, confirmed: () => (settled() && state.exists ? state.current : null) };
}

/** FSD-08C S2: updates the track in place so the shoe and the fill slide (CSS transitions) instead of being redrawn. */
function syncPointsTrack(box: HTMLElement, effectiveSteps: number, claimed: number): void {
  const track = box.querySelector<HTMLElement>(".pt");
  if (!track) { box.innerHTML = pointsTrackView(effectiveSteps, claimed); return; }
  const f = trackFraction(effectiveSteps);
  track.setAttribute("aria-label", pointsTrackLabel(effectiveSteps, claimed));
  track.querySelectorAll<HTMLElement>(".pt-bar b").forEach((b, i) => { b.style.setProperty("--w", `${(Math.max(0, Math.min(1, f * 3 - i)) * 100).toFixed(2)}%`); });
  const shoe = track.querySelector<HTMLElement>(".pt-shoe");
  if (shoe) shoe.style.setProperty("--at", `${(f * 100).toFixed(2)}%`);
  const nodes = track.querySelector<HTMLElement>(".pt-nodes");
  if (nodes) nodes.innerHTML = pointsNodesView(effectiveSteps, claimed);
}

let yesterdayPromptEvaluated = false;

function promptStorage(): PromptStorage | null {
  try { return window.localStorage; } catch { return null; }
}

/**
 * Fixed reminder (refreshed on every change) plus the first-entry prompt (P28), which is decided once,
 * on the first server-confirmed snapshot of yesterday, never after the member's own catch-up action.
 */
function showYesterdayReminder(session: SignedInSession, panel: DailyPanel, fromSnapshot: boolean): void {
  if (contextStale) return;
  const confirmed = panel.confirmed();
  const points = yesterdayClaimable(panel) ?? 0;
  // 2026-10-06 (3): the fixed reminder above the map is gone; the bell carries it (refreshed here).
  shell?.refreshNotices();
  if (!fromSnapshot || yesterdayPromptEvaluated || !panel.settled()) return;
  // Team dialog or coupon congratulation open: postpone (not discard); closing it evaluates again.
  if (teamPanel?.isDialogOpen() || perfectWeek?.isPromptOpen() || rewards?.isOverlayOpen() || shell?.isDrawerOpen()) return;
  yesterdayPromptEvaluated = true;
  if (!confirmed) return;
  const key = yesterdayPromptKey(session.context.sessionId, session.member.memberId, confirmed.taskDate);
  if (!claimYesterdayPrompt(promptStorage(), key, points)) return;
  const overlay = document.createElement("div");
  overlay.id = "yesterday-prompt";
  overlay.className = "stale-overlay";
  overlay.setAttribute("role", "alertdialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "yesterday-prompt-title");
  overlay.innerHTML = yesterdayPromptView(points, confirmed.taskDate);
  document.body.append(overlay);
  // The coupon congratulation waits behind this prompt (FSD-04A): evaluate it once this one closes.
  // Focus moves first; only then may the postponed congratulation open on top (it takes the focus itself).
  const close = (after?: () => void) => { overlay.remove(); after?.(); if (!contextStale) { perfectWeek?.evaluatePrompt(); rewards?.refresh(); } };
  overlay.querySelector<HTMLButtonElement>("#yesterday-prompt-close")?.addEventListener("click", () => close());
  overlay.querySelector<HTMLButtonElement>("#yesterday-prompt-go")?.addEventListener("click", () => close(() => {
    shell?.goto("steps");
    shell?.reveal('[data-day="yesterday"]'); // FSD-08A-6 (14): switch to the 昨日 tab first
    document.querySelector<HTMLElement>('[data-day="yesterday"]')?.scrollIntoView({ block: "start" });
    document.querySelector<HTMLButtonElement>("#yesterday-claim-all")?.focus();
  }));
  overlay.querySelector<HTMLButtonElement>("#yesterday-prompt-go")?.focus();
}

function userFacingIdentityError(error: unknown): string {
  if (!(error instanceof IdentityError)) return "目前無法登入，請確認網路後再試。";
  switch (error.code) {
    case "INVALID_CREDENTIALS": return "電子郵件或密碼不正確，請再試一次。";
    case "ACCOUNT_NOT_ALLOWED": return "此帳號尚未開通展示權限，請聯絡產品管理者。";
    case "SESSION_CHANGED": return "登入狀態已變更，請重新登入。";
    case "NETWORK_UNAVAILABLE": return "目前連線不穩，請確認網路後再試。";
    case "SERVICE_NOT_CONFIGURED": return "展示登入服務尚未設定，請聯絡產品管理者。";
    default: return "目前無法登入，請稍後再試。";
  }
}

// D3: a first visit (no page in the URL) shows the home mock; a reload inside the app (#steps…) while still
// signed in goes straight back to the app.
if ((SHELL_PAGES as readonly string[]).includes(location.hash.replace(/^#/, ""))) {
  app.innerHTML = "";
  restoredUsed = true;
  void restored.then((result) => { if (result.session) enterApp(result.session); else showHome(); });
} else {
  showHome();
}
