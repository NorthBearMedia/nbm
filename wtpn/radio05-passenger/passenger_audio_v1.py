#!/usr/bin/env python3
"""TRANSMISSION "PASSENGER" audio. We're in Jamie's cab: driving in fog on the A66 over Stainmore, then parked in a
lay-by with the engine off. Tony, his night planner, is on the hands-free through the cab speakers throughout.
The passenger seatbelt chime and the nearside sensor beeps come from the dash; both are planted in the first half
(his bag sets the chime off; the barrier sets the sensor off as he pulls in) and both go off again with the key out.
Voices: eleven_v3 text-to-dialogue take A2, cut on Scribe's word times (S2_*). Usage: passenger_audio.py [draftN]
-> st/mix.wav, master_social.wav (-14 LUFS stereo), timeline.json, passenger-draftN.mp3"""
import json, pathlib, subprocess, re, sys
import numpy as np
D = pathlib.Path(__file__).parent; ST = D / "st"; FX = D / "fx"; VO = D / "vo"; SR = 48000
S = json.loads((D / "script.json").read_text()); WHO = {l["id"]: l["who"] for l in S["lines"]}
TAKE = "S2"; DRAFT = sys.argv[1] if len(sys.argv) > 1 else "1"
rng = np.random.default_rng(11)
def run(c): subprocess.run(c, check=True, capture_output=True)
def load(p):
    return np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                                        capture_output=True, check=True).stdout, np.float32).astype(np.float64)
def save(p, x, ch=1):
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", "-ac", str(ch), "-c:a", "pcm_f32le", str(p)],
                   input=x.astype(np.float32).tobytes(), check=True)
def lufs_file(p):
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", str(p), "-af", "ebur128=framelog=quiet", "-f", "null", "-"], capture_output=True, text=True).stderr
    return float(re.findall(r"I:\s*(-?[\d.]+)\s*LUFS", r)[-1])
def lufs_arr(x): p = ST / "_m.wav"; save(p, x); return lufs_file(p)
def chain(x, af):
    p, q = ST / "_i.wav", ST / "_o.wav"; save(p, x)
    run(["ffmpeg", "-y", "-v", "error", "-i", str(p), "-af", af, "-ac", "1", "-ar", str(SR), "-c:a", "pcm_f32le", str(q)])
    y = load(q); return np.pad(y, (0, max(0, len(x) - len(y))))[: max(len(x), len(y))]
def at(x, target): return x * 10 ** ((target - lufs_arr(x)) / 20)
def pk(x, db): return x * (10 ** (db / 20) / (np.abs(x).max() + 1e-12))
def fade(x, a=0.015, b=0.015):
    x = x.copy(); fa, fb = int(a * SR), int(b * SR); x[:fa] *= np.linspace(0, 1, fa); x[-fb:] *= np.linspace(1, 0, fb); return x
def seg(x, a, b): return x[int(a * SR): int(b * SR)]
def loop(x, n, xf=0.5):
    out = x.copy(); f = int(xf * SR)
    while len(out) < n: out = np.concatenate([out[:-f], out[-f:] * np.linspace(1, 0, f) + x[:f] * np.linspace(0, 1, f), x[f:]])
    return out[:n]

CAB = "highpass=f=80,lowpass=f=10000,aecho=0.8:0.3:6|11:0.18|0.1,acompressor=threshold=-24dB:ratio=2.5:attack=10:release=150"
PHONE = ("highpass=f=320,lowpass=f=3300,acompressor=threshold=-22dB:ratio=3:attack=5:release=150:makeup=2,"
         "aresample=8000,aresample=48000,equalizer=f=1500:t=q:w=1.0:g=4,highpass=f=380,lowpass=f=3600")
HANDS = PHONE + ",highpass=f=150,lowpass=f=6500,aecho=0.8:0.35:6|11:0.2|0.12"       # Tony, through the cab speakers
DASH = "highpass=f=250,lowpass=f=7500,aecho=0.8:0.3:5|9:0.2|0.1"                     # the dash's little alarm speaker
INCAB = "aecho=0.8:0.3:6|11:0.15|0.08"

# ---- synthesised sounds ---------------------------------------------------------------------------------------
def ding():
    t = np.arange(int(0.55 * SR)) / SR; f = 880.0
    x = (np.sin(2*np.pi*f*t) * np.exp(-t/0.18) + 0.35*np.sin(2*np.pi*2*f*t) * np.exp(-t/0.11) + 0.12*np.sin(2*np.pi*3.01*f*t) * np.exp(-t/0.07))
    return x * np.minimum(1, t / 0.003)
