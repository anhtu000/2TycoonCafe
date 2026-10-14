// Simulated player for balance checks. Drives the same Cafe class as the game.
// Everything about the player is an assumption (tap speed, buying habit, ad use);
// real playtests replace it.
import { readFileSync } from 'node:fs';
import { checkContent, type Content } from '../../src/logic/content.ts';
import { Cafe, newRunState, type CafeEvent, type RewardId } from '../../src/logic/cafe.ts';

export function loadContent(): Content {
  const read = (p: string) => JSON.parse(readFileSync(new URL(`../../src/content/${p}`, import.meta.url), 'utf8'));
  return checkContent({ cafe: read('cafe.json'), staff: read('staff.json'), upgrades: read('upgrades.json') });
}

export interface AdPolicy {
  id: 'none' | 'realistic' | 'basic';
  label: string;
  /** Seconds the player waits after a button is ready before pressing it. */
  delay: number;
  /** Seconds the ad takes (game paused, clock running). */
  adSeconds: number;
}

export const AD_POLICIES: AdPolicy[] = [
  { id: 'none', label: 'No ads', delay: 0, adSeconds: 0 },
  { id: 'realistic', label: 'Watches ads (30 s each, not right away)', delay: 90, adSeconds: 30 },
  { id: 'basic', label: 'Rewards without ads, used when ready', delay: 0, adSeconds: 0 },
];

export interface TapProfile {
  id: string;
  label: string;
  /** Taps per second the player spends on machines and customers. auto: at least one animal works. */
  tps: (sec: number, auto: boolean) => number;
}

export const PROFILES: Record<string, TapProfile> = {
  active: { id: 'active', label: 'Taps steadily', tps: (s) => (s < 300 ? 3 : s < 900 ? 2.5 : 2) },
  idle: { id: 'idle', label: 'Taps now and then once animals work', tps: (s, auto) => (auto ? 0.3 : s < 300 ? 3 : 2.5) },
};

export interface Milestone {
  t: number;
  what: string;
}

export interface RunReport {
  seed: number;
  policy: string;
  profile: string;
  finished: boolean;
  finishSec: number;
  milestones: Milestone[];
  /** Longest stretch without a purchase, per period. */
  maxBuyGap: { first10: number; to30: number; after30: number };
  served: number;
  lost: number;
  handServed: number;
  vips: number;
  hearts: number;
  adopts: number;
  rewards: Record<string, number>;
  /** Income per second at 10, 20, 30 minutes. */
  rateAt: Record<string, number>;
  staffAt: Record<string, number>;
}

const STEP = 0.1;
const COOLDOWN = 300;

