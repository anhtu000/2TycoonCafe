// Tests for the cafe logic. Run: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkContent } from './content.ts';
import { Cafe, newRunState } from './cafe.ts';
import { checkDecor, decorTipMult } from './decor.ts';

const read = (p: string) => JSON.parse(readFileSync(new URL(`../content/${p}`, import.meta.url), 'utf8'));
const content = checkContent({ cafe: read('cafe.json'), staff: read('staff.json'), upgrades: read('upgrades.json'), tasks: read('tasks.json') });

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

test('stars reached by a purchase are celebrated on the next step', () => {
  const cafe = fresh();
  cafe.s.coins = 1e12;
  cafe.s.served = 20;
  cafe.step(0.1);
  assert.equal(cafe.stars(), 1);
  cafe.openFloor(1);
  const events = cafe.step(0.1);
  assert.ok(events.some((e) => e.type === 'star' && e.stars === 2), 'opening the bakery gives star 2 with its event');
  for (const id of ['capybara', 'cat', 'shiba', 'koala']) cafe.adopt(false, id);
  assert.ok(cafe.step(0.1).some((e) => e.type === 'star' && e.stars === 3), 'the fourth helper gives star 3 with its event');
});

test('milestone levels send an event', () => {
  const cafe = fresh();
  cafe.s.coins = 1e12;
  while (cafe.s.items.coffee.level < 9) cafe.buyItemLevel('coffee');
  assert.equal(cafe.step(0.1).filter((e) => e.type === 'milestone').length, 0);
  cafe.buyItemLevel('coffee');
  const m = cafe.step(0.1).find((e) => e.type === 'milestone');
  assert.ok(m && m.type === 'milestone' && m.item === 'coffee' && m.level === 10 && m.mult === 2);
});

test('tasks: claim pays coins and moves on; a done task among the next three comes first', () => {
  const cafe = fresh();
  const list = content.tasks.tasks;
  const first = cafe.task()!;
  assert.equal(first.id, list[0].id);
  assert.equal(cafe.claimTask(), 0, 'nothing to claim before the task is done');
  // Make the second task done but not the first: it is shown first and can be claimed out of order.
  const second = list[1];
  assert.ok(!cafe.taskDone(first));
  cafe.s.coins = 1e6;
  if (second.type === 'seats') cafe.buySeat(0);
  else if (second.type === 'unlock') cafe.unlockItem(second.item!);
  cafe.s.coins = 0;
  assert.ok(cafe.taskDone(second), `set up for ${second.id}`);
  assert.equal(cafe.task()!.id, second.id);
  const before = cafe.s.coins;
  const paid = cafe.claimTask();
  assert.ok(paid >= content.tasks.rewardMin);
  assert.equal(cafe.s.coins - before, paid);
  assert.equal(cafe.task()!.id, first.id, 'back to the first open task');
  assert.equal(cafe.tasksClaimed(), 1);
  // Finish the first: the chain start moves past both.
  while (!cafe.taskDone(first)) {
    cafe.s.coins = 1e9;
    if (first.type === 'itemLevel') cafe.buyItemLevel(first.item!);
    else break;
  }
  cafe.claimTask();
  assert.equal(cafe.s.task, 2);
  assert.deepEqual(cafe.s.taskSkip, []);
});

test('tasks: every task can be done, decor tasks are skipped in a timed run', () => {
  const timed = new Cafe(content, newRunState(content, 'timed', 3));
  const decorAt = content.tasks.tasks.findIndex((t) => t.type === 'decor');
  timed.s.task = decorAt;
  assert.notEqual(timed.task()!.type, 'decor');
  // A cafe with everything maxed completes every task.
  const cafe = fresh();
  cafe.s.coins = 1e30;
  cafe.s.served = 1e6;
  cafe.s.vips = 1e4;
  cafe.decorCount = 99;
  content.cafe.floors.forEach((_, i) => {
    cafe.openFloor(i);
    while (cafe.buySeat(i));
  });
  for (const item of content.cafe.items) {
    cafe.unlockItem(item.id);
    while (cafe.buyItemLevel(item.id));
  }
  for (const u of content.upgrades) while (cafe.buyUpgrade(u.id));
  for (const a of content.staff.animals) for (let k = 0; k < content.staff.maxLevel; k++) cafe.adopt(false, a.id);
  cafe.s.totalEarned = 1e30;
  for (const t of content.tasks.tasks) assert.ok(cafe.taskDone(t), `task ${t.id} cannot be done`);
  let n = 0;
  while (cafe.claimTask() > 0) n++;
  assert.equal(n, content.tasks.tasks.length);
  assert.equal(cafe.task(), null);
});

