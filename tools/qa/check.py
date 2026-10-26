# Poki pre-review checks on the Poki build: page scroll (SDK ok / SDK blocked), load time under throttling, ESC pause.
# Usage: python3 check.py <port> <outdir>
import json
import sys
import time

from playwright.sync_api import sync_playwright

PORT = int(sys.argv[1])
OUT = sys.argv[2]
GAME = f'http://127.0.0.1:{PORT}/index.html'
HOST = f'http://localhost:{PORT}/host.html'
STUB = """
window.__ev = [];
const log = (n) => { window.__ev.push([n, Math.round(performance.now())]); };
window.PokiSDK = {
  init: () => { log('init'); return Promise.resolve(); },
  gameLoadingFinished: () => log('gameLoadingFinished'),
  gameplayStart: () => log('gameplayStart'),
  gameplayStop: () => log('gameplayStop'),
  commercialBreak: (s) => { log('commercialBreak'); return Promise.resolve(); },
  rewardedBreak: (o) => { log('rewardedBreak'); return Promise.resolve(false); },
  getLanguage: () => 'en',
  measure: (...a) => log('measure:' + a.join('|')),
  getURLParam: () => '',
  movePill: () => {},
};
"""
results = {}


def sdk_route(block):
    def handle(route):
        if block:
            route.abort()
        else:
            route.fulfill(status=200, content_type='application/javascript', body=STUB)
    return handle


def wait_loaded(frame, block, timeout=90):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if block:
                # No SDK: wait for the canvas and a few frames.
                ok = frame.evaluate("() => !!document.querySelector('canvas') && !!window.Phaser === false")
                if frame.evaluate("() => !!document.querySelector('canvas')"):
                    time.sleep(4)
                    return True
            else:
                ev = frame.evaluate('() => (window.__ev || []).map(e => e[0])')
                if 'gameLoadingFinished' in ev:
                    time.sleep(1.5)
                    return True
        except Exception:
            pass
        time.sleep(0.2)
    return False


def scroll_test(p, block):
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1280, 'height': 800})
    ctx.route('**/game-cdn.poki.com/**', sdk_route(block))
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(HOST)
    frame = None
    for _ in range(100):
        frame = next((f for f in page.frames if f.url.startswith(GAME)), None)
        if frame:
            break
        time.sleep(0.1)
    loaded = wait_loaded(frame, block)
    # Focus the game with a tap on an empty spot (bottom-right of the iframe).
    page.mouse.click(300 + 900, 300 + 300)
    time.sleep(0.5)
    out = {'loaded': loaded}
    keys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Space', 'PageDown', 'PageUp', 'End', 'Home', 'Tab']
    for k in keys:
        page.evaluate('() => window.scrollTo(150, 150)')
        time.sleep(0.15)
        page.keyboard.press(k)
        time.sleep(0.4)
        x, y = page.evaluate('() => [window.scrollX, window.scrollY]')
        out[k] = [x - 150, y - 150]
        # Close anything the key opened (Escape is not tested here).
    page.evaluate('() => window.scrollTo(150, 150)')
    time.sleep(0.15)
    page.mouse.move(300 + 480 - 150, 300 + 270 - 150)
    page.mouse.wheel(0, 400)
    time.sleep(0.5)
    x, y = page.evaluate('() => [window.scrollX, window.scrollY]')
    out['wheel'] = [x - 150, y - 150]
    page.mouse.wheel(400, 0)
    time.sleep(0.5)
    x, y = page.evaluate('() => [window.scrollX, window.scrollY]')
    out['wheelX'] = [x - 150, y - 150]
    out['errors'] = errors
    page.screenshot(path=f'{OUT}/scroll_{"blocked" if block else "sdk"}.png')
    b.close()
    return out


