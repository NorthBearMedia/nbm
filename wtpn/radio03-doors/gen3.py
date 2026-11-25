#!/usr/bin/env python3
"""eleven_v3 takes for Handover v4: N takes per character, each opening on a Yorkshire lead-in (it holds the
accent; v3 drifts without it) and ending on a sacrificial line. Every line is sliced into
vo/cand/<id>_<n>.mp3 + _align.json for per-line selection (pick3.py). Usage: gen3.py WHO N [start]"""
import json, urllib.request, urllib.error, base64, pathlib, subprocess, sys, time
D = pathlib.Path(__file__).parent; (D / "vo" / "cand").mkdir(parents=True, exist_ok=True)
S = json.loads((D / "script.json").read_text()); V = S["voices"]
who, N = sys.argv[1], int(sys.argv[2]); n0 = int(sys.argv[3]) if len(sys.argv) > 3 else 0
LEAD = {"MICK": "[casual] Alright. It's been chucking it down all night, and the North Circular's been a car park since four.",
        "HARRY": "[cheerful] Alright, Dad. It's been chucking it down all week, and I ain't had me breakfast yet.",
        "ASH": "[casual] Alright. It's been chucking it down all night out here, and I ain't had a cuppa since two.",
        "LEE": "[casual] Alright. I've been driving since six this morning, and I'm cream crackered."}
SAC = "[calm] Right, I'll talk to you in a bit."
def say(ln): return ln.get("say", ln["text"]).lstrip("—")
def norm(s):
    out, idx = [], []
    for i, c in enumerate(s):
        if c.isalnum(): out.append(c.lower()); idx.append(i)
    return "".join(out), idx
import os
ONLY = set(filter(None, os.environ.get("ONLY", "").split(",")))
lines = [l for l in S["lines"] if l["who"] == who and (not ONLY or l["id"] in ONLY)]; v = dict(V[who])
if os.environ.get("MODEL"): v["model"] = os.environ["MODEL"]
if os.environ.get("TAG") is not None and os.environ.get("TAG") != "":
    lines = [dict(l, tag=os.environ["TAG"]) for l in lines]
v2 = v["model"] != "eleven_v3"
strip = (lambda x: __import__("re").sub(r"\[[^\]]*\]\s*", "", x)) if v2 else (lambda x: x)
passage = "\n\n".join([strip(LEAD[who])] + [strip(((l.get("tag") or "") + " " + say(l)).strip()) for l in lines] + [strip(SAC)])
for n in range(n0, n0 + N):
    for attempt in range(6):
        try:
            r = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{v['id']}/with-timestamps",
                data=json.dumps({"text": passage, "model_id": v["model"], "voice_settings": v["settings"]}).encode(),
                method="POST", headers={"xi-api-key": "proxy-injected", "Content-Type": "application/json"})
            d = json.load(urllib.request.urlopen(r, timeout=300)); break
        except urllib.error.HTTPError as e:
            if e.code in (409, 429, 500, 503): time.sleep(5 * (attempt + 1)); continue
            raise
    take = D / "vo" / "cand" / f"take_{who}_{n}.mp3"; take.write_bytes(base64.b64decode(d["audio_base64"]))
    al = d["alignment"]; ch, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    nal, idx = norm("".join(ch)); spans, pos = [], len(norm(strip(LEAD[who]))[0]) - 5
    for l in lines:
        nl, _ = norm(say(l)); f = nal.find(nl, pos)
        if f < 0: print(f"take {n}: {l['id']} missing"); continue
        i0, i1 = idx[f], idx[f + len(nl) - 1]
        while i1 + 1 < len(ch) and not ch[i1 + 1].isalnum() and ch[i1 + 1] not in "\n[": i1 += 1
        spans.append((l, i0, i1, st[i0], en[i1])); pos = f + len(nl)
    f_s = nal.find(norm(SAC)[0], pos); sac0 = st[idx[f_s]] if f_s >= 0 else en[-1]
    for j, (l, i0, i1, t0, t1) in enumerate(spans):
        prev_end = spans[j-1][4] if j else max(0.0, t0 - 0.6)
        next_st = spans[j+1][3] if j + 1 < len(spans) else sac0
        a = max((prev_end + t0) / 2, t0 - 0.35, 0.0); b = min((t1 + next_st) / 2, t1 + 0.40)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(take), "-af", f"atrim={a:.4f}:{b:.4f},asetpts=N/SR/TB",
                        "-c:a", "libmp3lame", "-q:a", "2", str(D / "vo" / "cand" / f"{l['id']}_{n}.mp3")], check=True)
        json.dump({"characters": ch[i0:i1+1], "character_start_times_seconds": [round(x - a, 4) for x in st[i0:i1+1]],
                   "character_end_times_seconds": [round(x - a, 4) for x in en[i0:i1+1]]},
                  open(D / "vo" / "cand" / f"{l['id']}_{n}_align.json", "w"))
    print(f"{who} take {n}: {en[-1]:.1f}s, {len(spans)}/{len(lines)} lines")
