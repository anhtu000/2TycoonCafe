// Tests for the cafe logic. Run: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkContent } from './content.ts';
import { Cafe, newRunState } from './cafe.ts';
import { checkDecor, decorTipMult } from './decor.ts';

const read = (p: string) => JSON.parse(readFileSync(new URL(`../content/${p}`, import.meta.url), 'utf8'));
const content = checkContent({ cafe: read('cafe.json'), staff: read('staff.json'), upgrades: read('upgrades.json') });

function fresh(seed = 7) {
  return new Cafe(content, newRunState(content, 'main', seed));
}

/** Runs the cafe for `sec` seconds in 0.1 s steps. */
function run(cafe: Cafe, sec: number) {
  for (let t = 0; t < sec; t += 0.1) cafe.step(0.1);
}

test('content and decor pass their checks', () => {
  assert.equal(content.cafe.goals.length, 5);
  const decor = checkDecor(read('decor.json'));
  assert.ok(decor.items.length >= 10 && decor.items.length <= 15);
  assert.equal(decorTipMult(decor, [decor.items[0].id, 'unknown']), 1 + decor.bonusPerItem);
});

test('a new cafe opens the coffee floor with coffee only', () => {
  const cafe = fresh();
  assert.equal(cafe.s.floors[0].open, true);
  assert.equal(cafe.s.floors[1].open, false);
  assert.equal(cafe.s.items.coffee.unlocked, true);
  assert.equal(cafe.s.items.tea.unlocked, false);
});

test('customers arrive, order coffee, and leave when patience runs out', () => {
  const cafe = fresh();
  run(cafe, 5);
  const waiting = cafe.s.customers.filter((c) => c.phase === 'wait');
  assert.ok(waiting.length >= 1);
  assert.ok(waiting.every((c) => c.item === 'coffee'));
  run(cafe, cafe.patience() + 3);
  assert.ok(cafe.s.lost >= 1);
});

test('calm mode keeps customers waiting (tutorial)', () => {
  const cafe = fresh();
  cafe.s.calm = true;
  run(cafe, 60);
  assert.equal(cafe.s.lost, 0);
});

test('tap the machine, then the customer: served by hand pays the hand bonus', () => {
  const cafe = fresh();
  cafe.s.calm = true;
  run(cafe, 3);
  const c = cafe.s.customers.find((x) => x.phase === 'wait')!;
  assert.equal(cafe.tapCustomer(c.id), 'notReady');
  assert.equal(cafe.tapStation('coffee'), 'start');
  while (cafe.s.items.coffee.ready === 0) {
    cafe.tapStation('coffee');
    cafe.step(0.1);
  }
  const before = cafe.s.coins;
  assert.equal(cafe.tapCustomer(c.id), 'served');
  assert.equal(cafe.s.served, 1);
  assert.ok(Math.abs(cafe.s.coins - before - cafe.itemValue('coffee') * content.cafe.handBonus) < 1e-6);
});

test('a helper makes and serves on its own', () => {
  const cafe = fresh();
  cafe.s.calm = true;
  cafe.adopt(false, 'capybara');
  assert.equal(cafe.s.assign.coffee, 'capybara');
  run(cafe, 40);
  assert.ok(cafe.s.served >= 3, `served ${cafe.s.served}`);
});

test('helpers never serve VIPs: those need the player', () => {
  const cafe = fresh();
  cafe.s.calm = true;
  cafe.adopt(false, 'capybara');
  cafe.s.vipOn = true;
  cafe.s.vipTimer = 0;
  run(cafe, 30);
  assert.ok(cafe.s.customers.some((c) => c.vip && c.phase === 'wait'));
});

test('while a station is empty, adoption brings a new animal', () => {
  const cafe = fresh(3);
  cafe.s.coins = 1e12;
  for (const f of [1, 2]) cafe.openFloor(f);
  for (const id of ['tea', 'cake', 'bubbletea']) cafe.unlockItem(id);
  const seen = new Set<string>();
  for (let i = 0; i < 6; i++) {
    const r = cafe.adopt(false)!;
    assert.ok(r.isNew, `adoption ${i} repeated ${r.animal.id}`);
    seen.add(r.animal.id);
  }
  assert.equal(seen.size, 6);
});

test('adoption pity: an Epic or better within 12, a Legendary within 50', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const cafe = fresh(seed);
    let sinceEpic = 0;
    let sinceLegend = 0;
    for (let i = 0; i < 200; i++) {
      const r = cafe.adopt(false)!;
      sinceEpic = r.rarity >= 2 ? 0 : sinceEpic + 1;
      sinceLegend = r.rarity >= 3 ? 0 : sinceLegend + 1;
      assert.ok(sinceEpic < 12 && sinceLegend < 50);
    }
  }
});

test('the odds shown match the weights', () => {
  const odds = fresh().adoptOdds();
  assert.ok(Math.abs(odds.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(Math.abs(odds[0] - 0.62) < 1e-9);
});

test('a max-level copy pays back half the price instead', () => {
  const cafe = fresh();
  for (let i = 0; i < content.staff.maxLevel; i++) cafe.adopt(false, 'cat');
  assert.equal(cafe.s.staff.cat, content.staff.maxLevel);
  const r = cafe.adopt(false, 'cat')!;
  assert.ok(r.refund > 0);
  assert.equal(cafe.s.staff.cat, content.staff.maxLevel);
});

test('stars come in order and the fifth ends the run', () => {
  const cafe = fresh();
  cafe.s.coins = 1e15;
  cafe.s.served = 20;
  assert.equal(cafe.stars(), 1);
  // Opening the dessert bar early does not skip the staff goal.
  cafe.openFloor(1);
  cafe.openFloor(2);
  assert.equal(cafe.stars(), 2);
  for (const id of ['capybara', 'cat', 'shiba', 'koala']) cafe.adopt(false, id);
  cafe.unlockItem('tea');
  cafe.unlockItem('bubbletea');
  assert.equal(cafe.stars(), 4);
  const events = cafe.step(0.1);
  while (cafe.s.items.bubbletea.level < 25) cafe.buyItemLevel('bubbletea');
  cafe.step(0.1, events);
  assert.equal(cafe.stars(), 5);
  assert.notEqual(cafe.s.finishedAt, null);
  assert.ok(events.some((e) => e.type === 'finish'));
});

test('offline income follows what the helpers earn, capped by the pantry', () => {
  const cafe = fresh();
  cafe.s.autoRate = 100;
  assert.equal(cafe.offlineIncome(30), 0);
  const twoHours = cafe.offlineIncome(2 * 3600);
  assert.equal(twoHours, Math.floor(100 * 2 * 3600 * content.cafe.offline.efficiency));
  assert.equal(cafe.offlineIncome(10 * 3600), twoHours);
});

test('item prices and seat prices grow, milestones raise value', () => {
  const cafe = fresh();
  cafe.s.coins = 1e12;
  const c1 = cafe.itemLevelCost('coffee');
  cafe.buyItemLevel('coffee');
  assert.ok(cafe.itemLevelCost('coffee') > c1);
  const v9 = cafe.itemValue('coffee', 9);
  const v10 = cafe.itemValue('coffee', 10);
  assert.ok(v10 / v9 > 2, 'level 10 doubles the value');
  const seat = cafe.seatCost(0)!;
  assert.ok(cafe.buySeat(0));
  assert.ok(cafe.seatCost(0)! > seat);
});
