#!/usr/bin/env python3
"""Mock-up frames for TRANSMISSION 02 on a kitchen plate: location marker, label, hook, captions with
place tags, the radio light, clock hands (2:57 -> 3:00) and the shadow at the window.
Usage: mockup.py plates/<plate>.png <cfg.json> <out.jpg>"""
import json, sys, math
from PIL import Image, ImageDraw, ImageFilter, ImageFont
src, cfgp, outp = sys.argv[1:4]; C = json.load(open(cfgp))
F = "/root/.fonts/IBMPlexMono-"
def font(w, s): return ImageFont.truetype(F + w + ".ttf", s)
TEXT, DIM, WIND = (242, 239, 232), (176, 172, 168), (140, 136, 132)
RX, TX = (124, 232, 160), (255, 122, 92)
def plate():
    im = Image.open(src).convert("RGB"); W, H = im.size; s = 1920 / H
    im = im.resize((round(W * s), 1920), Image.LANCZOS); x0 = (im.width - 1080) // 2
    return im.crop((x0, 0, x0 + 1080, 1920)), s, x0
def P(xy, s, x0): return (xy[0] * s - x0, xy[1] * s)
def led(im, xy, col, s, x0):
    x, y = P(xy, s, x0); g = Image.new("RGBA", im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(g)
    for r, a in ((120, 30), (70, 50), (38, 90), (18, 160)): d.ellipse([x - r, y - r, x + r, y + r], fill=col + (a,))
    g = g.filter(ImageFilter.GaussianBlur(14)); d = ImageDraw.Draw(g); d.ellipse([x - 7, y - 5, x + 7, y + 5], fill=(255, 255, 255, 230))
    return Image.alpha_composite(im.convert("RGBA"), g).convert("RGB")
def erase_hands(im, c, r):
    import numpy as np
    from scipy.ndimage import gaussian_filter, binary_dilation
    a = np.asarray(im).astype(np.float32); cx, cy = c; R = int(r * 0.86)
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]; disk = (xx - cx) ** 2 + (yy - cy) ** 2 < R ** 2
    lum = a.mean(axis=2); hand = binary_dilation(disk & (lum < 0.72 * np.median(lum[disk])), iterations=4) & disk
    m = (~hand).astype(np.float32)
    fill = np.stack([gaussian_filter(a[..., k] * m, 9) / np.maximum(gaussian_filter(m, 9), 1e-3) for k in range(3)], -1)
    a[hand] = fill[hand]; return Image.fromarray(a.clip(0, 255).astype(np.uint8))
def clock(im, c, r, hh, mm, ss, s, x0):
    x, y = P(c, s, x0); r *= s; d = ImageDraw.Draw(im)
    for ang, L, wdt in ((((hh % 12) + mm / 60) * 30, 0.5, max(3, int(r * 0.07))), (mm * 6, 0.78, max(2, int(r * 0.05))), (ss * 6, 0.85, max(1, int(r * 0.02)))):
        a = math.radians(ang - 90); d.line([(x, y), (x + math.cos(a) * r * L, y + math.sin(a) * r * L)], fill=(20, 18, 16), width=wdt)
    d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=(20, 18, 16))
def shadow(im, poly, frac, s, x0):
    pts = [P(p, s, x0) for p in poly]; xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    mask = Image.new("L", im.size, 0); ImageDraw.Draw(mask).polygon(pts, fill=255)
    sh = Image.new("L", im.size, 0); d = ImageDraw.Draw(sh)
    gw, gh = max(xs) - min(xs), max(ys) - min(ys)
    cx = min(xs) + gw * frac; head_y = min(ys) + gh * 0.42; hr = gw * 0.13
    d.ellipse([cx - hr * 0.85, head_y - hr, cx + hr * 0.85, head_y + hr], fill=110)                              # head
    d.polygon([(cx - hr * 0.6, head_y + hr * 0.8), (cx + hr * 0.6, head_y + hr * 0.8), (cx + gw * 0.30, head_y + hr * 2.4),
               (cx + gw * 0.34, max(ys) + 40), (cx - gw * 0.34, max(ys) + 40), (cx - gw * 0.30, head_y + hr * 2.4)], fill=110)  # shoulders
    sh = sh.filter(ImageFilter.GaussianBlur(gw * 0.05))
    sh = Image.composite(sh, Image.new("L", im.size, 0), mask)
    dark = Image.new("RGB", im.size, (8, 8, 10)); return Image.composite(dark, im, sh)
