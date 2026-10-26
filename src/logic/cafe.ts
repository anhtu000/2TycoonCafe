// The whole economy of one cafe run, in plain TypeScript with no Phaser import.
// The play scene and the balance simulator (tools/sim) both drive this class,
// so simulated pacing matches the real game.
import { pityLeft, rarityOdds, Rng, rollRarity } from '../../core/rng.ts';
import type { AnimalDef, Content, GuestKind, ItemDef, OrderType, StatId, TaskDef, Trait, UpgradeDef } from './content.ts';

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
  /** v2: a mood (grey until served, pays moods.pay). */
  mood?: string;
  /** v2: a special guest. A giraffe orders from the floor above (its head is there); an elephant also takes seat2. */
  kind?: GuestKind;
  /** Servings ordered (elephant) and received so far. */
  need?: number;
  got?: number;
  /** Elephant: the second seat it takes. */
  seat2?: number;
  /** v2: dumbwaiter set, the second item (from another floor). */
  item2?: string;
  /** v2: came with a tour group. */
  tourist?: boolean;
}

export interface Carry {
  /** Seconds left before the serving reaches the customer. */
  t: number;
  total: number;
  customer: number;
  /** Dumbwaiter set: the second item, taken from its floor at pickup (put back if the customer has left). */
  item2?: string;
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
  /** v2: hand-serve chain: length and time of the last hand serve. */
  combo?: { n: number; t: number };
  /** v2: napping helpers: animal id -> seconds asleep left. */
  naps?: Record<string, number>;
  /** v2: seconds until the next nap. */
  napTimer?: number;
  /** v2: woken helpers: animal id -> seconds of extra speed left. */
  wake?: Record<string, number>;
  /** v2: stations the player arranged by hand: item id -> animal id (kept when helpers are rearranged). */
  pins?: Record<string, string>;
  /** v2: happy moody customers per floor (photos on the wall). */
  memories?: number[];
  /** v2: special guests served, by kind. */
  guests?: Partial<Record<GuestKind, number>>;
  /** v2: dumbwaiter sets served at least once ("coffee+croissant"). */
  sets?: string[];
  /** v2: the tour group in the cafe, or null. */
  tour?: { left: number; served: number; need: number } | null;
  /** v2: seconds until the next tour group. */
  tourTimer?: number;
  /** v2 counters for tasks: longest hand-serve chain, helpers woken, sets served, tour groups served in time. */
  bestCombo?: number;
  wakes?: number;
  setsServed?: number;
  tours?: number;
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
  /** combo: hand-serve chain length (hand only). set: the dumbwaiter set served. */
  | { type: 'served'; customer: Customer; coins: number; hand: boolean; vipBonus: number; combo?: number; beat?: boolean; set?: string }
  /** An elephant got one of its servings. */
  | { type: 'partial'; customer: Customer }
  | { type: 'nap'; animal: string; item: string }
  /** natural: woke up alone (no extra speed). */
  | { type: 'woke'; animal: string; item: string; natural: boolean }
  /** Two best friends now work on the same floor. */
  | { type: 'friends'; a: string; b: string }
  | { type: 'tourStart'; need: number; seconds: number }
  | { type: 'tourEnd'; success: boolean; coins: number; served: number; need: number }
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
    let value = stat === 'handTip' || stat === 'offlineHours' || stat === 'lift' ? 0 : 1;
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
    let tips = this.stat('tips') * this.extraTips * (staff ? this.animalTips(staff) : 1);
    if (staff && this.friendAt(id)) tips *= this.content.staff.friends.bonus;
    // A cool helper (penguin) earns more on the last floor (the Dessert Bar).
    if (staff && this.animal(staff).trait === 'cool' && this.floorIndexOf(id) === this.content.cafe.floors.length - 1) tips *= 1.2;
    return def.value * level * this.milestoneMult(level, 'value') * tips * (this.specialItem() === id ? this.content.cafe.special!.mult : 1);
  }

  /** Seconds of work per serving at speed 1. */
  makeTime(id: string) {
    return this.item(id).makeTime / this.milestoneMult(this.s.items[id].level, 'speed');
  }

  /** Machine speed: 1 by hand, the animal's speed with staff (friends, naps and cheer included). */
  stationSpeed(id: string) {
    const staff = this.s.assign[id];
    if (!staff) return 1;
    let v = this.animalSpeed(staff) * this.stat('staffSpeed');
    if (this.friendAt(id)) v *= this.content.staff.friends.bonus;
    const naps = this.content.cafe.naps;
    if (this.asleep(staff)) v *= naps.slow;
    else if ((this.s.wake?.[staff] ?? 0) > 0) v *= this.animal(staff).trait === 'sleepy' ? naps.wakeBoost * 1.5 : naps.wakeBoost;
    // A cheerful helper (Snow Fox) lifts everyone else.
    if (this.animal(staff).trait !== 'cheer' && this.hasTrait('cheer')) v *= 1.1;
    return v;
  }

  patience() {
    return this.content.cafe.customers.patience * this.stat('patience');
  }

  // ---------- v2: traits, friends, naps, combo ----------

  /** Stations at work: [item, animal], only unlocked ones. */
  working(): [string, string][] {
    return Object.entries(this.s.assign).filter(([item]) => this.s.items[item]?.unlocked);
  }

  /** Station (item id) where this animal works, or null. */
  stationOf(animal: string): string | null {
    for (const [item, a] of this.working()) if (a === animal) return item;
    return null;
  }

  /** Floors where a working helper has this trait. */
  traitFloors(t: Trait): number[] {
    const out: number[] = [];
    for (const [item, a] of this.working()) if (this.animal(a).trait === t) out.push(this.floorIndexOf(item));
    return out;
  }

  hasTrait(t: Trait) {
    for (const [, a] of this.working()) if (this.animal(a).trait === t) return true;
    return false;
  }

  areFriends(a: string, b: string) {
    return this.content.staff.friends.pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  }

  /** The best friend working on the same floor as the helper at this station, or null. */
  friendAt(item: string): string | null {
    const a = this.s.assign[item];
    if (!a) return null;
    for (const other of this.itemsOnFloor(this.floorIndexOf(item))) {
      if (other.id === item || !this.s.items[other.id].unlocked) continue;
      const b = this.s.assign[other.id];
      if (b && this.areFriends(a, b)) return b;
    }
    return null;
  }

  /** Pairs of best friends working on the same floor now, as "a|b" (sorted). */
  activePairs(): string[] {
    const out = new Set<string>();
    for (const [item, a] of this.working()) {
      const b = this.friendAt(item);
      if (b) out.add([a, b].sort().join('|'));
    }
    return [...out];
  }

  asleep(animal: string) {
    return (this.s.naps?.[animal] ?? 0) > 0;
  }

  /** Seconds of the hand-serve chain window (a combo helper lengthens it). */
  comboWindow() {
    return this.content.cafe.combo.window + (this.hasTrait('combo') ? 0.75 : 0);
  }

  /** Current hand-serve chain, 0 when it has run out. */
  comboNow() {
    const c = this.s.combo;
    return c && this.s.time - c.t <= this.comboWindow() ? c.n : 0;
  }

  /** Seconds left before the chain runs out. */
  comboLeft() {
    const c = this.s.combo;
    return c ? Math.max(0, this.comboWindow() - (this.s.time - c.t)) : 0;
  }

  /** Coins multiplier of the n-th hand serve in a row: the first pays as usual, each next one `step` more. */
  comboMult(n: number) {
    const c = this.content.cafe.combo;
    return 1 + c.step * Math.min(Math.max(0, n - 1), c.max);
  }

  /** Stop of the tortoise's journey: one per star (scenery). */
  region(): string {
    const j = this.content.cafe.journey;
    return j[Math.min(this.stars(), j.length - 1)];
  }

  /** "a+b" key of a dumbwaiter set, lower floor first. */
  setKey(a: string, b: string) {
    return this.floorIndexOf(a) <= this.floorIndexOf(b) ? `${a}+${b}` : `${b}+${a}`;
  }

  /** Wakes a napping helper: it works extra fast for a few seconds. */
  wake(animal: string, events: CafeEvent[] = []): boolean {
    if (!this.asleep(animal)) return false;
    delete this.s.naps![animal];
    (this.s.wake ??= {})[animal] = this.content.cafe.naps.wakeSeconds;
    this.s.wakes = (this.s.wakes ?? 0) + 1;
    events.push({ type: 'woke', animal, item: this.stationOf(animal) ?? '', natural: false });
    return true;
  }

  /**
   * Swaps the helpers of two stations (drag and drop). Either may be empty. Both stations stay as the player
   * arranged them when helpers are rearranged later (pins).
   */
  swapStaff(itemA: string, itemB: string): boolean {
    const s = this.s;
    if (itemA === itemB || !s.items[itemA]?.unlocked || !s.items[itemB]?.unlocked) return false;
    const x = s.assign[itemA];
    const y = s.assign[itemB];
    if (!x && !y) return false;
    const before = new Set(this.activePairs());
    const pins = (s.pins ??= {});
    for (const [item, a] of [
      [itemA, y],
      [itemB, x],
    ] as [string, string | undefined][]) {
      if (a) {
        s.assign[item] = a;
        pins[item] = a;
      } else {
        delete s.assign[item];
        delete pins[item];
      }
    }
    this.reassign(before);
    return true;
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

  /**
   * Puts the strongest animals at the most valuable stations. Stations the player arranged by hand (pins)
   * keep their helper. Then swaps that bring best friends together on a floor are made when they pay
   * (v2). `before`: pairs active before the change, for the "friends" event.
   */
  reassign(before: Set<string> = new Set(this.activePairs())) {
    const s = this.s;
    const items = this.content.cafe.items.filter((i) => s.items[i.id].unlocked);
    // Most valuable menu item first, so the best animal works where it earns most.
    items.sort((a, b) => b.value - a.value);
    const pins = s.pins ?? {};
    const assign: Record<string, string> = {};
    const used = new Set<string>();
    for (const item of items) {
      const a = pins[item.id];
      if (a && s.staff[a] && !used.has(a)) {
        assign[item.id] = a;
        used.add(a);
      } else delete pins[item.id];
    }
    const free = Object.keys(s.staff)
      .filter((a) => !used.has(a))
      .sort((a, b) => this.animalPower(b) - this.animalPower(a) || a.localeCompare(b));
    for (const item of items) if (!assign[item.id] && free.length) assign[item.id] = free.shift()!;
    // Local search over the stations not pinned, and the helpers resting: best friends on one floor
    // pay friends.bonus twice (speed and tips) on both stations.
    const open = items.filter((i) => !pins[i.id]).map((i) => i.id);
    const bench = free;
    const weight = (item: string) => this.item(item).value;
    const score = (as: Record<string, string>) => {
      let total = 0;
      for (const item of items) {
        const a = as[item.id];
        if (!a) continue;
        let v = weight(item.id) * this.animalPower(a);
        const f = this.floorIndexOf(item.id);
        const mate = this.itemsOnFloor(f).find((o) => o.id !== item.id && as[o.id] && this.areFriends(a, as[o.id]));
        if (mate) v *= this.content.staff.friends.bonus ** 2;
        total += v;
      }
      return total;
    };
    let best = score(assign);
    for (let round = 0; round < 20; round++) {
      let improved = false;
      for (let i = 0; i < open.length; i++) {
        for (let j = i + 1; j < open.length; j++) {
          const [p, q] = [open[i], open[j]];
          const trial = { ...assign };
          [trial[p], trial[q]] = [assign[q], assign[p]];
          if (!trial[p]) delete trial[p];
          if (!trial[q]) delete trial[q];
          const v = score(trial);
          if (v > best * (1 + 1e-9)) {
            Object.assign(assign, trial);
            for (const k of [p, q]) if (!trial[k]) delete assign[k];
            best = v;
            improved = true;
          }
        }
        for (let k = 0; k < bench.length; k++) {
          const p = open[i];
          const trial = { ...assign, [p]: bench[k] };
          const v = score(trial);
          if (v > best * (1 + 1e-9)) {
            const out = assign[p];
            assign[p] = bench[k];
            if (out) bench[k] = out;
            else bench.splice(k, 1);
            best = v;
            improved = true;
          }
        }
      }
      if (!improved) break;
    }
    s.assign = assign;
    // A helper that left its station stops napping.
    if (s.naps) for (const a of Object.keys(s.naps)) if (!this.stationOf(a)) delete s.naps[a];
    for (const pair of this.activePairs()) {
      if (before.has(pair)) continue;
      const [x, y] = pair.split('|');
      this.pending.push({ type: 'friends', a: x, b: y });
    }
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

  /**
   * Tap on a customer: serves them by hand when their order is on the counter. A dumbwaiter set needs both
   * items ready (the second comes up the lift); an elephant takes what is ready and waits for the rest.
   * beat: the tap landed on the music's beat (counts double in the hand-serve chain).
   */
  tapCustomer(cid: number, events: CafeEvent[] = [], beat = false): 'served' | 'partial' | 'notReady' | 'none' {
    const c = this.s.customers.find((x) => x.id === cid);
    if (!c || c.phase !== 'wait' || c.reserved) return 'none';
    const st = this.s.items[c.item];
    if (c.item2) {
      const st2 = this.s.items[c.item2];
      if (st.ready < 1 || st2.ready < 1) return 'notReady';
      st.ready -= 1;
      st2.ready -= 1;
    } else if (c.kind === 'elephant') {
      if (st.ready < 1) return 'notReady';
      const need = c.need ?? 2;
      const take = Math.min(st.ready, need - (c.got ?? 0));
      st.ready -= take;
      c.got = (c.got ?? 0) + take;
      if (c.got < need) {
        events.push({ type: 'partial', customer: c });
        return 'partial';
      }
    } else {
      if (st.ready < 1) return 'notReady';
      st.ready -= 1;
    }
    const prev = this.comboNow();
    const n = prev + (beat ? 2 : 1);
    this.s.combo = { n, t: this.s.time };
    this.s.bestCombo = Math.max(this.s.bestCombo ?? 0, n);
    this.serve(c, true, events, n, beat);
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

    // Customers arrive (much more often while a tour group is in).
    s.floors.forEach((f, i) => {
      if (!f.open) return;
      f.spawnTimer -= dt;
      if (f.spawnTimer > 0) return;
      const seat = this.freeSeat(i);
      if (seat < 0) return;
      // Now and then a tiny mouse comes instead: it sits on the counter and leaves the seat free.
      if (this.mouseCanCome(i) && this.rng.next() < this.content.cafe.guests.mouse.chance) this.spawn(i, -1, events, 'mouse');
      else this.spawn(i, seat, events);
      const def = this.content.cafe.floors[i];
      f.spawnTimer = def.spawnEvery * this.stat('spawnMult') * (0.75 + this.rng.next() * 0.5) * (s.tour ? this.content.cafe.tours.spawnMult : 1);
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
    this.stepNaps(dt, events);
    this.stepTour(dt, events);

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
          const carry = st.carry;
          const c = s.customers.find((x) => x.id === carry.customer);
          st.carry = null;
          if (c && c.phase === 'wait') {
            if (c.kind === 'elephant' && (c.got ?? 0) + 1 < (c.need ?? 2)) {
              // One of the elephant's servings: it waits for the rest.
              c.got = (c.got ?? 0) + 1;
              c.reserved = false;
              events.push({ type: 'partial', customer: c });
            } else {
              if (c.kind === 'elephant') c.got = c.need;
              this.serve(c, false, events);
            }
          } else {
            st.ready += 1;
            if (carry.item2) s.items[carry.item2].ready += 1;
          }
        }
      }
      st.hold = st.ready > 0 && !st.carry ? (st.hold ?? 0) + dt : 0;
      if (!st.carry && st.ready > 0 && st.hold >= this.content.cafe.staff.pickupDelay) {
        const c = this.neediest(def.id);
        if (c) {
          st.ready -= 1;
          // A set: the second item comes up the dumbwaiter at the same time.
          if (c.item2) s.items[c.item2].ready -= 1;
          c.reserved = true;
          const total = this.content.cafe.staff.deliverTime * (this.animal(animal).trait === 'quick' ? 0.7 : 1);
          st.carry = { t: total, total, customer: c.id, item2: c.item2 };
          events.push({ type: 'carry', item: def.id, customer: c.id });
        }
      }
      // Start the next serving when someone is waiting for it.
      if (st.job === null && st.ready < this.content.cafe.counterCap) {
        let wanted = 0;
        for (const c of s.customers) {
          if (c.phase === 'leave' || c.reserved || c.vip) continue;
          if (c.item === def.id) wanted += c.kind === 'elephant' ? (c.need ?? 2) - (c.got ?? 0) : 1;
          else if (c.item2 === def.id && this.stat('lift') >= 2) wanted += 1;
        }
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

  private takenSeats(floor: number) {
    const taken = new Set<number>();
    for (const c of this.s.customers) {
      if (c.floor !== floor || c.phase === 'leave') continue;
      taken.add(c.seat);
      if (c.seat2 !== undefined) taken.add(c.seat2);
    }
    return taken;
  }

  private freeSeat(floor: number) {
    const taken = this.takenSeats(floor);
    for (let i = 0; i < this.s.floors[floor].seats; i++) if (!taken.has(i)) return i;
    return -1;
  }

  /** A mouse may come: the tutorial is over, enough customers served, no other mouse on this floor. */
  private mouseCanCome(floor: number) {
    const s = this.s;
    return !!s.vipOn && s.served >= this.content.cafe.guests.mouse.fromServed && !s.customers.some((c) => c.floor === floor && c.kind === 'mouse' && c.phase !== 'leave');
  }

  /** Unlocked menu items of a floor. */
  private menuOf(floor: number) {
    return this.itemsOnFloor(floor).filter((i) => this.s.items[i.id].unlocked);
  }

  private spawn(floor: number, seat: number, events: CafeEvent[], kind?: GuestKind) {
    const s = this.s;
    const cfg = this.content.cafe;
    const menu = this.menuOf(floor);
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
    const vip = !kind && Boolean(s.vipOn && s.vipTimer <= 0);
    if (vip) {
      const v = cfg.vip;
      // A VIP-loving helper (shiba) calls them in sooner.
      s.vipTimer = (v.everyMin + this.rng.next() * (v.everyMax - v.everyMin)) * (this.hasTrait('vip') ? 0.75 : 1);
    }
    let patience = vip ? cfg.vip.patience * this.stat('patience') : this.patience();
    // A calm helper (capybara) on this floor makes its customers more patient.
    if (this.traitFloors('calm').includes(floor)) patience *= 1.2;
    const c: Customer = {
      id: s.nextId++,
      floor,
      seat,
      item: item.id,
      phase: 'walk',
      t: cfg.customers.walkIn,
      patience,
      maxPatience: patience,
      vip: vip || undefined,
      look: this.rng.int(0, 5),
    };
    if (kind === 'mouse') {
      // The cheapest thing on the menu, for a tiny guest.
      c.kind = 'mouse';
      c.item = menu[0].id;
    } else if (!vip && s.vipOn) this.dressUp(c, floor);
    const g = c.kind ? cfg.guests[c.kind] : null;
    if (g) c.patience = c.maxPatience = c.patience * g.patience;
    else if (c.item2) c.patience = c.maxPatience = c.patience * cfg.lift.patience;
    if (s.tour) c.tourist = true;
    s.rng = this.rng.state;
    s.customers.push(c);
    events.push({ type: 'spawn', customer: c });
  }

  /**
   * Who this customer is (v2), after the tutorial: a giraffe (orders from the floor above), an elephant
   * (two seats, two servings), a dumbwaiter set (one item from another floor), a mood, or plain.
   */
  private dressUp(c: Customer, floor: number) {
    const s = this.s;
    const cfg = this.content.cafe;
    const g = cfg.guests;
    const r = this.rng.next();
    let acc = g.giraffe.chance;
    const above = floor + 1 < s.floors.length && s.floors[floor + 1].open ? this.menuOf(floor + 1) : [];
    if (r < acc) {
      if (above.length && s.served >= g.giraffe.fromServed) {
        c.kind = 'giraffe';
        c.item = this.rng.pick(above).id;
      }
      return;
    }
    acc += g.elephant.chance;
    if (r < acc) {
      const taken = this.takenSeats(floor);
      const next = c.seat + 1;
      if (s.served >= g.elephant.fromServed && next < s.floors[floor].seats && !taken.has(next)) {
        c.kind = 'elephant';
        c.seat2 = next;
        c.need = g.elephant.servings ?? 2;
        c.got = 0;
      }
      return;
    }
    acc += cfg.lift.chance;
    if (r < acc) {
      if (this.stat('lift') >= 1) {
        const others = s.floors.flatMap((f, i) => (f.open && i !== floor ? this.menuOf(i) : []));
        if (others.length) c.item2 = this.rng.pick(others).id;
      }
      return;
    }
    acc += cfg.moods.chance;
    if (r < acc && s.served >= cfg.moods.fromServed) {
      const menu = this.menuOf(floor).map((i) => i.id);
      const fits = cfg.moods.list.filter((m) => m.items.some((i) => menu.includes(i)));
      if (!fits.length) return;
      const mood = this.rng.pick(fits);
      c.mood = mood.id;
      c.item = this.rng.pick(mood.items.filter((i) => menu.includes(i)));
    }
  }

  /** Waiting customer for this item who is closest to leaving. VIPs wait for the player's hand. */
  private neediest(item: string) {
    let best: Customer | null = null;
    // Sets: helpers serve them only with the dumbwaiter's second level, and when the other item is ready.
    const lift2 = this.stat('lift') >= 2;
    for (const c of this.s.customers) {
      if (c.item !== item || c.phase !== 'wait' || c.reserved || c.vip) continue;
      if (c.item2 && (!lift2 || this.s.items[c.item2].ready < 1)) continue;
      if (!best || c.patience < best.patience) best = c;
    }
    return best;
  }

  /** What a customer's order is worth before the hand bonus, rush and chain (sets, guests, moods, tourists). */
  orderValue(c: Customer) {
    const cfg = this.content.cafe;
    let v = this.itemValue(c.item);
    if (c.item2) v = (v + this.itemValue(c.item2)) * (cfg.lift.pay + (this.hasTrait('sets') ? 0.3 : 0));
    if (c.kind) v *= cfg.guests[c.kind].pay + (c.kind !== 'mouse' && this.hasTrait('giant') ? 0.5 : 0);
    if (c.mood) v *= cfg.moods.pay + (this.hasTrait('mood') ? 0.5 : 0);
    if (c.tourist) v *= cfg.tours.pay + (this.hasTrait('tour') ? 0.25 : 0);
    return v;
  }

  private serve(c: Customer, hand: boolean, events: CafeEvent[], combo = 0, beat = false) {
    const s = this.s;
    const cfg = this.content.cafe;
    let coins = this.orderValue(c) * (hand ? cfg.handBonus + this.stat('handTip') : 1) * (s.rushLeft > 0 ? cfg.rush.mult : 1) * (hand ? this.comboMult(combo) : 1);
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
    const sold = (s.sold ??= {});
    sold[c.item] = (sold[c.item] ?? 0) + (c.kind === 'elephant' ? (c.need ?? 2) : 1);
    let set: string | undefined;
    if (c.item2) {
      sold[c.item2] = (sold[c.item2] ?? 0) + 1;
      set = this.setKey(c.item, c.item2);
      s.setsServed = (s.setsServed ?? 0) + 1;
      if (!(s.sets ??= []).includes(set)) s.sets.push(set);
    }
    if (c.kind) (s.guests ??= {})[c.kind] = (s.guests[c.kind] ?? 0) + 1;
    if (c.mood) {
      const mem = (s.memories ??= []);
      while (mem.length <= c.floor) mem.push(0);
      mem[c.floor] += 1;
    }
    if (c.tourist && s.tour) s.tour.served += 1;
    s.sales = (s.sales ?? 0) + coins;
    c.phase = 'leave';
    c.t = cfg.customers.leave;
    c.happy = true;
    c.reserved = false;
    events.push({ type: 'served', customer: c, coins, hand, vipBonus, combo: hand ? combo : undefined, beat: hand ? beat : undefined, set });
  }

  // ---------- v2: naps and tour groups ----------

  private stepNaps(dt: number, events: CafeEvent[]) {
    const s = this.s;
    const cfg = this.content.cafe.naps;
    if (s.wake)
      for (const a of Object.keys(s.wake)) {
        s.wake[a] -= dt;
        if (s.wake[a] <= 0) delete s.wake[a];
      }
    if (s.naps)
      for (const a of Object.keys(s.naps)) {
        s.naps[a] -= dt;
        if (s.naps[a] <= 0) {
          delete s.naps[a];
          events.push({ type: 'woke', animal: a, item: this.stationOf(a) ?? '', natural: true });
        }
      }
    const working = this.working();
    if (s.calm || working.length < cfg.minStaff) return;
    // One nap at a time.
    if (s.naps && Object.keys(s.naps).length) return;
    s.napTimer = (s.napTimer ?? cfg.everyMax) - dt;
    if (s.napTimer > 0) return;
    // Sleepy helpers (koala) doze off three times as often as the others.
    const weights = working.map(([, a]) => (this.animal(a).trait === 'sleepy' ? 3 : 1));
    let roll = this.rng.next() * weights.reduce((x, y) => x + y, 0);
    let pick = working[0];
    for (let i = 0; i < working.length; i++) {
      roll -= weights[i];
      if (roll < 0) {
        pick = working[i];
        break;
      }
    }
    const [item, animal] = pick;
    (s.naps ??= {})[animal] = cfg.maxNap;
    s.napTimer = cfg.everyMin + this.rng.next() * (cfg.everyMax - cfg.everyMin);
    s.rng = this.rng.state;
    events.push({ type: 'nap', animal, item });
  }

  /** Tour groups come once the floor in tours.afterFloor is open (and not during the first-time tutorial). */
  toursOn() {
    const i = this.content.cafe.floors.findIndex((f) => f.id === this.content.cafe.tours.afterFloor);
    return i >= 0 && this.s.floors[i].open && !this.s.calm;
  }

  private stepTour(dt: number, events: CafeEvent[]) {
    const s = this.s;
    const cfg = this.content.cafe.tours;
    if (s.tour) {
      s.tour.left -= dt;
      if (s.tour.left > 0) return;
      const t = s.tour;
      s.tour = null;
      const success = t.served >= t.need;
      const coins = success ? Math.max(cfg.rewardMin, Math.round(Math.max(0, s.rate) * cfg.rewardSec)) : 0;
      if (coins) {
        this.addCoins(coins, false);
        s.tours = (s.tours ?? 0) + 1;
      }
      s.tourTimer = cfg.everyMin + this.rng.next() * (cfg.everyMax - cfg.everyMin);
      s.rng = this.rng.state;
      events.push({ type: 'tourEnd', success, coins, served: t.served, need: t.need });
      return;
    }
    if (!this.toursOn()) return;
    s.tourTimer = (s.tourTimer ?? cfg.firstAfter) - dt;
    if (s.tourTimer > 0) return;
    // More floors open, a bigger group.
    const floors = s.floors.filter((f) => f.open).length;
    const need = Math.round((cfg.need * floors) / 2);
    s.tour = { left: cfg.seconds, served: 0, need };
    // The first tourists walk in right away.
    for (const f of s.floors) if (f.open) f.spawnTimer = Math.min(f.spawnTimer, 0.3);
    events.push({ type: 'tourStart', need, seconds: cfg.seconds });
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

  /**
   * Decor tasks need the decorations of the main cafe; a timed run skips them. The best-friends task
   * is skipped when no pair of friends is on the staff (it could not be done).
   */
  private taskApplies(t: TaskDef) {
    if (t.type === 'decor' && this.s.mode !== 'main') return false;
    if (t.type === 'friends' && !this.ownsPair()) return false;
    return true;
  }

  /** At least one pair of best friends is on the staff. */
  ownsPair() {
    return this.content.staff.friends.pairs.some(([a, b]) => this.s.staff[a] && this.s.staff[b]);
  }

  /**
   * A swap of two stations that brings a pair of best friends onto one floor, or null.
   * (Task hint, and what the simulated player does for the friends task.)
   */
  friendSwap(): [string, string] | null {
    if (this.activePairs().length) return null;
    const stations = this.content.cafe.items.filter((i) => this.s.items[i.id].unlocked).map((i) => i.id);
    for (const [a, b] of this.content.staff.friends.pairs) {
      const sa = this.stationOf(a);
      const sb = this.stationOf(b);
      if (!sa || !sb) continue;
      // Move b next to a: onto the other station of a's floor.
      const mate = stations.find((x) => x !== sa && this.floorIndexOf(x) === this.floorIndexOf(sa));
      if (mate) return [sb, mate];
    }
    return null;
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
      case 'combo':
        return { have: Math.min(s.bestCombo ?? 0, n), need: n };
      case 'wakes':
        return { have: s.wakes ?? 0, need: n };
      case 'moods':
        return { have: (s.memories ?? []).reduce((a, b) => a + b, 0), need: n };
      case 'guests':
        return { have: Object.values(s.guests ?? {}).reduce((a, b) => a + (b ?? 0), 0), need: n };
      case 'sets':
        return { have: s.setsServed ?? 0, need: n };
      case 'tours':
        return { have: s.tours ?? 0, need: n };
      case 'friends':
        return { have: Math.min(this.activePairs().length, n), need: n };
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
