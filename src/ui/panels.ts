import Phaser from 'phaser';
import { app, Button, burst, formatClock, formatNumber, Panel, rewardButton, setShape, toast, type icons } from '@core';
import type { AdoptResult, Cafe } from '../logic/cafe.ts';
import { decorContent, content } from '../game/content';
import { coinIcon, starIcon } from '../render/icons';
import { ANIMAL_ASPECT, animalTexture, decorTexture, RARITY_CSS, RARITY_HEX, silhouetteTexture } from '../render/textures';
import { save, type RunRecord } from '../save';

// Modal windows of the game: adoption reveal, staff book, menu, decor, records, finish.

const font = () => ({ fontFamily: app.theme.font, resolution: app.textResolution });

function label(scene: Phaser.Scene, x: number, y: number, text: string, size: number, color = '#ffffff', weight: '700' | '900' = '900') {
  return scene.add.text(x, y, text, { ...font(), fontStyle: weight, fontSize: size, color, align: 'center' }).setOrigin(0.5);
}

/** Soft glow disc behind a revealed animal, in its rarity colour. */
function glow(scene: Phaser.Scene, x: number, y: number, r: number, color: number) {
  const img = scene.add.image(x, y, '__DEFAULT');
  setShape(img, `glow|${r}|${color}`, r * 2, r * 2, (g) => {
    for (let i = 10; i >= 1; i--) {
      g.fillStyle(color, 0.05 + (10 - i) * 0.012);
      g.fillCircle(0, 0, (r * i) / 10);
    }
  });
  return img;
}

function perkText(cafe: Cafe, id: string) {
  const a = cafe.animal(id);
  const lvl = cafe.s.staff[id] ?? 1;
  if (a.perk === 'tips') return app.t('perk.tips', { n: Math.round((cafe.animalTips(id, lvl) - 1) * 100) });
  return app.t('perk.speed', { n: Math.round((a.perkValue - 1) * 100) });
}

/** "1 in 67" for a probability. */
function oneIn(p: number) {
  if (p <= 0) return '-';
  const n = 1 / p;
  return n < 10 ? n.toFixed(1) : formatNumber(Math.round(n));
}

/** The adopted animal pops in, with its rarity, odds and where it works. */
export function showAdoptReveal(scene: Phaser.Scene, cafe: Cafe, r: AdoptResult, onClose?: () => void): Panel {
  // Wide enough that a long title ("¡Nuevo ayudante!") stays clear of the close button.
  const panel = new Panel(scene, { title: r.isNew ? app.t('adopt.title') : app.t('adopt.levelUp'), width: 640, height: 760, onClose });
  const rarity = cafe.content.staff.rarities[r.rarity];
  const color = RARITY_HEX[r.rarity];
  const y0 = panel.top + 170;
  const halo = glow(scene, 0, y0, 170, color);
  const pic = scene.add.image(0, y0 + 120, animalTexture(scene, r.animal.id, { staff: r.rarity }, 'happy')).setOrigin(0.5, 1);
  pic.setDisplaySize(250 / ANIMAL_ASPECT, 250);
  const name = label(scene, 0, y0 + 160, app.t(`animal.${r.animal.id}`), 46);
  const odds = cafe.adoptOdds()[r.rarity];
  // Gift animals (7-day gift) are not in the adoption roll: say where they come from instead of odds.
  const rollable = cafe.content.staff.animals.filter((a) => a.rarity === rarity.id && !a.exclusive).length;
  const rarText = r.animal.exclusive
    ? app.t('adopt.gift', { r: app.t(`rarity.${rarity.id}`) })
    : app.t('adopt.odds', { r: app.t(`rarity.${rarity.id}`), n: oneIn(odds / rollable) });
  const rar = label(scene, 0, y0 + 210, rarText, 30, RARITY_CSS[r.rarity]);
  const station = Object.entries(cafe.s.assign).find(([, a]) => a === r.animal.id)?.[0];
  const lines = [
    r.refund > 0 ? app.t('adopt.maxed', { n: formatNumber(r.refund) }) : r.isNew ? perkText(cafe, r.animal.id) : `${app.t('book.level', { n: r.level })} · ${app.t('perk.base', { n: cafe.animalSpeed(r.animal.id).toFixed(2) })}`,
    station ? app.t('adopt.worksAt', { item: app.t(`item.${station}`) }) : app.t('adopt.resting'),
  ];
  const info = label(scene, 0, y0 + 262, lines.join('\n'), 26, '#e9d8c8', '700').setLineSpacing(6);
  const ok = new Button(scene, 0, panel.panelHeight / 2 - 70, { label: app.t('adopt.ok'), width: 300, height: 88, onClick: () => panel.close() });
  panel.content.add([halo, pic, name, rar, info, ok]);
  // Pop in.
  pic.setScale(pic.scaleX * 0.2, pic.scaleY * 0.2);
  scene.tweens.add({ targets: pic, scaleX: pic.scaleX * 5, scaleY: pic.scaleY * 5, duration: 420, ease: 'Back.Out' });
  scene.tweens.add({ targets: halo, angle: 360, duration: 9000, repeat: -1 });
  if (r.rarity >= 2) {
    scene.time.delayedCall(200, () => burst(scene, app.viewport.info.width / 2, app.viewport.info.height / 2 + y0, color, 40, 620));
    app.audio.play('reward');
  }
  return panel;
}

