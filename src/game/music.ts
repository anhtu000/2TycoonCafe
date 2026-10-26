import type Phaser from 'phaser';

// Background music (tools/make_music.py): one soft loop for the whole game.
// It loads after the cafe is on screen, so it never slows the first load (Poki: C2P counts from loading),
// and it follows the sound button, ads and hidden tabs through the shared sound manager (core/audio.ts).

const KEY = 'music';
const VOLUME = 0.3;
let started = false;

/** Starts the loop once per session (later calls do nothing). Plays after the browser lets audio start. */
export function startMusic(scene: Phaser.Scene) {
  if (started) return;
  started = true;
  const sound = scene.sound;
  const play = () => {
    if (sound.get(KEY)) return;
    const begin = () => sound.add(KEY, { loop: true, volume: VOLUME }).play();
    // Mobile browsers keep audio locked until the first touch.
    if (sound.locked) sound.once('unlocked', begin);
    else begin();
  };
  if (scene.cache.audio.exists(KEY)) {
    play();
    return;
  }
  // Ogg loops without a gap; Safari gets the mp3. A single-file build carries both inline (window.__ASSETS).
  const device = scene.sys.game.device;
  const ogg = device.audio.ogg && !device.os.iOS && !device.browser.safari;
  const path = `audio/music.${ogg ? 'ogg' : 'mp3'}`;
  const inline = (window as unknown as { __ASSETS?: Record<string, string> }).__ASSETS;
  scene.load.audio(KEY, inline?.[path] ?? path);
  scene.load.once(`filecomplete-audio-${KEY}`, play);
  // A missing or broken file only means no music.
  scene.load.once('loaderror', () => undefined);
  scene.load.start();
}
