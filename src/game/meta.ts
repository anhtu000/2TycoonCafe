import Phaser from 'phaser';
import { app, dailyDayIndex, dailyStatus, dayKey, formatNumber, Panel, showDailyPanel, type DailyState } from '@core';
import { Cafe, newRunState, type AdoptResult } from '../logic/cafe.ts';
import { pausedStreak } from '../logic/daily.ts';
import { decorTipMult } from '../logic/decor.ts';
import { coinIcon, COIN_COLOR, foxIcon, pawIcon } from '../render/icons';
import { RARITY_HEX } from '../render/textures';
import { preset, save } from '../save';
import { notice } from '../ui/notice';
import { measure } from './measure';
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

/**
 * The 7-day gift state as core reads it. In this game a missed day pauses the streak instead of sending it
 * back to day 1 (CLAUDE.md 5a); core keeps the shared rule for game #1.
 */
export function dailyState(): DailyState {
  return pausedStreak(save.data.daily, dayKey());
}

export function dailyClaimable(): boolean {
  return dailyStatus(dailyState()).canClaim;
}

let dailyOffered = false;
/** The daily gift opens by itself once per session, on whichever screen comes first. */
export function takeDailyOffer(): boolean {
  if (dailyOffered || !dailyClaimable()) return false;
  dailyOffered = true;
  return true;
}

/**
 * 7-day gift: minutes of income for the main cafe, free helpers, a Rare pal on day 3 and the Snow Fox on day 7
 * (CLAUDE.md 5a, retention batch 1). The tiles show the big days ahead, so players know what they come back for.
 * onGift: animals the gift brought (the play screen shows each one).
 */
export function openDaily(
  scene: Phaser.Scene,
  onScreen: Cafe | null,
  onClaimed?: () => void,
  onClose?: () => void,
  onGift?: (gifts: AdoptResult[], cafe: Cafe) => void,
): Panel {
  const days = content.cafe.daily;
  // Tiles use short names (daily.fox, daily.rarePal): full animal names are too long for a tile in some languages.
  const fox = (id: string) => id === 'snowfox';
  const views = days.map((d) =>
    d.animal
      ? { label: fox(d.animal) ? app.t('daily.fox') : app.t(`animal.${d.animal}`), icon: fox(d.animal) ? foxIcon : pawIcon, iconColor: 0xeaf4ff }
      : d.rarePal
        ? { label: app.t('daily.rarePal'), icon: pawIcon, iconColor: RARITY_HEX[1] }
        : d.ticket
          ? { label: app.t('daily.ticket'), icon: pawIcon, iconColor: 0xffd34d }
          : { label: app.t('daily.coins', { n: d.coinsMin ?? 0 }), icon: coinIcon, iconColor: COIN_COLOR },
  );
  return showDailyPanel(scene, {
    state: dailyState(),
    rewards: views,
    adMultiplier: content.cafe.rewarded.dailyMult,
    onClaim: (i, mult, next) => {
      save.data.daily = next;
      measure('daily', i + 1, mult > 1 ? 'claim-x2' : 'claim');
      const d = days[i];
      const parts: string[] = [];
      if (d.ticket) {
        save.data.tickets += d.ticket * mult;
        parts.push(app.t('toast.ticket'));
      }
      const cafe = onScreen && onScreen.s.mode === 'main' ? onScreen : mainCafe();
      if (d.coinsMin) {
        const coins = Math.max(50, Math.round(Math.max(cafe.s.rate, 1) * 60 * d.coinsMin * mult));
        cafe.addCoins(coins, false);
        parts.push(`+${formatNumber(coins)}`);
      }
      // Animals: x2 (ad) gives two copies.
      const gifts: AdoptResult[] = [];
      for (let k = 0; k < (d.rarePal ?? 0) * mult; k++) gifts.push(cafe.giftRarePal());
      if (d.animal) for (let k = 0; k < mult; k++) gifts.push(cafe.giftAnimal(d.animal));
      for (const g of gifts) noteAnimal(g.animal.id, g.level);
      const last = gifts[gifts.length - 1];
      if (last) parts.push(last.isNew || gifts.length > 1 ? app.t('toast.gift', { name: app.t(`animal.${last.animal.id}`) }) : app.t('toast.giftLevel', { name: app.t(`animal.${last.animal.id}`), n: last.level }));
      save.flush();
      if (parts.length) notice(scene, parts.join('  '));
      onClaimed?.();
      if (gifts.length) onGift?.(gifts, cafe);
    },
    onClose,
  });
}

export function dailyToday() {
  return dailyDayIndex(dailyState(), content.cafe.daily.length);
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
