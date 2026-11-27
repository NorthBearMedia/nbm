#!/usr/bin/env python3
"""Re-cut each dialogue take on Scribe's word timings instead of v3's own alignment, which drifts on runs of short
lines ("Key out." "Doors locked." came out holding the neighbours' words). The script's words (lead-in, lines,
sacrificial line) are matched to what Scribe heard in order; each line is cut halfway into the gaps either side
(at most 0.3 s). Writes vo/S<n>_<id>.mp3 + _align.json (word times) and prints what each line sounded like."""
import json, pathlib, re, uuid, urllib.request, difflib, subprocess, sys
D = pathlib.Path(__file__).parent; S = json.loads((D / "script.json").read_text()); VO = D / "vo"
def scribe(p):
    b = p.read_bytes(); bd = uuid.uuid4().hex
    parts = [(f'--{bd}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v1\r\n').encode(),
             (f'--{bd}\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n').encode() + b + b"\r\n",
             f'--{bd}--\r\n'.encode()]
    r = urllib.request.Request("https://api.elevenlabs.io/v1/speech-to-text", data=b"".join(parts), method="POST",
        headers={"xi-api-key": "proxy-injected", "Content-Type": f"multipart/form-data; boundary={bd}"})
    return json.load(urllib.request.urlopen(r, timeout=300))
def tok(s): return re.sub(r"[^a-z0-9' ]", " ", re.sub(r"\[[^\]]*\]", " ", s.lower()).replace("’", "'").replace("-", " ")).split()
units = [("lead", t) for _, t in S["lead"]] + [(l["id"], l.get("say", l["text"])) for l in S["lines"]] + [("sac", S["sac"][1])]
ref, owner = [], []
for k, t in units:
    for w in tok(t): ref.append(w.strip("'")); owner.append(k)
for n in [int(a) for a in sys.argv[1:]] or range(4):
    take = VO / f"A{n}_take.mp3"; cache = VO / f"A{n}_scribe.json"
    d = json.loads(cache.read_text()) if cache.exists() else scribe(take); cache.write_text(json.dumps(d))
    W = [w for w in d["words"] if w["type"] == "word"]; hyp = [tok(w["text"])[0].strip("'") if tok(w["text"]) else "" for w in W]
    sm = difflib.SequenceMatcher(None, ref, hyp, autojunk=False); r2h = {}
    for a, b, size in sm.get_matching_blocks():
        for i in range(size): r2h[a + i] = b + i
    spans = {}
    for k, _ in units:
        idx = [i for i, o in enumerate(owner) if o == k]; hs = [r2h[i] for i in idx if i in r2h]
        if hs: spans[k] = (min(hs), max(hs))
    # unmatched words between matched neighbours belong to the line whose matched words surround them
    # a line whose first or last word went unmatched (Scribe writes "Bosemore", "all right") takes the unmatched
    # words between it and its neighbours
    order = [k for k, _ in units]
    for j, k in enumerate(order):
        if k not in spans or k in ("lead", "sac"): continue
        idx = [i for i, o in enumerate(owner) if o == k]; h0, h1 = spans[k]
        prev = next((spans[order[q]][1] for q in range(j - 1, -1, -1) if order[q] in spans), -1)
        nxt = next((spans[order[q]][0] for q in range(j + 1, len(order)) if order[q] in spans), len(W))
        if idx[0] not in r2h: h0 = prev + 1
        if idx[-1] not in r2h: h1 = nxt - 1
        spans[k] = (h0, h1)
    keys = [k for k, _ in units if k in spans]
    for j, k in enumerate(keys):
        if k in ("lead", "sac"): continue
        h0, h1 = spans[k]; prev_end = W[spans[keys[j-1]][1]]["end"] if j else 0.0
        next_st = W[spans[keys[j+1]][0]]["start"] if j + 1 < len(keys) else W[-1]["end"]
        t0, t1 = W[h0]["start"], W[h1]["end"]
        a = max((prev_end + t0) / 2, t0 - 0.3); b = min((t1 + next_st) / 2, t1 + 0.3)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(take), "-af", f"atrim={a:.4f}:{b:.4f},asetpts=N/SR/TB",
                        "-c:a", "libmp3lame", "-q:a", "2", str(VO / f"S{n}_{k}.mp3")], check=True)
        heard = " ".join(W[i]["text"] for i in range(h0, h1 + 1))
        json.dump({"start": round(t0 - a, 3), "end": round(t1 - a, 3), "gap_after_in_take": round(next_st - t1, 3), "heard": heard,
                   "words": [{"w": W[i]["text"], "s": round(W[i]["start"] - a, 3), "e": round(W[i]["end"] - a, 3)} for i in range(h0, h1 + 1)]},
                  open(VO / f"S{n}_{k}_align.json", "w"))
    missing = [l["id"] for l in S["lines"] if l["id"] not in spans]
    print(f"S{n}: {len(keys) - 2}/{len(S['lines'])} lines" + (f", missing {missing}" if missing else ""))
