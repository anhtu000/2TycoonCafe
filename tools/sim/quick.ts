// One detailed run: income, coins and levels every minute. npm run sim:quick -- [seed] [profile] [policy]
import { AD_POLICIES, loadContent, PROFILES } from './player.ts';
import { Cafe, newRunState } from '../../src/logic/cafe.ts';
import { simulate } from './player.ts';
const content = loadContent();
const seed = Number(process.argv[2] ?? 1000);
const profile = PROFILES[process.argv[3] ?? 'active'];
const policy = AD_POLICIES.find((p) => p.id === (process.argv[4] ?? 'none'))!;
const r = simulate(content, seed, policy, profile, 3 * 3600, (cafe: Cafe, wall: number) => {
  const s = cafe.s;
  const items = content.cafe.items.filter((i) => s.items[i.id].unlocked).map((i) => `${i.id}:${s.items[i.id].level}`).join(' ');
  const ups = Object.entries(s.levels).map(([k, v]) => `${k}${v}`).join(' ');
  console.log(`${String(Math.round(wall / 60)).padStart(3)}m rate ${s.rate.toExponential(2)} auto ${s.autoRate.toExponential(2)} coins ${s.coins.toExponential(2)} served ${s.served} lost ${s.lost} stars ${cafe.stars()} staff ${Object.entries(s.staff).map(([k, v]) => k + v).join(',')} | ${items} | ${ups}`);
});
console.log(r.finished ? `finished ${Math.round(r.finishSec / 60)} min` : 'not finished');
console.log(r.milestones.map((m) => `${(m.t / 60).toFixed(1)} ${m.what}`).join(' | '));
void newRunState;