PROFILES = {
    # name: (latency ms, download kbit/s, cpu slowdown)
    'desktop_cable': (20, 20000, 1),
    'mobile_4g': (170, 9000, 4),
    'mobile_fast3g': (562, 1440, 4),
    'mobile_slow3g': (2000, 400, 4),
}


def load_test(p, name, latency, kbps, cpu):
    b = p.chromium.launch()
    mobile = name.startswith('mobile')
    opts = {'viewport': {'width': 390, 'height': 844}, 'device_scale_factor': 2, 'is_mobile': True, 'has_touch': True} if mobile else {'viewport': {'width': 1280, 'height': 720}}
    ctx = b.new_context(**opts)
    ctx.route('**/game-cdn.poki.com/**', sdk_route(False))
    page = ctx.new_page()
    cdp = ctx.new_cdp_session(page)
    cdp.send('Network.enable')
    cdp.send('Network.setCacheDisabled', {'cacheDisabled': True})
    cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': latency, 'downloadThroughput': kbps * 1000 / 8, 'uploadThroughput': 750 * 1000 / 8})
    if cpu > 1:
        cdp.send('Emulation.setCPUThrottlingRate', {'rate': cpu})
    sizes = []
    page.on('response', lambda r: sizes.append(r.url))
    page.goto(GAME, wait_until='commit')
    loaded = wait_loaded(page, False, timeout=180)
    ev = page.evaluate('() => window.__ev')
    t = next((e[1] for e in ev if e[0] == 'gameLoadingFinished'), None)
    fcp = page.evaluate("() => (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || null")
    tr = page.evaluate("() => performance.getEntriesByType('resource').filter(r => r.startTime < %d).reduce((s, r) => s + (r.transferSize || 0), 0)" % (t or 0))
    names = page.evaluate("() => performance.getEntriesByType('resource').filter(r => r.startTime < %d).map(r => r.name.split('/').pop())" % (t or 0))
    page.screenshot(path=f'{OUT}/load_{name}.png')
    b.close()
    return {'loaded': loaded, 'gameLoadingFinished_ms': t, 'fcp_ms': round(fcp) if fcp else None, 'bytes_before_finished': tr, 'files_before_finished': names}


def esc_test(p):
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1280, 'height': 720})
    ctx.route('**/game-cdn.poki.com/**', sdk_route(False))
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(GAME)
    wait_loaded(page, False)
    steps = {}
    # ESC before any tap (tutorial on screen).
    page.keyboard.press('Escape')
    time.sleep(0.8)
    page.screenshot(path=f'{OUT}/esc_1_before_tap.png')
    steps['esc_before_tap'] = [e[0] for e in page.evaluate('() => window.__ev')]
    page.keyboard.press('Escape')
    time.sleep(0.8)
    steps['esc_again'] = [e[0] for e in page.evaluate('() => window.__ev')]
    page.mouse.click(640, 400)
    time.sleep(1)
    page.keyboard.press('Escape')
    time.sleep(0.8)
    page.screenshot(path=f'{OUT}/esc_2_menu.png')
    steps['after_tap_esc'] = [e[0] for e in page.evaluate('() => window.__ev')]
    page.keyboard.press('Escape')
    time.sleep(0.8)
    page.screenshot(path=f'{OUT}/esc_3_closed.png')
    steps['after_tap_esc_esc'] = [e[0] for e in page.evaluate('() => window.__ev')]
    steps['errors'] = errors
    b.close()
    return steps


with sync_playwright() as p:
    which = sys.argv[3] if len(sys.argv) > 3 else 'all'
    if which in ('all', 'scroll'):
        results['scroll_sdk'] = scroll_test(p, False)
        results['scroll_blocked'] = scroll_test(p, True)
    if which in ('all', 'esc'):
        results['esc'] = esc_test(p)
    if which in ('all', 'load'):
        for name, (lat, kbps, cpu) in PROFILES.items():
            results[f'load_{name}'] = load_test(p, name, lat, kbps, cpu)
print(json.dumps(results, indent=1))
