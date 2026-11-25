#!/usr/bin/env python3
"""TRANSMISSION video, photographic version. A generated photo of a handheld on a base-hut desk
(plates/plate2.png, 1620x2880 = 1.5x the frame). The LED is composited into the lens at the base
of the first knob: green while the hill transmits, red while Base keys up. Python renders every
frame with a slow push-in from a sub-pixel crop box (ffmpeg's zoompan snaps to whole pixels and
stutters at this speed); ffmpeg adds gradients for legibility, grain, vignette and captions.
Usage: radio_video2.py [--test START DUR]"""
import json, pathlib, subprocess, sys, re
from PIL import Image, ImageDraw, ImageFilter
D = pathlib.Path(__file__).parent
S = json.loads((D / "script.json").read_text()); LINES = {l["id"]: l for l in S["lines"]}
TL = json.loads((D / "timeline.json").read_text()); T = TL["total"]
W, H, FPS = 1080, 1920, 30
# Each plate: the LED lens position and glow scale (plate pixels), the point the push-in closes
# on, and how far it pushes over the episode. Swap plates by changing PLATE_NAME.
# Push-in: from c0 at scale 1 to c1 at scale 1+zoom, eased so the first seconds feel still and the
# creep builds. Plate 3 ends ~45% closer with the radio on the left third and the window holding the
# right edge, so the rain stays in shot.
PLATES = {
 "plate2": {"led": (810, 1149), "glow": 1.0, "c0": (810, 1440), "c1": (830, 1450), "zoom": 0.06, "ease": 1.0},
 "plate3": {"led": (884, 1799), "glow": 0.85, "c0": (1080, 1920), "c1": (1180, 1900), "zoom": 0.45, "ease": 1.35,
            "rain": [[(1822, 38), (2160, 38), (2160, 1446), (1782, 1446)]]},
}
PLATE_NAME = "plate3"
CFG = PLATES[PLATE_NAME]
PLATE = D / "plates" / f"{PLATE_NAME}.png"
LED, ZOOM, GS = CFG["led"], CFG["zoom"], CFG["glow"]
RAIN = None
if CFG.get("rain"):
    sys.path.insert(0, str(D)); from radio_rain import Rain; RAIN = Rain(CFG["rain"])
def run(c): subprocess.run(c, check=True, capture_output=True)
def lufs(p):
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", str(p), "-af", "ebur128=framelog=quiet", "-f", "null", "-"],
                       capture_output=True, text=True)
    return float(re.findall(r"I:\s*(-?[\d.]+)\s*LUFS", r.stderr)[-1])
# Social master: phones play quiet content quietly, so -14 LUFS (master.wav stays the -15 reference).
# Same 4x-oversampled limiter and two-pass correction as radio_audio.py; stereo for every platform.
AUDIO = D / "master_social.wav"
def social_master(target=-14.0):
    def go(g):
        run(["ffmpeg", "-y", "-v", "error", "-i", str(D / "mix.wav"), "-af",
             f"volume={g:.2f}dB,aresample=192000,alimiter=level=0:limit=0.87:attack=5:release=50,aresample=48000",
             "-ac", "2", "-c:a", "pcm_s16le", str(AUDIO)])
        return lufs(AUDIO)
    g = target - lufs(D / "mix.wav")
    for _ in range(6):                     # a limiter that is working lowers what it is given: iterate
        err = target - go(g)
        if abs(err) < 0.15: break
        g += err
    return lufs(AUDIO)

