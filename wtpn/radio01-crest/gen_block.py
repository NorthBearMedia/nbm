#!/usr/bin/env python3
"""Generate N candidate takes of one or more lines inside a primed passage, and keep the best.
Primers settle the voice into its register first; a sacrificial line after absorbs v3's habit of
swallowing the end of a take. Each candidate must be fully intelligible (Scribe); among those, the
winner is the take that still sounds most like the character's calm lines (speaker-verification
similarity). Over-acting in v3 tends to change the timbre as well as the delivery, so similarity is
a usable proxy for 'still him'. Usage: gen_block.py --targets l19 l21 l23 --primers l16 l17 --n 4"""
import json, pathlib, subprocess, sys, argparse, urllib.request, base64, uuid, difflib, shutil, warnings
warnings.filterwarnings("ignore")
sys.path.insert(0, "/tmp/claude-0/stub"); sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "tools"))
import numpy as np
from resemblyzer import VoiceEncoder
from verify_narration import norm as nrm
D = pathlib.Path(__file__).parent
ap = argparse.ArgumentParser(); ap.add_argument("--targets", nargs="+"); ap.add_argument("--primers", nargs="*", default=[])
ap.add_argument("--n", type=int, default=4); ap.add_argument("--ref", nargs="+")
ap.add_argument("--tags", default="tags.json"); ap.add_argument("--save", default="vo"); args = ap.parse_args()
S = json.loads((D / "script.json").read_text()); L = {l["id"]: l for l in S["lines"]}
TAG = json.loads((D / args.tags).read_text())
who = L[args.targets[0]]["who"]; v = S["voices"][who]
def say(ln): return ln.get("say", ln["text"]).lstrip("—")
def norm(s):
    o, i = [], []
    for n, c in enumerate(s):
        if c.isalnum(): o.append(c.lower()); i.append(n)
    return "".join(o), i
def run(c): subprocess.run(c, check=True, capture_output=True)
def pcm(p):
    raw = subprocess.run(["ffmpeg","-v","error","-i",str(p),"-ac","1","-ar","16000","-f","s16le","-"],capture_output=True,check=True).stdout
    x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    e = np.sqrt(np.convolve(x**2, np.ones(400)/400, "same")); x = x[e > 0.01]
    return x / (np.abs(x).max() + 1e-9)
def scribe(p):
    b = pathlib.Path(p).read_bytes(); bd = uuid.uuid4().hex
    parts = [(f'--{bd}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v1\r\n').encode(),
             (f'--{bd}\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n').encode()+b+b"\r\n",
             f'--{bd}--\r\n'.encode()]
    r = urllib.request.Request("https://api.elevenlabs.io/v1/speech-to-text", data=b"".join(parts), method="POST",
        headers={"xi-api-key": "proxy-injected", "Content-Type": f"multipart/form-data; boundary={bd}"})
    return json.load(urllib.request.urlopen(r, timeout=120))["text"]

enc = VoiceEncoder(verbose=False)
ref = np.mean([enc.embed_utterance(pcm(D / "vo" / f"{k}.mp3")) for k in args.ref], axis=0)
def sim(p):
    x = pcm(p)
    if len(x) / 16000 < 1.2: return None
    e = enc.embed_utterance(x); return float(np.dot(e, ref) / (np.linalg.norm(e) * np.linalg.norm(ref)))

def tagged(k): return (TAG[k] + " " if k in TAG else "") + say(L[k])
passage = "\n\n".join([tagged(p) for p in args.primers] + [tagged(t) for t in args.targets]
                      + ["[calm] Heading down off the ridge now, out."])
cdir = D / "vo" / "cand"; cdir.mkdir(exist_ok=True); best = None
for n in range(args.n):
    body = {"text": passage, "model_id": v.get("model", "eleven_v3"),
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.85, "use_speaker_boost": True}}
    r = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{v['id']}/with-timestamps",
        data=json.dumps(body).encode(), method="POST", headers={"xi-api-key": "proxy-injected", "Content-Type": "application/json"})
    d = json.load(urllib.request.urlopen(r, timeout=300))
    take = cdir / f"take_{'-'.join(args.targets)}_{n}.mp3"; take.write_bytes(base64.b64decode(d["audio_base64"]))
    al = d["alignment"]; ch, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    nal, idx = norm("".join(ch)); pos = 0
    for p in args.primers: pos = nal.find(norm(say(L[p]))[0], pos) + len(norm(say(L[p]))[0])
    slices, ok, sims, report = {}, True, [], []
    for t in args.targets:
        nl = norm(say(L[t]))[0]; f = nal.find(nl, pos)
        if f < 0: ok = False; break
        i0, i1 = idx[f], idx[f + len(nl) - 1]
        while i1 + 1 < len(ch) and not ch[i1+1].isalnum() and ch[i1+1] not in "\n[": i1 += 1
        nxt = idx[f + len(nl)] if f + len(nl) < len(idx) else len(ch) - 1
        a = max(st[i0] - 0.35, 0.0); b = min((en[i1] + st[nxt]) / 2, en[i1] + 0.40); pos = f + len(nl)
        out = cdir / f"{t}_{n}.mp3"
        run(["ffmpeg","-y","-v","error","-i",str(take),"-af",f"atrim={a:.4f}:{b:.4f},asetpts=N/SR/TB","-c:a","libmp3lame","-q:a","2",str(out)])
        heard = scribe(out); w, g = nrm(say(L[t])), nrm(heard)
        ratio = difflib.SequenceMatcher(None, w.split(), g.split(), autojunk=False).ratio()
        s = sim(out); ok &= ratio >= (0.8 if say(L[t]).rstrip().endswith("—") else 0.9)
        if s is not None: sims.append(s)
        slices[t] = (out, {"characters": ch[i0:i1+1], "character_start_times_seconds": [round(x-a,4) for x in st[i0:i1+1]],
                           "character_end_times_seconds": [round(x-a,4) for x in en[i0:i1+1]]})
        report.append(f"{t} {ratio*100:3.0f}% sim {s:.3f}" if s is not None else f"{t} {ratio*100:3.0f}% (short)")
    score = float(np.mean(sims)) if (ok and sims) else -1
    print(f"  take {n}: {'  |  '.join(report)}   ->  {'score %.3f' % score if score > 0 else 'REJECTED'}")
    if score > (best[0] if best else -1): best = (score, n, slices)
if not best: sys.exit("no candidate passed intelligibility")
for t, (path, al) in best[2].items():
    dst = D / args.save; dst.mkdir(parents=True, exist_ok=True)
    shutil.copy(path, dst / f"{t}.mp3"); json.dump(al, open(dst / f"{t}_align.json", "w"))
    (dst / f"{t}_align_tts.json").unlink(missing_ok=True)
print(f"KEPT take {best[1]} (score {best[0]:.3f})")
