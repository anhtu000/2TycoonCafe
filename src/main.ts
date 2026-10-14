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
  menu: 'returning',
  menuScene: 'Home',
  save,
  preload: (scene) => {
    for (const key of ['tap', 'ui-tap', 'buy', 'reward']) scene.load.audio(key, `audio/${key}.wav`);
  },
  theme: {
    background: game.background,
    primary: 0xffc23d,
    primaryText: '#2a1a00',
    surface: 0x5a3a2a,
    surfaceText: '#fff3e0',
    text: '#ffffff',
    textDim: '#e3cbb8',
    reward: 0x36d68a,
    rewardText: '#052b17',
  },
});