# ---------- plates: dark, receiving (green), transmitting (red) ----------------------------
base = Image.open(PLATE).convert("RGB")
def lit(glow, core):
    im = base.copy().convert("RGBA"); lay = Image.new("RGBA", im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    for r, a in ((240, 34), (150, 52), (84, 92), (40, 165)):      # sized for a phone screen
        r *= GS; d.ellipse([LED[0]-r, LED[1]-r*0.8, LED[0]+r, LED[1]+r*0.8], fill=glow + (a,))
    lay = lay.filter(ImageFilter.GaussianBlur(26 * GS))
    hw, hh = 17 * GS, 6 * GS
    ImageDraw.Draw(lay).rounded_rectangle([LED[0]-hw, LED[1]-hh, LED[0]+hw, LED[1]+hh], radius=5 * GS, fill=core + (255,))
    return Image.alpha_composite(im, lay).convert("RGB")
PL = {"off": base, "rx": lit((70, 240, 120), (205, 255, 215)), "tx": lit((255, 70, 45), (255, 190, 165))}
IV = [(e["led_on"], e["led_off"], e["kind"]) for e in TL["lines"]]
def state(t):
    for a, b, k in IV:
        if a <= t < b: return k
    return "off"

# ---------- screen-space gradients so text reads over the photo -----------------------------
g = Image.new("RGBA", (W, H), (0, 0, 0, 0)); gd = ImageDraw.Draw(g)
for y in range(0, 340): gd.line([(0, y), (W, y)], fill=(0, 0, 0, int(150 * (1 - y / 340) ** 1.4)))
for y in range(1120, H): gd.line([(0, y), (W, y)], fill=(0, 0, 0, int(205 * ((y - 1120) / (H - 1120)) ** 1.3)))
g.save(D / "grad.png")

# ---------- captions ---------------------------------------------------------------------------
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
    out = [[w, remap(s), remap(e)] for w, s, e in out if e > rm["a"]]
    ln = LINES[lid]
    if ln.get("trim_to") and out:
        w = out[0][0]; out[0][0] = "—" + w[w.index(ln["trim_to"]):]
    return out
MERGE = {"l05": [(["nine", "seven", "five,"], "975"), (["oh", "three", "five."], "035.")]}
def merge(lid, ws):
    for seq, rep in MERGE.get(lid, []):
        n = len(seq)
        for i in range(len(ws) - n + 1):
            if [w[0].lower() for w in ws[i:i+n]] == seq:
                ws[i:i+n] = [[rep, ws[i][1], ws[i+n-1][2]]]; break
    return ws
def phrases(ws, maxw=10):
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
            for off in (0, -1, 1, -2, 2, -3, 3):
                j = ideal + off
                if start + 3 <= j <= n - 3 and s[j-1][0].endswith(","): best = j; break
            out.append(s[start:best]); start = best
        out.append(s[start:])
    return out
def ts(t): t = max(0.0, t); return f"{int(t//3600)}:{int(t%3600//60):02d}:{t%60:05.2f}"

TEXT, DIM, WIND = "&H00E8EFF2&", "&H00A8ACB0&", "&H0084888C&"
TAGC = "&H00B8BCC0&"
RXC, TXC = "&H00A0E87C&", "&H005C7AFF&"          # speaker names match the light: green radio, red room
FS, FM = "IBM Plex Mono SemiBold", "IBM Plex Mono Medium"
# 25 Nov re-cut (user: apply Corner's changes): centred, readable captions with a soft dark halo over a
# blurred band; speaker + place label; a title card spelt out for international viewers; the label and
# "Watch the light." after the title.
ev = []
for e in TL["lines"]:
    if e["id"] == "carrier":
        ev.append((e["led_on"] + 0.35, e["led_off"], f"{{\\fn{FS}\\fs40\\c{RXC}\\fsp6\\bord3\\blur4}}[ CARRIER — NO VOICE ]")); continue
    ln = LINES[e["id"]]; hill = ln["who"] != "BASE"
    head = (f"{{\\fn{FS}\\fs29\\c{RXC if hill else TXC}\\fsp7\\bord3\\blur4}}{ln['who']}"
            + (f"{{\\fn{FM}\\fs24\\c{TAGC}\\fsp4}}  ·  ON THE HILL" if hill else "")
            + f"\\N{{\\fn{FS}\\fs56\\c{TEXT}\\fsp0\\bord3\\blur4}}")
    ph = phrases(merge(e["id"], disp_words(e["id"], e["remap"])), maxw=7)
    for i, p in enumerate(ph):
        txt = " ".join(w[0] for w in p).replace("— —", "—")
        start = p[0][1] - 0.05
        stop = ph[i+1][0][1] - 0.05 if i + 1 < len(ph) else min(p[-1][2] + 0.5, e["end"] + 0.25)
        ev.append((start, stop, head + txt))
first = min(a for a, b, t in ev)
ev.insert(0, (first - 0.4, T, "{\\an7\\pos(0,0)\\fad(700,0)\\c&H000000&\\alpha&H70&\\blur48\\bord0\\shad0\\p1}"
              "m 175 1085 l 905 1085 l 905 1450 l 175 1450{\\p0}"))
SH = "\\bord3\\shad0\\3c&H000000&\\3a&H70&\\blur4"
TY = 500                                          # over the map: clear of the radio and its light
ev.append((0.15, 3.9, f"{{\\an5\\pos(540,{TY + 80})\\fad(700,700)\\c&H000000&\\alpha&H3C&\\blur60\\bord0\\shad0\\p1}}m -420 -175 l 420 -175 l 420 175 l -420 175{{\\p0}}"))
ev.append((0.25, 3.9, f"{{\\an5\\pos(540,{TY})\\fad(900,600)\\fn{FS}\\fs70\\c{TEXT}\\fsp24\\t(0,1800,0.5,\\fsp10){SH}}}MOUNTAIN RESCUE"))
ev.append((0.70, 3.9, f"{{\\an5\\pos(540,{TY + 56})\\fad(300,600)\\c{TEXT}\\alpha&H40&\\bord0\\shad0\\fscx0\\t(0,900,0.6,\\fscx100)\\p1}}m 0 0 l 460 0 l 460 3 l 0 3{{\\p0}}"))
ev.append((0.95, 3.9, f"{{\\an5\\pos(540,{TY + 112})\\fad(700,600)\\fn{FS}\\fs40\\c{TEXT}\\fsp9{SH}}}CAIRNGORMS, SCOTLAND"))
ev.append((1.40, 3.9, f"{{\\an5\\pos(540,{TY + 168})\\fad(700,600)\\fn{FS}\\fs33\\c{TEXT}\\fsp10{SH}}}ZERO VISIBILITY"))
ev.append((3.95, 6.6, f"{{\\an5\\pos(540,{TY + 80})\\fad(300,400)\\fn{FS}\\fs60\\c{TEXT}\\fsp2{SH}}}Watch the light."))
ev.append((4.2, T, f"{{\\an8\\pos(540,236)\\fad(800,0)\\fn{FS}\\fs30\\c{TEXT}\\fsp10\\alpha&H20&{SH}}}TRANSMISSION 01 · PART 1"
                   f"\\N{{\\fn{FM}\\fs24\\c{TAGC}\\fsp4}}MOUNTAIN RESCUE CHANNEL · CAIRNGORMS, SCOTLAND"))
(D / "captions2.ass").write_text(
    "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\n\n[V4+ Styles]\n"
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
    "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, "
    "MarginR, MarginV, Encoding\n"
    f"Style: T,{FS},56,{TEXT.rstrip('&')},&H000000FF,&H8C000000,&H00000000,0,0,0,0,100,100,0,0,1,3,0,2,170,170,520,1\n\n"
    "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n" +
    "\n".join(f"Dialogue: 0,{ts(a)},{ts(b)},T,,0,0,0,,{t}" for a, b, t in ev if b > a) + "\n")

print(f"master_social.wav at {social_master():.1f} LUFS")
# ---------- render -----------------------------------------------------------------------------
test = "--test" in sys.argv
t0, dur = (float(sys.argv[sys.argv.index("--test")+1]), float(sys.argv[sys.argv.index("--test")+2])) if test else (0.0, T)
out = D / ("test2.mp4" if test else "body2.mp4")
ff = subprocess.Popen(["ffmpeg", "-y", "-v", "error",
    "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
    "-loop", "1", "-i", str(D / "grad.png"), "-ss", f"{t0:.3f}", "-i", str(AUDIO),
    "-filter_complex", f"[0:v][1:v]overlay=0:0,eq=saturation=0.9:contrast=1.04,noise=alls=10:allf=t,"
                       f"vignette=PI/5,setpts=PTS+{t0:.3f}/TB,ass=captions2.ass,setpts=PTS-STARTPTS,format=yuv420p[v]",
    "-map", "[v]", "-map", "2:a", "-t", f"{dur:.3f}", "-c:v", "libx264", "-preset", "medium", "-crf", "19",
    "-r", str(FPS), "-c:a", "aac", "-b:a", "192k", str(out)], stdin=subprocess.PIPE, cwd=D)
pw, ph_ = base.size
for i in range(int(round(dur * FPS))):
    t = t0 + i / FPS; e = (t / T) ** CFG["ease"]; s = 1 + ZOOM * e
    cx = CFG["c0"][0] + (CFG["c1"][0] - CFG["c0"][0]) * e; cy = CFG["c0"][1] + (CFG["c1"][1] - CFG["c0"][1]) * e
    hw, hh = pw / (2 * s), ph_ / (2 * s)
    cx = min(max(cx, hw), pw - hw); cy = min(max(cy, hh), ph_ - hh)        # never crop past the plate
    img = PL[state(t)]
    if RAIN:
        bb, lay = RAIN.layer(t); img = img.copy()
        img.paste(Image.alpha_composite(img.crop(bb).convert("RGBA"), lay).convert("RGB"), bb[:2])
    ff.stdin.write(img.resize((W, H), Image.LANCZOS, box=(cx - hw, cy - hh, cx + hw, cy + hh), reducing_gap=2.0).tobytes())
ff.stdin.close(); ff.wait()
if ff.returncode: sys.exit("ffmpeg failed")
print(f"{out.name} written ({dur:.1f}s, {len(ev)} caption events)")
if not test:
    # end title: black, then the series card in the same type. Silence: nothing follows that line.
    (D / "bumper2.ass").write_text(
        "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, "
        "MarginR, MarginV, Encoding\n"
        f"Style: T,{FS},58,{TEXT.rstrip('&')},&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,12,0,1,0,0,5,0,0,0,1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        f"Dialogue: 0,0:00:01.10,0:00:03.90,T,,0,0,0,,{{\\fad(700,0)}}TRANSMISSION 01\\N{{\\fn{FM}\\fs26\\c{DIM}\\fsp9}}PART 1 · CREST\n"
        f"Dialogue: 0,0:00:02.10,0:00:03.90,T,,0,0,0,,{{\\an2\\pos(540,1180)\\fad(500,0)\\fn{FM}\\fs28\\c{TEXT}\\fsp6}}FOLLOW FOR PART 2\n")
    run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"color=c=0x050505:s={W}x{H}:r={FPS}",
         "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "3.9", "-vf", "ass=bumper2.ass,format=yuv420p",
         "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-c:a", "aac", "-b:a", "192k", "-shortest",
         str(D / "bumper2.mp4")])
    run(["ffmpeg", "-y", "-v", "error", "-i", str(D / "body2.mp4"), "-i", str(D / "bumper2.mp4"),
         "-filter_complex", "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]", "-map", "[v]", "-map", "[a]",
         "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-c:a", "aac", "-b:a", "192k",
         str(D / "final-transmission01-v2.mp4")])
    print("final-transmission01-v2.mp4 written")
