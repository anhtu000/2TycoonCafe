// The whole economy of one cafe run, in plain TypeScript with no Phaser import.
// The play scene and the balance simulator (tools/sim) both drive this class,
// so simulated pacing matches the real game.
import { pityLeft, rarityOdds, Rng, rollRarity } from '../../core/rng.ts';
import type { AnimalDef, Content, ItemDef, OrderType, StatId, TaskDef, UpgradeDef } from './content.ts';

export type RunMode = 'main' | 'timed';
export type RewardId = 'rush' | 'freeAdopt' | 'freeUpgrade';

export interface Customer {
  id: number;
  floor: number;
  seat: number;
  item: string;
  /** walk: coming in. wait: at the counter. leave: going out (happy or not). */
  phase: 'walk' | 'wait' | 'leave';
  /** Seconds left in walk or leave. */
  t: number;
  /** Seconds of patience left while waiting. */
  patience: number;
  maxPatience: number;
  vip?: boolean;
  /** Leaving after being served (false: ran out of patience). */
  happy?: boolean;
  /** An animal is carrying this customer's order. */
  reserved?: boolean;
  /** Look of this customer (index into the customer palette). */
  look: number;
}

export interface Carry {
  /** Seconds left before the serving reaches the customer. */
  t: number;
  total: number;
  customer: number;
}

export interface ItemState {
  unlocked: boolean;
  level: number;
  /** Servings waiting on the counter. */
  ready: number;
  /** Making progress in seconds of work, or null when the machine is idle. */
  job: number | null;
  /** Staff carrying a serving. */
  carry: Carry | null;
  /** Seconds a serving has been waiting on the counter. Animals pick it up after staff.pickupDelay, so a quick hand gets there first. */
  hold?: number;
}

export interface FloorState {
  open: boolean;
  seats: number;
  spawnTimer: number;
}

/** Everything about a run, as plain data so it can be saved as JSON. */
export interface RunState {
  mode: RunMode;
  coins: number;
  totalEarned: number;
  served: number;
  /** Customers who left without being served. */
  lost: number;
  time: number;
  finishedAt: number | null;
  floors: FloorState[];
  items: Record<string, ItemState>;
  customers: Customer[];
  nextId: number;
  levels: Record<string, number>;
  /** Animals adopted in this run: id -> level (1 = first copy). */
  staff: Record<string, number>;
  /** Item id -> animal id working there. Recomputed when staff or menu changes. */
  assign: Record<string, string>;
  /** Paid adoptions so far (the price follows this). */
  adopts: number;
  pity: number[];
  rng: number;
  vipTimer: number;
  rushLeft: number;
  /** Income per second, smoothed over about 30 s (everything except VIP bonuses). */
  rate: number;
  /** Same, only what the animals earned. Offline income uses it. */
  autoRate: number;
  rewardReadyAt: Record<string, number>;
  /** Patience does not run out (first-time tutorial). */
  calm?: boolean;
  /** VIPs and customer variety wait for the tutorial. */
  vipOn?: boolean;
  /** VIPs served by hand. */
  vips?: number;
  /** Short tasks (content.tasks): every task before this index is claimed; older saves start at 0. */
  task?: number;
  /** Tasks after `task` claimed early (the chain shows a done task among the next few first). */
  taskSkip?: number[];
  /** Purchases paid with coins in this run (rewards come back after a few of them on Poki). */
  buys?: number;
  /** Value of `buys` when each reward was last used. */
  usedAt?: Partial<Record<RewardId, number>>;
  /** Customers served by the player's tap. */
  hand?: number;
  /** Servings sold per menu item. */
  sold?: Record<string, number>;
  /** Coins paid by customers (VIP bonus included; no rewards). */
  sales?: number;
  /** Today's orders and special (main cafe after five stars). */
  day?: DayState;
}

/** One daily order. need: amount to reach from the start of the day. item: the menu item (sold, special). */
export interface OrderState {
  type: OrderType;
  need: number;
  item?: string;
  claimed?: boolean;
}

/** Counters a day's orders count from. */
export interface DayBase {
  served: number;
  hand: number;
  vips: number;
  buys: number;
  sales: number;
  sold: Record<string, number>;
}

export interface DayState {
  /** The player's own date, YYYY-MM-DD (core dayKey). */
  key: string;
  /** Menu item selling for special.mult times more today, or null. */
  special: string | null;
  orders: OrderState[];
  base: DayBase;
}

/** What claiming an order gave. bonus: every order of the day is now claimed (free adoptions). */
export interface OrderClaim {
  coins: number;
  bonus: number;
}

/** Small stable hash of a string (FNV-1a), to seed a day's picks. */
function hashKey(key: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Round to 2 significant digits, so order amounts read well ("12K", not "11,734"). */
function roundNice(n: number) {
  if (n < 100) return Math.max(1, Math.round(n));
  const p = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / p) * p;
}

export type CafeEvent =
  | { type: 'spawn'; customer: Customer }
  | { type: 'made'; item: string }
  | { type: 'carry'; item: string; customer: number }
  | { type: 'served'; customer: Customer; coins: number; hand: boolean; vipBonus: number }
  | { type: 'lost'; customer: Customer }
  | { type: 'gone'; customer: number }
  | { type: 'star'; stars: number }
  | { type: 'finish' }
  /** An item reached a milestone level: its servings pay `mult` times more from now on. */
  | { type: 'milestone'; item: string; level: number; mult: number }
  /** The current short task is done and can be claimed. */
  | { type: 'taskDone' };

