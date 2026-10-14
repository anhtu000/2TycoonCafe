// Cafe pieces drawn in code with the Canvas 2D API: menu items, machines, floor rooms.
// Same outline and shading as the animals (render/animals.ts) so the whole picture has one style.

type Ctx = CanvasRenderingContext2D;
const OUTLINE = '#3b2a22';

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function fs(ctx: Ctx, fill: string, lw: number) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = OUTLINE;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

function shine(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  rr(ctx, x, y, w, h, Math.min(w, h) / 2);
  ctx.fill();
}

// ---------- menu items (icons, also the servings on the counter) ----------

/** Draws a menu item centered in a square of `s` pixels. */
export function drawItem(ctx: Ctx, s: number, id: string) {
  const lw = s * 0.045;
  const cx = s / 2;
  ctx.lineCap = 'round';
  switch (id) {
    case 'coffee': {
      // Cup with saucer and latte art.
      ellipse(ctx, cx, s * 0.8, s * 0.36, s * 0.08);
      fs(ctx, '#f3ead8', lw);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.27, s * 0.38);
      ctx.lineTo(cx + s * 0.27, s * 0.38);
      ctx.quadraticCurveTo(cx + s * 0.25, s * 0.78, cx, s * 0.78);
      ctx.quadraticCurveTo(cx - s * 0.25, s * 0.78, cx - s * 0.27, s * 0.38);
      ctx.closePath();
      fs(ctx, '#fbf6ec', lw);
      ctx.beginPath();
      ctx.arc(cx + s * 0.3, s * 0.52, s * 0.08, -1.2, 1.4);
      ctx.lineWidth = lw;
      ctx.stroke();
      ellipse(ctx, cx, s * 0.38, s * 0.27, s * 0.07);
      fs(ctx, '#8a5634', lw);
      ellipse(ctx, cx, s * 0.38, s * 0.11, s * 0.035);
      ctx.fillStyle = '#e9cfa8';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = lw * 0.8;
      for (const dx of [-0.08, 0.06]) {
        ctx.beginPath();
        ctx.moveTo(cx + dx * s, s * 0.28);
        ctx.quadraticCurveTo(cx + dx * s + s * 0.05, s * 0.2, cx + dx * s, s * 0.12);
        ctx.stroke();
      }
      break;
    }
    case 'tea': {
      // Glass cup of green tea with a leaf.
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.26, s * 0.3);
      ctx.lineTo(cx + s * 0.26, s * 0.3);
      ctx.lineTo(cx + s * 0.2, s * 0.82);
      ctx.lineTo(cx - s * 0.2, s * 0.82);
      ctx.closePath();
      fs(ctx, '#e6f1e2', lw);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.235, s * 0.44);
      ctx.lineTo(cx + s * 0.235, s * 0.44);
      ctx.lineTo(cx + s * 0.2, s * 0.8);
      ctx.lineTo(cx - s * 0.2, s * 0.8);
      ctx.closePath();
      ctx.fillStyle = '#9cc56b';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.05, s * 0.2, s * 0.13, s * 0.07, -0.6, 0, Math.PI * 2);
      fs(ctx, '#5f9e4a', lw * 0.9);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.04, s * 0.27);
      ctx.lineTo(cx + s * 0.13, s * 0.14);
      ctx.lineWidth = lw * 0.6;
      ctx.stroke();
      shine(ctx, cx - s * 0.18, s * 0.36, s * 0.05, s * 0.36);
      break;
    }
    case 'croissant': {
      const parts = [
        [-0.3, 0.6, 0.13, 0.12, 0.6],
        [-0.15, 0.52, 0.15, 0.17, 0.25],
        [0.0, 0.5, 0.17, 0.2, 0],
        [0.15, 0.52, 0.15, 0.17, -0.25],
        [0.3, 0.6, 0.13, 0.12, -0.6],
      ];
      for (const [dx, y, rx, ry, rot] of parts) {
        ctx.beginPath();
        ctx.ellipse(cx + dx * s, y * s, rx * s, ry * s, rot, 0, Math.PI * 2);
        fs(ctx, '#e3a24a', lw);
        ctx.beginPath();
        ctx.ellipse(cx + dx * s - s * 0.03, y * s - s * 0.05, rx * s * 0.45, ry * s * 0.35, rot, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,240,200,0.55)';
        ctx.fill();
      }
      break;
    }
    case 'cake': {
      // Slice of strawberry layer cake.
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.34, s * 0.5);
      ctx.lineTo(cx + s * 0.3, s * 0.36);
      ctx.lineTo(cx + s * 0.3, s * 0.72);
      ctx.lineTo(cx - s * 0.34, s * 0.82);
      ctx.closePath();
      fs(ctx, '#fbe7c6', lw);
      ctx.fillStyle = '#e8697d';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.32, s * 0.64);
      ctx.lineTo(cx + s * 0.28, s * 0.54);
      ctx.lineTo(cx + s * 0.28, s * 0.6);
      ctx.lineTo(cx - s * 0.32, s * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.36, s * 0.5);
      ctx.lineTo(cx + s * 0.3, s * 0.36);
      ctx.lineTo(cx + s * 0.32, s * 0.3);
      ctx.lineTo(cx - s * 0.3, s * 0.42);
      ctx.closePath();
      fs(ctx, '#fff8f0', lw);
      ellipse(ctx, cx + s * 0.02, s * 0.3, s * 0.09, s * 0.08);
      fs(ctx, '#e5485e', lw * 0.9);
      ctx.fillStyle = '#5f9e4a';
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.02, s * 0.22, s * 0.05, s * 0.025, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'icecream': {
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.18, s * 0.5);
      ctx.lineTo(cx + s * 0.18, s * 0.5);
      ctx.lineTo(cx, s * 0.92);
      ctx.closePath();
      fs(ctx, '#e0a85e', lw);
      ctx.strokeStyle = 'rgba(59,42,34,0.35)';
      ctx.lineWidth = lw * 0.6;
      for (const k of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + k * s * 0.12, s * 0.52);
        ctx.lineTo(cx - k * s * 0.04, s * 0.8);
        ctx.stroke();
      }
      ellipse(ctx, cx - s * 0.08, s * 0.45, s * 0.15, s * 0.13);
      fs(ctx, '#f7c6d6', lw);
      ellipse(ctx, cx + s * 0.1, s * 0.43, s * 0.14, s * 0.13);
      fs(ctx, '#bfe3c6', lw);
      ellipse(ctx, cx, s * 0.27, s * 0.14, s * 0.13);
      fs(ctx, '#fff3d6', lw);
      ellipse(ctx, cx + s * 0.02, s * 0.13, s * 0.05, s * 0.05);
      fs(ctx, '#d6334f', lw * 0.8);
      break;
    }
    case 'bubbletea': {
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.24, s * 0.3);
      ctx.lineTo(cx + s * 0.24, s * 0.3);
      ctx.lineTo(cx + s * 0.19, s * 0.88);
      ctx.lineTo(cx - s * 0.19, s * 0.88);
      ctx.closePath();
      fs(ctx, '#f4dcc0', lw);
      ctx.fillStyle = '#3b2a22';
      for (const [dx, y] of [
        [-0.1, 0.8],
        [0.0, 0.82],
        [0.1, 0.79],
        [-0.05, 0.74],
        [0.07, 0.73],
      ]) {
        ellipse(ctx, cx + dx * s, y * s, s * 0.035, s * 0.035);
        ctx.fill();
      }
      ellipse(ctx, cx, s * 0.3, s * 0.26, s * 0.06);
      fs(ctx, '#b48cd6', lw);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.06, s * 0.32);
      ctx.lineTo(cx + s * 0.16, s * 0.05);
      ctx.lineWidth = s * 0.07;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.lineWidth = s * 0.04;
      ctx.strokeStyle = '#ef7a8f';
      ctx.stroke();
      shine(ctx, cx - s * 0.17, s * 0.38, s * 0.05, s * 0.34);
      break;
    }
  }
}

