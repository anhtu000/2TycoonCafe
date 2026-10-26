// Preview sheet of every animal look. Build with esbuild and open in a browser.
import { CUSTOMER_LOOKS, drawAnimal, LOOKS, SCARF_COLORS } from '../../src/render/animals.ts';
const S = 220;
const staff = Object.keys(LOOKS).filter((k) => !CUSTOMER_LOOKS.includes(k));
const c = document.createElement('canvas');
c.width = S * 6;
c.height = S * 5 + 40;
document.body.append(c);
const ctx = c.getContext('2d')!;
ctx.fillStyle = '#f4e3cc';
ctx.fillRect(0, 0, c.width, c.height);
const put = (id: string, i: number, row: number, kind: 'apron' | 'scarf', mood: 'happy' | 'neutral' | 'sad', color = '#3f7d63') => {
  const off = document.createElement('canvas');
  off.width = off.height = 256;
  drawAnimal(off.getContext('2d')!, 256, id, { kind, color }, mood);
  ctx.drawImage(off, (i % 6) * S, row * S, S, S);
};
staff.forEach((id, i) => put(id, i, Math.floor(i / 6), 'apron', 'neutral'));
CUSTOMER_LOOKS.forEach((id, i) => put(id, i, 2, 'scarf', 'neutral', SCARF_COLORS[i]));
CUSTOMER_LOOKS.forEach((id, i) => put(id, i, 3, 'scarf', i % 2 ? 'happy' : 'sad', SCARF_COLORS[(i + 2) % 6]));
['capybara', 'cat', 'redpanda', 'axolotl', 'panda', 'penguin'].forEach((id, i) => put(id, i, 4, 'apron', 'happy'));
document.title = 'ready';
