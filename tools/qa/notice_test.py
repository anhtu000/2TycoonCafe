# Notice queue: four messages fired in the same moment must show one at a time, never on top of each other.
# Usage: python3 notice_test.py <url> <outdir>
import json
import sys
import time

from playwright.sync_api import sync_playwright

URL, OUT = sys.argv[1], sys.argv[2]
stub = open(__file__.rsplit('/', 1)[0] + '/sdkstub.js').read()
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx.route('**/game-cdn.poki.com/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=stub))
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(URL)
    for _ in range(200):
        if page.evaluate('() => !!(window.__play && window.__play.cafe)'):
            break
        time.sleep(0.2)
    time.sleep(1.5)
    page.touchscreen.tap(195, 420)
    time.sleep(0.5)
    page.evaluate("""() => {
      const P = window.__play; const t0 = performance.now(); window.__ns = [];
      const id = setInterval(() => {
        const vis = P.children.list.filter((o) => o.depth === 2000 && o.alpha > 0.05).map((o) => o.list[1].text + ' @' + o.alpha.toFixed(2));
        window.__ns.push([Math.round(performance.now() - t0) / 1000, vis]);
        if (performance.now() - t0 > 7000) clearInterval(id);
      }, 50);
    }""")
    # Same moment: a star, two milestones, a VIP, and the star again (a duplicate is dropped).
    page.evaluate("""() => {
      const P = window.__play;
      P.onStar(1);
      P.handle([{ type: 'milestone', item: 'coffee', mult: 2, level: 10 }]);
      P.handle([{ type: 'milestone', item: 'tea', mult: 2, level: 10 }]);
      P.handle([{ type: 'milestone', item: 'tea', mult: 2, level: 10 }]);
    }""")
    time.sleep(1.0)
    page.screenshot(path=f'{OUT}/notice_1s.png')
    time.sleep(6.5)
    samples = page.evaluate('() => window.__ns')
    b.close()
over = [s for s in samples if len(s[1]) > 1]
print('max on screen:', max(len(s[1]) for s in samples), '| overlapping samples:', len(over), '| errors:', errs)
shown = []
for _, vis in samples:
    for v in vis:
        t = v.split(' @')[0]
        if t not in shown:
            shown.append(t)
print('order shown:', shown)
json.dump(samples, open(f'{OUT}/notice.json', 'w'), indent=0)
