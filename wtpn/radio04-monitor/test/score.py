#!/usr/bin/env python3
"""Score every line take: Scribe accuracy vs the script, pitch spread in semitones (a rough proxy for a flat read),
length. Also lists what Scribe hears in the sound effects (the shush must have no words). -> scores.json"""
import json, pathlib, re, uuid, urllib.request, difflib, warnings, sys
warnings.filterwarnings("ignore")
import parselmouth, numpy as np
D = pathlib.Path(__file__).parent; S = json.loads((D / "scene.json").read_text()); L = {l["id"]: l for l in S["lines"]}
def scribe(p):
    b = p.read_bytes(); bd = uuid.uuid4().hex
    parts = [(f'--{bd}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v1\r\n').encode(),
             (f'--{bd}\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n').encode() + b + b"\r\n",
             f'--{bd}--\r\n'.encode()]
    r = urllib.request.Request("https://api.elevenlabs.io/v1/speech-to-text", data=b"".join(parts), method="POST",
        headers={"xi-api-key": "proxy-injected", "Content-Type": f"multipart/form-data; boundary={bd}"})
    d = json.load(urllib.request.urlopen(r, timeout=120)); return d["text"]
def toks(s): return re.sub(r"[\[(][^\])]*[\])]", " ", s.lower()).translate(str.maketrans("", "", ".,!?\"…-")).replace("’", "'").split()
res = {}
for p in sorted((D / "vo").glob("[AB][0-9]_*.mp3")):
    if p.stem.endswith("take"): continue
    k = p.stem.split("_", 1)[1]; heard = scribe(p)
    acc = difflib.SequenceMatcher(None, toks(L[k]["text"]), toks(heard)).ratio()
    snd = parselmouth.Sound(str(p)); f0 = snd.to_pitch(time_step=0.01, pitch_floor=60, pitch_ceiling=400).selected_array["frequency"]; f0 = f0[f0 > 0]
    spread = float(12 * np.log2(np.percentile(f0, 90) / np.percentile(f0, 10))) if len(f0) > 5 else 0.0
    res[p.stem] = dict(acc=round(acc, 2), st=round(spread, 1), dur=round(snd.get_total_duration(), 2), heard=heard)
    print(f"{p.stem:8} acc {acc:.2f}  spread {spread:4.1f}st  {snd.get_total_duration():4.2f}s  | {heard}")
for p in sorted((D / "fx").glob("shush_*.mp3")): print(p.stem, "| heard:", repr(scribe(p)))
json.dump(res, open(D / "scores.json", "w"), indent=1)
