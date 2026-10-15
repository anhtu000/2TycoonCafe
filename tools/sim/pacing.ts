// Pacing report: what the player does and gets, minute by minute.
// Run: node --experimental-strip-types tools/sim/pacing.ts [seeds] [--json out.json]
//
// Players (assumptions, real playtests replace them):
//   active  taps steadily, saves for big unlocks, best value per coin (same as tools/sim/run.ts)
//   casual  first-time player: slower taps, buys the cheapest lit card, looks at the shop every 2 s
//   idle    taps steadily until a helper works, then rarely
// Ads: none, or poki: offers follow the game state with no timers (Poki build); the player
// takes one rewarded ad at most every `adGap` seconds, 20 s each.
import { writeFileSync } from 'node:fs';
import { Cafe, newRunState, type CafeEvent } from '../../src/logic/cafe.ts';
import { doTasks, handAction, loadContent, loadDecor, shop } from './player.ts';

const content = loadContent();
const args = process.argv.slice(2);
const seeds = Number(args.find((a) => /^\d+$/.test(a)) ?? 100);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const brief = args.includes('--brief');

interface Player {
  id: string;
  label: string;
  tps: (sec: number, auto: boolean) => number;
  style: 'smart' | 'cheap' | 'spend';
  shopEvery: number;
}
const PLAYERS: Player[] = [
  { id: 'active', label: 'Taps steadily, buys smart', tps: (s) => (s < 300 ? 3 : s < 900 ? 2.5 : 2), style: 'smart', shopEvery: 0.5 },
  { id: 'casual', label: 'First-time player, buys the cheapest card', tps: (s, auto) => (auto ? 1.0 : s < 300 ? 1.6 : 1.3), style: 'cheap', shopEvery: 2 },
  // Like the playtest bot on the real build: claims tasks, opens what it can afford, then buys the card the
  // task asks for or else the cheapest card, the moment it can. Never saves for anything.
  { id: 'spender', label: 'Never saves (like the playtest bot)', tps: (s) => (s < 300 ? 3 : 2.5), style: 'spend', shopEvery: 0.4 },
  { id: 'idle', label: 'Taps rarely once helpers work', tps: (s, auto) => (auto ? 0.3 : s < 300 ? 3 : 2.5), style: 'smart', shopEvery: 0.5 },
];
interface AdPlan {
  id: 'none' | 'poki' | 'binge';
  adGap: number;
  adSec: number;
}
// Poki build: every offer follows the game state (rewarded.afterBuys), no timers.
// poki: takes one offer at most every adGap seconds. binge: takes every offer the moment it shows.
const ADS: AdPlan[] = [
  { id: 'none', adGap: Infinity, adSec: 0 },
  { id: 'poki', adGap: 180, adSec: 20 },
  { id: 'binge', adGap: 0, adSec: 20 },
];

const MINUTES = 60;
type Bucket = { taps: number; hand: number; auto: number; earned: number; handEarned: number; buys: number; news: number; lost: number; idle: number; ads: number; tasks: number };
const emptyBucket = (): Bucket => ({ taps: 0, hand: 0, auto: 0, earned: 0, handEarned: 0, buys: 0, news: 0, lost: 0, idle: 0, ads: 0, tasks: 0 });
const decorDef = loadDecor();

interface Run {
  finishSec: number | null;
  stars: number[];
  buckets: Bucket[];
  /** Times of "something new" (card, unlock, animal, star, milestone, first VIP). */
  newTimes: { t: number; what: string }[];
  buyTimes: number[];
  /** Task claims. */
  taskTimes: number[];
  firstReward: number;
  spent: Record<string, number>;
  adopts: number;
  served: number;
  lost: number;
  rateAt: Record<number, number>;
  /** Income per second at each whole minute. */
  rateByMin: number[];
  handShareAt: Record<number, number>;
  taskCoins: number;
  tasksDone: number;
  /** First time each task's condition held, in chain order (whatever task was current). */
  natural: number[];
  claimAt: Record<string, number>;
}

