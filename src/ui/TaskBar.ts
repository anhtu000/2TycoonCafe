import Phaser from 'phaser';
import { app, formatNumber, punch, setShape } from '@core';
import { COIN_COLOR, coinIcon, taskIcon } from '../render/icons';

/** What the bar shows: the current short task (CLAUDE.md 5a), or nothing. */
export interface TaskView {
  /** Task line, for example "Coffee to Lv 25". */
  text: string;
  have: number;
  need: number;
  /** Coins it pays now. */
  reward: number;
  done: boolean;
}

/**
 * One short task at a time, with its progress and reward: a short-term goal next to the stars
 * (Poki guide 8). Tapping a done task claims it; tapping an open one points to where to do it.
 * Phone: second row of the top bar. Desktop: top of the shop column.
 */
export class TaskBar {
  private scene: Phaser.Scene;
  private box: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image;
  private icon: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private count: Phaser.GameObjects.Text;
  private bar: Phaser.GameObjects.Graphics;
  private coin: Phaser.GameObjects.Image;
  private reward: Phaser.GameObjects.Text;
  private w = 600;
  private h = 60;
  private view: TaskView | null = null;
  private look = '';
  private text = '';

  constructor(scene: Phaser.Scene, onTap: () => void) {
    this.scene = scene;
    const font = { fontFamily: app.theme.font, resolution: app.textResolution };
    this.glow = scene.add.image(0, 0, '__DEFAULT').setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.bg = scene.add.image(0, 0, '__DEFAULT');
    this.icon = scene.add.image(0, 0, '__DEFAULT');
    this.label = scene.add.text(0, 0, '', { ...font, fontStyle: '900', fontSize: 24, color: '#fff3e0' }).setOrigin(0, 0.5);
    this.count = scene.add.text(0, 0, '', { ...font, fontStyle: '800', fontSize: 20, color: '#e3cbb8' }).setOrigin(1, 0.5);
    this.bar = scene.add.graphics();
    this.coin = scene.add.image(0, 0, '__DEFAULT');
    this.reward = scene.add.text(0, 0, '', { ...font, fontStyle: '900', fontSize: 24, color: '#ffd166' }).setOrigin(0, 0.5);
    this.box = scene.add.container(0, 0, [this.glow, this.bg, this.icon, this.label, this.count, this.bar, this.coin, this.reward]).setDepth(33);
    this.box.setSize(this.w, this.h).setInteractive({ useHandCursor: true });
    this.box.on('pointerup', () => onTap());
    setShape(this.coin, 'coin|26', 26, 26, (g) => coinIcon(g, 26, COIN_COLOR));
    this.box.setVisible(false);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this));
  }

  /** Center of the bar, for effects. */
  get center() {
    return { x: this.box.x, y: this.box.y };
  }

  layout(x: number, y: number, w: number, h: number) {
    this.w = w;
    this.h = h;
    this.box.setPosition(x + w / 2, y + h / 2).setSize(w, h);
    (this.box.input!.hitArea as Phaser.Geom.Rectangle).setTo(0, 0, w, h);
    this.look = '';
    this.text = '';
    this.draw();
  }

  /** New state (called on every HUD refresh; redraws only what changed). */
  show(view: TaskView | null) {
    this.view = view;
    this.box.setVisible(!!view);
    if (view) this.draw();
  }

  /** The task just got done: a little bounce and a sound. */
  ping() {
    punch(this.scene, this.box, 0.08, 260);
    app.audio.play('pop', { volume: 0.7 });
  }

  /** A new task slid in after a claim. */
  enter() {
    this.box.setAlpha(0);
    this.scene.tweens.add({ targets: this.box, alpha: 1, duration: 260, delay: 120 });
  }

  /** Not done yet: a small shake. */
  shake() {
    const x = this.box.x;
    this.scene.tweens.add({ targets: this.box, x: x + 8, duration: 50, yoyo: true, repeat: 2, onComplete: () => this.box.setX(x) });
  }

  private draw() {
    const v = this.view;
    if (!v) return;
    const { w, h } = this;
    const done = v.done;
    const look = `${w}|${h}|${done}`;
    if (look !== this.look) {
      this.look = look;
      const fill = done ? 0x6a4a1a : 0x4a3228;
      const line = done ? 0xffc23d : 0x7a5a48;
      setShape(this.bg, `taskbar|${look}`, w, h, (g) => {
        g.fillStyle(fill, 0.96);
        g.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
        g.lineStyle(3, line, 1);
        g.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      });
      setShape(this.glow, `taskglow|${w}|${h}`, w + 16, h + 16, (g) => {
        g.lineStyle(10, 0xffc23d, 0.35);
        g.strokeRoundedRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, h / 2 + 4);
      }, 10);
      const is = Math.round(Math.min(h * 0.62, 40));
      setShape(this.icon, `taskicon|${is}|${done}`, is, is, (g) => taskIcon(g, is, done ? 0xffd166 : 0xe3cbb8));
      this.icon.setPosition(-w / 2 + 14 + is / 2, 0);
      this.label.setPosition(-w / 2 + 28 + is, 0);
      this.text = '';
    }
    // Wide bar (phone top bar): one row, the reward on the right.
    // Narrow bar (desktop shop column): two rows, task and count on top, progress and reward below,
    // so the task line keeps a readable size.
    const twoRows = w < h * 7;
    const pad = h * 0.36;
    const rowY = twoRows ? -h * 0.2 : -h * 0.13;
    const lowY = twoRows ? h * 0.22 : 0;
    // Reward: "+1.2K" with a coin, or "Claim +1.2K" when done.
    const reward = done ? `${app.t('task.claim')}  +${formatNumber(v.reward)}` : `+${formatNumber(v.reward)}`;
    const text = `${v.text}|${v.have}|${v.need}|${reward}|${twoRows}`;
    if (text === this.text) return;
    this.text = text;
    this.coin.setPosition(w / 2 - pad - 13, lowY);
    this.reward.setText(reward).setColor(done ? '#ffe9a8' : '#ffd166').setFontSize(twoRows ? 22 : 24);
    this.reward.setOrigin(1, 0.5).setPosition(this.coin.x - 20, lowY);
    const left = this.label.x;
    const rewardLeft = this.reward.x - this.reward.width - 14;
    const rowRight = twoRows ? w / 2 - pad : rewardLeft;
    const showCount = v.need > 1 && !done;
    this.count.setVisible(showCount);
    // One row: the count ends the task line. Two rows: it sits on the second row, before the reward.
    if (showCount)
      this.count
        .setText(`${formatNumber(Math.min(v.have, v.need))}/${formatNumber(v.need)}`)
        .setFontSize(twoRows ? 18 : 20)
        .setPosition(twoRows ? rewardLeft : rowRight, twoRows ? lowY : rowY);
    this.label.setText(v.text).setScale(1).setY(rowY);
    const room = rowRight - (showCount && !twoRows ? this.count.width + 10 : 0) - left;
    if (this.label.width > room) this.label.setScale(Math.max(0.55, room / this.label.width));
    // Progress: a thin bar (under the task line, or before the count and reward on two rows).
    const barRight = twoRows ? rewardLeft - (showCount ? this.count.width + 12 : 0) : rowRight;
    const barW = Math.max(40, barRight - left);
    const barY = twoRows ? lowY - 4 : h * 0.2;
    const p = Phaser.Math.Clamp(v.need > 0 ? v.have / v.need : 0, 0, 1);
    this.bar.clear();
    this.bar.fillStyle(0xffffff, 0.14);
    this.bar.fillRoundedRect(left, barY, barW, 8, 4);
    this.bar.fillStyle(done ? 0xffd166 : 0x9ad36a, 1);
    this.bar.fillRoundedRect(left, barY, Math.max(8, barW * p), 8, 4);
  }

  private tick() {
    const on = !!this.view?.done && this.box.visible;
    this.glow.setVisible(on);
    if (on) this.glow.setAlpha(0.5 + 0.45 * Math.sin(this.scene.time.now / 170));
  }
}