export interface AdoptResult {
  animal: AnimalDef;
  rarity: number;
  /** First copy in this run. */
  isNew: boolean;
  level: number;
  /** Already at max level: the copy turned into coins. */
  refund: number;
}

export function newRunState(content: Content, mode: RunMode, seed: number): RunState {
  const { cafe } = content;
  const items: Record<string, ItemState> = {};
  for (const item of cafe.items) {
    const open = item.floor === cafe.floors[0].id && item.unlockCost === 0;
    items[item.id] = { unlocked: open, level: 1, ready: 0, job: null, carry: null };
  }
  return {
    mode,
    coins: 0,
    totalEarned: 0,
    served: 0,
    lost: 0,
    time: 0,
    finishedAt: null,
    floors: cafe.floors.map((f, i) => ({ open: i === 0, seats: f.startSeats, spawnTimer: i === 0 ? 0.6 : 1 })),
    items,
    customers: [],
    nextId: 1,
    levels: {},
    staff: {},
    assign: {},
    adopts: 0,
    pity: [],
    rng: seed >>> 0 || 1,
    vipTimer: cafe.vip.firstAfter,
    rushLeft: 0,
    rate: 0,
    autoRate: 0,
    rewardReadyAt: {},
  };
}

const RARITY_FLOOR = 0;
/** How many tasks ahead a done one may be claimed out of order. */
const TASK_WINDOW = 3;

export class Cafe {
  readonly rng: Rng;
  private itemIndex: Map<string, ItemDef>;
  private floorOfItem: Map<string, number>;
  private upgradeIndex: Map<string, UpgradeDef>;
  private animalIndex: Map<string, AnimalDef>;
  private earnedStep = 0;
  /** Tip multiplier from outside the run (decorations, main run only). */
  extraTips = 1;
  /** Decorations owned (outside the run, main run only), for decor tasks. */
  decorCount = 0;
  private autoEarnedStep = 0;
  /**
   * Events caused by a purchase between steps (a star from opening a floor, a milestone level).
   * They go out with the next step, so the scene sees them like any other event.
   */
  private pending: CafeEvent[] = [];
  private lastTaskDone = false;

  readonly content: Content;
  readonly s: RunState;

  constructor(content: Content, s: RunState) {
    this.content = content;
    this.s = s;
    this.rng = new Rng(s.rng);
    this.itemIndex = new Map(content.cafe.items.map((i) => [i.id, i]));
    this.floorOfItem = new Map(content.cafe.items.map((i) => [i.id, content.cafe.floors.findIndex((f) => f.id === i.floor)]));
    this.upgradeIndex = new Map(content.upgrades.map((u) => [u.id, u]));
    this.animalIndex = new Map(content.staff.animals.map((a) => [a.id, a]));
  }

  // ---------- stats ----------

  level(id: string) {
    return this.s.levels[id] ?? 0;
  }

  stat(stat: StatId): number {
    let value = stat === 'handTip' || stat === 'offlineHours' ? 0 : 1;
    for (const u of this.content.upgrades) {
      if (u.stat !== stat) continue;
      const l = this.level(u.id);
      value = u.op === 'add' ? value + u.value * l : value * u.value ** l;
    }
    if (stat === 'offlineHours') value += this.content.cafe.offline.capHours;
    return value;
  }

  item(id: string) {
    const def = this.itemIndex.get(id);
    if (!def) throw new Error(`Unknown item ${id}`);
    return def;
  }

  floorIndexOf(itemId: string) {
    return this.floorOfItem.get(itemId) ?? 0;
  }

  itemsOnFloor(floor: number) {
    const id = this.content.cafe.floors[floor].id;
    return this.content.cafe.items.filter((i) => i.floor === id);
  }

  private milestoneMult(level: number, key: 'value' | 'speed') {
    let m = 1;
    for (const ms of this.content.cafe.milestones) if (level >= ms.level && ms[key]) m *= ms[key]!;
    return m;
  }

  /** Next milestone level above `level`, or null. */
  nextMilestone(level: number) {
    return this.content.cafe.milestones.find((m) => m.level > level) ?? null;
  }

  animal(id: string) {
    const a = this.animalIndex.get(id);
    if (!a) throw new Error(`Unknown animal ${id}`);
    return a;
  }

  rarityIndex(animal: AnimalDef) {
    return this.content.staff.rarities.findIndex((r) => r.id === animal.rarity);
  }

  /** Work speed of an adopted animal (machine and carrying). */
  animalSpeed(id: string, level = this.s.staff[id] ?? 1) {
    const a = this.animal(id);
    const r = this.content.staff.rarities[this.rarityIndex(a)];
    const lv = 1 + this.content.staff.levelBonus * (level - 1);
    return r.speed * lv * (a.perk === 'speed' ? a.perkValue : 1);
  }

  /** Tip multiplier of an adopted animal on the servings of its station. */
  animalTips(id: string, level = this.s.staff[id] ?? 1) {
    const a = this.animal(id);
    if (a.perk !== 'tips') return 1;
    return 1 + (a.perkValue - 1) * (1 + this.content.staff.levelBonus * (level - 1) * 2);
  }

