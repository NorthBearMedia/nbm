#!/usr/bin/env python3
"""The stereotypical walkie-talkie sounds, synthesised so every episode uses identical ones.
KEY-UP  : mechanical click, then a short burst of static before the voice arrives.
RELEASE : the 'kssshhh' squelch tail — bright static with crackle grains, a short hold, then a
          fast fall and the tick of the squelch closing. A clipped version for cut-off lines.
PTT     : Base pressing and releasing the desk radio's button, in the room."""
import numpy as np, wave, pathlib
SR = 48000
rng = np.random.default_rng(1695)

def band(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, len(x))

def crackle(n, rate):
    """Frying static: sparse impulses of random size, each a sub-millisecond decaying burst."""
    out = np.zeros(n); k = int(SR * 0.0008); tail = np.exp(-np.arange(k) / (k / 5))
    for p in np.flatnonzero(rng.random(n) < rate / SR):
        seg = tail[:n - p] * rng.uniform(0.25, 1.0) * rng.choice([-1, 1]); out[p:p + len(seg)] += seg
    return out

def env(n, attack, hold, release, curve=4.0):
    a, h = int(attack * SR), int(hold * SR); r = n - a - h
    return np.concatenate([np.linspace(0, 1, a), np.ones(h), np.exp(-curve * np.linspace(0, 1, r))])

def click(level, ms=3.0):
    n = int(SR * ms / 1000); x = rng.standard_normal(n) * np.exp(-np.arange(n) / (n / 4))
    return band(x, 1500, 9000) * level

def static(dur, attack, hold, rate, level):
    n = int(SR * dur)
    x = band(rng.standard_normal(n), 650, 5200) * 0.55 + band(crackle(n, rate), 900, 7000) * 1.2
    return x / (np.abs(x).max() + 1e-9) * env(n, attack, hold, dur - attack - hold) * level

def write(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())

def build(dst):
    dst = pathlib.Path(dst)
    # key-up: click, then ~0.12 s of static the voice arrives through
    write(dst / "sq_open.wav", np.concatenate([click(0.45), static(0.12, 0.004, 0.085, 900, 0.30)]))
    # release: the kssshhh, then the squelch closing
    write(dst / "sq_tail.wav", np.concatenate([static(0.34, 0.004, 0.16, 1400, 0.42), click(0.20, 2.0)]))
    write(dst / "sq_tail_short.wav", np.concatenate([static(0.17, 0.003, 0.06, 1400, 0.40), click(0.18, 2.0)]))
    # Base's PTT: press and release of the desk radio's button, close and mechanical
    n = int(SR * 0.04); thump = np.sin(2 * np.pi * 180 * np.arange(n) / SR) * np.exp(-np.arange(n) / (n / 6)) * 0.25
    p = np.zeros(n); p[:len(click(0.7, 4))] += click(0.7, 4); write(dst / "ptt.wav", p + thump)

if __name__ == "__main__":
    build(pathlib.Path(__file__).parent / "stations"); print("sfx written")
