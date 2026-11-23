#!/usr/bin/env python3
"""Audio QC without ears. For each transmission: dropouts inside words in the raw take,
level at each pause-tightening splice, and how far the wind swings between words once the
radio compressor has it (pumping). Usage: qc.py [--brief]"""
import json, pathlib, subprocess, sys
import numpy as np
D = pathlib.Path(__file__).parent
S = json.loads((D / "script.json").read_text()); L = {l["id"]: l for l in S["lines"]}
TL = {e["id"]: e for e in json.loads((D / "timeline.json").read_text())["lines"]}
SR = 16000; WIN = 160                                  # 10 ms windows

def load(p):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-ac", "1", "-ar", str(SR),
                          "-f", "s16le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0
def env(x):
    n = len(x) // WIN
    r = np.sqrt(np.mean(x[:n*WIN].reshape(n, WIN) ** 2, axis=1) + 1e-12)
    return 20 * np.log10(r)
def words(al):
    ch, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    out, cur, cs, ce, tag = [], "", None, None, False
    for c, s, e in zip(ch, st, en):
        if c == "[": tag = True; continue
        if tag:
            if c == "]": tag = False
            continue
        if c.isspace():
            if cur: out.append((cur, cs, ce)); cur = ""
        else:
            if not cur: cs = s
            cur += c; ce = e
    if cur: out.append((cur, cs, ce))
    return [w for w in out if any(x.isalnum() for x in w[0])]
def seg(e, a, b):
    i, j = int(a * 100), int(b * 100)
    return e[max(0, i):max(i + 1, j)]

rows = []
for k, ln in L.items():
    al = json.loads((D / "vo" / f"{k}_align.json").read_text()); ws = words(al)
    # 1) dropouts inside words in the RAW take: >22 dB under the line's voiced median for >=40 ms
    er = env(load(D / "vo" / f"{k}.mp3"))
    voiced = np.concatenate([seg(er, s, e) for _, s, e in ws])
    med = float(np.median(voiced))
    drops = []
    for w, s, e in ws:
        z = seg(er, s + 0.03, e - 0.03)
        run = 0
        for v in z:
            run = run + 1 if v < med - 22 else 0
            if run == 4: drops.append(w)
    # 2) splices: level either side of each cut in the dry voice
    rm = TL[k]["remap"]; splice_hot = 0
    ed = env(load(D / "stations" / f"{k}_n.wav"))
    for p, r in rm["cuts"]:
        tpos = (p - rm["a"] - sum(rr for pp, rr in rm["cuts"] if pp < p)) / rm["tempo"]
        around = seg(ed, tpos - 0.03, tpos + 0.03)
        if len(around) and float(around.max()) > -48: splice_hot += 1
    # 3) pumping: wind level in the gaps between words, after the radio chain
    pump = None
    if ln["who"] != "BASE" and ln.get("wind"):
        es = env(load(D / "stations" / f"{k}_st.wav"))
        def loc(t): return 0.06 + max(0.0, t - rm["a"] - sum(rr for pp, rr in rm["cuts"] if pp < t)) / rm["tempo"]
        lw = [(loc(s), loc(e)) for _, s, e in ws]
        vmed = float(np.median(np.concatenate([seg(es, a, b) for a, b in lw])))
        gaps = [float(np.median(seg(es, a2 + 0.03, b1 - 0.03))) for (_, a2), (b1, _) in zip(lw, lw[1:]) if b1 - a2 > 0.14]
        if gaps: pump = (vmed, min(gaps), max(gaps))
    rows.append((k, ln["who"], len(ws), drops, len(rm["cuts"]), splice_hot, pump))

print(f"{'line':5} {'who':4} {'dropouts in raw take':28} {'cuts':>4} {'hot':>3}  pumping (voice / wind-gap min..max dB)")
for k, who, nw, drops, nc, hot, pump in rows:
    p = f"{pump[0]:6.1f} / {pump[1]:6.1f}..{pump[2]:6.1f}  swing {pump[2]-pump[1]:4.1f}  under-voice {pump[0]-pump[2]:4.1f}" if pump else ""
    print(f"{k:5} {who:4} {(', '.join(drops) if drops else '-')[:28]:28} {nc:4} {hot:3}  {p}")
tot_c = sum(r[4] for r in rows); tot_h = sum(r[5] for r in rows)
print(f"\nsplices: {tot_c} total, {tot_h} landing on audible material (> -48 dBFS within 30 ms)")
print(f"lines with raw-take dropouts: {[r[0] for r in rows if r[3]]}")
