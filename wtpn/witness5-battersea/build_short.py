#!/usr/bin/env python3
"""SHORT-CUT TEST (user-approved 10 Sep: "test the short cut").
Recuts the already-published Battersea master (155s, d1=574 views) to ~60s.
Same case, same voice, same masters — ONLY length changes, so the day-one
number is a single-variable read on whether length is the reach bottleneck."""
import json, subprocess, pathlib, os, sys, re
from PIL import Image, ImageDraw, ImageFont
D = pathlib.Path(__file__).parent
sys.path.insert(0, "/home/user/nbm/wtpn/tools")
from hook_block import hook_block
W, H = 1080, 1920
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
SERIF = "DejaVu Serif"
os.chdir(D)
S = json.loads((D / "script.json").read_text())

def run(cmd): subprocess.run(cmd, check=True, capture_output=True)

def card(name, lines, small=None):
    img = Image.new("RGB", (W, H), (8, 8, 8)); d = ImageDraw.Draw(img)
    f = ImageFont.truetype(MONO, 54); fs = ImageFont.truetype(MONO, 30)
    tot = len(lines) * 78 + (60 if small else 0); y = (H - tot) // 2
    for ln in lines:
        w = d.textlength(ln, font=f); d.text(((W - w) / 2, y), ln, font=f, fill=(216, 214, 205)); y += 78
    if small:
        y += 40
        for ln in small:
            w = d.textlength(ln, font=fs); d.text(((W - w) / 2, y), ln, font=fs, fill=(120, 118, 112)); y += 42
    p = D / f"sc_{name}.png"; img.save(p); return p

def seg_words(k, t0, t1):
    al = json.loads((D / f"{k}_align.json").read_text())
    ch, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    words = []; cur = ""; cs = ce = None; tag = False
    for c, s, e in zip(ch, st, en):
        if c == "[": tag = True; continue
        if tag:
            if c == "]": tag = False
            continue
        if c.isspace():
            if cur: words.append((cur, cs, ce)); cur = ""
        else:
            if not cur: cs = s
            cur += c; ce = e
    if cur: words.append((cur, cs, ce))
    return [(w, s - t0, e - t0) for w, s, e in words
            if (any(c.isalnum() for c in w) or w in ("—", "--")) and s >= t0 - 0.05 and e <= t1 + 0.35]

def ass_for(k, dur, delay, t0, t1):
    phrases = []; buf = []
    for w, s, e in seg_words(k, t0, t1):
        buf.append((w, s + delay, e + delay))
        if w[-1] in ".,?!" or w.endswith("...") or (w.endswith("—") and w != "—"):
            phrases.append(buf); buf = []
    if buf: phrases.append(buf)
    def ts(t):
        t = max(0, t); return f"{int(t//3600)}:{int(t%3600//60):02d}:{t%60:05.2f}"
    ev = []
    for ph in phrases:
        txt = " ".join(w for w, _, _ in ph).rstrip(",").replace("—", "-")
        ev.append(f"Dialogue: 0,{ts(ph[0][1])},{ts(min(dur, ph[-1][2] + 0.35))},W,,0,0,0,,{txt}")
    ass = D / f"sc_{k}.ass"
    ass.write_text(
        "[Script Info]\nPlayResX: 1080\nPlayResY: 1920\n\n[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Alignment, MarginL, MarginR, MarginV, Outline, Shadow, BorderStyle\n"
        f"Style: W,{SERIF},46,&H00CFCDC6,&H00000000,&H96000000,0,0,2,60,60,340,1,1,1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n" + "\n".join(ev) + "\n")
    return ass

GRADE = ("scale=1080:1920:flags=lanczos:force_original_aspect_ratio=increase,crop=1080:1920,"
         "eq=saturation=0.07:contrast=1.22:brightness=-0.06,noise=alls=11:allf=t,vignette=PI/4.2")

def block_card(png, dur, out):
    run(["ffmpeg","-y","-v","error","-loop","1","-i",str(png),"-t",f"{dur:.3f}",
         "-vf","fps=30,noise=alls=6:allf=t","-an","-c:v","libx264","-preset","veryfast",
         "-crf","22","-pix_fmt","yuv420p",str(out)])

def block_voice(k, still, dur, delay, t0, t1, out):
    if still:
        vf = f"{GRADE},zoompan=z='1+0.0009*on':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d={int(dur*30)+2}:s=1080x1920:fps=30"
        inp = ["-loop","1","-i",str(still)]
    else:
        vf = "noise=alls=9:allf=t"
        inp = ["-f","lavfi","-i","color=c=0x0a0a0a:s=1080x1920:r=30"]
    run(["ffmpeg","-y","-v","error"]+inp+["-t",f"{dur:.3f}",
         "-vf", vf + f",ass={ass_for(k, dur, delay, t0, t1).name}","-an",
         "-c:v","libx264","-preset","veryfast","-crf","22","-pix_fmt","yuv420p",str(out)])

# --- trim the two kept answers out of the processed segments ---
TRIMS = {"b_s3": (0.00, 24.60), "b_s5": (13.74, 26.34)}
for k, (a, b) in TRIMS.items():
    run(["ffmpeg","-y","-v","error","-i",f"{k}-t.mp3","-af",
         f"atrim={a:.3f}:{b:.3f},asetpts=N/SR/TB,afade=t=in:d=0.06,afade=t=out:st={b-a-0.12:.3f}:d=0.12",
         "-c:a","libmp3lame","-q:a","2",f"sc_{k}.mp3"])

def alen(f):
    r = subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f],
                       capture_output=True, text=True)
    return float(r.stdout.strip())

C = S["cards"]
blocks = [
 ("hook", "b_open", alen("b_open-t.mp3") + 0.9, None, 0.45, None),
 ("card", card("t1", C["t1"]["big"], C["t1"]["small"]), 1.8, None, 0, None),
 ("card", card("q3", C["q3"]), 1.0, None, 0, None),
 ("voice", "b_s3", alen("sc_b_s3.mp3") + 0.4, D/"../ep41-cooneen/s1-bedroom.jpg", 0.15, TRIMS["b_s3"]),
 ("voice", "b_s5", alen("sc_b_s5.mp3") + 0.6, D/"../ep45-sauchie/s6-house-night.jpg", 0.15, TRIMS["b_s5"]),
 ("card", card("t6", ["She told the BBC the same story", "in 2021, in her eighties.", "", "She never changed a word."]), 2.0, None, 0, None),
]
concat, t, marks = [], 0.0, {}
for i, b in enumerate(blocks):
    out = D / f"sc_b{i:02d}.mp4"
    if b[0] == "card":
        block_card(b[1], b[2], out)
    elif b[0] == "hook":
        hook_block(D, b[1], S["hook_card"], b[2], out); marks[b[1]] = t + b[4]
    else:
        t0, t1 = b[5]
        block_voice(b[1], b[3], b[2], b[4], t0, t1, out); marks[b[1]] = t + b[4]
    concat.append(out); t += b[2]
(D / "concat_short.txt").write_text("".join(f"file '{p.name}'\n" for p in concat))
run(["ffmpeg","-y","-v","error","-f","concat","-safe","0","-i","concat_short.txt","-c","copy","video-short.mp4"])
plan = {"D": round(t,3), "marks": {k: round(v,3) for k,v in marks.items()},
        "hiss_end": round(marks["b_s5"] + alen("sc_b_s5.mp3") + 0.4, 3)}
(D / "plan_short.json").write_text(json.dumps(plan, indent=1))
print(f"short body {t:.2f}s"); print(json.dumps(plan, indent=1))
