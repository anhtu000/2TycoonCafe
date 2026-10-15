// Days after five stars: daily orders, today's special, the 7-day gift and income while away.
// Run: node --experimental-strip-types tools/sim/daily.ts [seeds] [--json out.json] [--session 12] [--away 20]
//
// Each simulated player plays the cafe to five stars, then comes back once a day for `session` minutes
// after `away` hours. Every day: income while away, the daily gift, new orders and a new special.
// Players (assumptions, real playtests replace them):
//   active  taps steadily, buys smart
//   casual  first-time player: slower taps, buys the cheapest card
//   idle    taps rarely once helpers work
// The player does not chase orders: they play as usual and claim an order when it is done.
import { writeFileSync } from 'node:fs';
import { Cafe, newRunState, type CafeEvent } from '../../src/logic/cafe.ts';
import { doTasks, handAction, loadContent, loadDecor, shop } from './player.ts';

const content = loadContent();
const decor = loadDecor();
const args = process.argv.slice(2);
const seeds = Number(args.find((a) => /^\d+$/.test(a)) ?? 40);
const opt = (name: string, def: number) => (args.includes(`--${name}`) ? Number(args[args.indexOf(`--${name}`) + 1]) : def);
const SESSION_MIN = opt('session', 12);
const AWAY_H = opt('away', 20);
const DAYS = opt('days', 7);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

interface Player {
  id: string;
  label: string;
  tps: (sec: number, auto: boolean) => number;
  style: 'smart' | 'cheap';
}
const PLAYERS: Player[] = [
  { id: 'active', label: 'Taps steadily, buys smart', tps: (s) => (s < 300 ? 3 : s < 900 ? 2.5 : 2), style: 'smart' },
  { id: 'casual', label: 'First-time player, buys the cheapest card', tps: (s, auto) => (auto ? 1.0 : s < 300 ? 1.6 : 1.3), style: 'cheap' },
  { id: 'idle', label: 'Taps rarely once helpers work', tps: (s, auto) => (auto ? 0.3 : s < 300 ? 3 : 2.5), style: 'smart' },
];

const STEP = 0.1;

interface OrderOut {
  type: string;
  need: number;
  have: number;
  /** Minute of the session when it was done (null: not done in the session). */
  doneMin: number | null;
}
interface DayOut {
  day: number;
  orders: OrderOut[];
  allDoneMin: number | null;
  special: string | null;
  rate: number;
  awayCoins: number;
  giftCoins: number;
  orderCoins: number;
  sessionSales: number;
  /** Per minute in the session: customers served, by hand, VIPs, purchases. */
  perMin: { served: number; hand: number; vips: number; buys: number; special: number; soldTop: number };
  staff: number;
  nightShift: number;
  offlineHours: number;
}
interface RunOut {
  player: string;
  seed: number;
  finishMin: number;
  days: DayOut[];
  snowfoxLevel: number;
}

function play(cafe: Cafe, player: Player, seconds: number, wall0: number, owned: string[], onTick?: (t: number) => void) {
  const s = cafe.s;
  let wall = 0;
  let budget = 0;
  let nextShop = 0;
  while (wall < seconds) {
    const auto = cafe.staffCount() > 0;
    if (s.calm && s.served >= 3) s.calm = false;
    if (!s.vipOn && s.served >= 15) s.vipOn = true;
    budget = Math.min(2, budget + player.tps(wall0 + wall, auto) * STEP);
    const events: CafeEvent[] = [];
    while (budget >= 1) {
      if (!handAction(cafe, events)) break;
      budget -= 1;
    }
    cafe.step(STEP, events);
    wall += STEP;
    if (wall >= nextShop) {
      nextShop = wall + (player.style === 'cheap' ? 2 : 0.5);
      const task = doTasks(cafe, decor, owned);
      if (!task.saveFor) shop(cafe, wall0 + wall, player.style);
    }
    onTick?.(wall);
    if (s.finishedAt === null && wall0 + wall > 3 * 3600) break;
  }
  return wall;
}