test('Poki rewards come back after purchases, not after time', () => {
  const cafe = fresh();
  const need = content.cafe.rewarded.afterBuys.freeUpgrade ?? 0;
  assert.ok(cafe.rewardArmed('freeUpgrade'));
  cafe.useReward('freeUpgrade');
  if (need > 0) assert.ok(!cafe.rewardArmed('freeUpgrade'));
  run(cafe, 600);
  if (need > 0) assert.ok(!cafe.rewardArmed('freeUpgrade'), 'time alone does not bring it back');
  cafe.s.coins = 1e9;
  for (let i = 0; i < need; i++) assert.ok(cafe.buyItemLevel('coffee'));
  assert.ok(cafe.rewardArmed('freeUpgrade'));
  assert.equal(cafe.buysToArm('freeUpgrade'), 0);
});

test('free upgrade target: the dearest card not affordable yet, within the window', () => {
  const cafe = fresh();
  assert.equal(cafe.freeUpgradeTarget(), null, 'no free upgrade before the first helper');
  cafe.adopt(false, 'capybara');
  cafe.s.rate = 10;
  cafe.s.coins = 0;
  const id = cafe.freeUpgradeTarget();
  assert.ok(id && /^(item|up):/.test(id));
  const before = id!.startsWith('item:') ? cafe.s.items[id!.slice(5)].level : cafe.level(id!.slice(3));
  assert.ok(cafe.grantFree(id!));
  const after = id!.startsWith('item:') ? cafe.s.items[id!.slice(5)].level : cafe.level(id!.slice(3));
  assert.equal(after, before + 1);
});

test('item levels stop at the cap until the last floor opens', () => {
  const cafe = fresh();
  const cap = content.cafe.levelCapBeforeLastFloor!;
  cafe.s.coins = 1e30;
  while (cafe.buyItemLevel('coffee'));
  assert.equal(cafe.s.items.coffee.level, cap);
  assert.ok(cafe.levelCapped('coffee'));
  assert.equal(cafe.freeUpgradeTarget()?.startsWith('item:coffee') ?? false, false, 'no free level past the cap');
  content.cafe.floors.forEach((_, i) => cafe.openFloor(i));
  assert.ok(!cafe.levelCapped('coffee'));
  assert.ok(cafe.buyItemLevel('coffee'));
  assert.equal(cafe.s.items.coffee.level, cap + 1);
});

test('floor task: progress is coins saved toward the price, done when the floor opens', () => {
  const cafe = fresh();
  const t = content.tasks.tasks.find((x) => x.type === 'floor')!;
  const i = content.cafe.floors.findIndex((f) => f.id === t.floor);
  const price = content.cafe.floors[i].unlockCost;
  cafe.s.coins = price / 2;
  assert.deepEqual(cafe.taskProgress(t), { have: Math.floor(price / 2), need: price });
  cafe.s.coins = price * 3;
  assert.ok(!cafe.taskDone(t), 'enough coins is not enough: the floor must be opened');
  for (let k = 0; k <= i; k++) cafe.openFloor(k);
  assert.ok(cafe.taskDone(t));
});

/** A five-star main cafe (every floor and item open). */
function finished(seed = 7) {
  const cafe = fresh(seed);
  cafe.s.coins = 1e15;
  cafe.s.served = 20;
  for (let i = 0; i < 3; i++) cafe.openFloor(i);
  for (const id of ['capybara', 'cat', 'shiba', 'koala']) cafe.adopt(false, id);
  cafe.unlockItem('tea');
  cafe.unlockItem('cake');
  cafe.unlockItem('bubbletea');
  while (cafe.s.items.bubbletea.level < 25) cafe.buyItemLevel('bubbletea');
  cafe.step(0.1);
  assert.notEqual(cafe.s.finishedAt, null);
  cafe.s.coins = 0;
  return cafe;
}

test('daily orders and the special start only in a five-star main cafe, once per day', () => {
  const early = fresh();
  assert.equal(early.startDay('2026-11-01'), false);
  assert.equal(early.orders().length, 0);
  assert.equal(early.specialItem(), null);
  const cafe = finished();
  assert.equal(cafe.startDay('2026-11-01'), true);
  assert.equal(cafe.startDay('2026-11-01'), false);
  const orders = cafe.orders();
  assert.equal(orders.length, content.tasks.orders.perDay);
  assert.equal(new Set(orders.map((o) => o.type)).size, orders.length);
  const sp = cafe.specialItem()!;
  assert.ok(cafe.s.items[sp].unlocked);
  for (const o of orders) if (o.type === 'special') assert.equal(o.item, sp);
  // A new day: a different special than yesterday.
  for (let d = 2; d < 12; d++) {
    const prev = cafe.specialItem();
    assert.equal(cafe.startDay(`2026-11-${String(d).padStart(2, '0')}`), true);
    assert.notEqual(cafe.specialItem(), prev);
  }
  // A timed run has none.
  const timed = new Cafe(content, newRunState(content, 'timed', 3));
  timed.s.finishedAt = 10;
  assert.equal(timed.startDay('2026-11-01'), false);
});

