import Phaser from 'phaser';
import { app } from '@core';

/**
 * Short message near the bottom of the screen, one at a time. Core's toast (core/ui/toast.ts) puts every
 * message on the same spot, so a VIP, a milestone, a new item, a floor and a star arriving close together
 * landed on top of each other (check 22/10). Here they queue: while another one waits, the message on
 * screen leaves after MIN_MS; at most MAX_WAITING wait (the oldest waiting is dropped), and a message
 * that is already showing or waiting is not added twice. Same look as core's toast, which stays as it is
 * for game #1 (CLAUDE.md 11).
 */
const MIN_MS = 1200;
const MAX_WAITING = 2;
const FADE_MS = 300;

interface Shown {
  box: Phaser.GameObjects.Container;
  message: string;
  shownAt: number;
  leaving: boolean;
  timer: Phaser.Time.TimerEvent | null;
}

interface Queue {
  current: Shown | null;
  waiting: { message: string; durationMs: number }[];
}

const queues = new WeakMap<Phaser.Scene, Queue>();

export function notice(scene: Phaser.Scene, message: string, durationMs = 2200) {
  if (app.clean) return;
  let q = queues.get(scene);
  if (!q) {
    const fresh: Queue = { current: null, waiting: [] };
    queues.set(scene, fresh);
    // A restarted scene starts with an empty queue (its objects and timers are gone).
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => queues.delete(scene));
    q = fresh;
  }
  if ((q.current && !q.current.leaving && q.current.message === message) || q.waiting.some((w) => w.message === message)) return;
  q.waiting.push({ message, durationMs });
  if (q.waiting.length > MAX_WAITING) q.waiting.shift();
  if (!q.current) showNext(scene, q);
  else hurry(scene, q.current, q);
}

function showNext(scene: Phaser.Scene, q: Queue) {
  const item = q.waiting.shift();
  if (!item) {
    q.current = null;
    return;
  }
  const box = build(scene, item.message);
  const shown: Shown = { box, message: item.message, shownAt: scene.time.now, leaving: false, timer: null };
  q.current = shown;
  scene.tweens.add({ targets: box, alpha: 1, y: box.y - 20, duration: 180, ease: 'Cubic.Out' });
  shown.timer = scene.time.delayedCall(q.waiting.length ? MIN_MS : item.durationMs, () => leave(scene, shown, q));
}

/** Another message is waiting: the one on screen leaves once it has been readable for MIN_MS. */
function hurry(scene: Phaser.Scene, shown: Shown, q: Queue) {
  if (shown.leaving) return;
  const left = MIN_MS - (scene.time.now - shown.shownAt);
  const due = shown.timer ? shown.timer.getRemaining() : 0;
  if (shown.timer && due <= left) return;
  shown.timer?.remove(false);
  shown.timer = scene.time.delayedCall(Math.max(0, left), () => leave(scene, shown, q));
}

function leave(scene: Phaser.Scene, shown: Shown, q: Queue) {
  if (shown.leaving) return;
  shown.leaving = true;
  scene.tweens.add({ targets: shown.box, alpha: 0, duration: FADE_MS, onComplete: () => shown.box.destroy() });
  // The next message comes in once this one has faded, so two are never on screen together.
  scene.time.delayedCall(FADE_MS, () => {
    if (q.current !== shown) return;
    q.current = null;
    showNext(scene, q);
  });
}

function build(scene: Phaser.Scene, message: string) {
  const vp = app.viewport.info;
  const theme = app.theme;
  const text = scene.add
    .text(0, 0, message, {
      fontFamily: theme.font,
      fontStyle: '700',
      fontSize: 30,
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: Math.min(vp.width - 80, 900) },
    })
    .setOrigin(0.5);
  const padX = 32;
  const padY = 18;
  const bg = scene.add.graphics();
  bg.fillStyle(0x000000, 0.78);
  bg.fillRoundedRect(-text.width / 2 - padX, -text.height / 2 - padY, text.width + padX * 2, text.height + padY * 2, 28);
  return scene.add.container(vp.width / 2, vp.height - vp.height * 0.14, [bg, text]).setDepth(2000).setAlpha(0);
}
