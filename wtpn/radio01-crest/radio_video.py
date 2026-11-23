#!/usr/bin/env python3
"""TRANSMISSION video builder. One locked-off plate; everything else is driven by the audio
timeline. LED green while the hill is transmitting (receive), red while Base keys up in the
room. Captions are a transcript: speaker, a dim [wind] tag on every hill transmission, and none
on the last one, so the payoff survives with the sound off."""
import json, pathlib, subprocess
from PIL import Image, ImageDraw, ImageFilter

D = pathlib.Path(__file__).parent
S = json.loads((D / "script.json").read_text())
TL = json.loads((D / "timeline.json").read_text())
LINES = {l["id"]: l for l in S["lines"]}
W, H, FPS = 1080, 1920, 30
def run(c): subprocess.run(c, check=True, capture_output=True)

# ---------- LED layers: green = receiving, red = transmitting -----------------------------
LED = tuple(json.load(open(D / "led.json"))["led"])
def led_layer(path, glow, core):
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)
    for rad, a in ((126, 22), (86, 36), (52, 66), (28, 150)):
        ld.ellipse([LED[0]-rad, LED[1]-rad, LED[0]+rad, LED[1]+rad], fill=glow + (a,))
    lay = lay.filter(ImageFilter.GaussianBlur(18))
    ImageDraw.Draw(lay).ellipse([LED[0]-13, LED[1]-13, LED[0]+13, LED[1]+13], fill=core + (255,))
    lay.save(path)
led_layer(D / "led_rx.png", (70, 240, 120), (190, 255, 205))
led_layer(D / "led_tx.png", (255, 74, 50), (255, 176, 150))

# ---------- captions -------------------------------------------------------------------------
def disp_words(lid, rm):
    """Words as displayed: keep standalone em-dashes, drop [delivery tags], remap to timeline."""
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
    if ln.get("trim_to") and out:                      # we join mid-word: show it
        w = out[0][0]; out[0][0] = "—" + w[w.index(ln["trim_to"]):]
    return out

# grid refs read as digits in a radio log; merged at word level so caption splits can't break them
MERGE = {"l05": [(["nine", "seven", "five,"], "975"), (["oh", "three", "five."], "035.")]}

def merge(lid, ws):
    for seq, rep in MERGE.get(lid, []):
        n = len(seq)
        for i in range(len(ws) - n + 1):
            if [w[0].lower() for w in ws[i:i+n]] == seq:
                ws[i:i+n] = [[rep, ws[i][1], ws[i+n-1][2]]]; break
    return ws

def phrases(ws, maxw=10):
    """Sentences first. Only a sentence longer than two caption lines is split, and then at the
    comma nearest its middle, so nothing is left orphaned (no lone 'can.' or 'fac—')."""
    sents, buf = [], []
    for w in ws:
        buf.append(w)
        if w[0][-1] in ".?!" or (w[0].endswith("—") and w[0] != "—"):
            sents.append(buf); buf = []
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

def ts(t):
    t = max(0.0, t); return f"{int(t//3600)}:{int(t%3600//60):02d}:{t%60:05.2f}"

OFFW, DIM, DIMMER = "&H00DCE5E8&", "&H009EA0A0&", "&H0080838A&"
ev = []
for e in TL["lines"]:
    if e["id"] == "carrier":
        ev.append((e["led_on"] + 0.35, e["led_off"],
                   f"{{\\fs33\\c{DIMMER}\\fsp3}}[CARRIER — NO VOICE]"))
        continue
    ln = LINES[e["id"]]
    hill = ln["who"] != "BASE"
    tag = f"{{\\fs28\\c{DIMMER}\\fsp2}}   [wind]" if (hill and ln.get("wind")) else ""
    head = f"{{\\fs33\\c{DIM}\\fsp5}}{ln['who']}{tag}\\N{{\\fs52\\c{OFFW}\\fsp0}}"
    ph = phrases(merge(e["id"], disp_words(e["id"], e["remap"])))
    for i, p in enumerate(ph):
        txt = " ".join(w[0] for w in p).replace("— —", "—")
        start = p[0][1] - 0.05
        stop = ph[i+1][0][1] - 0.05 if i + 1 < len(ph) else min(p[-1][2] + 0.5, e["end"] + 0.25)
        ev.append((start, stop, head + txt))

