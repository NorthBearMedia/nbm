#!/usr/bin/env python3
"""Generate each transmission via ElevenLabs /with-timestamps. The API key is injected by
the session's network proxy, so the header carries a placeholder. Performance is shaped per
line: v3 audio tags for delivery, stability for control (looser = more raw)."""
import json, urllib.request, base64, pathlib, sys
D = pathlib.Path(__file__).parent
S = json.loads((D / "script.json").read_text())
V = S["voices"]

# delivery direction, prepended at generation time so script.json stays caption-clean
TAG = {"l12": "[shouting] ", "l13": "[shouting] ", "l14": "[shaken] ",
       "l16": "[shaken] ", "l17": "[quietly] ", "l19": "[panicked] ",
       "l20": "[laughing] ", "l21": "[shouting] [panicked] ", "l22": "[laughs] ",
       "l23": "[screaming] ", "l15": "[hesitant] ", "l24": "[shaken] ", "l25": "[calm] "}
# stability: lower = more expressive/unstable, higher = flat and controlled
STAB = {"l19": 0.3, "l21": 0.3, "l23": 0.3, "l20": 0.4, "l22": 0.4,
        "l25": 0.75, "BASE": 0.55}

only = set(sys.argv[1:])
for ln in S["lines"]:
    k = ln["id"]
    if only and k not in only: continue
    text = TAG.get(k, "") + ln.get("say", ln["text"]).lstrip("—")   # "say" overrides; leading dash is a caption cue
    stab = STAB.get(k, STAB.get(ln["who"], 0.5))
    body = json.dumps({"text": text, "model_id": "eleven_v3",
        "voice_settings": {"stability": stab, "similarity_boost": 0.85,
                           "use_speaker_boost": True}}).encode()
    r = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{V[ln['who']]['id']}/with-timestamps",
        data=body, method="POST",
        headers={"xi-api-key": "proxy-injected", "Content-Type": "application/json"})
    d = json.load(urllib.request.urlopen(r, timeout=120))
    (D / "vo" / f"{k}.mp3").write_bytes(base64.b64decode(d["audio_base64"]))
    (D / "vo" / f"{k}_align.json").write_text(json.dumps(d["alignment"]))
    print(f"{k} {ln['who']:4s} stab={stab}  {d['alignment']['character_end_times_seconds'][-1]:5.2f}s  {ln['text'][:52]}")
