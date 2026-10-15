import Phaser from 'phaser';
import {
  app,
  BaseScene,
  burst,
  Button,
  FixedStep,
  floatText,
  formatClock,
  formatCountdown,
  formatNumber,
  icons,
  Panel,
  punch,
  secondsAway,
  setShape,
  showOfflinePanel,
  toast,
  Tutorial,
  type TutorialStep,
  type ViewportInfo,
} from '@core';
import { content, decorContent } from '../game/content';
import { AD_TIMERS, boostCooldown, breakAd, dailyClaimable, mainCafe, noteAnimal, openDaily, takeDailyOffer } from '../game/meta';
import { Cafe, newRunState, type AdoptResult, type CafeEvent } from '../logic/cafe.ts';
import { decorTipMult } from '../logic/decor.ts';
import { boltIcon, bookIcon, coinIcon, COIN_COLOR, menuIcon, pawIcon, plantIcon, seatIcon, starIcon, starSlotIcon, stopwatchIcon, trophyIcon, UPGRADE_ICONS } from '../render/icons';
import { animalTexture, itemTexture } from '../render/textures';
import { save } from '../save';
import { Floor } from '../ui/Floor';
import { showAdoptReveal, showDecor, showFinish, showGameMenu, showRecords, showStaffBook } from '../ui/panels';
import { BOOST_CARD, ShopList, type Boost, type ShopEntry } from '../ui/ShopList';
import { TaskBar, type TaskView } from '../ui/TaskBar';
import type { TaskDef } from '../logic/content.ts';

const STEP_MS = 100;
const TOP_PORTRAIT = 172;
const TOP_LANDSCAPE = 92;
const SHOP_COLUMN = 372;
/** Height of the task bar at the top of the shop column (desktop). */
const TASK_COLUMN_H = 72;

/**
 * The cafe: three floors stacked like a doll house, the shop strip (phone) or column (desktop),
 * coins and the star goal on top. The run state (logic/cafe.ts) is the truth; floors draw from it.
 */
export class PlayScene extends BaseScene {
  private cafe!: Cafe;
  private floors: Floor[] = [];
  private shop!: ShopList;
  private tut!: Tutorial;
  private tick!: FixedStep;
  private events2: CafeEvent[] = [];
  private bg!: Phaser.GameObjects.Rectangle;
  private topBar!: Phaser.GameObjects.Image;
  private coinIcon!: Phaser.GameObjects.Image;
  private coins!: Phaser.GameObjects.Text;
  private rate!: Phaser.GameObjects.Text;
  private stars: Phaser.GameObjects.Image[] = [];
  private goal!: Phaser.GameObjects.Text;
  private goalBar!: Phaser.GameObjects.Graphics;
  private rush!: Phaser.GameObjects.Text;
  private clock!: Phaser.GameObjects.Text;
  private menuBtn!: Button;
  private taskBar!: TaskBar;
  private panel: Panel | null = null;
  private lastStars = 0;
  private hudTimer = 0;
  private shownCoins = -1;
  private goalRect = { x: 0, y: 0, w: 0 };
  /** Text, orientation and width the goal line was last set for. */
  private goalLook = '';
  /** Panels and reveals waiting their turn (one at a time). */
  private queue: (() => Panel | null)[] = [];

  constructor() {
    // gameplayStart goes out at the first tap, not when loading ends (Poki guide 5.1).
    super('Play', { gameplay: 'firstInput' });
  }

