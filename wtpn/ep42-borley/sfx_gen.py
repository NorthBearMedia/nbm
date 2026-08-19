import json, os, urllib.request, pathlib

D = pathlib.Path(__file__).parent
KEY = os.environ["ELEVENLABS_API_KEY"]

JOBS = {
 "sfx-scratch.mp3": ("Close quiet pencil scratching urgently on a plaster wall, scratchy graphite scribbling, dry, intimate, unsettling, no music", 3.5),
 "sfx-scrub.mp3": ("Wet cloth scrubbing hard against a plaster wall, rhythmic scrubbing strokes, domestic, close, no music", 2.5),
 "sfx-fire.mp3": ("Large house fire roaring at night, crackling burning timber, glass cracking from heat, distant, no sirens, no voices, no music", 5.0),
 "sfx-heartbeat.mp3": ("Slow deep human heartbeat, low thumping pulse, close and muffled, steady slow rhythm, no music", 4.0),
 "bed-house.mp3": ("Constant unbroken wall of dark empty old house interior room tone, like a microphone held up in a cold silent Victorian house at night, continuous low hum of silence, faint constant air, perfectly steady, no events, no footsteps, no creaks, no music", 22.0),
}

for name, (prompt, dur) in JOBS.items():
    body = json.dumps({"text": prompt, "duration_seconds": dur, "prompt_influence": 0.6}).encode()
    r = urllib.request.Request("https://api.elevenlabs.io/v1/sound-generation",
        data=body, headers={"xi-api-key": KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=180) as resp:
        (D / name).write_bytes(resp.read())
    print(name, (D / name).stat().st_size)
