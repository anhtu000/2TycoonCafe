# Daily gift "Claim x2" on the Poki test build: ad fills (reward x2) and ad does not fill (no reward, no message).
# Usage: python3 daily_x2.py <url> <outdir>
import json
import sys
import time

from playwright.sync_api import sync_playwright

URL, OUT = sys.argv[1], sys.argv[2]
stub = open(__file__.rsplit('/', 1)[0] + '/sdkstub.js').read()
PRESS = """(want) => {
  const P = window.__play;
  const walk = (n, out) => { for (const c of (n && n.list) || []) { if (c && c.opts && typeof c.opts.onClick === 'function') out.push(c); if (c && c.list) walk(c, out); } return out; };
  const b = walk(P.panel, []).find((x) => x.labelText && x.labelText.text.trim() === want && x.enabled && x.visible);
  if (!b) return null; b.emit('pointerdown'); b.emit('pointerup'); return want;
}"""
TEXTS = """() => window.__play.children.list.filter((o) => o.depth === 2000 && o.alpha > 0.05).map((o) => o.list[1].text)"""
with sync_playwright() as p:
    b = p.chromium.launch()
    for mode in ['ok', 'none']:
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        ctx.add_init_script(f"window.__adMode = '{mode}';")
        ctx.route('**/game-cdn.poki.com/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=stub))
        page = ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(URL)
        for _ in range(200):
            if page.evaluate('() => !!(window.__play && window.__play.cafe)'):
                break
            time.sleep(0.2)
        time.sleep(1)
        page.touchscreen.tap(300, 250)
        time.sleep(0.5)
        page.evaluate('() => window.__play.openDailyPanel()')
        time.sleep(1)
        coins0 = page.evaluate('() => window.__play.cafe.s.coins')
        r = page.evaluate(PRESS, 'Claim x2')
        time.sleep(1.5)
        coins1 = page.evaluate('() => window.__play.cafe.s.coins')
        notices = page.evaluate(TEXTS)
        panel_open = page.evaluate('() => !!window.__play.panel')
        page.screenshot(path=f'{OUT}/daily_x2_{mode}.png')
        ev = [e[0] for e in page.evaluate('() => window.__ev')]
        print(mode, '| pressed:', r, '| coins', round(coins0), '->', round(coins1), '| notices:', notices, '| panel still open:', panel_open, '| events after load:', ev[2:], '| bad:', page.evaluate('() => window.__sdkBad'), '| errors:', errs)
        ctx.close()
    b.close()
