#!/usr/bin/env python3
"""Doors goes London (user: English, can be Southern, working class). Working-class London candidates on eleven_v3,
each take opening on a throwaway London lead-in (holds the accent) and ending on a sacrificial line; the two test
lines are sliced out by alignment. Screen: Scribe must hear the words; CommonAccent must not hear US/Indian/Australian.
Writes mick-voice-options-london.mp3 and gaz-voice-options-london.mp3."""
import json, pathlib, re, subprocess, sys, time, base64, urllib.request, urllib.error, warnings
warnings.filterwarnings("ignore")
D = pathlib.Path(__file__).parent; T = pathlib.Path("/tmp/claude-0/t03/aud3"); T.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(D)); sys.path.append(str(D.parent / "radio02-corner"))
from phon import scribe
from accent import _clf, _load, _labels
VS = {"stability": 0.5, "similarity_boost": 0.85, "use_speaker_boost": True}
LEAD = {"MICK": "[casual] Alright. It's been chucking it down all night, and the North Circular's been a car park since four.",
        "GAZ": "[cheerful] Alright, Dad. It's been chucking it down all week, and I ain't had me breakfast yet."}
LINES = {"MICK": [("[warmly, joking]", "Mirrors, not your phone. And text your mum when you get to Leeds, or she'll be ringing me, and nobody wants that."),
                  ("[scared, pleading]", "Just do it, son. Please.")],
         "GAZ":  [("[laughing]", "Yes, Dad. It's me first run on me own, not me first day at school."),
                  ("[quietly, uneasy]", "Dad. Did you just say my name?")]}
CAND = {"MICK": [("Eastend Steve", "1TE7ou3jyxHsyRehUuMB"), ("Ricky", "ytcsltLTtCHxNn1vC76H"), ("John", "2LslKNCAKrrgSuf8fLbc"), ("Jim", "sQGQZsvZ9uPuxtTy1uNh")],
        "GAZ":  [("Harry", "kOVqQImaJYcrUxZmjqgl"), ("Vinnie", "TjO2L33VfWYPVuCxsbC4"), ("Charlie", "sLfduly0sixkh8riDzed"), ("Sam", "zOzKXdLgsgWMld5cH9Be")]}
SAC = "[calm] Right, talk to you in a bit."
SHARED = {v["voice_id"]: v for v in json.load(open(D / "aud" / "london_search.json"))}
RADIO = ("highpass=f=300,lowpass=f=3400,acompressor=threshold=-24dB:ratio=3.5:attack=6:release=200:makeup=2,"
         "aresample=16000,aresample=48000,highpass=f=280,lowpass=f=3600,equalizer=f=2200:t=q:w=1.2:g=3")
ROOM = "highpass=f=90,lowpass=f=7500,aecho=0.8:0.55:31|57:0.15|0.08,acompressor=threshold=-22dB:ratio=3:attack=10:release=150"
def run(c): subprocess.run(c, check=True, capture_output=True)
def lufs(p):
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", str(p), "-af", "ebur128=framelog=quiet", "-f", "null", "-"], capture_output=True, text=True)
    return float(re.findall(r"I:\s*(-?[\d.]+)\s*LUFS", r.stderr)[-1])
def req(url, body):
    r = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST", headers={"xi-api-key": "proxy-injected", "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(r, timeout=300))
def tts(vid, text):
    for a in range(6):
        try: return req(f"https://api.elevenlabs.io/v1/text-to-speech/{vid}/with-timestamps", {"text": text, "model_id": "eleven_v3", "voice_settings": VS})
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="ignore")
            if e.code in (409, 429, 500): time.sleep(5 * (a + 1)); continue
            if e.code in (400, 404) and "voice" in body.lower() and vid in SHARED and a == 0:
                vid = req(f"https://api.elevenlabs.io/v1/voices/add/{SHARED[vid]['public_owner_id']}/{vid}", {"new_name": f"WTPN London {SHARED[vid]['name'][:20]}"}).get("voice_id", vid); continue
            raise RuntimeError(f"{e.code} {body[:200]}")
def norm(s):
    out, idx = [], []
    for i, c in enumerate(s):
        if c.isalnum(): out.append(c.lower()); idx.append(i)
    return "".join(out), idx
def accent(p):
    o, _, _, _ = _clf.classify_batch(_load(p)); c = dict(zip(_labels, o.squeeze(0).tolist()))
    return max(c, key=c.get), c
for f in T.glob("*.wav"): pass
run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "0.7", "-c:a", "pcm_s16le", str(T / "g07.wav")])
run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "2.2", "-c:a", "pcm_s16le", str(T / "g22.wav")])
for role, cands in CAND.items():
    parts = []
    for ci, (name, vid) in enumerate(cands):
        passage = "\n\n".join([LEAD[role]] + [f"{tag} {t}" for tag, t in LINES[role]] + [SAC])
        take = T / f"{role}_{ci}.mp3"; alj = T / f"{role}_{ci}.json"
        if not take.exists():
            d = tts(vid, passage); take.write_bytes(base64.b64decode(d["audio_base64"])); json.dump(d["alignment"], open(alj, "w"))
        al = json.load(open(alj)); ch, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
        nal, idx = norm("".join(ch)); pos = len(norm(LEAD[role])[0]) - 5
        top, c = accent(take)
        for li, (tag, text) in enumerate(LINES[role]):
            nl, _ = norm(text); f = nal.find(nl, pos); pos = f + len(nl)
            a = max(0.0, st[idx[f]] - 0.25); b = en[idx[f + len(nl) - 1]] + 0.35
            raw = T / f"{role}_{ci}_{li}.wav"
            run(["ffmpeg", "-y", "-v", "error", "-i", str(take), "-af", f"atrim={a:.3f}:{b:.3f},asetpts=N/SR/TB,aresample=48000," + (ROOM if role == "MICK" else RADIO),
                 "-ac", "1", "-c:a", "pcm_s16le", str(raw)])
            n = T / f"{role}_{ci}_{li}_n.wav"
            run(["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-af", f"volume={-18 - lufs(raw):.2f}dB,alimiter=level=0:limit=0.9", "-c:a", "pcm_s16le", str(n)])
            parts += [n, T / ("g07.wav" if li == 0 else "g22.wav")]
            heard = " ".join(w["text"] for w in scribe(raw))
            print(f"{role} {ci + 1} {name:13} accent:{top:8} eng {c['england']:+.2f} us {c['us']:+.2f} ind {c['indian']:+.2f} | {heard}")
    lst = T / f"{role}.txt"; lst.write_text("".join(f"file '{p}'\n" for p in parts))
    run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c:a", "libmp3lame", "-b:a", "160k", str(D / f"{role.lower()}-voice-options-london.mp3")])