  /** Sort key when placing animals at stations. */
  animalPower(id: string) {
    return this.animalSpeed(id) * this.animalTips(id);
  }

  /** Coins for one serving, before hand bonus and rush. */
  itemValue(id: string, level = this.s.items[id].level) {
    const def = this.item(id);
    const staff = this.s.assign[id];
    const tips = this.stat('tips') * this.extraTips * (staff ? this.animalTips(staff) : 1);
    return def.value * level * this.milestoneMult(level, 'value') * tips * (this.specialItem() === id ? this.content.cafe.special!.mult : 1);
  }

  /** Seconds of work per serving at speed 1. */
  makeTime(id: string) {
    return this.item(id).makeTime / this.milestoneMult(this.s.items[id].level, 'speed');
  }

  /** Machine speed: 1 by hand, the animal's speed with staff. */
  stationSpeed(id: string) {
    const staff = this.s.assign[id];
    return staff ? this.animalSpeed(staff) * this.stat('staffSpeed') : 1;
  }

  patience() {
    return this.content.cafe.customers.patience * this.stat('patience');
  }

  // ---------- prices ----------

  itemLevelCost(id: string) {
    const def = this.item(id);
    return Math.ceil(def.levelCost * def.levelGrowth ** (this.s.items[id].level - 1));
  }

  canLevelItem(id: string) {
    const st = this.s.items[id];
    return st.unlocked && st.level < this.levelCap();
  }

  /** Highest item level for now: cafe.levelCapBeforeLastFloor until the last floor opens, then maxLevel. */
  levelCap() {
    const cfg = this.content.cafe;
    const last = this.s.floors[this.s.floors.length - 1];
    return cfg.levelCapBeforeLastFloor !== undefined && !last.open ? Math.min(cfg.levelCapBeforeLastFloor, cfg.maxLevel) : cfg.maxLevel;
  }

  /** At the level cap that lifts when the last floor opens (not at maxLevel). */
  levelCapped(id: string) {
    const st = this.s.items[id];
    return st.unlocked && st.level >= this.levelCap() && this.levelCap() < this.content.cafe.maxLevel;
  }

  upgradeCost(id: string) {
    const u = this.upgradeIndex.get(id)!;
    return Math.ceil(u.cost * u.growth ** this.level(id));
  }

  upgradeMaxed(id: string) {
    return this.level(id) >= this.upgradeIndex.get(id)!.max;
  }

  upgradeVisible(u: UpgradeDef) {
    const show = u.show;
    if (show.served !== undefined && this.s.served < show.served) return false;
    if (show.staff !== undefined && this.staffCount() < show.staff) return false;
    if (show.floor && !this.s.floors[this.content.cafe.floors.findIndex((f) => f.id === show.floor)].open) return false;
    if (show.stars !== undefined && this.stars() < show.stars) return false;
    return true;
  }

  seatCost(floor: number) {
    const f = this.content.cafe.floors[floor];
    const extra = this.s.floors[floor].seats - f.startSeats;
    return extra < f.seatCosts.length ? f.seatCosts[extra] : null;
  }

  adoptCost() {
    const a = this.content.staff.adopt;
    return Math.ceil(a.cost * a.growth ** this.s.adopts);
  }

  staffCount() {
    return Object.keys(this.s.staff).length;
  }

  /** Stations that can hold an animal (unlocked items). */
  slotCount() {
    return Object.values(this.s.items).filter((i) => i.unlocked).length;
  }

  // ---------- actions ----------

  private pay(cost: number) {
    if (cost > this.s.coins + 1e-9) return false;
    this.s.coins -= cost;
    this.s.buys = (this.s.buys ?? 0) + 1;
    return true;
  }

  buyItemLevel(id: string) {
    if (!this.canLevelItem(id) || !this.pay(this.itemLevelCost(id))) return false;
    this.levelUp(id);
    return true;
  }

  private levelUp(id: string) {
    const st = this.s.items[id];
    st.level += 1;
    const m = this.content.cafe.milestones.find((x) => x.level === st.level);
    if (m && m.value) this.pending.push({ type: 'milestone', item: id, level: st.level, mult: m.value });
  }

  unlockItem(id: string) {
    const st = this.s.items[id];
    const def = this.item(id);
    if (st.unlocked || !this.s.floors[this.floorIndexOf(id)].open || !this.pay(def.unlockCost)) return false;
    st.unlocked = true;
    this.reassign();
    return true;
  }

  openFloor(floor: number) {
    const f = this.s.floors[floor];
    if (f.open || (floor > 0 && !this.s.floors[floor - 1].open)) return false;
    if (!this.pay(this.content.cafe.floors[floor].unlockCost)) return false;
    f.open = true;
    f.spawnTimer = 1;
    for (const item of this.itemsOnFloor(floor)) if (item.unlockCost === 0) this.s.items[item.id].unlocked = true;
    this.reassign();
    this.checkGoals(this.pending);
    return true;
  }

  buySeat(floor: number) {
    const cost = this.seatCost(floor);
    if (cost === null || !this.s.floors[floor].open || !this.pay(cost)) return false;
    this.s.floors[floor].seats += 1;
    return true;
  }