export function simulate(
  content: Content,
  seed: number,
  policy: AdPolicy,
  profile: TapProfile,
  maxSec = 3 * 3600,
  everyMinute?: (cafe: Cafe, wall: number) => void,
): RunReport {
  let nextLog = 60;
  const state = newRunState(content, 'main', seed);
  state.calm = true;
  const cafe = new Cafe(content, state);
  const s = state;
  const ms: Milestone[] = [];
  const mark = (what: string) => ms.push({ t: wall, what });
  const seen = new Set<string>();
  const once = (key: string, what = key) => {
    if (!seen.has(key)) {
      seen.add(key);
      mark(what);
    }
  };
  let wall = 0;
  let budget = 0;
  let lastBuy = 0;
  const gaps = { first10: 0, to30: 0, after30: 0 };
  let handServed = 0;
  let vips = 0;
  let hearts = 0;
  const rewards: Record<string, number> = {};
  const rateAt: Record<string, number> = {};
  const staffAt: Record<string, number> = {};
  let nextShop = 0;

  const noteBuy = (what: string) => {
    const gap = wall - lastBuy;
    const key = lastBuy < 600 ? 'first10' : lastBuy < 1800 ? 'to30' : 'after30';
    gaps[key] = Math.max(gaps[key], gap);
    lastBuy = wall;
    if (/^(Open|Seat|Menu|Adopt \d)/.test(what) || / L1$/.test(what) || what === 'Adopt extra') once(what);
  };

  const onEvents = (events: CafeEvent[]) => {
    for (const e of events) {
      if (e.type === 'served') {
        if (e.hand) handServed++;
        if (e.customer.vip && e.hand) vips++;
        hearts += e.hearts;
        if (s.served === 1) once('First serve');
      } else if (e.type === 'star') once(`Star ${e.stars}`);
    }
  };

  const useReward = (id: RewardId) => {
    if (policy.id === 'none' || !cafe.rewardReady(id)) return false;
    if ((s.rewardReadyAt[id] ?? 0) + policy.delay > s.time) return false;
    if (id === 'rush') {
      if (s.staff && cafe.staffCount() === 0) return false;
      cafe.startRush();
    } else if (id === 'freeAdopt') {
      if (cafe.staffCount() === 0) return false;
      cafe.adopt(false);
    }
    cafe.startCooldown(id, COOLDOWN);
    rewards[id] = (rewards[id] ?? 0) + 1;
    wall += policy.adSeconds;
    return true;
  };

  while (wall < maxSec && s.finishedAt === null) {
    const auto = cafe.staffCount() > 0;
    // Tutorial: patience off until 3 customers are served; VIPs from 15 served.
    if (s.calm && s.served >= 3) s.calm = false;
    if (!s.vipOn && s.served >= 15) s.vipOn = true;

    budget = Math.min(2, budget + profile.tps(wall, auto) * STEP);
    const events: CafeEvent[] = [];
    while (budget >= 1) {
      if (!handAction(cafe, events)) break;
      budget -= 1;
    }
    cafe.step(STEP, events);
    onEvents(events);
    wall += STEP;

    if (wall >= nextShop) {
      nextShop = wall + 0.5;
      const bought = shop(cafe, wall);
      if (bought) noteBuy(bought);
      useReward('rush');
      useReward('freeAdopt');
    }
    if (everyMinute && wall >= nextLog) {
      nextLog += 60;
      everyMinute(cafe, wall);
    }
    for (const m of [600, 1200, 1800]) {
      if (rateAt[m / 60] === undefined && wall >= m) {
        rateAt[m / 60] = Math.round(s.rate);
        staffAt[m / 60] = cafe.staffCount();
      }
    }
  }
  noteBuy('');
  return {
    seed,
    policy: policy.id,
    profile: profile.id,
    finished: s.finishedAt !== null,
    finishSec: wall,
    milestones: ms,
    maxBuyGap: gaps,
    served: s.served,
    lost: s.lost,
    handServed,
    vips,
    hearts,
    adopts: cafe.staffCount(),
    rewards,
    rateAt,
    staffAt,
  };
}

/** One hand action, or false when nothing useful is left. */
function handAction(cafe: Cafe, events: CafeEvent[]): boolean {
  const s = cafe.s;
  const waiting = s.customers.filter((c) => c.phase === 'wait' && !c.reserved);
  // 1. Serve someone whose order is ready, VIPs first, then the most impatient.
  const servable = waiting.filter((c) => s.items[c.item].ready > 0).sort((a, b) => Number(!!b.vip) - Number(!!a.vip) || a.patience - b.patience);
  if (servable.length) {
    cafe.tapCustomer(servable[0].id, events);
    return true;
  }
  // 2. Make what someone wants and nobody is making.
  const wanting = s.customers.filter((c) => c.phase !== 'leave' && !c.reserved);
  const need = new Map<string, number>();
  for (const c of wanting) need.set(c.item, (need.get(c.item) ?? 0) + 1);
  let best: string | null = null;
  let bestScore = 0;
  for (const [item, n] of need) {
    const st = s.items[item];
    const short = n - st.ready - (st.job !== null ? 1 : 0);
    const staffed = Boolean(s.assign[item]);
    const score = (short > 0 ? 2 : st.job !== null && n > st.ready ? 1 : 0) + (staffed ? 0 : 0.5);
    if (score > bestScore && st.ready < cafe.content.cafe.counterCap) {
      bestScore = score;
      best = item;
    }
  }
  if (best && bestScore >= 1) {
    cafe.tapStation(best);
    return true;
  }
  return false;
}

