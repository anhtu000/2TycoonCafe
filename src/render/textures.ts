import Phaser from 'phaser';
import { shapeResolution } from '@core';
import { drawAnimal, SCARF_COLORS, type Outfit } from './animals';
import { counterSize, drawCounter, drawItem, drawMachine, drawRoom, ROOM_THEMES } from './cafe';

// Canvas drawings turned into Phaser textures once, then shown as plain images (cheap on phones).

export type Mood = 'happy' | 'neutral' | 'sad';

/** Apron colour by rarity, so an animal's rarity reads at a glance. */
export const APRON_COLORS = ['#3f7d63', '#3f6fb0', '#7a4fb0', '#c9921f'];
export const RARITY_HEX = [0xb9c2cc, 0x4fa8ff, 0xb56cff, 0xffb627];
export const RARITY_CSS = ['#d5dbe2', '#7cc0ff', '#d3a2ff', '#ffcd5c'];

/** Animal pictures are drawn into a square this many pixels wide, with headroom for long ears. */
export const ANIMAL_PX = 256;
const HEADROOM = 0.14;

function addCanvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) return key;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  draw(c.getContext('2d')!);
  scene.textures.addCanvas(key, c);
  return key;
}

/**
 * An animal. kind: 'staff' wears an apron in its rarity colour, 'customer' a scarf (colour by look).
 * The texture is square plus headroom on top; display it with origin (0.5, 1) at the feet.
 */
export function animalTexture(scene: Phaser.Scene, id: string, kind: { staff: number } | { scarf: number }, mood: Mood = 'neutral') {
  const tag = 'staff' in kind ? `s${kind.staff}` : `c${kind.scarf}`;
  const key = `animal:${id}:${tag}:${mood}`;
  const outfit: Outfit = 'staff' in kind ? { kind: 'apron', color: APRON_COLORS[kind.staff] ?? APRON_COLORS[0] } : { kind: 'scarf', color: SCARF_COLORS[kind.scarf % SCARF_COLORS.length] };
  return addCanvas(scene, key, ANIMAL_PX, ANIMAL_PX * (1 + HEADROOM), (ctx) => {
    ctx.translate(0, ANIMAL_PX * HEADROOM);
    drawAnimal(ctx, ANIMAL_PX, id, outfit, mood);
  });
}

/** Height of an animal texture relative to its width. */
export const ANIMAL_ASPECT = 1 + HEADROOM;

/** Animal shown as a dark shape (staff book: not met yet). */
export function silhouetteTexture(scene: Phaser.Scene, id: string) {
  const key = `animal:${id}:shadow`;
  return addCanvas(scene, key, ANIMAL_PX, ANIMAL_PX * (1 + HEADROOM), (ctx) => {
    ctx.translate(0, ANIMAL_PX * HEADROOM);
    drawAnimal(ctx, ANIMAL_PX, id, { kind: 'none', color: '' }, 'neutral');
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#2a1d17';
    ctx.fillRect(-10, -ANIMAL_PX, ANIMAL_PX + 20, ANIMAL_PX * 2.2);
  });
}

export function itemTexture(scene: Phaser.Scene, id: string) {
  return addCanvas(scene, `item:${id}`, 128, 128, (ctx) => drawItem(ctx, 128, id));
}

export function machineTexture(scene: Phaser.Scene, id: string) {
  return addCanvas(scene, `machine:${id}`, 160, 160, (ctx) => {
    ctx.scale(160 / 92, 160 / 92);
    drawMachine(ctx, 92, 92, id);
  });
}

/** Pixels per design unit for the big room pictures. */
function roomRes() {
  return Math.min(2, shapeResolution());
}

/** Back wall of a floor, `w` x `h` design units, with its decorations. Shown with setDisplaySize(w, h). */
export function roomTexture(scene: Phaser.Scene, floor: string, w: number, h: number, decor: { id: string; slot: string }[]) {
  const k = roomRes();
  const key = `room:${floor}:${Math.round(w)}x${Math.round(h)}@${k}:${decor.map((d) => d.id).join(',')}`;
  return addCanvas(scene, key, w * k, h * k, (ctx) => drawRoom(ctx, w * k, h * k, k, ROOM_THEMES[floor], decor));
}

/** Front counter of a floor. Place its top-left at (counterX - 8, counterY - 6). */
export function counterTexture(scene: Phaser.Scene, floor: string, w: number, h: number) {
  const k = roomRes();
  const size = counterSize(w, h);
  const key = `counter:${floor}:${Math.round(w)}x${Math.round(h)}@${k}`;
  return { key: addCanvas(scene, key, size.w * k, size.h * k, (ctx) => drawCounter(ctx, w, h, k, ROOM_THEMES[floor])), w: size.w, h: size.h };
}
