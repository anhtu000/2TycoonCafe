// Animals drawn in code with the Canvas 2D API, then stored as Phaser textures.
// One builder draws every species from a small look description, so staff and customers share a style:
// soft round shapes, a warm dark outline, flat colours with one soft shadow, small shiny eyes.
// No image files: the build stays small (Poki wants the first download under 8 MB).

type Ctx = CanvasRenderingContext2D;

export type Ear = 'round' | 'tiny' | 'pointy' | 'long' | 'fluffy' | 'none' | 'gills';
export type Marking = 'none' | 'mask' | 'redpanda' | 'pandaEyes' | 'cheekPatch' | 'blaze' | 'tuxedo';

export interface Look {
  fur: string;
  /** Muzzle, belly and inner ear. */
  light: string;
  /** Ears tips, markings, limbs on some species. */
  dark: string;
  ear: Ear;
  marking: Marking;
  nose: string;
  /** Head width / height. Above 1 is a wide face (capybara, hamster). */
  wide?: number;
  beak?: boolean;
  whiskers?: boolean;
  /** Small round tuft on top of the head. */
  tuft?: string;
  /** Fur strokes on the cheeks (cat, shiba, fox). */
  cheekFluff?: boolean;
  blush?: boolean;
}

const OUTLINE = '#3b2a22';

export const LOOKS: Record<string, Look> = {
  // Staff
  capybara: { fur: '#b07a4f', light: '#d3a77c', dark: '#7d5234', ear: 'tiny', marking: 'none', nose: '#4a3021', wide: 1.18, blush: true },
  hamster: { fur: '#e8a35a', light: '#fff1de', dark: '#c27a35', ear: 'round', marking: 'cheekPatch', nose: '#e47c7c', wide: 1.12, blush: true },
  bunny: { fur: '#f3ede6', light: '#ffffff', dark: '#e3b4b8', ear: 'long', marking: 'none', nose: '#e47c8a', blush: true, whiskers: true },
  cat: { fur: '#8f97a8', light: '#e9ebf0', dark: '#626b7d', ear: 'pointy', marking: 'blaze', nose: '#e48d9a', whiskers: true, cheekFluff: true },
  shiba: { fur: '#e08a3c', light: '#fff4e4', dark: '#a85a1f', ear: 'pointy', marking: 'cheekPatch', nose: '#3b2a22', cheekFluff: true, blush: true },
  penguin: { fur: '#33394a', light: '#f7f7f2', dark: '#20242f', ear: 'none', marking: 'tuxedo', nose: '#f2a33a', beak: true, blush: true },
  koala: { fur: '#9aa0a8', light: '#e4e6ea', dark: '#6f747c', ear: 'fluffy', marking: 'none', nose: '#4b4f57', wide: 1.08, blush: true },
  redpanda: { fur: '#c8572a', light: '#fff3e6', dark: '#5a2a1a', ear: 'pointy', marking: 'redpanda', nose: '#2c1d17', cheekFluff: true },
  panda: { fur: '#f6f4ef', light: '#ffffff', dark: '#2c2c33', ear: 'round', marking: 'pandaEyes', nose: '#2c2c33', wide: 1.06, blush: true },
  axolotl: { fur: '#f6a9c4', light: '#ffd8e6', dark: '#e0628f', ear: 'gills', marking: 'none', nose: '#c4486f', wide: 1.2, blush: true },
  // Customers (not collectable)
  bear: { fur: '#8a5a3c', light: '#c99a72', dark: '#5f3b26', ear: 'round', marking: 'none', nose: '#3b2a22', wide: 1.05 },
  mouse: { fur: '#b8b0aa', light: '#f1e6e0', dark: '#e3a9a9', ear: 'round', marking: 'none', nose: '#e47c8a', whiskers: true, blush: true },
  frog: { fur: '#7dbb6a', light: '#d9f0b8', dark: '#4f8a43', ear: 'none', marking: 'none', nose: '#4f8a43', wide: 1.25, blush: true },
  sheep: { fur: '#f2ece2', light: '#fbf7f0', dark: '#6b5a52', ear: 'tiny', marking: 'none', nose: '#3b2a22', tuft: '#fbf7f0' },
  duck: { fur: '#fff3c4', light: '#fffbe6', dark: '#e6c96a', ear: 'none', marking: 'none', nose: '#f2a33a', beak: true, tuft: '#fff3c4' },
  raccoon: { fur: '#8c8f99', light: '#eceef2', dark: '#3f4049', ear: 'pointy', marking: 'mask', nose: '#2c2c33', whiskers: true },
};