  buyUpgrade(id: string) {
    if (this.upgradeMaxed(id) || !this.pay(this.upgradeCost(id))) return false;
    this.s.levels[id] = this.level(id) + 1;
    return true;
  }

  /** Free item level (rewarded ad). */
  grantItemLevel(id: string) {
    if (!this.canLevelItem(id)) return false;
    this.levelUp(id);
    return true;
  }

  /** Chance of each rarity for one adoption (shown to players). */
  adoptOdds(): number[] {
    return rarityOdds(this.content.staff.rarities.map((r) => r.weight));
  }

  /** Adoptions left before pity rule i forces its rarity. */
  pityLeft(i: number) {
    return pityLeft(this.content.staff.pity, this.s.pity, i);
  }

  /** Free level for a rewarded ad. */
  grantUpgrade(id: string) {
    if (this.upgradeMaxed(id)) return false;
    this.s.levels[id] = this.level(id) + 1;
    return true;
  }

  /**
   * Adopts one animal. paid: costs coins and raises the next price. forced: a fixed animal (tutorial).
   * The rarity roll uses the pity rules in staff.json, so the odds shown to players are exact.
   */
  adopt(paid: boolean, forced?: string): AdoptResult | null {
    if (paid && !this.pay(this.adoptCost())) return null;
    if (paid) this.s.adopts += 1;
    const staff = this.content.staff;
    let animal: AnimalDef;
    let rarity: number;
    if (forced) {
      animal = this.animal(forced);
      rarity = this.rarityIndex(animal);
    } else {
      rarity = rollRarity(this.rng, staff.rarities.map((r) => r.weight), staff.pity, this.s.pity, { floor: RARITY_FLOOR });
      const all = staff.animals.filter((a) => a.rarity === staff.rarities[rarity].id && !a.exclusive);
      // While a station still has no animal, a new face is always picked when one is left in that rarity.
      const fresh = all.filter((a) => !this.s.staff[a.id]);
      const pool = this.staffCount() < this.slotCount() && fresh.length ? fresh : all;
      animal = this.rng.pick(pool);
    }
    this.s.rng = this.rng.state;
    return this.addCopy(animal, rarity);
  }

  /** One more copy of an animal: a new helper, a level, or half the adoption price at max level. */
  private addCopy(animal: AnimalDef, rarity: number): AdoptResult {
    const had = this.s.staff[animal.id] ?? 0;
    let refund = 0;
    if (had >= this.content.staff.maxLevel) {
      // Max level: the extra copy pays back half the adoption price.
      refund = Math.ceil(this.adoptCost() / 2);
      this.addCoins(refund, false);
    } else this.s.staff[animal.id] = had + 1;
    this.reassign();
    this.checkGoals(this.pending);
    return { animal, rarity, isNew: had === 0, level: this.s.staff[animal.id], refund };
  }

  /** A gift animal (daily gift): one copy of this animal, outside the adoption roll and its price. */
  giftAnimal(id: string): AdoptResult {
    const animal = this.animal(id);
    return this.addCopy(animal, this.rarityIndex(animal));
  }

  /**
   * The Rare pal of the daily gift: a Rare not owned yet, else an Epic not owned yet, else a level on a Rare.
   * Picked with the run's random numbers, outside the pity counters.
   */
  giftRarePal(): AdoptResult {
    const staff = this.content.staff;
    const of = (r: string) => staff.animals.filter((a) => a.rarity === r && !a.exclusive);
    const fresh = (list: AnimalDef[]) => list.filter((a) => !this.s.staff[a.id]);
    const rare = staff.rarities[1]?.id ?? staff.rarities[0].id;
    const epic = staff.rarities[2]?.id ?? rare;
    const pool = fresh(of(rare)).length ? fresh(of(rare)) : fresh(of(epic)).length ? fresh(of(epic)) : of(rare);
    const animal = this.rng.pick(pool);
    this.s.rng = this.rng.state;
    return this.giftAnimal(animal.id);
  }

  /** Puts the strongest animals at the most valuable stations. */
  reassign() {
    const items = this.content.cafe.items.filter((i) => this.s.items[i.id].unlocked);
    // Most valuable menu item first, so the best animal works where it earns most.
    items.sort((a, b) => b.value - a.value);
    const animals = Object.keys(this.s.staff).sort((a, b) => this.animalPower(b) - this.animalPower(a) || a.localeCompare(b));
    const assign: Record<string, string> = {};
    items.forEach((item, i) => {
      if (animals[i]) assign[item.id] = animals[i];
    });
    this.s.assign = assign;
  }

  /** Tap on a machine: starts a serving, or speeds up the one being made. */
  tapStation(id: string): 'start' | 'boost' | 'full' | 'locked' {
    const st = this.s.items[id];
    if (!st.unlocked) return 'locked';
    const boost = this.content.cafe.tap.boost * this.stat('tapBoost');
    if (st.job !== null) {
      st.job += boost;
      return 'boost';
    }
    if (st.ready >= this.content.cafe.counterCap) return 'full';
    st.job = boost * 0.5;
    return 'start';
  }

