import Phaser from 'phaser';
import { app, Button, formatNumber, setShape } from '@core';
import type { Cafe, Customer } from '../logic/cafe.ts';
import { CUSTOMER_LOOKS } from '../render/animals';
import { roomLayout, type RoomLayout } from '../render/cafe';
import { coinIcon, starIcon } from '../render/icons';
import { ANIMAL_ASPECT, animalTexture, counterTexture, itemTexture, machineTexture, roomTexture, type Mood } from '../render/textures';

// One floor of the cafe, drawn from the run state every frame (the state is the truth, sprites follow).
// Layers, back to front: wall, machines, staff, front counter, servings, customers, bubbles, lock.

export interface FloorCallbacks {
  onMachine: (item: string, x: number, y: number) => void;
  onCustomer: (id: number, x: number, y: number) => void;
  onOpenFloor: (floor: number) => void;
  onUnlockItem: (item: string) => void;
}

interface CustomerView {
  sprite: Phaser.GameObjects.Image;
  bubble: Phaser.GameObjects.Container;
  bubbleBg: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Graphics;
  vip: Phaser.GameObjects.Image | null;
  mood: Mood;
  look: string;
  scarf: number;
}

interface StationView {
  item: string;
  machine: Phaser.GameObjects.Image;
  zone: Phaser.GameObjects.Zone;
  staff: Phaser.GameObjects.Image;
  staffId: string;
  servings: Phaser.GameObjects.Image[];
  carry: Phaser.GameObjects.Image;
  lock: Button | null;
  bobPhase: number;
}

const RING_OK = 0x5fbf6a;
const RING_LATE = 0xf2a33a;
const RING_BAD = 0xe5485e;

export class Floor {
  readonly index: number;
  readonly id: string;
  private scene: Phaser.Scene;
  private cafe: Cafe;
  private cb: FloorCallbacks;
  private root: Phaser.GameObjects.Container;
  private room: Phaser.GameObjects.Image;
  private counter: Phaser.GameObjects.Image;
  private machineLayer: Phaser.GameObjects.Container;
  private staffLayer: Phaser.GameObjects.Container;
  private frontLayer: Phaser.GameObjects.Container;
  private customerLayer: Phaser.GameObjects.Container;
  private bubbleLayer: Phaser.GameObjects.Container;
  private progress: Phaser.GameObjects.Graphics;
  private stations: StationView[] = [];
  private customers = new Map<number, CustomerView>();
  private lockDim: Phaser.GameObjects.Rectangle;
  private lockBtn: Button;
  private lockText: Phaser.GameObjects.Text;
  private board: Phaser.GameObjects.Text;
  private L: RoomLayout = roomLayout(700, 220);
  private x = 0;
  private y = 0;
  private sizeKey = '';
  private decorKey = '';
  private time = 0;
  /** Scale of characters and icons for this floor height. */
  private k = 1;
  decor: { id: string; slot: string }[] = [];