/** The playtest bot's buying (/tmp bot2.js): floors and menu items first, then the task's card, then the cheapest. */
function spend(cafe: Cafe): string | null {
  const s = cafe.s;
  const floors = content.cafe.floors;
  for (let i = 0; i < floors.length; i++)
    if (!s.floors[i].open && (i === 0 || s.floors[i - 1].open) && s.coins >= floors[i].unlockCost && cafe.openFloor(i)) return `Open ${floors[i].id}`;
  for (const it of content.cafe.items)
    if (!s.items[it.id].unlocked && s.floors[cafe.floorIndexOf(it.id)].open && s.coins >= it.unlockCost && cafe.unlockItem(it.id)) return `Menu ${it.id}`;
  const cards: { id: string; label: string; cost: number; buy: () => boolean }[] = [];
  for (const it of content.cafe.items)
    if (s.items[it.id].unlocked && cafe.canLevelItem(it.id)) cards.push({ id: `item:${it.id}`, label: it.id, cost: cafe.itemLevelCost(it.id), buy: () => cafe.buyItemLevel(it.id) });
  for (const u of content.upgrades)
    if (cafe.upgradeVisible(u) && !cafe.upgradeMaxed(u.id)) cards.push({ id: `up:${u.id}`, label: u.id, cost: cafe.upgradeCost(u.id), buy: () => cafe.buyUpgrade(u.id) });
  if (s.served >= 10 || cafe.staffCount() > 0) cards.push({ id: 'adopt', label: 'Adopt', cost: cafe.adoptCost(), buy: () => cafe.adopt(true) !== null });
  floors.forEach((_, i) => {
    const c = cafe.seatCost(i);
    if (s.floors[i].open && c !== null) cards.push({ id: `seat:${i}`, label: 'Seat', cost: c, buy: () => cafe.buySeat(i) });
  });
  const t = cafe.task();
  const want = t && !cafe.taskDone(t)
    ? ({ itemLevel: `item:${t.item}`, upgrade: `up:${t.upgrade}`, adopts: 'adopt', staff: 'adopt', seats: `seat:${floors.findIndex((f) => f.id === t.floor)}` } as Record<string, string>)[t.type]
    : undefined;
  const affordable = cards.filter((c) => c.cost <= s.coins).sort((a, b) => Number(b.id === want) - Number(a.id === want) || a.cost - b.cost);
  return affordable.length && affordable[0].buy() ? affordable[0].label : null;
}

