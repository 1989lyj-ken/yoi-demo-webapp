/**
 * Dev-only UI preview (FSD-UI01). Renders every screen state from fake local data for screenshots.
 * Must never import main.ts, firebase/config, identity/firebase-*, firestore-shared-context,
 * daily-service or team-service (checked by tests/ui-tokens.test.mjs).
 */
import "./style.css";
import type { AuthenticatedSession } from "./identity/contracts";
import { showShowcaseApp } from "./showcase/app";
import { showAdminPanel } from "./admin/admin-panel";
import { escapeHtml } from "./ui/html";
import { appShellView, bellView, homeView, noticesView, chestOverlayView, drawerView, inviteCardView, mapHeroView, navButtonView, UPCOMING_NOTE, couponPromptView, couponsView, referralView, rewardsRecordView, rewardsView, dailyPointsView, loginView, guideView, introPageView, pointsTrackView, rideCelebrationView, todaySayView, perfectWeekView, sharedShellView, staleOverlayView, teamDialogView, teamEmptyView, teamRenameDialogView, teamView, yesterdayPromptView, type CouponCard, type PerfectWeekCard } from "./ui/views";
import { weekVerdict } from "./weekly/perfect-week-state";
import { SHELL_PAGES, UPCOMING_INTRO, type ShellPage } from "./app/shell-state";
import introWishlistUrl from "./assets/intro-wishlist.webp";
import { deriveNotices } from "./app/notices";
import yoxiHomeUrl from "./assets/yoxi-home.webp";
import { TEAM_NAME_HINTS, TEAM_NAME_MAX, teamNameUnits } from "./team/team-name";
import { leaveDialogCopy, teamControls, transferConfirmCopy, transferPickCopy, type TeamState } from "./team/team-state";

const session: AuthenticatedSession = {
  account: { authUid: "ui-preview", email: "preview@example.invalid" },
  member: { memberId: "YOI-P01", role: "admin", displayName: "預覽成員" },
  context: { sessionId: "ui-preview", scenarioNow: "2026-10-01T09:00:00+08:00", clockVersion: 7, activityWeekId: "2026-09-28" },
};
const week = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
const day = (rawSteps: number, points: number) => ({ rawSteps, points });

type Preset = {
  title: string;
  state?: Record<string, unknown>;
  page?: "steps" | "team" | "rewards" | "invite";
  then?: string[]; // selectors clicked after render, in order
  freezeTimers?: boolean;
  render?: () => void;
};

const base = { rawSteps: 0, points: 0, weeklyDays: {}, team: null, weeklyComplete: false, couponClaimed: false, chestEarned: false, chestOpened: false, chestOpening: false, chestReward: "", referralProgress: 0 };
const someDays = { [week[0]]: day(6000, 3), [week[1]]: day(6000, 3), [week[2]]: day(3000, 1) };
const team = (members: number, reached = false) => ({ name: "預覽成員的步行小隊", code: "YOI-AB12", members: ["預覽成員", ...Array.from({ length: members - 1 }, (_, i) => `展示隊員 ${i + 1}`)], weeklyGoalReached: reached });

const app = document.querySelector<HTMLDivElement>("#app")!;
const noop = () => {};

const previewContext = { scenarioNow: "2026-10-01T09:00:00+08:00", activityWeekId: "2026-09-28" };
const previewTeam = (overrides: Partial<TeamState> = {}): TeamState => ({ sessionId: "ui-preview", teamId: "A1B2C3D4E5F60718", leaderMemberId: "YOI-P01",
  memberIds: ["YOI-P01", "YOI-M02"], inviteCode: "A1B2C3D4E5F60718", status: "active", clockVersion: 7, createdAt: previewContext.scenarioNow,
  everFormed: true, nextJoinOrder: 2, revision: 1, ...overrides });

function renderTeamWeek(week: NonNullable<Parameters<typeof teamView>[4]>): void {
  renderShared();
  const c = teamControls({ confirmed: true, busy: false, selfId: "YOI-P01", context: previewContext, team: previewTeam(), tombstone: null });
  const el = document.getElementById("team-content");
  if (el) el.innerHTML = teamView({ status: "active", memberCount: 2, inviteCode: "A1B2C3D4E5F60718", leaderMemberId: "YOI-P01", title: "預覽成員的步行小隊" }, [
    { memberId: "YOI-P01", exists: true, pending: false, fromCache: false, rawSteps: 4500, effectiveSteps: 4500, rideCompleted: false },
    { memberId: "YOI-M02", exists: true, pending: false, fromCache: false, rawSteps: 6100, effectiveSteps: 9150, rideCompleted: true },
  ], true, { canLeave: c.canLeave, canTransfer: c.canTransfer, leaveMode: c.leaveMode, notice: c.notice }, week, undefined, "YOI-P01");
}

