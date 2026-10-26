// Game content types and checks. The data lives in src/content/*.json (CLAUDE.md 4.6),
// so balance or theme changes are JSON edits, not code changes.
import { contentChecker } from '../../core/content.ts';
import type { PityRule } from '../../core/rng.ts';

export interface FloorDef {
  id: string;
  /** Coins to open this floor. 0 = open from the start. */
  unlockCost: number;
  /** Mean seconds between two customers on this floor, while a seat is free. */
  spawnEvery: number;
  startSeats: number;
  maxSeats: number;
  /** Price of each extra seat, in order. */
  seatCosts: number[];
}

export interface ItemDef {
  id: string;
  floor: string;
  /** Coins for one serving at level 1. */
  value: number;
  /** Seconds to make one at speed 1. */
  makeTime: number;
  /** Coins to put it on the menu. 0 = comes with its floor. */
  unlockCost: number;
  /** Price of level 2; each next level costs levelGrowth times more. */
  levelCost: number;
  levelGrowth: number;
}

export interface MilestoneDef {
  level: number;
  /** Multiplies the item's value from this level on. */
  value?: number;
  /** Multiplies the making speed from this level on. */
  speed?: number;
}

export interface GoalDef {
  id: string;
  served?: number;
  floor?: string;
  staff?: number;
  itemLevel?: string;
  level?: number;
  earned?: number;
}

export interface CafeDef {
  floors: FloorDef[];
  items: ItemDef[];
  milestones: MilestoneDef[];
  maxLevel: number;
  /**
   * Item levels stop here until the last floor opens ("More levels after the Dessert Bar"), so coins
   * cannot pour into the cheap first items forever while the next floor waits (CLAUDE.md 5a).
   */
  levelCapBeforeLastFloor?: number;
  /** Ready servings a counter spot holds per item. */
  counterCap: number;
  customers: { walkIn: number; leave: number; patience: number };
  /** Seconds of making progress per tap on a busy machine. */
  tap: { boost: number };
  /** Seconds an animal needs to carry a serving to a customer, at speed 1. */
  staff: { deliverTime: number; pickupDelay: number };
  /** Coins multiplier for a customer served by the player's own tap (staff: 1). */
  handBonus: number;
  /** Golden customer: tap-served only; pays bonusSeconds of income. */
  vip: { everyMin: number; everyMax: number; patience: number; bonusSeconds: number; firstAfter: number };
  /** Five goals, one star each. The fifth star is the end of the run. */
  goals: GoalDef[];
  offline: { efficiency: number; capHours: number; minSeconds: number };
  rush: { seconds: number; mult: number };
  /**
   * 7-day gift: minutes of income, free adoptions (ticket), a Rare pal not owned yet (rarePal),
   * or an animal only this gift gives (animal: an exclusive animal id).
   */
  daily: { coinsMin?: number; hearts?: number; ticket?: number; rarePal?: number; animal?: string }[];
  /** Today's special (after five stars): one menu item a day sells for mult times more. */
  special?: { mult: number };
  rewarded: {
    /** Seconds between two uses of a boost (Rush Hour, free helper). x1.5 when the portal gives rewards without ads. */
    cooldown: number;
    freeUpgradeCooldown: number;
    /** The free upgrade goes on the dearest card the player cannot afford yet, within this many seconds of income. */
    freeUpgradeWindow: number;
    offlineMult: number;
    dailyMult: number;
    /** Poki build (no ad timers): purchases needed before a used reward is offered again. */
    afterBuys: Partial<Record<'rush' | 'freeAdopt' | 'freeUpgrade', number>>;
  };
}

export type Perk = 'speed' | 'tips';

export interface AnimalDef {
  id: string;
  rarity: string;
  perk: Perk;
  perkValue: number;
  /** Not in the adoption roll: comes only from where this says ("daily": the 7-day gift). */
  exclusive?: string;
}

export interface RarityDef {
  id: string;
  weight: number;
  /** Work speed of an animal of this rarity, before level and perk. */
  speed: number;
  color: string;
}

export interface StaffDef {
  rarities: RarityDef[];
  pity: PityRule[];
  /** Each extra copy adopted raises the animal one level: +levelBonus speed and tips. */
  levelBonus: number;
  maxLevel: number;
  adopt: { cost: number; growth: number; firstGuided: string };
  animals: AnimalDef[];
}

export type StatId = 'handTip' | 'tapBoost' | 'spawnMult' | 'patience' | 'tips' | 'staffSpeed' | 'offlineHours';

export interface ShowRule {
  served?: number;
  staff?: number;
  floor?: string;
  /** Shown from this many stars (5: after the cafe is finished). */
  stars?: number;
}

