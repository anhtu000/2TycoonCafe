// Tests for the v2 mechanics (CLAUDE.md 5a, "Bản v2"): hand-serve chain, naps, moods, special guests,
// dumbwaiter sets, best friends, tour groups, traits. Run: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkContent, type Content } from './content.ts';
import { Cafe, newRunState, type CafeEvent, type Customer } from './cafe.ts';

const read = (p: string) => JSON.parse(readFileSync(new URL(`../content/${p}`, import.meta.url), 'utf8'));
const base = () => checkContent({ cafe: read('cafe.json'), staff: read('staff.json'), upgrades: read('upgrades.json'), tasks: read('tasks.json') });

function cafeWith(tweak?: (c: Content) => void, seed = 11) {
  const content = base();
  tweak?.(content);
  const cafe = new Cafe(content, newRunState(content, 'main', seed));
  return cafe;
}

function run(cafe: Cafe, sec: number, events: CafeEvent[] = []) {
  for (let t = 0; t < sec; t += 0.1) cafe.step(0.1, events);
  return events;
}

/** Opens every floor and item with no cost, tutorial over. */
function grown(cafe: Cafe) {
  const s = cafe.s;
  s.coins = 1e15;
  s.served = 500;
  s.vipOn = true;
  s.calm = false;
  cafe.content.cafe.floors.forEach((_, i) => cafe.openFloor(i));
  for (const it of cafe.content.cafe.items) cafe.unlockItem(it.id);
  for (const f of s.floors) f.seats = 4;
  return cafe;
}

/** A waiting customer placed by hand. */
function put(cafe: Cafe, c: Partial<Customer> & { floor: number; item: string }) {
  const s = cafe.s;
  const full: Customer = { id: s.nextId++, seat: 0, phase: 'wait', t: 0, patience: 100, maxPatience: 100, look: 0, ...c };
  s.customers.push(full);
  return full;
}

test('v2 content passes its checks: journey has one stop per star plus the start', () => {
  const c = base();
  assert.equal(c.cafe.journey.length, c.cafe.goals.length + 1);
  assert.ok(c.staff.animals.every((a) => a.trait));
  assert.ok(c.upgrades.some((u) => u.stat === 'lift'));
});

test('hand-serve chain: each serve in the window pays a step more, the first pays as usual, a beat counts double', () => {
  const cafe = grown(cafeWith());
  const s = cafe.s;
  s.customers = [];
  const value = cafe.itemValue('coffee') * (cafe.content.cafe.handBonus + cafe.stat('handTip'));
  const serveOne = (beat = false) => {
    const c = put(cafe, { floor: 0, item: 'coffee', seat: 0 });
    s.items.coffee.ready = 1;
    // Small numbers: at 1e15 coins a double cannot hold cents.
    s.coins = 0;
    const before = s.coins;
    assert.equal(cafe.tapCustomer(c.id, [], beat), 'served');
    s.customers = [];
    return s.coins - before;
  };
  assert.ok(Math.abs(serveOne() - value) < 1e-6);
  assert.ok(Math.abs(serveOne() - value * 1.05) < 1e-6);
  assert.equal(cafe.comboNow(), 2);
  serveOne(true);
  assert.equal(cafe.comboNow(), 4);
  // The window runs out: the chain starts again.
  s.time += cafe.comboWindow() + 0.1;
  assert.equal(cafe.comboNow(), 0);
  assert.ok(Math.abs(serveOne() - value) < 1e-6);
  assert.equal(s.bestCombo, 4);
  // Capped.
  assert.equal(cafe.comboMult(100), 1 + cafe.content.cafe.combo.step * cafe.content.cafe.combo.max);
});

test('naps: with two helpers at work one dozes off; asleep it is slow, a tap wakes it fast', () => {
  const cafe = grown(cafeWith());
  cafe.giftAnimal('capybara');
  cafe.giftAnimal('hamster');
  const events = run(cafe, cafe.content.cafe.naps.everyMax + 1);
  const nap = events.find((e) => e.type === 'nap');
  assert.ok(nap && nap.type === 'nap');
  const { animal, item } = nap;
  assert.ok(cafe.asleep(animal));
  const awake = cafe.animalSpeed(animal) * cafe.stat('staffSpeed');
  assert.ok(cafe.stationSpeed(item) < awake * 0.5);
  const ev: CafeEvent[] = [];
  assert.equal(cafe.wake(animal, ev), true);
  assert.equal(cafe.s.wakes, 1);
  assert.ok(ev.some((e) => e.type === 'woke' && !e.natural));
  assert.ok(cafe.stationSpeed(item) > awake * 1.5);
  assert.equal(cafe.wake(animal), false);
});

