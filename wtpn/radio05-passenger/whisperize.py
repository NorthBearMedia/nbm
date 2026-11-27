#!/usr/bin/env python3
"""Turn a softly spoken take into a true whisper: a whisper is the same mouth shapes driven by breath instead of the
vocal cords. Per 25 ms frame: an LPC fit of the vocal tract (the formants), then white noise through that filter at
the frame's original loudness, overlap-added. Timing, words and accent survive; the voicing goes.
Usage: whisperize.py in.mp3 out.wav"""
import sys, subprocess, numpy as np
from scipy.linalg import solve_toeplitz
from scipy.signal import lfilter
SR = 24000; ORDER = 26; N = int(0.025 * SR); HOP = N // 2
x = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", sys.argv[1], "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                                 capture_output=True, check=True).stdout, np.float32).astype(np.float64)
x = lfilter([1, -0.9], [1], x)                                   # pre-emphasis, so the fit follows the upper formants
win = np.hanning(N); out = np.zeros(len(x) + N); norm = np.zeros(len(x) + N); rng = np.random.default_rng(3)
for i in range(0, len(x) - N, HOP):
    f = x[i:i + N] * win; e = np.sqrt(np.mean(f ** 2))
    if e < 1e-6: continue
    r = np.correlate(f, f, "full")[N - 1:N + ORDER]; r[0] *= 1.0001
    try: a = solve_toeplitz(r[:ORDER], -r[1:ORDER + 1])
    except Exception: continue
    A = np.concatenate([[1.0], a]); g = np.sqrt(max(r[0] + np.dot(a, r[1:ORDER + 1]), 1e-12) / N)
    y = lfilter([1.0], A, rng.standard_normal(N)) * g
    y = y * (e / (np.sqrt(np.mean((y * win) ** 2)) + 1e-12)) * win
    out[i:i + N] += y; norm[i:i + N] += win ** 2
y = out[:len(x)] / np.maximum(norm[:len(x)], 1e-3)
y = lfilter([1], [1, -0.9], y)                                   # undo the pre-emphasis
y = lfilter(*__import__("scipy.signal", fromlist=["butter"]).butter(2, 250 / (SR / 2), "high"), y)   # whispers carry little low end
y = y / (np.abs(y).max() + 1e-9) * 0.7
subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f64le", "-ar", str(SR), "-ac", "1", "-i", "-", "-ar", "48000", "-c:a", "pcm_s16le", sys.argv[2]],
               input=y.astype(np.float64).tobytes(), check=True)
