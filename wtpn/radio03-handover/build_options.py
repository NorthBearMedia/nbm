#!/usr/bin/env python3
"""Voice option reels for the user: per option, the key line clean, then as it will sound in the piece
(radio for Mick's last line and Dave; phone speaker for Karen). Writes <role>-voice-options.mp3."""
import json, pathlib, re, subprocess, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from phon import scribe
D = pathlib.Path(__file__).parent; T = pathlib.Path("/tmp/claude-0/t03"); T.mkdir(parents=True, exist_ok=True)
RADIO = ("highpass=f=380,lowpass=f=2700,acompressor=threshold=-24dB:ratio=4:attack=6:release=220:makeup=2,"
         "asoftclip=type=tanh,aresample=11025,aresample=48000,highpass=f=330,lowpass=f=3000,equalizer=f=1800:t=q:w=1.2:g=5")
PHONE = ("highpass=f=320,lowpass=f=3300,acompressor=threshold=-22dB:ratio=3:attack=5:release=150:makeup=2,"
         "aresample=8000,aresample=48000,equalizer=f=1500:t=q:w=1.0:g=4")
REELS = {
 "mick":  (["MICK_mike_v2", "MICK_tony_v2", "MICK_johnnorth_v2", "MICK_darren_v2", "MICK_paul_v2"],
           [("steve's never said please in his life", None), ("dave who's that in my office", RADIO)]),
 "dave":  (["DAVE_owens_v2", "DAVE_ryan_v2", "DAVE_phil_v2", "DAVE_chris_v2", "DAVE_ashley_v2"],
           [("mick you'll not believe this steve's at the gate", None), ("mick you'll not believe this steve's at the gate", RADIO)]),
 "karen": (["KAREN_wilshi_v3", "KAREN_chazza_v2", "KAREN_kirsty_v2", "KAREN_miri_v3"],
           [("no love someone rang the house about half two he went white went straight out", None),
            ("no love someone rang the house about half two he went white went straight out", PHONE)]),
}
def run(c): subprocess.run(c, check=True, capture_output=True)
def lufs(p):
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", str(p), "-af", "ebur128=framelog=quiet", "-f", "null", "-"], capture_output=True, text=True)
    return float(re.findall(r"I:\s*(-?[\d.]+)\s*LUFS", r.stderr)[-1])
def norm(w): return re.sub(r"[^a-z']", "", w.lower().replace("’", "'"))
def span(ws, phrase):
    tgt = phrase.split(); toks = [norm(w["text"]) for w in ws]
    for i in range(len(toks) - len(tgt) + 1):
        if toks[i:i + len(tgt)] == tgt: return ws[i]["start"], ws[i + len(tgt) - 1]["end"]
    raise ValueError(f"'{phrase}' not found in {' '.join(toks)}")
def silence(sec, name):
    p = T / name; run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", str(sec), "-c:a", "pcm_s16le", str(p)]); return p
gap_s, gap_l = silence(0.9, "g09.wav"), silence(2.4, "g24.wav")
for role, (opts, lines) in REELS.items():
    parts = []
    for k, stem in enumerate(opts):
        src = D / "aud" / f"{stem}.mp3"; cache = src.with_suffix(".words.json")
        ws = json.load(open(cache)) if cache.exists() else scribe(src); json.dump(ws, open(cache, "w"))
        for j, (phrase, chain) in enumerate(lines):
            a, b = span(ws, phrase); a = max(0.0, a - 0.12); b += 0.30
            cut = T / f"{stem}_{j}.wav"
            run(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-af",
                 f"atrim={a:.3f}:{b:.3f},asetpts=N/SR/TB,aresample=48000,afade=t=out:st={b - a - 0.08:.3f}:d=0.08", "-ac", "1", "-c:a", "pcm_s16le", str(cut)])
            if chain:
                c2 = T / f"{stem}_{j}_fx.wav"; run(["ffmpeg", "-y", "-v", "error", "-i", str(cut), "-af", chain, "-c:a", "pcm_s16le", str(c2)]); cut = c2
            fin = T / f"{stem}_{j}_n.wav"
            run(["ffmpeg", "-y", "-v", "error", "-i", str(cut), "-af", f"volume={-18 - lufs(cut):.2f}dB,alimiter=level=0:limit=0.9", "-c:a", "pcm_s16le", str(fin)])
            parts += [fin, gap_s if j < len(lines) - 1 else gap_l]
    lst = T / f"{role}.txt"; lst.write_text("".join(f"file '{p}'\n" for p in parts))
    out = D / f"{role}-voice-options.mp3"
    run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c:a", "libmp3lame", "-b:a", "160k", str(out)])
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out)], capture_output=True, text=True).stdout)
    print(f"{out.name}: {len(opts)} options, {dur:.1f}s")
