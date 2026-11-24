#!/usr/bin/env python3
"""Search for a climax take that keeps Ewan's accent while he's frightened. v3 holds his Scots
when calm and loses it under some delivery tags (B and C went English/'Eastern European' on
'he's got my face'). Gates, all required: accent (CommonAccent cosine margin for scotland over the
next accent > +0.12 on l19 whole and its last 3 s, and on l21), intelligibility (Scribe), and still
him (speaker similarity to his calm lines >= 0.80). Survivors are saved to variants/<approach>_<n>."""
import json, pathlib, subprocess, sys, re, urllib.request, base64, uuid, difflib, shutil, warnings, logging
warnings.filterwarnings("ignore"); logging.disable(logging.WARNING)
D = pathlib.Path(__file__).parent
sys.path.insert(0, str(D)); sys.path.insert(0, "/tmp/claude-0/stub"); sys.path.insert(0, str(D.parent / "tools"))
import numpy as np
from accent import scot
from resemblyzer import VoiceEncoder
from verify_narration import norm as nrm
S = json.loads((D / "script.json").read_text()); L = {l["id"]: l for l in S["lines"]}
VID = S["voices"]["EWAN"]["id"]
def say(k): return L[k].get("say", L[k]["text"]).lstrip("—")
PRIME = {"l14": "[shaken] ", "l16": "[shaken] ", "l17": "[quietly] "}
LONG = ["l01", "l03", "l05", "l06", "l07", "l09", "l11", "l14", "l16", "l17"]
APPROACHES = {
 # name: (model, stability, {line: (tag, text override or None)})
 "plain":    ("eleven_v3", 0.5, {"l19": ("", "He's wearing my jacket. Base... he's got my— he's got my face, he's got my fac—"),
                                 "l21": ("", "Cat. Cat... that's not me. That is not—"), "l23": ("", "Don't let it—")}),
 "panicked": ("eleven_v3", 0.5, {"l19": ("[panicked] ", None), "l21": ("[panicked] ", None), "l23": ("[panicked] ", None)}),
 "steady":   ("eleven_multilingual_v2", 0.3, {"l19": ("", "He's wearing my jacket. Base... he's got my— he's got my face, he's got my fac—"),
                                              "l21": ("", "Cat! Cat, that's not me! That is not—"), "l23": ("", "Don't let it—")}),
 "robust":   ("eleven_v3", 1.0, {"l19": ("[panicked] ", None), "l21": ("[panicked] ", None), "l23": ("[panicked] ", None)}),
}
APPROACHES["long_plain"] = ("eleven_v3", 0.5, APPROACHES["plain"][2])
APPROACHES["long_panicked"] = ("eleven_v3", 0.5, {"l19": ("[panicked] ", None), "l21": ("[urgent] ", None), "l23": ("", None)})
# run-on: each line is generated past its cut (script "say"), so the voice is still mid-sentence
# when retime.py/radio_audio.py cut it inside the word
APPROACHES["long_runon"] = ("eleven_v3", 0.5, {"l19": ("", None), "l21": ("", None), "l23": ("", None)})
N = int(sys.argv[1]) if len(sys.argv) > 1 else 3
ONLY = sys.argv[2].split(",") if len(sys.argv) > 2 else list(APPROACHES)
APPROACHES = {k: v for k, v in APPROACHES.items() if k in ONLY}
def norm(s):
    o, i = [], []
    for n, c in enumerate(s):
        if c.isalnum(): o.append(c.lower()); i.append(n)
    return "".join(o), i
def run(c): subprocess.run(c, check=True, capture_output=True)
def pcm(p):
    raw = subprocess.run(["ffmpeg","-v","error","-i",str(p),"-ac","1","-ar","16000","-f","s16le","-"],capture_output=True,check=True).stdout
    x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    e = np.sqrt(np.convolve(x**2, np.ones(400)/400, "same")); x = x[e > 0.01]; return x / (np.abs(x).max() + 1e-9)
def scribe(p):
    b = pathlib.Path(p).read_bytes(); bd = uuid.uuid4().hex
    parts = [(f'--{bd}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v1\r\n').encode(),
             (f'--{bd}\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n').encode()+b+b"\r\n",
             f'--{bd}--\r\n'.encode()]
    r = urllib.request.Request("https://api.elevenlabs.io/v1/speech-to-text", data=b"".join(parts), method="POST",
        headers={"xi-api-key": "proxy-injected", "Content-Type": f"multipart/form-data; boundary={bd}"})
    return json.load(urllib.request.urlopen(r, timeout=120))["text"]
