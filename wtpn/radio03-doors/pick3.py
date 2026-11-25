#!/usr/bin/env python3
"""Choose each line's take from vo/cand: must be heard right (Scribe vs the script), then the accent check
(CommonAccent 'england' margin; on the line if it's long enough, else on its whole take), then range
(semitone spread, against the monotone the user heard on v2). Copies the winner to vo/<id>.mp3 + _align."""
import json, pathlib, re, sys, shutil, difflib, warnings
warnings.filterwarnings("ignore")
D = pathlib.Path(__file__).parent; sys.path.insert(0, str(D)); sys.path.append(str(D.parent / "radio02-corner"))
from accent import margin
from phon import scribe
import parselmouth, numpy as np
S = json.load(open(D / "script.json")); L = {l["id"]: l for l in S["lines"]}
FORCE = dict(a.split("=") for a in sys.argv[1:])          # e.g. r27=2 to override the pick
def toks(s): return re.sub(r"\[[^\]]*\]", " ", s.lower()).replace("o. e. u.", "oeu").translate(str.maketrans("", "", ".,!?'\"…-")).split()
def srange(p):
    f0 = parselmouth.Sound(str(p)).to_pitch(time_step=0.01, pitch_floor=60, pitch_ceiling=400).selected_array["frequency"]
    f0 = f0[f0 > 0]
    if len(f0) < 8: return 0.0
    st = 12 * np.log2(f0 / np.median(f0)); return float(np.percentile(st, 90) - np.percentile(st, 10))
take_m = {}
for t in sorted((D / "vo" / "cand").glob("take_*.mp3")):
    take_m[t.stem.replace("take_", "")] = margin(t, "england")[0]
cache = D / "vo" / "cand" / "scores.json"; sc = json.load(open(cache)) if cache.exists() else {}
out = {}
for k, ln in L.items():
    rows = []
    for c in sorted((D / "vo" / "cand").glob(f"{k}_*.mp3")):
        n = c.stem.split("_")[1]
        if c.stem not in sc:
            ws = scribe(c); heard = " ".join(w["text"] for w in ws)
            acc = difflib.SequenceMatcher(None, toks(ln.get("say", ln["text"])), toks(heard)).ratio()
            d = parselmouth.Sound(str(c)).get_total_duration()
            lm = margin(c, "england")[0] if d >= 1.3 else None
            sc[c.stem] = dict(acc=round(acc, 3), heard=heard, dur=round(d, 2), lm=lm, rng=round(srange(c), 2))
        s = sc[c.stem]; tm = take_m[f"{ln['who']}_{n}"]
        eff = s["lm"] if s["lm"] is not None else tm
        rows.append((n, s, tm, eff, 3 * eff + 0.08 * min(s["rng"], 12)))
    json.dump(sc, open(cache, "w"), indent=1)
    ok = [r for r in rows if r[1]["acc"] >= 0.8] or sorted(rows, key=lambda r: -r[1]["acc"])[:1]
    best = max(ok, key=lambda r: r[4])
    if k in FORCE: best = next(r for r in rows if r[0] == FORCE[k])
    out[k] = best[0]
    shutil.copy(D / "vo" / "cand" / f"{k}_{best[0]}.mp3", D / "vo" / f"{k}.mp3")
    shutil.copy(D / "vo" / "cand" / f"{k}_{best[0]}_align.json", D / "vo" / f"{k}_align.json")
    for r in rows:
        s = r[1]; mark = "*" if r[0] == best[0] else " "
        lm = f"{s['lm']:+.2f}" if s["lm"] is not None else "  -  "
        print(f"{mark}{k}_{r[0]} acc {s['acc']:.2f} line {lm} take {r[2]:+.2f} range {s['rng']:4.1f}st  {s['dur']:4.1f}s  | {s['heard'][:60]}")
json.dump(out, open(D / "vo" / "picks.json", "w"), indent=1)