// ---------- machines (one per menu item, on the back counter) ----------

/** Draws the machine of a menu item in a box `w` x `h`, standing on its bottom edge. */
export function drawMachine(ctx: Ctx, w: number, h: number, id: string) {
  const lw = Math.min(w, h) * 0.04;
  const cx = w / 2;
  switch (id) {
    case 'coffee': {
      rr(ctx, w * 0.14, h * 0.18, w * 0.72, h * 0.78, w * 0.1);
      fs(ctx, '#c9cfd6', lw);
      rr(ctx, w * 0.1, h * 0.1, w * 0.8, h * 0.18, w * 0.08);
      fs(ctx, '#8f9aa6', lw);
      rr(ctx, w * 0.3, h * 0.36, w * 0.4, h * 0.12, w * 0.04);
      fs(ctx, '#3d4450', lw * 0.8);
      ctx.fillStyle = '#7fe0a6';
      ellipse(ctx, w * 0.62, h * 0.42, w * 0.03, w * 0.03);
      ctx.fill();
      rr(ctx, cx - w * 0.08, h * 0.52, w * 0.16, h * 0.1, w * 0.03);
      fs(ctx, '#5c6470', lw * 0.8);
      rr(ctx, w * 0.22, h * 0.86, w * 0.56, h * 0.06, w * 0.03);
      fs(ctx, '#5c6470', lw * 0.8);
      shine(ctx, w * 0.2, h * 0.24, w * 0.06, h * 0.5);
      break;
    }
    case 'tea': {
      // Hot water urn with a tap.
      rr(ctx, w * 0.2, h * 0.2, w * 0.6, h * 0.66, w * 0.2);
      fs(ctx, '#d9844f', lw);
      rr(ctx, w * 0.26, h * 0.1, w * 0.48, h * 0.14, w * 0.06);
      fs(ctx, '#a85a2f', lw);
      ellipse(ctx, cx, h * 0.07, w * 0.07, w * 0.05);
      fs(ctx, '#a85a2f', lw);
      rr(ctx, w * 0.42, h * 0.62, w * 0.2, h * 0.08, w * 0.03);
      fs(ctx, '#e8c9a0', lw * 0.8);
      rr(ctx, w * 0.18, h * 0.86, w * 0.64, h * 0.1, w * 0.04);
      fs(ctx, '#7b4a2c', lw);
      shine(ctx, w * 0.27, h * 0.28, w * 0.06, h * 0.36);
      break;
    }
    case 'croissant': {
      // Small oven with a window.
      rr(ctx, w * 0.08, h * 0.22, w * 0.84, h * 0.74, w * 0.08);
      fs(ctx, '#e6d3b5', lw);
      rr(ctx, w * 0.18, h * 0.38, w * 0.64, h * 0.42, w * 0.06);
      fs(ctx, '#4a3325', lw);
      const glow = ctx.createLinearGradient(0, h * 0.4, 0, h * 0.8);
      glow.addColorStop(0, 'rgba(255,170,80,0.25)');
      glow.addColorStop(1, 'rgba(255,140,60,0.75)');
      ctx.fillStyle = glow;
      rr(ctx, w * 0.2, h * 0.4, w * 0.6, h * 0.38, w * 0.05);
      ctx.fill();
      for (const x of [0.28, 0.5, 0.72]) {
        ellipse(ctx, w * x, h * 0.28, w * 0.04, w * 0.04);
        fs(ctx, '#b0896a', lw * 0.7);
      }
      break;
    }
    case 'cake': {
      // Glass cake dome on a stand.
      rr(ctx, w * 0.3, h * 0.82, w * 0.4, h * 0.14, w * 0.04);
      fs(ctx, '#f0d9e2', lw);
      ctx.beginPath();
      ctx.moveTo(w * 0.12, h * 0.82);
      ctx.quadraticCurveTo(w * 0.12, h * 0.18, cx, h * 0.18);
      ctx.quadraticCurveTo(w * 0.88, h * 0.18, w * 0.88, h * 0.82);
      ctx.closePath();
      ctx.fillStyle = 'rgba(220,240,255,0.55)';
      ctx.fill();
      ctx.lineWidth = lw;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      rr(ctx, w * 0.24, h * 0.52, w * 0.52, h * 0.28, w * 0.06);
      fs(ctx, '#fbe7c6', lw * 0.8);
      rr(ctx, w * 0.24, h * 0.5, w * 0.52, h * 0.09, w * 0.05);
      fs(ctx, '#f6a8b8', lw * 0.8);
      ellipse(ctx, cx, h * 0.46, w * 0.06, w * 0.055);
      fs(ctx, '#e5485e', lw * 0.7);
      ellipse(ctx, cx, h * 0.15, w * 0.05, w * 0.04);
      fs(ctx, '#d9c3cc', lw * 0.8);
      shine(ctx, w * 0.2, h * 0.3, w * 0.05, h * 0.4);
      break;
    }
    case 'icecream': {
      // Freezer counter with tubs.
      rr(ctx, w * 0.08, h * 0.36, w * 0.84, h * 0.6, w * 0.08);
      fs(ctx, '#bfe3e8', lw);
      rr(ctx, w * 0.14, h * 0.24, w * 0.72, h * 0.18, w * 0.05);
      fs(ctx, '#e8f7fa', lw);
      for (const [x, c] of [
        [0.28, '#f7c6d6'],
        [0.5, '#fff3d6'],
        [0.72, '#bfe3c6'],
      ] as [number, string][]) {
        ellipse(ctx, w * x, h * 0.3, w * 0.09, h * 0.05);
        fs(ctx, c, lw * 0.8);
      }
      rr(ctx, w * 0.2, h * 0.58, w * 0.6, h * 0.08, w * 0.04);
      fs(ctx, '#8cc7d0', lw * 0.8);
      break;
    }
    case 'bubbletea': {
      // Shaker station with three syrup bottles.
      rr(ctx, w * 0.1, h * 0.62, w * 0.8, h * 0.34, w * 0.06);
      fs(ctx, '#c8a3df', lw);
      for (const [x, c] of [
        [0.24, '#ef7a8f'],
        [0.5, '#f2c45a'],
        [0.76, '#7cc8a0'],
      ] as [number, string][]) {
        rr(ctx, w * x - w * 0.08, h * 0.22, w * 0.16, h * 0.42, w * 0.05);
        fs(ctx, c, lw * 0.9);
        rr(ctx, w * x - w * 0.04, h * 0.12, w * 0.08, h * 0.12, w * 0.02);
        fs(ctx, '#ffffff', lw * 0.8);
      }
      break;
    }
  }
}

