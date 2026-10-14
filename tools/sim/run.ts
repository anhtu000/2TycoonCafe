// Balance simulator. Run: npm run sim            (200 seeds per profile and ad policy)
//                         npm run sim -- 50
import { mkdirSync, writeFileSync } from 'node:fs';
import { AD_POLICIES, loadContent, PROFILES, simulate, type RunReport } from './player.ts';

const seeds = Number(process.argv[2] ?? 200);
const content = loadContent();
const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const pct = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};
const out: Record<string, unknown> = { generatedAt: new Date().toISOString(), seeds, runs: {} };

for (const profile of Object.values(PROFILES)) {
  console.log(`\n=== ${profile.label} ===`);
  for (const policy of AD_POLICIES) {
    const runs: RunReport[] = [];
    for (let i = 0; i < seeds; i++) runs.push(simulate(content, 1000 + i, policy, profile));
    const times = runs.map((r) => r.finishSec);
    const unfinished = runs.filter((r) => !r.finished).length;
    console.log(`${policy.label.padEnd(42)} finish p10 ${fmt(pct(times, 10))}  p50 ${fmt(pct(times, 50))}  p90 ${fmt(pct(times, 90))}${unfinished ? `  UNFINISHED ${unfinished}` : ''}`);
    const med = (f: (r: RunReport) => number) => pct(runs.map(f), 50);
    console.log(
      `  buy gap p90: first10 ${pct(runs.map((r) => r.maxBuyGap.first10), 90).toFixed(0)}s 10-30 ${pct(runs.map((r) => r.maxBuyGap.to30), 90).toFixed(0)}s 30+ ${pct(runs.map((r) => r.maxBuyGap.after30), 90).toFixed(0)}s | ` +
        `served ${med((r) => r.served)} lost ${med((r) => r.lost)} hand ${med((r) => r.handServed)} vip ${med((r) => r.vips)} hearts ${med((r) => r.hearts)} staff ${med((r) => r.adopts)}`,
    );
    const whats = new Set(runs.flatMap((r) => r.milestones.map((m) => m.what)));
    const rows: [string, number][] = [];
    for (const what of whats) {
      const ts = runs.map((r) => r.milestones.find((m) => m.what === what)?.t).filter((t): t is number => t !== undefined);
      if (ts.length >= runs.length / 2) rows.push([what, pct(ts, 50)]);
    }
    rows.sort((a, b) => a[1] - b[1]);
    if (policy.id === 'none') console.log('  ' + rows.map(([w, t]) => `${w} ${fmt(t)}`).join(' | '));
    console.log(`  rate at 10/20/30 min: ${['10', '20', '30'].map((m) => med((r) => r.rateAt[m] ?? 0)).join(' / ')}`);
    (out.runs as Record<string, unknown>)[`${profile.id}.${policy.id}`] = { p10: pct(times, 10), p50: pct(times, 50), p90: pct(times, 90), unfinished, milestones: rows };
  }
}
mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
writeFileSync(new URL('./out/report.json', import.meta.url), JSON.stringify(out, null, 1));
