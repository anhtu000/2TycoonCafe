// Tests for this game's 7-day gift streak (missed days pause it). Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claimDaily, dailyClaimedInCycle, dailyStatus, type DailyState } from '../../core/time.ts';
import { dayBefore, pausedStreak } from './daily.ts';

test('dayBefore crosses months, years and leap days', () => {
  assert.equal(dayBefore('2026-10-22'), '2026-10-21');
  assert.equal(dayBefore('2026-11-01'), '2026-10-31');
  assert.equal(dayBefore('2027-01-01'), '2026-12-31');
  assert.equal(dayBefore('2028-03-01'), '2028-02-29');
});

test('a missed day pauses the streak instead of going back to day 1', () => {
  const today = '2026-10-22';
  const s: DailyState = { lastClaim: '2026-10-18', streak: 5 };
  // Core alone: back to day 1.
  assert.equal(dailyStatus(s, today).streak, 1);
  // This game: day 6, and the five days already claimed stay ticked.
  const p = pausedStreak(s, today);
  assert.deepEqual(dailyStatus(p, today), { canClaim: true, streak: 6 });
  assert.equal(dailyClaimedInCycle(p, 7, today), 5);
  const next = claimDaily(p, today);
  assert.deepEqual(next, { lastClaim: today, streak: 6 });
  // Claimed: nothing more today.
  assert.equal(dailyStatus(pausedStreak(next, today), today).canClaim, false);
});

test('today, yesterday, never and a clock set back keep core rules', () => {
  const today = '2026-10-22';
  const never: DailyState = { lastClaim: null, streak: 0 };
  assert.equal(pausedStreak(never, today), never);
  const done: DailyState = { lastClaim: today, streak: 3 };
  assert.equal(pausedStreak(done, today), done);
  const yesterday: DailyState = { lastClaim: '2026-10-21', streak: 3 };
  assert.equal(pausedStreak(yesterday, today), yesterday);
  // Last claim "in the future" (clock moved back): untouched, so changing the clock gives no extra day.
  const future: DailyState = { lastClaim: '2026-10-25', streak: 4 };
  assert.equal(pausedStreak(future, today), future);
});

test('after day 7 the cycle starts again at day 1, pause or not', () => {
  const today = '2026-10-22';
  const s: DailyState = { lastClaim: '2026-10-10', streak: 7 };
  const p = pausedStreak(s, today);
  assert.equal(dailyStatus(p, today).streak, 8);
  // Day index in the 7-day cycle: (streak - 1) % 7 = 0, the first tile.
  assert.equal((dailyStatus(p, today).streak - 1) % 7, 0);
});
