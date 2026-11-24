#!/usr/bin/env python3
"""Score the auditions: Scribe word accuracy against the passage, CommonAccent cosines (england vs us),
median pitch (parselmouth) and words per second. Writes aud/scores.json."""
import json, pathlib, re, sys, uuid, urllib.request, difflib, warnings
warnings.filterwarnings("ignore")
sys.path.insert(0, str(pathlib.Path(__file__).parent)); sys.path.append(str(pathlib.Path(__file__).parent.parent / "radio02-corner"))
from accent import _clf, _load, _labels
import parselmouth, numpy as np
from audition import PASS
D = pathlib.Path(__file__).parent
def scribe(p):
    b = p.read_bytes(); bd = uuid.uuid4().hex
    parts = [(f'--{bd}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v1\r\n').encode(),
             (f'--{bd}\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n').encode() + b + b"\r\n",
             f'--{bd}--\r\n'.encode()]
    r = urllib.request.Request("https://api.elevenlabs.io/v1/speech-to-text", data=b"".join(parts), method="POST",
        headers={"xi-api-key": "proxy-injected", "Content-Type": f"multipart/form-data; boundary={bd}"})
    d = json.load(urllib.request.urlopen(r, timeout=120))
    return d["text"], [w for w in d["words"] if w.get("type") == "word"]
def toks(s): return re.sub(r"\[[^\]]*\]", " ", s.lower()).replace("o. e. u.", "oeu").replace("o e u", "oeu").translate(str.maketrans("", "", ".,!?'\"…-")).split()
res = {}
for p in sorted((D / "aud").glob("*_v[23].mp3")):
    role = p.name.split("_")[0]
    txt, ws = scribe(p)
    ref = toks(" ".join(PASS[role])); hyp = toks(txt)
    acc = difflib.SequenceMatcher(None, ref, hyp).ratio()
    out, _, _, _ = _clf.classify_batch(_load(p)); c = dict(zip(_labels, out.squeeze(0).tolist()))
    snd = parselmouth.Sound(str(p)); f0 = snd.to_pitch(time_step=0.01, pitch_floor=60, pitch_ceiling=350).selected_array["frequency"]
    f0 = f0[f0 > 0]
    dur = snd.get_total_duration(); wps = len(ws) / max(0.1, ws[-1]["end"] - ws[0]["start"]) if ws else 0
    top = sorted(c.items(), key=lambda t: -t[1])[:3]
    res[p.stem] = dict(acc=round(acc, 3), england=round(c["england"], 3), us=round(c["us"], 3), top=top,
                       f0=round(float(np.median(f0)), 1), dur=round(dur, 1), wps=round(wps, 2), heard=txt)
    r = res[p.stem]
    print(f"{p.stem:22} acc {acc:.2f}  eng {r['england']:+.2f}  us {r['us']:+.2f}  top {top[0][0]:9}  f0 {r['f0']:5.0f}  {r['wps']:.1f} w/s  {dur:4.1f}s")
json.dump(res, open(D / "aud" / "scores.json", "w"), indent=1)
