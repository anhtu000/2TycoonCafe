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
  /** Ready servings a counter spot holds per item. */
  counterCap: number;
  customers: { walkIn: number; leave: number; patience: number; heartShare: number };
  /** Seconds of making progress per tap on a busy machine. */
  tap: { boost: number };
  /** Seconds an animal needs to carry a serving to a customer, at speed 1. */
  staff: { deliverTime: number; pickupDelay: number };
  /** Coins multiplier for a customer served by the player's own tap (staff: 1). */
  handBonus: number;
  /** Golden customer: tap-served only; pays bonusSeconds of income and hearts. */
  vip: { everyMin: number; everyMax: number; patience: number; bonusSeconds: number; hearts: number; firstAfter: number };
  /** Five goals, one star each. The fifth star is the end of the run. */
  goals: GoalDef[];
  offline: { efficiency: number; capHours: number; minSeconds: number };
  rush: { seconds: number; mult: number };
  /** 7-day gift: minutes of income, hearts, free adoptions. */
  daily: { coinsMin?: number; hearts?: number; ticket?: number }[];
  rewarded: {
    /** Seconds between two uses of a boost (Rush Hour, free helper). x1.5 when the portal gives rewards without ads. */
    cooldown: number;
    freeUpgradeCooldown: number;
    /** The free upgrade goes on the dearest card the player cannot afford yet, within this many seconds of income. */
    freeUpgradeWindow: number;
    offlineMult: number;
    dailyMult: number;
  };
}

export type Perk = 'speed' | 'tips';

export interface AnimalDef {
  id: string;
  rarity: string;
  perk: Perk;
  perkValue: number;
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

export interface Content {
  cafe: CafeDef;
  staff: StaffDef;
  upgrades: UpgradeDef[];
}

export function checkContent(raw: { cafe: unknown; staff: unknown; upgrades: unknown }): Content {
  const c = contentChecker('src/content');
  const cafe = raw.cafe as CafeDef;
  const staff = raw.staff as StaffDef;
  const upgrades = (raw.upgrades as { upgrades: UpgradeDef[] }).upgrades;

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
  for (const g of cafe.goals) {
    if (g.floor) c.ref(g.floor, floorIds, `goal ${g.id}`);
    if (g.itemLevel) c.ref(g.itemLevel, cafe.items.map((i) => i.id), `goal ${g.id}`);
  }

  c.uniqueIds(staff.rarities, 'rarity');
  c.uniqueIds(staff.animals, 'animal');
  const rarityIds = staff.rarities.map((r) => r.id);
  for (const a of staff.animals) c.ref(a.rarity, rarityIds, `animal ${a.id} rarity`);
  for (const r of rarityIds) c.need(staff.animals.some((a) => a.rarity === r), `no animal of rarity ${r}`);
  c.ref(staff.adopt.firstGuided, staff.animals.map((a) => a.id), 'adopt.firstGuided');

  c.uniqueIds(upgrades, 'upgrade');
  for (const u of upgrades) {
    c.positive(u.cost, `upgrade ${u.id} cost`);
    c.need(u.max >= 1, `upgrade ${u.id} max`);
    if (u.show.floor) c.ref(u.show.floor, floorIds, `upgrade ${u.id} show.floor`);
  }
  c.done();
  return { cafe, staff, upgrades };
}