enc = VoiceEncoder(verbose=False)
src = (D / "radio_audio.py").read_text()
RADIO = "".join(re.findall(r'"([^"]*)"', src[src.index("RADIO = ("):src.index("CLEAN = (")]))
def rpcm(p):
    raw = subprocess.run(["ffmpeg","-v","error","-i",str(p),"-af",RADIO+",aresample=16000","-ac","1","-f","s16le","-"],capture_output=True,check=True).stdout
    x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    e = np.sqrt(np.convolve(x**2, np.ones(400)/400, "same")); x = x[e > 0.005]; return x / (np.abs(x).max() + 1e-9)
ref = np.mean([enc.embed_utterance(rpcm(D / "vo" / f"{k}.mp3")) for k in ["l01", "l03", "l05", "l09", "l16"]], axis=0)
def sim(p):   # through the radio, as heard: raw similarity understated how alike v2 and v3 Ewan sound
    e = enc.embed_utterance(rpcm(p)); return float(np.dot(e, ref) / (np.linalg.norm(e) * np.linalg.norm(ref)))

cdir = D / "vo" / "cand"; cdir.mkdir(exist_ok=True); survivors = []
for name, (model, stab, spec) in APPROACHES.items():
    for n in range(N):
        texts = {k: (spec[k][1] or say(k)) for k in ["l19", "l21", "l23"]}
        lead = LONG if name.startswith("long") else ["l16", "l17"]
        prim = [(PRIME.get(p, "") if model == "eleven_v3" else "") + say(p) for p in lead]
        tgt = [spec[k][0] * (model == "eleven_v3") + texts[k] for k in ["l19", "l21", "l23"]]
        passage = "\n\n".join(prim + tgt + ["Heading down off the ridge now, out."])
        body = {"text": passage, "model_id": model,
                "voice_settings": {"stability": stab, "similarity_boost": 0.85, "use_speaker_boost": True}}
        r = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{VID}/with-timestamps",
            data=json.dumps(body).encode(), method="POST", headers={"xi-api-key": "proxy-injected", "Content-Type": "application/json"})
        d = json.load(urllib.request.urlopen(r, timeout=300))
        take = cdir / f"take_{name}_{n}.mp3"; take.write_bytes(base64.b64decode(d["audio_base64"]))
        al = d["alignment"]; ch, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
        nal, idx = norm("".join(ch)); pos = 0
        for p in lead: pos = nal.find(norm(say(p))[0], pos) + len(norm(say(p))[0])
        ok, row, sl = True, [], {}
        for k in ["l19", "l21", "l23"]:
            nl = norm(texts[k])[0]; f = nal.find(nl, pos)
            if f < 0: ok = False; row.append(f"{k} MISSING"); break
            i0, i1 = idx[f], idx[f + len(nl) - 1]
            while i1 + 1 < len(ch) and not ch[i1+1].isalnum() and ch[i1+1] not in "\n[": i1 += 1
            nxt = idx[f + len(nl)] if f + len(nl) < len(idx) else len(ch) - 1
            a = max(st[i0] - 0.35, 0.0); b = min((en[i1] + st[nxt]) / 2, en[i1] + 0.40); pos = f + len(nl)
            out = cdir / f"{name}_{n}_{k}.mp3"
            run(["ffmpeg","-y","-v","error","-i",str(take),"-af",f"atrim={a:.4f}:{b:.4f},asetpts=N/SR/TB","-c:a","libmp3lame","-q:a","2",str(out)])
            w, g = nrm(say(k)), nrm(scribe(out)); ratio = difflib.SequenceMatcher(None, w.split(), g.split(), autojunk=False).ratio()
            ok &= ratio >= (0.8 if say(k).rstrip().endswith("—") else 0.9)
            if k == "l23": row.append(f"l23 {ratio*100:3.0f}%"); sl[k] = (out, ch, st, en, i0, i1, a); continue
            m_all = scot(out)[0]; m_tail = scot(out, 3)[0] if k == "l19" else m_all; s = sim(out)
            ok &= min(m_all, m_tail) > 0.12 and s >= 0.80
            row.append(f"{k} {ratio*100:3.0f}% scot {m_all:+.2f}/{m_tail:+.2f} sim {s:.2f}")
            sl[k] = (out, ch, st, en, i0, i1, a)
        print(f"{name:8} {n}: {' | '.join(row)}  ->  {'PASS' if ok else 'fail'}", flush=True)
        if ok:
            dst = D / "variants" / f"{name}_{n}"; dst.mkdir(parents=True, exist_ok=True)
            for k, (out, ch_, st_, en_, i0, i1, a) in sl.items():
                shutil.copy(out, dst / f"{k}.mp3")
                json.dump({"characters": ch_[i0:i1+1], "character_start_times_seconds": [round(x-a,4) for x in st_[i0:i1+1]],
                           "character_end_times_seconds": [round(x-a,4) for x in en_[i0:i1+1]]}, open(dst / f"{k}_align.json", "w"))
            survivors.append(f"{name}_{n}")
print("SURVIVORS:", survivors if survivors else "none")