  protected build() {
    this.floors = [];
    this.stars = [];
    this.queue = [];
    this.panel = null;
    this.leaving = false;
    if (save.data.mode === 'timed' && !save.data.timed) save.data.mode = 'main';
    this.cafe = save.data.mode === 'timed' ? new Cafe(content, save.data.timed!) : mainCafe();
    const cafe = this.cafe;
    if (cafe.s.mode === 'main') {
      cafe.extraTips = decorTipMult(decorContent, save.data.decor);
      cafe.decorCount = save.data.decor.length;
    }
    // A brand-new player: patience waits for the tutorial.
    if (cafe.s.mode === 'main' && !save.data.tutorial.includes('serve')) cafe.s.calm = true;
    cafe.reassign();
    this.lastStars = cafe.stars();

    this.bg = this.add.rectangle(0, 0, 10, 10, 0x2a1d17).setOrigin(0);
    content.cafe.floors.forEach((_, i) => {
      const f = new Floor(this, cafe, i, {
        onMachine: (item, x, y) => this.tapMachine(item, x, y),
        onCustomer: (id, x, y) => this.tapCustomer(id, x, y),
        onOpenFloor: (n) => this.openFloor(n),
        onUnlockItem: (item) => this.unlockItem(item),
      });
      f.setDepth(5 + i);
      this.floors.push(f);
    });
    this.applyDecor();

    // Top bar.
    this.topBar = this.add.image(0, 0, '__DEFAULT').setOrigin(0).setDepth(30);
    const font = { fontFamily: app.theme.font, resolution: app.textResolution };
    this.coinIcon = this.add.image(0, 0, '__DEFAULT').setDepth(31);
    setShape(this.coinIcon, 'coin|44', 44, 44, (g) => coinIcon(g, 44, COIN_COLOR));
    this.coins = this.add.text(0, 0, '0', { ...font, fontStyle: '900', fontSize: 48, color: '#ffffff' }).setOrigin(0, 0.5).setDepth(31);
    this.rate = this.add.text(0, 0, '', { ...font, fontStyle: '700', fontSize: 24, color: '#e3cbb8' }).setOrigin(0, 0.5).setDepth(31);
    for (let i = 0; i < 5; i++) this.stars.push(this.add.image(0, 0, '__DEFAULT').setDepth(31));
    this.goal = this.add.text(0, 0, '', { ...font, fontStyle: '900', fontSize: 24, color: '#fff3e0' }).setOrigin(0.5).setDepth(31);
    this.goalBar = this.add.graphics().setDepth(31);
    this.rush = this.add.text(0, 0, '', { ...font, fontStyle: '900', fontSize: 26, color: '#2a1a00', backgroundColor: '#ffc23d', padding: { x: 14, y: 6 } }).setOrigin(0.5).setDepth(40).setVisible(false);
    this.clock = this.add.text(0, 0, '', { ...font, fontStyle: '900', fontSize: 30, color: '#bff4ff' }).setOrigin(1, 0.5).setDepth(31);
    this.menuBtn = new Button(this, 0, 0, {
      icon: menuIcon,
      width: 84,
      height: 76,
      color: 0x5a3a2a,
      textColor: '#fff3e0',
      onClick: () => this.openMenu(),
    });
    this.menuBtn.setDepth(32);

    this.taskBar = new TaskBar(this, () => this.tapTask());

    this.shop = new ShopList(this, {
      entries: () => this.shopEntries(),
      boost: () => this.boost(),
      freeTarget: () => this.cafe.freeUpgradeTarget(),
      onFree: (id) => this.freeUpgrade(id),
      // Poki: no timer; after one free upgrade the next is offered after a few purchases.
      freeCooldown: () => (AD_TIMERS ? this.cafe.rewardLeft('freeUpgrade') : this.cafe.rewardArmed('freeUpgrade') ? 0 : 1),
    });

    this.tut = new Tutorial(this, {
      onStepDone: (id) => {
        if (!save.data.tutorial.includes(id)) save.data.tutorial.push(id);
        save.flush();
      },
    });

    this.tick = new FixedStep(STEP_MS, (sec) => this.step(sec));
    // ESC pauses (menu) and resumes (Poki guide 6). Panels close themselves on ESC.
    this.input.keyboard?.on('keydown-ESC', () => {
      if (!this.panel) this.time.delayedCall(0, () => this.openMenu());
    });

    // Test hook for the playtest bot (web build only).
    if (__TARGET__ === 'web') (window as unknown as { __play?: PlayScene }).__play = this;
    this.refreshStars(true);
    this.refreshHud();
    this.welcome();
    this.startIntro();
  }

  protected layout(vp: ViewportInfo) {
    this.bg.setSize(vp.width, vp.height);
    const s = vp.safe;
    let shopRect: [number, number, number, number, boolean];
    // Tall phones have room above the 16:9 safe area: the HUD sits at the top edge so the floors get it.
    const ty = vp.portrait ? Math.min(s.y, 12) : s.y;
    if (vp.portrait) {
      // Phone: bar, three floors, shop strip at the bottom.
      const top = ty + TOP_PORTRAIT;
      // Tall phones: bigger floors and a taller shop strip, so nothing is left empty at the bottom.
      const shopH = Phaser.Math.Clamp(Math.round((vp.height - 1280) * 0.15) + 196, 196, 236);
      const bottom = vp.height - shopH - 22;
      const gap = 8;
      const fh = Phaser.Math.Clamp((bottom - top - gap * 2) / 3, 190, 400);
      this.floors.forEach((f, i) => f.layout(0, top + i * (fh + gap), vp.width, fh));
      const shopY = top + 3 * fh + 2 * gap + 12;
      shopRect = [0, shopY, vp.width, Math.min(shopH, vp.height - shopY - 10), true];
      this.drawTopBar(vp.width, ty + TOP_PORTRAIT - 6);
      const y1 = ty + 52;
      // The Poki button sits top-left on phones: keep that corner empty, menu goes top-right.
      this.menuBtn.setPosition(vp.width - s.x - 54, y1);
      this.coinIcon.setPosition(s.x + 140, y1);
      this.coins.setPosition(s.x + 170, y1 - 4);
      this.rate.setPosition(s.x + 172, y1 + 36);
      this.stars.forEach((st, i) => st.setPosition(vp.width - s.x - 300 + i * 42, y1 - 8));
      // The star goal sits under the stars; the second row is the task bar (and the clock in a timed run).
      this.goalRect = { x: vp.width - s.x - 216, y: y1 + 32, w: 290 };
      const timed = this.cafe.s.mode === 'timed';
      this.clock.setPosition(vp.width - s.x - 24, ty + 130);
      // Poki's button sits top-left on phones (46x62 CSS px from 24 px down): the task bar starts right of it.
      const pillRight = 54 * (vp.width / vp.cssWidth);
      const tx = Math.max(s.x + 24, pillRight);
      this.taskBar.layout(tx, ty + 100, vp.width - s.x - 24 - tx - (timed ? 150 : 0), 58);
    } else {
      // Desktop: floors on the left, shop column on the right.
      const shopW = SHOP_COLUMN;
      const floorsW = Math.min(1100, vp.width - shopW - 24);
      const top = TOP_LANDSCAPE + Math.max(0, s.y);
      const gap = 6;
      const fh = (vp.height - top - 10 - gap * 2) / 3;
      this.floors.forEach((f, i) => f.layout(0, top + i * (fh + gap), floorsW, fh));
      // The task bar heads the shop column.
      this.taskBar.layout(floorsW + 12, 16, vp.width - floorsW - 24, TASK_COLUMN_H);
      shopRect = [floorsW + 12, 16 + TASK_COLUMN_H + 10, vp.width - floorsW - 24, vp.height - 42 - TASK_COLUMN_H, false];
      this.drawTopBar(floorsW, top - 6);
      const y1 = 44;
      // Top-left stays free for the Poki button; the menu sits at the right end of the bar.
      this.menuBtn.setPosition(floorsW - 54, y1);
      this.coinIcon.setPosition(124, y1);
      this.coins.setPosition(154, y1 - 8);
      this.rate.setPosition(156, y1 + 26);
      const sx = floorsW - 330;
      this.stars.forEach((st, i) => st.setPosition(sx + i * 44, y1 - 14));
      this.goalRect = { x: floorsW - 240, y: y1 + 18, w: 280 };
      this.clock.setPosition(floorsW / 2 + 110, y1);
    }
    this.shop.layout(...shopRect);
    const f0 = this.floors[0].bounds();
    this.rush.setPosition(f0.x + f0.w / 2, f0.y + 26);
    this.refreshStars(true);
  }