/** Every animal: met ones in colour with level and perk, others as silhouettes; odds and pity on top. */
export function showStaffBook(scene: Phaser.Scene, cafe: Cafe | null, onClose?: () => void): Panel {
  const vp = app.viewport.info;
  // Landscape: two rows at most, so the book fits a 16:9 frame.
  const cols = vp.portrait ? 3 : Math.min(6, Math.max(5, Math.ceil(content.staff.animals.length / 2)));
  const rows = Math.ceil(content.staff.animals.length / cols);
  const cellW = 190;
  const cellH = 220;
  const panel = new Panel(scene, { title: app.t('book.title'), width: cols * cellW + 60, height: 230 + rows * cellH + 30, onClose });
  const total = content.staff.rarities.reduce((a, b) => a + b.weight, 0);
  const odds = content.staff.rarities.map((r) => {
    const pct = (r.weight / total) * 100;
    return `${app.t(`rarity.${r.id}`)} ${pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%`;
  });
  const head = label(scene, 0, panel.top + 4, `${app.t('book.odds')}: ${odds.join(' · ')}`, 22, '#e9d8c8', '700').setWordWrapWidth(panel.panelWidth - 60);
  const pity = cafe
    ? label(scene, 0, panel.top + 52, `${app.t('book.pityEpic', { n: cafe.pityLeft(0) })} · ${app.t('book.pityLegend', { n: cafe.pityLeft(1) })}`, 22, '#cfe9ff', '700')
    : null;
  panel.content.add(head);
  if (pity) panel.content.add(pity);
  const x0 = -((cols - 1) * cellW) / 2;
  const yTop = panel.top + 100;
  content.staff.animals.forEach((a, i) => {
    const cx = x0 + (i % cols) * cellW;
    const cy = yTop + Math.floor(i / cols) * cellH;
    const rIdx = content.staff.rarities.findIndex((r) => r.id === a.rarity);
    const met = (save.data.book[a.id] ?? 0) > 0 || (cafe?.s.staff[a.id] ?? 0) > 0;
    const level = cafe?.s.staff[a.id] ?? 0;
    const card = scene.add.image(cx, cy + cellH / 2 - 10, '__DEFAULT');
    setShape(card, `bookcard|${cellW}|${cellH}|${rIdx}|${met}`, cellW - 14, cellH - 14, (g) => {
      g.fillStyle(met ? 0x5a3a2a : 0x2e2019, 1);
      g.fillRoundedRect(-(cellW - 14) / 2, -(cellH - 14) / 2, cellW - 14, cellH - 14, 18);
      g.lineStyle(4, RARITY_HEX[rIdx], met ? 1 : 0.5);
      g.strokeRoundedRect(-(cellW - 14) / 2, -(cellH - 14) / 2, cellW - 14, cellH - 14, 18);
    });
    const pic = scene.add.image(cx, cy + 128, met ? animalTexture(scene, a.id, { staff: rIdx }, 'neutral') : silhouetteTexture(scene, a.id)).setOrigin(0.5, 1);
    pic.setDisplaySize(118 / ANIMAL_ASPECT, 118);
    const name = label(scene, cx, cy + 150, met ? app.t(`animal.${a.id}`) : app.t('book.unknown'), 24);
    const sub = label(scene, cx, cy + 180, level > 0 ? app.t('book.level', { n: level }) : a.exclusive && !met ? app.t('book.daily7') : app.t(`rarity.${a.rarity}`), 20, RARITY_CSS[rIdx], '700');
    panel.content.add([card, pic, name, sub]);
  });
  return panel;
}

export interface MenuEntry {
  label: string;
  icon?: icons.IconDraw;
  onClick: () => void;
  badge?: boolean;
}

/**
 * List of places to go. Each entry closes the menu first. When one column does not fit the screen
 * (landscape with many entries), the entries go in two columns.
 */
