#!/usr/bin/env python3
"""One take per character, sliced by alignment. Separate generations let the expressive model
wander between accents from line to line (Base did, audibly); inside a single generation it
cannot. Each character's lines go in as one passage in story order, delivery tags inline (v3
reads them as direction; v2 would speak them, so Base gets none). Writes vo/<id>.mp3 and
vo/<id>_align.json per line, rebased to the slice. Usage: gen2.py [BASE|EWAN|CAT ...]"""
import json, urllib.request, base64, pathlib, subprocess, sys
D = pathlib.Path(__file__).parent
S = json.loads((D / "script.json").read_text()); V = S["voices"]
TAG = {"l12": "[shouting]", "l13": "[shouting]", "l14": "[shaken]", "l16": "[shaken]",
       "l17": "[quietly]", "l19": "[panicked]", "l20": "[laughing]", "l21": "[shouting] [panicked]",
       "l22": "[laughs]", "l23": "[screaming]", "l25": "[calm]"}
STAB = {"BASE": 0.5, "EWAN": 0.5, "CAT": 0.5}

def say(ln): return ln.get("say", ln["text"]).lstrip("—")
def norm(s):
    out, idx = [], []
    for i, c in enumerate(s):
        if c.isalnum(): out.append(c.lower()); idx.append(i)
    return "".join(out), idx

def run(c): subprocess.run(c, check=True, capture_output=True)

for who in (sys.argv[1:] or ["BASE", "EWAN", "CAT"]):
    lines = [l for l in S["lines"] if l["who"] == who]
    v = V[who]; model = v.get("model", "eleven_v3")
    parts = [((TAG[l["id"]] + " ") if (model == "eleven_v3" and l["id"] in TAG) else "") + say(l) for l in lines]
    passage = "\n\n".join(parts)
    body = {"text": passage, "model_id": model,
            "voice_settings": {"stability": STAB[who], "similarity_boost": 0.85, "use_speaker_boost": True}}
    if model != "eleven_v3": body["voice_settings"]["style"] = 0.0
    r = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{v['id']}/with-timestamps",
        data=json.dumps(body).encode(), method="POST",
        headers={"xi-api-key": "proxy-injected", "Content-Type": "application/json"})
    d = json.load(urllib.request.urlopen(r, timeout=300))
    take = D / "vo" / f"take_{who}.mp3"; take.write_bytes(base64.b64decode(d["audio_base64"]))
    al = d["alignment"]; ch, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    nal, idx = norm("".join(ch))
    # locate every line in the take
    spans, pos = [], 0
    for l in lines:
        nl, _ = norm(say(l))
        f = nal.find(nl, pos)
        if f < 0: sys.exit(f"!! {who}: could not find {l['id']} in the take: {say(l)[:50]!r}")
        i0, i1 = idx[f], idx[f + len(nl) - 1]
        while i1 + 1 < len(ch) and not ch[i1 + 1].isalnum() and ch[i1 + 1] not in "\n[":
            i1 += 1                                          # keep trailing punctuation / dash
        spans.append((l, i0, i1, st[i0], en[i1])); pos = f + len(nl)
    total = en[-1] + 0.5
    for n, (l, i0, i1, t0, t1) in enumerate(spans):
        prev_end = spans[n-1][4] if n else 0.0
        next_st = spans[n+1][3] if n + 1 < len(spans) else total
        a = max((prev_end + t0) / 2, t0 - 0.35, 0.0)
        b = min((t1 + next_st) / 2, t1 + 0.40)
        run(["ffmpeg", "-y", "-v", "error", "-i", str(take), "-af", f"atrim={a:.4f}:{b:.4f},asetpts=N/SR/TB",
             "-c:a", "libmp3lame", "-q:a", "2", str(D / "vo" / f"{l['id']}.mp3")])
        json.dump({"characters": ch[i0:i1+1],
                   "character_start_times_seconds": [round(x - a, 4) for x in st[i0:i1+1]],
                   "character_end_times_seconds": [round(x - a, 4) for x in en[i0:i1+1]]},
                  open(D / "vo" / f"{l['id']}_align.json", "w"))
    print(f"{who:4} {model:22} one take {en[-1]:6.1f}s  -> {len(spans)} lines sliced: {' '.join(s[0]['id'] for s in spans)}")
