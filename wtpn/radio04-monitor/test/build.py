#!/usr/bin/env python3
"""Mix the ~27 s acting test. Kitchen, 3am: Dad at the table, phone on speaker beside the baby monitor (our radio).
The monitor hisses; a faint shushing is on it from the start; Dad turns it up on "Listen."; it stops dead after Mum's
"That's how I do it."; the monitor then hears the floorboard, steps leaving the cot, the nursery door; then a stair
creaks in the kitchen with us. Usage: build.py A|B -> monitor-test-<v>.mp3"""
import json, pathlib, subprocess, re, sys
import numpy as np
D = pathlib.Path(__file__).parent; ST = D / "st"; FX = D / "fx"; VO = D / "vo"; SR = 48000
ver = sys.argv[1]
PICK = {"A": {k: "A2" for k in ("d1", "m1", "d2", "m2", "d3", "m3", "m4", "d4")},
        "B": {"d1": "B4", "m1": "B2", "d2": "B2", "m2": "B0", "d3": "B2", "m3": "B1", "m4": "B1", "d4": "B2"}}[ver]
def run(c): subprocess.run(c, check=True, capture_output=True)
def load(p):
    return np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                                        capture_output=True, check=True).stdout, np.float32).astype(np.float64)
def lufs_arr(x):
    p = ST / "_m.wav"; save(p, x)
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", str(p), "-af", "ebur128=framelog=quiet", "-f", "null", "-"], capture_output=True, text=True).stderr
    return float(re.findall(r"I:\s*(-?[\d.]+)\s*LUFS", r)[-1])
def save(p, x):
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", "-c:a", "pcm_f32le", str(p)],
                   input=x.astype(np.float32).tobytes(), check=True)
def chain(x, af):
    p, q = ST / "_i.wav", ST / "_o.wav"; save(p, x)
    run(["ffmpeg", "-y", "-v", "error", "-i", str(p), "-af", af, "-ac", "1", "-ar", str(SR), "-c:a", "pcm_f32le", str(q)]); return load(q)
def at(x, target): return x * 10 ** ((target - lufs_arr(x)) / 20)
ROOMFX = "aecho=0.8:0.5:23|41:0.16|0.09"
ROOM_CLOSE = "highpass=f=80,lowpass=f=9000,aecho=0.8:0.4:19|37:0.08|0.04,acompressor=threshold=-24dB:ratio=2.5:attack=10:release=150"
PHONE = ("highpass=f=320,lowpass=f=3300,acompressor=threshold=-22dB:ratio=3:attack=5:release=150:makeup=2,"
         "aresample=8000,aresample=48000,equalizer=f=1500:t=q:w=1.0:g=4,highpass=f=380,lowpass=f=3600")
SPEAKER = "highpass=f=90,lowpass=f=7500,aecho=0.8:0.55:31|57:0.15|0.08"            # the phone on speaker, on the table
MON = ("highpass=f=230,lowpass=f=4800,acompressor=threshold=-28dB:ratio=3:attack=5:release=150:makeup=3,"
       "aresample=22050,aresample=48000,equalizer=f=2500:t=q:w=1.2:g=3," + ROOMFX)    # the monitor's little speaker

def line(k):
    """the take's speech, trimmed to 80 ms either side of the words"""
    src = VO / f"{PICK[k]}_{k}.mp3"; al = json.loads((VO / f"{PICK[k]}_{k}_align.json").read_text())
    x = load(src); h = int(0.01 * SR)                  # trim on the audio itself: v3's timings ran late and clipped "Kel"/"Danny"
    r = 20 * np.log10(np.array([np.sqrt(np.mean(x[i:i + h] ** 2)) + 1e-9 for i in range(0, len(x) - h, h)]))
    on = np.where(r > r.max() - 32)[0]; s = max(0.0, on[0] * 0.01 - 0.06); e = min(len(x) / SR, (on[-1] + 1) * 0.01 + 0.12)
    x = x[int(s * SR):int(e * SR)].copy(); f = int(0.015 * SR); x[:f] *= np.linspace(0, 1, f); x[-f:] *= np.linspace(1, 0, f)
    return x, al.get("gap_after_in_take")
DAD = lambda x: at(chain(x, ROOM_CLOSE), -18.0)
MUM = lambda x: at(chain(x, PHONE + "," + SPEAKER), -21.0)

# ---- timeline -------------------------------------------------------------------------------------------
ev = []; t = 1.0
def put(x, t0): ev.append((t0, x)); return t0 + len(x) / SR
def gap(k, dflt):
    g = L[k][1]; return min(max(g, 0.15), 0.7) if (ver == "A" and g is not None) else dflt
