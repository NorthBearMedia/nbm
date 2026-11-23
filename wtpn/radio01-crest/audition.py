#!/usr/bin/env python3
"""Build each climax variant through the full pipeline and cut the same section from each:
'He's wearing our kit' through to the dead channel, joined with a beep between.
Usage: audition.py <variant> [<variant> ...] [--out name.mp3]   (default: A B C)"""
import json, pathlib, shutil, subprocess, sys
D = pathlib.Path(__file__).parent
def run(c): subprocess.run(c, check=True, capture_output=True)
parts = []
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")] or ["A", "B", "C"]
OUT = next((a.split("=",1)[1] for a in sys.argv[1:] if a.startswith("--out=")), "transmission01-climax-ABC.mp3")
for V in ARGS:
    for k in ["l19", "l21", "l23"]:
        shutil.copy(D / "variants" / V / f"{k}.mp3", D / "vo" / f"{k}.mp3")
        shutil.copy(D / "variants" / V / f"{k}_align.json", D / "vo" / f"{k}_align.json")
        (D / "vo" / f"{k}_align_tts.json").unlink(missing_ok=True)
    subprocess.run([sys.executable, str(D / "retime.py"), "l19", "l21", "l23"], check=True, capture_output=True)
    for k in ["l19", "l21", "l23"]:                     # keep the re-timed alignment with the variant
        shutil.copy(D / "vo" / f"{k}_align.json", D / "variants" / V / f"{k}_align.json")
    subprocess.run([sys.executable, str(D / "radio_audio.py")], check=True, capture_output=True)
    T = {e["id"]: e for e in json.loads((D / "timeline.json").read_text())["lines"]}
    a, b = T["l17"]["start"] - 0.4, T["carrier"]["end"] + 0.8
    run(["ffmpeg", "-y", "-v", "error", "-i", str(D / "master.wav"), "-af", f"atrim={a:.3f}:{b:.3f},asetpts=N/SR/TB",
         "-c:a", "pcm_s16le", str(D / f"aud_{V}.wav")])
    parts.append(D / f"aud_{V}.wav"); print(f"{V}: {b-a:.1f}s")
run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "sine=f=880:d=0.18:r=48000", "-af",
     "volume=0.25,afade=t=in:d=0.01,afade=t=out:st=0.14:d=0.04,apad=pad_dur=1.0,adelay=1200", "-ac", "1",
     "-c:a", "pcm_s16le", str(D / "aud_beep.wav")])
seq = []
for i, pp in enumerate(parts): seq += ([D / "aud_beep.wav"] if i else []) + [pp]
ins = sum((["-i", str(p)] for p in seq), [])
run(["ffmpeg", "-y", "-v", "error"] + ins + ["-filter_complex",
     "".join(f"[{i}:a]" for i in range(len(seq))) + f"concat=n={len(seq)}:v=0:a=1[o]", "-map", "[o]",
     "-c:a", "libmp3lame", "-b:a", "192k", str(D / OUT)])
print(OUT, "written:", " / ".join(ARGS))
