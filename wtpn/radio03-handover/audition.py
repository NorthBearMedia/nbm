#!/usr/bin/env python3
"""Cast Transmission 03 (Yorkshire): one in-character passage per candidate voice, on eleven_v3 (tags)
and eleven_multilingual_v2 (no tags; steadier accent). Writes aud/<ROLE>_<name>_<model>.mp3.
Shared-library voices are added to the account on first use if TTS refuses them."""
import json, urllib.request, urllib.error, pathlib, re, sys, time
D = pathlib.Path(__file__).parent
PASS = {
 "MICK": ["Usual. O. E. U. has an AdBlue fault, for a change. Wakefield's moved to half five.",
          "[quietly] Steve's never said please in his life.",
          "[firm] Don't open it. I'm coming down.",
          "[scared, quietly] Dave... who's that in my office?"],
 "KAREN": ["[sleepy] Hello?",
           "No, love. Someone rang the house about half two. He went white. Went straight out. Wouldn't say who.",
           "He said if you rang, I've to tell you to read his note again.",
           "[worried] Mick? Is he with you? Is he all right?"],
 "DAVE": ["Three o'clock. Gate's locked, barrier's down, it's siling it down and I'm frozen. All quiet.",
          "Mick. You'll not believe this. Steve's at the gate.",
          "[pleading] He's stood in the rain, Mick. It's Steve!",
          "Steve's not been here, mate. Radio's been quiet all night."],
}
CAND = {
 "MICK": {"darren": "MIRXQ6kaSGUnvKewcGhZ", "paul": "oCXdm5WkYoKVEdlbPLev", "nige": "QMc6FU2Fkzs9Dkeq7swc",
          "luke": "2zGNoZ0Uf48gkgwxvtwP", "david": "8KgifH3usc0tJtr7QzP4", "heath": "J8mOQCJUd3gZZ6Q7QYXH",
          "johnnorth": "7rQX8r6PVq3gfJ8rZzyE", "gideon": "q1h5HGdnfVxp4TXTJRNN", "tony": "v9I7auPeR1xGKYRPwQGG",
          "mike": "S1GxattMxHrXozy2QM7J"},
 "KAREN": {"wilshi": "LOE6OtKY65AfLLoge1Eb", "chazza": "WKWX31A0Kkv2Y4CQRsll", "kirsty": "3HCsOhirtjbPmdcSOPBt",
           "miri": "ZR8ruiC9tbg7bV9RmBmC"},
 "DAVE": {"noah": "poHOO1m3tBNm4Ywmzcaq", "ryan": "EvfUC5EzfWjmoPWebkXG", "ellis": "7aMcdLeWslXSj6o3RLB6",
          "phil": "m1JdxoylOYG8QBo8giNn", "ashley": "jIIwKmgS6dN9eWEJEvMJ", "chris": "2EVscXwJhGYuLiX1PgKA",
          "owens": "8Y9tkLYUHXpUnF43G0D3", "danleeds": "UaOVtSEMYIYt4ixYDW4J", "ben": "Q7VrUY6f87ZLFJfAckYV"},
}
SHARED = {v["voice_id"]: v for v in json.load(open(D / "aud" / "shared_search.json"))}
def req(url, body=None, method="POST"):
    r = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method=method,
                               headers={"xi-api-key": "proxy-injected", "Content-Type": "application/json"})
    return urllib.request.urlopen(r, timeout=300)
def add(vid, name):
    o = SHARED[vid]["public_owner_id"]
    d = json.load(req(f"https://api.elevenlabs.io/v1/voices/add/{o}/{vid}", {"new_name": f"T03 {name}"}))
    return d.get("voice_id", vid)
def tts(vid, text, model, out):
    vs = {"stability": 0.5, "similarity_boost": 0.85, "use_speaker_boost": True}
    for attempt in range(5):
        try:
            out.write_bytes(req(f"https://api.elevenlabs.io/v1/text-to-speech/{vid}", {"text": text, "model_id": model, "voice_settings": vs}).read()); return vid
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="ignore")
            if e.code in (409, 429): time.sleep(4 * (attempt + 1)); continue
            if e.code in (400, 404) and "voice" in body.lower() and attempt == 0:
                vid = add(vid, out.stem); continue
            raise RuntimeError(f"{e.code} {body[:200]}")
def main():
  only = sys.argv[1:]
  for role, cands in CAND.items():
    for name, vid in cands.items():
        if only and name not in only: continue
        for model, tag in (("eleven_v3", "v3"), ("eleven_multilingual_v2", "v2")):
            out = D / "aud" / f"{role}_{name}_{tag}.mp3"
            if out.exists(): continue
            lines = PASS[role] if tag == "v3" else [re.sub(r"\[[^\]]*\]\s*", "", l) for l in PASS[role]]
            try: vid = tts(vid, "\n\n".join(lines), model, out); print("ok", out.name)
            except Exception as e: print("FAIL", out.name, e)
if __name__ == "__main__": main()
