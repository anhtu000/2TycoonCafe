import type Phaser from 'phaser';

// Small vector icons for the HUD, cards and buttons. Each draws centered on (0, 0) in a box of `size`.
// Same signature as core icons (IconDraw), so they work in Button too. Bake them with setShape.

type G = Phaser.GameObjects.Graphics;
export type GlyphDraw = (g: G, size: number, color: number) => void;

export const COIN_COLOR = 0xffc23d;
export const HEART_COLOR = 0xff6b81;
export const STAR_COLOR = 0xffd34d;

export const coinIcon: GlyphDraw = (g, size, color = COIN_COLOR) => {
  const r = size / 2;
  g.fillStyle(0x8a5a12, 1);
  g.fillCircle(0, r * 0.08, r);
  g.fillStyle(color, 1);
  g.fillCircle(0, 0, r * 0.92);
  g.lineStyle(r * 0.12, 0xfff1b8, 0.9);
  g.strokeCircle(0, 0, r * 0.62);
  g.fillStyle(0xfff1b8, 0.9);
  g.fillRect(-r * 0.09, -r * 0.36, r * 0.18, r * 0.72);
};

export const heartIcon: GlyphDraw = (g, size, color = HEART_COLOR) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  g.fillCircle(-s * 0.42, -s * 0.22, s * 0.48);
  g.fillCircle(s * 0.42, -s * 0.22, s * 0.48);
  g.fillTriangle(-s * 0.88, -s * 0.05, s * 0.88, -s * 0.05, 0, s * 0.86);
  g.fillStyle(0xffffff, 0.45);
  g.fillCircle(-s * 0.5, -s * 0.36, s * 0.14);
};

type P = Phaser.Math.Vector2;
const V = (list: { x: number; y: number }[]) => list as unknown as P[];

function starPoints(r: number, inner = 0.45): P[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * inner : r;
    pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
  }
  return V(pts);
}

export const starIcon: GlyphDraw = (g, size, color = STAR_COLOR) => {
  g.fillStyle(color, 1);
  g.fillPoints(starPoints(size / 2), true);
};

/** Empty star slot. */
export const starSlotIcon: GlyphDraw = (g, size, color) => {
  g.fillStyle(0x000000, 0.25);
  g.fillPoints(starPoints(size / 2), true);
  g.lineStyle(size * 0.07, color, 0.7);
  g.strokePoints(starPoints(size / 2 - size * 0.04), true);
};

export const pawIcon: GlyphDraw = (g, size, color) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  g.fillEllipse(0, s * 0.3, s * 0.95, s * 0.78);
  for (const [x, y] of [
    [-0.62, -0.18],
    [-0.24, -0.6],
    [0.24, -0.6],
    [0.62, -0.18],
  ])
    g.fillEllipse(x * s, y * s, s * 0.36, s * 0.44);
};

export const menuIcon: GlyphDraw = (g, size, color) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  for (const y of [-0.55, 0, 0.55]) g.fillRoundedRect(-s * 0.8, y * s - s * 0.12, s * 1.6, s * 0.24, s * 0.12);
};

export const boltIcon: GlyphDraw = (g, size, color) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  g.fillPoints(
    V([
      { x: s * 0.15, y: -s },
      { x: -s * 0.6, y: s * 0.12 },
      { x: -s * 0.02, y: s * 0.12 },
      { x: -s * 0.2, y: s },
      { x: s * 0.62, y: -s * 0.18 },
      { x: s * 0.04, y: -s * 0.18 },
    ]),
    true,
  );
};

export const stopwatchIcon: GlyphDraw = (g, size, color) => {
  const s = size / 2;
  g.lineStyle(s * 0.16, color, 1);
  g.strokeCircle(0, s * 0.12, s * 0.74);
  g.fillStyle(color, 1);
  g.fillRect(-s * 0.2, -s, s * 0.4, s * 0.22);
  g.lineBetween(0, s * 0.12, s * 0.3, -s * 0.22);
};

export const trophyIcon: GlyphDraw = (g, size, color) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  g.fillRoundedRect(-s * 0.55, -s * 0.85, s * 1.1, s * 0.9, { tl: 0, tr: 0, bl: s * 0.5, br: s * 0.5 });
  g.fillRect(-s * 0.12, 0, s * 0.24, s * 0.5);
  g.fillRoundedRect(-s * 0.5, s * 0.5, s, s * 0.3, s * 0.08);
  g.lineStyle(s * 0.14, color, 1);
  g.strokeCircle(-s * 0.62, -s * 0.45, s * 0.26);
  g.strokeCircle(s * 0.62, -s * 0.45, s * 0.26);
};

