import test from 'node:test';
import assert from 'node:assert/strict';
import { autoWeekPlan, AutoWeekError, runAutoWeek } from '../src/admin/auto-week.ts';
import { chestStageView } from '../src/ui/views.ts';

const session = (role = 'admin') => ({
  account: { authUid: 'uid-a' }, member: { memberId: 'YOI-A01', role, displayName: 'Ken' },
  context: { sessionId: 's6', clockVersion: 4, scenarioNow: '2026-10-07T15:30:00+08:00', activityWeekId: '2026-10-05' },
});

test('2026-10-06 (14) auto week: next Monday 09:00 to Sunday 09:00, seven targets', () => {
  assert.deepEqual(autoWeekPlan('2026-10-07T15:30:00+08:00'), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'].map((d) => `${d}T09:00:00+08:00`));
  assert.equal(autoWeekPlan('2026-10-12T08:00:00+08:00')[0], '2026-10-19T09:00:00+08:00');   // Monday: always a later week
  assert.equal(autoWeekPlan('2026-12-30T10:00:00+08:00')[6], '2027-01-10T09:00:00+08:00');
});

test('auto week: per day advance the clock, then 6,000 steps and claim-all on that day; each session carries the new clock', async () => {
  const calls = [];
  const ports = {
    apply: async (s, plan) => { calls.push(['apply', s.context.clockVersion, plan.to.clockVersion, plan.to.scenarioNow, plan.kind]); },
    ensureDay: async (s, day) => { calls.push(['ensure', s.context.clockVersion, day]); },
    execute: async (s, day, command) => { calls.push(['exec', s.context.clockVersion, day, command.type, command.value]); },
  };
  const progress = [];
  const end = await runAutoWeek(session(), ports, (d, p) => progress.push(`${d}${p}`));
  assert.equal(calls.length, 28);
  assert.deepEqual(calls.slice(0, 4), [['apply', 4, 5, '2026-10-12T09:00:00+08:00', 'advance'], ['ensure', 5, 'today'], ['exec', 5, 'today', 'steps', 6000], ['exec', 5, 'today', 'claimAll', undefined]]);
  assert.deepEqual(calls[24], ['apply', 10, 11, '2026-10-18T09:00:00+08:00', 'advance']);
  assert.deepEqual([end.clockVersion, end.scenarioNow, end.activityWeekId, end.sessionId], [11, '2026-10-18T09:00:00+08:00', '2026-10-12', 's6']);
  assert.equal(progress.length, 14);
});

test('auto week: a failure stops at once (no retry) and says how many days were done; members cannot run it', async () => {
  let applies = 0;
  const ports = {
    apply: async () => { applies += 1; },
    ensureDay: async () => {},
    execute: async (s) => { if (s.context.clockVersion === 7) throw new Error('連線中斷'); },
  };
  await assert.rejects(runAutoWeek(session(), ports, () => {}), (e) => e instanceof AutoWeekError && e.completedDays === 2 && /週三停止（連線中斷）。已完成 2 天；不會自動重試/.test(e.message));
  assert.equal(applies, 3);
  await assert.rejects(runAutoWeek(session('member'), ports, () => {}), /只有管理者/);
});

test('2026-10-06 (12): chest cards use the UI-design 3-5 pictures (grey box, red-ribbon gift, opened)', () => {
  const pic = (html) => html.match(/chest-card-svg--(\w+)/)?.[1];
  assert.equal(pic(chestStageView({ kind: 'progress', remaining: 114000, daysLeft: 3 }, true)), 'locked');
  assert.equal(pic(chestStageView({ kind: 'noTeam' }, true)), 'locked');
  assert.equal(pic(chestStageView({ kind: 'reached' }, true)), 'gift');
  assert.equal(pic(chestStageView({ kind: 'open', weekId: '2026-09-28', teamTotal: 314000, awardCount: 5, more: 0 }, true)), 'gift');
  const opened = chestStageView({ kind: 'opened', points: 15 }, true);
  assert.equal(pic(opened), 'opened');
  assert.match(opened, /<g transform="translate\(-30,-44\) rotate\(-12 100 56\)">/);
});
