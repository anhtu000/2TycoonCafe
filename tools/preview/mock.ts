// Mock of the play screen (portrait 720x1280 and landscape 1280x720) to review the look.
import { CUSTOMER_LOOKS, drawAnimal, SCARF_COLORS } from '../../src/render/animals.ts';
import { counterSize, drawCounter, drawItem, drawMachine, drawRoom, ROOM_THEMES, roomLayout } from '../../src/render/cafe.ts';

const portrait = location.hash !== '#land';
const W = portrait ? 720 : 1280;
const H = portrait ? 1280 : 720;
const K = 1.5;
const c = document.createElement('canvas');
c.width = W * K;
c.height = H * K;
c.style.width = W + 'px';
document.body.style.margin = '0';
document.body.append(c);
const ctx = c.getContext('2d')!;
ctx.scale(K, K);
ctx.fillStyle = '#5a3d2e';
ctx.fillRect(0, 0, W, H);

const sprite = (fn: (x: CanvasRenderingContext2D, s: number) => void, s: number) => {
  const o = document.createElement('canvas');
  o.width = o.height = s * 2;
  fn(o.getContext('2d')!, s * 2);
  return o;
};
const animal = (id: string, kind: 'apron' | 'scarf', color: string, mood: 'happy' | 'neutral' | 'sad' = 'neutral') =>
  sprite((x, s) => drawAnimal(x, s, id, { kind, color }, mood), 128);
const item = (id: string) => sprite((x, s) => drawItem(x, s, id), 64);

const floorW = portrait ? 720 : 860;
const floorH = portrait ? 250 : 196;
const top = portrait ? 120 : 92;
const floors = [
  { id: 'coffee', items: ['coffee', 'tea'], staff: ['capybara', 'cat'], open: true },
  { id: 'bakery', items: ['croissant', 'cake'], staff: ['shiba', null], open: true },
  { id: 'dessert', items: ['icecream', 'bubbletea'], staff: [null, null], open: false },
];
// Top floor drawn first at the top (coffee at the bottom like a real building? keep coffee on top for reading order).
floors.forEach((f, i) => {
  const y = top + i * (floorH + 8);
  const room = document.createElement('canvas');
  room.width = floorW * K;
  room.height = floorH * K;
  drawRoom(room.getContext('2d')!, floorW * K, floorH * K, K, ROOM_THEMES[f.id], f.items);
  ctx.drawImage(room, 0, y, floorW, floorH);
  const L = roomLayout(floorW, floorH);
  // Machines on the back counter, staff in front of them, then the front counter over the staff's legs.
  const sc = portrait ? 1.15 : 1;
  f.items.forEach((it, j) => {
    const mx = L.machines[j];
    const m = document.createElement('canvas');
    m.width = 92 * K;
    m.height = 92 * K;
    const mc = m.getContext('2d')!;
    mc.scale(K, K);
    drawMachine(mc, 92, 92, it);
    const ms = 70 * sc;
    ctx.drawImage(m, mx - ms / 2 - 30, y + L.backY - ms + 4, ms, ms);
  });
  f.items.forEach((_, j) => {
    const st = f.staff[j];
    const as = 112 * sc;
    if (st) ctx.drawImage(animal(st, 'apron', '#3f7d63'), L.machines[j] - as / 2 + 34, y + L.counterY + 36 - as, as, as);
  });
  const cs = counterSize(floorW, floorH);
  const cv = document.createElement('canvas');
  cv.width = cs.w * K;
  cv.height = cs.h * K;
  drawCounter(cv.getContext('2d')!, floorW, floorH, K, ROOM_THEMES[f.id]);
  ctx.drawImage(cv, L.counterX - 8, y + L.counterY - 6, cs.w, cs.h);
  ctx.drawImage(item(f.items[0]), L.machines[0] - 52, y + L.counterY - 40, 42, 42);
  if (i === 0) ctx.drawImage(item(f.items[1]), L.machines[1] - 52, y + L.counterY - 40, 42, 42);
  // Customers
  const n = f.open ? (i === 0 ? 3 : 2) : 0;
  for (let k = 0; k < n; k++) {
    const look = CUSTOMER_LOOKS[(i * 2 + k) % 6];
    const x = L.spots[k];
    const cs2 = portrait ? 120 : 100;
    ctx.drawImage(animal(look, 'scarf', SCARF_COLORS[(i + k) % 6], k === 2 ? 'sad' : 'neutral'), x - cs2 / 2, y + L.floorY - cs2 + 4, cs2, cs2);
    // Order bubble with patience ring.
    const bx = x;
    const by = y + L.floorY - (portrait ? 146 : 124);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#3b2a22';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bx, by, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bx, by, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (k === 2 ? 0.25 : 0.75));
    ctx.strokeStyle = k === 2 ? '#e5485e' : '#5fbf6a';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.drawImage(item(f.items[k % 2]), bx - 20, by - 20, 40, 40);
  }
  if (!f.open) {
    ctx.fillStyle = 'rgba(40,25,18,0.6)';
    ctx.fillRect(0, y, floorW, floorH);
    ctx.fillStyle = '#ffcf5a';
    ctx.beginPath();
    ctx.roundRect(floorW / 2 - 150, y + floorH / 2 - 40, 300, 80, 24);
    ctx.fill();
    ctx.fillStyle = '#3b2a22';
    ctx.font = '900 28px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Open Dessert Bar', floorW / 2, y + floorH / 2 - 4);
    ctx.font = '800 24px Nunito, sans-serif';
    ctx.fillText('15M', floorW / 2, y + floorH / 2 + 26);
  }
});
// Top bar
ctx.fillStyle = '#3b2a22';
ctx.fillRect(0, 0, W, top - 10);
ctx.fillStyle = '#ffffff';
ctx.font = '900 44px Nunito, sans-serif';
ctx.textAlign = 'left';
ctx.fillText('12.4K', 120, 56);
ctx.font = '700 22px Nunito, sans-serif';
ctx.fillStyle = '#e3cbb8';
ctx.fillText('+86/s', 120, 84);
ctx.fillStyle = '#ffcf5a';
ctx.font = '900 34px Nunito, sans-serif';
ctx.textAlign = 'right';
ctx.fillText('★★☆☆☆', W - 40, 60);
document.title = 'ready';
