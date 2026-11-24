#!/usr/bin/env python3
"""Generate Transmission 03's sound effects with ElevenLabs sound generation. Writes sfx/<key>.mp3.
Usage: sfx_gen.py [keys...]  (existing files are kept unless named)"""
import json, urllib.request, urllib.error, pathlib, sys, time
D = pathlib.Path(__file__).parent
SFX = {
 "office":    ("Inside a small portable cabin office at night: steady rain on the window and the thin roof, a computer fan whirring, a fluorescent light humming faintly. No voices, no music.", 22),
 "reefers":   ("Distant refrigerated lorry trailers' cooling units droning across a truck yard at night, a steady low mechanical drone, heard through a closed window.", 20),
 "gatehouse": ("Inside a small security gatehouse hut at night: heavy rain on a flat roof, a small electric fan heater humming. No voices, no music.", 20),
 "gaterain":  ("Standing in the open doorway of a security hut at night, heavy rain falling on tarmac and puddles, water dripping from a gutter, light wind.", 20),
 "barrier":   ("An automatic car park barrier arm moving with an electric motor whine, three electronic warning beeps, then a clunk as it stops. Outdoors in the rain, close up.", 6),
 "airbrakes": ("A heavy lorry pulling into a yard and stopping, a loud hiss of air brakes, the diesel engine idling then switched off, distant, in rain.", 8),
 "engine":    ("A van engine idling quietly in the distance on a dark country lane at night, steady low rumble, heavy rain.", 15),
 "outrun":    ("A man jogging across a wet tarmac lorry yard in heavy rain, footsteps splashing through puddles, breathing hard, rain on a waterproof jacket.", 10),
 "keys":      ("A bunch of vehicle keys with plastic fobs lifted off a metal hook on a wall key board, a soft metallic jingle, indoors, close, quiet room.", 3),
 "paper":     ("A single sheet of paper picked up from a desk and unfolded, quiet, close, indoors.", 3),
 "buzz":      ("A mobile phone vibrating on a wooden desk, two long buzzes, indoors, close, quiet office.", 4),
 "door":      ("The door of a portable cabin office opened, heavy rain suddenly louder outside, footsteps leaving, then the door pulled shut, heard from inside.", 5),
 "charger":   ("A walkie-talkie pulled out of its desk charging cradle with a plastic click, then an office chair rolling back on a hard floor.", 3),
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
            out.write_bytes(urllib.request.urlopen(r, timeout=300).read()); print(f"{k:9} {d:>3}s  ok"); break
        except urllib.error.HTTPError as e:
            if e.code in (409, 429): time.sleep(4 * (attempt + 1)); continue
            print(k, "FAIL", e.code, e.read()[:200]); break
