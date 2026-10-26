// Poki SDK stand-in that records every call and flags rule breaks (Poki guide 5.2):
// no start/start or stop/stop, no break while playing, no SDK event while an ad runs.
(() => {
  const ev = (window.__ev = []);
  const bad = (window.__sdkBad = []);
  let playing = false;
  let inAd = false;
  const mode = window.__adMode || 'ok'; // ok | none
  const log = (n) => ev.push([n, Math.round(performance.now())]);
  window.PokiSDK = {
    init: () => {
      log('init');
      return Promise.resolve();
    },
    gameLoadingFinished: () => log('gameLoadingFinished'),
    gameplayStart: () => {
      if (inAd) bad.push('start during ad');
      if (playing) bad.push('start after start');
      playing = true;
      log('gameplayStart');
    },
    gameplayStop: () => {
      if (inAd) bad.push('stop during ad');
      if (!playing) bad.push('stop after stop');
      playing = false;
      log('gameplayStop');
    },
    commercialBreak: (onStart) => {
      if (playing) bad.push('commercialBreak while playing');
      log('commercialBreak');
      if (mode === 'none') return Promise.resolve();
      inAd = true;
      if (onStart) onStart();
      return new Promise((r) =>
        setTimeout(() => {
          inAd = false;
          r();
        }, 250),
      );
    },
    rewardedBreak: (o) => {
      if (playing) bad.push('rewardedBreak while playing');
      log('rewardedBreak');
      if (mode === 'none') return Promise.resolve(false);
      inAd = true;
      if (o && o.onStart) o.onStart();
      return new Promise((r) =>
        setTimeout(() => {
          inAd = false;
          r(true);
        }, 250),
      );
    },
    getLanguage: () => window.__lang || 'en',
    measure: (...a) => {
      if (inAd) bad.push('measure during ad');
      log('measure:' + a.join('|'));
    },
    getURLParam: () => '',
    movePill: () => {},
    shareableURL: () => Promise.resolve(location.href),
  };
})();
