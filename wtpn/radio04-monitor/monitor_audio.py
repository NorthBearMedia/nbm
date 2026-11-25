#!/usr/bin/env python3
"""TRANSMISSION 04 "MONITOR" audio. Kitchen, 3am: Danny at the table, Kel on speakerphone from a hospital ward, the
baby monitor (our radio) beside the phone. Everything from the nursery is on the monitor's little speaker; the stairs
are in the kitchen with us. Voices: eleven_v3 text-to-dialogue take A0 (k02 from A3), the way the user picked in the
acting test. Writes st/mix.wav, master_social.wav (-14 LUFS stereo), timeline.json, transmission04-monitor-draftN.mp3"""
import json, pathlib, subprocess, re, sys
import numpy as np
D = pathlib.Path(__file__).parent; ST = D / "st"; FX = D / "fx"; TFX = D / "test" / "fx"; VO = D / "vo"; SR = 48000
S = json.loads((D / "script.json").read_text()); WHO = {l["id"]: l["who"] for l in S["lines"]}
PICK = {k: "A0" for k in WHO}; PICK["k02"] = "A3"
DRAFT = sys.argv[1] if len(sys.argv) > 1 else "1"
def run(c): subprocess.run(c, check=True, capture_output=True)
def load(p):
    return np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                                        capture_output=True, check=True).stdout, np.float32).astype(np.float64)
def save(p, x, ch=1):
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", "-ac", str(ch), "-c:a", "pcm_f32le", str(p)],
                   input=x.astype(np.float32).tobytes(), check=True)
def lufs_arr(x):
    p = ST / "_m.wav"; save(p, x)
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", str(p), "-af", "ebur128=framelog=quiet", "-f", "null", "-"], capture_output=True, text=True).stderr
    return float(re.findall(r"I:\s*(-?[\d.]+)\s*LUFS", r)[-1])
def chain(x, af):
    p, q = ST / "_i.wav", ST / "_o.wav"; save(p, x)
    run(["ffmpeg", "-y", "-v", "error", "-i", str(p), "-af", af, "-ac", "1", "-ar", str(SR), "-c:a", "pcm_f32le", str(q)]); return load(q)
def at(x, target): return x * 10 ** ((target - lufs_arr(x)) / 20)
def frames(x, h=0.01):
    n = int(h * SR); return 20 * np.log10(np.array([np.sqrt(np.mean(x[i:i + n] ** 2)) + 1e-9 for i in range(0, len(x) - n, n)]))
def fade(x, a=0.015, b=0.015):
    x = x.copy(); fa, fb = int(a * SR), int(b * SR); x[:fa] *= np.linspace(0, 1, fa); x[-fb:] *= np.linspace(1, 0, fb); return x
def active(x, rel=30):
    r = frames(x); on = np.where(r > r.max() - rel)[0]; return x[max(0, on[0] - 2) * 480:(on[-1] + 3) * 480]

ROOMFX = "aecho=0.8:0.5:23|41:0.16|0.09"
ROOM_CLOSE = "highpass=f=80,lowpass=f=9000,aecho=0.8:0.4:19|37:0.08|0.04,acompressor=threshold=-24dB:ratio=2.5:attack=10:release=150"
PHONE = ("highpass=f=320,lowpass=f=3300,acompressor=threshold=-22dB:ratio=3:attack=5:release=150:makeup=2,"
         "aresample=8000,aresample=48000,equalizer=f=1500:t=q:w=1.0:g=4,highpass=f=380,lowpass=f=3600")
SPEAKER = "highpass=f=90,lowpass=f=7500,aecho=0.8:0.55:31|57:0.15|0.08"           # Kel's phone on speaker, on the table
MON = ("highpass=f=230,lowpass=f=4800,acompressor=threshold=-28dB:ratio=3:attack=5:release=150:makeup=3,"
       "aresample=22050,aresample=48000,equalizer=f=2500:t=q:w=1.2:g=3," + ROOMFX)   # the monitor's little speaker
STAIR = "highpass=f=60," + ROOMFX

