#!/usr/bin/env python3
"""Doors recast (user: accents weird / 'Indian', Mick a miserable bore). Same two lines per candidate, on the
steadier multilingual_v2 with expressive settings: a warm line and a scared one. Mick in the room, Gaz on the radio.
Writes mick-voice-options.mp3 and gaz-voice-options.mp3."""
import json, pathlib, re, subprocess, sys, time, urllib.request, urllib.error
D = pathlib.Path(__file__).parent; A = D / "aud"; T = pathlib.Path("/tmp/claude-0/t03/aud2"); T.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(D)); from phon import scribe
DV = json.load(open(A / "designed_voices.json"))
VS = {"stability": 0.35, "similarity_boost": 0.85, "style": 0.45, "use_speaker_boost": True}
LINES = {"MICK": ["Mirrors, not your phone. And text your mam when you get to Hull, or she'll be ringing me, and nobody wants that.",
                  "Just do it, son. Please."],
         "GAZ":  ["Yes, Dad. It's me first run on me own, not me first day at school.", "Dad. Did you just say my name?"]}
CAND = {"MICK": [("Paul", "oCXdm5WkYoKVEdlbPLev"), ("John North", "7rQX8r6PVq3gfJ8rZzyE"), ("Designed A", DV["MICKD_0"]),
                 ("Designed B", DV["MICKD_1"]), ("Designed C", DV["MICKD_2"])],
        "GAZ":  [("Ryan", "EvfUC5EzfWjmoPWebkXG"), ("Phil", "m1JdxoylOYG8QBo8giNn"), ("Designed A", DV["GAZD_0"]),
                 ("Designed B", DV["GAZD_1"]), ("Designed C", DV["GAZD_2"])]}
RADIO = ("highpass=f=300,lowpass=f=3400,acompressor=threshold=-24dB:ratio=3.5:attack=6:release=200:makeup=2,"
         "aresample=16000,aresample=48000,highpass=f=280,lowpass=f=3600,equalizer=f=2200:t=q:w=1.2:g=3")
ROOM = "highpass=f=90,lowpass=f=7500,aecho=0.8:0.55:31|57:0.15|0.08,acompressor=threshold=-22dB:ratio=3:attack=10:release=150"
def run(c): subprocess.run(c, check=True, capture_output=True)
def lufs(p):
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", str(p), "-af", "ebur128=framelog=quiet", "-f", "null", "-"], capture_output=True, text=True)
    return float(re.findall(r"I:\s*(-?[\d.]+)\s*LUFS", r.stderr)[-1])
def tts(vid, text, out):
    for a in range(6):
        try:
            r = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{vid}", method="POST",
                data=json.dumps({"text": text, "model_id": "eleven_multilingual_v2", "voice_settings": VS}).encode(),
                headers={"xi-api-key": "proxy-injected", "Content-Type": "application/json"})
            out.write_bytes(urllib.request.urlopen(r, timeout=300).read()); return
        except urllib.error.HTTPError as e:
            if e.code in (409, 429, 500): time.sleep(5 * (a + 1)); continue
            raise
run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "0.7", "-c:a", "pcm_s16le", str(T / "g07.wav")])
run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "2.2", "-c:a", "pcm_s16le", str(T / "g22.wav")])
for role, cands in CAND.items():
    parts = []
    for ci, (name, vid) in enumerate(cands):
        for li, text in enumerate(LINES[role]):
            raw = T / f"{role}_{ci}_{li}.mp3"
            if not raw.exists(): tts(vid, text, raw)
            heard = " ".join(w["text"] for w in scribe(raw))
            fx = T / f"{role}_{ci}_{li}.wav"
            run(["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-af", f"aresample=48000,silenceremove=start_periods=1:start_threshold=-45dB,{ROOM if role == 'MICK' else RADIO}",
                 "-ac", "1", "-c:a", "pcm_s16le", str(fx)])
            n = T / f"{role}_{ci}_{li}_n.wav"
            run(["ffmpeg", "-y", "-v", "error", "-i", str(fx), "-af", f"volume={-18 - lufs(fx):.2f}dB,alimiter=level=0:limit=0.9", "-c:a", "pcm_s16le", str(n)])
            parts += [n, T / ("g07.wav" if li == 0 else "g22.wav")]
            print(f"{role} {ci + 1} {name:10} | {heard}")
    lst = T / f"{role}.txt"; lst.write_text("".join(f"file '{p}'\n" for p in parts))
    run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c:a", "libmp3lame", "-b:a", "160k", str(D / f"{role.lower()}-voice-options.mp3")])