/** FSD-03E preview: the rename dialog with a draft (set as input.value, as the panel does). */
function showRename(draft: string, notice: string | null = null): void {
  renderShared();
  const scrim = document.createElement("div");
  scrim.id = "team-dialog";
  scrim.className = "confirm-scrim";
  scrim.innerHTML = teamRenameDialogView({ units: teamNameUnits(draft), max: TEAM_NAME_MAX, hints: TEAM_NAME_HINTS, busy: false, notice });
  document.body.append(scrim);
  const input = scrim.querySelector<HTMLInputElement>("#team-rename-input");
  if (input) input.value = draft;
}

function showDialog(input: Parameters<typeof teamDialogView>[0]): void {
  renderShared();
  const scrim = document.createElement("div");
  scrim.id = "team-dialog";
  scrim.className = "confirm-scrim";
  scrim.innerHTML = teamDialogView(input);
  document.body.append(scrim);
}

/** FSD-04A preview: a week card from a list of effective steps (null = no document) and Sunday's claimed points. */
function pwCard(weekId: string, steps: (number | null)[], sundayPoints: number, today: string, state: PerfectWeekCard["state"], label: "本週" | "上週" = "本週"): PerfectWeekCard {
  const dates = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(Number(weekId.slice(0, 4)), Number(weekId.slice(5, 7)) - 1, Number(weekId.slice(8, 10)) + i)).toISOString().slice(0, 10));
  const v = weekVerdict(weekId, steps.map((e, i) => (e === null ? null : { taskDate: dates[i], effectiveSteps: e, claimed: i === 6 ? sundayPoints : 0, eventSeq: 1 })), today);
  const days = v.days.map((d, i) => ({ ...d, effectiveSteps: steps[i], claimed: steps[i] === null ? null : i === 6 ? sundayPoints : Math.min(3, Math.floor((steps[i] ?? 0) / 2000)) }));
  return { label, confirmed: true, achievedCount: v.achievedCount, days, state, today };
}
const previewCoupons: CouponCard[] = [
  { key: "week-2026-09-21", kind: "weeklyPerfect", issuedAt: "2026-09-27T21:00:00+08:00", expiresAt: "2026-10-27T21:00:00+08:00", active: true, faceValue: 50, minFare: 150 },
  { key: "refbonus-YOI-M03", kind: "referralReward", issuedAt: "2026-09-29T10:00:00+08:00", expiresAt: "2026-11-28T10:00:00+08:00", active: true, faceValue: 100, minFare: null },
  { key: "week-2026-08-24", kind: "weeklyPerfect", issuedAt: "2026-08-30T20:00:00+08:00", expiresAt: "2026-09-29T20:00:00+08:00", active: false, faceValue: 50, minFare: 150 },
];
function renderPerfectWeek(current: PerfectWeekCard, previous: PerfectWeekCard | null, coupons: CouponCard[] | null): void {
  renderShared();
  const pw = document.getElementById("perfect-week-content");
  if (pw) pw.innerHTML = perfectWeekView(current, previous, current.today ?? null);
  const cp = document.getElementById("coupons-content");
  if (cp) cp.innerHTML = couponsView(coupons);
  document.getElementById("perfect-week-title")?.scrollIntoView();
}

function renderReferral(html: string): void {
  renderShared();
  const box = document.getElementById("referral-content");
  if (box) box.innerHTML = html;
  document.getElementById("referral-title")?.scrollIntoView();
}
function renderRewards(html: string): void {
  renderShared();
  const box = document.getElementById("rewards-content");
  if (box) box.innerHTML = html;
  document.getElementById("rewards-title")?.scrollIntoView();
}
function chestOverlay(html: string): void {
  const overlay = document.createElement("div"); overlay.className = "yo-chest-overlay"; overlay.innerHTML = html; document.body.append(overlay);
}

