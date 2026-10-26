# Screenshot sweep on the web build: screen sizes (new player and #daily) and the six languages (#daily),
# plus the menu. Records console errors. Makes contact sheets for review.
# Usage: python3 shots.py <base_url> <outdir>
import json
import sys
import time

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

BASE, OUT = sys.argv[1], sys.argv[2]
SIZES = {
    'desk640': ({'width': 640, 'height': 360}, False),
    'desk836': ({'width': 836, 'height': 470}, False),
    'desk1031': ({'width': 1031, 'height': 580}, False),
    'desk1280': ({'width': 1280, 'height': 720}, False),
    'phoneP': ({'width': 390, 'height': 844}, True),
    'phoneL': ({'width': 844, 'height': 390}, True),
    'tablet': ({'width': 820, 'height': 1180}, True),
}
errors = {}
shots = []


def open_page(b, size, mobile, url):
    opts = {'viewport': size}
    if mobile:
        opts.update(device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx = b.new_context(**opts)
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    page.goto(url)
    for _ in range(200):
        if page.evaluate("() => !!(window.__play && window.__play.cafe)"):
            break
        time.sleep(0.2)
    time.sleep(2.5)
    return ctx, page, errs


with sync_playwright() as p:
    b = p.chromium.launch()
    for name, (size, mobile) in SIZES.items():
        for state, frag in (('new', '?reset'), ('daily', '?lang=en#daily')):
            ctx, page, errs = open_page(b, size, mobile, f'{BASE}/index.html{frag}')
            f = f'{OUT}/size_{name}_{state}.png'
            page.screenshot(path=f)
            shots.append(f)
            errors[f'{name}_{state}'] = errs
            ctx.close()
    for lang in ['en', 'fr', 'it', 'de', 'es', 'tr']:
        for orient, size in (('P', {'width': 390, 'height': 844}), ('L', {'width': 844, 'height': 390})):
            ctx, page, errs = open_page(b, size, True, f'{BASE}/index.html?lang={lang}#daily')
            f = f'{OUT}/lang_{lang}_{orient}.png'
            page.screenshot(path=f)
            shots.append(f)
            # Menu (ESC) in landscape: the longest labels.
            if orient == 'L':
                page.keyboard.press('Escape')
                time.sleep(0.8)
                f2 = f'{OUT}/lang_{lang}_{orient}_menu.png'
                page.screenshot(path=f2)
                shots.append(f2)
            errors[f'{lang}_{orient}'] = errs
            ctx.close()
    b.close()
json.dump(errors, open(f'{OUT}/errors.json', 'w'), indent=1)
print({k: v for k, v in errors.items() if v} or 'no console errors')


def sheet(files, path, w=420):
    ims = [Image.open(f).convert('RGB') for f in files]
    thumbs = []
    for f, im in zip(files, ims):
        r = w / im.width
        t = im.resize((w, int(im.height * r)))
        d = ImageDraw.Draw(t)
        d.rectangle([0, 0, w, 18], fill=(0, 0, 0))
        d.text((4, 3), f.split('/')[-1], fill=(255, 255, 0))
        thumbs.append(t)
    cols = 4
    rows = (len(thumbs) + cols - 1) // cols
    hmax = [max(t.height for t in thumbs[r * cols:(r + 1) * cols]) for r in range(rows)]
    out = Image.new('RGB', (cols * w, sum(hmax)), (40, 40, 40))
    y = 0
    for r in range(rows):
        for c, t in enumerate(thumbs[r * cols:(r + 1) * cols]):
            out.paste(t, (c * w, y))
        y += hmax[r]
    out.save(path)


sheet([s for s in shots if '/size_' in s and ('desk' in s)], f'{OUT}/sheet_desktop.png')
sheet([s for s in shots if '/size_' in s and ('desk' not in s)], f'{OUT}/sheet_mobile.png', 300)
sheet([s for s in shots if '/lang_' in s and s.endswith('_P.png')], f'{OUT}/sheet_lang_P.png', 300)
sheet([s for s in shots if '/lang_' in s and not s.endswith('_P.png')], f'{OUT}/sheet_lang_L.png', 420)
print('sheets done')