export interface UpgradeDef {
  id: string;
  stat: StatId;
  /** add: value * level added to the stat. mul: value ^ level multiplies it. */
  op: 'add' | 'mul';
  value: number;
  max: number;
  cost: number;
  growth: number;
  show: ShowRule;
}

export type TaskType = 'served' | 'vips' | 'itemLevel' | 'unlock' | 'floor' | 'seats' | 'upgrade' | 'adopts' | 'staff' | 'decor' | 'earned';

/**
 * One short task (CLAUDE.md 5a): one at a time, in order, claimed with a tap for coins.
 * served, vips, adopts, staff, decor, earned: reach n in this run (decor: items owned, main run only).
 * itemLevel: item to level n. unlock: item on the menu. floor: floor open. seats: n seats on floor. upgrade: upgrade to level n.
 */
export interface TaskDef {
  id: string;
  type: TaskType;
  n?: number;
  item?: string;
  floor?: string;
  upgrade?: string;
  /** Reward in seconds of income instead of the default. */
  sec?: number;
}

export type OrderType = 'served' | 'hand' | 'vips' | 'sold' | 'special' | 'buys' | 'sales';

/**
 * One kind of daily order (main cafe after five stars). Counted from the start of the day.
 * served: customers served. hand: served by the player's tap. vips: VIPs served. sold: servings of one menu item
 * (picked that day). special: servings of today's special. buys: purchases with coins. sales: coins from customers.
 * n: the amounts one is picked from. min (sales only): minutes of current income, picked the same way.
 */
export interface OrderDef {
  type: OrderType;
  n?: number[];
  min?: number[];
}

export interface OrdersDef {
  perDay: number;
  /** Reward of each order: this many seconds of current income, at least rewardMin coins. */
  rewardSec: number;
  rewardMin: number;
  /** Free adoptions for finishing every order of the day. */
  bonusTickets: number;
  pool: OrderDef[];
}

export interface TasksDef {
  /** Reward: this many seconds of current income, at least rewardMin coins. */
  rewardSec: number;
  rewardMin: number;
  tasks: TaskDef[];
  orders: OrdersDef;
}

export interface Content {
  cafe: CafeDef;
  staff: StaffDef;
  upgrades: UpgradeDef[];
  tasks: TasksDef;
}

const TASK_TYPES: TaskType[] = ['served', 'vips', 'itemLevel', 'unlock', 'floor', 'seats', 'upgrade', 'adopts', 'staff', 'decor', 'earned'];
const ORDER_TYPES: OrderType[] = ['served', 'hand', 'vips', 'sold', 'special', 'buys', 'sales'];

