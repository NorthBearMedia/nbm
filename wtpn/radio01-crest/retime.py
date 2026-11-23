#!/usr/bin/env python3
"""Re-time each sliced line from the audio itself. v3's own timestamps drift across a long take
(l07 started 0.55 s early, and the words between were placed on silence), and every cut, the PTT
clip, the cut-off point and every caption run on them. Scribe's word times are measured on the
audio, so: transcribe each slice, align Scribe's words to the script's, and rebuild per-character
timings. A cut-off fragment the take finished in full ("fac—" spoken as "face") is ended
proportionally inside the word, where the missing letters would begin.
Keeps the model's own timings as <id>_align_tts.json. Usage: retime.py [ids...]"""
import json, pathlib, urllib.request, uuid, difflib, sys, re, shutil
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "tools"))
from verify_narration import norm as nrm
D = pathlib.Path(__file__).parent
S = json.loads((D / "script.json").read_text()); L = {l["id"]: l for l in S["lines"]}

def scribe(path):
    b = path.read_bytes(); bd = uuid.uuid4().hex
    parts = [(f'--{bd}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v1\r\n').encode(),
             (f'--{bd}\r\nContent-Disposition: form-data; name="timestamps_granularity"\r\n\r\nword\r\n').encode(),
             (f'--{bd}\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n').encode() + b + b"\r\n",
             f'--{bd}--\r\n'.encode()]
    r = urllib.request.Request("https://api.elevenlabs.io/v1/speech-to-text", data=b"".join(parts), method="POST",
        headers={"xi-api-key": "proxy-injected", "Content-Type": f"multipart/form-data; boundary={bd}"})
    d = json.load(urllib.request.urlopen(r, timeout=120))
    return [(w["text"], w["start"], w["end"]) for w in d.get("words", []) if w.get("type") == "word"]

def key(w): return nrm(w).replace(" ", "")

for k in (sys.argv[1:] or [l["id"] for l in S["lines"]]):
    ln = L[k]; text = ln.get("say", ln["text"]).lstrip("—")
    sw = text.split()                                     # script words, punctuation attached
    hw = scribe(D / "vo" / f"{k}.mp3")                    # heard words with real times
    sm = difflib.SequenceMatcher(None, [key(w) for w in sw], [key(w[0]) for w in hw], autojunk=False)
    times = [None] * len(sw)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for o in range(i2 - i1): times[i1 + o] = (hw[j1 + o][1], hw[j1 + o][2])
        elif tag == "replace":                             # e.g. 'nine seven five' heard as '975'
            t0, t1 = hw[j1][1], hw[j2 - 1][2]; n = sum(len(w) for w in sw[i1:i2]); acc = 0
            for i in range(i1, i2):
                a = t0 + (t1 - t0) * acc / n; acc += len(sw[i]); times[i] = (a, t0 + (t1 - t0) * acc / n)
    for i in range(len(sw)):                               # anything unheard: between its neighbours
        if times[i] is None:
            prv = next((times[j][1] for j in range(i - 1, -1, -1) if times[j]), 0.0)
            nxt = next((times[j][0] for j in range(i + 1, len(sw)) if times[j]), prv + 0.3)
            times[i] = (prv, max(prv + 0.05, nxt))
    last = sw[-1]; frag = re.sub(r"[^\w']", "", last).lower()
    if last.endswith("—") and hw:
        heard = re.sub(r"[^\w']", "", hw[-1][0]).lower()
        if heard != frag and heard.startswith(frag):       # the take finished the word: cut inside it
            s0, e0 = times[-1]   # land in the vowel, before the final consonant: 'fac' of 'face' must read as cut
            times[-1] = (s0, s0 + (e0 - s0) * max(0.45, (len(frag) - 0.8) / len(heard)))
    ch, st, en = [], [], []
    for i, (w, (a, b)) in enumerate(zip(sw, times)):
        if i:
            gap = (times[i-1][1], a if a > times[i-1][1] else times[i-1][1])
            ch.append(" "); st.append(gap[0]); en.append(gap[1])
        for c_i, c in enumerate(w):
            st.append(round(a + (b - a) * c_i / len(w), 4)); en.append(round(a + (b - a) * (c_i + 1) / len(w), 4)); ch.append(c)
    src = D / "vo" / f"{k}_align.json"
    if not (D / "vo" / f"{k}_align_tts.json").exists(): shutil.copy(src, D / "vo" / f"{k}_align_tts.json")
    json.dump({"characters": ch, "character_start_times_seconds": st, "character_end_times_seconds": en}, open(src, "w"))
    matched = sum(b - a for t, a, b, *_ in sm.get_opcodes() if t == "equal")
    print(f"{k}: {len(sw)} words, {matched} matched to heard words, {times[0][0]:.2f}-{times[-1][1]:.2f}s")
