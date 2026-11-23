#!/usr/bin/env python3
"""Voice consistency per character: a speaker-verification embedding (GE2E, Resemblyzer) for each
line, scored by cosine similarity to the mean of that character's OTHER lines. A line whose accent
or timbre drifted scores low. Lines under 1.2 s of speech are too short to fingerprint and skipped.
Usage: spk.py <dir with lNN.mp3> [label]"""
import sys, json, pathlib, subprocess, warnings
warnings.filterwarnings("ignore")
sys.path.insert(0, "/tmp/claude-0/stub")             # webrtcvad won't build here; only used to trim silence
import numpy as np
from resemblyzer import VoiceEncoder
D = pathlib.Path(__file__).parent
S = json.loads((D / "script.json").read_text())
src = pathlib.Path(sys.argv[1]); label = sys.argv[2] if len(sys.argv) > 2 else src.name
enc = VoiceEncoder(verbose=False)
def load(p):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    e = np.sqrt(np.convolve(x**2, np.ones(400)/400, "same")); x = x[e > 0.01]   # keep speech only
    return x / (np.abs(x).max() + 1e-9)
out = {}
for who in ("BASE", "EWAN", "CAT"):
    emb = {}
    for l in S["lines"]:
        if l["who"] != who: continue
        x = load(src / f"{l['id']}.mp3")
        if len(x) / 16000 < 1.2: continue
        emb[l["id"]] = enc.embed_utterance(x)
    sims = {}
    for k, v in emb.items():
        others = np.mean([w for kk, w in emb.items() if kk != k], axis=0)
        sims[k] = float(np.dot(v, others) / (np.linalg.norm(v) * np.linalg.norm(others)))
    out[who] = sims
    worst = min(sims, key=sims.get)
    print(f"{label:4} {who:4}  {len(sims):2} lines  mean {np.mean(list(sims.values())):.3f}  "
          f"worst {sims[worst]:.3f} ({worst})  spread {max(sims.values())-min(sims.values()):.3f}")
json.dump(out, open(D / f"spk_{label}.json", "w"), indent=1)