  private drawTopBar(w: number, h: number) {
    setShape(this.topBar, `topbar|${Math.round(w)}|${Math.round(h)}`, w, h, (g) => {
      g.fillStyle(0x3b2a22, 1);
      g.fillRect(-w / 2, -h / 2, w, h);
      g.fillStyle(0x000000, 0.25);
      g.fillRect(-w / 2, h / 2 - 5, w, 5);
    }, 0);
    this.topBar.setPosition(0, 0);
  }

  update(_time: number, delta: number) {
    // The cafe waits while a window is open: customers should not walk out while the player reads.
    if (!this.panel) this.tick.update(delta);
    for (const f of this.floors) f.sync(this.panel ? 0 : delta);
    this.hudTimer -= delta;
    if (this.hudTimer <= 0) {
      this.hudTimer = 120;
      this.refreshHud();
      this.shop.refresh();
      this.checkTriggers();
    }
  }

  // ---------- simulation ----------

  private step(sec: number) {
    const cafe = this.cafe;
    if (cafe.s.calm && save.data.tutorial.includes('serve') && cafe.s.served >= 3) cafe.s.calm = false;
    if (!cafe.s.vipOn && cafe.s.served >= 15 && save.data.tutorial.includes('upgrade')) cafe.s.vipOn = true;
    cafe.step(sec, this.events2);
    this.handle(this.events2);
    this.events2 = [];
  }

  private handle(events: CafeEvent[]) {
    for (const e of events) {
      switch (e.type) {
        case 'served': {
          const f = this.floors[e.customer.floor];
          const top = f.customerTop(e.customer.id);
          if (top) {
            floatText(this, top.x, top.y - 10, `+${formatNumber(e.coins)}`, { color: e.hand ? '#ffd34d' : '#ffffff', size: e.hand ? 40 : 32 });
          }
          if (e.vipBonus > 0) {
            if (top) burst(this, top.x, top.y + 20, 0xffd34d, 24, 520);
            toast(this, app.t('toast.vip', { n: formatNumber(e.vipBonus) }));
            app.audio.play('reward');
            app.moments.emit('rarePull', { tier: 3, odds: 0, label: 'vip' });
          } else {
            app.audio.play('coin', { pitchJitter: 90, volume: e.hand ? 0.6 : 0.22 });
          }
          punch(this, this.coins, 0.06);
          break;
        }
        case 'lost': {
          const top = this.floors[e.customer.floor].customerTop(e.customer.id);
          if (top) floatText(this, top.x, top.y, '...', { color: '#ffb0a0', size: 34 });
          app.audio.play('sad', { volume: 0.4 });
          break;
        }
        case 'made': {
          const f = this.floors[this.cafe.floorIndexOf(e.item)];
          const top = f.machineTop(e.item);
          if (top && !this.cafe.s.assign[e.item]) {
            burst(this, top.x, top.y + 20, 0xfff1b8, 6, 160);
            app.audio.play('pop', { pitchJitter: 80, volume: 0.5 });
          }
          break;
        }
        case 'star':
          this.onStar(e.stars);
          break;
        case 'taskDone':
          if (this.taskView()) this.taskBar.ping();
          break;
        case 'milestone': {
          // x2 at Lv 10, 25, 50...: a small celebration on the machine (Poki guide 8: celebrate milestones).
          const top = this.floors[this.cafe.floorIndexOf(e.item)].machineTop(e.item);
          if (top) {
            burst(this, top.x, top.y + 20, 0xffd34d, 20, 380);
            floatText(this, top.x, top.y - 20, `x${e.mult}!`, { color: '#ffd34d', size: 44, rise: 70 });
          }
          toast(this, app.t('toast.milestone', { item: app.t(`item.${e.item}`), n: e.mult, l: e.level }));
          app.audio.play('reward', { volume: 0.7 });
          break;
        }
        case 'finish':
          this.onFinish();
          break;
        default:
          break;
      }
    }
  }

  // ---------- taps ----------

  private tapMachine(item: string, x: number, y: number) {
    if (this.panel) return;
    const r = this.cafe.tapStation(item);
    if (r === 'locked') return;
    if (r === 'full') {
      floatText(this, x, y - 30, 'x', { color: '#ffb0a0', size: 28, rise: 30 });
      return;
    }
    app.audio.play('tap', { pitchJitter: 150, volume: 0.6 });
    app.haptic(5);
    const f = this.floors[this.cafe.floorIndexOf(item)];
    const top = f.machineTop(item);
    if (top) burst(this, top.x, top.y + 30, 0xfff1b8, 4, 140);
  }

