#!/usr/bin/env python3
"""WITNESS pilot builder — Enfield / WPC Heeps. Block-based: text cards + voiced blocks."""
import json, subprocess, pathlib
from PIL import Image, ImageDraw, ImageFont

D = pathlib.Path(__file__).parent
W, H = 1080, 1920
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
SERIF = "DejaVu Serif"

def run(cmd): subprocess.run(cmd, check=True, capture_output=True)

def card(name, lines, small=None):
    img = Image.new("RGB", (W, H), (8, 8, 8))
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(MONO, 54)
    fs = ImageFont.truetype(MONO, 30)
    tot = len(lines) * 78 + (60 if small else 0)
    y = (H - tot) // 2
    for ln in lines:
        w = d.textlength(ln, font=f)
        d.text(((W - w) / 2, y), ln, font=f, fill=(216, 214, 205))
        y += 78
    if small:
        y += 40
        for ln in small:
            w = d.textlength(ln, font=fs)
            d.text(((W - w) / 2, y), ln, font=fs, fill=(120, 118, 112))
            y += 42
    p = D / f"card_{name}.png"
    img.save(p)
    return p

def seg_words(k):
    al = json.loads((D / f"{k}_align.json").read_text())
    ch, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    words = []; cur = ""; cs = ce = None; tag = False
    for c, s, e in zip(ch, st, en):
        if c == "<": tag = True; continue
        if tag:
            if c == ">": tag = False
            continue
        if c.isspace():
            if cur: words.append((cur, cs, ce)); cur = ""
        else:
            if not cur: cs = s
            cur += c; ce = e
    if cur: words.append((cur, cs, ce))
    return words

def ass_for(k, dur):
    words = seg_words(k)
    phrases = []; buf = []
    for w, s, e in words:
        buf.append((w, s, e))
        if w[-1] in ".,?!":
            phrases.append(buf); buf = []
    if buf: phrases.append(buf)
    def ts(t):
        t = max(0, t); hh = int(t // 3600); mm = int(t % 3600 // 60); ss = t % 60
        return f"{hh}:{mm:02d}:{ss:05.2f}"
    ev = []
    for ph in phrases:
        txt = " ".join(w for w, _, _ in ph).rstrip(",")
        ev.append(f"Dialogue: 0,{ts(ph[0][1])},{ts(min(dur, ph[-1][2] + 0.35))},W,,0,0,0,,{txt}")
    ass = D / f"cap_{k}.ass"
    ass.write_text(
        "[Script Info]\nPlayResX: 1080\nPlayResY: 1920\n\n[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Alignment, MarginL, MarginR, MarginV, Outline, Shadow, BorderStyle\n"
        f"Style: W,{SERIF},46,&H00CFCDC6,&H00000000,&H96000000,0,0,2,60,60,340,1,1,1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n" + "\n".join(ev) + "\n")
    return ass

GRADE_STILL = ("scale=1080:1920:flags=lanczos:force_original_aspect_ratio=increase,crop=1080:1920,"
               "eq=saturation=0.07:contrast=1.22:brightness=-0.06,noise=alls=11:allf=t,vignette=PI/4.2")

def block_card(name, png, dur, out):
    run(["ffmpeg", "-y", "-v", "error", "-loop", "1", "-i", str(png), "-t", f"{dur:.3f}",
         "-vf", "fps=30,noise=alls=6:allf=t", "-an",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", str(out)])

def block_voice(k, still, dur, out):
    vf = (f"{GRADE_STILL},zoompan=z='1+0.0009*on':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d={int(dur*30)+2}:s=1080x1920:fps=30"
          if still else "noise=alls=9:allf=t")
    inp = ["-loop", "1", "-i", str(still)] if still else ["-f", "lavfi", "-i", f"color=c=0x0a0a0a:s=1080x1920:r=30"]
    vf_final = vf + f",ass={ass_for(k, dur).name}"
    run(["ffmpeg", "-y", "-v", "error"] + inp + ["-t", f"{dur:.3f}", "-vf", vf_final, "-an",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", str(out)])

import os
os.chdir(D)
SA = pathlib.Path("../ep45-sauchie")

def alen(k):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f"{k}.mp3"],
                       capture_output=True, text=True)
    return float(r.stdout.strip())

blocks = [
 ("card", card("t1", ["August 1977.", "Enfield, North London."]), 2.8, None),
 ("card", card("t2", ["A police officer is called", "to a council house", "at 1 a.m."]), 3.0, None),
 ("card", card("t3", ["This is her account."], ["Dramatised from WPC Carolyn Heeps'", "signed statement and broadcast interviews."]), 3.6, None),
 ("voice", "s1", alen("s1") + 0.7, SA / "s5-recorder.jpg"),
 ("card", card("q1", ["What did you see?"]), 2.2, None),
 ("voice", "s2", alen("s2") + 0.8, SA / "s3-parlour.jpg"),
 ("card", card("q2", ["Could anything have moved it?"]), 2.2, None),
 ("voice", "s3", alen("s3") + 0.8, None),
 ("card", card("q3", ["What did you do?"]), 2.0, None),
 ("voice", "s4", alen("s4") + 0.7, SA / "s6-house-night.jpg"),
 ("card", card("t4", ["She signed her statement", "on the 10th of September, 1977."]), 2.6, None),
 ("voice", "s5", alen("s5") + 0.9, None),
 ("card", card("t5", ["She repeated it on camera", "in 1978."]), 2.4, None),
 ("card", card("t5b", ["She never withdrew it."]), 2.6, None),
 ("card", card("t6", ["More than thirty witnesses followed.", "The case ran eighteen months."]), 3.0, None),
]

concat, t, marks = [], 0.0, {}
for i, b in enumerate(blocks):
    out = D / f"b{i:02d}.mp4"
    if b[0] == "card":
        block_card(i, b[1], b[2], out)
    else:
        k = b[1]
        block_voice(k, b[3], b[2], out)
        marks[k] = t
    concat.append(out); t += b[2]
D_total = t
print(f"body {D_total:.2f}s  voice offsets: " + " ".join(f"{k}={v:.2f}" for k, v in marks.items()))

(D / "concat.txt").write_text("".join(f"file '{p.name}'\n" for p in concat))
run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", "video-main.mp4"])

# audio: voices at offsets; slide-sting at s2 'slide' word; hiss until tape-off after s5; clicks
w2 = seg_words("s2"); slide_t = marks["s2"] + [s for w, s, e in w2 if w.startswith("slide")][0]
hiss_end = marks["s5"] + alen("s5") + 0.4
plan = {"D": D_total, "slide": slide_t, "hiss_end": hiss_end, "marks": marks}
(D / "plan.json").write_text(json.dumps(plan, indent=1))
print(json.dumps(plan, indent=1))
