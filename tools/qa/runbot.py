# Long playtest on the test build: empty save to five stars and a few minutes of daily orders,
# game clock sped up K times (performance.now, Date.now and frame times; timers in the page are not).
# Samples heap, textures, objects every 15 s real time; checks SDK rules; collects measure events.
# Usage: python3 runbot.py <url> <outdir> <K> <cap_real_min> [portrait|landscape]
import json
import sys
import time

from playwright.sync_api import sync_playwright

URL, OUT, K, CAP = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
ORIENT = sys.argv[5] if len(sys.argv) > 5 else 'portrait'
HERE = __file__.rsplit('/', 1)[0]
SPEED = """
(() => {
  const K = %s;
  const pn = performance.now.bind(performance);
  const t0 = pn();
  performance.now = () => t0 + (pn() - t0) * K;
  const dn = Date.now;
  const d0 = dn();
  Date.now = () => d0 + (dn() - d0) * K;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => cb(t0 + (t - t0) * K));
})();
""" % K

with sync_playwright() as p:
    b = p.chromium.launch(args=['--enable-precise-memory-info'])
    vp = {'width': 390, 'height': 844} if ORIENT == 'portrait' else {'width': 844, 'height': 390}
    ctx = b.new_context(viewport=vp, device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx.add_init_script(SPEED)
    ctx.add_init_script(path=f'{HERE}/bot.js')
    import os
    SDK_MODE = os.environ.get('SDK_MODE', 'ok')  # ok | none (ads never fill) | block (script blocked, like an ad blocker)
    ctx.add_init_script(f"window.__adMode = '{SDK_MODE}'; window.__lang = '{os.environ.get('LANG_SDK', 'en')}'; window.__preferReward = {1 if os.environ.get('PREFER_REWARD') else 0};")
    if os.environ.get('STORAGE') == 'blocked':
        ctx.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });")
    stub = open(f'{HERE}/sdkstub.js').read()
    if SDK_MODE == 'block':
        ctx.route('**/game-cdn.poki.com/**', lambda r: r.abort())
        ctx.add_init_script("window.__ev = []; window.__sdkBad = [];")
    else:
        ctx.route('**/game-cdn.poki.com/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=stub))
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type in ('error',) else None)
    page.goto(URL)
    for _ in range(300):
        if page.evaluate('() => !!(window.__play && window.__play.cafe)'):
            break
        time.sleep(0.2)
    time.sleep(1)
    page.screenshot(path=f'{OUT}/start.png')
    page.touchscreen.tap(vp['width'] // 2, vp['height'] // 2)
    page.evaluate(f'() => window.__botStart({round(330 / K)}, {round(400 / K)})')
    t0 = time.time()
    keys0 = page.evaluate('() => Object.keys(window.__play.sys.textures.list)')
    stars = 0
    finished_at = None
    tl = open(f'{OUT}/timeline.jsonl', 'w')
    while True:
        time.sleep(15)
        real = time.time() - t0
        s = page.evaluate('() => window.__botSample()')
        s['real_s'] = round(real)
        s['game_min'] = round(real * K / 60, 1)
        s['sdk_bad'] = page.evaluate('() => (window.__sdkBad || []).length')
        tl.write(json.dumps(s) + '\n')
        tl.flush()
        print(f"{s['game_min']:>5} min  ★{s['stars']}  heap {s['heapMB']} MB  tex {s['textures']}  obj {s['objects']}  staff {s['staff']}  floors {s['floors']}  served {s['served']}  panel {s['panel']} tut {s['tut']}  bad {s['sdk_bad']}  err {len(errors)}", flush=True)
        if s['stars'] and s['stars'] > stars:
            stars = s['stars']
            page.screenshot(path=f'{OUT}/star{stars}.png')
        if s['finished'] and finished_at is None:
            finished_at = real
        if finished_at is not None and real - finished_at > 8 * 60 / K + 30:
            break
        if real > CAP * 60:
            break
    page.screenshot(path=f'{OUT}/end.png')
    keys1 = page.evaluate('() => Object.keys(window.__play.sys.textures.list)')
    json.dump({'start': keys0, 'end': keys1, 'added': [k for k in keys1 if k not in keys0]}, open(f'{OUT}/texkeys.json', 'w'), indent=0)
    ev = page.evaluate('() => window.__ev || []')
    bad = page.evaluate('() => window.__sdkBad || []')
    json.dump({'events': ev, 'bad': bad, 'errors': errors[:50], 'finished_real_s': finished_at, 'K': K}, open(f'{OUT}/sdk.json', 'w'), indent=0)
    names = [e[0] for e in ev]
    print('SDK events:', {n: names.count(n) for n in sorted(set(x.split(':')[0] for x in names))})
    print('measure:', len([n for n in names if n.startswith('measure:')]), 'bad:', bad[:10], 'errors:', errors[:10])
    b.close()