  private tapCustomer(id: number, x: number, y: number) {
    if (this.panel) return;
    const r = this.cafe.tapCustomer(id, this.events2);
    if (r === 'served') {
      this.handle(this.events2);
      this.events2 = [];
      app.haptic(10);
    } else if (r === 'notReady') {
      const c = this.cafe.s.customers.find((x) => x.id === id);
      floatText(this, x, y - 40, c ? app.t('tut.notReady') : '', { color: '#ffe6c0', size: 24, rise: 40 });
    }
  }

  private openFloor(n: number) {
    if (!this.cafe.openFloor(n)) return;
    const name = app.t(`floor.${content.cafe.floors[n].id}`);
    app.audio.play('reward');
    const b = this.floors[n].bounds();
    burst(this, b.x + b.w / 2, b.y + b.h / 2, 0xffd34d, 40, 640);
    toast(this, app.t('toast.floorOpen', { floor: name }));
    app.moments.emit('collectionNew', { id: `floor.${content.cafe.floors[n].id}` });
    this.refreshStars();
  }

  private unlockItem(item: string) {
    if (!this.cafe.unlockItem(item)) return;
    app.audio.play('reward');
    const top = this.floors[this.cafe.floorIndexOf(item)].machineTop(item);
    if (top) burst(this, top.x, top.y + 30, 0xffd34d, 24, 420);
    toast(this, app.t('toast.itemNew', { item: app.t(`item.${item}`) }));
    this.shop.refresh(true);
  }

  // ---------- shop ----------

  private shopEntries(): ShopEntry[] {
    const cafe = this.cafe;
    const s = cafe.s;
    const out: ShopEntry[] = [];
    // Adoption first: helpers are the heart of the game.
    if (s.served >= 10 || cafe.staffCount() > 0) {
      const cost = s.adopts === 0 && save.data.tickets > 0 ? 0 : cafe.adoptCost();
      out.push({
        id: 'adopt',
        name: app.t('shop.adopt'),
        desc: cafe.staffCount() < cafe.slotCount() ? app.t('shop.adoptDesc') : app.t('shop.adoptDup'),
        icon: save.data.tickets > 0 ? pawIcon : animalTexture(this, 'capybara', { staff: 0 }, 'happy'),
        level: save.data.tickets > 0 ? `x${save.data.tickets}` : '',
        cost: save.data.tickets > 0 ? 0 : cost,
        affordable: save.data.tickets > 0 || s.coins >= cost,
        onBuy: () => this.adopt('paid'),
      });
    }
    for (const item of content.cafe.items) {
      const st = s.items[item.id];
      if (!st.unlocked) continue;
      const maxed = !cafe.canLevelItem(item.id);
      // Capped until the last floor opens: the card says where more levels come from.
      const capped = cafe.levelCapped(item.id);
      const cost = maxed ? null : cafe.itemLevelCost(item.id);
      const next = cafe.nextMilestone(st.level);
      const lastFloor = content.cafe.floors[content.cafe.floors.length - 1].id;
      out.push({
        id: `item:${item.id}`,
        name: app.t(`item.${item.id}`),
        desc: capped
          ? app.t('shop.capped', { floor: app.t(`floor.${lastFloor}`) })
          : next && next.value
            ? app.t('shop.itemNext', { n: next.value, l: next.level })
            : app.t('shop.itemDesc'),
        icon: itemTexture(this, item.id),
        level: maxed && !capped ? app.t('shop.max') : app.t('shop.level', { n: st.level }),
        cost,
        affordable: cost !== null && s.coins >= cost,
        onBuy: () => {
          if (cafe.buyItemLevel(item.id)) this.bought(`item:${item.id}`);
        },
      });
    }
    content.cafe.floors.forEach((f, i) => {
      if (!s.floors[i].open) return;
      const cost = cafe.seatCost(i);
      if (cost === null) return;
      if (i === 0 && s.served < 4) return;
      out.push({
        id: `seat:${i}`,
        name: app.t('shop.seat'),
        desc: app.t('shop.seatDesc', { floor: app.t(`floor.${f.id}`) }),
        icon: seatIcon,
        level: `${s.floors[i].seats}/${f.maxSeats}`,
        cost,
        affordable: s.coins >= cost,
        onBuy: () => {
          if (cafe.buySeat(i)) this.bought(`seat:${i}`);
        },
      });
    });
    for (const u of content.upgrades) {
      if (!cafe.upgradeVisible(u)) continue;
      const maxed = cafe.upgradeMaxed(u.id);
      const cost = maxed ? null : cafe.upgradeCost(u.id);
      out.push({
        id: `up:${u.id}`,
        name: app.t(`upgrade.${u.id}.name`),
        desc: app.t(`upgrade.${u.id}.desc`),
        icon: UPGRADE_ICONS[u.id] ?? pawIcon,
        level: maxed ? app.t('shop.max') : app.t('shop.level', { n: cafe.level(u.id) }),
        cost,
        affordable: cost !== null && s.coins >= cost,
        onBuy: () => {
          if (cafe.buyUpgrade(u.id)) this.bought(`up:${u.id}`);
        },
      });
    }
    return out;
  }

  private bought(id: string) {
    app.audio.play('buy', { pitchJitter: 80 });
    app.haptic(12);
    const r = this.shop.cardRect(id);
    if (r) burst(this, r.x, r.y, 0xffc23d, 10, 260);
    this.refreshHud();
  }

