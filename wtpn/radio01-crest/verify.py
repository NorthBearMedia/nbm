#!/usr/bin/env python3
"""Scribe-transcribe each take and diff against the script, normalising numbers to words."""
import json, pathlib, urllib.request, uuid, sys, difflib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "tools"))
from verify_narration import norm
D = pathlib.Path(__file__).parent
S = json.loads((D / "script.json").read_text())
only = set(sys.argv[1:]); bad = []
for ln in S["lines"]:
    k = ln["id"]
    if only and k not in only: continue
    b = (D / "vo" / f"{k}.mp3").read_bytes(); bd = uuid.uuid4().hex
    parts = [(f'--{bd}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v1\r\n').encode(),
             (f'--{bd}\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n').encode() + b + b"\r\n",
             f'--{bd}--\r\n'.encode()]
    r = urllib.request.Request("https://api.elevenlabs.io/v1/speech-to-text", data=b"".join(parts), method="POST",
        headers={"xi-api-key": "proxy-injected", "Content-Type": f"multipart/form-data; boundary={bd}"})
    d = json.load(urllib.request.urlopen(r, timeout=120))
    want, got = norm(ln["text"]), norm(d["text"])
    ratio = difflib.SequenceMatcher(None, want.split(), got.split(), autojunk=False).ratio() * 100
    flag = "ok " if ratio >= 90 else "BAD"
    if ratio < 90: bad.append(k)
    print(f"{flag} {k} {ratio:5.1f}%  heard: {d['text'][:78]!r}")
print("\nNEEDS ATTENTION:", bad if bad else "none")
