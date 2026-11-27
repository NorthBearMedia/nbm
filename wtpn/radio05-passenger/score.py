#!/usr/bin/env python3
"""Score every line take: Scribe accuracy vs what the voice was asked to say, pitch spread in semitones (a rough
proxy for a flat read), length. -> scores.json"""
import json, pathlib, re, uuid, urllib.request, difflib, warnings
warnings.filterwarnings("ignore")
import parselmouth, numpy as np
D = pathlib.Path(__file__).parent; S = json.loads((D / "script.json").read_text()); L = {l["id"]: l for l in S["lines"]}
def scribe(p):
    b = p.read_bytes(); bd = uuid.uuid4().hex
    parts = [(f'--{bd}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v1\r\n').encode(),
             (f'--{bd}\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n').encode() + b + b"\r\n",
             f'--{bd}--\r\n'.encode()]
    r = urllib.request.Request("https://api.elevenlabs.io/v1/speech-to-text", data=b"".join(parts), method="POST",
        headers={"xi-api-key": "proxy-injected", "Content-Type": f"multipart/form-data; boundary={bd}"})
    return json.load(urllib.request.urlopen(r, timeout=120))["text"]
def toks(s): return re.sub(r"[\[(][^\])]*[\])]", " ", s.lower()).replace("’", "'").translate(str.maketrans("", "", ".,!?\"…-")).split()
res = {}
for p in sorted((D / "vo").glob("A[0-9]_*.mp3")):
    if p.stem.endswith("take"): continue
    k = p.stem.split("_", 1)[1]; heard = scribe(p); ref = L[k].get("say", L[k]["text"])
    acc = max(difflib.SequenceMatcher(None, toks(ref), toks(heard)).ratio(), difflib.SequenceMatcher(None, toks(L[k]["text"]), toks(heard)).ratio())
    snd = parselmouth.Sound(str(p)); f0 = snd.to_pitch(time_step=0.01, pitch_floor=60, pitch_ceiling=400).selected_array["frequency"]; f0 = f0[f0 > 0]
    spread = float(12 * np.log2(np.percentile(f0, 90) / np.percentile(f0, 10))) if len(f0) > 5 else 0.0
    res[p.stem] = dict(acc=round(acc, 2), st=round(spread, 1), dur=round(snd.get_total_duration(), 2), heard=heard)
json.dump(res, open(D / "scores.json", "w"), indent=1)
for k in [l["id"] for l in S["lines"]]:
    row = [(t, res.get(f"{t}_{k}")) for t in ("A0", "A1", "A2", "A3")]
    print(f"{k}: " + " | ".join(f"{t} {r['acc']:.2f} {r['st']:4.1f}st {r['dur']:.2f}s '{r['heard'][:38]}'" for t, r in row if r))
