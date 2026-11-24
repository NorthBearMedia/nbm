#!/usr/bin/env python3
"""TRANSMISSION 02 "CORNER" video. One photographic plate (farmhouse kitchen, 3 a.m.; May's handheld on
the table). Kept deliberately real (user: the earlier mock looked naff): the only things that move are
the radio's light (green: Gerry/Jo, red: May keying up, dark otherwise), the clock (hands drawn over the
plate; 3:00 exactly on the first knock), the candle in the window, a slow push-in, grain, and for a
split second during Jo's "crossing your yard" the light in the window dips as if something passed it.
Hard cut to black on the third knock, then the end card.
Usage: corner_video.py [--test START DUR]"""
import json, pathlib, subprocess, sys, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
D = pathlib.Path(__file__).parent
S = json.loads((D / "script.json").read_text()); LINES = {l["id"]: l for l in S["lines"]}
TL = json.loads((D / "timeline.json").read_text()); T = TL["total"]
W, H, FPS = 1080, 1920, 30
AUDIO = D / "master_social.wav"

# ---------- the plate ------------------------------------------------------------------------------
# source is ChatGPT's 2:3 still; crop to 9:16 at x0 and scale to a 2160x3840 plate (2x the frame).
# Positions are measured on each source image (source pixels).
PLATES = {
 "kitchen_green_nohands.png": {"x0": 90, "clock": (894, 462), "clock_r": 62, "led": (213, 1386), "hands_erased": True,
                       "window": ((322, 505), (628, 930)), "candle": (775, 940), "flame": (775, 945, 24, 44)},   # dial centre from the numerals
 "kitchen_green.png": {"x0": 90, "clock": (886.5, 465), "clock_r": 65, "led": (213, 1386),
                       "window": ((322, 505), (628, 930)), "candle": (775, 945)},     # user's final (green range), 1342x2000
 "kitchen_gpt.png":   {"x0": 40, "clock": (457.5, 235), "clock_r": 31, "led": (111, 709),
                       "window": ((169, 262), (317, 468)), "candle": (397, 482)},     # cream-range stand-in, 687x1024
}
SRC = next(D / "plates" / n for n in PLATES if (D / "plates" / n).exists()); PC = PLATES[SRC.name]
_sw, _sh = Image.open(SRC).size; X0, K, CROP_W = PC["x0"], 3840 / _sh, round(_sh * 9 / 16)
def P(sx, sy): return ((sx - X0) * K, sy * K)                  # source pixel -> plate pixel
CLOCK_C, CLOCK_R = P(*PC["clock"]), PC["clock_r"] * K          # centre, numeral radius
LED = P(*PC["led"])                                            # top face of the radio, beside the antenna
WINDOW = (P(*PC["window"][0]), P(*PC["window"][1]))            # glass and bars, top-left / bottom-right
CANDLE = P(*PC["candle"])
def run(c): subprocess.run(c, check=True, capture_output=True)

def build_plate():
    src = Image.open(SRC).convert("RGB")
    big = src.crop((X0, 0, X0 + CROP_W, _sh)).resize((2160, 3840), Image.LANCZOS)
    big = big.filter(ImageFilter.UnsharpMask(radius=1.6, percent=30 if K < 2.5 else 45, threshold=2))
    from scipy.ndimage import gaussian_filter, binary_dilation
    if PC.get("hands_erased"): return big          # done on the source, along the hands themselves
    # paint out the plate's own clock hands (we draw ours)
    a = np.asarray(big).astype(np.float32); cx, cy = CLOCK_C; R = int(CLOCK_R * 0.9)
    y0, y1, x0, x1 = int(cy - R - 20), int(cy + R + 20), int(cx - R - 20), int(cx + R + 20)
    sub = a[y0:y1, x0:x1]; yy, xx = np.mgrid[y0:y1, x0:x1]
    disk = (xx - cx) ** 2 + (yy - cy) ** 2 < R ** 2; lum = sub.mean(axis=2)
    hand = binary_dilation(disk & (lum < 0.80 * np.median(lum[disk])), iterations=6) & disk
    numerals_ring = (xx - cx) ** 2 + (yy - cy) ** 2 > (CLOCK_R * 0.80) ** 2
    hand &= ~numerals_ring                                   # leave the numbers alone
    m = (~hand).astype(np.float32)
    fill = np.stack([gaussian_filter(sub[..., k] * m, 14) / np.maximum(gaussian_filter(m, 14), 1e-3) for k in range(3)], -1)
    sub[hand] = fill[hand]; a[y0:y1, x0:x1] = sub
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))

