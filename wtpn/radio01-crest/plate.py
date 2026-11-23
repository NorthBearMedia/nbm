#!/usr/bin/env python3
"""Static plate for the RADIO format: a handheld on a desk, near-dark, one practical
light off to the right. Drawn rather than photographed so the signal LED sits at a known
position every episode and the look stays identical across the series.
Writes plate.png (LED dark), led.png (glow layer composited per frame), led.json (position)."""
from PIL import Image, ImageDraw, ImageFilter
import json

W, H = 1080, 1920
img = Image.new("RGB", (W, H), (8, 8, 9))
d = ImageDraw.Draw(img, "RGBA")

# --- desk: soft horizon, falling away toward camera ------------------------------
DESK = 1230
desk = Image.new("RGB", (W, H), (8, 8, 9))
dd = ImageDraw.Draw(desk)
for y in range(DESK - 60, H):
    t = max(0.0, (y - DESK) / (H - DESK))
    v = 30 - int(22 * t)                      # 30 at the horizon -> 8 at the bottom
    dd.line([(0, y), (W, y)], fill=(v, v, v + 1))
mask = Image.new("L", (W, H), 0)
ImageDraw.Draw(mask).rectangle([0, DESK - 60, W, H], fill=255)
img = Image.composite(desk, img, mask.filter(ImageFilter.GaussianBlur(26)))

# practical light: soft pool from the upper right
glow = Image.new("L", (W, H), 0)
ImageDraw.Draw(glow).ellipse([W - 820, DESK - 620, W + 460, DESK + 620], fill=116)
img = Image.composite(Image.new("RGB", (W, H), (74, 70, 62)), img,
                      glow.filter(ImageFilter.GaussianBlur(200)))
d = ImageDraw.Draw(img, "RGBA")

# --- radio body -------------------------------------------------------------------
cx = 520
body_w, body_h = 362, 650
bx0, by0 = cx - body_w // 2, DESK - body_h + 34
bx1, by1 = bx0 + body_w, by0 + body_h

# antenna
d.rounded_rectangle([cx - 15, by0 - 358, cx + 15, by0 + 34], radius=14, fill=(19, 19, 20))
d.rounded_rectangle([cx - 9, by0 - 352, cx + 2, by0 - 46], radius=7, fill=(33, 33, 34))

# case, with a lit right edge and a dead left edge
d.rounded_rectangle([bx0, by0, bx1, by1], radius=26, fill=(25, 25, 27))
d.rounded_rectangle([bx1 - 30, by0 + 12, bx1 - 5, by1 - 14], radius=12, fill=(50, 49, 45))
d.rounded_rectangle([bx0 + 5, by0 + 12, bx0 + 23, by1 - 14], radius=9, fill=(14, 14, 15))

# knobs
d.ellipse([bx0 + 38, by0 - 54, bx0 + 112, by0 + 20], fill=(29, 29, 30))
d.ellipse([bx0 + 50, by0 - 42, bx0 + 100, by0 + 8], fill=(18, 18, 19))
d.ellipse([bx1 - 118, by0 - 52, bx1 - 46, by0 + 20], fill=(31, 31, 32))
d.ellipse([bx1 - 106, by0 - 40, bx1 - 58, by0 + 8], fill=(19, 19, 20))

# display
d.rounded_rectangle([bx0 + 46, by0 + 70, bx1 - 46, by0 + 156], radius=9, fill=(16, 19, 18))
d.rounded_rectangle([bx0 + 54, by0 + 78, bx1 - 54, by0 + 148], radius=7, fill=(23, 28, 26))

# speaker grille
for row in range(10):
    for col in range(12):
        x, y = bx0 + 56 + col * 21, by0 + 186 + row * 21
        d.ellipse([x, y, x + 11, y + 11], fill=(12, 12, 13))

# keypad
for row in range(3):
    for col in range(3):
        x, y = bx0 + 78 + col * 70, by0 + 432 + row * 60
        d.rounded_rectangle([x, y, x + 52, y + 42], radius=8, fill=(18, 18, 19))
        d.rounded_rectangle([x, y, x + 52, y + 38], radius=8, fill=(28, 28, 29))

# PTT bar on the left flank
d.rounded_rectangle([bx0 - 14, by0 + 182, bx0 + 9, by0 + 350], radius=9, fill=(15, 15, 16))

# --- reflection: gradient-masked so it fades instead of ending in a hard edge ------
RH = 210
refl = img.crop([bx0 - 10, by1 - RH, bx1 + 10, by1]).transpose(Image.FLIP_TOP_BOTTOM)
refl = refl.filter(ImageFilter.GaussianBlur(9))
rm = Image.new("L", refl.size, 0)
rmd = ImageDraw.Draw(rm)
for y in range(refl.size[1]):
    rmd.line([(0, y), (refl.size[0], y)], fill=int(46 * (1 - y / refl.size[1]) ** 1.7))
rm = rm.filter(ImageFilter.GaussianBlur(5))
img.paste(refl, (bx0 - 10, by1), rm)

# contact shadow, over the reflection so the radio sits down on the surface
sh = Image.new("L", (W, H), 0)
ImageDraw.Draw(sh).ellipse([bx0 - 96, by1 - 40, bx1 + 150, by1 + 62], fill=190)
img = Image.composite(Image.new("RGB", (W, H), (5, 5, 6)), img,
                      sh.filter(ImageFilter.GaussianBlur(40)))
d = ImageDraw.Draw(img, "RGBA")

# --- LED: dark housing here; the glow is a separate layer --------------------------
LED = (cx + 118, by0 + 32)
d.ellipse([LED[0] - 17, LED[1] - 17, LED[0] + 17, LED[1] + 17], fill=(13, 13, 14))
d.ellipse([LED[0] - 14, LED[1] - 14, LED[0] + 14, LED[1] + 14], fill=(40, 21, 18))
img.save("plate.png")

lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ld = ImageDraw.Draw(lay)
for rad, a in ((126, 24), (86, 38), (52, 68), (28, 150)):
    ld.ellipse([LED[0] - rad, LED[1] - rad, LED[0] + rad, LED[1] + rad], fill=(255, 88, 56, a))
lay = lay.filter(ImageFilter.GaussianBlur(18))
ImageDraw.Draw(lay).ellipse([LED[0] - 13, LED[1] - 13, LED[0] + 13, LED[1] + 13],
                            fill=(255, 178, 152, 255))
lay.save("led.png")
json.dump({"led": LED, "desk": DESK, "body": [bx0, by0, bx1, by1]}, open("led.json", "w"))
print(f"plate.png + led.png written; LED at {LED}")