  constructor(scene: Phaser.Scene, cafe: Cafe, index: number, cb: FloorCallbacks) {
    this.scene = scene;
    this.cafe = cafe;
    this.index = index;
    this.id = cafe.content.cafe.floors[index].id;
    this.cb = cb;
    this.room = scene.add.image(0, 0, '__DEFAULT').setOrigin(0);
    this.machineLayer = scene.add.container();
    this.staffLayer = scene.add.container();
    this.counter = scene.add.image(0, 0, '__DEFAULT').setOrigin(0);
    this.frontLayer = scene.add.container();
    this.progress = scene.add.graphics();
    this.customerLayer = scene.add.container();
    this.bubbleLayer = scene.add.container();
    this.lockDim = scene.add.rectangle(0, 0, 10, 10, 0x281912, 0.62).setOrigin(0).setInteractive();
    this.lockText = scene.add
      .text(0, 0, app.t(`floor.${this.id}`), { fontFamily: app.theme.font, fontStyle: '900', fontSize: 40, color: '#fff3e0', align: 'center', resolution: app.textResolution })
      .setOrigin(0.5)
      .setLineSpacing(4);
    this.lockText.setShadow(0, 3, '#00000088', 6, false, true);
    this.board = scene.add
      .text(0, 0, app.t(`floor.${this.id}`), { fontFamily: app.theme.font, fontStyle: '900', fontSize: 24, color: '#f4efe6', resolution: app.textResolution })
      .setOrigin(0.5);
    this.lockBtn = new Button(scene, 0, 0, {
      label: '',
      icon: coinIcon,
      width: 300,
      height: 88,
      fontSize: 34,
      onClick: () => cb.onOpenFloor(index),
    });
    this.root = scene.add.container(0, 0, [
      this.room,
      this.board,
      this.machineLayer,
      this.staffLayer,
      this.counter,
      this.frontLayer,
      this.progress,
      this.customerLayer,
      this.bubbleLayer,
      this.lockDim,
      this.lockText,
      this.lockBtn,
    ]);
    for (const item of cafe.itemsOnFloor(index)) this.makeStation(item.id);
  }

  setDepth(d: number) {
    this.root.setDepth(d);
  }