def pulse(d=0.085, f=2400.0):
    t = np.arange(int(d * SR)) / SR; x = np.sin(2*np.pi*f*t) + 0.18*np.sin(2*np.pi*3*f*t)
    e = np.minimum(1, np.minimum(t, d - t) / 0.004); return x * e
def tick(f, amp, dur=0.018):
    n = int(dur * SR); x = rng.standard_normal(n) * np.exp(-np.arange(n) / (0.003 * SR))
    t = np.arange(n) / SR; return amp * (x * 0.5 + np.sin(2*np.pi*f*t) * np.exp(-t/0.004))
DING = chain(ding(), DASH); BEEP = chain(pulse(), DASH)

# ---- the voices -----------------------------------------------------------------------------------------------
def line(k):
    al = json.loads((VO / f"{TAKE}_{k}_align.json").read_text()); x = load(VO / f"{TAKE}_{k}.mp3")
    a = max(0.0, al["start"] - 0.08); b = min(len(x) / SR, al["end"] + 0.16)
    return fade(x[int(a * SR): int(b * SR)]), al["gap_after_in_take"]
L = {k: line(k) for k in WHO}
def gap(k, lo=0.18, hi=0.55): return min(max(L[k][1], lo), hi)
ev, tl = [], []
def say(k, t0, target=None):
    x = L[k][0]
    x = at(chain(x, CAB), target or -18.0) if WHO[k] == "JAMIE" else at(chain(x, HANDS), target or -20.5)
    ev.append((t0, x)); t1 = t0 + len(x) / SR; tl.append({"id": k, "who": WHO[k], "start": round(t0, 2), "end": round(t1, 2)}); return t1
def put(x, t0, tag=None):
    ev.append((t0, x)); t1 = t0 + len(x) / SR
    if tag: tl.append({"id": tag, "who": "SFX", "start": round(t0, 2), "end": round(t1, 2)})
    return t1
def dings(t0, until, every=1.05):
    t, n = t0, 0
    while t < until - 0.05: put(pk(DING, -12), t); t += every; n += 1
    tl.append({"id": "chime", "who": "SFX", "start": round(t0, 2), "end": round(t, 2)}); return t
def beeps(t0, intervals, cont=0.0, level=-14):
    t = t0
    for iv in intervals: put(pk(BEEP, level), t); t += iv
    if cont > 0:
        tone = chain(pulse(cont), DASH); put(pk(tone, level), t); t += cont
    return t

