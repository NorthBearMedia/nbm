#!/usr/bin/env python3
"""Draft 2 line picker. For every cut (R* = stability 0.5, Q* = stability 0.0), from the Scribe-cut align files:
words right (acc), pitch movement in semitones (spread; under ~4 reads flat), voiced share of the speech (a real
whisper is mostly unvoiced). Prints a table per line; writes picks2.json with the best take per line."""
import json, pathlib, re, difflib, subprocess, warnings
warnings.filterwarnings("ignore")
import numpy as np, parselmouth
D = pathlib.Path(__file__).parent; S = json.loads((D / "script.json").read_text()); VO = D / "vo"
def tok(s): return [w.strip("'") for w in re.sub(r"[^a-z0-9' ]", " ", re.sub(r"\[[^\]]*\]", " ", s.lower()).replace("’", "'").replace("-", " ")).split()]
def norm_ar(s): return " ".join(tok(s)).replace("all right", "alright").replace("seat belt", "seatbelt").replace("bosemore", "boze moor").replace("bose moor", "boze moor").split()
res = {}
for l in S["lines"]:
    k = l["id"]; wh = "whisper" in l["tag"]; rows = []
    for pfx in ("R0", "R1", "R2", "Q0", "Q1", "Q2"):
        ap = VO / f"{pfx}_{k}_align.json"
        if not ap.exists(): continue
        a = json.loads(ap.read_text())
        acc = difflib.SequenceMatcher(None, norm_ar(l.get("say", l["text"])), norm_ar(a["heard"])).ratio()
        x = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", str(VO / f"{pfx}_{k}.mp3"), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                                         capture_output=True).stdout, np.float32).astype(np.float64)
        s = x[int(max(0, a["start"] - 0.02) * 16000): int((a["end"] + 0.05) * 16000)]
        if len(s) < 800: continue
        snd = parselmouth.Sound(s, 16000); f0 = snd.to_pitch(time_step=0.01, pitch_floor=70, pitch_ceiling=400).selected_array["frequency"]
        e = np.array([np.sqrt(np.mean(s[i:i + 160] ** 2)) for i in range(0, len(s) - 160, 160)]); sp_ = e > e.max() * 0.1
        n = min(len(f0), len(sp_)); vf = float((f0[:n][sp_[:n]] > 0).mean()) if sp_[:n].any() else 0.0
        v = f0[f0 > 0]; spread = float(12 * np.log2(np.percentile(v, 90) / np.percentile(v, 10))) if len(v) > 5 else 0.0
        score = acc * 2 + (1 - vf if wh else min(spread, 12) / 12)
        rows.append(dict(take=pfx, acc=round(acc, 2), spread=round(spread, 1), voiced=round(vf, 2), dur=round(a["end"] - a["start"], 2),
                         gap=a["gap_after_in_take"], heard=a["heard"], score=round(score, 3)))
    rows.sort(key=lambda r: -r["score"]); res[k] = rows
    print(f"{k} {'(whisper)' if wh else '         '} " + " | ".join(f"{r['take']} {r['acc']:.2f} {r['spread']:4.1f}st v{int(r['voiced']*100):2d}%" for r in rows[:4]) +
          f"   <- '{rows[0]['heard'][:34]}'")
json.dump({k: v[0]["take"] for k, v in res.items()}, open(D / "picks2.json", "w"), indent=1)
json.dump(res, open(D / "scores2.json", "w"), indent=1)
