#!/usr/bin/env python3
"""Generate Transmission 02's sound effects with ElevenLabs sound generation. Writes sfx/<key>.mp3.
Usage: sfx_gen.py [keys...]  (existing files are kept unless named)"""
import json, urllib.request, pathlib, sys
D = pathlib.Path(__file__).parent
SFX = {
 "tinroof":   ("Heavy rain drumming on a corrugated metal roof, heard from inside a large empty barn at night. Steady, no thunder, no animals.", 20),
 "hayshed":   ("Wind and rain blowing through an open-sided hay barn at night, gusts, rain hissing on the yard outside. No animals, no music.", 20),
 "ewe":       ("A single adult sheep bleating close by in a barn, two or three bleats with gaps between, rain in the background.", 10),
 "panic":     ("A large flock of sheep panicking inside a shed: frantic bleating from many sheep, metal gates rattling and clanging, hooves scrambling. Heard from a distance.", 15),
 "yardwalk":  ("Footsteps walking fast through mud and puddles in heavy rain, rain pattering on a waterproof jacket hood, heavy breathing.", 12),
 "doordrag":  ("A heavy sliding metal barn door dragged open on rusty rollers, scraping, then a clunk as it stops.", 3),
 "straw":     ("Slow, careful footsteps through deep straw on a barn floor, quiet rustling.", 8),
 "knocks":    ("Exactly three slow, heavy knocks on a solid wooden farmhouse back door, about one second apart, then silence. Close up, recorded indoors.", 5),
 "lamb":      ("A weak newborn lamb bleating softly, a few small faint bleats with long pauses, indoors in a warm kitchen.", 10),
 "kitchen":   ("Quiet farmhouse kitchen at night: an old cast-iron range ticking and humming softly, rain on the window, no voices, no music.", 22),
 "fire":      ("A small fire crackling softly in a farmhouse hearth, quiet room, no voices.", 15),
}
keys = sys.argv[1:] or list(SFX)
for k in keys:
    out = D / "sfx" / f"{k}.mp3"
    if out.exists() and k not in sys.argv[1:]: continue
    text, d = SFX[k]
    body = {"text": text, "duration_seconds": d, "prompt_influence": 0.6}
    r = urllib.request.Request("https://api.elevenlabs.io/v1/sound-generation", data=json.dumps(body).encode(), method="POST",
                               headers={"xi-api-key": "proxy-injected", "Content-Type": "application/json"})
    out.write_bytes(urllib.request.urlopen(r, timeout=300).read()); print(f"{k:9} {d:>3}s  ok")