export const plantIcon: GlyphDraw = (g, size, color) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  g.fillRoundedRect(-s * 0.42, s * 0.2, s * 0.84, s * 0.75, s * 0.12);
  g.fillEllipse(-s * 0.38, -s * 0.2, s * 0.5, s * 0.9);
  g.fillEllipse(s * 0.38, -s * 0.2, s * 0.5, s * 0.9);
  g.fillEllipse(0, -s * 0.5, s * 0.5, s * 0.95);
};

export const seatIcon: GlyphDraw = (g, size, color) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  g.fillRoundedRect(-s * 0.6, -s * 0.9, s * 1.2, s * 0.9, s * 0.2);
  g.fillRoundedRect(-s * 0.8, -s * 0.05, s * 1.6, s * 0.35, s * 0.15);
  g.fillRect(-s * 0.7, s * 0.25, s * 0.2, s * 0.7);
  g.fillRect(s * 0.5, s * 0.25, s * 0.2, s * 0.7);
};

export const bookIcon: GlyphDraw = (g, size, color) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  g.fillRoundedRect(-s * 0.85, -s * 0.7, s * 0.8, s * 1.4, s * 0.12);
  g.fillRoundedRect(s * 0.05, -s * 0.7, s * 0.8, s * 1.4, s * 0.12);
  g.fillStyle(0x000000, 0.25);
  g.fillRect(-s * 0.05, -s * 0.7, s * 0.1, s * 1.4);
};

/** Short task: a clipboard with a tick. */
export const taskIcon: GlyphDraw = (g, size, color) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  g.fillRoundedRect(-s * 0.72, -s * 0.8, s * 1.44, s * 1.75, s * 0.18);
  g.fillStyle(0x000000, 0.28);
  g.fillRoundedRect(-s * 0.32, -s * 0.98, s * 0.64, s * 0.34, s * 0.1);
  g.lineStyle(s * 0.2, 0x3b2a22, 0.85);
  g.beginPath();
  g.moveTo(-s * 0.36, s * 0.12);
  g.lineTo(-s * 0.06, s * 0.42);
  g.lineTo(s * 0.42, -s * 0.2);
  g.strokePath();
};

/** Daily orders: a calendar page with a tick. */
export const calendarIcon: GlyphDraw = (g, size, color) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  g.fillRoundedRect(-s * 0.85, -s * 0.72, s * 1.7, s * 1.62, s * 0.2);
  g.fillRoundedRect(-s * 0.52, -s * 0.98, s * 0.22, s * 0.46, s * 0.1);
  g.fillRoundedRect(s * 0.3, -s * 0.98, s * 0.22, s * 0.46, s * 0.1);
  g.fillStyle(0x000000, 0.3);
  g.fillRect(-s * 0.85, -s * 0.32, s * 1.7, s * 0.12);
  g.lineStyle(s * 0.18, 0x3b2a22, 0.85);
  g.beginPath();
  g.moveTo(-s * 0.36, s * 0.3);
  g.lineTo(-s * 0.06, s * 0.6);
  g.lineTo(s * 0.42, s * 0.02);
  g.strokePath();
};

/** Night Shift: a crescent moon and two small stars. */
export const moonIcon: GlyphDraw = (g, size, color) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  g.beginPath();
  g.arc(-s * 0.12, 0, s * 0.85, Math.PI * 0.35, Math.PI * 1.65, false);
  g.arc(s * 0.38, 0, s * 0.766, Math.PI * 1.452, Math.PI * 0.548, true);
  g.closePath();
  g.fillPath();
  g.fillCircle(s * 0.62, -s * 0.5, s * 0.13);
  g.fillCircle(s * 0.78, s * 0.12, s * 0.09);
};

/** Snow Fox head (7-day gift tile). */
export const foxIcon: GlyphDraw = (g, size, color) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  g.fillTriangle(-s * 0.9, -s * 0.12, -s * 0.66, -s * 0.98, -s * 0.16, -s * 0.44);
  g.fillTriangle(s * 0.9, -s * 0.12, s * 0.66, -s * 0.98, s * 0.16, -s * 0.44);
  g.fillPoints(
    V([
      { x: -s * 0.95, y: -s * 0.16 },
      { x: -s * 0.5, y: -s * 0.52 },
      { x: s * 0.5, y: -s * 0.52 },
      { x: s * 0.95, y: -s * 0.16 },
      { x: s * 0.72, y: s * 0.22 },
      { x: 0, y: s * 0.86 },
      { x: -s * 0.72, y: s * 0.22 },
    ]),
    true,
  );
  g.fillStyle(0x000000, 0.2);
  g.fillTriangle(-s * 0.72, -s * 0.24, -s * 0.62, -s * 0.76, -s * 0.34, -s * 0.46);
  g.fillTriangle(s * 0.72, -s * 0.24, s * 0.62, -s * 0.76, s * 0.34, -s * 0.46);
  g.fillStyle(0x3b2a22, 0.9);
  g.fillCircle(-s * 0.32, -s * 0.08, s * 0.1);
  g.fillCircle(s * 0.32, -s * 0.08, s * 0.1);
  g.fillEllipse(0, s * 0.56, s * 0.24, s * 0.16);
};