  /** Tap on a customer: serves them by hand when their order is on the counter. */
  tapCustomer(cid: number, events: CafeEvent[] = []): 'served' | 'notReady' | 'none' {
    const c = this.s.customers.find((x) => x.id === cid);
    if (!c || c.phase !== 'wait' || c.reserved) return 'none';
    const st = this.s.items[c.item];
    if (st.ready < 1) return 'notReady';
    st.ready -= 1;
    this.serve(c, true, events);
    return 'served';
  }

  // ---------- simulation step ----------

  step(dt: number, events: CafeEvent[] = []): CafeEvent[] {
    const s = this.s;
    if (this.pending.length) {
      events.push(...this.pending);
      this.pending = [];
    }
    s.time += dt;
    if (s.rushLeft > 0) s.rushLeft = Math.max(0, s.rushLeft - dt);

    // Customers arrive.
    s.floors.forEach((f, i) => {
      if (!f.open) return;
      f.spawnTimer -= dt;
      if (f.spawnTimer > 0) return;
      const seat = this.freeSeat(i);
      if (seat < 0) return;
      this.spawn(i, seat, events);
      const def = this.content.cafe.floors[i];
      f.spawnTimer = def.spawnEvery * this.stat('spawnMult') * (0.75 + this.rng.next() * 0.5);
      s.rng = this.rng.state;
    });
    if (s.vipOn) s.vipTimer -= dt;

    // Customers walk, wait, leave.
    const cus = this.content.cafe.customers;
    for (const c of s.customers) {
      if (c.phase === 'walk') {
        c.t -= dt;
        if (c.t <= 0) c.phase = 'wait';
      } else if (c.phase === 'wait') {
        if (!s.calm && !c.reserved) c.patience -= dt;
        if (c.patience <= 0) {
          c.phase = 'leave';
          c.t = cus.leave;
          c.happy = false;
          s.lost += 1;
          events.push({ type: 'lost', customer: c });
        }
      } else {
        c.t -= dt;
      }
    }
    for (const c of s.customers.filter((x) => x.phase === 'leave' && x.t <= 0)) events.push({ type: 'gone', customer: c.id });
    s.customers = s.customers.filter((c) => !(c.phase === 'leave' && c.t <= 0));

    // Machines and staff.
    for (const def of this.content.cafe.items) {
      const st = s.items[def.id];
      if (!st.unlocked) continue;
      const speed = this.stationSpeed(def.id);
      const animal = s.assign[def.id];
      if (st.job !== null) {
        st.job += dt * speed;
        if (st.job >= this.makeTime(def.id)) {
          st.job = null;
          st.ready += 1;
          events.push({ type: 'made', item: def.id });
        }
      }
      if (!animal) continue;
      // Carrying a serving to a customer.
      if (st.carry) {
        st.carry.t -= dt * speed;
        if (st.carry.t <= 0) {
          const c = s.customers.find((x) => x.id === st.carry!.customer);
          st.carry = null;
          if (c && c.phase === 'wait') this.serve(c, false, events);
          else st.ready += 1;
        }
      }
      st.hold = st.ready > 0 && !st.carry ? (st.hold ?? 0) + dt : 0;
      if (!st.carry && st.ready > 0 && st.hold >= this.content.cafe.staff.pickupDelay) {
        const c = this.neediest(def.id);
        if (c) {
          st.ready -= 1;
          c.reserved = true;
          const total = this.content.cafe.staff.deliverTime;
          st.carry = { t: total, total, customer: c.id };
          events.push({ type: 'carry', item: def.id, customer: c.id });
        }
      }
      // Start the next serving when someone is waiting for it.
      if (st.job === null && st.ready < this.content.cafe.counterCap) {
        const wanted = s.customers.filter((c) => c.item === def.id && c.phase !== 'leave' && !c.reserved && !c.vip).length;
        if (wanted > st.ready) st.job = 0;
      }
    }

    // Smoothed income per second (about 30 s window).
    const k = Math.min(1, dt / 30);
    s.rate += (this.earnedStep / dt - s.rate) * k;
    s.autoRate += (this.autoEarnedStep / dt - s.autoRate) * k;
    // Hand serves happen between steps, so the counters reset after use, not before.
    this.earnedStep = 0;
    this.autoEarnedStep = 0;

    this.checkGoals(events);
    this.checkTask(events);
    return events;
  }

  private freeSeat(floor: number) {
    const taken = new Set(this.s.customers.filter((c) => c.floor === floor && c.phase !== 'leave').map((c) => c.seat));
    for (let i = 0; i < this.s.floors[floor].seats; i++) if (!taken.has(i)) return i;
    return -1;
  }

  private spawn(floor: number, seat: number, events: CafeEvent[]) {
    const s = this.s;
    const menu = this.itemsOnFloor(floor).filter((i) => s.items[i.id].unlocked);
    // The newest item is ordered a bit more often, so a fresh unlock shows up quickly.
    const weights = menu.map((_, i) => (i === menu.length - 1 && menu.length > 1 ? 1.4 : 1));
    let roll = this.rng.next() * weights.reduce((a, b) => a + b, 0);
    let item = menu[0];
    for (let i = 0; i < menu.length; i++) {
      roll -= weights[i];
      if (roll < 0) {
        item = menu[i];
        break;
      }
    }
    const vip = Boolean(s.vipOn && s.vipTimer <= 0);
    if (vip) {
      const v = this.content.cafe.vip;
      s.vipTimer = v.everyMin + this.rng.next() * (v.everyMax - v.everyMin);
    }
    const patience = vip ? this.content.cafe.vip.patience * this.stat('patience') : this.patience();
    const c: Customer = {
      id: s.nextId++,
      floor,
      seat,
      item: item.id,
      phase: 'walk',
      t: this.content.cafe.customers.walkIn,
      patience,
      maxPatience: patience,
      vip: vip || undefined,
      look: this.rng.int(0, 5),
    };
    s.rng = this.rng.state;
    s.customers.push(c);
    events.push({ type: 'spawn', customer: c });
  }