  private makeStation(item: string) {
    const s = this.scene;
    const machine = s.add.image(0, 0, machineTexture(s, item)).setOrigin(0.5, 1);
    const staff = s.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 1).setVisible(false);
    const zone = s.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => this.cb.onMachine(item, p.worldX, p.worldY));
    const servings = [0, 1].map(() => s.add.image(0, 0, itemTexture(s, item)).setOrigin(0.5, 1).setVisible(false));
    const carry = s.add.image(0, 0, itemTexture(s, item)).setVisible(false);
    this.machineLayer.add(machine);
    this.staffLayer.add(staff);
    this.frontLayer.add([...servings]);
    this.bubbleLayer.add(carry);
    this.machineLayer.add(zone);
    const def = this.cafe.item(item);
    let lock: Button | null = null;
    if (def.unlockCost > 0) {
      lock = new Button(s, 0, 0, {
        label: formatNumber(def.unlockCost),
        icon: coinIcon,
        width: 150,
        height: 64,
        fontSize: 28,
        onClick: () => this.cb.onUnlockItem(item),
      });
      this.frontLayer.add(lock);
    }
    this.stations.push({ item, machine, zone, staff, staffId: '', servings, carry, lock, bobPhase: Math.random() * 6 });
  }

  /** Places the floor: top-left (x, y), size w x h design units. */
  layout(x: number, y: number, w: number, h: number) {
    this.x = x;
    this.y = y;
    this.root.setPosition(x, y);
    const key = `${Math.round(w)}x${Math.round(h)}`;
    const L = roomLayout(w, h);
    this.L = L;
    // Characters grow with the floor, but not past what four customers in a row can share.
    this.k = Phaser.Math.Clamp(Math.min(L.u, (L.counterX - L.doorX) / 330), 0.85, 1.4);
    if (key !== this.sizeKey) {
      this.sizeKey = key;
      this.decorKey = '';
      const c = counterTexture(this.scene, this.id, w, h);
      this.counter.setTexture(c.key).setDisplaySize(c.w, c.h).setPosition(L.counterX - 8, L.counterY - 6);
    }
    this.refreshRoom();
    const k = this.k;
    this.stations.forEach((st, j) => {
      const mx = L.machines[j];
      const ms = 64 * k;
      st.machine.setPosition(mx - 30 * k, L.backY + 4).setDisplaySize(ms, ms);
      const sh = 98 * k;
      st.staff.setPosition(mx + 34 * k, L.counterY + 4 * k).setDisplaySize(sh / ANIMAL_ASPECT, sh);
      st.zone.setPosition(mx, (L.backY + L.counterY) / 2 - 10).setSize(150 * k, L.floorY - L.backY + 70 * k);
      (st.zone.input!.hitArea as Phaser.Geom.Rectangle).setSize(150 * k, L.floorY - L.backY + 70 * k);
      st.servings.forEach((img, i) => img.setPosition(mx - 54 * k + i * 26 * k, L.counterY + 2).setDisplaySize(42 * k, 42 * k));
      st.carry.setDisplaySize(40 * k, 40 * k);
      st.lock?.setPosition(mx - 10, L.backY - 10);
    });
    // Floor name on the chalk menu board above the counter.
    this.board.setPosition((L.counterX + w) / 2, 19 * L.u).setFontSize(Math.round(19 * Math.min(1.3, L.u)));
    this.board.setScale(Math.min(1, (w - L.counterX - 70) / Math.max(1, this.board.width)));
    this.lockDim.setSize(w, h);
    (this.lockDim.input!.hitArea as Phaser.Geom.Rectangle).setSize(w, h);
    this.lockText.setPosition(w / 2, h / 2 - 52 * Math.min(1, k));
    this.lockBtn.setPosition(w / 2, h / 2 + 24);
  }

  /** Redraws the wall when the decorations change. */
  refreshRoom() {
    const key = `${this.sizeKey}|${this.decor.map((d) => d.id).join(',')}`;
    if (key === this.decorKey) return;
    this.decorKey = key;
    this.room.setTexture(roomTexture(this.scene, this.id, this.L.w, this.L.h, this.decor)).setDisplaySize(this.L.w, this.L.h);
  }

  /** Center of a machine in scene coordinates (tutorial pointer). */
  machineRect(item: string) {
    const j = this.stations.findIndex((s) => s.item === item);
    if (j < 0) return null;
    const z = this.stations[j].zone;
    return { x: this.x + z.x, y: this.y + z.y, w: z.width, h: z.height };
  }

  lockRect(item?: string) {
    if (item) {
      const st = this.stations.find((s) => s.item === item);
      if (!st?.lock || !st.lock.visible) return null;
      return { x: this.x + st.lock.x, y: this.y + st.lock.y, w: 150, h: 64 };
    }
    if (!this.lockBtn.visible) return null;
    return { x: this.x + this.lockBtn.x, y: this.y + this.lockBtn.y, w: 300, h: 88 };
  }

  customerRect(id: number) {
    const v = this.customers.get(id);
    if (!v) return null;
    const h = v.sprite.displayHeight;
    return { x: this.x + v.sprite.x, y: this.y + v.sprite.y - h * 0.45, w: v.sprite.displayWidth * 0.8, h: h * 0.9 };
  }

  /** Scene position of a customer's head (for floating coins). */
  customerTop(id: number) {
    const v = this.customers.get(id);
    if (!v) return null;
    return { x: this.x + v.sprite.x, y: this.y + v.sprite.y - v.sprite.displayHeight * 0.8 };
  }

  machineTop(item: string) {
    const st = this.stations.find((s) => s.item === item);
    if (!st) return null;
    return { x: this.x + st.machine.x, y: this.y + st.machine.y - st.machine.displayHeight };
  }

  bounds() {
    return { x: this.x, y: this.y, w: this.L.w, h: this.L.h };
  }

  private customerView(c: Customer): CustomerView {
    let v = this.customers.get(c.id);
    if (v) return v;
    const s = this.scene;
    const look = CUSTOMER_LOOKS[c.look % CUSTOMER_LOOKS.length];
    const sprite = s.add.image(0, 0, animalTexture(s, look, { scarf: c.look + c.id }, 'neutral')).setOrigin(0.5, 1);
    sprite.setInteractive({ useHandCursor: true });
    sprite.on('pointerdown', (p: Phaser.Input.Pointer) => this.cb.onCustomer(c.id, p.worldX, p.worldY));
    this.customerLayer.add(sprite);
    const bubbleBg = s.add.image(0, 0, '__DEFAULT');
    setShape(bubbleBg, 'bubble', 64, 72, (g) => {
      g.fillStyle(0x3b2a22, 1);
      g.fillCircle(0, -4, 30);
      g.fillTriangle(-8, 20, 8, 20, 0, 34);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(0, -4, 27);
      g.fillTriangle(-6, 18, 6, 18, 0, 30);
    });
    const icon = s.add.image(0, -4, itemTexture(s, c.item)).setDisplaySize(40, 40);
    const ring = s.add.graphics();
    let vip: Phaser.GameObjects.Image | null = null;
    const bubble = s.add.container(0, 0, [bubbleBg, ring, icon]);
    if (c.vip) {
      vip = s.add.image(22, -30, '__DEFAULT');
      setShape(vip, 'vip-star', 30, 30, (g) => starIcon(g, 30, 0xffd34d));
      bubble.add(vip);
    }
    this.bubbleLayer.add(bubble);
    v = { sprite, bubble, bubbleBg, icon, ring, vip, mood: 'neutral', look, scarf: c.look + c.id };
    this.customers.set(c.id, v);
    return v;
  }

  /** Follows the run state. Call every frame. */
  sync(delta: number) {
    this.time += delta / 1000;
    const s = this.cafe.s;
    const open = s.floors[this.index].open;
    const L = this.L;
    const k = this.k;
    const cfg = this.cafe.content.cafe;

    // Lock overlay.
    this.lockDim.setVisible(!open);
    this.lockText.setVisible(!open);
    this.board.setVisible(open);
    this.lockBtn.setVisible(!open);
    if (!open) {
      const prevOpen = this.index === 0 || s.floors[this.index - 1].open;
      const cost = cfg.floors[this.index].unlockCost;
      this.lockBtn.setLabel(formatNumber(cost));
      this.lockBtn.setVisible(prevOpen);
      this.lockText.y = prevOpen ? this.L.h / 2 - 52 * Math.min(1, this.k) : this.L.h / 2;
      this.lockText.setText(prevOpen ? app.t(`floor.${this.id}`) : `${app.t(`floor.${this.id}`)}\n${app.t('floor.later')}`);
      const can = prevOpen && s.coins >= cost;
      this.lockBtn.setEnabled(can);
      // Not affordable yet: still readable over the dark overlay.
      if (!can) this.lockBtn.setAlpha(0.8);
    }

    // Stations.
    this.progress.clear();
    for (const st of this.stations) {
      const state = s.items[st.item];
      const unlocked = state.unlocked && open;
      st.machine.setAlpha(unlocked ? 1 : 0.45);
      st.zone.input!.enabled = unlocked;
      if (st.lock) {
        st.lock.setVisible(open && !state.unlocked);
        if (st.lock.visible) {
          const can = s.coins >= this.cafe.item(st.item).unlockCost;
          st.lock.setEnabled(can);
          if (!can) st.lock.setAlpha(0.8);
        }
      }
      // Staff.
      const animal = s.assign[st.item] ?? '';
      if (animal !== st.staffId) {
        st.staffId = animal;
        if (animal) {
          const rarity = this.cafe.rarityIndex(this.cafe.animal(animal));
          st.staff.setTexture(animalTexture(this.scene, animal, { staff: rarity }, 'neutral'));
          const sh = 98 * k;
          st.staff.setDisplaySize(sh / ANIMAL_ASPECT, sh);
        }
      }
      st.staff.setVisible(!!animal && unlocked);
      if (animal) {
        const busy = state.job !== null || state.carry;
        const base = L.counterY + 4 * k;
        st.staff.y = base - (busy ? Math.abs(Math.sin(this.time * 9 + st.bobPhase)) * 5 * k : Math.sin(this.time * 2 + st.bobPhase) * 1.5);
      }
      // Servings on the counter.
      st.servings.forEach((img, i) => img.setVisible(unlocked && state.ready > i));
      // Making progress bar over the machine.
      if (state.job !== null && unlocked) {
        const p = Phaser.Math.Clamp(state.job / this.cafe.makeTime(st.item), 0, 1);
        const bw = 64 * k;
        const bx = st.machine.x - bw / 2;
        // On the machine's face, clear of the menu board above it.
        const by = st.machine.y - st.machine.displayHeight * 0.55;
        this.progress.fillStyle(0x3b2a22, 0.85);
        this.progress.fillRoundedRect(bx - 3, by - 3, bw + 6, 16, 8);
        this.progress.fillStyle(0x7fe0a6, 1);
        this.progress.fillRoundedRect(bx, by, Math.max(10, bw * p), 10, 5);
      }
      // A serving on its way to a customer.
      const carry = state.carry;
      const target = carry ? this.customers.get(carry.customer) : null;
      st.carry.setVisible(!!carry && !!target && unlocked);
      if (carry && target) {
        const t = Phaser.Math.Clamp(1 - carry.t / carry.total, 0, 1);
        const fx = st.servings[0].x;
        const fy = st.servings[0].y - 20;
        const tx = target.sprite.x;
        const ty = target.sprite.y - target.sprite.displayHeight * 0.55;
        st.carry.setPosition(fx + (tx - fx) * t, fy + (ty - fy) * t - Math.sin(t * Math.PI) * 40 * k);
      }
    }

    // Customers.
    const seen = new Set<number>();
    const ch = 116 * k;
    for (const c of s.customers) {
      if (c.floor !== this.index) continue;
      seen.add(c.id);
      const v = this.customerView(c);
      const spot = L.spots[c.seat] ?? L.spots[0];
      let x = spot;
      let bob = 0;
      if (c.phase === 'walk') {
        const f = Phaser.Math.Clamp(c.t / cfg.customers.walkIn, 0, 1);
        x = spot + (L.doorX - spot) * f;
        bob = Math.abs(Math.sin(this.time * 12 + c.id)) * 6 * k;
      } else if (c.phase === 'leave') {
        const f = Phaser.Math.Clamp(c.t / cfg.customers.leave, 0, 1);
        x = L.doorX + (spot - L.doorX) * f;
        bob = Math.abs(Math.sin(this.time * 12 + c.id)) * 6 * k;
        v.sprite.setAlpha(Math.min(1, f * 3));
      }
      v.sprite.setPosition(x, L.floorY + 4 - bob).setDisplaySize(ch / ANIMAL_ASPECT, ch);
      // Mood follows patience; happy once served.
      const share = c.patience / c.maxPatience;
      const mood: Mood = c.phase === 'leave' ? (c.happy ? 'happy' : 'sad') : share < 0.3 ? 'sad' : 'neutral';
      if (mood !== v.mood) {
        v.mood = mood;
        v.sprite.setTexture(animalTexture(this.scene, v.look, { scarf: v.scarf }, mood));
        v.sprite.setDisplaySize(ch / ANIMAL_ASPECT, ch);
      }
      // Order bubble with the patience ring, while waiting.
      const showBubble = c.phase === 'wait';
      v.bubble.setVisible(showBubble);
      v.sprite.input!.enabled = c.phase === 'wait';
      if (showBubble) {
        const bs = Math.min(1.15, k);
        v.bubble.setPosition(x, L.floorY - ch - 18 * bs).setScale(bs);
        v.ring.clear();
        const color = c.vip ? 0xffc23d : share > 0.5 ? RING_OK : share > 0.25 ? RING_LATE : RING_BAD;
        v.ring.lineStyle(6, color, 1);
        v.ring.beginPath();
        v.ring.arc(0, -4, 27, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Phaser.Math.Clamp(share, 0, 1), false);
        v.ring.strokePath();
        // A ready serving makes the bubble bounce: "tap me".
        const ready = s.items[c.item].ready > 0 && !c.reserved;
        v.bubble.y += ready ? -Math.abs(Math.sin(this.time * 8)) * 6 : 0;
        if (v.vip) v.vip.setScale(1 + Math.sin(this.time * 6) * 0.12);
      }
    }
    for (const [id, v] of this.customers) {
      if (seen.has(id)) continue;
      v.sprite.destroy();
      v.bubble.destroy();
      this.customers.delete(id);
    }
  }
}
