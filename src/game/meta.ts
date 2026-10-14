import Phaser from 'phaser';
import { app, dailyDayIndex, dailyStatus, formatNumber, Panel, showDailyPanel, toast } from '@core';
import { Cafe, newRunState } from '../logic/cafe.ts';
import { decorTipMult } from '../logic/decor.ts';
import { coinIcon, COIN_COLOR, pawIcon } from '../render/icons';
import { preset, save } from '../save';
import { PRESETS } from './presets';

/**
 * Our own ad timers (boost cooldowns, gap between midgame ads). Poki manages ad frequency itself and
 * asks games not to add timers (Poki guide 7.1), so the Poki build has none. Other portals keep them.
 */
export const AD_TIMERS = __TARGET__ !== 'poki';
import { content, decorContent } from './content';

// Things around the runs, shared by the play screen and the home screen.

/** The main cafe (created on first use). */
export function mainCafe(): Cafe {
  // Test presets exist in the web build only (Poki: no dev presets in the portal build).
  if (__TARGET__ === 'web' && !save.data.run && preset && PRESETS[preset]) PRESETS[preset]();
  if (!save.data.run) save.data.run = newRunState(content, 'main', app.rng.int(1, 2 ** 31 - 1));
  const cafe = new Cafe(content, save.data.run);
  cafe.extraTips = decorTipMult(decorContent, save.data.decor);
  return cafe;
}

/** Remembers every animal ever adopted, at its best level (staff book). */
export function noteAnimal(id: string, level: number) {
  save.data.book[id] = Math.max(save.data.book[id] ?? 0, level);
}

export function dailyClaimable(): boolean {
  return dailyStatus(save.data.daily).canClaim;
}

let dailyOffered = false;
/** The daily gift opens by itself once per session, on whichever screen comes first. */
export function takeDailyOffer(): boolean {
  if (dailyOffered || !dailyClaimable()) return false;
  dailyOffered = true;
  return true;
}

/** 7-day gift: minutes of income for the main cafe and free helpers. */
export function openDaily(scene: Phaser.Scene, onScreen: Cafe | null, onClaimed?: () => void, onClose?: () => void): Panel {
  const days = content.cafe.daily;
  const views = days.map((d) =>
    d.ticket
      ? { label: app.t('daily.ticket'), icon: pawIcon, iconColor: 0xffd34d }
      : { label: app.t('daily.coins', { n: d.coinsMin ?? 0 }), icon: coinIcon, iconColor: COIN_COLOR },
  );
  return showDailyPanel(scene, {
    state: save.data.daily,
    rewards: views,
    adMultiplier: content.cafe.rewarded.dailyMult,
    onClaim: (i, mult, next) => {
      save.data.daily = next;
      const d = days[i];
      const parts: string[] = [];
      if (d.ticket) {
        save.data.tickets += d.ticket * mult;
        parts.push(app.t('toast.ticket'));
      }
      if (d.coinsMin) {
        const cafe = onScreen && onScreen.s.mode === 'main' ? onScreen : mainCafe();
        const coins = Math.max(50, Math.round(Math.max(cafe.s.rate, 1) * 60 * d.coinsMin * mult));
        cafe.addCoins(coins, false);
        parts.push(`+${formatNumber(coins)}`);
      }
      save.flush();
      if (parts.length) toast(scene, parts.join('  '));
      onClaimed?.();
    },
    onClose,
  });
}

export function dailyToday() {
  return dailyDayIndex(save.data.daily, content.cafe.daily.length);
}

/**
 * Midgame ad at a natural break. Poki wants a commercialBreak before gameplay starts again
 * (opening a floor, coming back from the menu); CrazyGames forbids one on navigation buttons,
 * so those only run on Poki. The finish screen is a break on every portal.
 */
export async function breakAd(kind: 'navigation' | 'milestone' | 'finish'): Promise<void> {
  if (kind !== 'finish' && app.platform.id !== 'poki') return;
  await app.ads.midgame();
}

/** Seconds of cooldown for a boost, longer when rewards come without ads (CLAUDE.md 3). */
export function boostCooldown(base = content.cafe.rewarded.cooldown) {
  if (!AD_TIMERS) return 0;
  return base * (app.ads.rewardsAreFree ? 1.5 : 1);
}
