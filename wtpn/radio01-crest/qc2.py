#!/usr/bin/env python3
"""(a) True mid-word holes in raw takes: a >=40 ms dip >22 dB under the line median, with voiced
audio within 60 ms on BOTH sides, inside a word's letters (punctuation timing excluded).
(b) On/off contrast in the master: bed level just before each transmission vs its first 300 ms."""
import json, pathlib, subprocess
import numpy as np
D = pathlib.Path(__file__).parent
S = json.loads((D / "script.json").read_text())
T = json.loads((D / "timeline.json").read_text())
SR, WIN = 16000, 160
def load(p):
    raw = subprocess.run(["ffmpeg","-v","error","-i",str(p),"-ac","1","-ar",str(SR),"-f","s16le","-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0
def env(x):
    n = len(x)//WIN; return 20*np.log10(np.sqrt(np.mean(x[:n*WIN].reshape(n,WIN)**2,axis=1))+1e-9)
def letters(al):
    ch, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    out, cur, cs, ce, tag = [], "", None, None, False
    for c, s, e in zip(ch, st, en):
        if c == "[": tag = True; continue
        if tag:
            if c == "]": tag = False
            continue
        if c.isalnum() or c == "'":
            if not cur: cs = s
            cur += c; ce = e
        elif cur: out.append((cur, cs, ce)); cur = ""
    if cur: out.append((cur, cs, ce))
    return out
holes = {}
for ln in S["lines"]:
    k = ln["id"]; e = env(load(D/"vo"/f"{k}.mp3")); ws = letters(json.loads((D/"vo"/f"{k}_align.json").read_text()))
    med = np.median(np.concatenate([e[int(s*100):max(int(s*100)+1,int(t*100))] for _, s, t in ws]))
    for w, s, t in ws:
        i0, i1 = int(s*100), int(t*100)
        if i1 - i0 < 8: continue
        run = 0
        for i in range(i0+2, i1-2):
            if e[i] < med - 22:
                run += 1
            else:
                if run >= 4 and e[max(0,i-run-6):i-run].max() > med-10 and e[i:i+6].max() > med-10:
                    holes.setdefault(k, []).append(f"{w}@{(i-run)/100:.2f}s")
                run = 0
print("(a) genuine mid-word holes in the raw takes:", holes if holes else "none")
m = env(load(D/"master.wav"))
print("\n(b) master: bed before -> first 300 ms of transmission (dB)")
jumps = []
for x in T["lines"]:
    if not x["text"] and x["id"] != "carrier": continue
    a = int(x["start"]*100)
    bed = float(np.median(m[max(0,a-40):a-2])); hit = float(np.max(m[a:a+30]))
    jumps.append(hit - bed)
    if x["id"] in ("l01","l02","l04","l07","l19","l20","l24","l25","carrier"):
        print(f"   {x['id']:8} {x['who']:4}  bed {bed:6.1f}  ->  {hit:6.1f}   jump {hit-bed:5.1f} dB")
print(f"   all {len(jumps)} transmissions: median jump {np.median(jumps):.1f} dB, max {max(jumps):.1f} dB")
