#!/usr/bin/env python3
"""Passenger sounds (ElevenLabs sound generation) -> fx/<key>_<n>.mp3. The seatbelt chime, the side-sensor beeps,
the indicator and the engine ticking as it cools are synthesised in passenger_audio.py instead, so they're exact."""
import json, urllib.request, urllib.error, pathlib, sys, time
D = pathlib.Path(__file__).parent
SFX = {
 "drive":   ("Inside a lorry cab driving slowly at night in thick fog: a steady low diesel engine drone, quiet tyre noise on a wet road, windscreen wipers sweeping slowly.", 15, 2),
 "pullin":  ("A lorry slowing down and pulling into a gravel lay-by at night: the engine note dropping, tyres crunching slowly over gravel, then a loud hiss of air brakes as it stops.", 6, 2),
 "idle":    ("Inside a lorry cab: a diesel engine idling steadily while parked at night, quiet.", 10, 1),
 "engineoff": ("Inside a lorry cab: the diesel engine is switched off and shudders to a stop, then silence.", 3, 2),
 "keys":    ("A bunch of keys pulled out of a lorry ignition and jingled in a hand, close, inside a quiet cab.", 2, 2),
 "locks":   ("The central locking of a lorry cab clunking shut, heard from inside the cab.", 1.5, 2),
 "curtain": ("Thick curtains on a metal rail being pulled shut around the windscreen of a lorry cab, curtain rings sliding, inside the cab.", 3, 2),
 "bag":     ("A heavy holdall bag thrown onto a mattress, close, inside a small quiet space.", 1.5, 2),
 "bunk":    ("Someone climbing up into a bunk bed inside a lorry cab and settling into a sleeping bag, rustling, close and quiet.", 4, 2),
 "heater":  ("A diesel night heater running inside a parked lorry cab at night: a soft steady whirring fan, quiet.", 10, 1),
 "layby":   ("Inside a parked lorry cab at night on a lay-by on a remote moor in fog: almost silent, a faint wind against the cab.", 15, 1),
 "rock":    ("Inside a parked lorry cab at night: the trailer coupled behind creaks and groans as it slowly rocks from side to side, heavy metal creaking and suspension squeaks, the cab shifting with it.", 6, 3),
 "rockbig": ("Heard from inside the cab of a parked articulated lorry at night: the whole trailer lurches once, a deep metallic groan and a heavy clunk from the coupling, then stillness.", 3, 3),
 "sleep":   ("A young man asleep in a small dark space, slow deep breathing through the nose, very close, quiet, nothing else.", 8, 2),
 "wake":    ("A young man jolted awake in the dark, one sharp frightened intake of breath, very close, nothing else.", 1.5, 3),
 "breathfast": ("A frightened young man breathing fast and shallow, trying to stay silent, very close, in the dark, nothing else.", 6, 2),
 "hold":    ("A young man holding his breath in fear, then letting it out in a long shaky exhale, very close, silent room.", 4, 2),
 "relief":  ("A young man lets out a long relieved breath and a tiny nervous laugh under his breath, very close, quiet room.", 2.5, 2),
 "buckle":  ("A car seatbelt buckle clicking into its lock, close, inside a quiet car at night, nothing else.", 1, 3),
}
for k in (sys.argv[1:] or list(SFX)):
    text, d, n_each = SFX[k]
    for n in range(n_each):
        out = D / "fx" / f"{k}_{n}.mp3"
        if out.exists(): continue
        for attempt in range(5):
            try:
                r = urllib.request.Request("https://api.elevenlabs.io/v1/sound-generation",
                    data=json.dumps({"text": text, "duration_seconds": d, "prompt_influence": 0.6}).encode(), method="POST",
                    headers={"xi-api-key": "proxy-injected", "Content-Type": "application/json"})
                out.write_bytes(urllib.request.urlopen(r, timeout=300).read()); print(f"{k}_{n} ok", flush=True); break
            except urllib.error.HTTPError as e:
                if e.code in (409, 429): time.sleep(4 * (attempt + 1)); continue
                print(k, "FAIL", e.code, e.read()[:200]); break
