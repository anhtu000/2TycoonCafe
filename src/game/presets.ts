// Prepared states for testing on a phone or in the bot (web build only): #staff, #dessert, #finish.
// Each preset saves under its own key (save.ts), so real progress is never touched.
import { app } from '@core';
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
};
