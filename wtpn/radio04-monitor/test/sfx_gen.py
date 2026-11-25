#!/usr/bin/env python3
"""Baby-monitor test sounds (ElevenLabs sound generation) -> fx/<key>_<n>.mp3"""
import json, urllib.request, urllib.error, pathlib, sys, time
D = pathlib.Path(__file__).parent
SFX = {
 "baby":    ("A sleeping baby's soft slow breathing, very close, a quiet nursery at night, nothing else.", 10),
 "shush":   ("A woman very softly shushing a baby to sleep, slow gentle rhythmic shhh, shhh, shhh, very close, quiet bedroom at night, no words.", 6),
 "leave":   ("A quiet bedroom at night: one wooden floorboard creaks, then slow soft footsteps walk away across the room, then a door creaks slowly open.", 6),
 "stairs":  ("Inside a quiet house at night: an old wooden stair creaks under one slow footstep, a pause, then the next stair creaks, close.", 5),
 "kitchen": ("A quiet kitchen at night: a fridge humming softly, nothing else.", 15),
 "ward":    ("A hospital ward at night, quiet: distant monitor beeps, faint footsteps, muffled voices far away.", 15),
}
keys = sys.argv[1:] or list(SFX); n_each = {"shush": 3, "leave": 3, "stairs": 3}
for k in keys:
    text, d = SFX[k]
    for n in range(n_each.get(k, 1)):
        out = D / "fx" / f"{k}_{n}.mp3"
        if out.exists(): continue
        for attempt in range(5):
            try:
                r = urllib.request.Request("https://api.elevenlabs.io/v1/sound-generation",
                    data=json.dumps({"text": text, "duration_seconds": d, "prompt_influence": 0.6}).encode(), method="POST",
                    headers={"xi-api-key": "proxy-injected", "Content-Type": "application/json"})
                out.write_bytes(urllib.request.urlopen(r, timeout=300).read()); print(f"{k}_{n} ok"); break
            except urllib.error.HTTPError as e:
                if e.code in (409, 429): time.sleep(4 * (attempt + 1)); continue
                print(k, "FAIL", e.code, e.read()[:200]); break
