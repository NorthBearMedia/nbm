#!/usr/bin/env python3
"""Generate N more full takes for one character (same passage as gen.py, optional tag overrides) and
slice every line into vo/cand/<id>_<n>.mp3 + _align.json, for per-line selection.
Usage: gen_cand.py WHO N [id=tag ...]"""
import json, urllib.request, base64, pathlib, subprocess, sys, time, urllib.error
D = pathlib.Path(__file__).parent; (D / "vo" / "cand").mkdir(parents=True, exist_ok=True)
S = json.loads((D / "script.json").read_text()); V = S["voices"]
who, N = sys.argv[1], int(sys.argv[2]); OVR = dict(a.split("=", 1) for a in sys.argv[3:])
SAC = "[calm] Right so, I'll talk to you in a bit."
def say(ln): return ln.get("say", ln["text"]).lstrip("—")
def norm(s):
    out, idx = [], []
    for i, c in enumerate(s):
        if c.isalnum(): out.append(c.lower()); idx.append(i)
    return "".join(out), idx
lines = [l for l in S["lines"] if l["who"] == who]; v = V[who]
passage = "\n\n".join([(OVR.get(l["id"], l.get("tag", "")) + " ").lstrip() + say(l) for l in lines] + [SAC])
for n in range(N):
    for attempt in range(4):
        try:
            r = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{v['id']}/with-timestamps",
                data=json.dumps({"text": passage, "model_id": v["model"], "voice_settings": {"stability": 0.5, "similarity_boost": 0.85, "use_speaker_boost": True}}).encode(),
                method="POST", headers={"xi-api-key": "proxy-injected", "Content-Type": "application/json"})
            d = json.load(urllib.request.urlopen(r, timeout=300)); break
        except urllib.error.HTTPError as e:
            if e.code in (409, 429): time.sleep(4 * (attempt + 1)); continue
            raise
    take = D / "vo" / "cand" / f"take_{who}_{n}.mp3"; take.write_bytes(base64.b64decode(d["audio_base64"]))
    al = d["alignment"]; ch, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    nal, idx = norm("".join(ch)); spans, pos = [], 0
    for l in lines:
        nl, _ = norm(say(l)); f = nal.find(nl, pos)
        if f < 0: print(f"take {n}: {l['id']} missing"); spans.append(None); continue
        i0, i1 = idx[f], idx[f + len(nl) - 1]
        while i1 + 1 < len(ch) and not ch[i1 + 1].isalnum() and ch[i1 + 1] not in "\n[": i1 += 1
        spans.append((l, i0, i1, st[i0], en[i1])); pos = f + len(nl)
    ok = [s for s in spans if s]
    for j, (l, i0, i1, t0, t1) in enumerate(ok):
        prev_end = ok[j-1][4] if j else 0.0
        next_st = ok[j+1][3] if j + 1 < len(ok) else min(t1 + 1.0, en[-1])
        a = max((prev_end + t0) / 2, t0 - 0.35, 0.0); b = min((t1 + next_st) / 2, t1 + 0.40)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(take), "-af", f"atrim={a:.4f}:{b:.4f},asetpts=N/SR/TB",
                        "-c:a", "libmp3lame", "-q:a", "2", str(D / "vo" / "cand" / f"{l['id']}_{n}.mp3")], check=True)
        json.dump({"characters": ch[i0:i1+1], "character_start_times_seconds": [round(x - a, 4) for x in st[i0:i1+1]],
                   "character_end_times_seconds": [round(x - a, 4) for x in en[i0:i1+1]]},
                  open(D / "vo" / "cand" / f"{l['id']}_{n}_align.json", "w"))
    print(f"take {n}: {en[-1]:.1f}s")
