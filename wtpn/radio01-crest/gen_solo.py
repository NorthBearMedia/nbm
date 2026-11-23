#!/usr/bin/env python3
"""Regenerate one line inside a primed passage: routine lines before it settle the voice into its
ordinary register, and a sacrificial line after it absorbs v3's habit of swallowing the last
sentence of a take. Only the target line is sliced out. Usage: gen_solo.py <line_id> <primer ids...>"""
import json, urllib.request, base64, pathlib, subprocess, sys
D = pathlib.Path(__file__).parent
S = json.loads((D / "script.json").read_text()); L = {l["id"]: l for l in S["lines"]}
target, primers = sys.argv[1], sys.argv[2:]
who = L[target]["who"]; v = S["voices"][who]; model = v.get("model", "eleven_v3")
def say(ln): return ln.get("say", ln["text"]).lstrip("—")
def norm(s):
    o, i = [], []
    for n, c in enumerate(s):
        if c.isalnum(): o.append(c.lower()); i.append(n)
    return "".join(o), i
tag = "[calm] " if model == "eleven_v3" else ""
parts = [tag + say(L[p]) for p in primers] + [tag + say(L[target]), tag + "Heading down off the ridge now, out."]
passage = "\n\n".join(parts)
body = {"text": passage, "model_id": model,
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.85, "use_speaker_boost": True}}
r = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{v['id']}/with-timestamps",
    data=json.dumps(body).encode(), method="POST",
    headers={"xi-api-key": "proxy-injected", "Content-Type": "application/json"})
d = json.load(urllib.request.urlopen(r, timeout=300))
take = D / "vo" / f"take_solo_{target}.mp3"; take.write_bytes(base64.b64decode(d["audio_base64"]))
al = d["alignment"]; ch, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
nal, idx = norm("".join(ch)); pos = 0
for p in primers: pos = nal.find(norm(say(L[p]))[0], pos) + len(norm(say(L[p]))[0])
nl = norm(say(L[target]))[0]; f = nal.find(nl, pos)
i0, i1 = idx[f], idx[f + len(nl) - 1]
while i1 + 1 < len(ch) and not ch[i1+1].isalnum() and ch[i1+1] not in "\n[": i1 += 1
nxt = idx[f + len(nl)] if f + len(nl) < len(idx) else len(ch) - 1
a = max(st[i0] - 0.35, 0.0); b = min((en[i1] + st[nxt]) / 2, en[i1] + 0.40)
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(take), "-af", f"atrim={a:.4f}:{b:.4f},asetpts=N/SR/TB",
                "-c:a", "libmp3lame", "-q:a", "2", str(D / "vo" / f"{target}.mp3")], check=True)
json.dump({"characters": ch[i0:i1+1],
           "character_start_times_seconds": [round(x - a, 4) for x in st[i0:i1+1]],
           "character_end_times_seconds": [round(x - a, 4) for x in en[i0:i1+1]]},
          open(D / "vo" / f"{target}_align.json", "w"))
print(f"{target}: primed by {primers}, sliced {a:.2f}-{b:.2f}s of a {en[-1]:.1f}s take")