test('naps end by themselves after maxNap seconds', () => {
  const cafe = grown(cafeWith());
  cafe.giftAnimal('capybara');
  cafe.giftAnimal('hamster');
  cafe.s.napTimer = 0.05;
  const events = run(cafe, cafe.content.cafe.naps.maxNap + 1);
  assert.ok(events.some((e) => e.type === 'woke' && e.natural));
  assert.equal(Object.keys(cafe.s.naps ?? {}).length, 0);
});

test('moods: a moody customer orders what fits the mood, pays more and leaves a photo on the wall', () => {
  const cafe = grown(
    cafeWith((c) => {
      c.cafe.guests.giraffe.chance = 0;
      c.cafe.guests.elephant.chance = 0;
      c.cafe.guests.mouse.chance = 0;
      c.cafe.lift.chance = 0;
      c.cafe.moods.chance = 0.99;
    }),
  );
  cafe.s.customers = [];
  run(cafe, 6);
  const moody = cafe.s.customers.filter((c) => c.mood);
  assert.ok(moody.length > 0);
  for (const c of moody) {
    const mood = cafe.content.cafe.moods.list.find((m) => m.id === c.mood)!;
    assert.ok(mood.items.includes(c.item));
    assert.equal(cafe.floorIndexOf(c.item), c.floor);
  }
  const c = moody.find((x) => x.phase === 'wait') ?? moody[0];
  c.phase = 'wait';
  cafe.s.items[c.item].ready = 1;
  const plain = cafe.itemValue(c.item);
  assert.ok(Math.abs(cafe.orderValue(c) - plain * cafe.content.cafe.moods.pay) < 1e-6);
  assert.equal(cafe.tapCustomer(c.id), 'served');
  assert.equal(cafe.s.memories![c.floor], 1);
});

test('a giraffe sits on its floor and orders from the floor above; the helper up there serves it', () => {
  const cafe = grown(cafeWith());
  cafe.s.customers = [];
  cafe.giftAnimal('shiba');
  cafe.reassign();
  const g = put(cafe, { floor: 0, item: 'croissant', kind: 'giraffe', seat: 1 });
  cafe.s.assign = { croissant: 'shiba' };
  cafe.s.items.croissant.ready = 1;
  const events = run(cafe, 4);
  assert.ok(events.some((e) => e.type === 'served' && e.customer.id === g.id && !e.hand));
  assert.equal(cafe.s.guests!.giraffe, 1);
});

test('giraffes come only when the floor above is open', () => {
  const cafe = cafeWith((c) => {
    c.cafe.guests.giraffe.chance = 0.99;
    c.cafe.guests.giraffe.fromServed = 0;
  });
  const s = cafe.s;
  s.vipOn = true;
  s.served = 100;
  s.coins = 1e9;
  run(cafe, 20);
  assert.ok(!s.customers.some((c) => c.kind === 'giraffe'));
  cafe.openFloor(1);
  s.customers = [];
  run(cafe, 20);
  const g = s.customers.find((c) => c.kind === 'giraffe');
  assert.ok(g);
  assert.equal(g!.floor, 0);
  assert.equal(cafe.floorIndexOf(g!.item), 1);
});

test('an elephant takes two seats and needs two servings', () => {
  const cafe = grown(cafeWith());
  cafe.s.customers = [];
  const e = put(cafe, { floor: 0, item: 'coffee', kind: 'elephant', seat: 0, seat2: 1, need: 2, got: 0 });
  cafe.s.items.coffee.ready = 1;
  assert.equal(cafe.tapCustomer(e.id), 'partial');
  assert.equal(e.got, 1);
  assert.equal(cafe.tapCustomer(e.id), 'notReady');
  cafe.s.items.coffee.ready = 1;
  assert.equal(cafe.tapCustomer(e.id), 'served');
  assert.equal(cafe.s.sold!.coffee, 2);
});

