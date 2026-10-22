// Keys and the mouse wheel must not scroll the portal page around the game (Poki requirements).
// Core blocks arrows, Space, PageUp/PageDown and the wheel once the game has started (core/app.ts).
// This also blocks Home and End, which jumped the Poki page to its top or bottom (check 22/10),
// and starts at once, so the page also stays still while the game loads.
// Kept in game #2's code: core/ is shared with game #1 (CLAUDE.md 11).

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Spacebar', 'PageUp', 'PageDown', 'Home', 'End']);

export function blockPageScroll() {
  window.addEventListener(
    'keydown',
    (e) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (SCROLL_KEYS.has(e.key)) e.preventDefault();
    },
    { passive: false },
  );
  window.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
}