def line(k):
    """Cut the line on the audio: start after the last silence before the words, end at the first silence after them
    (the dialogue takes run lines close together, so a fixed pad picked up the lead-in's "yet?" before k01)."""
    al = json.loads((VO / f"{PICK[k]}_{k}_align.json").read_text()); x = load(VO / f"{PICK[k]}_{k}.mp3")
    r = frames(x); loud = r > r.max() - 32; t0 = al["character_start_times_seconds"][0]; t1 = al["character_end_times_seconds"][-1]
    sil = []; i = 0
    while i < len(loud):
        if not loud[i]:
            j = i
            while j < len(loud) and not loud[j]: j += 1
            if j - i >= 7: sil.append((i, j))
            i = j
        else: i += 1
    # pre: a silence that begins before the words (v3 put the "D" of k01 0.55 s early)
    pre = [s for s in sil if s[0] * 0.01 <= t0 + 0.15]; post = [s for s in sil if s[0] * 0.01 >= t1 - 0.15]
    a = pre[-1][1] if pre else np.where(loud)[0][0]; b = post[0][0] if post else np.where(loud)[0][-1] + 1
    return fade(x[max(0, a - 5) * 480: min(len(x), (b + 12) * 480)])
GAP0 = {k: json.loads((VO / f"A0_{k}_align.json").read_text())["gap_after_in_take"] for k in WHO}
def gap(k, lo=0.15, hi=0.6): return min(max(GAP0[k], lo), hi)

ev, mon, tl = [], [], []                     # ev: dry kitchen/phone events; mon: monitor events (go through the volume knob)
def say(k, t0):
    x = (at(chain(line(k), ROOM_CLOSE), -18.0) if WHO[k] == "DANNY" else at(chain(line(k), PHONE + "," + SPEAKER), -21.0))
    ev.append((t0, x)); t1 = t0 + len(x) / SR; tl.append({"id": k, "who": WHO[k], "start": round(t0, 2), "end": round(t1, 2)}); return t1
def put(lst, x, t0, tag=None):
    lst.append((t0, x)); t1 = t0 + len(x) / SR
    if tag: tl.append({"id": tag, "who": "SFX", "start": round(t0, 2), "end": round(t1, 2)})
    return t1

# ---- the timeline ---------------------------------------------------------------------------------------------
t = say("k01", 0.6) + gap("k01")
t = say("d01", t) + gap("d01", hi=0.35)
t = say("k02", t)
t_cry_stop = t + 0.2                                                          # the crying stops dead, mid-breath
t = say("d02", t_cry_stop + 1.15) + gap("d02")
t = say("k03", t) + gap("k03")
t = say("d03", t) + gap("d03")
t_k04_end = say("k04", t)
t_rock = t_k04_end + 1.1                                                      # the chair starts rocking
t = say("d04", t_rock + 2.6) + gap("d04")
t = say("k05", t) + gap("k05")
t = say("d05", t) + gap("d05")
t = say("k06", t) + 0.55
t_d06_end = say("d06", t)
LONG, SHORT, G_LL, G_LS, G_AFTER = 0.80, 0.28, 0.32, 0.28, 0.80
P = 3 * LONG + 2 * G_LL + G_LS + SHORT + G_AFTER                              # one "three long and a short one"
t_d07 = t_d06_end + 1.0 + P                                                  # a whole faint cycle under the rocking first
t = say("d07", t_d07) + gap("d07")
t = say("k07", t) + gap("k07")
t = say("d08", t) + gap("d08")
t = say("k08", t) + gap("k08")
t_listen_end = say("d09", t)
t_up = t_listen_end + 0.35                                                    # he turns the monitor up
t_cyc1 = t_up + 0.35
t_k09 = t_cyc1 + P + 0.25                                                     # over the first long one of the next cycle
t_k09_end = say("k09", t_k09)
t_stop = max(t_k09_end + 0.2, t_cyc1 + P + LONG + G_LL + 0.45)                # dead, in the middle of a long one
t_shush0 = t_cyc1 - P * np.floor((t_cyc1 - (t_d06_end + 0.9)) / P)            # the faint cycles run on the same clock
t_k10_end = say("k10", t_stop + 1.3)
getup = active(load(FX / "getup_2.mp3"))
t = put(mon, at(chain(getup, MON), -25.0), t_k10_end + 0.45, "chair_getup") + 0.25
leave = load(TFX / "leave_0.mp3"); leave = np.concatenate([leave[: int(2.45 * SR)], leave[int(3.35 * SR): int(5.7 * SR)]])
t = put(mon, at(chain(fade(leave), MON), -26.0), t, "leave_room") + 0.6
st0 = load(TFX / "stairs_0.mp3"); st2 = load(TFX / "stairs_2.mp3")
t = put(ev, at(chain(fade(st0[: int(1.4 * SR)]), STAIR), -24.0), t, "stair1") + 0.45
t = say("d10", t + 0.45) + 0.45
cry2 = load(FX / "cry_2.mp3")[int(1.45 * SR): int(9.0 * SR)]
t_cry2 = t
t = say("k11", t_cry2 + 1.5) + 0.5
t_stair2 = t
t_cut = put(ev, at(chain(fade(st2[int(3.2 * SR): int(4.3 * SR)]), STAIR), -19.5), t_stair2, "stair2") + 0.35
TAIL = 2.5                                                                    # digital silence under the end card
N = int((t_cut + TAIL) * SR)
def fit(y): return np.pad(y, (0, max(0, N - len(y))))[:N]
def lay(lst):
    out = np.zeros(N)
    for t0, x in lst:
        i = int(t0 * SR); out[i:i + len(x)] += x[: max(0, N - i)]
    return out