# ---- the timeline ---------------------------------------------------------------------------------------------
t_chime = 0.45
t = say("j01", 1.75) + gap("j01")
t = say("t01", t) + gap("t01")
t_j02 = t; t_j02_end = say("j02", t)
t_bag = t_j02 + 1.75                                                          # he slings the bag in the bunk as he says it
put(pk(chain(fade(seg(load(FX / "bag_0.mp3"), 0.0, 0.9)), INCAB), -20), t_bag, "bag")
dings(t_chime, t_bag + 0.12)                                                  # the chime stops as the bag lands
t = say("t02", max(t_j02_end + 0.35, t_bag + 0.5)) + gap("t02")
t = say("j03", t) + gap("j03")
t = say("t03", t) + gap("t03")
t = say("j04", t) + 0.75                                                      # Tony takes a moment
t = say("t04", t) + gap("t04")
t = say("j05", t) + gap("j05")
t_t05_end = say("t05", t)
t_ind = t_t05_end + 0.2                                                       # indicator on
t_pull = t_ind + 1.0                                                          # slowing onto the gravel
t_beep0 = t_pull + 0.75                                                       # swinging in tight to the barrier
t_beep_end = beeps(t_beep0, [0.22] * 7 + [0.14] * 5, cont=0.55, level=-15)
say("j06", t_beep0 + 0.75)
t_stop = t_pull + 3.8                                                         # air brakes (in pullin_0 at 3.8-4.4 s)
t = say("t06", t_stop + 0.6) + gap("t06")
t_j07_end = say("j07", t)
t_off = t_j07_end + 0.75                                                      # he turns the key
t_j08_end = say("j08", t_off + 0.25)
keys = fade(seg(load(FX / "keys_0.mp3"), 0.55, 1.45)); t_keys = t_j08_end + 0.1
put(pk(chain(keys, INCAB), -17), t_keys, "keys_out")
t_j09_end = say("j09", t_keys + 0.55)
lock = fade(seg(load(FX / "locks_0.mp3"), 0.75, 1.3)); t_lock = t_j09_end + 0.2
put(pk(chain(lock, INCAB), -12), t_lock, "locks")
t_j10_end = say("j10", t_lock + 0.35)
cur = fade(seg(load(FX / "curtain_1.mp3"), 0.05, 2.25), 0.03, 0.2); t_cur = t_j10_end + 0.2
put(pk(chain(cur, INCAB), -15), t_cur, "curtains")
t_j11_end = say("j11", t_cur + 1.85)
bunk = fade(seg(load(FX / "bunk_0.mp3"), 0.0, 3.85), 0.05, 0.3); t_bunk = t_j11_end + 0.25
put(pk(chain(bunk, INCAB), -21), t_bunk, "into_bunk")
t = say("t07", t_j11_end + 0.6) + gap("t07")
t = say("j12", t) + gap("j12")
t = say("t08", t) + gap("t08")
t = say("j13", t) + 0.35
t_t09_end = say("t09", t)
t_beep1 = t_t09_end + 2.8                                                     # quiet. then one beep, with the key out
beeps(t_beep1, [0.1], level=-14); tl.append({"id": "beep_single", "who": "SFX", "start": round(t_beep1, 2), "end": round(t_beep1 + 0.1, 2)})
t = say("j14", t_beep1 + 1.1) + gap("j14")
t = say("t10", t) + gap("t10")
t_j15 = t; t_j15_end = say("j15", t_j15)
put(pk(chain(fade(seg(load(FX / "keys_1.mp3"), 1.0, 1.5)), INCAB), -22), t_j15 + 0.55)          # the keys, up in the bunk
t_app = t_j15_end + 1.1
IV = [1.25, 1.05, 0.88, 0.72, 0.58, 0.46, 0.36, 0.28, 0.22, 0.17, 0.13, 0.11]
say("j16", t_app + sum(IV[:3]) + 0.15)
t_dead = beeps(t_app, IV, cont=1.3, level=-13)                                # up the passenger side, then nothing
tl.append({"id": "beep_approach", "who": "SFX", "start": round(t_app, 2), "end": round(t_dead, 2)})
t = say("t11", t_dead + 1.4) + gap("t11")
t = say("j17", t) + gap("j17")
t = say("t12", t) + gap("t12")
t_j18_end = say("j18", t)
t_ding = t_j18_end + 2.0
say("t13", t_ding + 2 * 1.05 + 0.5)
t_t13_end = tl[-1]["end"]
t_j19_end = say("j19", t_t13_end + gap("t13"))
n_d = int(np.ceil((t_j19_end + 0.6 - t_ding) / 1.05)) + 1
t_last = t_ding + (n_d - 1) * 1.05
dings(t_ding, t_last + 0.1)
buckle = load(FX / "buckle_0.mp3"); t_click = t_last + 0.6                    # the belt goes in; the chime stops
put(pk(chain(fade(seg(buckle, 0.0, 0.75), 0.01, 0.1), INCAB), -9), t_click - 0.45, "buckle")
t_cut = t_click + 0.85
TAIL = 2.5
N = int((t_cut + TAIL) * SR)
def fit(y): return np.pad(y, (0, max(0, N - len(y))))[:N]
mix = np.zeros(N)
for t0, x in ev:
    i = int(t0 * SR); mix[i:i + len(x)] += x[: max(0, N - i)]

