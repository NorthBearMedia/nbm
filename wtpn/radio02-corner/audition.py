#!/usr/bin/env python3
"""Cast Transmission 02: generate a short in-character passage per candidate voice (eleven_v3) and
score it: CommonAccent margin for 'ireland', median pitch, duration. Writes aud/<role>_<name>.mp3."""
import json, urllib.request, base64, pathlib, sys, subprocess, warnings
warnings.filterwarnings("ignore")
D = pathlib.Path(__file__).parent; sys.path.insert(0, str(D))
PASS = {
 "GERRY": "Still in the hay shed with the lame one. Her foot's in a terrible state.\n\n[annoyed] Ah, for God's sake. Would you listen to them. Something's got in with the ewes. Jo, if that's your bloody dog again, I swear to God.\n\n[calm] May.",
 "MAY":   "Grand. This one's taking the bottle now. Bit of fight in her.\n\nCan you see it?\n\n[worried] Gerry, answer me.\n\nI'm here. What's in the corner?",
 "JO":    "That you two still up? I've had three since midnight, and all of them backwards.\n\nBoth my dogs are in. They're lying here by the fire.\n\n[urgent] May, there's someone crossing your yard. Under the light. Coming up to the house.",
}
CAND = {
 "GERRY": {"cillian": "B5jEZPqk2OJ2vkPw3wBM", "darren": "9TYDukkUVpJPDSIuv3ir", "neil": "Rni4NyZRvnv6RI6vRMqC",
           "daniel": "4W8xz6cmN5JMnmmVA3is"},
 "WOMEN": {"clare": "3Q0HiHNecynsdqicntLT", "michelle": "C92s6vssSLlabgIln1iY", "frances": "mFgXOmlOfXfr6suoQkRH",
           "colleen": "1OYA2kgM85gF2eGN8HEp", "clodagh": "9f9KY15dSvN8oi5shT8z"},
}
def tts(vid, text, out):
    body = {"text": text, "model_id": "eleven_v3", "voice_settings": {"stability": 0.5, "similarity_boost": 0.85, "use_speaker_boost": True}}
    r = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{vid}", data=json.dumps(body).encode(), method="POST",
                               headers={"xi-api-key": "proxy-injected", "Content-Type": "application/json"})
    out.write_bytes(urllib.request.urlopen(r, timeout=300).read())
jobs = [("GERRY", n, v, PASS["GERRY"]) for n, v in CAND["GERRY"].items()]
jobs += [(role, n, v, PASS[role]) for n, v in CAND["WOMEN"].items() for role in ("MAY", "JO")]
for role, n, vid, text in jobs:
    out = D / "aud" / f"{role}_{n}.mp3"
    if not out.exists():
        try: tts(vid, text, out)
        except Exception as e: print(f"{role} {n}: FAILED {e}"); continue
from accent import margin
import numpy as np, librosa
print(f"{'role':6} {'voice':9} {'ireland':>8}  top-2                         pitch  dur")
for role, n, vid, text in jobs:
    out = D / "aud" / f"{role}_{n}.mp3"
    if not out.exists(): continue
    m, _, top = margin(out, "ireland")
    y, sr = librosa.load(out, sr=16000); f0, vf, _ = librosa.pyin(y, fmin=60, fmax=400, sr=sr, hop_length=320)
    print(f"{role:6} {n:9} {m:+8.2f}  {', '.join(f'{l} {p:.2f}' for l, p in top[:2]):28}  {np.nanmedian(f0):5.0f}  {len(y)/sr:4.1f}s")
