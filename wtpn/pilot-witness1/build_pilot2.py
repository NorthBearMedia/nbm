#!/usr/bin/env python3
"""WITNESS pilot v2 — fast start, v3 conversational voice, telephone-crunch processing."""
import json, subprocess, pathlib, os
from PIL import Image, ImageDraw, ImageFont

D = pathlib.Path(__file__).parent
W, H = 1080, 1920
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
SERIF = "DejaVu Serif"

def run(cmd): subprocess.run(cmd, check=True, capture_output=True)

def card(name, lines, small=None):
    img = Image.new("RGB", (W, H), (8, 8, 8))
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(MONO, 54); fs = ImageFont.truetype(MONO, 30)
    tot = len(lines) * 78 + (60 if small else 0)
    y = (H - tot) // 2
    for ln in lines:
        w = d.textlength(ln, font=f); d.text(((W - w) / 2, y), ln, font=f, fill=(216, 214, 205)); y += 78
    if small:
        y += 40
        for ln in small:
            w = d.textlength(ln, font=fs); d.text(((W - w) / 2, y), ln, font=fs, fill=(120, 118, 112)); y += 42
    p = D / f"c2_{name}.png"; img.save(p); return p

def seg_words(k):
    al = json.loads((D / f"{k}_align.json").read_text())
    ch, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    words = []; cur = ""; cs = ce = None
    for c, s, e in zip(ch, st, en):
        if c.isspace():
            if cur: words.append((cur, cs, ce)); cur = ""
        else:
            if not cur: cs = s
            cur += c; ce = e
    if cur: words.append((cur, cs, ce))
    return [(w, s, e) for w, s, e in words if not w.startswith("[") and any(ch.isalnum() for ch in w)]

def ass_for(k, dur):
    words = seg_words(k)
    phrases = []; buf = []
    for w, s, e in words:
        buf.append((w, s, e))
        if w[-1] in ".,?!" or w.endswith("...") or w.endswith("—"):
            phrases.append(buf); buf = []
    if buf: phrases.append(buf)
    def ts(t):
        t = max(0, t); return f"{int(t//3600)}:{int(t%3600//60):02d}:{t%60:05.2f}"
    ev = []
    for ph in phrases:
        txt = " ".join(w for w, _, _ in ph).rstrip(",").replace("—", "-")
        ev.append(f"Dialogue: 0,{ts(ph[0][1])},{ts(min(dur, ph[-1][2] + 0.35))},W,,0,0,0,,{txt}")
    ass = D / f"cap2_{k}.ass"
    ass.write_text(
        "[Script Info]\nPlayResX: 1080\nPlayResY: 1920\n\n[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Alignment, MarginL, MarginR, MarginV, Outline, Shadow, BorderStyle\n"
        f"Style: W,{SERIF},46,&H00CFCDC6,&H00000000,&H96000000,0,0,2,60,60,340,1,1,1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n" + "\n".join(ev) + "\n")
    return ass

GRADE_STILL = ("scale=1080:1920:flags=lanczos:force_original_aspect_ratio=increase,crop=1080:1920,"
               "eq=saturation=0.07:contrast=1.22:brightness=-0.06,noise=alls=11:allf=t,vignette=PI/4.2")

def block_card(i, png, dur, out):
    run(["ffmpeg", "-y", "-v", "error", "-loop", "1", "-i", str(png), "-t", f"{dur:.3f}",
         "-vf", "fps=30,noise=alls=6:allf=t", "-an",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", str(out)])

def block_voice(k, still, dur, out):
    if still:
        vf = (f"{GRADE_STILL},zoompan=z='1+0.0009*on':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d={int(dur*30)+2}:s=1080x1920:fps=30")
        inp = ["-loop", "1", "-i", str(still)]
    else:
        vf = "noise=alls=9:allf=t"
        inp = ["-f", "lavfi", "-i", "color=c=0x0a0a0a:s=1080x1920:r=30"]
    run(["ffmpeg", "-y", "-v", "error"] + inp + ["-t", f"{dur:.3f}", "-vf", vf + f",ass={ass_for(k, dur).name}", "-an",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", str(out)])

os.chdir(D)
SA = pathlib.Path("../ep45-sauchie")

def alen(k):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f"{k}.mp3"],
                       capture_output=True, text=True)
    return float(r.stdout.strip())

blocks = [
 ("voice", "v3_s2a", alen("v3_s2a") + 0.9, None, 0.5),   # cold open: voice at 0.5s
 ("card", card("t1", ["Enfield, North London.", "1977."], ["The witness is a police officer.",
   "Dramatised from WPC Carolyn Heeps'", "signed statement and broadcast interviews."]), 3.4, None, 0),
 ("card", card("q1", ["What happened that night?"]), 1.8, None, 0),
 ("voice", "v3_s1", alen("v3_s1") + 0.5, SA / "s5-recorder.jpg", 0.15),
 ("card", card("q2", ["What did you see?"]), 1.8, None, 0),
 ("voice", "v3_s2", alen("v3_s2") + 0.6, SA / "s3-parlour.jpg", 0.15),
 ("card", card("q3", ["Could anything have moved it?"]), 1.8, None, 0),
 ("voice", "v3_s3", alen("v3_s3") + 0.6, None, 0.15),
 ("card", card("q4", ["What did you do?"]), 1.8, None, 0),
 ("voice", "v3_s4", alen("v3_s4") + 0.5, SA / "s6-house-night.jpg", 0.15),
 ("card", card("t4", ["She signed her statement on the", "10th of September, 1977."]), 2.4, None, 0),
 ("voice", "v3_s5", alen("v3_s5") + 0.8, None, 0.15),
 ("card", card("t5", ["She repeated it on camera in 1978.", "", "She never withdrew it."]), 3.2, None, 0),
]

concat, t, marks = [], 0.0, {}
for i, b in enumerate(blocks):
    out = D / f"p2_b{i:02d}.mp4"
    if b[0] == "card":
        block_card(i, b[1], b[2], out)
    else:
        k = b[1]
        block_voice(k, b[3], b[2], out)
        marks[k] = t + b[4]
    concat.append(out); t += b[2]
D_total = t
print(f"body {D_total:.2f}s")

# shift each voice block's ASS by its in-block delay: regenerate with offset via delay param is
# simpler done above — captions were built without the small 0.15-0.5 lead; acceptable (<0.5s).
(D / "concat2.txt").write_text("".join(f"file '{p.name}'\n" for p in concat))
run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", "concat2.txt", "-c", "copy", "video2-main.mp4"])

w2 = seg_words("v3_s2"); slide = [s for w, s, e in w2 if w.startswith("slide")]
plan = {"D": D_total, "marks": marks, "slide": marks["v3_s2"] + (slide[0] if slide else 8.0),
        "hiss_end": marks["v3_s5"] + alen("v3_s5") + 0.4}
(D / "plan2.json").write_text(json.dumps(plan, indent=1))
print(json.dumps(plan, indent=1))