L = {k: line(k) for k in PICK}
t = put(DAD(L["d1"][0]), t) + gap("d1", 0.35)
t = put(MUM(L["m1"][0]), t) + gap("m1", 0.45)
t = put(DAD(L["d2"][0]), t) + gap("d2", 0.25)
t = put(MUM(L["m2"][0]), t) + gap("m2", 0.4)
t_listen_end = put(DAD(L["d3"][0]), t)
t_up = t_listen_end + 0.35                                       # he turns the monitor up
t_m3 = t_up + 2.9
t_m3_end = put(MUM(L["m3"][0]), t_m3)
t_stop = t_m3_end + 0.35                                         # the shushing stops dead
t_m4 = t_stop + 1.4
t_m4_end = put(MUM(L["m4"][0]), t_m4)
t_leave = t_m4_end + 0.5
leave = load(FX / "leave_0.mp3"); leave = np.concatenate([leave[: int(2.45 * SR)], leave[int(3.35 * SR): int(5.7 * SR)]])  # 0.6 s of quiet between the steps and the door, not 1.5
t_leave_end = put(at(chain(leave, MON), -27.0), t_leave)
stairs = load(FX / "stairs_0.mp3"); c1 = stairs[: int(1.4 * SR)]; c2 = stairs[int(2.2 * SR): int(3.9 * SR)]
t_c1 = t_leave_end + 0.7
put(at(chain(c1, "highpass=f=60," + ROOMFX), -24.0), t_c1)
t_d4 = t_c1 + 1.1
t_d4_end = put(DAD(L["d4"][0]), t_d4)
t_c2 = t_d4_end + 0.45
t_end = put(at(chain(c2, "highpass=f=60," + ROOMFX), -21.0), t_c2) + 0.5
N = int((t_end + 0.1) * SR); mix = np.zeros(N)
for t0, x in ev:
    i = int(t0 * SR); mix[i:i + len(x)] += x[: N - i]

# ---- beds -------------------------------------------------------------------------------------------------
def fit(y): return np.pad(y, (0, max(0, N - len(y))))[:N]
rng = np.random.default_rng(7); n = np.arange(N) / SR
fridge = sum(a * np.sin(2 * np.pi * f * n) for f, a in ((50, 1), (100, .6), (150, .25), (300, .08))) + 0.3 * np.convolve(rng.standard_normal(N), np.ones(200) / 200, "same")
mix += fit(at(chain(fridge, "lowpass=f=900," + ROOMFX), -47.0))
hiss = rng.standard_normal(N) * (1 + 0.15 * np.sin(2 * np.pi * 0.37 * n))
mix += fit(at(chain(hiss, MON), -41.0))
baby = load(FX / "baby_1.mp3"); baby = np.tile(baby, N // len(baby) + 1)[:N]
mix += fit(at(chain(baby, MON), -44.0))
ward = load(FX / "ward_1.mp3"); ward = np.tile(ward, N // len(ward) + 1)[:N]
mix += fit(at(chain(ward, PHONE + "," + SPEAKER), -43.0))
# the shushing: faint from the start, up on "Listen.", dead after "That's how I do it."
sh = [load(FX / f"shush_{i}.mp3") for i in (1, 0)] + [load(FX / "shush_2.mp3")[: int(5.0 * SR)]]
xf = int(0.5 * SR); s = sh[0]
for y in sh[1:]: s = np.concatenate([s[:-xf], s[-xf:] * np.linspace(1, 0, xf) + y[:xf] * np.linspace(0, 1, xf), y[xf:]])
s = at(chain(s, MON), -24.0)
i0, iup, istop = int(0.4 * SR), int(t_up * SR), int(t_stop * SR)
seg = s[: istop - i0].copy(); g = np.full(len(seg), 10 ** (-13 / 20))
ramp = int(0.25 * SR); u = iup - i0; g[u:u + ramp] = np.linspace(10 ** (-13 / 20), 1, ramp); g[u + ramp:] = 1
mix[i0:istop] += seg * g[: len(seg)]
# the monitor knob: a small click as he turns it up
clk = np.zeros(int(0.05 * SR)); clk[:60] = np.hanning(120)[:60] * 0.25; clk[200:240] += np.hanning(40) * 0.1
mix[int((t_up - 0.05) * SR):int((t_up - 0.05) * SR) + len(clk)] += chain(clk, "highpass=f=800," + ROOMFX)[: len(clk)]
mix[:int(0.4 * SR)] *= np.linspace(0, 1, int(0.4 * SR))
mix[-int(0.03 * SR):] *= np.linspace(1, 0, int(0.03 * SR))   # a hard cut after the second stair
save(ST / f"mix_{ver}.wav", mix)
out = D / f"monitor-test-{ver}.mp3"
g = -15.0 - lufs_arr(mix)
run(["ffmpeg", "-y", "-v", "error", "-i", str(ST / f"mix_{ver}.wav"), "-af", f"volume={g:.2f}dB,alimiter=level=0:limit=0.89,aresample=48000",
     "-ac", "2", "-c:a", "libmp3lame", "-b:a", "192k", str(out)])
print(f"{out.name}: {N / SR:.1f}s  (Listen ends {t_listen_end:.1f}s, shush stops {t_stop:.1f}s, stair 1 at {t_c1:.1f}s, end {t_end:.1f}s)")
