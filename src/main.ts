import { startGame } from '@core';
import game from './game.json';
import en from './i18n/en.json';
import { save } from './save';
import { HomeScene } from './scenes/HomeScene';
import { PlayScene } from './scenes/PlayScene';

startGame({
  id: game.id,
  title: game.title,
  // English only in v1. Other languages come with Yandex.
  languages: { en },
  scenes: [HomeScene, PlayScene],
  playScene: 'Play',
  // New players go straight into the cafe; returning players see the home screen (CLAUDE.md 4.2).
  // Poki: everyone goes straight into the cafe (no title screen); the in-game menu has everything.
  menu: __TARGET__ === 'poki' ? false : 'returning',
  menuScene: 'Home',
  save,
  // Poki manages ad frequency: no timer of our own, and no home-made message when an ad fails.
  ads: __TARGET__ === 'poki' ? { midgameGapSec: 0, silentFailures: true } : {},
  preload: (scene) => {
    // A single-file build (scripts/build-single.mjs) carries the sounds inline in window.__ASSETS.
    const inline = (window as unknown as { __ASSETS?: Record<string, string> }).__ASSETS;
    for (const key of ['tap', 'ui-tap', 'buy', 'reward', 'coin', 'pop', 'sad']) {
      const path = `audio/${key}.wav`;
      scene.load.audio(key, inline?.[path] ?? path);
    }
  },
  theme: {
    background: game.background,
    primary: 0xffc23d,
    primaryText: '#2a1a00',
    surface: 0x5a3a2a,
    surfaceText: '#fff3e0',
    text: '#ffffff',
    textDim: '#e3cbb8',
    // Rewarded buttons are never green on Poki (Poki guide 7.2): purple, with the video icon.
    reward: 0x8b5cf6,
    rewardText: '#ffffff',
  },
});