  private freeUpgrade(id: string) {
    const cafe = this.cafe;
    if (!cafe.grantFree(id)) return;
    cafe.startCooldown('freeUpgrade', boostCooldown(content.cafe.rewarded.freeUpgradeCooldown));
    cafe.useReward('freeUpgrade');
    app.audio.play('reward');
    this.bought(id);
  }

  /**
   * Rewarded boost card. Poki manages ad frequency, so there the offers follow the game state instead of
   * timers (Poki guide 7.1): a free helper when a station is empty and the player cannot afford one yet,
   * otherwise Rush Hour whenever it is not running. Other portals keep the 5-minute cooldowns (CLAUDE.md 3).
   */
  private boost(): Boost | null {
    const cafe = this.cafe;
    if (cafe.staffCount() === 0 || !app.ads.rewardedAvailable || app.clean) return null;
    const rushOn = cafe.s.rushLeft > 0;
    const rush = (wait: number): Boost => ({
      id: 'rush',
      name: app.t('boost.rush'),
      desc: app.t('boost.rushDesc'),
      icon: boltIcon,
      wait: rushOn ? 0 : wait,
      blocked: rushOn ? app.t('boost.rushOn', { t: formatCountdown(cafe.s.rushLeft) }) : undefined,
      onReward: () => {
        if (rushOn) return;
        cafe.startRush();
        cafe.startCooldown('rush', boostCooldown());
        cafe.useReward('rush');
        app.audio.play('reward');
        this.tut.complete('rush');
      },
    });
    const freeAdopt: Boost = {
      id: 'freeAdopt',
      name: app.t('boost.adopt'),
      desc: app.t('boost.adoptDesc'),
      icon: pawIcon,
      wait: 0,
      onReward: () => {
        cafe.startCooldown('freeAdopt', boostCooldown());
        cafe.useReward('freeAdopt');
        this.adopt('free');
      },
    };
    if (!AD_TIMERS) {
      // Offers follow the game state (rewarded.afterBuys), never a clock.
      const needHelper = cafe.staffCount() < cafe.slotCount() && cafe.s.coins < cafe.adoptCost() && save.data.tickets === 0;
      if (needHelper && !rushOn && cafe.rewardArmed('freeAdopt')) return freeAdopt;
      return rushOn || cafe.rewardArmed('rush') ? rush(0) : null;
    }
    const rushWait = cafe.rewardLeft('rush');
    const adoptWait = cafe.rewardLeft('freeAdopt');
    if (!rushOn && rushWait <= 0) return rush(0);
    if (adoptWait <= 0) return freeAdopt;
    return rush(Math.min(rushWait, adoptWait));
  }

  // ---------- staff ----------

  private adopt(how: 'paid' | 'free') {
    const cafe = this.cafe;
    const first = cafe.staffCount() === 0 && cafe.s.mode === 'main' && !save.data.tutorial.includes('helper');
    const forced = first ? content.staff.adopt.firstGuided : undefined;
    let r: AdoptResult | null;
    if (how === 'paid' && save.data.tickets > 0) {
      save.data.tickets -= 1;
      r = cafe.adopt(false, forced);
    } else r = cafe.adopt(how === 'paid', forced);
    if (!r) return;
    noteAnimal(r.animal.id, r.level);
    save.flush();
    if (r.rarity >= 2) app.moments.emit('rarePull', { tier: r.rarity, odds: cafe.adoptOdds()[r.rarity], label: r.animal.id });
    this.tut.complete('adopt');
    this.showPanel(() => showAdoptReveal(this, cafe, r!, () => this.panelClosed()));
    this.shop.refresh(true);
  }

  // ---------- stars and finish ----------

  private onStar(stars: number) {
    this.refreshStars();
    const img = this.stars[stars - 1];
    if (img) {
      burst(this, img.x, img.y, 0xffd34d, 26, 420);
      punch(this, img, 0.6, 300);
    }
    if (stars < content.cafe.goals.length) toast(this, `${app.t('star.got')}  ${app.t('star.next', { goal: this.goalText(stars) })}`, 3200);
    app.audio.play('reward');
    app.platform.happyTime();
  }

  private onFinish() {
    const cafe = this.cafe;
    const ms = Math.round((cafe.s.finishedAt ?? cafe.s.time) * 1000);
    app.moments.emit('finish', { runMs: ms });
    let rank: number | null = null;
    const first = cafe.s.mode === 'main' && save.data.firstFinishMs === 0;
    if (cafe.s.mode === 'main') {
      if (first) save.data.firstFinishMs = ms;
    } else {
      const best = Object.keys(cafe.s.staff).reduce((m, id) => Math.max(m, cafe.rarityIndex(cafe.animal(id))), 0);
      const rec = { ms, best, day: new Date().toISOString().slice(0, 10) };
      const list = [...save.data.records, rec].sort((a, b) => a.ms - b.ms).slice(0, 5);
      rank = list.indexOf(rec);
      if (rank < 0) rank = null;
      save.data.records = list;
      if (!save.data.bestRunMs || ms < save.data.bestRunMs) save.data.bestRunMs = ms;
    }
    save.flush();
    this.time.delayedCall(900, async () => {
      if (AD_TIMERS) await breakAd('finish');
      this.showPanel(() =>
        showFinish(this, cafe, {
          ms,
          rank,
          first,
          onKeep: () => this.panelClosed(),
          onTimed: () => this.startTimed(),
          onBack: () => this.leaveTimed(),
        }),
      );
    });
  }