# ---- the engine and the lay-by --------------------------------------------------------------------------------
drive = at(chain(loop(seg(load(FX / "drive_0.mp3"), 0.5, 10.0), int((t_pull + 0.8) * SR)), INCAB), -31.0)
xf = int(0.8 * SR); drive[-xf:] *= np.linspace(1, 0, xf)
bed = np.zeros(N); bed[:len(drive)] += drive[:N]
pull = at(seg(load(FX / "pullin_0.mp3"), 0.0, 4.6), -29.0); pull[:int(0.6 * SR)] *= np.linspace(0, 1, int(0.6 * SR))
i = int(t_pull * SR); bed[i:i + len(pull)] += pull
idle = at(loop(seg(load(FX / "idle_0.mp3"), 0.3, 9.5), int((t_off - t_stop + 1.0) * SR)), -33.0)
i = int((t_pull + 4.3) * SR); m = min(len(idle), int((t_off - t_pull - 4.3) * SR))
ig = idle[:m].copy(); ig[:int(0.3 * SR)] *= np.linspace(0, 1, int(0.3 * SR)); bed[i:i + m] += ig
# the key turns: the idle winds down in 0.7 s, a last shudder, then nothing
src = idle[m:m + int(1.2 * SR)]; nd = int(0.7 * SR); r = np.linspace(1.0, 0.3, nd); pos = np.cumsum(r)
wd = np.interp(pos, np.arange(len(src)), src) * np.linspace(1, 0, nd) ** 1.6
tt = np.arange(int(0.22 * SR)) / SR; thump = 0.5 * np.abs(idle).max() * np.sin(2 * np.pi * 52 * tt) * np.exp(-tt / 0.05)
i = int(t_off * SR); bed[i:i + nd] += wd; j = i + int(0.55 * SR); bed[j:j + len(thump)] += thump
tl.append({"id": "engine_off", "who": "SFX", "start": round(t_off, 2), "end": round(t_off + 0.7, 2)})
# indicator: on from t_ind until he's stopped
k = t_ind; side = 0
while k < t_stop:
    c = tick(2600 if side == 0 else 1900, 0.5); i = int(k * SR); bed[i:i + len(c)] += c * 0.12; k += 0.36; side ^= 1
# after the engine: the lay-by, the night heater, the engine ticking as it cools
lay = at(loop(seg(load(FX / "layby_0.mp3"), 0.5, 14.5), N), -44.0); g = np.zeros(N); i = int(t_off * SR)
g[i:i + int(1.2 * SR)] = np.linspace(0, 1, int(1.2 * SR)); g[i + int(1.2 * SR):] = 1; bed += lay * g
heat = at(loop(seg(load(FX / "heater_0.mp3"), 0.3, 9.5), N), -41.0); g = np.zeros(N); i = int((t_bunk + 1.0) * SR)
g[i:i + int(2.5 * SR)] = np.linspace(0, 1, int(2.5 * SR)); g[i + int(2.5 * SR):] = 1; bed += heat * g
k = t_off + 1.2; n = 0
while k < t_cut:
    a = 0.06 * np.exp(-(k - t_off) / 40) * rng.uniform(0.5, 1.0); c = tick(rng.uniform(3200, 5200), a, 0.012)
    i = int(k * SR); bed[i:i + len(c)] += chain(c, "lowpass=f=4500") if n < 0 else c; k += rng.gamma(2.0, 0.35 + 0.05 * (k - t_off)); n += 1
mix += bed
mix[:int(0.25 * SR)] *= np.linspace(0, 1, int(0.25 * SR))
c = int(t_cut * SR); mix[c - int(0.01 * SR): c] *= np.linspace(1, 0, int(0.01 * SR)); mix[c:] = 0          # the hard cut
save(ST / "mix.wav", mix)
g = -14.0 - lufs_arr(mix)
run(["ffmpeg", "-y", "-v", "error", "-i", str(ST / "mix.wav"), "-af", f"volume={g:.2f}dB,alimiter=level=0:limit=0.89,aresample=48000",
     "-ac", "2", "-c:a", "pcm_s16le", str(D / "master_social.wav")])
g2 = -14.0 - lufs_file(D / "master_social.wav")
run(["ffmpeg", "-y", "-v", "error", "-i", str(ST / "mix.wav"), "-af", f"volume={g + g2:.2f}dB,alimiter=level=0:limit=0.89,aresample=48000",
     "-ac", "2", "-c:a", "pcm_s16le", str(D / "master_social.wav")])
run(["ffmpeg", "-y", "-v", "error", "-i", str(D / "master_social.wav"), "-c:a", "libmp3lame", "-b:a", "192k", str(D / f"passenger-draft{DRAFT}.mp3")])
json.dump({"total": round(N / SR, 2), "cut": round(t_cut, 2), "events": sorted(tl, key=lambda e: e["start"])}, open(D / "timeline.json", "w"), indent=1)
print(f"draft{DRAFT}: {N / SR:.1f}s | bag {t_bag:.1f} | pull-in {t_pull:.1f} | engine off {t_off:.1f} | beep {t_beep1:.1f} | "
      f"approach {t_app:.1f}-{t_dead:.1f} | chime {t_ding:.1f} | click {t_click:.1f} | cut {t_cut:.1f}")