def text(d, xy, s, f, fill, anchor="mm", sp=0):
    if sp: s = (" " * 0).join(s)
    d.text(xy, s, font=f, fill=fill, anchor=anchor)
def spaced(s, n=1): return (" " * n).join(s.split(" ")) if False else s
def caption(d, who, tag, line, col):
    y = 1400; f1, f2 = font("SemiBold", 33), font("Medium", 26); w1 = f1.getlength(who); w2 = f2.getlength(tag) + 28 if tag else 0
    xs = 540 - (w1 + w2) / 2; d.text((xs, y - 56), who, font=f1, fill=col, anchor="lm", stroke_width=2, stroke_fill=(0, 0, 0))
    if tag: d.text((xs + w1 + 28, y - 56), tag, font=f2, fill=(205, 200, 192), anchor="lm", stroke_width=2, stroke_fill=(0, 0, 0))
    d.text((540, y), line, font=font("Medium", 48), fill=TEXT, anchor="mm", stroke_width=2, stroke_fill=(0, 0, 0))
frames = []
for fr in C["frames"]:
    im, s, x0 = plate()
    if fr.get("led"): im = led(im, C["led"], RX if fr["led"] == "rx" else TX, s, x0)
    else:
        x, y = P(C["led"], s, x0); g = Image.new("RGBA", im.size, (0, 0, 0, 0)); dd = ImageDraw.Draw(g)
        dd.ellipse([x - 26, y - 26, x + 26, y + 26], fill=(20, 16, 12, 200)); g = g.filter(ImageFilter.GaussianBlur(9))
        im = Image.alpha_composite(im.convert("RGBA"), g).convert("RGB"); ImageDraw.Draw(im).ellipse([x - 6, y - 5, x + 6, y + 5], fill=(46, 36, 26))
    if C.get("clock"):
        im = erase_hands(im, P(C["clock"]["c"], s, x0), C["clock"]["r"] * s)
        clock(im, C["clock"]["c"], C["clock"]["r"], *fr["time"], s, x0)
    if fr.get("shadow") is not None and C.get("window"): im = shadow(im, C["window"], fr["shadow"], s, x0)
    grad = Image.new("L", (1, 1920)); [grad.putpixel((0, y), int(170 * max(0, (y - 1150) / 770) ** 1.3)) for y in range(1920)]
    im = Image.composite(Image.new("RGB", im.size, (0, 0, 0)), im, grad.resize(im.size))
    d = ImageDraw.Draw(im)
    if fr.get("marker"):
        d.text((560, 560), "HILL FARM · CO. MAYO", font=font("SemiBold", 40), fill=TEXT, anchor="mm", stroke_width=2, stroke_fill=(0, 0, 0))
        d.text((560, 610), "L A M B I N G   S E A S O N", font=font("Medium", 24), fill=TEXT, anchor="mm", stroke_width=2, stroke_fill=(0, 0, 0))
    else:
        d.text((540, 208), "T R A N S M I S S I O N  0 2  ·  P A R T  2", font=font("SemiBold", 28), fill=TEXT, anchor="mm")
        d.text((540, 240), "F A R M  C H A N N E L  ·  C O .  M A Y O", font=font("Medium", 21), fill=DIM, anchor="mm")
    if fr.get("hook"): d.text((560, 720), "Watch the light.", font=font("Medium", 54), fill=TEXT, anchor="mm", stroke_width=2, stroke_fill=(0, 0, 0))
    if fr.get("cap"): caption(d, *fr["cap"], RX if fr["cap"][0] != "MAY" else TX)
    if fr.get("note"): d.text((540, 1880), fr["note"], font=font("Medium", 26), fill=(255, 210, 90), anchor="mm")
    frames.append(im)
w, h = 540, 960; sheet = Image.new("RGB", (w * len(frames) + 20 * (len(frames) - 1), h), (12, 12, 12))
for i, f in enumerate(frames): sheet.paste(f.resize((w, h), Image.LANCZOS), (i * (w + 20), 0))
sheet.save(outp, quality=90); print(outp, sheet.size)
