#!/usr/bin/env python3
"""eleven_v3 text-to-dialogue takes (the method the user picked in the Monitor acting test): the whole exchange in
one generation so each line answers the last; a London lead-in exchange first and a sacrificial last line after, both
sliced off. Lines may carry "say" (what the voice reads, e.g. "Boze" for Bowes) separate from "text" (the caption).
Writes vo/A<n>_<id>.mp3 + _align.json. Usage: gen.py N [start]"""
import json, urllib.request, urllib.error, base64, pathlib, subprocess, sys, time, re
D = pathlib.Path(__file__).parent; S = json.loads((D / "script.json").read_text()); V = S["voices"]; VO = D / "vo"
N = int(sys.argv[1]); n0 = int(sys.argv[2]) if len(sys.argv) > 2 else 0
def say(l): return l.get("say", l["text"])
def post(url, body):
    for attempt in range(6):
        try:
            r = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                       headers={"xi-api-key": "proxy-injected", "Content-Type": "application/json"})
            return json.load(urllib.request.urlopen(r, timeout=300))
        except urllib.error.HTTPError as e:
            if e.code in (409, 429, 500, 503): time.sleep(5 * (attempt + 1)); continue
            raise RuntimeError(f"{e.code} {e.read()[:400]}")
def norm(s):
    out, idx = [], []
    for i, c in enumerate(s):
        if c.isalnum(): out.append(c.lower()); idx.append(i)
    return "".join(out), idx
inputs = [{"voice_id": V[w]["id"], "text": t} for w, t in S["lead"]]
inputs += [{"voice_id": V[l["who"]]["id"], "text": (l["tag"] + " " + say(l)).strip()} for l in S["lines"]]
inputs += [{"voice_id": V[S["sac"][0]]["id"], "text": S["sac"][1]}]
lead_chars = len(norm(" ".join(re.sub(r"\[[^\]]*\]", "", t) for _, t in S["lead"]))[0])
for n in range(n0, n0 + N):
    d = post("https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps",
             {"inputs": inputs, "model_id": "eleven_v3", "settings": {"stability": 0.5}})
    take = VO / f"A{n}_take.mp3"; take.write_bytes(base64.b64decode(d["audio_base64"]))
    al = d["alignment"]; ch, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    nal, idx = norm("".join(ch)); pos = lead_chars - 3; spans = []
    for l in S["lines"]:
        nl, _ = norm(say(l)); f = nal.find(nl, pos)
        if f < 0: print(f"A{n}: {l['id']} missing"); continue
        i0, i1 = idx[f], idx[f + len(nl) - 1]
        while i1 + 1 < len(ch) and ch[i1 + 1] in ".?!,'": i1 += 1
        spans.append((l, i0, i1, st[i0], en[i1])); pos = f + len(nl)
    f = nal.rfind(norm(S["sac"][1])[0]); sac0 = st[idx[f]] if f >= 0 else en[-1]
    for j, (l, i0, i1, t0, t1) in enumerate(spans):
        prev_end = spans[j-1][4] if j else max(0.0, t0 - 0.6)
        next_st = spans[j+1][3] if j + 1 < len(spans) else sac0
        a = max((prev_end + t0) / 2, t0 - 0.3, 0.0); b = min((t1 + next_st) / 2, t1 + 0.35)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(take), "-af", f"atrim={a:.4f}:{b:.4f},asetpts=N/SR/TB",
                        "-c:a", "libmp3lame", "-q:a", "2", str(VO / f"A{n}_{l['id']}.mp3")], check=True)
        json.dump({"characters": ch[i0:i1+1], "character_start_times_seconds": [round(x - a, 4) for x in st[i0:i1+1]],
                   "character_end_times_seconds": [round(x - a, 4) for x in en[i0:i1+1]],
                   "gap_after_in_take": round(next_st - t1, 3)}, open(VO / f"A{n}_{l['id']}_align.json", "w"))
    print(f"A{n}: {en[-1]:.1f}s, {len(spans)}/{len(S['lines'])} lines", flush=True)