export function checkContent(raw: { cafe: unknown; staff: unknown; upgrades: unknown; tasks: unknown }): Content {
  const c = contentChecker('src/content');
  const cafe = raw.cafe as CafeDef;
  const staff = raw.staff as StaffDef;
  const upgrades = (raw.upgrades as { upgrades: UpgradeDef[] }).upgrades;
  const tasks = raw.tasks as TasksDef;

  c.uniqueIds(cafe.floors, 'floor');
  c.uniqueIds(cafe.items, 'item');
  const floorIds = cafe.floors.map((f) => f.id);
  c.need(cafe.floors[0]?.unlockCost === 0, 'the first floor must be open from the start');
  for (const f of cafe.floors) {
    c.positive(f.spawnEvery, `floor ${f.id} spawnEvery`);
    c.need(f.startSeats >= 1 && f.maxSeats >= f.startSeats && f.maxSeats <= 4, `floor ${f.id}: seats 1..4`);
    c.need(f.seatCosts.length === f.maxSeats - f.startSeats, `floor ${f.id}: one seat cost per extra seat`);
    c.need(cafe.items.some((i) => i.floor === f.id && i.unlockCost === 0), `floor ${f.id} needs a starting item`);
  }
  for (const i of cafe.items) {
    c.ref(i.floor, floorIds, `item ${i.id} floor`);
    c.positive(i.value, `item ${i.id} value`);
    c.positive(i.makeTime, `item ${i.id} makeTime`);
    c.positive(i.levelCost, `item ${i.id} levelCost`);
    c.need(i.levelGrowth > 1, `item ${i.id} levelGrowth must be above 1`);
  }
  c.need(cafe.goals.length === 5, 'there must be exactly 5 goals (one per star)');
  if (cafe.levelCapBeforeLastFloor !== undefined) c.need(cafe.levelCapBeforeLastFloor >= 10 && cafe.levelCapBeforeLastFloor <= cafe.maxLevel, 'levelCapBeforeLastFloor: 10..maxLevel');
  for (const g of cafe.goals) {
    if (g.floor) c.ref(g.floor, floorIds, `goal ${g.id}`);
    if (g.itemLevel) c.ref(g.itemLevel, cafe.items.map((i) => i.id), `goal ${g.id}`);
  }

  c.uniqueIds(staff.rarities, 'rarity');
  c.uniqueIds(staff.animals, 'animal');
  const rarityIds = staff.rarities.map((r) => r.id);
  for (const a of staff.animals) c.ref(a.rarity, rarityIds, `animal ${a.id} rarity`);
  for (const r of rarityIds) c.need(staff.animals.some((a) => a.rarity === r && !a.exclusive), `no animal of rarity ${r} in the adoption roll`);
  c.ref(staff.adopt.firstGuided, staff.animals.filter((a) => !a.exclusive).map((a) => a.id), 'adopt.firstGuided');
  for (const [i, d] of cafe.daily.entries()) {
    if (d.animal) c.need(staff.animals.some((a) => a.id === d.animal && a.exclusive === 'daily'), `daily day ${i + 1}: animal must be an exclusive "daily" animal`);
    if (d.rarePal !== undefined) c.need(d.rarePal >= 1, `daily day ${i + 1}: rarePal >= 1`);
  }
  if (cafe.special) c.need(cafe.special.mult > 1, 'special.mult must be above 1');

  c.uniqueIds(upgrades, 'upgrade');
  for (const u of upgrades) {
    c.positive(u.cost, `upgrade ${u.id} cost`);
    c.need(u.max >= 1, `upgrade ${u.id} max`);
    if (u.show.floor) c.ref(u.show.floor, floorIds, `upgrade ${u.id} show.floor`);
    if (u.show.stars !== undefined) c.need(u.show.stars >= 1 && u.show.stars <= cafe.goals.length, `upgrade ${u.id} show.stars 1..${cafe.goals.length}`);
  }

  c.positive(tasks.rewardSec, 'tasks.rewardSec');
  c.uniqueIds(tasks.tasks, 'task');
  const itemIds = cafe.items.map((i) => i.id);
  for (const t of tasks.tasks) {
    c.ref(t.type, TASK_TYPES, `task ${t.id} type`);
    if (t.type === 'itemLevel' || t.type === 'unlock') c.ref(t.item ?? '', itemIds, `task ${t.id} item`);
    if (t.type === 'floor') c.ref(t.floor ?? '', floorIds, `task ${t.id} floor`);
    if (t.type === 'itemLevel' && cafe.levelCapBeforeLastFloor !== undefined) {
      // A level above the cap can only come after the task that opens the last floor.
      const last = cafe.floors[cafe.floors.length - 1].id;
      const openAt = tasks.tasks.findIndex((x) => x.type === 'floor' && x.floor === last);
      const i = tasks.tasks.indexOf(t);
      c.need((t.n ?? 0) <= cafe.levelCapBeforeLastFloor || (openAt >= 0 && openAt < i), `task ${t.id}: level above levelCapBeforeLastFloor before the last floor opens`);
    }
    if (t.type === 'seats') {
      c.ref(t.floor ?? '', floorIds, `task ${t.id} floor`);
      const f = cafe.floors.find((x) => x.id === t.floor);
      c.need(!f || (t.n ?? 0) <= f.maxSeats, `task ${t.id}: more seats than the floor has`);
    }
    if (t.type === 'upgrade') {
      c.ref(t.upgrade ?? '', upgrades.map((u) => u.id), `task ${t.id} upgrade`);
      const u = upgrades.find((x) => x.id === t.upgrade);
      c.need(!u || (t.n ?? 0) <= u.max, `task ${t.id}: level above the upgrade's max`);
    }
    if (t.type === 'itemLevel') c.need((t.n ?? 0) <= cafe.maxLevel, `task ${t.id}: level above maxLevel`);
    if (t.type === 'staff') c.need((t.n ?? 0) <= staff.animals.length, `task ${t.id}: more helpers than animals`);
    if (t.type !== 'unlock' && t.type !== 'floor') c.need((t.n ?? 0) >= 1, `task ${t.id} needs n >= 1`);
  }
  const orders = tasks.orders;
  c.need(!!orders, 'tasks.orders is missing');
  if (orders) {
    c.positive(orders.rewardSec, 'orders.rewardSec');
    c.need(orders.perDay >= 1 && orders.perDay <= orders.pool.length, 'orders.perDay: 1..pool size');
    for (const o of orders.pool) {
      c.ref(o.type, ORDER_TYPES, 'order type');
      const amounts = o.type === 'sales' ? o.min : o.n;
      c.need(!!amounts && amounts.length > 0 && amounts.every((x) => x > 0), `order ${o.type}: ${o.type === 'sales' ? 'min' : 'n'} needs positive amounts`);
    }
    c.need(new Set(orders.pool.map((o) => o.type)).size === orders.pool.length, 'orders.pool: one entry per type');
  }
  c.done();
  return { cafe, staff, upgrades, tasks };
}
