#!/usr/bin/env python3
"""Draft 3: the opening becomes an explicit phone call (user: an always-open line to the office isn't how it works).
New lines t00 "Transport office, Tony speaking." and j00 "Tone, it's Jamie. Hang on." generated in context (London
lead, j01, t00, j00, j02, t02, sacrificial line) as v3 dialogue takes; t00/j00 cut on Scribe word times.
Writes vo/O<n>_t00.mp3, vo/O<n>_j00.mp3 + _align.json. Usage: gen_open.py N"""
import json, urllib.request, urllib.error, base64, pathlib, subprocess, sys, time, uuid, re
D = pathlib.Path(__file__).parent; S = json.loads((D / "script.json").read_text()); V = S["voices"]; VO = D / "vo"
def post(url, body, ctype=None):
    for attempt in range(6):
        try:
            r = urllib.request.Request(url, data=body if ctype else json.dumps(body).encode(), method="POST",
                                       headers={"xi-api-key": "proxy-injected", "Content-Type": ctype or "application/json"})
            return json.load(urllib.request.urlopen(r, timeout=300))
        except urllib.error.HTTPError as e:
            if e.code in (409, 429, 500, 503): time.sleep(5 * (attempt + 1)); continue
            raise RuntimeError(f"{e.code} {e.read()[:300]}")
def scribe(p):
    bd = uuid.uuid4().hex; b = p.read_bytes()
    body = (f'--{bd}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v1\r\n'.encode() +
            f'--{bd}\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n'.encode() + b + f'\r\n--{bd}--\r\n'.encode())
    return post("https://api.elevenlabs.io/v1/speech-to-text", body, f"multipart/form-data; boundary={bd}")
inputs = [{"voice_id": V[w]["id"], "text": t} for w, t in S["lead"]] + [
    {"voice_id": V["JAMIE"]["id"], "text": "[annoyed] Oh, shut up."},
    {"voice_id": V["TONY"]["id"],  "text": "Transport office, Tony speaking."},
    {"voice_id": V["JAMIE"]["id"], "text": "Tone, it's Jamie. Hang on."},
    {"voice_id": V["JAMIE"]["id"], "text": "Passenger seatbelt. It thinks me bag's a person."},
    {"voice_id": V["TONY"]["id"],  "text": "Where are you?"},
    {"voice_id": V["TONY"]["id"],  "text": S["sac"][1]}]
def toks(s): return re.sub(r"[^a-z' ]", " ", s.lower()).split()
for n in range(int(sys.argv[1])):
    d = post("https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps", {"inputs": inputs, "model_id": "eleven_v3", "settings": {"stability": 0.5}})
    take = VO / f"O{n}_take.mp3"; take.write_bytes(base64.b64decode(d["audio_base64"]))
    W = [w for w in scribe(take)["words"] if w["type"] == "word"]; t = [toks(w["text"])[0] if toks(w["text"]) else "" for w in W]
    found = {}
    for k, first, last in (("t00", "transport", "speaking"), ("j00", "tone", "on")):
        i0 = next((i for i, w in enumerate(t) if w == first and (k != "j00" or (i + 2 < len(t) and t[i + 2] in ("jamie",)))), None)
        if i0 is None: continue
        i1 = next((i for i in range(i0, min(i0 + 8, len(t))) if t[i] == last), None)
        if i1 is None: continue
        prev_end = W[i0 - 1]["end"] if i0 else 0.0; nxt = W[i1 + 1]["start"] if i1 + 1 < len(W) else W[i1]["end"] + 0.5
        a = max((prev_end + W[i0]["start"]) / 2, W[i0]["start"] - 0.3); b = min((W[i1]["end"] + nxt) / 2, W[i1]["end"] + 0.3)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(take), "-af", f"atrim={a:.3f}:{b:.3f},asetpts=N/SR/TB", "-c:a", "libmp3lame", "-q:a", "2",
                        str(VO / f"O{n}_{k}.mp3")], check=True)
        heard = " ".join(W[i]["text"] for i in range(i0, i1 + 1))
        json.dump({"start": round(W[i0]["start"] - a, 3), "end": round(W[i1]["end"] - a, 3), "heard": heard, "gap_after_in_take": round(nxt - W[i1]["end"], 3)},
                  open(VO / f"O{n}_{k}_align.json", "w")); found[k] = heard
    print(f"O{n}: " + " | ".join(f"{k}: '{v}'" for k, v in found.items()), flush=True)