  /** Waiting customer for this item who is closest to leaving. VIPs wait for the player's hand. */
  private neediest(item: string) {
    let best: Customer | null = null;
    for (const c of this.s.customers) {
      if (c.item !== item || c.phase !== 'wait' || c.reserved || c.vip) continue;
      if (!best || c.patience < best.patience) best = c;
    }
    return best;
  }

  private serve(c: Customer, hand: boolean, events: CafeEvent[]) {
    const s = this.s;
    const cfg = this.content.cafe;
    let coins = this.itemValue(c.item) * (hand ? cfg.handBonus + this.stat('handTip') : 1) * (s.rushLeft > 0 ? cfg.rush.mult : 1);
    let vipBonus = 0;
    if (c.vip && hand) {
      vipBonus = Math.max(coins * 5, s.rate * cfg.vip.bonusSeconds);
      s.vips = (s.vips ?? 0) + 1;
    }
    this.earnedStep += coins;
    if (!hand) this.autoEarnedStep += coins;
    coins += vipBonus;
    this.addCoins(coins, false);
    s.served += 1;
    if (hand) s.hand = (s.hand ?? 0) + 1;
    (s.sold ??= {})[c.item] = (s.sold[c.item] ?? 0) + 1;
    s.sales = (s.sales ?? 0) + coins;
    c.phase = 'leave';
    c.t = cfg.customers.leave;
    c.happy = true;
    c.reserved = false;
    events.push({ type: 'served', customer: c, coins, hand, vipBonus });
  }

  addCoins(n: number, countRate = true) {
    this.s.coins += n;
    this.s.totalEarned += n;
    if (countRate) this.earnedStep += n;
  }

  // ---------- goals ----------

  goalMet(i: number): boolean {
    const g = this.content.cafe.goals[i];
    const s = this.s;
    if (g.served !== undefined) return s.served >= g.served;
    if (g.floor) return s.floors[this.content.cafe.floors.findIndex((f) => f.id === g.floor)].open;
    if (g.staff !== undefined) return this.staffCount() >= g.staff;
    if (g.itemLevel) return s.items[g.itemLevel].unlocked && s.items[g.itemLevel].level >= (g.level ?? 1);
    if (g.earned !== undefined) return s.totalEarned >= g.earned;
    return false;
  }

  /** Progress 0..1 of goal i, for the star bar. */
  goalProgress(i: number): number {
    const g = this.content.cafe.goals[i];
    const s = this.s;
    if (this.goalMet(i)) return 1;
    if (g.served !== undefined) return s.served / g.served;
    if (g.floor) {
      const f = this.content.cafe.floors.find((x) => x.id === g.floor)!;
      return Math.min(0.99, s.coins / f.unlockCost);
    }
    if (g.staff !== undefined) return this.staffCount() / g.staff;
    if (g.itemLevel) return s.items[g.itemLevel].unlocked ? s.items[g.itemLevel].level / (g.level ?? 1) : 0;
    if (g.earned !== undefined) return s.totalEarned / g.earned;
    return 0;
  }

  /** Stars earned: goals are met in order. */
  stars(): number {
    let n = 0;
    while (n < this.content.cafe.goals.length && this.goalMet(n)) n++;
    return n;
  }

  private lastStars = -1;

  private checkGoals(events: CafeEvent[]) {
    const stars = this.stars();
    if (this.lastStars < 0) this.lastStars = stars;
    if (stars > this.lastStars) {
      this.lastStars = stars;
      events.push({ type: 'star', stars });
      if (stars >= this.content.cafe.goals.length && this.s.finishedAt === null) {
        this.s.finishedAt = this.s.time;
        events.push({ type: 'finish' });
      }
    }
  }

  // ---------- short tasks ----------

  /** Decor tasks need the decorations of the main cafe; a timed run skips them. */
  private taskApplies(t: TaskDef) {
    return !(t.type === 'decor' && this.s.mode !== 'main');
  }

  /**
   * The task on show, or null when the chain is done. Tasks go in order, but a done task among the next
   * TASK_WINDOW comes first, so one slow task (VIPs come when they come) never stalls the chain.
   */
  task(): TaskDef | null {
    const list = this.content.tasks.tasks;
    const skip = new Set(this.s.taskSkip ?? []);
    let first: TaskDef | null = null;
    let seen = 0;
    for (let i = this.s.task ?? 0; i < list.length && seen < TASK_WINDOW; i++) {
      const t = list[i];
      if (skip.has(i) || !this.taskApplies(t)) continue;
      seen++;
      if (!first) first = t;
      if (this.taskDone(t)) return t;
    }
    return first;
  }