test('elephants come only with two free seats side by side; mice need no seat', () => {
  const cafe = grown(
    cafeWith((c) => {
      c.cafe.guests.giraffe.chance = 0;
      c.cafe.guests.elephant.chance = 0.9;
      c.cafe.guests.mouse.chance = 0.5;
    }),
  );
  cafe.s.customers = [];
  run(cafe, 30);
  const all = cafe.s.customers;
  for (const c of all.filter((x) => x.kind === 'elephant')) assert.equal(c.seat2, c.seat + 1);
  for (const c of all.filter((x) => x.kind === 'mouse')) assert.equal(c.seat, -1);
  // No two customers share a seat on a floor.
  for (let f = 0; f < 3; f++) {
    const seats = all.filter((c) => c.floor === f && c.phase !== 'leave' && c.seat >= 0).flatMap((c) => (c.seat2 !== undefined ? [c.seat, c.seat2] : [c.seat]));
    assert.equal(new Set(seats).size, seats.length);
    assert.ok(all.filter((c) => c.floor === f && c.kind === 'mouse' && c.phase !== 'leave').length <= 1);
  }
});

test('dumbwaiter sets: none before the lift; a tap needs both items; helpers serve them from lift level 2', () => {
  const tweak = (c: Content) => {
    c.cafe.guests.giraffe.chance = 0;
    c.cafe.guests.elephant.chance = 0;
    c.cafe.guests.mouse.chance = 0;
    c.cafe.lift.chance = 0.9;
  };
  const cafe = grown(cafeWith(tweak));
  cafe.s.customers = [];
  run(cafe, 10);
  assert.ok(!cafe.s.customers.some((c) => c.item2));
  assert.equal(cafe.buyUpgrade('lift'), true);
  cafe.s.customers = [];
  run(cafe, 10);
  const set = cafe.s.customers.find((c) => c.item2 && c.phase === 'wait');
  assert.ok(set);
  assert.notEqual(cafe.floorIndexOf(set!.item2!), set!.floor);
  cafe.s.items[set!.item].ready = 1;
  cafe.s.items[set!.item2!].ready = 0;
  assert.equal(cafe.tapCustomer(set!.id), 'notReady');
  cafe.s.items[set!.item2!].ready = 1;
  const v = cafe.orderValue(set!);
  assert.ok(Math.abs(v - (cafe.itemValue(set!.item) + cafe.itemValue(set!.item2!)) * cafe.content.cafe.lift.pay) < 1e-6);
  assert.equal(cafe.tapCustomer(set!.id), 'served');
  assert.deepEqual(cafe.s.sets, [cafe.setKey(set!.item, set!.item2!)]);

  // Helpers leave sets alone at level 1, and serve them at level 2.
  const helper = grown(cafeWith(tweak));
  helper.giftAnimal('capybara');
  helper.buyUpgrade('lift');
  helper.s.customers = [];
  helper.s.assign = { coffee: 'capybara' };
  const c = put(helper, { floor: 0, item: 'coffee', item2: 'croissant' });
  helper.s.items.coffee.ready = 1;
  helper.s.items.croissant.ready = 1;
  run(helper, 3);
  assert.equal(c.phase, 'wait');
  helper.buyUpgrade('lift');
  helper.s.assign = { coffee: 'capybara' };
  helper.s.items.coffee.ready = 1;
  const events = run(helper, 3);
  assert.ok(events.some((e) => e.type === 'served' && e.customer.id === c.id && e.set === 'coffee+croissant'));
});

test('best friends on one floor work faster and earn more; the arranger brings them together when it pays', () => {
  const cafe = grown(cafeWith());
  cafe.s.customers = [];
  cafe.giftAnimal('bunny');
  cafe.giftAnimal('cat');
  cafe.s.assign = { coffee: 'bunny', tea: 'cat' };
  assert.equal(cafe.friendAt('coffee'), 'cat');
  const together = cafe.stationSpeed('coffee');
  cafe.s.assign = { coffee: 'bunny', croissant: 'cat' };
  assert.equal(cafe.friendAt('coffee'), null);
  assert.ok(Math.abs(together / cafe.stationSpeed('coffee') - cafe.content.staff.friends.bonus) < 1e-9);
  // Only these two helpers: the arranger puts them on one floor and says so.
  const fresh = grown(cafeWith());
  fresh.giftAnimal('bunny');
  const before = new Set(fresh.activePairs());
  fresh.giftAnimal('cat');
  fresh.reassign(before);
  const events = run(fresh, 0.1);
  assert.deepEqual(fresh.activePairs(), ['bunny|cat']);
  assert.ok(events.some((e) => e.type === 'friends'));
});

