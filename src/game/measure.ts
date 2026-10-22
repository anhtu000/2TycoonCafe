// Funnel events for Poki's analytics (PokiSDK.measure; optional, Poki guide 5.3 and sdk.poki.com/game-events).
// They show where players stop (tutorial step, star, task, floor), so a weak Player Fit Test can be read.
// Ads are tracked by Poki already: no events for them here. Other portals: nothing is sent.
// Values: letters, digits and "-" only (Poki: no "/" or "^").

type PokiMeasure = { measure?: (category: string, what: string, action: string) => void };

const clean = (v: string | number) => String(v).replace(/[^A-Za-z0-9_-]/g, '-');

export function measure(category: string, what: string | number, action: string) {
  if (__TARGET__ !== 'poki') return;
  try {
    (window as unknown as { PokiSDK?: PokiMeasure }).PokiSDK?.measure?.(clean(category), clean(what), clean(action));
  } catch {
    // Analytics never break the game.
  }
}