  private goalText(i: number) {
    const g = content.cafe.goals[i];
    if (!g) return app.t('hud.allStars');
    const n = g.served ?? g.staff ?? g.level ?? 0;
    return app.t(`hud.goal.${g.id}`, { n });
  }

  private refreshStars(force = false) {
    const n = this.cafe.stars();
    if (!force && n === this.lastStars) return;
    this.lastStars = n;
    this.stars.forEach((img, i) => {
      if (i < n) setShape(img, 'star|40', 40, 40, (g) => starIcon(g, 40, 0xffd34d));
      else setShape(img, 'starslot|40', 40, 40, (g) => starSlotIcon(g, 40, 0xc9ab92));
    });
  }

  // ---------- HUD ----------

  private refreshHud() {
    const s = this.cafe.s;
    const coins = Math.floor(s.coins);
    if (coins !== this.shownCoins) {
      this.shownCoins = coins;
      this.coins.setText(formatNumber(coins));
    }
    this.rate.setText(app.t('hud.perSec', { n: formatNumber(Math.round(s.rate)) }));
    const stars = this.cafe.stars();
    const { x, y, w } = this.goalRect;
    const vp = this.vp;
    this.goalBar.clear();
    // Phone: one small line under the stars, with the count when there is one ("Serve 20 customers 12/20").
    // Desktop: the line and a progress bar under the stars.
    const g = content.cafe.goals[stars];
    const counted = !!g && (g.served !== undefined || g.staff !== undefined);
    const p = Phaser.Math.Clamp(stars < content.cafe.goals.length ? this.cafe.goalProgress(stars) : 1, 0, 1);
    const n = g?.served ?? g?.staff ?? 0;
    const goal = this.goalText(stars) + (vp.portrait && counted && p < 1 ? `  ${Math.floor(p * n)}/${n}` : '');
    const look = `${goal}|${vp.portrait}|${w}`;
    if (look !== this.goalLook) {
      this.goalLook = look;
      this.goal.setText(goal).setFontSize(vp.portrait ? 20 : 24).setScale(1);
      if (this.goal.width > w) this.goal.setScale(w / this.goal.width);
    }
    this.goal.setPosition(x, y);
    if (!vp.portrait && stars < content.cafe.goals.length) {
      this.goalBar.fillStyle(0xffffff, 0.15);
      this.goalBar.fillRoundedRect(x - w / 2, y + 15, w, 8, 4);
      this.goalBar.fillStyle(0xffd34d, 1);
      this.goalBar.fillRoundedRect(x - w / 2, y + 15, Math.max(8, w * p), 8, 4);
    }
    this.rush.setVisible(s.rushLeft > 0);
    if (s.rushLeft > 0) this.rush.setText(app.t('hud.rush', { t: formatCountdown(s.rushLeft) }));
    this.clock.setVisible(s.mode === 'timed');
    if (s.mode === 'timed') this.clock.setText(formatClock(s.finishedAt ?? s.time));
    this.taskBar.show(this.taskView());
  }

  // ---------- short tasks ----------

  /** The task bar shows once the first serve is done (the first minute is for the tutorial). */
  private taskView(): TaskView | null {
    const cafe = this.cafe;
    if (cafe.s.mode === 'main' && !this.done('serve')) return null;
    const t = cafe.task();
    if (!t) return null;
    const p = cafe.taskProgress(t);
    return { text: this.taskText(t), have: p.have, need: p.need, reward: cafe.taskReward(t), done: p.have >= p.need };
  }

  private taskText(t: TaskDef): string {
    const n = t.n ?? 1;
    switch (t.type) {
      case 'served':
        return app.t('task.served', { n: formatNumber(n) });
      case 'vips':
        return n === 1 ? app.t('task.vip1') : app.t('task.vips', { n });
      case 'itemLevel':
        return app.t('task.itemLevel', { item: app.t(`item.${t.item}`), n });
      case 'unlock':
        return app.t('task.unlock', { item: app.t(`item.${t.item}`) });
      case 'floor':
        return app.t('task.floor', { floor: app.t(`floor.${t.floor}`) });
      case 'seats':
        return app.t('task.seats', { floor: app.t(`floor.${t.floor}`), n });
      case 'upgrade':
        return n === 1 ? app.t('task.upgrade1', { name: app.t(`upgrade.${t.upgrade}.name`) }) : app.t('task.upgrade', { name: app.t(`upgrade.${t.upgrade}.name`), n });
      case 'adopts':
        return app.t('task.adopts', { n });
      case 'staff':
        return app.t('task.staff', { n });
      case 'decor':
        return n === 1 ? app.t('task.decor1') : app.t('task.decor', { n });
      case 'earned':
        return app.t('task.earned', { n: formatNumber(n) });
    }
  }

