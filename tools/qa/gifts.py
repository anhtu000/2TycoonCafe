# 7-day gift on the web build presets: day 3 (Rare pal), day 7 (Snow Fox), paused streak.
# Opens the preset, presses Claim in the daily panel, records the notice and the reveal.
# Usage: python3 gifts.py <base_url> <outdir>
import sys
import time

from playwright.sync_api import sync_playwright

BASE, OUT = sys.argv[1], sys.argv[2]
FIND = """(want) => {
  const P = window.__play; if (!P || !P.panel) return null;
  const walk = (n, out) => { for (const c of (n && n.list) || []) { if (c && c.opts && typeof c.opts.onClick === 'function') out.push(c); if (c && c.list) walk(c, out); } return out; };
  const b = walk(P.panel, []).find((x) => x.labelText && x.labelText.text.trim() === want && x.enabled);
  if (!b) return walk(P.panel, []).map((x) => x.labelText ? x.labelText.text : '(icon)');
  b.emit('pointerdown'); b.emit('pointerup'); return 'pressed';
}"""
with sync_playwright() as p:
    b = p.chromium.launch()
    for preset in ['giftrare', 'giftfox', 'giftpause']:
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(f'{BASE}/index.html#{preset}')
        for _ in range(200):
            if page.evaluate('() => !!(window.__play && window.__play.panel)'):
                break
            time.sleep(0.2)
        time.sleep(1.2)
        page.screenshot(path=f'{OUT}/gift_{preset}_1panel.png')
        r = page.evaluate(FIND, 'Claim')
        time.sleep(1.0)
        page.screenshot(path=f'{OUT}/gift_{preset}_2claimed.png')
        time.sleep(1.5)
        page.screenshot(path=f'{OUT}/gift_{preset}_3after.png')
        print(preset, 'claim:', r, 'errors:', errs)
        ctx.close()
    b.close()