function simulate(seed: number, player: Player, ads: AdPlan, maxSec = 3 * 3600): Run {
  const s = newRunState(content, 'main', seed);
  s.calm = true;
  const cafe = new Cafe(content, s);
  const STEP = 0.1;
  let wall = 0;
  let budget = 0;
  let nextShop = 0;
  let lastAd = -Infinity;
  const buckets: Bucket[] = [];
  const bucket = () => (buckets[Math.floor(wall / 60)] ??= emptyBucket());
  const newTimes: Run['newTimes'] = [];
  const buyTimes: number[] = [];
  const taskTimes: number[] = [];
  const owned: string[] = [];
  let taskCoins = 0;
  const natural: number[] = content.tasks.tasks.map(() => Infinity);
  const claimAt: Record<string, number> = {};
  const stars: number[] = [];
  const spent: Record<string, number> = {};
  const rateAt: Record<number, number> = {};
  const rateByMin: number[] = [];
  const handShareAt: Record<number, number> = {};
  const seen = new Set<string>();
  let firstReward = -1;
  let vipSeen = false;
  // Hand and auto income over the last minute, for the hand share.
  let winHand = 0;
  let winAll = 0;
  const note = (key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    if (wall > 0.2) {
      newTimes.push({ t: wall, what: key });
      bucket().news++;
    }
  };
  const visible = () => {
    // What the player sees in the shop and on the floors (same rules as PlayScene.shopEntries).
    const keys: string[] = [];
    if (s.served >= 10 || cafe.staffCount() > 0) keys.push('card:adopt');
    for (const item of content.cafe.items) if (s.items[item.id].unlocked) keys.push(`item:${item.id}`);
    content.cafe.floors.forEach((_, i) => {
      if (s.floors[i].open && cafe.seatCost(i) !== null && !(i === 0 && s.served < 4)) keys.push(`card:seat${i}`);
      if (s.floors[i].open) keys.push(`floor:${i}`);
    });
    for (const u of content.upgrades) if (cafe.upgradeVisible(u)) keys.push(`card:${u.id}`);
    for (const id of Object.keys(s.staff)) keys.push(`animal:${id}`);
    for (const item of content.cafe.items) {
      const lv = s.items[item.id].level;
      for (const m of content.cafe.milestones) if (s.items[item.id].unlocked && lv >= m.level) keys.push(`milestone:${item.id}:${m.level}`);
    }
    return keys;
  };
  for (const k of visible()) seen.add(k);

  const anyAffordable = () => {
    for (const item of content.cafe.items) {
      const st = s.items[item.id];
      if (st.unlocked && cafe.canLevelItem(item.id) && cafe.itemLevelCost(item.id) <= s.coins) return true;
      if (!st.unlocked && s.floors[cafe.floorIndexOf(item.id)].open && item.unlockCost <= s.coins) return true;
    }
    for (const u of content.upgrades) if (cafe.upgradeVisible(u) && !cafe.upgradeMaxed(u.id) && cafe.upgradeCost(u.id) <= s.coins) return true;
    for (let i = 0; i < s.floors.length; i++) {
      const c = cafe.seatCost(i);
      if (s.floors[i].open && c !== null && c <= s.coins) return true;
      if (!s.floors[i].open && (i === 0 || s.floors[i - 1].open) && content.cafe.floors[i].unlockCost <= s.coins) return true;
    }
    return (s.served >= 10 || cafe.staffCount() > 0) && cafe.adoptCost() <= s.coins;
  };

  const tryAd = () => {
    if (ads.id === 'none' || cafe.staffCount() === 0 || wall - lastAd < ads.adGap) return;
    // Same offers as the Poki build: a free helper when a station is empty and coins are short,
    // a free upgrade on a card the player cannot afford yet, Rush Hour when it is not running.
    const needHelper = cafe.staffCount() < cafe.slotCount() && s.coins < cafe.adoptCost();
    const free = cafe.freeUpgradeTarget();
    // A sensible player: the helper first, then a free level on a menu item, then Rush Hour.
    // Free upgrades that add no income (chairs, pantry...) are skipped.
    if (needHelper && cafe.rewardArmed('freeAdopt')) {
      cafe.adopt(false);
      cafe.useReward('freeAdopt');
    } else if (free?.startsWith('item:') && cafe.rewardArmed('freeUpgrade')) {
      cafe.grantFree(free);
      cafe.useReward('freeUpgrade');
    } else if (s.rushLeft <= 0 && cafe.rewardArmed('rush')) {
      cafe.startRush();
      cafe.useReward('rush');
    } else return;
    lastAd = wall;
    wall += ads.adSec;
    bucket().ads++;
  };

  while (wall < maxSec && s.finishedAt === null) {
    const auto = cafe.staffCount() > 0;
    if (s.calm && s.served >= 3) s.calm = false;
    if (!s.vipOn && s.served >= 15) s.vipOn = true;
    budget = Math.min(2, budget + player.tps(wall, auto) * STEP);
    const events: CafeEvent[] = [];
    let acted = false;
    while (budget >= 1) {
      const servedBefore = s.served;
      if (!handAction(cafe, events)) break;
      acted = true;
      budget -= 1;
      if (s.served === servedBefore) bucket().taps++;
    }
    const coinsBefore = s.coins;
    cafe.step(STEP, events);
    void coinsBefore;
    for (const e of events) {
      if (e.type === 'served') {
        const b = bucket();
        b.earned += e.coins;
        winAll += e.coins;
        if (e.hand) {
          b.hand++;
          b.handEarned += e.coins;
          winHand += e.coins;
        } else b.auto++;
        if (firstReward < 0) firstReward = wall;
        if (e.customer.vip && e.hand && !vipSeen) {
          vipSeen = true;
          note('first VIP');
        }
      } else if (e.type === 'lost') bucket().lost++;
    }
    // Nothing useful for the hands: nobody waiting for an order (to make, speed up or serve) and nothing to buy.
    void acted;
    if (!s.customers.some((c) => c.phase !== 'leave' && !c.reserved) && !anyAffordable()) bucket().idle += STEP;
    while (stars.length < cafe.stars()) stars.push(wall);
    wall += STEP;

    if (wall >= nextShop) {
      nextShop = wall + player.shopEvery;
      const task = doTasks(cafe, decorDef, owned);
      if (task.bought) {
        buyTimes.push(wall);
        bucket().buys++;
        spent[task.kind] = (spent[task.kind] ?? 0) + task.cost;
      }
      if (task.claimed) {
        taskTimes.push(wall);
        claimAt[task.id!] = wall;
        bucket().tasks++;
        taskCoins += task.claimed;
      }
      const before = s.coins;
      const label = player.style === 'spend' ? spend(cafe) : task.saveFor ? null : shop(cafe, wall, player.style);
      if (label) {
        buyTimes.push(wall);
        bucket().buys++;
        const kind = label.split(' ')[0].replace(/^(coffee|tea|croissant|cake|icecream|bubbletea)$/, 'item level');
        spent[kind] = (spent[kind] ?? 0) + (before - s.coins);
      }
      tryAd();
      for (const k of visible()) note(k);
      content.tasks.tasks.forEach((t, i) => {
        if (natural[i] === Infinity && cafe.taskDone(t)) natural[i] = wall;
      });
    }
    for (const m of [5, 10, 15, 20, 30, 40, 50]) {
      if (rateAt[m] === undefined && wall >= m * 60) {
        rateAt[m] = s.rate;
        handShareAt[m] = winAll > 0 ? winHand / winAll : 0;
      }
    }
    if (Math.floor(wall / 60) !== Math.floor((wall - STEP) / 60)) {
      rateByMin[Math.floor(wall / 60)] = s.rate;
      winHand = 0;
      winAll = 0;
    }
  }
  for (const k of visible()) note(k);
  return {
    finishSec: s.finishedAt !== null ? wall : null,
    stars,
    buckets,
    newTimes,
    buyTimes,
    taskTimes,
    taskCoins,
    tasksDone: cafe.tasksClaimed(),
    natural,
    claimAt,
    firstReward,
    spent,
    adopts: cafe.staffCount(),
    served: s.served,
    lost: s.lost,
    rateAt,
    rateByMin,
    handShareAt,
  };
}