  /** Tasks claimed so far. */
  tasksClaimed() {
    return (this.s.task ?? 0) + (this.s.taskSkip?.length ?? 0);
  }

  taskProgress(t: TaskDef | null = this.task()): { have: number; need: number } {
    if (!t) return { have: 0, need: 1 };
    const s = this.s;
    const n = t.n ?? 1;
    switch (t.type) {
      case 'served':
        return { have: s.served, need: n };
      case 'vips':
        return { have: s.vips ?? 0, need: n };
      case 'itemLevel': {
        const st = s.items[t.item!];
        return { have: st.unlocked ? st.level : 0, need: n };
      }
      case 'unlock':
        return { have: s.items[t.item!].unlocked ? 1 : 0, need: 1 };
      case 'floor': {
        // Coins saved toward the floor's price (the bar fills as the player saves).
        const i = this.content.cafe.floors.findIndex((f) => f.id === t.floor);
        const price = this.content.cafe.floors[i].unlockCost;
        return s.floors[i].open ? { have: price, need: price } : { have: Math.min(Math.floor(s.coins), Math.max(0, price - 1)), need: price };
      }
      case 'seats': {
        const i = this.content.cafe.floors.findIndex((f) => f.id === t.floor);
        return { have: s.floors[i].open ? s.floors[i].seats : 0, need: n };
      }
      case 'upgrade':
        return { have: this.level(t.upgrade!), need: n };
      case 'adopts':
        // Copies adopted: every adoption adds one level to an animal.
        return { have: Object.values(s.staff).reduce((a, b) => a + b, 0), need: n };
      case 'staff':
        return { have: this.staffCount(), need: n };
      case 'decor':
        return { have: this.decorCount, need: n };
      case 'earned':
        return { have: s.totalEarned, need: n };
    }
  }

  taskDone(t: TaskDef | null = this.task()) {
    if (!t) return false;
    const p = this.taskProgress(t);
    return p.have >= p.need;
  }

  /** Coins the current task pays: seconds of current income, at least rewardMin. */
  taskReward(t: TaskDef | null = this.task()) {
    if (!t) return 0;
    const cfg = this.content.tasks;
    return Math.max(cfg.rewardMin, Math.round(Math.max(0, this.s.rate) * (t.sec ?? cfg.rewardSec)));
  }

  /** Takes the reward of a done task and moves on. Returns the coins, or 0 when not done. */
  claimTask(): number {
    const t = this.task();
    if (!t || !this.taskDone(t)) return 0;
    const coins = this.taskReward(t);
    this.addCoins(coins, false);
    const list = this.content.tasks.tasks;
    const skip = new Set(this.s.taskSkip ?? []);
    skip.add(list.indexOf(t));
    // The chain start moves past every claimed (or not applicable) task.
    let i = this.s.task ?? 0;
    while (i < list.length && (skip.has(i) || !this.taskApplies(list[i]))) skip.delete(i++);
    this.s.task = i;
    this.s.taskSkip = [...skip].sort((a, b) => a - b);
    this.lastTaskDone = false;
    return coins;
  }

  private checkTask(events: CafeEvent[]) {
    const done = this.taskDone();
    if (done && !this.lastTaskDone) events.push({ type: 'taskDone' });
    this.lastTaskDone = done;
  }

  // ---------- daily orders and today's special ----------

  /** Daily orders and today's special run in the main cafe once it has five stars. */
  dailyOn() {
    return this.s.mode === 'main' && this.s.finishedAt !== null;
  }

  /** Menu item on special today, or null. */
  specialItem(): string | null {
    return this.content.cafe.special && this.s.day && this.dailyOn() ? this.s.day.special : null;
  }

  private dayBase(): DayBase {
    const s = this.s;
    return { served: s.served, hand: s.hand ?? 0, vips: s.vips ?? 0, buys: s.buys ?? 0, sales: s.sales ?? 0, sold: { ...(s.sold ?? {}) } };
  }

