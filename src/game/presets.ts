// Prepared states for testing on a phone or in the bot (web build only): #staff, #dessert, #finish,
// #daily (five stars: daily orders, today's special, Night Shift), #giftrare and #giftfox (the 7-day gift on day 3 or 7).
// Each preset saves under its own key (save.ts), so real progress is never touched.
import { app, dayKey } from '@core';
import { Cafe, newRunState } from '../logic/cafe.ts';
import { save } from '../save';
import { content } from './content';

const ALL_TUTORIAL = ['make', 'serve', 'upgrade', 'tea', 'adopt', 'helper', 'vip', 'bakery', 'rush'];

function build(steps: (cafe: Cafe) => void) {
  const s = newRunState(content, 'main', app.rng.int(1, 2 ** 31 - 1));
  const cafe = new Cafe(content, s);
  s.coins = 1e15;
  steps(cafe);
  s.vipOn = true;
  save.data.run = s;
  save.data.tutorial = [...ALL_TUTORIAL];
  save.data.daily = { lastClaim: new Date().toISOString().slice(0, 10), streak: 1 };
}

const levels = (cafe: Cafe, id: string, n: number) => {
  while (cafe.s.items[id].level < n && cafe.buyItemLevel(id));
};

export const PRESETS: Record<string, () => void> = {
  // Coffee floor done, Bakery open, a few helpers.
  staff: () =>
    build((cafe) => {
      cafe.unlockItem('tea');
      levels(cafe, 'coffee', 30);
      levels(cafe, 'tea', 25);
      cafe.buySeat(0);
      cafe.buySeat(0);
      cafe.openFloor(1);
      levels(cafe, 'croissant', 12);
      for (const id of ['capybara', 'cat', 'shiba']) cafe.adopt(false, id);
      cafe.s.adopts = 3;
      cafe.s.served = 260;
      cafe.s.coins = 80000;
    }),
  // Every floor open, most helpers.
  dessert: () =>
    build((cafe) => {
      cafe.unlockItem('tea');
      levels(cafe, 'coffee', 80);
      levels(cafe, 'tea', 70);
      for (let i = 0; i < 3; i++) {
        cafe.openFloor(i);
        cafe.buySeat(i);
        cafe.buySeat(i);
      }
      cafe.unlockItem('cake');
      cafe.unlockItem('bubbletea');
      levels(cafe, 'croissant', 50);
      levels(cafe, 'cake', 40);
      levels(cafe, 'icecream', 25);
      levels(cafe, 'bubbletea', 10);
      for (const id of ['capybara', 'cat', 'shiba', 'penguin', 'redpanda', 'axolotl']) cafe.adopt(false, id);
      cafe.s.adopts = 7;
      cafe.s.served = 2400;
      cafe.s.coins = 5e8;
    }),
  // One level away from the fifth star.
  finish: () => {
    PRESETS.dessert();
    const cafe = new Cafe(content, save.data.run!);
    cafe.s.coins = 1e15;
    levels(cafe, 'bubbletea', 24);
    cafe.s.coins = 5e9;
  },
  // Five stars: the day's orders and special start when the cafe opens.
  daily: () => {
    PRESETS.finish();
    const cafe = new Cafe(content, save.data.run!);
    cafe.s.coins = 1e15;
    levels(cafe, 'bubbletea', 25);
    cafe.s.finishedAt = 40 * 60;
    cafe.s.time = 40 * 60;
    cafe.s.coins = 2e10;
    cafe.s.rate = 3e7;
    cafe.s.autoRate = 2e7;
    // The task chain as a player would have it by now: every task already done is claimed.
    while (cafe.claimTask() > 0);
    cafe.s.coins = 2e10;
    save.data.firstFinishMs = 40 * 60 * 1000;
  },
  // The 7-day gift opens on day 3 (Rare pal) or day 7 (Snow Fox).
  giftrare: () => {
    PRESETS.staff();
    gift(3);
  },
  giftfox: () => {
    PRESETS.daily();
    gift(7);
  },
};

/** Yesterday was day n - 1 of the streak, so today's gift is day n. */
function gift(n: number) {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  save.data.daily = { lastClaim: dayKey(y), streak: n - 1 };
}
