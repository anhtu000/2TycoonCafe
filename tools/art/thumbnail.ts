// Static Poki thumbnail (Poki guide 10): square, full bleed, no text, one clear hero, simple background,
// strong contrast, away from Poki's page colour #83FFE7. Drawn with the game's own art code.
// Build: esbuild tools/art/thumbnail.ts --bundle, open with ?size=1024, save the canvas.
import { drawAnimal } from '../../src/render/animals.ts';
import { drawItem, drawMachine } from '../../src/render/cafe.ts';

const S = Number(new URLSearchParams(location.search).get('size') ?? 1024);
const c = document.createElement('canvas');
c.width = c.height = S;
document.body.style.margin = '0';
document.body.append(c);
const ctx = c.getContext('2d')!;
const u = S / 100;

// Warm cafe wall with soft stripes and a glow behind the hero.
ctx.fillStyle = '#f3c99a';
ctx.fillRect(0, 0, S, S);
ctx.fillStyle = '#eab983';
for (let x = 0; x < S; x += 9 * u) ctx.fillRect(x, 0, 4 * u, S);
const glow = ctx.createRadialGradient(50 * u, 46 * u, 4 * u, 50 * u, 46 * u, 52 * u);
glow.addColorStop(0, 'rgba(255,248,230,0.95)');
glow.addColorStop(0.55, 'rgba(255,236,200,0.45)');
glow.addColorStop(1, 'rgba(255,230,190,0)');
ctx.fillStyle = glow;
ctx.fillRect(0, 0, S, S);

// Counter along the bottom.
ctx.fillStyle = '#7d5234';
ctx.fillRect(0, 80 * u, S, 20 * u);
ctx.fillStyle = '#d9b48a';
ctx.fillRect(0, 78 * u, S, 4 * u);
ctx.strokeStyle = '#3b2a22';
ctx.lineWidth = 0.8 * u;
ctx.strokeRect(-u, 78 * u, S + 2 * u, 4 * u);
ctx.fillStyle = 'rgba(255,255,255,0.12)';
for (let x = 4 * u; x < S; x += 14 * u) ctx.fillRect(x, 85 * u, 9 * u, 11 * u);

const sprite = (draw: (x: CanvasRenderingContext2D, s: number) => void, size: number, x: number, y: number, rot = 0) => {
  const o = document.createElement('canvas');
  o.width = o.height = Math.round(size);
  draw(o.getContext('2d')!, Math.round(size));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.drawImage(o, -size / 2, -size / 2);
  ctx.restore();
};

// Coffee machine at the back left, helpers on both sides, the capybara barista in front.
sprite((x, s) => {
  x.scale(s / 92, s / 92);
  drawMachine(x, 92, 92, 'coffee');
}, 26 * u, 15 * u, 66 * u);
sprite((x, s) => drawAnimal(x, s, 'redpanda', { kind: 'apron', color: '#7a4fb0' }, 'happy'), 34 * u, 84 * u, 63 * u, 0.12);
sprite((x, s) => drawAnimal(x, s, 'cat', { kind: 'apron', color: '#3f6fb0' }, 'happy'), 30 * u, 19 * u, 71 * u, -0.1);
sprite((x, s) => drawAnimal(x, s, 'capybara', { kind: 'apron', color: '#3f7d63' }, 'happy'), 72 * u, 50 * u, 52 * u);
// Treats in the air: the menu of the cafe.
sprite((x, s) => drawItem(x, s, 'coffee'), 20 * u, 70 * u, 26 * u, 0.2);
sprite((x, s) => drawItem(x, s, 'cake'), 17 * u, 26 * u, 22 * u, -0.25);
sprite((x, s) => drawItem(x, s, 'bubbletea'), 16 * u, 84 * u, 14 * u, 0.15);
sprite((x, s) => drawItem(x, s, 'croissant'), 15 * u, 12 * u, 40 * u, -0.2);
// Sparkles.
ctx.fillStyle = '#ffffff';
for (const [x, y, r] of [
  [40, 12, 1.4],
  [60, 9, 1],
  [92, 34, 1.2],
  [6, 14, 1],
]) {
  ctx.beginPath();
  ctx.moveTo(x * u, (y - r * 2) * u);
  ctx.lineTo((x + r * 0.5) * u, (y - r * 0.5) * u);
  ctx.lineTo((x + r * 2) * u, y * u);
  ctx.lineTo((x + r * 0.5) * u, (y + r * 0.5) * u);
  ctx.lineTo(x * u, (y + r * 2) * u);
  ctx.lineTo((x - r * 0.5) * u, (y + r * 0.5) * u);
  ctx.lineTo((x - r * 2) * u, y * u);
  ctx.lineTo((x - r * 0.5) * u, (y - r * 0.5) * u);
  ctx.closePath();
  ctx.fill();
}
document.title = 'ready';
