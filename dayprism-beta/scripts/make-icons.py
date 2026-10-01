"""Draws every DayPrism icon from the same geometry as src/ui/logo.tsx (64-unit grid).

Run from the app folder:  python scripts/make-icons.py         (store app)
                          python scripts/make-icons.py --beta  (also the violet Beta icons)
Needs Pillow (pip install pillow). Output goes to assets/ and store/.
"""
import sys
from PIL import Image, ImageDraw, ImageFont

BLUE, VIOLET, WHITE = (0x2A, 0x78, 0xD6), (0x4A, 0x3A, 0xA7), (255, 255, 255)
ON_BLUE = [(0xFF, 0xD1, 0x66), (0xFF, 0x9A, 0x3C), (0xFF, 0x6B, 0x8B)]
ON_WHITE = [(0xF2, 0xA2, 0x0C), (0xFF, 0x7A, 0x2F), (0xE8, 0x50, 0x5B)]
TRIANGLE = [(30, 19), (16.5, 47), (43.5, 47)]
SUN = ((12, 20), 4.6)
SUN_RAYS = [((12, 13.2), (12, 11.2)), ((5.2, 20), (3.2, 20)), ((7.2, 15.2), (5.8, 13.8))]
BEAM = ((17.2, 26.1), (23.2, 33.2))
RAYS = [((36.1, 31.6), (54, 27.5)), ((37.4, 34.4), (58, 35.5)), ((38.8, 37.2), (53, 44))]
CENTRE = (30.6, 29.1)  # middle of the mark, for centring it in icons
SS = 4  # supersampling for smooth edges
BOLD = 'node_modules/@expo-google-fonts/plus-jakarta-sans/800ExtraBold/PlusJakartaSans_800ExtraBold.ttf'
MEDIUM = 'node_modules/@expo-google-fonts/plus-jakarta-sans/500Medium/PlusJakartaSans_500Medium.ttf'


def line(d, a, b, w, color):
    d.line([a, b], fill=color, width=round(w))
    for x, y in (a, b):
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=color)


def mark(size, ox=0.0, oy=0.0, scale=None, tile=None, radius=0.0, ink=WHITE, rays=ON_BLUE, silhouette=False):
    """Returns an RGBA image `size` px square with the mark drawn on a 64-unit grid."""
    S = size * SS
    k = (scale or size / 64) * SS
    ox, oy = ox * SS, oy * SS
    P = lambda p: (ox + p[0] * k, oy + p[1] * k)  # noqa: E731
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if tile:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius * SS, fill=tile)
    for i, (a, b) in enumerate(RAYS):
        line(d, P(a), P(b), 3.4 * k, ink if silhouette else rays[i])
    (sx, sy), r = SUN
    cx, cy = P((sx, sy))
    d.ellipse([cx - r * k, cy - r * k, cx + r * k, cy + r * k], fill=ink)
    for a, b in SUN_RAYS:
        line(d, P(a), P(b), 2.4 * k, ink)
    line(d, P(BEAM[0]), P(BEAM[1]), 3.4 * k, ink)
    # translucent glass body, then the outline with round joins
    glass = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glass).polygon([P(p) for p in TRIANGLE], fill=ink + ((255 if silhouette else 46),))
    img = Image.alpha_composite(img, glass)
    d = ImageDraw.Draw(img)
    pts = [P(p) for p in TRIANGLE]
    for i in range(3):
        line(d, pts[i], pts[(i + 1) % 3], 4.5 * k, ink)
    return img.resize((size, size), Image.LANCZOS)


def centred(size, scale, dy=0.0, **kw):
    """The mark at `scale` px per unit, centred in a `size` px square (moved down by `dy` px)."""
    return mark(size, ox=size / 2 - CENTRE[0] * scale, oy=size / 2 - CENTRE[1] * scale + dy, scale=scale, **kw)


def badge(img, text='BETA'):
    """Orange BETA pill at the bottom centre, inside the adaptive-icon safe zone."""
    S = img.size[0]
    big = img.resize((S * SS, S * SS))
    d = ImageDraw.Draw(big)
    w, h = S * 0.30 * SS, S * 0.10 * SS
    cx, cy = S * 0.5 * SS, S * 0.73 * SS
    d.rounded_rectangle([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], h / 2, fill=(0xFF, 0x7A, 0x2F))
    f = ImageFont.truetype(BOLD, int(h * 0.62))
    d.text((cx, cy), text, font=f, fill=WHITE, anchor='mm')
    return big.resize((S, S), Image.LANCZOS)


def save(img, path):
    img.save(path)
    print('wrote', path)


def feature_graphic(path):
    W, H = 1024, 500
    g = Image.new('RGBA', (W, H))
    px = g.load()
    for y in range(H):
        for x in range(W):
            t = (x / W + y / H) / 2
            px[x, y] = tuple(int(BLUE[i] + (VIOLET[i] - BLUE[i]) * t) for i in range(3)) + (255,)
    g.alpha_composite(centred(200, 2.6, tile=WHITE, radius=44, ink=BLUE, rays=ON_WHITE), (110, 150))
    d = ImageDraw.Draw(g)
    d.text((350, 160), 'DayPrism', font=ImageFont.truetype(BOLD, 84), fill=WHITE)
    d.text((352, 272), 'See the colours of your day.', font=ImageFont.truetype(MEDIUM, 30), fill=WHITE)
    d.text((352, 322), 'Sleep · energy · food · focus, in one calm place', font=ImageFont.truetype(MEDIUM, 21), fill=(255, 255, 255, 200))
    save(g.convert('RGB'), path)


if __name__ == '__main__':
    # Adaptive icon: the launcher shows only the middle ~66%, so the mark stays within ~560 px.
    save(centred(1024, 12.5, tile=BLUE), 'assets/icon.png')
    save(centred(1024, 10), 'assets/android-icon-foreground.png')
    save(centred(1024, 10, silhouette=True), 'assets/android-icon-monochrome.png')
    save(centred(512, 6.2, tile=BLUE, radius=112), 'assets/splash-icon.png')
    save(centred(96, 1.55, silhouette=True), 'assets/notification-icon.png')
    save(centred(48, 0.72, tile=BLUE, radius=10), 'assets/favicon.png')
    save(centred(512, 6.2, tile=BLUE), 'store/play-icon-512.png')
    feature_graphic('store/feature-graphic-1024x500.png')
    if '--beta' in sys.argv:
        save(badge(centred(1024, 11, dy=-90, tile=VIOLET)), 'assets/beta/icon.png')
        save(badge(centred(1024, 8.5, dy=-60)), 'assets/beta/android-icon-foreground.png')
