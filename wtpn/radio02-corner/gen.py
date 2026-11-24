#!/usr/bin/env python3
"""One take per character, story order, delivery tags inline (eleven_v3), plus a sacrificial last line
(v3 tends to swallow the end of a take). Slices each line by alignment into vo/<id>.mp3 and
vo/<id>_align.json. Usage: gen.py [GERRY|MAY|JO ...]"""
import json, urllib.request, base64, pathlib, subprocess, sys
D = pathlib.Path(__file__).parent
S = json.loads((D / "script.json").read_text()); V = S["voices"]
SAC = "[calm] Right so, I'll talk to you in a bit."
def say(ln): return ln.get("say", ln["text"]).lstrip("—")
def norm(s):
    out, idx = [], []
    for i, c in enumerate(s):
        if c.isalnum(): out.append(c.lower()); idx.append(i)
    return "".join(out), idx
def run(c): subprocess.run(c, check=True, capture_output=True)
for who in (sys.argv[1:] or ["GERRY", "MAY", "JO"]):
    lines = [l for l in S["lines"] if l["who"] == who]; v = V[who]
    v3 = v["model"] == "eleven_v3"          # v2 would SPEAK a [tag], so it gets none
    passage = "\n\n".join([(l["tag"] + " " if (v3 and l.get("tag")) else "") + say(l) for l in lines]
                          + [SAC if v3 else SAC.replace("[calm] ", "")])
    vs = {"stability": 0.5, "similarity_boost": 0.85, "use_speaker_boost": True}
    if not v3: vs.update(stability=0.4, style=0.35)
    body = {"text": passage, "model_id": v["model"], "voice_settings": vs}
    r = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{v['id']}/with-timestamps",
        data=json.dumps(body).encode(), method="POST", headers={"xi-api-key": "proxy-injected", "Content-Type": "application/json"})
    d = json.load(urllib.request.urlopen(r, timeout=300))
    take = D / "vo" / f"take_{who}.mp3"; take.write_bytes(base64.b64decode(d["audio_base64"]))
    al = d["alignment"]; ch, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    nal, idx = norm("".join(ch)); spans, pos = [], 0
    for l in lines:
        nl, _ = norm(say(l)); f = nal.find(nl, pos)
        if f < 0: sys.exit(f"!! {who}: could not find {l['id']} in the take: {say(l)[:50]!r}")
        i0, i1 = idx[f], idx[f + len(nl) - 1]
        while i1 + 1 < len(ch) and not ch[i1 + 1].isalnum() and ch[i1 + 1] not in "\n[": i1 += 1
        spans.append((l, i0, i1, st[i0], en[i1])); pos = f + len(nl)
    sn = norm(SAC.replace("[calm] ", ""))[0]; f_s = nal.find(sn, pos)
    sac0 = st[idx[f_s]] if f_s >= 0 else en[-1]
    for n, (l, i0, i1, t0, t1) in enumerate(spans):
        prev_end = spans[n-1][4] if n else 0.0
        next_st = spans[n+1][3] if n + 1 < len(spans) else sac0
        a = max((prev_end + t0) / 2, t0 - 0.35, 0.0); b = min((t1 + next_st) / 2, t1 + 0.40)
        run(["ffmpeg", "-y", "-v", "error", "-i", str(take), "-af", f"atrim={a:.4f}:{b:.4f},asetpts=N/SR/TB",
             "-c:a", "libmp3lame", "-q:a", "2", str(D / "vo" / f"{l['id']}.mp3")])
        json.dump({"characters": ch[i0:i1+1],
                   "character_start_times_seconds": [round(x - a, 4) for x in st[i0:i1+1]],
                   "character_end_times_seconds": [round(x - a, 4) for x in en[i0:i1+1]]},
                  open(D / "vo" / f"{l['id']}_align.json", "w"))
    print(f"{who:5} one take {en[-1]:6.1f}s -> {len(spans)} lines: {' '.join(s[0]['id'] for s in spans)}")