test('the special sells for special.mult times more', () => {
  const cafe = finished();
  const before = cafe.itemValue('cake');
  cafe.startDay('2026-11-01');
  const sp = cafe.specialItem()!;
  const other = content.cafe.items.find((i) => i.id !== sp)!.id;
  cafe.s.day!.special = 'cake';
  assert.equal(cafe.itemValue('cake'), before * content.cafe.special!.mult);
  cafe.s.day!.special = other;
  assert.equal(cafe.itemValue('cake'), before);
});

test('orders count from the start of the day; the last claim gives the bonus helpers', () => {
  const cafe = finished();
  run(cafe, 30);
  cafe.startDay('2026-11-01');
  const s = cafe.s;
  s.day!.orders = [
    { type: 'served', need: 5 },
    { type: 'sold', need: 2, item: 'coffee' },
    { type: 'buys', need: 1 },
  ];
  assert.equal(cafe.orderProgress(s.day!.orders[0]).have, 0);
  assert.equal(cafe.claimOrder(0), null);
  s.served += 5;
  (s.sold ??= {}).coffee = (s.sold.coffee ?? 0) + 2;
  s.rate = 1000;
  const first = cafe.claimOrder(0)!;
  assert.equal(first.coins, Math.max(content.tasks.orders.rewardMin, 1000 * content.tasks.orders.rewardSec));
  assert.equal(first.bonus, 0);
  assert.equal(cafe.claimOrder(0), null, 'claimed once');
  assert.equal(cafe.claimOrder(1)!.bonus, 0);
  s.coins = 1e15;
  cafe.buyUpgrade('smile');
  assert.equal(cafe.claimOrder(2)!.bonus, content.tasks.orders.bonusTickets);
});

test('serving counts hand serves, servings per item and sales', () => {
  const cafe = finished();
  const c = { id: 999, floor: 0, seat: 0, item: 'coffee', phase: 'wait' as const, t: 0, patience: 20, maxPatience: 20, look: 0 };
  cafe.s.customers.push(c);
  cafe.s.items.coffee.ready = 1;
  const hand0 = cafe.s.hand ?? 0;
  const sold0 = cafe.s.sold?.coffee ?? 0;
  const sales0 = cafe.s.sales ?? 0;
  assert.equal(cafe.tapCustomer(999), 'served');
  assert.equal(cafe.s.hand, hand0 + 1);
  assert.equal(cafe.s.sold!.coffee, sold0 + 1);
  assert.ok(cafe.s.sales! > sales0);
});

test('the Snow Fox never comes from adoption; the gifts give it and a Rare pal', () => {
  const cafe = fresh(11);
  cafe.s.coins = 1e15;
  cafe.openFloor(1);
  cafe.openFloor(2);
  for (let i = 0; i < 400; i++) {
    const r = cafe.adopt(false)!;
    assert.notEqual(r.animal.id, 'snowfox');
  }
  const pal = fresh(5);
  const r = pal.giftRarePal();
  assert.equal(r.animal.rarity, 'rare');
  assert.ok(r.isNew);
  // Every Rare owned: an Epic not owned yet.
  for (const a of content.staff.animals.filter((x) => x.rarity === 'rare')) pal.giftAnimal(a.id);
  assert.equal(pal.giftRarePal().animal.rarity, 'epic');
  const fox = pal.giftAnimal('snowfox');
  assert.ok(fox.isNew);
  assert.equal(pal.giftAnimal('snowfox').level, 2);
  // Day 3 and day 7 of the gift.
  assert.equal(content.cafe.daily[2].rarePal, 1);
  assert.equal(content.cafe.daily[6].animal, 'snowfox');
});

test('Night Shift shows at five stars and adds offline hours', () => {
  const early = fresh();
  const night = content.upgrades.find((u) => u.id === 'nightshift')!;
  assert.equal(early.upgradeVisible(night), false);
  const cafe = finished();
  assert.equal(cafe.upgradeVisible(night), true);
  const h0 = cafe.stat('offlineHours');
  cafe.s.coins = 1e15;
  assert.ok(cafe.buyUpgrade('nightshift'));
  assert.equal(cafe.stat('offlineHours'), h0 + night.value);
});