test('a helper moved by hand stays there when helpers are rearranged', () => {
  const cafe = grown(cafeWith());
  for (const a of ['capybara', 'hamster', 'shiba']) cafe.giftAnimal(a);
  const where = cafe.stationOf('capybara')!;
  const target = cafe.content.cafe.items.find((i) => i.id !== where && cafe.s.assign[i.id] !== 'capybara')!.id;
  assert.equal(cafe.swapStaff(where, target), true);
  assert.equal(cafe.s.assign[target], 'capybara');
  cafe.giftAnimal('penguin');
  assert.equal(cafe.s.assign[target], 'capybara');
  assert.equal(cafe.swapStaff(target, target), false);
});

test('tour groups: after the bakery opens, a group comes, arrivals speed up, serving enough pays a chest', () => {
  const cafe = cafeWith();
  const s = cafe.s;
  s.coins = 1e9;
  s.vipOn = true;
  run(cafe, 200);
  assert.equal(s.tour ?? null, null);
  cafe.openFloor(1);
  const events: CafeEvent[] = [];
  run(cafe, cafe.content.cafe.tours.firstAfter + 1, events);
  const start = events.find((e) => e.type === 'tourStart');
  assert.ok(start && start.type === 'tourStart');
  assert.equal(start.need, cafe.content.cafe.tours.need);
  assert.ok(s.tour);
  // Serve the group by hand.
  const end: CafeEvent[] = [];
  for (let t = 0; t < cafe.content.cafe.tours.seconds + 1; t += 0.1) {
    for (const c of s.customers.filter((x) => x.phase === 'wait')) {
      s.items[c.item].ready = 1;
      if (c.item2) s.items[c.item2].ready = 1;
      cafe.tapCustomer(c.id, end);
    }
    cafe.step(0.1, end);
  }
  const done = end.find((e) => e.type === 'tourEnd');
  assert.ok(done && done.type === 'tourEnd');
  assert.ok(done.served >= done.need && done.success && done.coins > 0);
  assert.equal(s.tours, 1);
  assert.ok(end.filter((e) => e.type === 'served' && e.customer.tourist).length >= done.need);
});

test('traits: a calm helper makes its floor patient; a quick one carries faster; cheer lifts the others', () => {
  const cafe = grown(cafeWith());
  cafe.giftAnimal('capybara');
  cafe.giftAnimal('hamster');
  cafe.s.assign = { coffee: 'capybara', croissant: 'hamster' };
  cafe.s.customers = [];
  run(cafe, 8);
  const p = cafe.patience();
  for (const c of cafe.s.customers.filter((x) => !x.kind && !x.item2 && !x.vip)) {
    if (c.floor === 0) assert.ok(Math.abs(c.maxPatience - p * 1.2) < 1e-6);
    else assert.ok(Math.abs(c.maxPatience - p) < 1e-6);
  }
  const before = cafe.stationSpeed('croissant');
  cafe.giftAnimal('snowfox');
  cafe.s.assign = { coffee: 'capybara', croissant: 'hamster', icecream: 'snowfox' };
  assert.ok(Math.abs(cafe.stationSpeed('croissant') / before - 1.1) < 1e-9);
});

test('v2 tasks count the new things', () => {
  const cafe = grown(cafeWith());
  cafe.s.bestCombo = 5;
  cafe.s.wakes = 2;
  cafe.s.memories = [1, 2];
  cafe.s.guests = { giraffe: 1, mouse: 2 };
  cafe.s.setsServed = 4;
  cafe.s.tours = 1;
  assert.deepEqual(cafe.taskProgress({ id: 'a', type: 'combo', n: 3 }), { have: 3, need: 3 });
  assert.equal(cafe.taskProgress({ id: 'b', type: 'wakes', n: 3 }).have, 2);
  assert.equal(cafe.taskProgress({ id: 'c', type: 'moods', n: 3 }).have, 3);
  assert.equal(cafe.taskProgress({ id: 'd', type: 'guests', n: 3 }).have, 3);
  assert.equal(cafe.taskProgress({ id: 'e', type: 'sets', n: 3 }).have, 4);
  assert.equal(cafe.taskProgress({ id: 'f', type: 'tours', n: 1 }).have, 1);
  assert.equal(cafe.taskProgress({ id: 'g', type: 'friends', n: 1 }).have, 0);
});

test('region follows the stars', () => {
  const cafe = cafeWith();
  assert.equal(cafe.region(), cafe.content.cafe.journey[0]);
  cafe.s.served = 20;
  assert.equal(cafe.region(), cafe.content.cafe.journey[1]);
});
