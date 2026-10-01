"""
Regenerates the site's icons and social-share image from the app's own assets.

Run from website/:  python scripts/make-images.py
Needs Python 3 with Pillow, and dayprism-v1/node_modules installed (for the font file).
The outputs are committed, so this only needs re-running when the app icon changes.
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT.parent / "dayprism-v1"
PUBLIC = ROOT / "public"
FONT_DIR = APP / "node_modules/@expo-google-fonts/plus-jakarta-sans"

icon = Image.open(APP / "assets/icon.png").convert("RGBA")

# Favicons and web-manifest icons (the app icon is full-bleed with the logo inside the safe zone,
# so the same art works as a maskable icon).
for size, name in [(180, "apple-touch-icon.png"), (192, "icon-192.png"), (512, "icon-512.png")]:
    icon.resize((size, size), Image.LANCZOS).save(PUBLIC / name, optimize=True)
icon.save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

# Widget previews used on the features section (Astro converts them to AVIF/WebP at build).
for name in ["widget-preview.png", "streak-widget-preview.png"]:
    Image.open(APP / "assets" / name).save(ROOT / "src/assets/app" / name, optimize=True)

# Open Graph / Twitter card, 1200x630: dawn light falling into a prism and fanning out into
# colours, under the name and tagline.
W, H = 1200, 630
stops = [(0.0, (11, 16, 32)), (0.4, (36, 32, 90)), (0.7, (110, 58, 150)),
         (0.88, (214, 84, 110)), (1.0, (255, 154, 60))]

def sky(t):
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        if a <= t <= b:
            k = (t - a) / (b - a)
            return tuple(round(ca[i] + (cb[i] - ca[i]) * k) for i in range(3))
    return stops[-1][1]

img = Image.new("RGB", (W, H))
px = img.load()
for y in range(H):
    c = sky(y / (H - 1))
    for x in range(W):
        px[x, y] = c
img = img.convert("RGBA")

def glow(center, radius, color, strength):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for r in range(radius, 0, -4):
        a = int(strength * (1 - r / radius) ** 2.2)
        d.ellipse([center[0] - r, center[1] - r, center[0] + r, center[1] + r], fill=color + (a,))
    return layer

sun = (170, 330)
apex, left, right = (560, 330), (470, 520), (650, 520)
entry = (515, 425)      # where the beam meets the prism's left face
exit_ = (603, 425)      # where the colours leave the right face
img = Image.alpha_composite(img, glow(sun, 260, (255, 214, 150), 150))

light = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ld = ImageDraw.Draw(light)
ld.polygon([sun, (entry[0], entry[1] - 14), (entry[0], entry[1] + 14)], fill=(255, 244, 220, 150))
spectrum = [(255, 209, 102), (255, 154, 60), (255, 107, 139), (124, 108, 240), (85, 152, 231)]
for i, col in enumerate(spectrum):
    a0 = -0.20 + i * 0.095
    a1 = a0 + 0.08
    far = 900
    ld.polygon([(exit_[0], exit_[1] - 8 + i * 4), (exit_[0] + far * math.cos(a0), exit_[1] + far * math.sin(a0)),
                (exit_[0] + far * math.cos(a1), exit_[1] + far * math.sin(a1))], fill=col + (215,))
light = light.filter(ImageFilter.GaussianBlur(3))
img = Image.alpha_composite(img, light)

d = ImageDraw.Draw(img)
d.ellipse([sun[0] - 46, sun[1] - 46, sun[0] + 46, sun[1] + 46], fill=(255, 246, 228))
glass = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(glass).polygon([apex, left, right], fill=(255, 255, 255, 60))
img = Image.alpha_composite(img, glass)
d = ImageDraw.Draw(img)
d.line([apex, left, right, apex, left], fill=(255, 255, 255), width=9, joint="curve")

display = ImageFont.truetype(str(FONT_DIR / "800ExtraBold/PlusJakartaSans_800ExtraBold.ttf"), 132)
body = ImageFont.truetype(str(FONT_DIR / "600SemiBold/PlusJakartaSans_600SemiBold.ttf"), 46)
d.text((W // 2, 120), "DayPrism", font=display, fill=(255, 255, 255), anchor="mm")
d.text((W // 2, 222), "See the colours of your day.", font=body, fill=(255, 255, 255), anchor="mm")
logo = icon.resize((72, 72), Image.LANCZOS)
mask = Image.new("L", (72, 72), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, 71, 71], radius=16, fill=255)
img.paste(logo, (W - 72 - 40, H - 72 - 36), mask)
img.convert("RGB").save(PUBLIC / "og-image.png", optimize=True)
print("done")
