import { startGame } from '@core';
import game from './game.json';
import en from './i18n/en.json';
import ru from './i18n/ru.json';
import { save } from './save';
import { PlayScene } from './scenes/PlayScene';

startGame({
  id: game.id,
  title: game.title,
  languages: { en, ru },
  scenes: [PlayScene],
  playScene: 'Play',
  menu: true,
  save,
  preload: (scene) => {
    scene.load.setPath('audio');
    scene.load.audio('tap', 'tap.wav');
    scene.load.audio('ui-tap', 'ui-tap.wav');
    scene.load.audio('buy', 'buy.wav');
    scene.load.audio('reward', 'reward.wav');
  },
  theme: {
    background: game.background,
    primary: 0xff8a5b,
    primaryText: '#2b0d00',
    surface: 0x4a3226,
    textDim: '#e3cbb8',
  },
});