// ---------- rooms ----------

export interface RoomTheme {
  wall: string;
  wallDark: string;
  trim: string;
  floor: string;
  floorDark: string;
  counter: string;
  counterTop: string;
  accent: string;
}

export const ROOM_THEMES: Record<string, RoomTheme> = {
  coffee: { wall: '#f1dcc0', wallDark: '#e3c6a2', trim: '#8a5a3c', floor: '#b07a4f', floorDark: '#946240', counter: '#7d5234', counterTop: '#d9b48a', accent: '#3f7d63' },
  bakery: { wall: '#f7d9d2', wallDark: '#ecc1b8', trim: '#a8636a', floor: '#c48d6a', floorDark: '#a87455', counter: '#9a5a5f', counterTop: '#f3d7c0', accent: '#d9644a' },
  dessert: { wall: '#d6eee6', wallDark: '#bfe0d4', trim: '#4f8f86', floor: '#a9b9c4', floorDark: '#8b9ca8', counter: '#5b8f9a', counterTop: '#eaf6f6', accent: '#8b5fb8' },
};

/** Layout of one floor in design units, shared by the drawing and the play scene. */
export interface RoomLayout {
  w: number;
  h: number;
  /** y of the floor line (feet of customers and staff). */
  floorY: number;
  /** x of the door's center. */
  doorX: number;
  /** x of the counter's left edge. */
  counterX: number;
  /** y of the front counter top (servings sit here). */
  counterY: number;
  /** y of the back counter top (machines stand here). */
  backY: number;
  /** Customer spots, left to right. */
  spots: number[];
  /** Machine centers (one per menu item). */
  machines: number[];
}

