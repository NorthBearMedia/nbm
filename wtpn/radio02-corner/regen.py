#!/usr/bin/env python3
"""Regenerate some lines of one character without touching the rest: N candidate passages, each
primed by that character's own approved lines; keep the candidate that is fully intelligible
(Scribe) and sounds most like the approved lines (speaker similarity). Tags only on eleven_v3.
Usage: regen.py --targets l03 l20 --primers l05 l08 --ref l05 l08 l15 --n 3"""
import json, pathlib, subprocess, sys, argparse, urllib.request, urllib.error, base64, uuid, difflib, shutil, re, time, warnings
warnings.filterwarnings("ignore"); sys.path.insert(0, "/tmp/claude-0/stub")
import numpy as np
from resemblyzer import VoiceEncoder
D = pathlib.Path(__file__).parent
ap = argparse.ArgumentParser(); ap.add_argument("--targets", nargs="+"); ap.add_argument("--primers", nargs="*", default=[])
ap.add_argument("--ref", nargs="+"); ap.add_argument("--n", type=int, default=3)
ap.add_argument("--question", action="store_true", help="require a rising pitch at the end (a real question)")
a = ap.parse_args()
S = json.loads((D / "script.json").read_text()); L = {l["id"]: l for l in S["lines"]}
who = L[a.targets[0]]["who"]; v = S["voices"][who]; v3 = v["model"] == "eleven_v3"
def say(l): return l.get("say", l["text"]).lstrip("—")
def tagged(k): return ((L[k]["tag"] + " ") if (v3 and L[k].get("tag")) else "") + say(L[k])
def norm(s):
    o, i = [], []
    for n, c in enumerate(s):
        if c.isalnum(): o.append(c.lower()); i.append(n)
    return "".join(o), i
def w(s): return re.findall(r"[a-z']+", re.sub(r"\[[^\]]*\]", " ", s.lower()).replace("jerry", "gerry").replace("joe", "jo").replace("60", "sixty"))
def scribe(p):
    b = pathlib.Path(p).read_bytes(); bd = uuid.uuid4().hex
    parts = [(f'--{bd}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v1\r\n').encode(),
             (f'--{bd}\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n').encode()+b+b"\r\n", f'--{bd}--\r\n'.encode()]
    r = urllib.request.Request("https://api.elevenlabs.io/v1/speech-to-text", data=b"".join(parts), method="POST",
        headers={"xi-api-key": "proxy-injected", "Content-Type": f"multipart/form-data; boundary={bd}"})
    return json.load(urllib.request.urlopen(r, timeout=120))["text"]
def pcm(p):
    raw = subprocess.run(["ffmpeg","-v","error","-i",str(p),"-ac","1","-ar","16000","-f","s16le","-"],capture_output=True,check=True).stdout
    x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    e = np.sqrt(np.convolve(x**2, np.ones(400)/400, "same")); x = x[e > 0.01]; return x / (np.abs(x).max() + 1e-9)
enc = VoiceEncoder(verbose=False)
ref = np.mean([enc.embed_utterance(pcm(D / "vo" / f"{k}.mp3")) for k in a.ref], axis=0)
SAC = ("[calm] " if v3 else "") + "Right so, I'll talk to you in a bit."
passage = "\n\n".join([tagged(k) for k in a.primers + a.targets] + [SAC])
vs = {"stability": 0.5, "similarity_boost": 0.85, "use_speaker_boost": True}; vs.update(v.get("settings", {}))
cdir = D / "vo" / "cand"; best = None
for n in range(a.n):
    for t in range(5):
        try:
            r = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{v['id']}/with-timestamps",
                data=json.dumps({"text": passage, "model_id": v["model"], "voice_settings": vs}).encode(), method="POST",
                headers={"xi-api-key": "proxy-injected", "Content-Type": "application/json"})
            d = json.load(urllib.request.urlopen(r, timeout=300)); break
        except urllib.error.HTTPError as e:
            if e.code in (409, 429): time.sleep(3 * (t + 1)); continue
            raise
    take = cdir / f"regen_{'-'.join(a.targets)}_{n}.mp3"; take.write_bytes(base64.b64decode(d["audio_base64"]))
    al = d["alignment"]; ch, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    nal, idx = norm("".join(ch)); pos = 0
    for p in a.primers: pos = nal.find(norm(say(L[p]))[0], pos) + len(norm(say(L[p]))[0])
    sl, ok, sims, rep = {}, True, [], []
    for k in a.targets:
        nl = norm(say(L[k]))[0]; f = nal.find(nl, pos)
        if f < 0: ok = False; rep.append(f"{k} MISSING"); break
        i0, i1 = idx[f], idx[f + len(nl) - 1]
        while i1 + 1 < len(ch) and not ch[i1+1].isalnum() and ch[i1+1] not in "\n[": i1 += 1
        nxt = idx[f + len(nl)] if f + len(nl) < len(idx) else len(ch) - 1
        x0 = max(st[i0] - 0.35, 0.0); x1 = min((en[i1] + st[nxt]) / 2, en[i1] + 0.40); pos = f + len(nl)
        out = cdir / f"{k}_r{n}.mp3"
        subprocess.run(["ffmpeg","-y","-v","error","-i",str(take),"-af",f"atrim={x0:.4f}:{x1:.4f},asetpts=N/SR/TB","-c:a","libmp3lame","-q:a","2",str(out)], check=True)
        h = scribe(out); r_ = difflib.SequenceMatcher(None, w(say(L[k])), w(h), autojunk=False).ratio()
        e_ = enc.embed_utterance(pcm(out)); s_ = float(np.dot(e_, ref) / (np.linalg.norm(e_) * np.linalg.norm(ref)))
        rise = ""
        if a.question:
            import librosa
            y_, sr_ = librosa.load(out, sr=16000); f0, vf, _ = librosa.pyin(y_, fmin=80, fmax=500, sr=sr_, hop_length=160)
            f0 = f0[~np.isnan(f0)]
            if len(f0) > 10:
                n4 = max(3, len(f0) // 4); up = 12 * np.log2(np.median(f0[-n4:]) / np.median(f0[:-n4]))
            else: up = -9
            ok &= up > 1.5; rise = f" rise {up:+.1f}st"; s_ += 0.01 * up
        ok &= r_ >= 0.92; sims.append(s_); rep.append(f"{k} {r_*100:3.0f}% sim {s_:.3f}{rise} {h!r}")
        sl[k] = (out, {"characters": ch[i0:i1+1], "character_start_times_seconds": [round(t - x0, 4) for t in st[i0:i1+1]],
                       "character_end_times_seconds": [round(t - x0, 4) for t in en[i0:i1+1]]})
    score = float(np.mean(sims)) if ok else -1
    print(f"take {n}: " + "  |  ".join(rep) + f"  ->  {'score %.3f' % score if ok else 'REJECTED'}")
    if score > (best[0] if best else -1): best = (score, n, sl)
if not best or best[0] < 0: sys.exit("no candidate passed")
for k, (path, al) in best[2].items():
    shutil.copy(path, D / "vo" / f"{k}.mp3"); json.dump(al, open(D / "vo" / f"{k}_align.json", "w"))
    (D / "vo" / f"{k}_align_tts.json").unlink(missing_ok=True)
print(f"KEPT take {best[1]} (score {best[0]:.3f})")
