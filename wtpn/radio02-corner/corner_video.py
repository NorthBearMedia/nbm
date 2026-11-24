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
# source is ChatGPT's 2:3 still; crop to 9:16 at x0, upscale x3.75 to a 2160x3840 plate (2x the frame)
SRC = next(p for p in [D / "plates" / "kitchen_green.png", D / "plates" / "kitchen_gpt.png"] if p.exists())
X0, K = 40, 3.75
def P(sx, sy): return ((sx - X0) * K, sy * K)                  # source pixel -> plate pixel
CLOCK_C, CLOCK_R = P(457.5, 235), 31 * K                       # centre, numeral radius
LED = P(111, 709)                                              # top face of the radio, beside the antenna
WINDOW = (P(169, 262), P(317, 468))                            # glass and bars, top-left / bottom-right
CANDLE = P(397, 482)
def run(c): subprocess.run(c, check=True, capture_output=True)

def build_plate():
    src = Image.open(SRC).convert("RGB")
    big = src.crop((X0, 0, X0 + 576, 1024)).resize((2160, 3840), Image.LANCZOS)
    big = big.filter(ImageFilter.UnsharpMask(radius=2.2, percent=45, threshold=2))
    # paint out the plate's own clock hands (we draw ours)
    from scipy.ndimage import gaussian_filter, binary_dilation
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
def lit(glow, core):
    im = base.convert("RGBA"); lay = Image.new("RGBA", im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    x, y = LED
    for r, a in ((96, 20), (58, 38), (30, 80), (14, 170)): d.ellipse([x - r, y - r * 0.75, x + r, y + r * 0.75], fill=glow + (a,))
    lay = lay.filter(ImageFilter.GaussianBlur(11))
    ImageDraw.Draw(lay).ellipse([x - 7, y - 5, x + 7, y + 5], fill=core + (255,))
    return Image.alpha_composite(im, lay).convert("RGB")
PL = {"off": base, "rx": lit((70, 240, 120), (205, 255, 215)), "tx": lit((255, 70, 45), (255, 190, 165))}
IV = [(e["led_on"], e["led_off"], e["kind"]) for e in TL["lines"]]
def state(t):
    for a, b, k in IV:
        if a <= t < b: return k
    return "off"

# ---------- time: the clock, the dip, the cut -----------------------------------------------------
K0, K3 = TL["knocks"][0], TL["knocks"][-1]
T_CUT = K3 + 0.12                                   # hard cut to black on the third knock
def clock_secs(t): return 3 * 3600 - (K0 - t)        # 3:00:00 exactly on the first knock
e25 = next(e for e in TL["lines"] if e["id"] == "l25")
w_cross = next(w for w in e25["words"] if w[0].lower().startswith("crossing"))
T_DIP, DIP_LEN = w_cross[1] - 0.25, 0.55             # something passes the yard light, left to right
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
# location marker, typed on; then the hook; then the series label for the rest
MK1, MK2 = "HILL FARM · CO. MAYO", "LAMBING SEASON"
for i in range(1, len(MK1) + 1):
    ev.append((0.10 + i * 0.045, 0.10 + (i + 1) * 0.045 if i < len(MK1) else 3.2,
               f"{{\\an5\\pos(540,600)\\fn{FS}\\fs40\\c{TEXT}\\fsp3\\bord2\\3c&H000000&}}{MK1[:i]}"))
ev.append((1.15, 3.2, f"{{\\an5\\pos(540,652)\\fad(300,0)\\fn{FM}\\fs24\\c{TEXT}\\fsp9\\bord2\\3c&H000000&}}{MK2}"))
ev.append((0.9, 3.2, f"{{\\an5\\pos(540,770)\\fad(350,300)\\fn{FM}\\fs54\\c{TEXT}\\fsp2\\bord2\\3c&H000000&}}Watch the light."))
ev.append((3.2, T_CUT, f"{{\\an8\\pos(540,192)\\fad(500,0)\\fn{FS}\\fs28\\c{TEXT}\\fsp10\\alpha&H30&\\bord1\\3c&H000000&}}TRANSMISSION 02 · PART 2"
                       f"\\N{{\\fn{FM}\\fs20\\c{DIM}\\fsp5}}FARM CHANNEL · CO. MAYO"))
(D / "captions.ass").write_text(
    "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\n\n[V4+ Styles]\n"
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
    "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, "
    "MarginR, MarginV, Encoding\n"
    # top-left block under the label: plain wall, clear of the clock (right) and the radio (bottom left)
    f"Style: T,{FM},44,{TEXT.rstrip('&')},&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,1,8,90,390,300,1\n\n"
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
    fr = PL[state(t)].resize((W, H), Image.LANCZOS, box=(bx, by, cx + hw, cy + hh), reducing_gap=2.0)
    def F(p): return ((p[0] - bx) * sc, (p[1] - by) * sc)
    a = np.asarray(fr).astype(np.float32)
    # candle: a slow, small flicker of its glow
    (qx, qy), rr = F(CANDLE), 110 * sc
    px0, px1, py0, py1 = int(max(0, qx - rr)), int(min(W, qx + rr)), int(max(0, qy - rr)), int(min(H, qy + rr))
    ys_, xs_ = np.ogrid[py0:py1, px0:px1]; g = np.exp(-((xs_ - qx) ** 2 + (ys_ - qy) ** 2) / (2 * (rr * 0.5) ** 2))
    a[py0:py1, px0:px1] *= (1 + 0.07 * flicker(t) * g)[..., None]
    # the dip: a soft dark band crosses the window's light, left to right, in about half a second
    if T_DIP <= t <= T_DIP + DIP_LEN:
        ys, xs = np.ogrid[0:H, 0:W]
        (wx0, wy0), (wx1, wy1) = F(WINDOW[0]), F(WINDOW[1]); u = (t - T_DIP) / DIP_LEN
        bc = wx0 - 0.3 * (wx1 - wx0) + u * 1.6 * (wx1 - wx0); bw = 0.38 * (wx1 - wx0)
        band = np.exp(-((xs - bc) / bw) ** 2) * (np.clip((ys - wy0) / 30, 0, 1) * np.clip((wy1 - ys) / 30, 0, 1))
        inwin = (xs >= wx0 - 30) & (xs <= wx1 + 30)
        a *= (1 - 0.62 * band * inwin)[..., None]
        a *= 1 - 0.035 * math.sin(math.pi * u)                 # the room loses a breath of light with it
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
        f"Dialogue: 0,0:00:00.50,0:00:03.90,T,,0,0,0,,{{\\fad(700,0)}}TRANSMISSION 02\\N{{\\fn{FM}\\fs26\\c{DIM}\\fsp9}}PART 2 · CORNER\n"
        f"Dialogue: 0,0:00:01.50,0:00:03.90,T,,0,0,0,,{{\\an2\\pos(540,1180)\\fad(500,0)\\fn{FM}\\fs28\\c{TEXT}\\fsp6}}FOLLOW FOR PART 3\n")
    run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"color=c=0x050505:s={W}x{H}:r={FPS}",
         "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "3.9", "-vf", "ass=bumper.ass,format=yuv420p",
         "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-shortest", str(D / "bumper.mp4")])
    run(["ffmpeg", "-y", "-v", "error", "-i", str(D / "body.mp4"), "-i", str(D / "bumper.mp4"),
         "-filter_complex", "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]", "-map", "[v]", "-map", "[a]",
         "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k", str(D / "final-transmission02.mp4")])
    print("final-transmission02.mp4 written")
