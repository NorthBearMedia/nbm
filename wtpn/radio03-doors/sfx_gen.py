#!/usr/bin/env python3
"""Transmission 03 'Doors' sound effects (ElevenLabs sound generation) -> sfx/<key>.mp3. office, reefers,
gaterain and outrun are reused from radio03-handover."""
import json, urllib.request, urllib.error, pathlib, sys, time
D = pathlib.Path(__file__).parent
SFX = {
 "ring":        ("A modern office desk telephone ringing twice in a quiet office at night, then the handset is picked up.", 4),
 "keys_typing": ("A few quick keystrokes on an office computer keyboard and a mouse click, quiet office at night.", 2),
 "doorbars":    ("The rear doors of a lorry trailer being shut outdoors in heavy rain: one door swung shut, a heavy metal locking bar clanks into place, then the second door and its bar, two loud clanks.", 4),
 "padlock":     ("A heavy steel padlock snapped shut on a metal bar, close up, outdoors in rain.", 2),
 "trailer":     ("Standing inside the open back of an empty lorry trailer at night: heavy rain drumming on the thin metal roof, hollow echo, wind.", 15),
 "cab":         ("Inside a lorry cab driving on a motorway at night in rain: low diesel engine drone, tyre roar, windscreen wipers.", 15),
 "cabstop":     ("A lorry pulling onto a motorway hard shoulder in rain: the indicator ticking, a hiss of air brakes, the cab door opening, heavy traffic roaring past outside in the wet.", 8),
}
for k in (sys.argv[1:] or list(SFX)):
    out = D / "sfx" / f"{k}.mp3"
    if out.exists() and k not in sys.argv[1:]: continue
    text, d = SFX[k]
    for attempt in range(5):
        try:
            r = urllib.request.Request("https://api.elevenlabs.io/v1/sound-generation",
                data=json.dumps({"text": text, "duration_seconds": d, "prompt_influence": 0.6}).encode(), method="POST",
                headers={"xi-api-key": "proxy-injected", "Content-Type": "application/json"})
            out.write_bytes(urllib.request.urlopen(r, timeout=300).read()); print(f"{k:12} {d:>3}s ok"); break
        except urllib.error.HTTPError as e:
            if e.code in (409, 429): time.sleep(4 * (attempt + 1)); continue
            print(k, "FAIL", e.code, e.read()[:200]); break
