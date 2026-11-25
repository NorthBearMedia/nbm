#!/usr/bin/env python3
"""Transmission 04 takes (the user picked A in the acting test: eleven_v3 text-to-dialogue). Two ways available:
  A = eleven_v3 text-to-dialogue: the whole exchange in one generation, so each voice hears the other (a London
      lead-in exchange first, a sacrificial last line after; both sliced off). Minimal tags.
  B = eleven_multilingual_v2, one line at a time with previous_text/next_text for context (steadier accents).
Writes vo/<A|B><take>_<id>.mp3 + _align.json. Usage: gen.py A 3 | gen.py B 3"""
import json, urllib.request, urllib.error, base64, pathlib, subprocess, sys, time, re
D = pathlib.Path(__file__).parent; S = json.loads((D / "script.json").read_text()); V = S["voices"]; VO = D / "vo"
mode, N = sys.argv[1], int(sys.argv[2])
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
def cut(src, a, b, out):
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-af", f"atrim={a:.4f}:{b:.4f},asetpts=N/SR/TB",
                    "-c:a", "libmp3lame", "-q:a", "2", str(out)], check=True)
def slice_lines(take, al, lines, start_pos, tag):
    ch, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    nal, idx = norm("".join(ch)); pos = start_pos; spans = []
    for l in lines:
        nl, _ = norm(l["text"]); f = nal.find(nl, pos)
        if f < 0: print(f"{tag}: {l['id']} missing"); continue
        i0, i1 = idx[f], idx[f + len(nl) - 1]
        while i1 + 1 < len(ch) and ch[i1 + 1] in ".?!,'": i1 += 1
        spans.append((l, i0, i1, st[i0], en[i1])); pos = f + len(nl)
    return spans
if mode == "A":
    inputs = [{"voice_id": V[w]["id"], "text": t} for w, t in S["lead"]]
    inputs += [{"voice_id": V[l["who"]]["id"], "text": (l["tag"] + " " + l["text"]).strip()} for l in S["lines"]]
    inputs += [{"voice_id": V[S["sac"][0]]["id"], "text": S["sac"][1]}]
    lead_chars = len(norm(" ".join(re.sub(r"\[[^\]]*\]", "", t) for _, t in S["lead"]))[0])
    for n in range(N):
        d = post("https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps",
                 {"inputs": inputs, "model_id": "eleven_v3", "settings": {"stability": 0.5}})
        take = VO / f"A{n}_take.mp3"; take.write_bytes(base64.b64decode(d["audio_base64"]))
        al = d["alignment"]; spans = slice_lines(take, al, S["lines"], lead_chars - 3, f"A{n}")
        sac0 = al["character_start_times_seconds"][-1]
        nal, idx = norm("".join(al["characters"])); f = nal.rfind(norm(S["sac"][1])[0])
        if f >= 0: sac0 = al["character_start_times_seconds"][idx[f]]
        for j, (l, i0, i1, t0, t1) in enumerate(spans):
            prev_end = spans[j-1][4] if j else max(0.0, t0 - 0.6)
            next_st = spans[j+1][3] if j + 1 < len(spans) else sac0
            a = max((prev_end + t0) / 2, t0 - 0.3, 0.0); b = min((t1 + next_st) / 2, t1 + 0.35)
            cut(take, a, b, VO / f"A{n}_{l['id']}.mp3")
            ch = al["characters"]; st = al["character_start_times_seconds"]; en = al["character_end_times_seconds"]
            json.dump({"characters": ch[i0:i1+1], "character_start_times_seconds": [round(x - a, 4) for x in st[i0:i1+1]],
                       "character_end_times_seconds": [round(x - a, 4) for x in en[i0:i1+1]],
                       "gap_after_in_take": round(next_st - t1, 3)}, open(VO / f"A{n}_{l['id']}_align.json", "w"))
        print(f"A{n}: {al['character_end_times_seconds'][-1]:.1f}s, {len(spans)}/{len(S['lines'])} lines")
else:
    L = S["lines"]
    for n in range(N):
        for j, l in enumerate(L):
            prev = " ".join(x["text"] for x in L[max(0, j-2):j]); nxt = L[j+1]["text"] if j + 1 < len(L) else ""
            st = {"stability": 0.32, "similarity_boost": 0.85, "style": 0.45, "use_speaker_boost": True}
            if l["tag"] == "[whispering]": st = dict(st, stability=0.45, style=0.3)
            d = post(f"https://api.elevenlabs.io/v1/text-to-speech/{V[l['who']]['id']}/with-timestamps",
                     {"text": l["text"], "model_id": "eleven_multilingual_v2", "voice_settings": st,
                      "previous_text": prev, "next_text": nxt, "seed": 1000 * n + j})
            out = VO / f"B{n}_{l['id']}.mp3"; out.write_bytes(base64.b64decode(d["audio_base64"]))
            json.dump(d["alignment"], open(VO / f"B{n}_{l['id']}_align.json", "w"))
        print(f"B{n}: {len(L)} lines")