base = build_plate()
def lit(glow, core, gain=1.0):
    im = base.convert("RGBA"); lay = Image.new("RGBA", im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    x, y = LED
    for r, a in ((96, 20), (58, 38), (30, 80), (14, 170)): d.ellipse([x - r, y - r * 0.75, x + r, y + r * 0.75], fill=glow + (min(255, int(a * gain)),))
    lay = lay.filter(ImageFilter.GaussianBlur(11))
    ImageDraw.Draw(lay).ellipse([x - 9, y - 6, x + 9, y + 6], fill=core + (255,))
    return Image.alpha_composite(im, lay).convert("RGB")
def candle_out(im):
    """The same kitchen with the lamp out: flame and chimney glow gone, its warm wash off the wall."""
    from scipy.ndimage import gaussian_filter
    a = np.asarray(im).astype(np.float32); fx, fy, rx, ry = PC["flame"]; (cx, cy), rx, ry = P(fx, fy), rx * K, ry * K
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    # the glow on the wall and sill: a broad warm falloff around the lamp
    g = np.exp(-(((xx - cx) / (rx * 7.5)) ** 2 + ((yy - cy) / (ry * 4.0)) ** 2))
    a *= (1 - np.stack([0.58 * g, 0.63 * g, 0.66 * g], -1))
    # the flame and chimney: replaced by the dim glass and wall around them
    core = np.exp(-(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2) * 1.6)
    ring = (np.abs(((xx - cx) / (rx * 1.9)) ** 2 + ((yy - cy) / (ry * 1.5)) ** 2 - 1) < 0.25).astype(np.float32)
    tone = np.array([(a[..., k] * ring).sum() / max(ring.sum(), 1) for k in range(3)], np.float32) * 0.93
    a = a * (1 - core[..., None]) + tone * core[..., None]
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))
base_out = candle_out(base) if PC.get("flame") else base
PL = {"off": base, "rx": lit((70, 240, 120), (205, 255, 215)), "tx": lit((255, 70, 45), (255, 190, 165), gain=1.7)}   # red reads weaker than green on a black radio
IV = [(e["led_on"], e["led_off"], e["kind"]) for e in TL["lines"]]
def state(t):
    for a, b, k in IV:
        if a <= t < b: return k
    return "off"

# ---------- time: the clock, the dip, the cut -----------------------------------------------------
K0, K3 = TL["knocks"][0], TL["knocks"][-1]
T_CUT = K3 + 0.12                                   # hard cut to black on the third knock
def clock_secs(t): return 3 * 3600 - (K0 - min(t, K0))   # 3:00:00 exactly on the first knock, and there it stops
LN = {e["id"]: e for e in TL["lines"]}
T_TURN = LN["l12"]["start"]                          # the sheep go silent: from here the room slowly loses its warmth
T_FLICK = LN["l20"]["start"] - 1.1                   # the yard light stutters as the shed goes dark (user)
FLICK_PAT = [1, .35, .95, .18, .8, 1, .55, 1]        # yard-light brightness per 1/16 s
T_PASS, PASS_LEN = K0 - 1.35, 0.42                   # something passes the window just before the knocks (user)
T_DIP = T_PASS                                       # (kept for the log line)
T_OUT, OUT_LEN = T_PASS + 0.12, 0.5                  # the lamp gutters and dies as it passes (user: more change in the kitchen)
rng = np.random.default_rng(1695)
from scipy.ndimage import gaussian_filter as _gf
_f = _gf(rng.standard_normal((96, 160)), 5); FIELD = _f / _f.std()   # lumpy, so it reads as no shape at all
random.seed(1695); FLICK = [random.uniform(-1, 1) for _ in range(int(T * 12) + 50)]
def flicker(t):                                      # smooth candle noise, ~12 Hz control points
    i = t * 12; a = int(i); f = i - a; f = f * f * (3 - 2 * f)
    return FLICK[a] * (1 - f) + FLICK[a + 1] * f

