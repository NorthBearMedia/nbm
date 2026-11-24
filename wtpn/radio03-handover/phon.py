#!/usr/bin/env python3
"""Yorkshire markers the accent model can't hear (it only knows 'england'):
  STRUT ('coming'): northern [ʊ] has a low F1 (~350-480 Hz, male); southern [ʌ] ~550-700.
  FACE ('gate', 'mate', 'rain', 'Dave', 'Wakefield'): Yorkshire [eː] is a flat monophthong; southern/RP
  [eɪ] glides, F2 rising through the vowel. Reported as the F2 rise (Hz) from 30% to 75% of the vowel.
Vowel spans are approximated inside Scribe's word times. Rough, for shortlisting only."""
import json, pathlib, re, uuid, urllib.request, numpy as np, parselmouth
D = pathlib.Path(__file__).parent
def scribe(p):
    b = p.read_bytes(); bd = uuid.uuid4().hex
    parts = [(f'--{bd}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v1\r\n').encode(),
             (f'--{bd}\r\nContent-Disposition: form-data; name="timestamps_granularity"\r\n\r\nword\r\n').encode(),
             (f'--{bd}\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n').encode() + b + b"\r\n",
             f'--{bd}--\r\n'.encode()]
    r = urllib.request.Request("https://api.elevenlabs.io/v1/speech-to-text", data=b"".join(parts), method="POST",
        headers={"xi-api-key": "proxy-injected", "Content-Type": f"multipart/form-data; boundary={bd}"})
    return [w for w in json.load(urllib.request.urlopen(r, timeout=120))["words"] if w.get("type") == "word"]
# vowel span inside the word, as fractions of the word's duration
SPAN = {"coming": (0.18, 0.45), "gate": (0.25, 0.75), "gates": (0.22, 0.65), "mate": (0.3, 0.75),
        "rain": (0.25, 0.65), "dave": (0.28, 0.72), "wakefield": (0.12, 0.38)}
def main():
  out = {}
  for p in sorted((D / "aud").glob("*_v[23].mp3")):
      cache = p.with_suffix(".words.json")
      ws = json.load(open(cache)) if cache.exists() else scribe(p)
      json.dump(ws, open(cache, "w"))
      snd = parselmouth.Sound(str(p)); fm = snd.to_formant_burg(time_step=0.005, max_number_of_formants=5,
                                                                  maximum_formant=5000 if p.name.startswith(("MICK", "DAVE")) else 5500)
      strut, face = [], []
      for w in ws:
          k = re.sub(r"[^a-z]", "", w["text"].lower())
          if k not in SPAN: continue
          a, b = SPAN[k]; t0 = w["start"] + a * (w["end"] - w["start"]); t1 = w["start"] + b * (w["end"] - w["start"])
          ts = np.linspace(t0, t1, 12)
          f1 = np.array([fm.get_value_at_time(1, t) for t in ts]); f2 = np.array([fm.get_value_at_time(2, t) for t in ts])
          if k == "coming": strut.append(float(np.nanmedian(f1)))
          else:
              n = len(ts); face.append(float(np.nanmedian(f2[int(n * .6):]) - np.nanmedian(f2[:int(n * .35)])))
      out[p.stem] = dict(strut_f1=round(float(np.mean(strut)), 0) if strut else None,
                         face_glide=round(float(np.median(face)), 0) if face else None, n_face=len(face))
      o = out[p.stem]; print(f"{p.stem:22} STRUT F1 {str(o['strut_f1']):>6}   FACE glide {str(o['face_glide']):>6} (n={len(face)})")
  json.dump(out, open(D / "aud" / "phon.json", "w"), indent=1)
if __name__ == "__main__": main()