function simulate(seed: number, player: Player): RunOut {
  const s = newRunState(content, 'main', seed);
  s.calm = true;
  const cafe = new Cafe(content, s);
  const owned: string[] = [];
  // To five stars.
  let wall = 0;
  while (s.finishedAt === null && wall < 3 * 3600) wall += play(cafe, player, 60, wall, owned);
  const finishMin = wall / 60;
  const days: DayOut[] = [];
  let tickets = 0;
  for (let d = 1; d <= DAYS; d++) {
    // Away, then back: income while away (no x2), the daily gift, a new day.
    const awayCoins = cafe.offlineIncome(AWAY_H * 3600);
    cafe.addCoins(awayCoins, false);
    const gift = content.cafe.daily[(d - 1) % content.cafe.daily.length];
    const rate = Math.max(s.rate, 1);
    let giftCoins = 0;
    if (gift.coinsMin) {
      giftCoins = Math.max(50, Math.round(rate * 60 * gift.coinsMin));
      cafe.addCoins(giftCoins, false);
    }
    tickets += gift.ticket ?? 0;
    if (gift.rarePal) cafe.giftRarePal();
    if (gift.animal) cafe.giftAnimal(gift.animal);
    while (tickets > 0) {
      cafe.adopt(false);
      tickets--;
    }
    cafe.startDay(`2026-11-${String(d).padStart(2, '0')}`);
    const orders = cafe.orders();
    const doneMin: (number | null)[] = orders.map(() => null);
    let orderCoins = 0;
    const c0 = { served: s.served, hand: s.hand ?? 0, vips: s.vips ?? 0, buys: s.buys ?? 0, sales: s.sales ?? 0, sold: { ...(s.sold ?? {}) } };
    let nextCheck = 0;
    play(cafe, player, SESSION_MIN * 60, wall, owned, (t) => {
      if (t < nextCheck) return;
      nextCheck = t + 1;
      orders.forEach((o, i) => {
        if (!o.claimed && cafe.orderDone(o)) {
          doneMin[i] = t / 60;
          const r = cafe.claimOrder(i)!;
          orderCoins += r.coins;
          tickets += r.bonus;
        }
      });
    });
    wall += SESSION_MIN * 60;
    const sold = s.sold ?? {};
    const soldDiff = Object.keys(sold).map((k) => sold[k] - (c0.sold[k] ?? 0));
    const special = cafe.specialItem();
    days.push({
      day: d,
      orders: orders.map((o, i) => ({ type: o.type, need: o.need, have: cafe.orderProgress(o).have, doneMin: doneMin[i] })),
      allDoneMin: doneMin.every((x) => x !== null) ? Math.max(...(doneMin as number[])) : null,
      special,
      rate: Math.round(rate),
      awayCoins: Math.round(awayCoins),
      giftCoins,
      orderCoins,
      sessionSales: Math.round((s.sales ?? 0) - c0.sales),
      perMin: {
        served: (s.served - c0.served) / SESSION_MIN,
        hand: ((s.hand ?? 0) - c0.hand) / SESSION_MIN,
        vips: ((s.vips ?? 0) - c0.vips) / SESSION_MIN,
        buys: ((s.buys ?? 0) - c0.buys) / SESSION_MIN,
        special: special ? ((sold[special] ?? 0) - (c0.sold[special] ?? 0)) / SESSION_MIN : 0,
        soldTop: Math.max(...soldDiff) / SESSION_MIN,
      },
      staff: cafe.staffCount(),
      nightShift: cafe.level('nightshift'),
      offlineHours: cafe.stat('offlineHours'),
    });
  }
  return { player: player.id, seed, finishMin, days, snowfoxLevel: s.staff.snowfox ?? 0 };
}

const q = (xs: number[], p: number) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN;
};
const med = (xs: number[]) => q(xs, 0.5);
const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '-');

const all: RunOut[] = [];
for (const player of PLAYERS) {
  const runs: RunOut[] = [];
  for (let i = 0; i < seeds; i++) runs.push(simulate(1000 + i * 7919, player));
  all.push(...runs);
  console.log(`\n== ${player.label} (${seeds} runs, ${SESSION_MIN} min a day, away ${AWAY_H} h)`);
  console.log(`five stars at minute ${f1(med(runs.map((r) => r.finishMin)))}`);
  console.log('day | all 3 done (share, median min) | served/min hand/min vips/min buys/min special/min | order coins / session sales | away coins / rate | night shift');
  for (let d = 0; d < DAYS; d++) {
    const ds = runs.map((r) => r.days[d]);
    const done = ds.filter((x) => x.allDoneMin !== null);
    const pm = (k: keyof DayOut['perMin']) => f1(med(ds.map((x) => x.perMin[k])));
    console.log(
      `${d + 1}   | ${Math.round((done.length / ds.length) * 100)}%, ${f1(med(done.map((x) => x.allDoneMin!)))} | ${pm('served')} ${pm('hand')} ${pm('vips')} ${pm('buys')} ${pm('special')} | ${f1(med(ds.map((x) => x.orderCoins / Math.max(1, x.sessionSales))) * 100)}% | ${f1(med(ds.map((x) => x.awayCoins / Math.max(1, x.rate) / 60)))} min | ${f1(med(ds.map((x) => x.nightShift)))} (${f1(med(ds.map((x) => x.offlineHours)))} h)`,
    );
  }
  // Per order type: share done in the session and median minute.
  const byType: Record<string, { done: number; n: number; mins: number[]; frac: number[] }> = {};
  for (const r of runs)
    for (const d of r.days)
      for (const o of d.orders) {
        const b = (byType[o.type] ??= { done: 0, n: 0, mins: [], frac: [] });
        b.n++;
        if (o.doneMin !== null) {
          b.done++;
          b.mins.push(o.doneMin);
        }
        b.frac.push(Math.min(1, o.have / o.need));
      }
  console.log('order type | done in session | median minute done | median progress at end');
  for (const [t, b] of Object.entries(byType)) console.log(`${t.padEnd(8)} | ${Math.round((b.done / b.n) * 100)}% | ${f1(med(b.mins))} | ${Math.round(med(b.frac) * 100)}%`);
  console.log(`snow fox level after ${DAYS} days: ${f1(med(runs.map((r) => r.snowfoxLevel)))}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(all));
