import { SaveStore, type DailyState } from '@core';
import type { RunState } from './logic/cafe.ts';

// Progress of this game. Everything here is saved automatically (core/save.ts).

export interface RunRecord {
  ms: number;
  /** Rarest animal hired in that run (rarity index). */
  best: number;
  /** dayKey of the run. */
  day: string;
}

export interface SaveData {
  /** The main cafe. null until the first visit. */
  run: RunState | null;
  /** Timed challenge, separate from the main cafe. */
  timed: RunState | null;
  mode: 'main' | 'timed';
  /** When the player left the main cafe for a timed run (ms), 0 = not away. Staff keep earning meanwhile. */
  mainLeftAt: number;
  /** Animals ever adopted (any run): id -> highest level. The staff book. */
  book: Record<string, number>;
  /** Tutorial steps already done. */
  tutorial: string[];
  daily: DailyState;
  /** Decorations owned. */
  decor: string[];
  /** When the decor shop's heart ad was last watched (ms). */
  decorAdAt: number;
  /** Best timed run in ms, 0 = none. Leaderboard metric for later (CLAUDE.md 4.4). */
  bestRunMs: number;
  records: RunRecord[];
  /** Main-cafe time to five stars, for the finish screen. */
  firstFinishMs: number;
  /** Free adoptions from daily gifts, not used yet. */
  tickets: number;
}

/**
 * Test builds only (web). Changing this wipes the test saves on the next load, so a new round of
 * testing starts from the beginning. #reset in the address does the same once.
 */
const WEB_SAVE_EPOCH = '2026-10-14a';

if (__TARGET__ === 'web') {
  try {
    const epochKey = `${__GAME_ID__}.webEpoch`;
    const asked = /(^#|\+)reset(\+|$)/.test(location.hash) || new URLSearchParams(location.search).has('reset');
    if (asked || localStorage.getItem(epochKey) !== WEB_SAVE_EPOCH) {
      for (const key of Object.keys(localStorage)) {
        if (key === `${__GAME_ID__}.save` || key.startsWith(`${__GAME_ID__}.preset.`)) localStorage.removeItem(key);
      }
      localStorage.setItem(epochKey, WEB_SAVE_EPOCH);
    }
    if (asked) {
      const hash = location.hash.replace(/(^#|\+)reset(?=\+|$)/, '$1').replace(/^#\+/, '#').replace(/\+$/, '').replace(/^#$/, '');
      history.replaceState(null, '', location.pathname + location.search + hash);
    }
  } catch {
    // no storage: every load is fresh anyway
  }
}

/** #<name> or ?preset=<name> (web build only): a prepared state under its own save key. */
export const preset =
  __TARGET__ === 'web'
    ? (new URLSearchParams(location.search).get('preset') ??
      (/^#[a-z+]+$/.test(location.hash) ? (location.hash.slice(1).split('+').find((p) => p && p !== 'debug' && p !== 'reset') ?? null) : null))
    : null;

const fresh = (): SaveData => ({
  run: null,
  timed: null,
  mode: 'main',
  mainLeftAt: 0,
  book: {},
  tutorial: [],
  daily: { lastClaim: null, streak: 0 },
  decor: [],
  decorAdAt: 0,
  bestRunMs: 0,
  records: [],
  firstFinishMs: 0,
  tickets: 0,
});

export const save = new SaveStore<SaveData>({
  key: preset ? `${__GAME_ID__}.preset.${preset}` : `${__GAME_ID__}.save`,
  version: 2,
  defaults: fresh,
  // Version 1 was the framework demo: nothing to keep.
  migrate: () => fresh(),
});