export function showGameMenu(scene: Phaser.Scene, entries: MenuEntry[], onClose?: () => void, title = app.t('menu.title')): Panel {
  const rowH = 88;
  const vp = app.viewport.info;
  const cols = 120 + entries.length * rowH + 40 > vp.height - 80 ? 2 : 1;
  const rows = Math.ceil(entries.length / cols);
  const colW = 450;
  const panel = new Panel(scene, { title, width: cols === 2 ? colW * 2 + 60 : 540, height: 120 + rows * rowH + 40, onClose });
  entries.forEach((e, i) => {
    const col = cols === 2 ? Math.floor(i / rows) : 0;
    const x = cols === 2 ? (col - 0.5) * colW : 0;
    const y = panel.top + rowH / 2 - 10 + (i % rows) * rowH;
    const b = new Button(scene, x, y, {
      label: e.label,
      icon: e.icon,
      width: 420,
      height: 74,
      fontSize: 30,
      color: app.theme.surface,
      textColor: app.theme.surfaceText,
      onClick: () => {
        panel.close();
        e.onClick();
      },
    });
    panel.content.add(b);
    if (e.badge) {
      const dot = scene.add.graphics();
      dot.fillStyle(0xff5a6e, 1);
      dot.fillCircle(x + 196, y - 28, 11);
      dot.lineStyle(3, 0xffffff, 1);
      dot.strokeCircle(x + 196, y - 28, 11);
      panel.content.add(dot);
    }
  });
  return panel;
}

/**
 * Decorations: bought with the cafe's coins (one currency, Poki guide 7.1), or one unlocked with a
 * rewarded ad ("customisation" reward). Each sits in its spot of a floor and adds a little to tips.
 */
export function showDecor(scene: Phaser.Scene, cafe: Cafe, onChange: () => void, onClose?: () => void): Panel {
  const items = decorContent.items;
  const vp = app.viewport.info;
  const cols = vp.portrait ? 2 : 4;
  const rowH = 96;
  const cellW = vp.portrait ? 330 : 290;
  const rows = Math.ceil(items.length / cols);
  const panel = new Panel(scene, { title: app.t('decor.title'), width: cols * cellW + 60, height: 320 + rows * rowH, onClose });
  const info = label(scene, 0, panel.top - 10, app.t('decor.info'), 24, '#e9d8c8', '700');
  panel.content.add(info);
  const buttons: { id: string; b: Button }[] = [];
  const owned = (id: string) => save.data.decor.includes(id);
  const give = (id: string) => {
    save.data.decor.push(id);
    save.flush();
    const it = items.find((i) => i.id === id)!;
    toast(scene, `${app.t(`decor.${id}`)}: ${app.t(`floor.${it.floor}`)}`);
    onChange();
    refresh();
  };
  /** Cheapest decoration not owned yet: what the free (ad) unlock gives. */
  const nextFree = () => items.filter((i) => !owned(i.id)).sort((a, b) => a.price - b.price)[0] ?? null;
  let ad: Button | null = null;
  const refresh = () => {
    for (const { id, b } of buttons) {
      const price = items.find((i) => i.id === id)!.price;
      b.setLabel(owned(id) ? `${app.t(`decor.${id}`)} ✓` : `${app.t(`decor.${id}`)}  ${formatNumber(price)}`);
      b.setEnabled(!owned(id) && cafe.s.coins >= price);
      if (owned(id)) b.setAlpha(0.75);
    }
    const next = nextFree();
    if (ad) {
      ad.setVisible(!!next && app.ads.rewardedAvailable && !app.clean);
      if (next) ad.setLabel(app.t('decor.ad', { item: app.t(`decor.${next.id}`) }));
    }
  };
  const x0 = -((cols - 1) * cellW) / 2;
  items.forEach((it, i) => {
    const cx = x0 + (i % cols) * cellW;
    const cy = panel.top + 64 + Math.floor(i / cols) * rowH;
    const pic = scene.add.image(cx - cellW / 2 + 46, cy, decorTexture(scene, it.id, it.slot)).setDisplaySize(72, 72);
    const b = new Button(scene, cx + 34, cy, {
      label: '',
      icon: coinIcon,
      width: cellW - 96,
      height: 76,
      fontSize: 22,
      color: app.theme.surface,
      textColor: app.theme.surfaceText,
      onClick: () => {
        if (owned(it.id) || cafe.s.coins < it.price) return;
        cafe.s.coins -= it.price;
        app.audio.play('buy');
        give(it.id);
      },
    });
    buttons.push({ id: it.id, b });
    panel.content.add([pic, b]);
  });
  // Plain button and the rewarded one side by side, same size (Poki guide 7.2).
  const yB = panel.panelHeight / 2 - 66;
  const close = new Button(scene, -170, yB, {
    label: app.t('core.close'),
    width: 320,
    height: 84,
    fontSize: 28,
    color: app.theme.surface,
    textColor: app.theme.surfaceText,
    onClick: () => panel.close(),
  });
  ad = rewardButton(scene, 170, yB, {
    label: '',
    width: 320,
    height: 84,
    fontSize: 24,
    onReward: () => {
      const next = nextFree();
      if (!next) return;
      app.audio.play('reward');
      give(next.id);
    },
  });
  panel.content.add([close, ad]);
  refresh();
  return panel;
}