/** Buys at most one thing. Returns its label, or null. */
function shop(cafe: Cafe, wall: number): string | null {
  const s = cafe.s;
  const content = cafe.content;
  const rate = Math.max(s.rate, 1);
  const save = wall < 600 ? 25 : 45;

  type Cand = { label: string; cost: number; prio: number; buy: () => boolean };
  const cands: Cand[] = [];
  content.cafe.floors.forEach((f, i) => {
    if (!s.floors[i].open && (i === 0 || s.floors[i - 1].open)) cands.push({ label: `Open ${f.id}`, cost: f.unlockCost, prio: 3, buy: () => cafe.openFloor(i) });
    const seat = cafe.seatCost(i);
    if (s.floors[i].open && seat !== null) cands.push({ label: `Seat ${f.id} ${s.floors[i].seats + 1}`, cost: seat, prio: 2, buy: () => cafe.buySeat(i) });
  });
  for (const item of content.cafe.items) {
    const st = s.items[item.id];
    if (!st.unlocked && s.floors[cafe.floorIndexOf(item.id)].open)
      cands.push({ label: `Menu ${item.id}`, cost: item.unlockCost, prio: 3, buy: () => cafe.unlockItem(item.id) });
  }
  if (cafe.staffCount() < cafe.slotCount())
    cands.push({
      label: `Adopt ${cafe.staffCount() + 1}`,
      cost: cafe.adoptCost(),
      prio: 3,
      // The game's first adoption is the tutorial capybara.
      buy: () => cafe.adopt(true, s.adopts === 0 ? content.staff.adopt.firstGuided : undefined) !== null,
    });

  // Big unlocks first: save for them when they are near.
  const unlocks = cands.filter((c) => c.prio >= 2).sort((a, b) => a.cost - b.cost);
  const target = unlocks[0];
  if (target && target.cost <= s.coins) return target.buy() ? target.label : null;
  const reserve = target && target.cost <= rate * save ? target.cost : 0;
  const spendable = s.coins - reserve;

  // Otherwise the best item level or upgrade per coin.
  const small: Cand[] = [];
  for (const item of content.cafe.items) {
    const st = s.items[item.id];
    if (!cafe.canLevelItem(item.id)) continue;
    const cost = cafe.itemLevelCost(item.id);
    const gain = cafe.itemValue(item.id, st.level + 1) - cafe.itemValue(item.id);
    // Weight by how often the item is ordered on its floor.
    const share = 1 / cafe.itemsOnFloor(cafe.floorIndexOf(item.id)).filter((i) => s.items[i.id].unlocked).length;
    small.push({ label: `${item.id} L${st.level + 1}`, cost, prio: (gain * share) / cost, buy: () => cafe.buyItemLevel(item.id) });
  }
  for (const u of content.upgrades) {
    if (!cafe.upgradeVisible(u) || cafe.upgradeMaxed(u.id)) continue;
    const cost = cafe.upgradeCost(u.id);
    if (cost > rate * 40) continue;
    small.push({ label: `${u.id} L${cafe.level(u.id) + 1}`, cost, prio: 1e9 / cost, buy: () => cafe.buyUpgrade(u.id) });
  }
  if (cafe.staffCount() >= cafe.slotCount() && cafe.adoptCost() < rate * 30)
    small.push({ label: `Adopt extra`, cost: cafe.adoptCost(), prio: 1e9 / cafe.adoptCost(), buy: () => cafe.adopt(true) !== null });
  const affordable = small.filter((c) => c.cost <= spendable).sort((a, b) => b.prio - a.prio);
  if (affordable.length) {
    const c = affordable[0];
    return c.buy() ? c.label : null;
  }
  return null;
}