# ---------- captions --------------------------------------------------------------------------------
def disp_words(lid, rm):
    al = json.loads((D / "vo" / f"{lid}_align.json").read_text())
    ch, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    out, cur, cs, ce, tag = [], "", None, None, False
    for c, s, e in zip(ch, st, en):
        if c == "[": tag = True; continue
        if tag:
            if c == "]": tag = False
            continue
        if c.isspace():
            if cur: out.append([cur, cs, ce]); cur = ""
        else:
            if not cur: cs = s
            cur += c; ce = e
    if cur: out.append([cur, cs, ce])
    out = [w for w in out if any(x.isalnum() for x in w[0]) or w[0] in ("—", "--")]
    def remap(t): return rm["off"] + max(0.0, t - rm["a"] - sum(r for p, r in rm["cuts"] if p < t)) / rm["tempo"]
    return [[w, remap(s), remap(e)] for w, s, e in out if e > rm["a"]]
def phrases(ws, maxw=7):
    sents, buf = [], []
    for w in ws:
        buf.append(w)
        if w[0][-1] in ".?!" or (w[0].endswith("—") and w[0] != "—"): sents.append(buf); buf = []
    if buf: sents.append(buf)
    out = []
    for s in sents:
        n = len(s)
        if n <= maxw: out.append(s); continue
        parts = -(-n // maxw); start = 0
        for p in range(1, parts):
            ideal = round(p * n / parts); best = ideal
            for off in (0, -1, 1, -2, 2):
                j = ideal + off
                if start + 2 <= j <= n - 2 and s[j - 1][0].endswith(","): best = j; break
            out.append(s[start:best]); start = best
        out.append(s[start:])
    return out
def ts(t): t = max(0.0, t); return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"
PLACE = {**{k: "[hay shed]" for k in ("l01", "l04", "l06", "l07")}, **{k: "[yard]" for k in ("l09", "l11")}}
def tag_for(lid, who):
    if who == "JO": return "[across the valley]"
    if who == "GERRY": return PLACE.get(lid, "[lambing shed]")
    return ""
TEXT, DIM, TAGC = "&H00E8EFF2&", "&H00A8ACB0&", "&H00B8BCC0&"
RXC, TXC = "&H00A0E87C&", "&H005C7AFF&"
FS, FM = "IBM Plex Mono SemiBold", "IBM Plex Mono Medium"
ev = []
for e in TL["lines"]:
    ln = LINES[e["id"]]; who = ln["who"]; tag = tag_for(e["id"], who)
    head = (f"{{\\fn{FS}\\fs30\\c{TXC if who == 'MAY' else RXC}\\fsp6}}{who}"
            + (f"{{\\fn{FM}\\fs24\\c{TAGC}\\fsp1}}   {tag}" if tag else "") + f"\\N{{\\fn{FM}\\fs44\\c{TEXT}\\fsp0}}")
    ph = phrases(disp_words(e["id"], e["remap"]))
    for i, p in enumerate(ph):
        start = p[0][1] - 0.05
        stop = ph[i + 1][0][1] - 0.05 if i + 1 < len(ph) else min(p[-1][2] + 0.6, e["end"] + 0.25)
        ev.append((start, min(stop, T_CUT), head + " ".join(w[0] for w in p).replace("— —", "—")))
ev.append((K0 - 0.05, T_CUT, f"{{\\fn{FM}\\fs40\\c{DIM}\\fsp3}}[ KNOCKING ]"))
# opening title (user: stylish, no hook): letters settle from wide tracking, a hairline rule draws out from
# the centre, the place and the season follow; all of it leaves together. Then just "TRANSMISSION 02".
SH = "\\bord0\\shad0\\4a&H60&\\blur0.6"
TY = 660
ev.append((0.15, 3.9, f"{{\\an5\\pos(540,{TY + 70})\\fad(900,700)\\c&H000000&\\alpha&H78&\\blur38\\bord0\\p1}}m -330 -120 l 330 -120 l 330 120 l -330 120{{\\p0}}"))   # soft dark wash behind the title
ev.append((0.25, 3.9, f"{{\\an5\\pos(540,{TY})\\fad(900,600)\\fn{FS}\\fs66\\c{TEXT}\\fsp30\\t(0,1800,0.5,\\fsp14){SH}}}HILL FARM"))
ev.append((0.70, 3.9, f"{{\\an5\\pos(540,{TY + 52})\\fad(300,600)\\c{TEXT}\\alpha&H70&\\fscx0\\t(0,900,0.6,\\fscx100)\\p1}}m 0 0 l 360 0 l 360 2 l 0 2{{\\p0}}"))
ev.append((0.95, 3.9, f"{{\\an5\\pos(540,{TY + 100})\\fad(700,600)\\fn{FM}\\fs30\\c{TEXT}\\fsp16{SH}}}CO. MAYO"))
ev.append((1.40, 3.9, f"{{\\an5\\pos(540,{TY + 146})\\fad(700,600)\\fn{FM}\\fs21\\c{TEXT}\\alpha&H28&\\fsp22{SH}}}LAMBING SEASON"))
# the label sits below every app's top bar (TikTok tabs, Reels header, Shorts icons)
ev.append((4.2, T_CUT, f"{{\\an8\\pos(540,250)\\fad(800,0)\\fn{FS}\\fs26\\c{TEXT}\\fsp12\\alpha&H40&}}TRANSMISSION 02"))
(D / "captions.ass").write_text(
    "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\n\n[V4+ Styles]\n"
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
    "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, "
    "MarginR, MarginV, Encoding\n"
    # top-left block under the label: plain wall, clear of the clock (right) and the radio (bottom left)
    f"Style: T,{FM},44,{TEXT.rstrip('&')},&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,1,8,90,410,318,1\n\n"
    "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n" +
    "\n".join(f"Dialogue: 0,{ts(a)},{ts(b)},T,,0,0,0,,{t}" for a, b, t in ev if b > a) + "\n")

# ---------- render -----------------------------------------------------------------------------------
test = "--test" in sys.argv
t0, dur = (float(sys.argv[sys.argv.index("--test") + 1]), float(sys.argv[sys.argv.index("--test") + 2])) if test else (0.0, T)
out = D / ("test.mp4" if test else "body.mp4")
ff = subprocess.Popen(["ffmpeg", "-y", "-v", "error",
    "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
    "-ss", f"{t0:.3f}", "-i", str(AUDIO),
    "-filter_complex", f"[0:v]eq=saturation=0.95:contrast=1.03,noise=alls=7:allf=t,vignette=PI/5,"
                       f"setpts=PTS+{t0:.3f}/TB,ass=captions.ass,setpts=PTS-STARTPTS,format=yuv420p[v]",
    "-map", "[v]", "-map", "1:a", "-t", f"{dur:.3f}", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-r", str(FPS), "-c:a", "aac", "-b:a", "192k", str(out)], stdin=subprocess.PIPE, cwd=D)
PW, PH = base.size; ZOOM, EASE = 0.08, 1.3
C0, C1 = (PW / 2, PH / 2), (PW / 2 - 90, PH / 2 + 110)       # drift gently towards the radio and table
black = bytes(W * H * 3)
for i in range(int(round(dur * FPS))):
    t = t0 + i / FPS
    if t >= T_CUT: ff.stdin.write(black); continue
    e = (t / T) ** EASE; s = 1 + ZOOM * e
    cx = C0[0] + (C1[0] - C0[0]) * e; cy = C0[1] + (C1[1] - C0[1]) * e
    hw, hh = PW / (2 * s), PH / (2 * s); cx = min(max(cx, hw), PW - hw); cy = min(max(cy, hh), PH - hh)
    bx, by, sc = cx - hw, cy - hh, W / (2 * hw)
    box = (bx, by, cx + hw, cy + hh)
    k_out = 0.0 if t < T_OUT else min((t - T_OUT) / OUT_LEN, 1.0)
    if k_out >= 1.0: fr = base_out.resize((W, H), Image.LANCZOS, box=box, reducing_gap=2.0)
    else:
        fr = PL[state(t)].resize((W, H), Image.LANCZOS, box=box, reducing_gap=2.0)
        if k_out > 0:
            dying = k_out * (0.75 + 0.25 * math.sin(t * 47))                       # it gutters on the way out
            fr = Image.blend(fr, base_out.resize((W, H), Image.LANCZOS, box=box, reducing_gap=2.0), min(dying, 1.0))
    def F(p): return ((p[0] - bx) * sc, (p[1] - by) * sc)
    a = np.asarray(fr).astype(np.float32)
    # candle: a slow, small flicker of its glow
    (qx, qy), rr = F(CANDLE), 110 * sc
    px0, px1, py0, py1 = int(max(0, qx - rr)), int(min(W, qx + rr)), int(max(0, qy - rr)), int(min(H, qy + rr))
    ys_, xs_ = np.ogrid[py0:py1, px0:px1]; g = np.exp(-((xs_ - qx) ** 2 + (ys_ - qy) ** 2) / (2 * (rr * 0.5) ** 2))
    k_turn = min(max((t - T_TURN) / (T_CUT - T_TURN), 0.0), 1.0) ** 1.2
    gutter = 0.45 * math.exp(-((t - (T_PASS + 0.2)) / 0.25) ** 2)            # the flame ducks as it passes
    if k_out < 1.0: a[py0:py1, px0:px1] *= (1 + (1 - k_out) * ((0.07 + 0.07 * k_turn) * flicker(t) - gutter) * g)[..., None]
    (wx0, wy0), (wx1, wy1) = F(WINDOW[0]), F(WINDOW[1]); ww, wh = wx1 - wx0, wy1 - wy0
    ix0, ix1, iy0, iy1 = int(max(0, wx0 - 40)), int(min(W, wx1 + 40)), int(max(0, wy0 - 40)), int(min(H, wy1 + 40))
    # the yard light stutters (power hiccup as the shed goes dark)
    if T_FLICK <= t < T_FLICK + len(FLICK_PAT) / 16:
        v = FLICK_PAT[int((t - T_FLICK) * 16)]
        a[iy0:iy1, ix0:ix1] *= v
        a *= 1 - 0.03 * (1 - v)                                                # a breath of it in the room
    # something passes the window: a lumpy dark mass crosses the light, too fast and too close to read
    if T_PASS <= t <= T_PASS + PASS_LEN:
        u = (t - T_PASS) / PASS_LEN
        ys_, xs_ = np.mgrid[iy0:iy1, ix0:ix1].astype(np.float32)
        xl = (xs_ - wx0) / ww - (-0.7 + 2.4 * u); yl = np.clip((ys_ - wy0) / wh, 0, 0.999)
        fx = np.clip(((xl + 1) / 2 * 159).astype(int), 0, 159); fy = (yl * 95).astype(int)
        env = np.exp(-(xl / 0.42) ** 2) * np.clip(yl * 6, 0, 1)
        m = np.clip((1.25 * env + 0.55 * FIELD[fy, fx] - 0.55) * 2.6, 0, 1)
        m = _gf(m, 6) * np.clip((xs_ - wx0 + 25) / 25, 0, 1) * np.clip((wx1 + 25 - xs_) / 25, 0, 1)
        a[iy0:iy1, ix0:ix1] *= (1 - 0.8 * m)[..., None]
        a *= 1 - 0.03 * math.sin(math.pi * u)
    # the room cools as the night turns: a touch darker, a touch less amber
    if k_turn > 0: a *= np.array([1 - 0.075 * k_turn, 1 - 0.055 * k_turn, 1 - 0.015 * k_turn], np.float32)
    fr = Image.fromarray(a.clip(0, 255).astype(np.uint8))
    # the clock: hour and minute sweep, the second hand ticks; drawn soft to sit in the plate's focus
    (kx, ky), kr = F(CLOCK_C), CLOCK_R * sc
    cs = clock_secs(t); hh_, mm_, ss_ = cs / 3600 % 12, cs / 60 % 60, math.floor(cs % 60)
    pad = int(kr * 1.1); lay = Image.new("RGBA", (pad * 4, pad * 4), (0, 0, 0, 0)); d = ImageDraw.Draw(lay); c = pad * 2
    for ang, L, wd in ((hh_ * 30, 0.52, 0.085), (mm_ * 6, 0.80, 0.06), (ss_ * 6, 0.86, 0.022)):
        r = math.radians(ang - 90); x2, y2 = c + math.cos(r) * kr * 2 * L, c + math.sin(r) * kr * 2 * L
        xb, yb = c - math.cos(r) * kr * 2 * 0.12, c - math.sin(r) * kr * 2 * 0.12
        d.line([(xb, yb), (x2, y2)], fill=(34, 30, 28, 235), width=max(2, int(kr * 2 * wd)))
    d.ellipse([c - kr * 0.12, c - kr * 0.12, c + kr * 0.12, c + kr * 0.12], fill=(34, 30, 28, 240))
    lay = lay.resize((pad * 2, pad * 2), Image.LANCZOS).filter(ImageFilter.GaussianBlur(max(0.6, 1.1 * sc / 0.5)))
    fr.paste(lay, (int(kx - pad), int(ky - pad)), lay)
    ff.stdin.write(fr.tobytes())
ff.stdin.close(); ff.wait()
if ff.returncode: sys.exit("ffmpeg failed")
print(f"{out.name} written ({dur:.1f}s, {len(ev)} caption events, cut to black at {T_CUT:.2f}s, dip at {T_DIP:.2f}s)")
if not test:
    (D / "bumper.ass").write_text(
        "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, "
        "MarginR, MarginV, Encoding\n"
        f"Style: T,{FS},58,{TEXT.rstrip('&')},&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,12,0,1,0,0,5,0,0,0,1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        f"Dialogue: 0,0:00:00.50,0:00:03.90,T,,0,0,0,,{{\\fad(700,0)}}TRANSMISSION 02\\N{{\\fn{FM}\\fs26\\c{DIM}\\fsp9}}CORNER\n"
        f"Dialogue: 0,0:00:01.50,0:00:03.90,T,,0,0,0,,{{\\an2\\pos(540,1180)\\fad(500,0)\\fn{FM}\\fs28\\c{TEXT}\\fsp6}}FOLLOW FOR PART 3\n")
    run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"color=c=0x050505:s={W}x{H}:r={FPS}",
         "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "3.9", "-vf", "ass=bumper.ass,format=yuv420p",
         "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-shortest", str(D / "bumper.mp4")])
    run(["ffmpeg", "-y", "-v", "error", "-i", str(D / "body.mp4"), "-i", str(D / "bumper.mp4"),
         "-filter_complex", "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]", "-map", "[v]", "-map", "[a]",
         "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k", str(D / "final-transmission02.mp4")])
    print("final-transmission02.mp4 written")