  /** Done: claim the coins. Not done: point at where to do it. */
  private tapTask() {
    if (this.panel || this.tut.active) return;
    const cafe = this.cafe;
    const t = cafe.task();
    if (!t) return;
    if (cafe.taskDone(t)) {
      const coins = cafe.claimTask();
      const c = this.taskBar.center;
      floatText(this, c.x, c.y - 30, `+${formatNumber(coins)}`, { color: '#ffd34d', size: 40 });
      burst(this, c.x, c.y, 0xffd34d, 22, 460);
      app.audio.play('reward');
      app.haptic(15);
      punch(this, this.coins, 0.15);
      save.flush();
      this.refreshHud();
      this.taskBar.enter();
      this.shop.refresh(true);
      return;
    }
    let pointed = false;
    if (t.type === 'itemLevel') pointed = this.shop.pulse(`item:${t.item}`);
    else if (t.type === 'upgrade') pointed = this.shop.pulse(`up:${t.upgrade}`);
    else if (t.type === 'adopts' || t.type === 'staff') pointed = this.shop.pulse('adopt');
    else if (t.type === 'seats') pointed = this.shop.pulse(`seat:${content.cafe.floors.findIndex((f) => f.id === t.floor)}`);
    else if (t.type === 'unlock') {
      const f = this.floors[cafe.floorIndexOf(t.item!)];
      const r = f.lockRect(t.item!) ?? f.lockRect();
      if (r) {
        burst(this, r.x, r.y, 0xffd34d, 14, 300);
        pointed = true;
      }
    } else if (t.type === 'floor') {
      const i = content.cafe.floors.findIndex((f) => f.id === t.floor);
      const r = this.floors[i]?.lockRect();
      if (r) {
        burst(this, r.x, r.y, 0xffd34d, 14, 300);
        pointed = true;
      }
    } else if (t.type === 'decor' && cafe.s.mode === 'main') {
      this.showPanel(() => showDecor(this, cafe, () => this.applyDecor(), () => this.panelClosed()));
      pointed = true;
    }
    if (!pointed) this.taskBar.shake();
  }

  // ---------- panels ----------

  private showPanel(open: () => Panel | null) {
    if (this.panel) {
      this.queue.push(open);
      return;
    }
    this.stopPlay();
    this.panel = open();
  }

  private panelClosed() {
    this.panel = null;
    const next = this.queue.shift();
    if (next) this.time.delayedCall(150, () => this.showPanel(next));
    else this.time.delayedCall(0, () => this.resumePlay());
    this.shop.refresh(true);
  }

  /** A window opens: the player stops playing (Poki: gameplayStop at every interruption). */
  private stopPlay() {
    app.gameplay.stop();
  }

  /**
   * Back to the cafe after a window: commercialBreak, then gameplayStart (Poki guide 5.2).
   * Before the first tap nothing is sent; the first tap starts play.
   */
  private async resumePlay() {
    if (this.panel || !this.playStarted || this.leaving) return;
    await breakAd('navigation');
    if (!this.panel && this.scene.isActive()) app.gameplay.start();
  }

  private openMenu() {
    if (this.panel) return;
    const timed = this.cafe.s.mode === 'timed';
    const entries = [
      { label: app.t('menu.resume'), icon: icons.playIcon, onClick: () => undefined },
      { label: app.audio.muted ? app.t('menu.soundOff') : app.t('menu.soundOn'), icon: app.audio.muted ? icons.soundOffIcon : icons.soundOnIcon, onClick: () => app.audio.toggle() },
      {
        label: app.t('menu.staff'),
        icon: bookIcon,
        onClick: () => this.showPanel(() => showStaffBook(this, this.cafe, () => this.panelClosed())),
      },
      ...(timed
        ? []
        : [
            {
              label: app.t('menu.decor'),
              icon: plantIcon,
              onClick: () => this.showPanel(() => showDecor(this, this.cafe, () => this.applyDecor(), () => this.panelClosed())),
            },
            { label: app.t('menu.daily'), icon: icons.giftIcon, badge: dailyClaimable(), onClick: () => this.showPanel(() => openDaily(this, this.cafe, () => this.refreshHud(), () => this.panelClosed())) },
          ]),
      ...(save.data.firstFinishMs > 0 && !timed ? [{ label: app.t('menu.timed'), icon: stopwatchIcon, onClick: () => this.startTimed() }] : []),
      ...(save.data.records.length ? [{ label: app.t('menu.records'), icon: trophyIcon, onClick: () => this.showPanel(() => showRecords(this, null, () => this.panelClosed())) }] : []),
      timed
        ? { label: app.t('menu.leaveTimed'), icon: icons.homeIcon, onClick: () => this.leaveTimed() }
        : app.menuKey
          ? { label: app.t('menu.home'), icon: icons.homeIcon, onClick: () => app.toMenu() }
          : null,
    ].filter((e): e is NonNullable<typeof e> => e !== null);
    // The menu closes before its entry runs, so an entry can open the next panel right away;
    // play resumes only when no other window took its place.
    this.stopPlay();
    this.panel = showGameMenu(this, entries, () => {
      this.panel = null;
      this.time.delayedCall(0, () => {
        if (!this.panel) this.panelClosed();
      });
    });
  }

  private applyDecor() {
    const owned = new Set(save.data.decor);
    for (const f of this.floors) {
      f.decor = decorContent.items.filter((d) => d.floor === f.id && owned.has(d.id)).map((d) => ({ id: d.id, slot: d.slot }));
      f.refreshRoom();
    }
    if (this.cafe.s.mode === 'main') {
      this.cafe.extraTips = decorTipMult(decorContent, save.data.decor);
      this.cafe.decorCount = save.data.decor.length;
    }
  }

  /** Set while the scene restarts into another run: nothing may resume play meanwhile. */
  private leaving = false;

  private startTimed() {
    this.leaving = true;
    this.stopPlay();
    if (this.cafe.s.mode === 'main') save.data.mainLeftAt = Date.now();
    save.data.timed = newRunState(content, 'timed', app.rng.int(1, 2 ** 31 - 1));
    save.data.mode = 'timed';
    save.flush();
    void breakAd('navigation').then(() => this.scene.restart());
  }

