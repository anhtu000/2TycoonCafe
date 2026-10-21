// The 7-day gift streak of this game (CLAUDE.md 5a, 22/10): a missed day pauses the streak instead of
// sending it back to day 1. core/time.ts keeps the shared rule (back to day 1, used by game #1), so this game
// adjusts the saved state before core reads it: a claim two or more days ago counts as yesterday's.
import type { DailyState } from '../../core/time.ts';

/** Days from one dayKey (YYYY-MM-DD) to another; negative when `to` is earlier. */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** The day before a dayKey, as a dayKey. */
export function dayBefore(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) - 86_400_000);
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(t.getUTCDate()).padStart(2, '0');
  return `${t.getUTCFullYear()}-${mm}-${dd}`;
}

/**
 * The daily state as core should see it today. A last claim two or more days back is moved to yesterday,
 * so the next claim continues the streak. Today, yesterday, never claimed, or a clock set back
 * (last claim after today) are left as they are: core's own rule applies, and nobody can claim twice
 * by changing the clock.
 */
export function pausedStreak(state: DailyState, today: string): DailyState {
  if (!state.lastClaim) return state;
  return daysBetween(state.lastClaim, today) >= 2 ? { ...state, lastClaim: dayBefore(today) } : state;
}