const med = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : NaN;
};
const pct = (xs: number[], p: number) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? v[Math.min(v.length - 1, Math.floor((p / 100) * v.length))] : NaN;
};
const fmt = (sec: number) => (Number.isFinite(sec) ? `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}` : '-');
const maxGap = (times: number[], from: number, to: number) => {
  const ts = [from, ...times.filter((t) => t > from && t < to), to];
  let g = 0;
  for (let i = 1; i < ts.length; i++) g = Math.max(g, ts[i] - ts[i - 1]);
  return g;
};
const short = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toFixed(0));

const report: Record<string, unknown> = { seeds, generatedAt: new Date().toISOString() };
for (const player of PLAYERS) {
  for (const ads of ADS) {
    if ((player.id === 'idle' || player.id === 'spender') && ads.id !== 'none') continue;
    if (only && !only.includes(`${player.id}.${ads.id}`)) continue;
    const runs: Run[] = [];
    for (let i = 0; i < seeds; i++) runs.push(simulate(1000 + i, player, ads));
    const key = `${player.id}.${ads.id}`;
    const fin = runs.map((r) => r.finishSec ?? Infinity);
    console.log(`\n=== ${player.label} | ads: ${ads.id} (${seeds} runs) ===`);
    console.log(`finish p10 ${fmt(pct(fin, 10))} p50 ${fmt(med(fin))} p90 ${fmt(pct(fin, 90))}; unfinished in 3 h: ${runs.filter((r) => r.finishSec === null).length}`);
    const starMed = [0, 1, 2, 3, 4].map((i) => med(runs.map((r) => r.stars[i] ?? Infinity)));
    console.log(`stars at ${starMed.map(fmt).join(' / ')}`);
    console.log(`first coins at ${med(runs.map((r) => r.firstReward)).toFixed(1)} s; served ${med(runs.map((r) => r.served))}, lost ${med(runs.map((r) => r.lost))}, helpers ${med(runs.map((r) => r.adopts))}`);
    // Up to the finish: after it the run stops.
    const gaps = (f: (r: Run) => number[], a: number, b: number) => pct(runs.map((r) => maxGap(f(r), a, Math.max(a, Math.min(b, r.finishSec ?? b)))), 90);
    console.log(
      `longest gap without a purchase (p90): 0-3 min ${gaps((r) => r.buyTimes, 0, 180).toFixed(0)} s, 3-10 ${gaps((r) => r.buyTimes, 180, 600).toFixed(0)} s, 10-30 ${gaps((r) => r.buyTimes, 600, 1800).toFixed(0)} s`,
    );
    console.log(
      `longest gap without something new (p90): 0-10 min ${fmt(gaps((r) => r.newTimes.map((n) => n.t), 0, 600))}, 10-30 ${fmt(gaps((r) => r.newTimes.map((n) => n.t), 600, 1800))}, 30-end ${fmt(gaps((r) => r.newTimes.map((n) => n.t), 1800, 3600))}`,
    );
    console.log(
      `longest gap without a purchase, task or something new (p90): 0-10 min ${fmt(gaps((r) => [...r.buyTimes, ...r.taskTimes, ...r.newTimes.map((n) => n.t)].sort((a, b) => a - b), 0, 600))}; ` +
        `without a task claim or something new: 0-10 ${fmt(gaps((r) => [...r.taskTimes, ...r.newTimes.map((n) => n.t)].sort((a, b) => a - b), 0, 600))}, 10-30 ${fmt(gaps((r) => [...r.taskTimes, ...r.newTimes.map((n) => n.t)].sort((a, b) => a - b), 600, 1800))}, 30-end ${fmt(gaps((r) => [...r.taskTimes, ...r.newTimes.map((n) => n.t)].sort((a, b) => a - b), 1800, 3600))}`,
    );
    console.log(`tasks done ${med(runs.map((r) => r.tasksDone))}/${content.tasks.tasks.length}, task coins ${short(med(runs.map((r) => r.taskCoins)))}; task claims at ${[1, 5, 10, 15, 20, 25, 30].map((k) => `#${k} ${fmt(med(runs.map((r) => r.taskTimes[k - 1] ?? Infinity)))}`).join(' ')}`);
    console.log(`income/s at 5/10/20/30/40/50 min: ${[5, 10, 20, 30, 40, 50].map((m) => short(med(runs.map((r) => r.rateAt[m] ?? 0)))).join(' / ')}`);
    console.log(`hand share of income at 5/10/20/30 min: ${[5, 10, 20, 30].map((m) => `${Math.round(100 * med(runs.map((r) => r.handShareAt[m] ?? 0)))}%`).join(' / ')}`);
    if (!brief) console.log('min | taps | hand serves | helper serves | buys | tasks | new | lost | idle s | ads | coins');
    const rows: Record<string, number>[] = [];
    for (let m = 0; m < 30; m++) {
      const pick = (f: (b: Bucket) => number) => med(runs.map((r) => (r.buckets[m] ? f(r.buckets[m]) : 0)));
      const row = { m, taps: pick((b) => b.taps), hand: pick((b) => b.hand), auto: pick((b) => b.auto), buys: pick((b) => b.buys), tasks: pick((b) => b.tasks), news: pick((b) => b.news), lost: pick((b) => b.lost), idle: pick((b) => b.idle), ads: pick((b) => b.ads), earned: pick((b) => b.earned) };
      rows.push(row);
      if (m < 15 && !brief)
        console.log(
          `${String(m).padStart(3)} | ${String(row.taps).padStart(4)} | ${String(row.hand).padStart(11)} | ${String(row.auto).padStart(13)} | ${String(row.buys).padStart(4)} | ${String(row.tasks).padStart(5)} | ${String(row.news).padStart(3)} | ${String(row.lost).padStart(4)} | ${row.idle.toFixed(0).padStart(6)} | ${String(row.ads).padStart(3)} | ${short(row.earned)}`,
        );
    }
    // What is new, and when (median over runs that saw it).
    const whats = new Map<string, number[]>();
    for (const r of runs) for (const n of r.newTimes) (whats.get(n.what) ?? whats.set(n.what, []).get(n.what)!).push(n.t);
    const timeline = [...whats.entries()].filter(([, ts]) => ts.length >= runs.length / 2).map(([w, ts]) => [w, med(ts)] as const).sort((a, b) => a[1] - b[1]);
    if (!brief) console.log('new things: ' + timeline.filter(([, t]) => t < 3600).map(([w, t]) => `${fmt(t)} ${w}`).join(' | '));
    const spentKinds = new Set(runs.flatMap((r) => Object.keys(r.spent)));
    const spent = Object.fromEntries([...spentKinds].map((k) => [k, med(runs.map((r) => r.spent[k] ?? 0))]));
    console.log('coins spent: ' + Object.entries(spent).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${short(v)}`).join(', '));
    report[key] = {
      finish: { p10: pct(fin, 10), p50: med(fin), p90: pct(fin, 90) },
      stars: starMed,
      rows,
      timeline,
      spent,
      rateAt: Object.fromEntries([5, 10, 20, 30, 40, 50].map((m) => [m, med(runs.map((r) => r.rateAt[m] ?? 0))])),
      // Median income per second by minute, over the runs still playing at that minute.
      rateByMin: Array.from({ length: 100 }, (_, m) => {
        const xs = runs.filter((r) => r.rateByMin[m] !== undefined).map((r) => r.rateByMin[m]);
        return xs.length >= runs.length / 2 ? med(xs) : null;
      }),
      handShareAt: Object.fromEntries([5, 10, 20, 30].map((m) => [m, med(runs.map((r) => r.handShareAt[m] ?? 0))])),
      gaps: {
        buy: [gaps((r) => r.buyTimes, 0, 180), gaps((r) => r.buyTimes, 180, 600), gaps((r) => r.buyTimes, 600, 1800)],
        news: [gaps((r) => r.newTimes.map((n) => n.t), 0, 600), gaps((r) => r.newTimes.map((n) => n.t), 600, 1800), gaps((r) => r.newTimes.map((n) => n.t), 1800, 3600)],
        newsOrTask: [0, 600, 1800].map((a, i) => gaps((r) => [...r.taskTimes, ...r.newTimes.map((n) => n.t)].sort((x, y) => x - y), a, [600, 1800, 3600][i])),
      },
      tasks: { claimAt: Object.fromEntries(content.tasks.tasks.map((t) => [t.id, med(runs.map((r) => r.claimAt[t.id] ?? Infinity))])), natural: content.tasks.tasks.map((_, k) => med(runs.map((r) => r.natural[k]))), done: med(runs.map((r) => r.tasksDone)), coins: med(runs.map((r) => r.taskCoins)), at: Array.from({ length: content.tasks.tasks.length }, (_, k) => med(runs.map((r) => r.taskTimes[k] ?? Infinity))) },
      served: med(runs.map((r) => r.served)),
      helpers: med(runs.map((r) => r.adopts)),
    };
  }
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 1));