  private leaveTimed() {
    this.leaving = true;
    this.stopPlay();
    save.data.mode = 'main';
    save.data.timed = null;
    save.flush();
    this.scene.restart();
  }

  /** Coming back: helpers' earnings while away, then the daily gift. */
  private welcome() {
    const cafe = this.cafe;
    if (cafe.s.mode !== 'main') return;
    let away = secondsAway(save.lastSavedAt);
    if (save.data.mainLeftAt > 0) {
      away = Math.max(away, (Date.now() - save.data.mainLeftAt) / 1000);
      save.data.mainLeftAt = 0;
    }
    const amount = cafe.offlineIncome(away);
    if (amount > 0) {
      this.showPanel(() =>
        showOfflinePanel(this, {
          seconds: Math.min(away, cafe.stat('offlineHours') * 3600),
          amount,
          adMultiplier: content.cafe.rewarded.offlineMult,
          icon: coinIcon,
          iconColor: COIN_COLOR,
          onCollect: (n) => {
            cafe.addCoins(n, false);
            save.flush();
            this.time.delayedCall(0, () => this.panelClosed());
          },
        }),
      );
    }
    // Not during the first-time tutorial: the first minute is for serving (CLAUDE.md 4.2).
    if (this.done('upgrade') && takeDailyOffer()) this.showPanel(() => openDaily(this, cafe, () => this.refreshHud(), () => this.panelClosed()));
  }

  // ---------- tutorial ----------

  private done(id: string) {
    return save.data.tutorial.includes(id);
  }

  private queueOnce(id: string, steps: TutorialStep[]) {
    if (this.done(id) || this.queued.has(id)) return;
    this.queued.add(id);
    this.tut.queue(steps);
  }

  private queued = new Set<string>();

  private startIntro() {
    if (this.cafe.s.mode !== 'main') return;
    const cafe = this.cafe;
    const firstCoffee = () => cafe.s.customers.find((c) => c.floor === 0 && c.phase === 'wait');
    this.queueOnce('make', [
      {
        id: 'make',
        text: app.t('tut.make'),
        target: () => this.floors[0].machineRect('coffee'),
        done: () => cafe.s.items.coffee.ready > 0 || cafe.s.served > 0,
      },
    ]);
    this.queueOnce('serve', [
      {
        id: 'serve',
        text: app.t('tut.serve'),
        target: () => {
          const c = firstCoffee();
          return c ? this.floors[0].customerRect(c.id) : null;
        },
        done: () => cafe.s.served > 0,
      },
    ]);
  }

  /** Steps that appear when something new shows up (CLAUDE.md 4.2). */
  private checkTriggers() {
    if (this.panel || this.tut.active || this.cafe.s.mode !== 'main' || !this.done('serve')) return;
    const cafe = this.cafe;
    const s = cafe.s;
    if (!this.done('upgrade') && s.coins >= cafe.itemLevelCost('coffee')) {
      this.queueOnce('upgrade', [
        {
          id: 'upgrade',
          text: app.t('tut.upgrade'),
          target: () => {
            this.shop.reveal('item:coffee');
            return this.shop.cardRect('item:coffee');
          },
          done: () => s.items.coffee.level >= 2,
        },
      ]);
      return;
    }
    if (!this.done('tea') && !s.items.tea.unlocked && s.coins >= cafe.item('tea').unlockCost) {
      this.queueOnce('tea', [{ id: 'tea', text: app.t('tut.tea'), target: () => this.floors[0].lockRect('tea'), done: () => s.items.tea.unlocked }]);
      return;
    }
    if (!this.done('adopt') && cafe.staffCount() === 0 && s.coins >= cafe.adoptCost() && this.shop.cardRect('adopt') !== undefined) {
      this.queueOnce('adopt', [
        {
          id: 'adopt',
          text: app.t('tut.adopt'),
          target: () => {
            this.shop.reveal('adopt');
            return this.shop.cardRect('adopt');
          },
          done: () => cafe.staffCount() > 0,
        },
      ]);
      return;
    }
    if (this.done('adopt') && !this.done('helper') && cafe.staffCount() > 0 && !this.panel) {
      this.queueOnce('helper', [{ id: 'helper', text: app.t('tut.helper'), ack: app.t('tut.gotIt') }]);
      return;
    }
    const vip = s.customers.find((c) => c.vip && c.phase === 'wait');
    if (!this.done('vip') && vip) {
      this.queueOnce('vip', [
        {
          id: 'vip',
          text: app.t('tut.vip'),
          target: () => this.floors[vip.floor].customerRect(vip.id),
          done: () => !s.customers.some((c) => c.id === vip.id && c.phase === 'wait'),
          block: false,
        },
      ]);
      return;
    }
    if (!this.done('bakery') && !s.floors[1].open && s.coins >= content.cafe.floors[1].unlockCost) {
      this.queueOnce('bakery', [{ id: 'bakery', text: app.t('tut.bakery'), target: () => this.floors[1].lockRect(), done: () => s.floors[1].open }]);
      return;
    }
    if (!this.done('rush') && this.done('helper') && this.boost()?.id === 'rush' && this.boost()!.wait <= 0 && !this.boost()!.blocked) {
      this.queueOnce('rush', [
        {
          id: 'rush',
          text: app.t('tut.rush'),
          target: () => {
            this.shop.reveal(BOOST_CARD);
            return this.shop.cardRect(BOOST_CARD);
          },
          ack: app.t('tut.gotIt'),
          block: false,
        },
      ]);
    }
  }
}