/** FSD-08A-1: the shell with the same sample panel data; the map always uses the illustration (no tiles, no location). */
function renderApp(page: ShellPage, extra?: () => void): void {
  shellView = true;
  renderShared();
  shellView = false;
  for (const id of SHELL_PAGES) {
    const section = document.querySelector<HTMLElement>(`[data-page="${id}"]`);
    if (section) section.hidden = id !== page;
    const nav = document.querySelector<HTMLElement>(`[data-nav="${id}"]`);
    if (nav) { nav.classList.toggle("selected", id === page); nav.innerHTML = navButtonView(id, id === page); if (id === page) nav.setAttribute("aria-current", "page"); else nav.removeAttribute("aria-current"); }
  }
  const hero = document.getElementById("map-hero");
  if (hero) hero.innerHTML = mapHeroView({ label: page === "steps" ? "尚未開啟定位" : "", offerLocate: true, ownPosition: false, steps: 4500, effective: 4500, fallback: true });
  const invite = document.getElementById("invite-card");
  if (invite) invite.innerHTML = inviteCardView({ kind: "share", code: "A1B2C3D4E5F60718", memberCount: 2 });
  extra?.();
}
function showDrawer(note: string | null): void {
  const drawer = document.createElement("div");
  drawer.id = "drawer"; drawer.className = "drawer";
  drawer.innerHTML = drawerView({ displayName: session.member.displayName, memberId: session.member.memberId, role: "admin", sessionId: session.context.sessionId, balance: 23, note });
  document.body.append(drawer);
}
let shellView = false;

const previewWeek = { total: 186_400, target: 300_000, reachedAt: null, confirmed: true, pending: false, contributions: { "YOI-P01": 98_200, "YOI-M02": 88_200 },
  pastMembers: [], previous: null, official: null, settling: false, own: null, need: 14_250 };

function renderShared(): void {
  app.innerHTML = shellView ? appShellView({ role: "admin" }) : sharedShellView({ displayName: session.member.displayName, memberId: session.member.memberId, role: "admin", sessionId: session.context.sessionId, scenarioNow: session.context.scenarioNow });
  const set = (id: string, html: string) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  set("today-date", "2026-10-01 個人任務");
  set("today-trip", pointsTrackView(5000, 1));
  set("today-say", todaySayView(5000, 1));
  set("today-points", dailyPointsView(1));
  const claim = document.querySelector<HTMLButtonElement>("#today-claim-all");
  if (claim) { claim.hidden = false; claim.textContent = "領取 1 點"; }
  set("today-status", "");
  set("yesterday-date", "2026-09-30・補同步至今日 24:00");
  set("yesterday-deadline", "補領截止至今日23:59:59。");
  set("yesterday-steps", "6,000");
  set("yesterday-claimable", "2");
  set("yesterday-ride-state", "已加成，步數 × 1.5 倍");
  const yNote = document.getElementById("yesterday-ride-note");
  if (yNote) { yNote.hidden = false; yNote.textContent = "實際走了 4,000 步"; }
  const yClaim = document.querySelector<HTMLButtonElement>("#yesterday-claim-all");
  if (yClaim) { yClaim.hidden = false; yClaim.textContent = "補領 2 點"; }
  set("yesterday-points", dailyPointsView(1));
  set("yesterday-status", "");
  const reminder = document.getElementById("yesterday-reminder");
  if (reminder) { reminder.textContent = "昨日（2026-09-30）還有 2 點可補領，截止：今日 24:00（Asia/Taipei）。"; reminder.hidden = false; }
  set("team-status", "");
  const controls = teamControls({ confirmed: true, busy: false, selfId: "YOI-P01", context: previewContext, team: previewTeam(), tombstone: null });
  set("team-content", teamView({ status: "active", memberCount: 2, inviteCode: "A1B2C3D4E5F60718", leaderMemberId: "YOI-P01", title: "預覽成員的步行小隊", canRename: true }, [
    { memberId: "YOI-P01", exists: true, pending: false, fromCache: false, rawSteps: 4500, effectiveSteps: 4500, rideCompleted: false },
    { memberId: "YOI-M02", exists: true, pending: false, fromCache: false, rawSteps: 6100, effectiveSteps: 9150, rideCompleted: true },
  ], true, { canLeave: controls.canLeave, canTransfer: controls.canTransfer, leaveMode: controls.leaveMode, notice: controls.notice }, previewWeek, (id) => (id === "YOI-P01" ? session.member.displayName : id === "YOI-M02" ? "成員小美" : id), "YOI-P01"));
  set("perfect-week-content", perfectWeekView(pwCard("2026-09-28", [6500, 7200, 4200, null, null, null, null], 0, "2026-10-01", "open"), null, "2026-09-29"));
  set("coupons-content", couponsView(previewCoupons));
  const input = document.querySelector<HTMLInputElement>("#today-steps-input");
  if (input) input.value = "4500";
  const yesterdayInput = document.querySelector<HTMLInputElement>("#yesterday-steps-input");
  if (yesterdayInput) yesterdayInput.value = "4000";
}