export const CUSTOMER_LOOKS = ['bear', 'mouse', 'frog', 'sheep', 'duck', 'raccoon'];

/** Clothes. Staff wear the cafe apron; customers wear a scarf in one of a few colours. */
export interface Outfit {
  kind: 'apron' | 'scarf' | 'none';
  color: string;
}

export const STAFF_OUTFIT: Outfit = { kind: 'apron', color: '#3f7d63' };
export const SCARF_COLORS = ['#d9644a', '#4a78c2', '#e2b13c', '#8b5fb8', '#4f9e86', '#c95b85'];

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

function fillStroke(ctx: Ctx, fill: string, lw: number) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

/** Soft shadow on the lower right of a shape already on the path stack (clip first). */
function shadeClip(ctx: Ctx, x: number, y: number, rx: number, ry: number, alpha = 0.16) {
  ctx.save();
  ellipse(ctx, x, y, rx, ry);
  ctx.clip();
  const g = ctx.createRadialGradient(x - rx * 0.35, y - ry * 0.45, Math.min(rx, ry) * 0.2, x, y, Math.max(rx, ry) * 1.15);
  g.addColorStop(0, 'rgba(255,255,255,0.18)');
  g.addColorStop(0.55, 'rgba(255,255,255,0)');
  g.addColorStop(1, `rgba(40,20,10,${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(x - rx, y - ry, rx * 2, ry * 2);
  ctx.restore();
}

function ears(ctx: Ctx, look: Look, hx: number, hy: number, hr: number, lw: number) {
  const { ear } = look;
  const side = (s: number, fn: (sx: number) => void) => {
    ctx.save();
    fn(s);
    ctx.restore();
  };
  if (ear === 'round' || ear === 'tiny' || ear === 'fluffy') {
    const r = ear === 'tiny' ? hr * 0.2 : ear === 'fluffy' ? hr * 0.42 : hr * 0.32;
    const dx = ear === 'fluffy' ? hr * 0.92 : hr * 0.72;
    const dy = ear === 'fluffy' ? hr * 0.45 : hr * 0.72;
    for (const s of [-1, 1]) {
      ellipse(ctx, hx + s * dx, hy - dy, r, r * (ear === 'fluffy' ? 0.92 : 1));
      fillStroke(ctx, ear === 'fluffy' ? look.fur : look.fur, lw);
      ellipse(ctx, hx + s * dx, hy - dy + r * 0.08, r * 0.55, r * 0.5);
      ctx.fillStyle = look.light;
      ctx.fill();
    }
  } else if (ear === 'pointy') {
    for (const s of [-1, 1])
      side(s, (sx) => {
        const bx = hx + sx * hr * 0.62;
        ctx.beginPath();
        ctx.moveTo(bx - sx * hr * 0.36, hy - hr * 0.55);
        ctx.quadraticCurveTo(bx + sx * hr * 0.12, hy - hr * 1.32, bx + sx * hr * 0.3, hy - hr * 1.12);
        ctx.quadraticCurveTo(bx + sx * hr * 0.42, hy - hr * 0.7, bx + sx * hr * 0.38, hy - hr * 0.3);
        ctx.closePath();
        fillStroke(ctx, look.fur, lw);
        ctx.beginPath();
        ctx.moveTo(bx - sx * hr * 0.18, hy - hr * 0.62);
        ctx.quadraticCurveTo(bx + sx * hr * 0.12, hy - hr * 1.12, bx + sx * hr * 0.24, hy - hr * 1.0);
        ctx.quadraticCurveTo(bx + sx * hr * 0.3, hy - hr * 0.72, bx + sx * hr * 0.26, hy - hr * 0.5);
        ctx.closePath();
        ctx.fillStyle = look.marking === 'redpanda' ? '#fff3e6' : look.dark;
        ctx.globalAlpha = 0.85;
        ctx.fill();
      });
  } else if (ear === 'long') {
    for (const s of [-1, 1])
      side(s, (sx) => {
        ctx.translate(hx + sx * hr * 0.36, hy - hr * 0.7);
        ctx.rotate(sx * 0.22);
        ellipse(ctx, 0, -hr * 0.5, hr * 0.23, hr * 0.58);
        fillStroke(ctx, look.fur, lw);
        ellipse(ctx, 0, -hr * 0.47, hr * 0.11, hr * 0.44);
        ctx.fillStyle = look.dark;
        ctx.fill();
      });
  } else if (ear === 'gills') {
    for (const s of [-1, 1])
      for (let i = 0; i < 3; i++)
        side(s, (sx) => {
          ctx.translate(hx + sx * hr * 0.92, hy - hr * 0.25 + i * hr * 0.28);
          ctx.rotate(sx * (-0.7 + i * 0.45));
          ellipse(ctx, sx * hr * 0.26, 0, hr * 0.3, hr * 0.11);
          fillStroke(ctx, look.dark, lw * 0.85);
        });
  }
}

function face(ctx: Ctx, look: Look, hx: number, hy: number, hr: number, lw: number, mood: 'happy' | 'neutral' | 'sad') {
  const w = look.wide ?? 1;
  // Markings first, under the eyes.
  if (look.marking === 'mask') {
    ctx.beginPath();
    ctx.ellipse(hx, hy - hr * 0.02, hr * 0.82 * w, hr * 0.26, 0, 0, Math.PI * 2);
    ctx.fillStyle = look.dark;
    ctx.fill();
  } else if (look.marking === 'redpanda') {
    for (const s of [-1, 1]) {
      ellipse(ctx, hx + s * hr * 0.36, hy + hr * 0.1, hr * 0.26, hr * 0.3);
      ctx.fillStyle = '#fff3e6';
      ctx.fill();
    }
  } else if (look.marking === 'pandaEyes') {
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(hx + s * hr * 0.34, hy + hr * 0.02);
      ctx.rotate(s * -0.5);
      ellipse(ctx, 0, 0, hr * 0.17, hr * 0.24);
      ctx.fillStyle = look.dark;
      ctx.fill();
      ctx.restore();
    }
  } else if (look.marking === 'cheekPatch') {
    ellipse(ctx, hx, hy + hr * 0.38, hr * 0.62 * w, hr * 0.42);
    ctx.fillStyle = look.light;
    ctx.fill();
  } else if (look.marking === 'blaze') {
    ellipse(ctx, hx, hy + hr * 0.36, hr * 0.42, hr * 0.32);
    ctx.fillStyle = look.light;
    ctx.fill();
  } else if (look.marking === 'tuxedo') {
    ctx.beginPath();
    ctx.ellipse(hx - hr * 0.26, hy + hr * 0.16, hr * 0.38, hr * 0.5, 0.2, 0, Math.PI * 2);
    ctx.ellipse(hx + hr * 0.26, hy + hr * 0.16, hr * 0.38, hr * 0.5, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = look.light;
    ctx.fill();
  }
  // Muzzle for long-faced animals.
  if (look.wide && look.wide > 1.1 && !look.beak && look.marking === 'none') {
    ellipse(ctx, hx, hy + hr * 0.36, hr * 0.48 * w, hr * 0.34);
    ctx.fillStyle = look.light;
    ctx.fill();
  }

  // Eyes: dark ovals with a highlight. Sad: half closed.
  const ex = hr * 0.36 * Math.min(w, 1.1);
  const ey = hy + hr * 0.06;
  const eyeR = hr * 0.1;
  for (const s of [-1, 1]) {
    const x = hx + s * ex;
    if (mood === 'happy') {
      ctx.beginPath();
      ctx.arc(x, ey + eyeR * 0.5, eyeR * 1.05, Math.PI * 1.1, Math.PI * 1.9);
      ctx.lineWidth = lw * 1.1;
      ctx.lineCap = 'round';
      ctx.strokeStyle = look.marking === 'pandaEyes' || look.marking === 'mask' ? '#ffffff' : OUTLINE;
      ctx.stroke();
    } else {
      ellipse(ctx, x, ey, eyeR * 0.85, mood === 'sad' ? eyeR * 0.55 : eyeR * 1.15);
      ctx.fillStyle = '#231712';
      ctx.fill();
      ellipse(ctx, x - eyeR * 0.3, ey - eyeR * 0.4, eyeR * 0.32, eyeR * 0.32);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  }
  if (mood === 'sad') {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(hx + s * (ex - eyeR * 1.2), ey - eyeR * 1.7);
      ctx.lineTo(hx + s * (ex + eyeR * 0.8), ey - eyeR * 2.2);
      ctx.lineWidth = lw * 0.8;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }
  }

  // Cheeks.
  if (look.blush || mood === 'happy') {
    for (const s of [-1, 1]) {
      ellipse(ctx, hx + s * hr * 0.58 * Math.min(w, 1.12), hy + hr * 0.3, hr * 0.13, hr * 0.08);
      ctx.fillStyle = 'rgba(240,110,110,0.45)';
      ctx.fill();
    }
  }

  // Nose and mouth, or a beak.
  const ny = hy + hr * 0.3;
  if (look.beak) {
    ctx.beginPath();
    ctx.ellipse(hx, ny + hr * 0.02, hr * 0.2, hr * 0.11, 0, 0, Math.PI * 2);
    fillStroke(ctx, look.nose, lw * 0.8);
    ctx.beginPath();
    ctx.moveTo(hx - hr * 0.17, ny + hr * 0.03);
    ctx.lineTo(hx + hr * 0.17, ny + hr * 0.03);
    ctx.lineWidth = lw * 0.6;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(hx, ny, hr * (look.ear === 'tiny' ? 0.13 : 0.08), hr * 0.055, 0, 0, Math.PI * 2);
    ctx.fillStyle = look.nose;
    ctx.fill();
    ctx.beginPath();
    ctx.lineWidth = lw * 0.75;
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUTLINE;
    if (mood === 'sad') {
      ctx.arc(hx, ny + hr * 0.22, hr * 0.09, Math.PI * 1.15, Math.PI * 1.85);
    } else {
      ctx.moveTo(hx - hr * 0.13, ny + hr * 0.1);
      ctx.quadraticCurveTo(hx - hr * 0.065, ny + hr * 0.19, hx, ny + hr * 0.08);
      ctx.quadraticCurveTo(hx + hr * 0.065, ny + hr * 0.19, hx + hr * 0.13, ny + hr * 0.1);
    }
    ctx.stroke();
  }
  if (look.whiskers) {
    ctx.lineWidth = lw * 0.45;
    ctx.strokeStyle = 'rgba(59,42,34,0.55)';
    for (const s of [-1, 1])
      for (const k of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(hx + s * hr * 0.32, ny + k * hr * 0.04);
        ctx.lineTo(hx + s * hr * 0.66, ny + k * hr * 0.1 - hr * 0.02);
        ctx.stroke();
      }
  }
}

/**
 * Draws a chibi animal facing the viewer, centered in a square of `size` pixels.
 * Feet touch the bottom; the head takes about 60% of the height.
 */
export function drawAnimal(ctx: Ctx, size: number, id: string, outfit: Outfit = STAFF_OUTFIT, mood: 'happy' | 'neutral' | 'sad' = 'neutral') {
  const look = LOOKS[id];
  if (!look) throw new Error(`No look for ${id}`);
  const s = size;
  const lw = s * 0.028;
  const cx = s / 2;
  const w = look.wide ?? 1;
  // Body
  const by = s * 0.8;
  const brx = s * 0.175;
  const bry = s * 0.155;
  ctx.lineJoin = 'round';
  // Arms
  for (const sgn of [-1, 1]) {
    ellipse(ctx, cx + sgn * brx * 0.92, by + bry * 0.05, s * 0.06, s * 0.09);
    fillStroke(ctx, look.marking === 'tuxedo' ? look.fur : look.fur, lw);
  }
  // Feet
  for (const sgn of [-1, 1]) {
    ellipse(ctx, cx + sgn * brx * 0.5, by + bry * 0.95, s * 0.075, s * 0.045);
    fillStroke(ctx, look.marking === 'tuxedo' || look.beak ? look.nose : look.dark, lw);
  }
  ellipse(ctx, cx, by, brx, bry);
  fillStroke(ctx, look.fur, lw);
  ctx.save();
  ellipse(ctx, cx, by, brx, bry);
  ctx.clip();
  ellipse(ctx, cx, by + bry * 0.25, brx * 0.62, bry * 0.75);
  ctx.fillStyle = look.light;
  ctx.fill();
  if (outfit.kind === 'apron') {
    // Bib apron: a narrow bib under the chin, a wider skirt, a pocket.
    ctx.fillStyle = outfit.color;
    ctx.beginPath();
    ctx.roundRect(cx - brx * 0.42, by - bry * 0.95, brx * 0.84, bry * 0.9, brx * 0.12);
    ctx.roundRect(cx - brx * 0.78, by - bry * 0.2, brx * 1.56, bry * 1.4, brx * 0.22);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.roundRect(cx - brx * 0.26, by + bry * 0.2, brx * 0.52, bry * 0.36, brx * 0.1);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(cx - brx * 0.8, by - bry * 0.24, brx * 1.6, bry * 0.12);
  }
  ctx.restore();
  shadeClip(ctx, cx, by, brx, bry);
  ellipse(ctx, cx, by, brx, bry);
  ctx.lineWidth = lw;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();

  // Head
  const hr = s * 0.265;
  const hx = cx;
  const hy = s * 0.45;
  ears(ctx, look, hx, hy, hr, lw);
  ellipse(ctx, hx, hy, hr * w, hr * 0.92);
  fillStroke(ctx, look.fur, lw);
  ctx.save();
  ellipse(ctx, hx, hy, hr * w, hr * 0.92);
  ctx.clip();
  face(ctx, look, hx, hy, hr, lw, mood);
  if (look.cheekFluff) {
    ctx.fillStyle = look.light;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(hx + sgn * hr * w, hy + hr * 0.05);
      ctx.lineTo(hx + sgn * hr * w * 0.78, hy + hr * 0.22);
      ctx.lineTo(hx + sgn * hr * w * 0.98, hy + hr * 0.32);
      ctx.lineTo(hx + sgn * hr * w * 0.74, hy + hr * 0.48);
      ctx.lineTo(hx + sgn * hr * w * 0.9, hy + hr * 0.62);
      ctx.lineTo(hx + sgn * hr * w * 1.1, hy + hr * 0.5);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
  shadeClip(ctx, hx, hy, hr * w, hr * 0.92, 0.12);
  ellipse(ctx, hx, hy, hr * w, hr * 0.92);
  ctx.lineWidth = lw;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  if (look.tuft) {
    for (const [dx, dy, r] of [
      [-0.22, -0.86, 0.2],
      [0.04, -0.94, 0.22],
      [0.26, -0.84, 0.18],
    ]) {
      ellipse(ctx, hx + dx * hr, hy + dy * hr, r * hr, r * hr);
      fillStroke(ctx, look.tuft, lw * 0.8);
    }
  }
  // Scarf over the neck.
  if (outfit.kind === 'scarf') {
    ctx.beginPath();
    ctx.roundRect(cx - brx * 0.95, by - bry * 1.05, brx * 1.9, bry * 0.5, bry * 0.25);
    fillStroke(ctx, outfit.color, lw);
    ctx.beginPath();
    ctx.roundRect(cx + brx * 0.25, by - bry * 0.7, brx * 0.32, bry * 0.85, bry * 0.12);
    fillStroke(ctx, outfit.color, lw);
  }
}

/** Texture key of an animal. */
export const animalKey = (id: string, outfit: string, mood: string) => `animal-${id}-${outfit}-${mood}`;