/** Language: a globe. */
export const globeIcon: GlyphDraw = (g, size, color) => {
  const s = size / 2;
  g.lineStyle(s * 0.14, color, 1);
  g.strokeCircle(0, 0, s * 0.82);
  g.strokeEllipse(0, 0, s * 0.8, s * 1.64);
  g.lineBetween(-s * 0.82, 0, s * 0.82, 0);
  g.lineBetween(-s * 0.7, -s * 0.42, s * 0.7, -s * 0.42);
  g.lineBetween(-s * 0.7, s * 0.42, s * 0.7, s * 0.42);
};

/** Icons of the cafe-wide upgrades. */
export const UPGRADE_ICONS: Record<string, GlyphDraw> = {
  smile: (g, size, c) => {
    const s = size / 2;
    g.lineStyle(s * 0.16, c, 1);
    g.strokeCircle(0, 0, s * 0.82);
    g.fillStyle(c, 1);
    g.fillCircle(-s * 0.3, -s * 0.2, s * 0.12);
    g.fillCircle(s * 0.3, -s * 0.2, s * 0.12);
    g.beginPath();
    g.arc(0, s * 0.05, s * 0.42, 0.2, Math.PI - 0.2);
    g.strokePath();
  },
  hands: (g, size, c) => {
    const s = size / 2;
    g.fillStyle(c, 1);
    g.fillRoundedRect(-s * 0.45, -s * 0.15, s * 0.9, s * 0.95, s * 0.25);
    for (let i = 0; i < 4; i++) g.fillRoundedRect(-s * 0.45 + i * s * 0.24, -s * 0.85, s * 0.18, s * 0.8, s * 0.09);
    g.fillRoundedRect(s * 0.38, -s * 0.15, s * 0.42, s * 0.18, s * 0.09);
  },
  sign: (g, size, c) => {
    const s = size / 2;
    g.fillStyle(c, 1);
    g.fillRoundedRect(-s * 0.85, -s * 0.75, s * 1.7, s * 0.95, s * 0.18);
    g.fillRect(-s * 0.08, s * 0.2, s * 0.16, s * 0.8);
    g.fillStyle(0x000000, 0.3);
    g.fillRect(-s * 0.55, -s * 0.42, s * 1.1, s * 0.12);
    g.fillRect(-s * 0.55, -s * 0.15, s * 0.7, s * 0.12);
  },
  chairs: seatIcon,
  tipjar: (g, size, c) => {
    const s = size / 2;
    g.fillStyle(c, 1);
    g.fillRoundedRect(-s * 0.6, -s * 0.5, s * 1.2, s * 1.45, s * 0.3);
    g.fillRoundedRect(-s * 0.45, -s * 0.8, s * 0.9, s * 0.32, s * 0.1);
    g.fillStyle(0x000000, 0.3);
    g.fillCircle(-s * 0.12, s * 0.45, s * 0.2);
    g.fillCircle(s * 0.22, s * 0.25, s * 0.18);
  },
  training: (g, size, c) => {
    const s = size / 2;
    g.fillStyle(c, 1);
    g.fillRoundedRect(-s * 0.95, -s * 0.18, s * 1.9, s * 0.36, s * 0.12);
    g.fillRoundedRect(-s * 0.85, -s * 0.6, s * 0.36, s * 1.2, s * 0.12);
    g.fillRoundedRect(s * 0.49, -s * 0.6, s * 0.36, s * 1.2, s * 0.12);
  },
  nightshift: moonIcon,
  pantry: (g, size, c) => {
    const s = size / 2;
    g.fillStyle(c, 1);
    g.fillRoundedRect(-s * 0.8, -s * 0.9, s * 1.6, s * 1.8, s * 0.15);
    g.fillStyle(0x000000, 0.3);
    g.fillRect(-s * 0.8, -s * 0.12, s * 1.6, s * 0.1);
    g.fillRect(-s * 0.08, -s * 0.9, s * 0.1, s * 1.8);
  },
};