# ---- the monitor ------------------------------------------------------------------------------------------------
rng = np.random.default_rng(4); n = np.arange(N) / SR
monbus = np.zeros(N)
monbus += fit(at(chain(rng.standard_normal(N) * (1 + 0.15 * np.sin(2 * np.pi * 0.37 * n)), MON), -43.0))   # its hiss
baby = load(TEST := D / "test" / "fx" / "baby_1.mp3"); baby = np.tile(baby, N // len(baby) + 1)[:N]
monbus += fit(at(chain(baby, MON), -46.0)) * (n >= t_cry_stop)               # her breathing, once she's quiet
# crying from the start, cut dead on a sob
c0, c1 = load(FX / "cry_0.mp3")[int(0.6 * SR): int(7.6 * SR)], load(FX / "cry_1.mp3")[int(1.1 * SR): int(7.0 * SR)]
xf = int(0.4 * SR); cry = np.concatenate([c0[:-xf], c0[-xf:] * np.linspace(1, 0, xf) + c1[:xf] * np.linspace(0, 1, xf), c1[xf:]])
cry = cry[-int(t_cry_stop * SR):]; cry[-int(0.008 * SR):] *= np.linspace(1, 0, int(0.008 * SR))
put(mon, at(chain(cry, MON), -27.0), 0.0)
tl.append({"id": "cry_stops", "who": "SFX", "start": round(t_cry_stop, 2), "end": round(t_cry_stop, 2)})
# the chair, rocking: a creak every ~1.5 s from t_rock until t_stop
cr = [active(load(FX / f"creak_{i}.mp3")) for i in range(5)]; tc, j = t_rock, 0
while tc < t_stop:
    c = cr[[0, 3, 1, 4, 2][j % 5]] * 10 ** (rng.uniform(-2, 1.5) / 20); i0 = int(tc * SR)
    c = c[: max(0, int(t_stop * SR) - i0)]
    if len(c) > 200: put(mon, at(chain(c, MON), -30.0) if True else c, tc)
    tc += 1.5 + rng.uniform(-0.05, 0.05); j += 1
tl.append({"id": "rocking", "who": "SFX", "start": round(t_rock, 2), "end": round(t_stop, 2)})
# the shush: three long and a short one, on the same clock from faint to clear, dead at t_stop
sh = np.concatenate([load(TFX / "shush_1.mp3")[int(0.45 * SR): int(5.4 * SR)], load(TFX / "shush_0.mp3")[int(0.2 * SR): int(5.0 * SR)]])
def one(d, off, a, r):
    x = sh[int(off * SR): int((off + d) * SR)].copy(); fa, fr = int(a * SR), int(r * SR)
    x[:fa] *= np.sin(np.linspace(0, np.pi / 2, fa)) ** 2; x[-fr:] *= np.cos(np.linspace(0, np.pi / 2, fr)) ** 2
    return x * np.linspace(1.0, 0.8, len(x))
shush = np.zeros(N); tc, k = t_shush0, 0
while tc < t_stop:
    for d, g in ((LONG, G_LL), (LONG, G_LL), (LONG, G_LS), (SHORT, G_AFTER)):
        x = one(d, (k * 0.61) % 8.5, 0.07 if d == LONG else 0.035, 0.18 if d == LONG else 0.09); k += 1
        i = int(tc * SR); shush[i:i + len(x)] += x[: max(0, N - i)]; tc += d + g
shush[int(t_stop * SR):] = 0; e = int(t_stop * SR); shush[e - int(0.006 * SR): e] *= np.linspace(1, 0, int(0.006 * SR))
shush = fit(at(chain(shush, MON), -31.0)); shush[int(t_stop * SR):] = 0
monbus += shush
tl.append({"id": "shush", "who": "SFX", "start": round(t_shush0, 2), "end": round(t_stop, 2), "clear_from": round(t_cyc1, 2)})
put(mon, at(chain(fade(cry2, 0.01, 0.01), MON), -29.0), t_cry2, "cry_again")
monbus += lay(mon)
# the volume knob: +7 dB from "Listen.", a small click as it turns
knob = np.ones(N); u = int(t_up * SR); rmp = int(0.3 * SR); g = 10 ** (7 / 20)
knob[u:u + rmp] = np.linspace(1, g, rmp); knob[u + rmp:] = g
monbus *= knob
clk = np.zeros(int(0.06 * SR)); clk[:60] = np.hanning(120)[:60] * 0.25; clk[200:240] += np.hanning(40) * 0.1
kitchen = lay(ev)
kitchen[int((t_up - 0.05) * SR): int((t_up - 0.05) * SR) + len(clk)] += chain(clk, "highpass=f=800," + ROOMFX)[: len(clk)]
# ---- the kitchen and the line -------------------------------------------------------------------------------------
fridge = sum(a * np.sin(2 * np.pi * f * n) for f, a in ((50, 1), (100, .6), (150, .25), (300, .08))) + 0.3 * np.convolve(rng.standard_normal(N), np.ones(200) / 200, "same")
kitchen += fit(at(chain(fridge, "lowpass=f=900," + ROOMFX), -47.0))
ward = load(TFX / "ward_1.mp3"); ward = np.tile(ward, N // len(ward) + 1)[:N]
kitchen += fit(at(chain(ward, PHONE + "," + SPEAKER), -43.0))
mix = kitchen + monbus
mix[:int(0.3 * SR)] *= np.linspace(0, 1, int(0.3 * SR))
c = int(t_cut * SR); mix[c - int(0.01 * SR): c] *= np.linspace(1, 0, int(0.01 * SR)); mix[c:] = 0      # the hard cut
save(ST / "mix.wav", mix)
g = -14.0 - lufs_arr(mix)
run(["ffmpeg", "-y", "-v", "error", "-i", str(ST / "mix.wav"), "-af", f"volume={g:.2f}dB,alimiter=level=0:limit=0.89,aresample=48000",
     "-ac", "2", "-c:a", "pcm_s16le", str(D / "master_social.wav")])
def lufs_file(p):
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", str(p), "-af", "ebur128=framelog=quiet", "-f", "null", "-"], capture_output=True, text=True).stderr
    return float(re.findall(r"I:\s*(-?[\d.]+)\s*LUFS", r)[-1])
g2 = -14.0 - lufs_file(D / "master_social.wav")                              # second pass: land on -14 exactly
run(["ffmpeg", "-y", "-v", "error", "-i", str(ST / "mix.wav"), "-af", f"volume={g + g2:.2f}dB,alimiter=level=0:limit=0.89,aresample=48000",
     "-ac", "2", "-c:a", "pcm_s16le", str(D / "master_social.wav")])
run(["ffmpeg", "-y", "-v", "error", "-i", str(D / "master_social.wav"), "-c:a", "libmp3lame", "-b:a", "192k", str(D / f"transmission04-monitor-draft{DRAFT}.mp3")])
json.dump({"total": round(N / SR, 2), "cut": round(t_cut, 2), "up": round(t_up, 2), "events": sorted(tl, key=lambda e: e["start"])},
          open(D / "timeline.json", "w"), indent=1)
print(f"draft{DRAFT}: {N / SR:.1f}s | crying stops {t_cry_stop:.1f} | rocking {t_rock:.1f} | turn-up {t_up:.1f} | shush dead {t_stop:.1f} | stair1 / cut {t_cut:.1f}")
