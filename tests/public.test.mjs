import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collection, doc, getDocFromServer, onSnapshot, query, runTransaction, serverTimestamp, Timestamp, where } from '../src/local/firestore.ts';
import { clockTargets, teammateSteps } from '../src/public/sim.ts';
import { TEAMMATES, todayAt9 } from '../src/public/world.ts';
import { simulatedForecast } from '../src/public/weather-sim.ts';
import { parseForecast } from '../src/weather/weather-state.ts';
import { KEEP_MS } from '../src/local/store.ts';

const db = {};
const tick = () => new Promise((r) => setTimeout(r, 0));

test('FSD-PA local Firestore: transactions write atomically with one server time; reads, queries and snapshots follow', async () => {
  const a = doc(db, 'demo', 'x'), b = doc(db, 'demo', 'y');
  await runTransaction(db, async (tx) => {
    assert.equal((await tx.get(a)).exists(), false);
    tx.set(a, { n: 1, at: serverTimestamp() });
    tx.set(b, { n: 2, at: serverTimestamp(), nested: { at: serverTimestamp() } });
  });
  const x = (await getDocFromServer(a)).data(), y = (await getDocFromServer(b)).data();
  assert.ok(x.at instanceof Timestamp);
  assert.ok(x.at.isEqual(y.at) && y.nested.at.isEqual(y.at));
  // update merges; a later write gets a later server time
  await runTransaction(db, async (tx) => { tx.update(a, { n: 5, at: serverTimestamp() }); });
  const x2 = (await getDocFromServer(a)).data();
  assert.equal(x2.n, 5);
  assert.ok(x2.at.toMillis() > x.at.toMillis() || x2.at.nanoseconds > x.at.nanoseconds);
  // queries: == and in, only direct children
  await runTransaction(db, async (tx) => {
    tx.set(doc(db, 'items', 'a'), { team: 'T', week: '1' });
    tx.set(doc(db, 'items', 'b'), { team: 'U', week: '2' });
    tx.set(doc(db, 'items', 'a', 'sub', 'z'), { team: 'T' });
  });
  const seen = [];
  const stop = onSnapshot(query(collection(db, 'items'), where('team', '==', 'T')), { includeMetadataChanges: true }, (s) => seen.push(s.docs.map((d) => d.id)));
  await tick();
  assert.deepEqual(seen, [['a']]);
  await runTransaction(db, async (tx) => { tx.set(doc(db, 'items', 'c'), { team: 'T' }); });
  await tick();
  assert.deepEqual(seen.at(-1), ['a', 'c']);
  stop();
  const inSeen = [];
  onSnapshot(query(collection(db, 'items'), where('week', 'in', ['1', '2'])), (s) => inSeen.push(s.size));
  await tick();
  assert.deepEqual(inSeen, [2]);
  // snapshots always count as server-confirmed
  const meta = [];
  onSnapshot(a, (s) => meta.push(s.metadata));
  await tick();
  assert.deepEqual(meta[0], { fromCache: false, hasPendingWrites: false });
});

test('FSD-PA world and simulation: today 09:00, three days kept, teammates fixed per day, clock targets day by day', () => {
  assert.equal(todayAt9(Date.parse('2026-10-12T20:30:00Z')), '2026-10-13T09:00:00+08:00');   // already the 13th in Taipei
  assert.equal(KEEP_MS, 3 * 24 * 3600_000);
  assert.deepEqual(TEAMMATES.map((t) => t.name), ['Michael', 'KC', 'Rosie', 'Show']);
  const michael = TEAMMATES[0];
  assert.equal(teammateSteps(michael, '2026-10-13'), teammateSteps(michael, '2026-10-13'));
  for (const d of ['2026-10-13', '2026-10-14', '2026-10-15']) {
    const v = teammateSteps(michael, d);
    assert.ok(v >= michael.steps * 0.9 && v <= michael.steps * 1.1, String(v));
  }
  // with all four teammates and Ken at 6,000 a day the team passes 30 萬 within six days
  const perDay = TEAMMATES.reduce((s, t) => s + t.steps, 0) + 6000;
  assert.ok(perDay * 6 >= 300_000, String(perDay));
  assert.deepEqual(clockTargets('tomorrow', '2026-10-14T09:00:00+08:00'), ['2026-10-15T09:00:00+08:00']);
  assert.deepEqual(clockTargets('monday', '2026-10-17T09:00:00+08:00'), ['2026-10-18T09:00:00+08:00', '2026-10-19T09:00:00+08:00']);
  const week = clockTargets('week', '2026-10-17T09:00:00+08:00');
  assert.equal(week.length, 8);
  assert.equal(week.at(-1), '2026-10-25T09:00:00+08:00');
});

test('FSD-PA-09: the simulated weather has the Open-Meteo shape and changes with the clock', () => {
  const kinds = new Set();
  for (const d of ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']) {
    const f = parseForecast(simulatedForecast(`${d}T09:00:00+08:00`));
    assert.equal(f.time, `${d}T09:00`);
    assert.equal(f.days.length, 2);
    kinds.add(f.code);
  }
  assert.ok(kinds.size >= 4);
  assert.doesNotThrow(() => parseForecast(simulatedForecast('2026-10-12T21:00:00+08:00')));
});