function renderSharedNoTeam(): void {
  renderShared();
  const el = document.getElementById("team-content");
  if (el) el.innerHTML = teamEmptyView(true);
  const error = document.getElementById("team-error");
  if (error) { error.textContent = "找不到此邀請碼。"; error.hidden = false; }
}

// An offline stand-in for AdminService: resolves only when asked, never touches Firebase.
const adminStub = (behaviour: "ok" | "hang") => ({ apply: () => (behaviour === "ok" ? Promise.resolve() : new Promise<void>(noop)) });

const presets: Record<string, Preset> = {
  "login": { title: "登入頁", render: () => { app.innerHTML = loginView(); } },
  "login-error": { title: "登入錯誤", render: () => { app.innerHTML = loginView(); const e = document.getElementById("login-error")!; e.textContent = "電子郵件或密碼不正確，請再試一次。"; e.hidden = false; } },
  "steps-0": { title: "步數：0 步", state: base },
  "steps-4000": { title: "步數：4,000 步、已領 1 點", state: { ...base, weeklyDays: { ...someDays, [week[3]]: day(4000, 1) } } },
  "steps-6000": { title: "步數：6,000 步、已領 3 點", state: { ...base, weeklyDays: { ...someDays, [week[3]]: day(6000, 3) } } },
  "steps-settings": { title: "設定面板展開", state: { ...base, weeklyDays: { [week[3]]: day(2500, 0) } }, then: ["[data-action='toggle-settings']"] },
  "steps-toast": { title: "Toast", state: base, then: ["[data-action='toggle-settings']", "[data-action='set-6000']"], freezeTimers: true },
  "team-empty": { title: "團隊：尚未加入", state: base, page: "team" },
  "team-1": { title: "團隊：1 人", state: { ...base, weeklyDays: { [week[3]]: day(4000, 1) }, team: team(1) }, page: "team" },
  "team-reached": { title: "團隊：已達標（單色勾號按鈕）", state: { ...base, weeklyDays: { [week[3]]: day(5200, 2) }, team: team(3, true), chestEarned: true }, page: "team" },
  "team-5": { title: "團隊：5 人", state: { ...base, weeklyDays: { [week[3]]: day(5200, 2) }, team: team(5) }, page: "team" },
  "rewards-locked": { title: "獎勵：寶箱未解鎖", state: { ...base, weeklyDays: { [week[3]]: day(4000, 2) } }, page: "rewards" },
  "rewards-earned": { title: "獎勵：寶箱可開、券已領", state: { ...base, team: team(3, true), chestEarned: true, couponClaimed: true }, page: "rewards" },
  "rewards-opened": { title: "獎勵：寶箱已開", state: { ...base, team: team(3, true), chestEarned: true, chestOpened: true, chestReward: "3 和泰 Points" }, page: "rewards" },
  "chest-animation": { title: "寶箱開啟動畫（固定）", state: { ...base, team: team(3, true), chestEarned: true }, page: "rewards", then: ["[data-action='open-chest']"], freezeTimers: true },
  "invite-none": { title: "邀請：尚無隊伍", state: base, page: "invite" },
  "invite-team": { title: "邀請：有隊伍、推薦進度 2", state: { ...base, team: team(2), referralProgress: 2 }, page: "invite" },
  "admin": { title: "管理畫面", render: () => showAdminPanel(session, adminStub("ok"), noop) },
  "admin-confirm-advance": { title: "管理：確認推進", render: () => showAdminPanel(session, adminStub("ok"), noop), then: ["[data-quick='monday']"] },
  "admin-confirm-reset": { title: "管理：確認重設", render: () => showAdminPanel(session, adminStub("ok"), noop), then: ["#reset-review"] },
  "admin-busy": { title: "管理：寫入中", render: () => showAdminPanel(session, adminStub("hang"), noop), then: ["[data-quick='day']", "#admin-apply"] },
  "admin-error": { title: "管理：錯誤（時間倒退）", render: () => { showAdminPanel(session, adminStub("ok"), noop); document.querySelector<HTMLInputElement>("#advance-input")!.value = "2026-09-30T09:00"; }, then: ["#advance-review"] },
  "shared": { title: "共享模式（靜態）", render: renderShared },
  "shared-no-team": { title: "共享模式：未組隊與錯誤", render: renderSharedNoTeam },
  "team-progress": { title: "團隊：本週進度（含歷史成員、每人每天）", render: () => renderTeamWeek({ total: 186_400, target: 300_000, reachedAt: null, confirmed: true, pending: false,
    contributions: { "YOI-P01": 98_200, "YOI-M02": 61_700, "YOI-M05": 26_500 }, pastMembers: ["YOI-M05"], previous: null, official: null, settling: false, own: null, need: 14_250 }) },
  "team-progress-reached": { title: "團隊：試算達標、結算中與上週補同步", render: () => renderTeamWeek({ total: 312_050, target: 300_000, reachedAt: "2026-10-01T15:30:00+08:00", confirmed: true, pending: true,
    contributions: { "YOI-P01": 170_000, "YOI-M02": 142_050 }, pastMembers: [], previous: { total: 287_300, reachedAt: null, official: null, settling: false, own: null }, official: null, settling: true, own: null, need: null }) },
  "team-progress-syncing": { title: "團隊：貢獻同步中", render: () => renderTeamWeek({ total: 0, target: 300_000, reachedAt: null, confirmed: false, pending: false, contributions: {}, pastMembers: [], previous: null, official: null, settling: false, own: null, need: null }) },
  "team-week-official": { title: "團隊：本週正式達標、本人已取得資格", render: () => renderTeamWeek({ total: 305_200, target: 300_000, reachedAt: "2026-10-01T15:30:00+08:00", confirmed: true, pending: false,
    contributions: { "YOI-P01": 160_000, "YOI-M02": 145_200 }, pastMembers: [], previous: null,
    official: { firstAt: "2026-10-01T15:30:00+08:00", advancedAt: null, awardCount: 2 }, settling: false, own: "awarded", need: null }) },
  "team-week-advanced": { title: "團隊：補同步提前達標、本人資格處理中", render: () => renderTeamWeek({ total: 318_000, target: 300_000, reachedAt: "2026-09-30T23:59:59+08:00", confirmed: true, pending: false,
    contributions: { "YOI-P01": 170_000, "YOI-M02": 148_000 }, pastMembers: [], previous: null,
    official: { firstAt: "2026-10-01T15:30:00+08:00", advancedAt: "2026-09-30T23:59:59+08:00", awardCount: 1 }, settling: true, own: "pending", need: null }) },
  "team-week-not-in-team": { title: "團隊：本週達標但本人達標時不在隊上", render: () => renderTeamWeek({ total: 301_000, target: 300_000, reachedAt: "2026-09-30T10:00:00+08:00", confirmed: true, pending: false,
    contributions: { "YOI-P01": 1_000, "YOI-M02": 300_000 }, pastMembers: [], previous: null,
    official: { firstAt: "2026-09-30T10:00:00+08:00", advancedAt: null, awardCount: 2 }, settling: false, own: "not-in-team", need: null }) },
  "team-week-previous": { title: "團隊：週一顯示上週正式結果", render: () => renderTeamWeek({ total: 12_400, target: 300_000, reachedAt: null, confirmed: true, pending: false,
    contributions: { "YOI-P01": 8_000, "YOI-M02": 4_400 }, pastMembers: [],
    previous: { total: 300_500, reachedAt: "2026-10-04T21:10:00+08:00", official: { firstAt: "2026-10-04T21:10:00+08:00", advancedAt: null, awardCount: 2 }, settling: false, own: "awarded" },
    official: null, settling: false, own: null, need: 41_086 }) },
  "team-empty-award": { title: "團隊：已退團者看到自己的寶箱資格", render: () => { renderShared(); const el = document.getElementById("team-content"); if (el) el.innerHTML = teamEmptyView(false, "本週已退出正式隊伍，下週一 2026-10-05 起可以再加入或建立隊伍。", ["您已取得本週寶箱資格（開箱功能後續開放）。"]); } },
  "perfect-week-progress": { title: "全勤：週中進度（含待同步、尚未到）", render: () => renderPerfectWeek(pwCard("2026-09-28", [6500, 7200, 4200, 3000, null, null, null], 0, "2026-10-01", "open"), null, []) },
  "perfect-week-issuing": { title: "全勤：七日達標、發券中", render: () => renderPerfectWeek(pwCard("2026-09-28", [6500, 7200, 6100, 6000, 9000, 6400, 6800], 3, "2026-10-04", "issuing"), null, []) },
  "perfect-week-pending": { title: "全勤：待發券", render: () => renderPerfectWeek(pwCard("2026-09-28", [6500, 7200, 6100, 6000, 9000, 6400, 6800], 3, "2026-10-04", "pending"), null, []) },
  "perfect-week-closed": { title: "全勤：本週未達成", render: () => renderPerfectWeek(pwCard("2026-09-28", [6500, 5200, 6100, 6000, null, null, null], 0, "2026-10-02", "closed"), null, previewCoupons) },
  "perfect-week-monday": { title: "全勤：週一顯示上週（週日點數未領也算全勤）", render: () => renderPerfectWeek(pwCard("2026-10-05", [3000, null, null, null, null, null, null], 0, "2026-10-05", "open"),
    pwCard("2026-09-28", [6500, 7200, 6100, 6000, 9000, 6400, 6800], 2, "2026-10-05", "open", "上週"), previewCoupons) },
  "coupons-list": { title: "獎勵券：只列有效券（過期不顯示）", render: () => { renderPerfectWeek(pwCard("2026-09-28", [6500, 7200, 6100, 6000, 9000, 6400, 6800], 3, "2026-10-04", "issued"), null, previewCoupons); } },
  "home": { title: "yoxi 首頁示意（進入 yoi）", render: () => { app.innerHTML = homeView({ screenshotUrl: yoxiHomeUrl }); } },
  "home-hint": { title: "yoxi 首頁示意：點其他地方的提示", render: () => { app.innerHTML = homeView({ screenshotUrl: yoxiHomeUrl }); document.getElementById("home-hint")!.hidden = false; } },
  "app-bell": { title: "主畫面：鈴鐺與通知面板", render: () => renderApp("steps", () => { const list = deriveNotices({ scenarioNow: "2026-10-05T13:00:00+08:00", taskDate: "2026-10-05", today: { rawSteps: 4000, effectiveSteps: 6000, claimable: 2 }, yesterdayClaimable: 1, couponIssuedAt: [], unopenedChests: 1, referralRewardAt: [] }); const slot = document.getElementById("bell-slot"); if (slot) slot.innerHTML = bellView(3); const panel = document.createElement("div"); panel.id = "notices"; panel.className = "notices"; panel.innerHTML = noticesView(list, (t) => t === "chest"); document.body.append(panel); }) },
  "app-steps": { title: "主畫面：步數頁（示意地圖）", render: () => renderApp("steps") },
  "app-guide": { title: "主畫面：Yoika 介紹（範例可左右滑）", render: () => renderApp("steps", () => { const g = document.createElement("div"); g.id = "guide"; g.className = "notices guide-overlay guide-shown"; g.innerHTML = guideView("yoika"); document.body.append(g); }) },
  "app-intro": { title: "主畫面：即將推出介紹頁（人生願望清單）", render: () => renderApp("steps", () => { const o = document.createElement("div"); o.id = "intro-page"; o.className = "intro-page"; o.innerHTML = introPageView({ ...UPCOMING_INTRO[1], src: introWishlistUrl }); document.body.append(o); }) },
  "app-ride": { title: "主畫面：搭車慶祝彈窗（FSD-08C）", render: () => renderApp("steps", () => { const o = document.createElement("div"); o.id = "ride-celebration"; o.className = "rc-overlay rc-play"; o.innerHTML = rideCelebrationView({ from: 5000, to: 7500, note: "多了 1 點可以領", claimable: 2 }); document.body.append(o); }) },
  "app-team": { title: "主畫面：團隊頁", render: () => renderApp("team") },
  "app-rewards": { title: "主畫面：獎勵頁", render: () => renderApp("rewards", () => { const box = document.getElementById("rewards-content"); if (box) box.innerHTML = rewardsView({ balance: 23, chests: ["2026-09-28"], rows: [], canOpen: true }, "top"); const cp = document.getElementById("coupons-content"); if (cp) cp.innerHTML = couponsView(previewCoupons); const rec = document.getElementById("rewards-record"); if (rec) rec.innerHTML = rewardsRecordView([{ label: "2026-09-21 週團隊寶箱・大獎", date: "2026-10-01", points: 12, at: "2026-10-01T09:30:00+08:00" }, { label: "每日任務", date: "2026-10-01", points: 3, at: null }]); }) },
  "app-invite": { title: "主畫面：邀請頁", render: () => renderApp("invite", () => { const box = document.getElementById("referral-content"); if (box) box.innerHTML = referralView({ myCode: "YOI-P01", own: null, mine: [], busy: false }); }) },
  "app-drawer": { title: "主畫面：漢堡選單（管理者）", render: () => renderApp("steps", () => showDrawer(null)) },
  "app-drawer-upcoming": { title: "主畫面：漢堡選單（點即將推出）", render: () => renderApp("steps", () => showDrawer(UPCOMING_NOTE)) },
  "referral-new": { title: "推薦新戶：尚未綁定", render: () => renderReferral(referralView({ myCode: "YOI-P01", own: null, mine: [], busy: false })) },
  "referral-bound": { title: "推薦新戶：已綁定、待首乘，已推薦兩人", render: () => renderReferral(referralView({ myCode: "YOI-P01", own: { referrerName: "成員小美", boundAt: "2026-10-01T09:00:00+08:00", firstRideAt: null }, mine: [{ name: "阿明", firstRide: true }, { name: "YOI-M04", firstRide: false }], busy: false })) },
  "rewards-chests": { title: "點數與寶箱：餘額、未開寶箱、紀錄", render: () => renderRewards(rewardsView({ balance: 23, chests: ["2026-09-28", "2026-10-05"], canOpen: true,
    rows: [{ label: "2026-09-21 週團隊寶箱・大獎", date: "2026-10-01", points: 12, at: "2026-10-01T09:30:00+08:00" }, { label: "每日任務", date: "2026-10-01", points: 3, at: null }, { label: "每日任務", date: "2026-09-30", points: 2, at: null }] })) },
  "rewards-syncing": { title: "點數與寶箱：同步中", render: () => renderRewards(rewardsView({ balance: null, chests: null, rows: null, canOpen: true })) },
  "chest-opening": { title: "寶箱：開啟中（可跳過）", render: () => { renderRewards(rewardsView({ balance: 23, chests: ["2026-10-05"], rows: [], canOpen: false })); chestOverlay(chestOverlayView({ kind: "opening", skipped: false })); }, freezeTimers: true },
  "chest-result": { title: "寶箱：結果", render: () => { renderRewards(rewardsView({ balance: 35, chests: [], rows: [], canOpen: false })); chestOverlay(chestOverlayView({ kind: "result", points: 12, tier: "大獎" })); } },
  "coupon-prompt": { title: "乘車券：恭喜入帳提示", render: () => { renderPerfectWeek(pwCard("2026-09-28", [6500, 7200, 6100, 6000, 9000, 6400, 6800], 3, "2026-10-04", "issued"), null, previewCoupons);
    const overlay = document.createElement("div"); overlay.className = "stale-overlay"; overlay.innerHTML = couponPromptView(); document.body.append(overlay); } },
  "team-rename": { title: "團隊：隊名編輯（03E）", render: () => showRename("走走隊") },
  "team-rename-over": { title: "團隊：隊名超過 12 字（03E）", render: () => showRename("一二三四五六七八九十甲乙丙", "隊名最多 12 個字") },
  "team-leave-dialog-awarded": { title: "團隊：退出確認（已取得本週寶箱資格）", render: () => showDialog({ ...leaveDialogCopy(previewTeam(), "YOI-M02", previewContext, true) }) },
  "team-leave-dialog": { title: "團隊：退出確認（隊長，已成團）", render: () => showDialog({ ...leaveDialogCopy(previewTeam({ memberIds: ["YOI-P01", "YOI-M02", "YOI-M03"], nextJoinOrder: 3 }), "YOI-P01", previewContext) }) },
  "team-leave-dialog-member": { title: "團隊：退出確認（一般成員）", render: () => showDialog({ ...leaveDialogCopy(previewTeam(), "YOI-M02", previewContext) }) },
  "team-cancel-dialog": { title: "團隊：取消招募確認", render: () => showDialog({ ...leaveDialogCopy(previewTeam({ status: "recruiting", everFormed: false, memberIds: ["YOI-P01"], nextJoinOrder: 1, revision: 0 }), "YOI-P01", previewContext) }) },
  "team-transfer-pick": { title: "團隊：更換隊長（選人）", render: () => showDialog({ ...transferPickCopy(), choices: [{ memberId: "YOI-M02", label: "成員小美", checked: true }, { memberId: "YOI-M03", label: "YOI-M03", checked: false }] }) },
  "team-transfer-confirm": { title: "團隊：更換隊長（確認）", render: () => showDialog({ ...transferConfirmCopy("YOI-M02") }) },
  "team-dialog-busy": { title: "團隊：對話框處理中", render: () => showDialog({ ...leaveDialogCopy(previewTeam(), "YOI-M02", previewContext), busy: true }) },
  "team-dialog-changed": { title: "團隊：對話框（隊伍已變動提示）", render: () => showDialog({ ...leaveDialogCopy(previewTeam(), "YOI-M02", previewContext), notice: "隊伍剛有變動，上方文字已更新，請重新確認。" }) },
  "team-week-locked": { title: "團隊：本週已退出（鎖定中）", render: () => {
    renderShared();
    const c = teamControls({ confirmed: true, busy: false, selfId: "YOI-P01", context: previewContext, team: null, tombstone: { leftWeekId: "2026-09-28" } });
    const el = document.getElementById("team-content");
    if (el) el.innerHTML = teamEmptyView(c.canCreateJoin, c.notice);
  } },
  "team-no-week": { title: "團隊：缺活動週（操作停用）", render: () => {
    renderShared();
    const c = teamControls({ confirmed: true, busy: false, selfId: "YOI-P01", context: { scenarioNow: previewContext.scenarioNow, activityWeekId: undefined }, team: previewTeam(), tombstone: null });
    const el = document.getElementById("team-content");
    if (el) el.innerHTML = teamView({ status: "active", memberCount: 2, inviteCode: "A1B2C3D4E5F60718", leaderMemberId: "YOI-P01" }, [], true,
      { canLeave: c.canLeave, canTransfer: c.canTransfer, leaveMode: c.leaveMode, notice: c.notice });
  } },
  "shared-yesterday-prompt": { title: "共享模式：昨日補領首次提示", render: () => {
    renderShared();
    const overlay = document.createElement("div");
    overlay.className = "stale-overlay";
    overlay.setAttribute("role", "alertdialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "yesterday-prompt-title");
    overlay.innerHTML = yesterdayPromptView(2, "2026-09-30");
    document.body.append(overlay);
  } },
  "stale": { title: "過期覆蓋層", state: base, then: [], render: undefined },
};

function showcase(preset: Preset): void {
  const runKey = `yoxi-showcase-run-v5:${session.context.sessionId}:${session.member.memberId}`;
  // Pre-seeding the run ID avoids crypto.randomUUID, which is missing on non-secure origins (LAN IP).
  localStorage.setItem(runKey, "preview-run");
  localStorage.setItem(`yoxi-showcase-v5:${session.context.sessionId}:${session.member.memberId}:preview-run`, JSON.stringify(preset.state ?? base));
  showShowcaseApp(session, noop, noop, noop);
  if (preset.page && preset.page !== "steps") document.querySelector<HTMLElement>(`[data-page="${preset.page}"]`)?.click();
}

const key = new URLSearchParams(location.search).get("view");
const preset = key ? presets[key] : undefined;
if (!preset) {
  app.innerHTML = `<main class="page-shell flex flex-col"><section class="login-card"><p class="eyebrow">開發專用・不連線</p><h1>UI 預覽</h1><p class="intro">以本機假資料渲染各畫面狀態，供 360 px 與桌機截圖檢查（FSD-UI01）。</p><ul>${Object.entries(presets).map(([id, p]) => `<li><a href="?view=${id}">${escapeHtml(p.title)}</a></li>`).join("")}</ul></section></main>`;
} else {
  if (preset.freezeTimers) {
    // Keep the toast and the chest animation on screen: drop the timers that would clear them.
    const realSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...rest: unknown[]) => (timeout ?? 0) >= 1000 ? 0 : realSetTimeout(handler, timeout, ...rest)) as typeof window.setTimeout;
  }
  if (preset.render) preset.render(); else showcase(preset);
  for (const selector of preset.then ?? []) document.querySelector<HTMLElement>(selector)?.click();
  if (key === "stale") {
    const overlay = document.createElement("div");
    overlay.className = "stale-overlay";
    overlay.setAttribute("role", "alertdialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "stale-title");
    overlay.innerHTML = staleOverlayView();
    document.body.append(overlay);
  }
}