  /**
   * Starts day `key` (the player's own date, core dayKey): a new special and new orders, counted from now.
   * Returns true when a new day began (false: same day, or the cafe is not finished yet).
   */
  startDay(key: string): boolean {
    const s = this.s;
    if (!this.dailyOn() || s.day?.key === key) return false;
    const rng = new Rng(hashKey(`${key}|${s.served}`));
    const menu = this.content.cafe.items.filter((i) => s.items[i.id].unlocked).map((i) => i.id);
    const prev = s.day?.special ?? null;
    let special: string | null = null;
    if (this.content.cafe.special && menu.length) {
      const pool = menu.length > 1 ? menu.filter((id) => id !== prev) : menu;
      special = rng.pick(pool);
    }
    const cfg = this.content.tasks.orders;
    const pool = cfg.pool.filter((o) => o.type !== 'special' || special !== null);
    // Shuffle, then take the first perDay kinds.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const orders: OrderState[] = pool.slice(0, cfg.perDay).map((o) => {
      if (o.type === 'sales') {
        const min = rng.pick(o.min!);
        return { type: o.type, need: roundNice(Math.max(s.rate, 1) * 60 * min) };
      }
      const need = rng.pick(o.n!);
      if (o.type === 'special') return { type: o.type, need, item: special! };
      if (o.type === 'sold') {
        const others = menu.filter((id) => id !== special);
        return { type: o.type, need, item: rng.pick(others.length ? others : menu) };
      }
      return { type: o.type, need };
    });
    s.day = { key, special, orders, base: this.dayBase() };
    return true;
  }

  /** Today's orders (empty before five stars or before the first day starts). */
  orders(): OrderState[] {
    return this.dailyOn() && this.s.day ? this.s.day.orders : [];
  }

  orderProgress(o: OrderState): { have: number; need: number } {
    const s = this.s;
    const b = s.day?.base ?? this.dayBase();
    let have = 0;
    switch (o.type) {
      case 'served':
        have = s.served - b.served;
        break;
      case 'hand':
        have = (s.hand ?? 0) - b.hand;
        break;
      case 'vips':
        have = (s.vips ?? 0) - b.vips;
        break;
      case 'sold':
      case 'special':
        have = (s.sold?.[o.item!] ?? 0) - (b.sold[o.item!] ?? 0);
        break;
      case 'buys':
        have = (s.buys ?? 0) - b.buys;
        break;
      case 'sales':
        have = Math.floor((s.sales ?? 0) - b.sales);
        break;
    }
    return { have: Math.max(0, have), need: o.need };
  }

  orderDone(o: OrderState) {
    const p = this.orderProgress(o);
    return p.have >= p.need;
  }

  /** Coins an order pays: seconds of current income, at least rewardMin. */
  orderReward() {
    const cfg = this.content.tasks.orders;
    return Math.max(cfg.rewardMin, Math.round(Math.max(0, this.s.rate) * cfg.rewardSec));
  }

  /** Claims order i when it is done. The last one of the day also gives orders.bonusTickets free adoptions. */
  claimOrder(i: number): OrderClaim | null {
    const o = this.orders()[i];
    if (!o || o.claimed || !this.orderDone(o)) return null;
    const coins = this.orderReward();
    o.claimed = true;
    this.addCoins(coins, false);
    const bonus = this.orders().every((x) => x.claimed) ? this.content.tasks.orders.bonusTickets : 0;
    return { coins, bonus };
  }

  // ---------- rewards ----------

  rewardReady(id: RewardId) {
    return this.s.time >= (this.s.rewardReadyAt[id] ?? 0);
  }

  rewardLeft(id: RewardId) {
    return Math.max(0, (this.s.rewardReadyAt[id] ?? 0) - this.s.time);
  }

  startCooldown(id: RewardId, seconds: number) {
    this.s.rewardReadyAt[id] = this.s.time + seconds;
  }

  /**
   * Poki build: no ad timers (Poki guide 7.1), so a used reward comes back after a few purchases
   * (cafe.json rewarded.afterBuys): the offers follow the game, and taking every ad cannot replace playing.
   */
  rewardArmed(id: RewardId) {
    const used = this.s.usedAt?.[id];
    return used === undefined || (this.s.buys ?? 0) - used >= (this.content.cafe.rewarded.afterBuys[id] ?? 0);
  }

  /** Purchases left before a used reward comes back (0 = ready). */
  buysToArm(id: RewardId) {
    const used = this.s.usedAt?.[id];
    if (used === undefined) return 0;
    return Math.max(0, (this.content.cafe.rewarded.afterBuys[id] ?? 0) - ((this.s.buys ?? 0) - used));
  }

  useReward(id: RewardId) {
    (this.s.usedAt ??= {})[id] = this.s.buys ?? 0;
  }

  /**
   * Card for the rewarded free upgrade: the dearest item level or upgrade the player cannot afford yet,
   * within rewarded.freeUpgradeWindow seconds of income. 'item:<id>' or 'up:<id>', or null.
   */
  freeUpgradeTarget(): string | null {
    if (this.staffCount() === 0) return null;
    const window = Math.max(this.s.rate, 1) * this.content.cafe.rewarded.freeUpgradeWindow;
    let best: string | null = null;
    let bestCost = 0;
    for (const item of this.content.cafe.items) {
      if (!this.s.items[item.id].unlocked || !this.canLevelItem(item.id)) continue;
      const c = this.itemLevelCost(item.id);
      if (c > this.s.coins && c <= window && c > bestCost) [best, bestCost] = [`item:${item.id}`, c];
    }
    for (const u of this.content.upgrades) {
      if (!this.upgradeVisible(u) || this.upgradeMaxed(u.id)) continue;
      const c = this.upgradeCost(u.id);
      if (c > this.s.coins && c <= window && c > bestCost) [best, bestCost] = [`up:${u.id}`, c];
    }
    return best;
  }

  /** Gives the free upgrade on a card from freeUpgradeTarget. */
  grantFree(id: string) {
    return id.startsWith('item:') ? this.grantItemLevel(id.slice(5)) : this.grantUpgrade(id.slice(3));
  }

  startRush() {
    this.s.rushLeft = this.content.cafe.rush.seconds;
  }

  /** Coins the animals earn while the player is away. */
  offlineIncome(seconds: number) {
    const cfg = this.content.cafe.offline;
    if (seconds < cfg.minSeconds) return 0;
    const capped = Math.min(seconds, this.stat('offlineHours') * 3600);
    return Math.floor(this.s.autoRate * capped * cfg.efficiency);
  }
}
