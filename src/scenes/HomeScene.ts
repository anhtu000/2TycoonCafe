import Phaser from 'phaser';
import { app, BaseScene, Button, formatNumber, icons, setShape, soundButton, type ViewportInfo } from '@core';
import { content } from '../game/content';
import { breakAd, dailyClaimable, mainCafe, openDaily, takeDailyOffer } from '../game/meta';
import game from '../game.json';
import { newRunState } from '../logic/cafe.ts';
import { bookIcon, heartIcon, HEART_COLOR, plantIcon, stopwatchIcon, trophyIcon } from '../render/icons';
import { ANIMAL_ASPECT, animalTexture, roomTexture } from '../render/textures';
import { save } from '../save';
import { showDecor, showRecords, showStaffBook } from '../ui/panels';

/**
 * Home screen for returning players (menu: 'returning'). New players skip it and land in the cafe.
 * Continue, a timed run once the cafe has five stars, the staff book, decor, records, the daily gift.
 */
export class HomeScene extends BaseScene {
  private room!: Phaser.GameObjects.Image;
  private shade!: Phaser.GameObjects.Rectangle;
  private title!: Phaser.GameObjects.Text;
  private heroes: Phaser.GameObjects.Image[] = [];
  private play!: Button;
  private timed: Button | null = null;
  private tiles: Button[] = [];
  private giftBtn!: Button;
  private giftDot!: Phaser.GameObjects.Graphics;
  private soundBtn!: Button;
  private heart!: Phaser.GameObjects.Image;
  private hearts!: Phaser.GameObjects.Text;
  private busy = false;

  constructor() {
    super('Home');
  }

