// Decorations (CLAUDE.md 5a): bought with coins or unlocked with a rewarded ad (one currency, Poki guide 7.1).
// Each one sits in a fixed spot of its floor
// and adds a small tip bonus to the whole cafe. Plain data, no Phaser.
import { contentChecker } from '../../core/content.ts';

export interface DecorItem {
  id: string;
  /** Spot in the room: plant (floor, by the door), wall, wall2, ceiling. */
  slot: 'plant' | 'wall' | 'wall2' | 'ceiling';
  floor: string;
  price: number;
}

export interface DecorDef {
  bonusPerItem: number;
  items: DecorItem[];
}

export function checkDecor(raw: unknown): DecorDef {
  const d = raw as DecorDef;
  const c = contentChecker('src/content/decor.json');
  c.uniqueIds(d.items, 'decor item');
  for (const i of d.items) {
    c.positive(i.price, `decor ${i.id} price`);
    c.need(['plant', 'wall', 'wall2', 'ceiling'].includes(i.slot), `decor ${i.id}: unknown slot ${i.slot}`);
  }
  const seen = new Set<string>();
  for (const i of d.items) {
    const key = `${i.floor}.${i.slot}`;
    c.need(!seen.has(key), `two decor items share ${key}`);
    seen.add(key);
  }
  c.done();
  return d;
}

/** Tip multiplier from the decorations owned. */
export function decorTipMult(def: DecorDef, owned: readonly string[]): number {
  return 1 + def.bonusPerItem * owned.filter((id) => def.items.some((i) => i.id === id)).length;
}