T = TL["total"]
ev.append((0.10, 2.40, "{\\an8\\pos(540,150)\\fad(220,320)\\fs50\\c" + OFFW + "\\fsp2}Watch the light."))
ev.append((2.40, T, "{\\an8\\pos(540,92)\\fad(450,0)\\fs30\\c" + DIM + "\\fsp9}TRANSMISSION 01"
                    "\\N{\\fs25\\c" + DIMMER + "\\fsp4}MOUNTAIN RESCUE CHANNEL · CAIRNGORMS"))

(D / "captions.ass").write_text(
    "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\n\n"
    "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
    "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
    "Alignment, MarginL, MarginR, MarginV, Encoding\n"
    f"Style: T,DejaVu Sans Mono,46,{OFFW.rstrip('&')},&H000000FF,&H00000000,&H96000000,0,0,0,0,100,100,0,0,1,0,2,2,90,90,400,1\n\n"
    "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n" +
    "\n".join(f"Dialogue: 0,{ts(a)},{ts(b)},T,,0,0,0,,{t}" for a, b, t in ev) + "\n")

# ---------- render ---------------------------------------------------------------------------
def enable(kind):
    iv = [(e["led_on"], e["led_off"]) for e in TL["lines"] if e["kind"] == kind]
    return "+".join(f"between(t,{a:.3f},{b:.3f})" for a, b in iv)

run(["ffmpeg", "-y", "-v", "error",
     "-loop", "1", "-framerate", str(FPS), "-i", str(D / "plate.png"),
     "-loop", "1", "-framerate", str(FPS), "-i", str(D / "led_rx.png"),
     "-loop", "1", "-framerate", str(FPS), "-i", str(D / "led_tx.png"),
     "-i", str(D / "master.wav"),
     "-filter_complex",
     f"[0:v][1:v]overlay=0:0:enable='{enable('rx')}'[a];"
     f"[a][2:v]overlay=0:0:enable='{enable('tx')}'[b];"
     f"[b]noise=alls=8:allf=t,vignette=PI/4.6,ass=captions.ass,format=yuv420p[v]",
     "-map", "[v]", "-map", "3:a", "-t", f"{T:.3f}",
     "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-r", str(FPS),
     "-c:a", "aac", "-b:a", "192k", str(D / "body.mp4")])

# series bumper: black, then the title. silence — nothing should follow that last line.
(D / "bumper.ass").write_text(
    "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[V4+ Styles]\n"
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
    "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, "
    "MarginR, MarginV, Encoding\n"
    f"Style: T,DejaVu Sans Mono,56,{OFFW.rstrip('&')},&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,10,0,1,0,0,5,0,0,0,1\n\n"
    "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    "Dialogue: 0,0:00:01.10,0:00:03.40,T,,0,0,0,,{\\fad(700,0)}TRANSMISSION 01\\N{\\fs26\\c" + DIMMER + "\\fsp8}CREST\n")
run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"color=c=0x050505:s={W}x{H}:r={FPS}",
     "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "3.4",
     "-vf", "ass=bumper.ass,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
     "-c:a", "aac", "-b:a", "192k", "-shortest", str(D / "bumper.mp4")])

run(["ffmpeg", "-y", "-v", "error", "-i", str(D / "body.mp4"), "-i", str(D / "bumper.mp4"),
     "-filter_complex", "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]", "-map", "[v]", "-map", "[a]",
     "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "192k",
     str(D / "final-transmission01.mp4")])
print(f"final-transmission01.mp4 written ({len(ev)} caption events)")
