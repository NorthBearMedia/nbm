#!/usr/bin/env python3
"""Draft 4 ending (user: "It's in here with me" is ambiguous: the bag, or the thing?). The exchange becomes
  TONY: Is that your bag?  JAMIE (whispers): Me bag's up here with me.  TONY: Then what's in the passenger seat?
Generated together in context as v3 dialogue takes (stabilities 0.5 and 0.0) so the three lines belong to one
performance; cut on Scribe word times. Writes vo/F<n>_{t18,j24,t19}.mp3 + _align.json. Usage: gen_end2.py N_per_stability"""
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
    {"voice_id": V["TONY"]["id"],  "text": "[quietly] Still there?"},
    {"voice_id": V["JAMIE"]["id"], "text": "[relieved] Yeah. I think it's gone."},
    {"voice_id": V["TONY"]["id"],  "text": "[warm] Try and get your head down. I'm not going anywhere."},
    {"voice_id": V["TONY"]["id"],  "text": "[quietly] Is that your bag?"},
    {"voice_id": V["JAMIE"]["id"], "text": "[whispers] Me bag's up here with me."},
    {"voice_id": V["TONY"]["id"],  "text": "[scared] Then what's in the passenger seat?"},
    {"voice_id": V["JAMIE"]["id"], "text": S["sac"][1].replace("Jamie", "Tone").replace("[scared]", "[whispers]")}]
WANT = {"t18": ["is", "that", "your", "bag"], "j24": ["bag's", "up", "here", "with", "me"], "t19": ["then", "what's", "in", "the", "passenger", "seat"]}
def tk(s): return re.sub(r"[^a-z' ]", " ", s.lower().replace("’", "'")).split()
n = 0
for stab in (0.5, 0.0):
    for _ in range(int(sys.argv[1])):
        d = post("https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps", {"inputs": inputs, "model_id": "eleven_v3", "settings": {"stability": stab}})
        take = VO / f"F{n}_take.mp3"; take.write_bytes(base64.b64decode(d["audio_base64"]))
        W = [w for w in scribe(take)["words"] if w["type"] == "word"]; t = [(tk(w["text"]) or [""])[0] for w in W]
        out = {}
        for k, seq in WANT.items():
            hit = None
            for i in range(len(t)):
                if t[i:i + len(seq)] == seq: hit = i
            if hit is None: continue
            i0 = hit - (1 if k == "j24" and hit > 0 and t[hit - 1] in ("me", "my") else 0); i1 = hit + len(seq) - 1
            prev_end = W[i0 - 1]["end"] if i0 else 0.0; nxt = W[i1 + 1]["start"] if i1 + 1 < len(W) else W[i1]["end"] + 0.5
            a = max((prev_end + W[i0]["start"]) / 2, W[i0]["start"] - 0.3); b = min((W[i1]["end"] + nxt) / 2, W[i1]["end"] + 0.3)
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(take), "-af", f"atrim={a:.3f}:{b:.3f},asetpts=N/SR/TB", "-c:a", "libmp3lame", "-q:a", "2",
                            str(VO / f"F{n}_{k}.mp3")], check=True)
            out[k] = " ".join(W[i]["text"] for i in range(i0, i1 + 1))
            json.dump({"start": round(W[i0]["start"] - a, 3), "end": round(W[i1]["end"] - a, 3), "heard": out[k], "gap_after_in_take": round(nxt - W[i1]["end"], 3)},
                      open(VO / f"F{n}_{k}_align.json", "w"))
        print(f"F{n} ({stab}): " + " | ".join(f"{k} '{v}'" for k, v in out.items()), flush=True); n += 1