  protected build() {
    app.gameplay.stop();
    this.busy = false;
    this.tiles = [];
    this.heroes = [];
    this.timed = null;
    const font = { fontFamily: app.theme.font, resolution: app.textResolution };
    this.room = this.add.image(0, 0, '__DEFAULT').setOrigin(0);
    this.shade = this.add.rectangle(0, 0, 10, 10, 0x2a1d17, 0.45).setOrigin(0);

    // The player's best helpers wave from the counter.
    const cafe = mainCafe();
    const staff = Object.keys(cafe.s.staff).sort((a, b) => cafe.animalPower(b) - cafe.animalPower(a)).slice(0, 3);
    const shown = staff.length ? staff : ['capybara', 'cat', 'shiba'];
    for (const id of shown) {
      const r = cafe.rarityIndex(cafe.animal(id));
      const img = this.add.image(0, 0, animalTexture(this, id, { staff: r }, 'happy')).setOrigin(0.5, 1);
      this.heroes.push(img);
    }
    this.heroes.forEach((h, i) => this.tweens.add({ targets: h, y: '-=10', duration: 700 + i * 90, yoyo: true, repeat: -1, ease: 'Sine.InOut' }));

    this.title = this.add.text(0, 0, game.title, { ...font, fontStyle: '900', fontSize: 80, color: '#fff3e0', align: 'center' }).setOrigin(0.5);
    this.title.setShadow(0, 6, '#000000aa', 10, false, true);
    let taps: number[] = [];
    if (__TARGET__ === 'web')
      this.title.setInteractive().on('pointerdown', () => {
        const now = performance.now();
        taps = [...taps.filter((t) => now - t < 2000), now];
        if (taps.length >= 5) {
          taps = [];
          app.toggleDebug();
        }
      });

    this.play = new Button(this, 0, 0, { label: app.t('menu.continue'), width: 440, height: 116, fontSize: 48, onClick: () => this.go() });
    this.tweens.add({ targets: this.play, scale: 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    if (save.data.firstFinishMs > 0) {
      this.timed = new Button(this, 0, 0, {
        label: app.t('menu.timed'),
        icon: stopwatchIcon,
        width: 440,
        height: 92,
        fontSize: 34,
        color: app.theme.surface,
        textColor: app.theme.surfaceText,
        onClick: () => this.startTimed(),
      });
    }
    const tile = (label: string, icon: icons.IconDraw, onClick: () => void) => {
      const b = new Button(this, 0, 0, { label, icon, width: 260, height: 84, fontSize: 28, color: app.theme.surface, textColor: app.theme.surfaceText, onClick });
      this.tiles.push(b);
      return b;
    };
    tile(app.t('menu.staff'), bookIcon, () => this.panel(() => showStaffBook(this, mainCafe(), () => (this.busy = false))));
    tile(app.t('menu.decor'), plantIcon, () =>
      this.panel(() =>
        showDecor(
          this,
          () => this.refresh(),
          () => {
            this.busy = false;
            this.refresh();
          },
        ),
      ),
    );
    if (save.data.records.length) tile(app.t('menu.records'), trophyIcon, () => this.panel(() => showRecords(this, null, () => (this.busy = false))));
    this.giftBtn = tile(app.t('menu.daily'), icons.giftIcon, () => this.daily());
    this.giftDot = this.add.graphics();
    this.giftDot.fillStyle(0xff5a6e, 1);
    this.giftDot.fillCircle(0, 0, 12);
    this.giftDot.lineStyle(3, 0xffffff, 1);
    this.giftDot.strokeCircle(0, 0, 12);

    this.soundBtn = soundButton(this, 0, 0, 88);
    this.heart = this.add.image(0, 0, '__DEFAULT');
    setShape(this.heart, 'heart|40', 40, 40, (g) => heartIcon(g, 40, HEART_COLOR));
    this.hearts = this.add.text(0, 0, '', { ...font, fontStyle: '900', fontSize: 36, color: '#ffc2cc' }).setOrigin(1, 0.5);
    this.refresh();
    if (takeDailyOffer()) this.time.delayedCall(350, () => this.daily());
  }

  protected layout(vp: ViewportInfo) {
    const cx = vp.width / 2;
    const s = vp.safe;
    // The coffee floor as a backdrop, filling the screen.
    const rw = Math.max(vp.width, vp.height * 1.6);
    this.room.setTexture(roomTexture(this, 'coffee', rw / 2, (vp.height / 2) | 0, [])).setDisplaySize(rw, vp.height).setPosition((vp.width - rw) / 2, 0);
    this.shade.setSize(vp.width, vp.height);
    this.soundBtn.setPosition(s.x + 56, s.y + 56);
    this.hearts.setPosition(vp.width - s.x - 24, s.y + 56);
    this.heart.setPosition(this.hearts.x - this.hearts.width - 30, s.y + 56);
    const placeTiles = (x: number, y: number, rowH: number) =>
      this.tiles.forEach((b, i) => {
        const alone = i === this.tiles.length - 1 && i % 2 === 0;
        b.setPosition(alone ? x : x + (i % 2 ? 140 : -140), y + Math.floor(i / 2) * rowH);
      });
    const rows = Math.ceil(this.tiles.length / 2);
    const hero = (x: number, y: number, size: number) =>
      this.heroes.forEach((h, i) => {
        const n = this.heroes.length;
        h.setDisplaySize(size / ANIMAL_ASPECT, size).setPosition(x + (i - (n - 1) / 2) * size * 0.8, y);
      });
    if (vp.portrait) {
      const y0 = s.y + s.height * 0.1;
      this.title.setFontSize(72).setWordWrapWidth(s.width - 80).setPosition(cx, y0 + 50);
      hero(cx, y0 + 420, 220);
      this.play.setPosition(cx, y0 + 540);
      this.timed?.setPosition(cx, y0 + 660);
      placeTiles(cx, y0 + (this.timed ? 790 : 690), 104);
    } else {
      const leftX = s.x + s.width * 0.28;
      this.title.setFontSize(76).setWordWrapWidth(s.width * 0.5).setPosition(leftX, s.y + 140);
      hero(leftX, s.y + 560, 230);
      const rightX = s.x + s.width * 0.72;
      const blockH = 116 + (this.timed ? 118 : 0) + 30 + rows * 100;
      const top = s.y + (s.height - blockH) / 2 + 58;
      this.play.setPosition(rightX, top);
      this.timed?.setPosition(rightX, top + 118);
      placeTiles(rightX, top + (this.timed ? 118 : 0) + 136, 100);
    }
    this.giftDot.setPosition(this.giftBtn.x + 118, this.giftBtn.y - 34);
  }

  private refresh() {
    this.hearts.setText(formatNumber(save.data.hearts));
    this.giftDot.setVisible(dailyClaimable());
    if (this.vp) this.layout(this.vp);
  }

  private panel(open: () => void) {
    if (this.busy) return;
    this.busy = true;
    open();
  }

  /** Continue always opens the main cafe; a timed run left open is dropped. */
  private async go() {
    if (this.busy) return;
    this.busy = true;
    if (save.data.mode === 'timed') {
      save.data.mode = 'main';
      save.data.timed = null;
      save.flush();
    }
    await breakAd('navigation');
    this.scene.start('Play');
  }

  private async startTimed() {
    if (this.busy) return;
    this.busy = true;
    if (save.data.mode === 'main') save.data.mainLeftAt = Date.now();
    save.data.timed = newRunState(content, 'timed', app.rng.int(1, 2 ** 31 - 1));
    save.data.mode = 'timed';
    save.flush();
    await breakAd('navigation');
    this.scene.start('Play');
  }

  private daily() {
    this.panel(() =>
      openDaily(
        this,
        null,
        () => this.refresh(),
        () => {
          this.busy = false;
          this.refresh();
        },
      ),
    );
  }
}