test('FSD-PA build: the public mode swaps Firebase for the local world; the internal build is unchanged', () => {
  const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  for (const m of ['app', 'auth', 'firestore']) assert.ok(config.includes(`{ find: /^firebase\\/${m}$/, replacement: fileURLToPath(new URL("./src/local/${m}.ts", import.meta.url)) }`), m);
  assert.ok(config.includes('build: mode === "public" ? { outDir: "dist-public" } : {}'));
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.ok(main.includes('if (IS_PUBLIC) ensureWorld();'));
  assert.ok(main.includes('onAdmin: session.member.role === "admin" && !IS_PUBLIC'));
  const hosting = JSON.parse(readFileSync(new URL('../firebase.public.json', import.meta.url), 'utf8'));
  assert.equal(hosting.hosting.public, 'dist-public');
});

test('FSD-PA local Firestore: doc() continues from a parent document or collection', () => {
  const day = doc(db, 'dailySteps', 's', 'members', 'm', 'days', '2026-10-12');
  assert.equal(doc(day, 'events', '3').path, 'dailySteps/s/members/m/days/2026-10-12/events/3');
  assert.equal(doc(collection(db, 'teams', 's', 'items'), 'T1').path, 'teams/s/items/T1');
});

test('FSD-PA-07: the checklist reads the visitor world (ten items, done from the data)', async () => {
  const { commit } = await import('../src/local/store.ts');
  const { checklist, markBellOpened, CHECK_ITEMS } = await import('../src/public/checklist.ts');
  commit([{ path: 'demo/current', data: { sessionId: 'pub-t', scenarioNow: '2026-10-13T09:00:00+08:00', clockVersion: 2, activityWeekId: '2026-10-12' } }]);
  assert.equal(CHECK_ITEMS.length, 11);
  assert.ok(checklist().every((i) => !i.done));
  commit([{ path: 'dailySteps/pub-t/members/YOI-K01/days/2026-10-12', data: { rawSteps: 4000, claimed: 2, rideCompletedAt: '2026-10-12T09:00:00+08:00' } },
    { path: 'dailySteps/pub-t/members/YOI-K01/days/2026-10-12/events/3', data: { kind: 'claim', occurredAt: '2026-10-13T09:00:00+08:00' } }]);
  markBellOpened();
  const done = Object.fromEntries(checklist().map((i) => [i.id, i.done]));
  assert.deepEqual(done, { steps: true, claim: true, ride: true, yesterday: true, team: false, name: false, chest: false, coupon: false, referral: false, bell: true, weather: false });
  assert.deepEqual(checklist().filter((i) => i.optional).map((i) => i.id), ['weather']);
  const { teamGoalUsed, markTeamGoalUsed } = await import('../src/public/checklist.ts');
  assert.equal(teamGoalUsed(), false);
  markTeamGoalUsed();
  assert.equal(teamGoalUsed(), true);
  const { checklistView, toolCardView } = await import('../src/public/views.ts');
  const ten = checklist().map((i) => ({ ...i, done: !i.optional }));
  assert.match(checklistView(ten), /全部體驗完成！/);   // the location item may be skipped
  assert.match(toolCardView('x', 't', 'p', [{ action: 'goal', label: '已使用過一鍵模擬團隊達標', disabled: true }]), /data-pub-action="goal" disabled>已使用過一鍵模擬團隊達標/);
});

test('FSD-PA: the public build names the browser tab 公開測試版', () => {
  const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.ok(config.includes('html.replace("<title>yoi 遊移遊戲｜展示版</title>", "<title>yoi 遊移遊戲｜公開測試版</title>")'));
  assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /<title>yoi 遊移遊戲｜展示版<\/title>/);
});

test('2026-10-14 SEO: the public build has a meta description (您, never 你); the internal demo is noindex', () => {
  const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  const description = config.match(/const PUBLIC_DESCRIPTION = "([^"]+)"/)?.[1] ?? '';
  assert.match(description, /^不搭車，也打開 yoxi。/);
  assert.match(description, /陪您出行/);
  assert.doesNotMatch(description, /你/);
  assert.match(config, /name: "description", content: PUBLIC_DESCRIPTION/);
  assert.match(config, /name: "robots", content: "noindex"/);
});

test('2026-10-12: feedback goes to the Google Form in a new tab (menu, and the completed checklist); nothing is sent by the app', async () => {
  const { FEEDBACK_URL, PUBLIC_TOOLS, checklistView, ABOUT_ITEMS } = await import('../src/public/views.ts');
  assert.equal(FEEDBACK_URL, 'https://forms.gle/6Pgw6uG15NGRVqsSA');
  assert.deepEqual(PUBLIC_TOOLS.slice(-2).map((t) => t.id), ['tool-restart', 'tool-feedback']);   // under 重新開始體驗
  const done = checklistView([{ id: 'a', label: 'A', hint: '', done: true }]);
  assert.match(done, /<a class="yo-primary yo-full pub-feedback" href="https:\/\/forms\.gle\/6Pgw6uG15NGRVqsSA" target="_blank" rel="noopener noreferrer">填寫回饋/);
  assert.doesNotMatch(checklistView([{ id: 'a', label: 'A', hint: '', done: false }]), /pub-feedback/);
  assert.ok(ABOUT_ITEMS.some((t) => t.includes('Google 表單') && t.includes('不會自動帶入')));
  const mount = readFileSync(new URL('../src/public/mount.ts', import.meta.url), 'utf8');
  assert.ok(mount.includes('window.open(FEEDBACK_URL, "_blank", "noopener,noreferrer")'));
});
