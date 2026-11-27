#!/usr/bin/env python3
"""The payoff line again. All six draft-2 takes delivered j23 "It's in here with me" ~75% voiced (spoken, not
whispered) under "[whispering]"; v3's own tag is "[whispers]". Re-generate the last exchange in context (London lead,
t16..t18, j23, sacrificial line) N times at stabilities 0.5 and 0.0; cut j23 on Scribe's word times; measure how much
of it is voiced. Writes vo/E<n>_j23.mp3 + _align.json, prints the table."""
import json, urllib.request, urllib.error, base64, pathlib, subprocess, sys, time, uuid, warnings
warnings.filterwarnings("ignore")
import numpy as np, parselmouth
D = pathlib.Path(__file__).parent; S = json.loads((D / "script.json").read_text()); V = S["voices"]; VO = D / "vo"; L = {l["id"]: l for l in S["lines"]}
def post(url, body, raw=False):
    for attempt in range(6):
        try:
            r = urllib.request.Request(url, data=body if raw else json.dumps(body).encode(), method="POST",
                headers={"xi-api-key": "proxy-injected", **({"Content-Type": raw} if raw else {"Content-Type": "application/json"})})
            return json.load(urllib.request.urlopen(r, timeout=300))
        except urllib.error.HTTPError as e:
            if e.code in (409, 429, 500, 503): time.sleep(5 * (attempt + 1)); continue
            raise RuntimeError(f"{e.code} {e.read()[:300]}")
def scribe(p):
    bd = uuid.uuid4().hex; b = p.read_bytes()
    body = (f'--{bd}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v1\r\n'.encode() +
            f'--{bd}\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n'.encode() + b + f'\r\n--{bd}--\r\n'.encode())
    return post("https://api.elevenlabs.io/v1/speech-to-text", body, raw=f"multipart/form-data; boundary={bd}")
inputs = [{"voice_id": V[w]["id"], "text": t} for w, t in S["lead"]]
import os
if os.environ.get("CTX") == "whisper":     # put him in whisper mode first: his whispered lines lead into the payoff
    inputs += [{"voice_id": V["TONY"]["id"], "text": "[quietly] Jamie?"},
               {"voice_id": V["JAMIE"]["id"], "text": "[whispers] It's stopped."},
               {"voice_id": V["TONY"]["id"], "text": "[quietly] Doors?"},
               {"voice_id": V["JAMIE"]["id"], "text": "[whispers] Locked."},]
else:
    inputs += [{"voice_id": V["TONY"]["id"], "text": "[quietly] Still there?"},
           {"voice_id": V["JAMIE"]["id"], "text": "[relieved] Yeah. I think it's gone."},
           {"voice_id": V["TONY"]["id"], "text": "[warm] Try and get your head down. I'm not going anywhere."}]
inputs += [{"voice_id": V["TONY"]["id"], "text": "[quietly] Is that your bag?"},
           {"voice_id": V["JAMIE"]["id"], "text": "[whispers] It's in here with me."},
           {"voice_id": V["TONY"]["id"], "text": "[scared] Jamie? Jamie, talk to me."}]
n = int(os.environ.get('N0', '0'))
for stab in (0.5, 0.0):
    for _ in range(int(sys.argv[1]) if len(sys.argv) > 1 else 4):
        d = post("https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps", {"inputs": inputs, "model_id": "eleven_v3", "settings": {"stability": stab}})
        take = VO / f"E{n}_take.mp3"; take.write_bytes(base64.b64decode(d["audio_base64"]))
        W = [w for w in scribe(take)["words"] if w["type"] == "word"]; t = [w["text"].lower().strip(".,?!") for w in W]
        hit = [i for i in range(len(t) - 3) if t[i] in ("its", "it's") and t[i + 1] == "in" and t[i + 2] == "here"]
        if not hit: print(f"E{n} ({stab}): j23 not found: {' '.join(t[-14:])}"); n += 1; continue
        i0 = hit[-1]; i1 = min(i0 + 4, len(W) - 1)
        nxt = W[i1 + 1]["start"] if i1 + 1 < len(W) else W[i1]["end"] + 0.5
        a = max(W[i0 - 1]["end"] if i0 else 0.0, W[i0]["start"] - 0.3); b = min(nxt, W[i1]["end"] + 0.3)
        out = VO / f"E{n}_j23.mp3"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(take), "-af", f"atrim={a:.3f}:{b:.3f},asetpts=N/SR/TB", "-c:a", "libmp3lame", "-q:a", "2", str(out)], check=True)
        heard = " ".join(W[i]["text"] for i in range(i0, i1 + 1))
        json.dump({"start": round(W[i0]["start"] - a, 3), "end": round(W[i1]["end"] - a, 3), "heard": heard, "gap_after_in_take": round(nxt - W[i1]["end"], 3)},
                  open(VO / f"E{n}_j23_align.json", "w"))
        x = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", str(out), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True).stdout, np.float32).astype(np.float64)
        s = x[int((W[i0]["start"] - a) * 16000): int((W[i1]["end"] - a + 0.05) * 16000)]
        f0 = parselmouth.Sound(s, 16000).to_pitch(time_step=0.01, pitch_floor=70, pitch_ceiling=400).selected_array["frequency"]
        e = np.array([np.sqrt(np.mean(s[i:i + 160] ** 2)) for i in range(0, len(s) - 160, 160)]); sp_ = e > e.max() * 0.1; m = min(len(f0), len(sp_))
        vf = float((f0[:m][sp_[:m]] > 0).mean())
        print(f"E{n} (stability {stab}): '{heard}'  voiced {vf * 100:.0f}%  {W[i1]['end'] - W[i0]['start']:.2f}s", flush=True); n += 1