export function roomLayout(w: number, h: number): RoomLayout {
  const floorY = h - 22;
  const counterW = Math.min(340, w * 0.46);
  const counterX = w - counterW;
  const doorX = 46;
  const left = 120;
  const right = counterX - 40;
  const step = (right - left) / 3;
  return {
    w,
    h,
    floorY,
    doorX,
    counterX,
    counterY: floorY - 56,
    backY: floorY - Math.min(96, h * 0.42),
    spots: [0, 1, 2, 3].map((i) => right - i * step),
    machines: [counterX + counterW * 0.27, counterX + counterW * 0.72],
  };
}

/** Back wall, door, window, shelf, floorboards and the counter, for a floor `w` x `h` pixels (scale k px per unit). */
export function drawRoom(ctx: Ctx, w: number, h: number, k: number, theme: RoomTheme, items: string[]) {
  const L = roomLayout(w / k, h / k);
  ctx.save();
  ctx.scale(k, k);
  const W = L.w;
  const H = L.h;
  const lw = 3;
  // Wall with soft vertical stripes.
  ctx.fillStyle = theme.wall;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = theme.wallDark;
  for (let x = 0; x < W; x += 36) ctx.fillRect(x, 0, 14, L.floorY - 40);
  // Wainscot.
  ctx.fillStyle = theme.wallDark;
  ctx.fillRect(0, L.floorY - 40, W, 40);
  ctx.fillStyle = theme.trim;
  ctx.fillRect(0, L.floorY - 44, W, 6);
  // Floor.
  ctx.fillStyle = theme.floor;
  ctx.fillRect(0, L.floorY, W, H - L.floorY);
  ctx.fillStyle = theme.floorDark;
  for (let x = 0; x < W; x += 48) ctx.fillRect(x, L.floorY, 3, H - L.floorY);
  ctx.fillRect(0, L.floorY, W, 3);
  // Ceiling shadow.
  const g = ctx.createLinearGradient(0, 0, 0, 22);
  g.addColorStop(0, 'rgba(60,30,20,0.22)');
  g.addColorStop(1, 'rgba(60,30,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, 22);
  // Door.
  rr(ctx, L.doorX - 32, L.floorY - 118, 64, 118, 10);
  fs(ctx, theme.trim, lw);
  rr(ctx, L.doorX - 22, L.floorY - 106, 44, 50, 8);
  fs(ctx, '#cfe8f2', lw * 0.8);
  ellipse(ctx, L.doorX + 18, L.floorY - 50, 4, 4);
  ctx.fillStyle = '#f2c45a';
  ctx.fill();
  // Window between door and counter.
  const winX = (L.doorX + L.counterX) / 2 - 70;
  if (winX > L.doorX + 50) {
    rr(ctx, winX, 22, 140, 74, 10);
    fs(ctx, '#cfe8f2', lw);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(winX + 14, 32, 18, 54);
    ctx.fillStyle = theme.trim;
    ctx.fillRect(winX + 68, 22, 4, 74);
    ctx.fillRect(winX, 57, 140, 4);
    // Little plant on the sill.
    rr(ctx, winX + 100, 82, 24, 18, 4);
    fs(ctx, '#d9844f', lw * 0.8);
    for (const [dx, dy] of [
      [-8, -6],
      [0, -12],
      [8, -6],
    ]) {
      ellipse(ctx, winX + 112 + dx, 80 + dy, 7, 9);
      fs(ctx, '#6fae5a', lw * 0.7);
    }
  }
  // Menu board above the counter.
  rr(ctx, L.counterX + 24, 12, W - L.counterX - 48, 34, 8);
  fs(ctx, '#3c3a36', lw);
  // Back counter along the wall: the machines stand on it, behind the staff.
  rr(ctx, L.counterX + 4, L.backY, W - L.counterX, L.floorY - L.backY, 6);
  fs(ctx, theme.wallDark, lw);
  rr(ctx, L.counterX, L.backY - 6, W - L.counterX + 8, 10, 5);
  fs(ctx, theme.counterTop, lw);
  ctx.restore();
  void items;
}

/** Size in design units of the front counter piece for a floor `w` x `h`. Place its top-left at (counterX - 8, counterY - 6). */
export function counterSize(w: number, h: number) {
  const L = roomLayout(w, h);
  return { w: w - L.counterX + 8, h: L.floorY - L.counterY + 10 };
}

/** Front counter, drawn over the staff so only their upper body shows. Servings sit on its top. k: pixels per unit. */
export function drawCounter(ctx: Ctx, w: number, h: number, k: number, theme: RoomTheme) {
  const size = counterSize(w, h);
  ctx.save();
  ctx.scale(k, k);
  const lw = 3;
  rr(ctx, 8, 6, size.w, size.h - 8, 8);
  fs(ctx, theme.counter, lw);
  rr(ctx, 2, 0, size.w + 4, 14, 6);
  fs(ctx, theme.counterTop, lw);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (let px = 24; px < size.w - 16; px += 42) ctx.fillRect(px, 24, 26, size.h - 34);
  ctx.restore();
}
