// Which v2 mechanic speeds the run up how much: turn one off at a time (steady tapper, no ads).
import { AD_POLICIES, loadContent, PROFILES, simulate } from '/home/claude/gm/Game2_Tycoon_cafe/tools/sim/player.ts';
const runs = Number(process.argv[2] ?? 12);
const variants: [string, (c: any) => void][] = [
  ['all v2', () => {}],
  ['no combo', (c) => (c.cafe.combo.step = 0)],
  ['no moods', (c) => (c.cafe.moods.chance = 0)],
  ['no guests', (c) => { c.cafe.guests.giraffe.chance = 0; c.cafe.guests.elephant.chance = 0; c.cafe.guests.mouse.chance = 0; }],
  ['no sets', (c) => (c.cafe.lift.chance = 0)],
  ['no tours', (c) => (c.cafe.tours.firstAfter = 1e9)],
  ['no friends', (c) => (c.staff.friends.bonus = 1)],
  ['no naps', (c) => (c.cafe.naps.minStaff = 99)],
  ['none', (c) => { c.cafe.combo.step = 0; c.cafe.moods.chance = 0; c.cafe.guests.giraffe.chance = 0; c.cafe.guests.elephant.chance = 0; c.cafe.guests.mouse.chance = 0; c.cafe.lift.chance = 0; c.cafe.tours.firstAfter = 1e9; c.staff.friends.bonus = 1; c.cafe.naps.minStaff = 99; }],
];
for (const [name, tweak] of variants) {
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const content = loadContent();
    tweak(content);
    // traits off too in 'none'
    if (name === 'none') for (const a of content.staff.animals) delete (a as any).trait;
    const r = simulate(content, 1000 + i, AD_POLICIES[0], PROFILES[process.argv[3] ?? 'active']);
    t.push(r.finishSec / 60);
  }
  t.sort((a, b) => a - b);
  console.log(name.padEnd(12), 'p50', t[Math.floor(t.length / 2)].toFixed(1), 'min');
}