export function showRecords(scene: Phaser.Scene, highlight: number | null, onClose?: () => void): Panel {
  const rec = save.data.records;
  const panel = new Panel(scene, { title: app.t('records.title'), width: 520, height: 220 + Math.max(1, rec.length) * 64, onClose });
  if (!rec.length) panel.content.add(label(scene, 0, panel.top + 40, app.t('records.empty'), 26, '#e9d8c8', '700'));
  rec.forEach((r, i) => {
    const y = panel.top + 30 + i * 64;
    const row = label(scene, -60, y, app.t('records.row', { i: i + 1, t: formatClock(r.ms / 1000) }), 34, i === highlight ? '#ffd34d' : '#ffffff');
    const best = scene.add.image(120, y, animalTexture(scene, bestAnimal(r), { staff: r.best }, 'happy')).setOrigin(0.5, 0.6);
    best.setDisplaySize(56 / ANIMAL_ASPECT, 56);
    const day = label(scene, 190, y, r.day.slice(5), 22, '#b8957c', '700');
    panel.content.add([row, best, day]);
  });
  return panel;
}

function bestAnimal(r: RunRecord) {
  const id = content.staff.rarities[r.best]?.id ?? 'common';
  return content.staff.animals.find((a) => a.rarity === id)?.id ?? 'capybara';
}

/** Five stars. Main cafe: keep playing or try a timed run. Timed run: records. */
export function showFinish(
  scene: Phaser.Scene,
  cafe: Cafe,
  opts: { ms: number; rank: number | null; first: boolean; onKeep: () => void; onTimed: () => void; onBack?: () => void },
): Panel {
  const timed = cafe.s.mode === 'timed';
  const panel = new Panel(scene, { title: timed ? app.t('finish.timedTitle') : app.t('finish.title'), width: 600, height: 700, closable: false });
  const stars = [0, 1, 2, 3, 4].map((i) => {
    const img = scene.add.image(-160 + i * 80, panel.top + 30, '__DEFAULT');
    setShape(img, 'star|64', 64, 64, (g) => starIcon(g, 64, 0xffd34d));
    img.setScale(0);
    scene.tweens.add({ targets: img, scale: img.scaleX || 1, delay: 120 * i, duration: 300, ease: 'Back.Out' });
    return img;
  });
  stars.forEach((s) => s.setScale(0));
  stars.forEach((s, i) => scene.tweens.add({ targets: s, scale: 1, delay: 120 * i, duration: 300, ease: 'Back.Out' }));
  const lines = [
    app.t('finish.time', { t: formatClock(opts.ms / 1000) }),
    app.t('finish.served', { n: formatNumber(cafe.s.served) }),
    app.t('finish.staff', { n: Object.keys(cafe.s.staff).length, m: cafe.content.staff.animals.length }),
  ];
  if (timed) lines.push(opts.rank === 0 ? app.t('finish.newBest') : app.t('finish.best', { t: formatClock(save.data.bestRunMs / 1000) }));
  const body = label(scene, 0, panel.top + 170, lines.join('\n'), 32, '#ffffff', '700').setLineSpacing(10);
  panel.content.add([...stars, body]);
  if (opts.first && !timed) panel.content.add(label(scene, 0, panel.top + 320, app.t('finish.firstNote'), 26, '#ffd34d', '700').setWordWrapWidth(520));
  const yB = panel.panelHeight / 2 - 80;
  const left = new Button(scene, -140, yB, {
    label: timed ? app.t('finish.back') : app.t('finish.keep'),
    width: 260,
    height: 88,
    fontSize: 28,
    color: app.theme.surface,
    textColor: app.theme.surfaceText,
    onClick: () => {
      panel.close();
      (timed ? (opts.onBack ?? opts.onKeep) : opts.onKeep)();
    },
  });
  const right = new Button(scene, 140, yB, {
    label: timed ? app.t('finish.again') : app.t('finish.timed'),
    width: 260,
    height: 88,
    fontSize: 28,
    onClick: () => {
      panel.close();
      opts.onTimed();
    },
  });
  panel.content.add([left, right]);
  burst(scene, app.viewport.info.width / 2, app.viewport.info.height / 2 + panel.top + 30, 0xffd34d, 40, 600);
  return panel;
}
