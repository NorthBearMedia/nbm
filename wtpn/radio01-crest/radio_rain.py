#!/usr/bin/env python3
"""Rain on the base-hut window, drawn in plate space so it moves with the push-in.
Two layers, both masked to the glass:
  outside : fast thin streaks falling beyond the pane, blurred and tinted by the cold window light
  on-glass: a few fat drops sliding slowly down the pane with faint trails (what reads as 'window')
Deterministic per frame (seeded), so every render of an episode is identical.
Rain(panes, seed).layer(t) -> (bbox, RGBA image) to composite onto the plate at bbox."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

class Rain:
    def __init__(self, panes, seed=1695, streaks=260, drops=48, tint=(200, 215, 242), feather=6):
        self.panes = panes
        pts = [pt for poly in panes for pt in poly]           # each pane is a polygon of (x, y)
        x0 = int(min(x for x, _ in pts)); y0 = int(min(y for _, y in pts))
        x1 = int(max(x for x, _ in pts)); y1 = int(max(y for _, y in pts))
        self.bbox = (x0, y0, x1, y1); self.w, self.h = x1 - x0, y1 - y0
        m = Image.new("L", (self.w, self.h), 0); md = ImageDraw.Draw(m)
        for poly in panes: md.polygon([(x - x0, y - y0) for x, y in poly], fill=255)
        self.mask = m.filter(ImageFilter.GaussianBlur(feather))
        r = np.random.default_rng(seed); self.tint = tint
        n = streaks                                   # outside: fast, thin, slightly wind-blown
        self.sx = r.uniform(0, self.w, n); self.sy = r.uniform(0, self.h, n)
        self.sv = r.uniform(1500, 2400, n); self.sl = r.uniform(60, 150, n); self.sa = r.uniform(55, 120, n)
        self.wind = 0.13
        k = drops                                     # on the glass: slow, fat, stick-and-slide
        self.dx = r.uniform(0, self.w, k); self.dy = r.uniform(0, self.h, k)
        self.dv = r.uniform(40, 190, k); self.dr = r.uniform(5.0, 11.0, k)
        self.dph = r.uniform(0, 6.28, k); self.dwob = r.uniform(1.0, 4.0, k)

    def layer(self, t):
        w, h = self.w, self.h
        out = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(out)
        ys = (self.sy + self.sv * t) % (h + 80) - 40
        xs = (self.sx + self.wind * self.sv * t) % w
        for x, y, l, a in zip(xs, ys, self.sl, self.sa):
            d.line([(x, y), (x - self.wind * l, y - l)], fill=self.tint + (int(a),), width=4)
        out = out.filter(ImageFilter.GaussianBlur(1.0))           # outside the glass: out of focus
        g = Image.new("RGBA", (w, h), (0, 0, 0, 0)); gd = ImageDraw.Draw(g)
        # stick-and-slide: speed pulses, so drops hesitate then run, like real drops on glass
        prog = self.dv * t + 0.35 * self.dv * np.sin(t * 0.9 + self.dph) / 0.9
        dys = (self.dy + prog) % (h + 60) - 30
        dxs = self.dx + self.dwob * np.sin(t * 0.6 + self.dph)
        for x, y, r_ in zip(dxs, dys, self.dr):
            gd.line([(x, y - r_ * 11), (x, y - r_)], fill=(210, 222, 245, 70), width=max(2, int(r_ * 0.8)))
            gd.ellipse([x - r_, y - r_ * 1.15, x + r_, y + r_ * 1.15], fill=(160, 180, 215, 120))
            gd.ellipse([x - r_ * 0.45, y - r_ * 0.75, x + r_ * 0.15, y - r_ * 0.2], fill=(240, 246, 255, 215))
        g = g.filter(ImageFilter.GaussianBlur(0.7))
        out = Image.alpha_composite(out, g)
        a = np.asarray(out.split()[3], dtype=np.float32) * (np.asarray(self.mask, dtype=np.float32) / 255)
        out.putalpha(Image.fromarray(a.astype(np.uint8)))
        return self.bbox, out
