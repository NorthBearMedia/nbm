#!/usr/bin/env python3
"""TRANSMISSION 03 "DOORS" audio builder (adapted from radio03-handover/handover_audio.py).
We are in the transport office with Mick (room voice; PTT clicks when he talks to the yard or the cab; none when he
is on the desk phone, on speaker, or reading his screen). Lee is on the desk phone; Ash is on the radio from the
yard; Gaz is on the radio from his cab. The PC pings whenever a trailer's back doors open or close (synthesised,
the same ping every time). Writes stations/*.wav, mix.wav, master.wav, master_social.wav, timeline.json."""
import json, pathlib, subprocess, re, sys
import numpy as np, wave
D = pathlib.Path(__file__).parent; sys.path.insert(0, str(D)); sys.path.append(str(D.parent / "radio02-corner"))
S = json.loads((D / "script.json").read_text()); LINES = S["lines"]; L = {l["id"]: l for l in LINES}
ST = D / "stations"; ST.mkdir(exist_ok=True); FX = D / "sfx"
SR = 48000
PAUSE_CAP = 0.5
TEMPO = {"MICK": 1.03, "ASH": 1.03, "LEE": 1.0, "HARRY": 1.02}

def run(c): subprocess.run(c, check=True, capture_output=True)
def dur(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "csv=p=0", str(p)], capture_output=True, text=True).stdout)
def lufs(p):
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", str(p), "-af", "ebur128=framelog=quiet", "-f", "null", "-"],
                       capture_output=True, text=True)
    return float(re.findall(r"I:\s*(-?[\d.]+)\s*LUFS", r.stderr)[-1])
def wav_out(path, x):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())

def words(al):
    ch, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    out, cur, cs, ce, tag = [], "", None, None, False
    for c, s, e in zip(ch, st, en):
        if c == "[": tag = True; continue
        if tag:
            if c == "]": tag = False
            continue
        if c.isspace():
            if cur: out.append((cur, cs, ce)); cur = ""
        else:
            if not cur: cs = s
            cur += c; ce = e
    if cur: out.append((cur, cs, ce))
    return [w for w in out if any(x.isalnum() for x in w[0])]

# ---------- chains --------------------------------------------------------------------------------
RADIO_CLEAR = ("highpass=f=300,lowpass=f=3400,acompressor=threshold=-24dB:ratio=3.5:attack=6:release=200:makeup=2,"
               "aresample=16000,aresample=48000,highpass=f=280,lowpass=f=3600,equalizer=f=2200:t=q:w=1.2:g=3")
BAND = "highpass=f=330,lowpass=f=3000,aresample=16000,aresample=48000"
ROOM = "highpass=f=90,lowpass=f=7500,aecho=0.8:0.55:31|57:0.15|0.08,acompressor=threshold=-22dB:ratio=3:attack=10:release=150"
GLASS = "highpass=f=180,lowpass=f=1300,aecho=0.7:0.45:28|52:0.3|0.18"           # Steve, outside the gatehouse window
OFFMIC = "highpass=f=150,lowpass=f=3200,aecho=0.75:0.45:16|31:0.28|0.16"        # Ash beside Mick, not into the handset
PHONE = ("highpass=f=320,lowpass=f=3300,acompressor=threshold=-22dB:ratio=3:attack=5:release=150:makeup=2,"
         "aresample=8000,aresample=48000,equalizer=f=1500:t=q:w=1.0:g=4,highpass=f=380,lowpass=f=3600")
VOICE_T = {"ASH": -17.5, "HARRY": -17.5, "MICK": -17.0}
ROOM_T, ASIDE_T, PHONE_T, CLOSE_T = -17.5, -21.5, -20.5, -18.5
ROOM_CLOSE = "highpass=f=80,lowpass=f=9000,aecho=0.8:0.4:19|37:0.08|0.04,acompressor=threshold=-24dB:ratio=2.5:attack=10:release=150"

def prep(ln):
    """Trim, tighten long pauses, normalise. -> wav, words, remap"""
    k = ln["id"]; al = json.loads((D / "vo" / f"{k}_align.json").read_text())
    ws = words(al); first, last = ws[0][1], ws[-1][2]
    a = first + 0.025 if ln.get("clip") else max(0.0, first - 0.14)
    b = last + (0.02 if ln['text'].rstrip().endswith('—') else 0.22)     # a cut-off line stops inside its last word
    cap = ln.get("pause_cap", PAUSE_CAP); cuts = []
    for w1, w2 in zip(ws, ws[1:]):
        g = w2[1] - w1[2]
        if g > cap + 0.03 and w1[2] > a: cuts.append((w1[2] + cap / 2, g - cap))
    keeps, pos = [], a
    for p, r in cuts: keeps.append((pos, p)); pos = p + r
    keeps.append((pos, b))
    fc = "".join(f"[0:a]atrim={x:.4f}:{y:.4f},asetpts=N/SR/TB[k{i}];" for i, (x, y) in enumerate(keeps))
    tempo = TEMPO[ln["who"]]
    fc += "".join(f"[k{i}]" for i in range(len(keeps))) + f"concat=n={len(keeps)}:v=0:a=1[c];[c]atempo={tempo},afade=t=in:d=0.01[o]"
    out = ST / f"{k}_v.wav"
    run(["ffmpeg", "-y", "-v", "error", "-i", str(D / "vo" / f"{k}.mp3"), "-filter_complex", fc,
         "-map", "[o]", "-ar", str(SR), "-ac", "1", "-c:a", "pcm_s16le", str(out)])
    g = -21.0 - lufs(out)
    run(["ffmpeg", "-y", "-v", "error", "-i", str(out), "-af", f"volume={g:.2f}dB,alimiter=level=0:limit=0.9",
         "-c:a", "pcm_s16le", str(ST / f"{k}_n.wav")])
    def remap(t): return max(0.0, t - a - sum(r for p, r in cuts if p < t)) / tempo
    return ST / f"{k}_n.wav", [(w, remap(s), remap(e)) for w, s, e in ws if e > a], \
        {"a": round(a, 4), "cuts": [[round(p, 4), round(r, 4)] for p, r in cuts], "tempo": tempo}

# ---------- places (what's behind a radio voice) ---------------------------------------------------
def loop(src, d, off, out, extra=""):
    # seek AFTER the input: with -stream_loop, an input-side -ss on these mp3s made -t overrun (a 7.6 s bed came out
    # 13.7 s), so every radio line held the air for seconds after the voice: the "pauses are wrong" the user heard
    run(["ffmpeg", "-y", "-v", "error", "-stream_loop", "-1", "-i", str(src), "-ss", f"{off:.2f}", "-t", f"{d:.3f}",
         "-af", f"aresample={SR}" + ("," + extra if extra else ""), "-ac", "1", "-c:a", "pcm_s16le", str(out)])

def place(kind, d, k):
    seed = int(k[1:]); parts = []
    def Lp(name, off, rel, extra=""):
        p = ST / f"{k}_{name}.wav"; loop(FX / f"{name}.mp3", d, off, p, extra); parts.append((p, rel))
    def once(name, at, rel, trim=None):
        p = ST / f"{k}_{name}1.wav"; tr = f"atrim={trim[0]}:{trim[1]},asetpts=N/SR/TB," if trim else ""
        ms = int(at * 1000)
        run(["ffmpeg", "-y", "-v", "error", "-i", str(FX / f"{name}.mp3"), "-af",
             f"aresample={SR},{tr}adelay={ms}|{ms},apad=whole_dur={d:.3f},atrim=0:{d:.3f}", "-ac", "1", "-c:a", "pcm_s16le", str(p)])
        parts.append((p, rel))
    if kind == "yard":
        Lp("gaterain", (seed * 2.9) % 14, 0)
    elif kind == "yard_padlock":
        Lp("gaterain", (seed * 2.9) % 14, 0); once("padlock", 0.15, +9)
    elif kind == "trailer":
        Lp("trailer", (seed * 1.7) % 10, 0)
    elif kind == "trailer_shut":
        Lp("gaterain", (seed * 2.9) % 14, 0); once("doorbars", 0.2, +10)
    elif kind == "cab":
        Lp("cab", (seed * 1.1) % 10, 0)
    elif kind == "yard_couple":
        Lp("gaterain", (seed * 2.9) % 14, 0); once("couple", 0.0, +8)
    elif kind == "cab_away":
        Lp("cab", (seed * 1.1) % 10, -6); once("away", 0.3, +6)
    elif kind == "hardshoulder":
        Lp("hardshoulder", (seed * 1.9) % 9, 0); once("steps", 0.0, -3)
    elif kind == "cab_stop":
        Lp("cab", (seed * 1.1) % 10, 0, "volume='if(lt(t,2.2),1,max(0.0,1-(t-2.2)/1.2))':eval=frame")
        once("cabstop", 1.6, +4)
    out = ST / f"{k}_place.wav"
    if len(parts) == 1:
        run(["ffmpeg", "-y", "-v", "error", "-i", str(parts[0][0]), "-c:a", "pcm_s16le", str(out)])
    else:
        ins = sum((["-i", str(p)] for p, _ in parts), []); lv = [lufs(p) for p, _ in parts]
        fc = "".join(f"[{i}:a]volume={(-30 + rel) - l:.2f}dB[p{i}];" for i, ((_, rel), l) in enumerate(zip(parts, lv)))
        fc += "".join(f"[p{i}]" for i in range(len(parts))) + f"amix=inputs={len(parts)}:normalize=0:duration=first[o]"
        run(["ffmpeg", "-y", "-v", "error"] + ins + ["-filter_complex", fc, "-map", "[o]", "-c:a", "pcm_s16le", str(out)])
    return out

BED_T = {"yard_couple": -31.0, "cab_away": -31.0, "hardshoulder": -31.5, "yard": -37.0, "yard_padlock": -32.0, "trailer": -36.0, "trailer_shut": -29.0, "cab": -35.0, "cab_stop": -31.0}

def is_radio(ln): return ln["who"] in ("ASH", "HARRY")

def station(ln, dry, opening=True, closing=True):
    """-> (wav, voice_offset, keyed_dur, kind)"""
    k, who = ln["id"], ln["who"]; out = ST / f"{k}_st.wav"
    if who == "LEE":                                     # the desk phone: Mick has the handset; we hear its earpiece leak, thin and close
        run(["ffmpeg", "-y", "-v", "error", "-i", str(dry), "-af", PHONE + "," + ROOM, "-c:a", "pcm_s16le", str(ST / f"{k}_ph.wav")])
        g = PHONE_T - lufs(ST / f"{k}_ph.wav")
        run(["ffmpeg", "-y", "-v", "error", "-i", str(ST / f"{k}_ph.wav"), "-af", f"volume={g:.2f}dB,alimiter=level=0:limit=0.9",
             "-c:a", "pcm_s16le", str(out)])
        return out, 0.0, dur(out), "phone"
    if not is_radio(ln):                                 # Mick, in the room with us
        close = ln.get("room_close")
        run(["ffmpeg", "-y", "-v", "error", "-i", str(dry), "-af", ROOM_CLOSE if close else ROOM, "-c:a", "pcm_s16le", str(ST / f"{k}_room.wav")])
        gm = (CLOSE_T if close else ASIDE_T if ln.get("aside") else ROOM_T) - lufs(ST / f"{k}_room.wav")
        po = ln.get("ptt_open", True) and not ln.get("aside")
        pc = ln.get("ptt_close", True) and not ln.get("aside") and not ln.get("room_close")   # the last line: cut, no release
        ins = (["-i", str(ST / "ptt.wav")] if po else []) + ["-i", str(ST / f"{k}_room.wav")] + (["-i", str(ST / "ptt.wav")] if pc else [])
        vi = 1 if po else 0
        fc = f"[{vi}:a]volume={gm:.2f}dB,alimiter=level=0:limit=0.9" + (",apad=pad_dur=0.12" if pc else "") + "[v];"
        seq = ""
        if po: fc += "[0:a]apad=pad_dur=0.10[p1];"; seq += "[p1]"
        seq += "[v]"
        if pc: seq += f"[{vi + 1}:a]"
        n = 1 + po + pc
        fc += f"{seq}concat=n={n}:v=0:a=1[o]"
        run(["ffmpeg", "-y", "-v", "error"] + ins + ["-filter_complex", fc, "-map", "[o]", "-c:a", "pcm_s16le", str(out)])
        voff = (dur(ST / "ptt.wav") + 0.10) if po else 0.0
        return out, voff, dur(out), ("tx" if (po or pc) else "room")
    # ---- through the radio ----
    off = ln.get("offmic"); vk = "ASH_OFF" if off else who
    hold = ln.get("hold_after", 0.0) + (0.0 if closing else 0.35)       # an open channel keeps its place sound
    pre = ln.get("pre", 0.0 if opening else 0.2)
    pre_fx = ""
    run(["ffmpeg", "-y", "-v", "error", "-i", str(dry), "-af", pre_fx + RADIO_CLEAR, "-c:a", "pcm_s16le", str(ST / f"{k}_rv.wav")])
    gv = VOICE_T[vk] - lufs(ST / f"{k}_rv.wav")
    d = dur(dry); bl = pre + d + hold + 0.08
    pl = place(ln["bg"], bl, k)
    run(["ffmpeg", "-y", "-v", "error", "-i", str(pl), "-af", BAND, "-c:a", "pcm_s16le", str(ST / f"{k}_b.wav")])
    gb = BED_T[ln["bg"]] - lufs(ST / f"{k}_b.wav")
    run(["ffmpeg", "-y", "-v", "error", "-i", str(ST / f"{k}_rv.wav"), "-i", str(ST / f"{k}_b.wav"),
         "-filter_complex",
         f"[0:a]volume={gv:.2f}dB,adelay={int(pre * 1000)}|{int(pre * 1000)},apad=pad_dur={hold + 0.08:.3f}[v];[1:a]volume={gb:.2f}dB[w];"
         f"[v][w]amix=inputs=2:normalize=0:duration=longest,alimiter=level=0:limit=0.85"
         + (",afade=t=in:d=0.03" if opening else "") + "[r]",
         "-map", "[r]", "-c:a", "pcm_s16le", str(ST / f"{k}_r.wav")])
    tail = ST / ("sq_tail_short.wav" if ln.get("dropout") else "sq_tail.wav")
    parts = ([ST / "sq_open.wav"] if opening else []) + [ST / f"{k}_r.wav"] + ([tail] if closing else [])
    ins = sum((["-i", str(p)] for p in parts), [])
    run(["ffmpeg", "-y", "-v", "error"] + ins + ["-filter_complex",
         "".join(f"[{i}:a]" for i in range(len(parts))) + f"concat=n={len(parts)}:v=0:a=1[o]",
         "-map", "[o]", "-c:a", "pcm_s16le", str(out)])
    voff = (dur(ST / "sq_open.wav") if opening else 0.0) + pre
    return out, voff, voff - pre + dur(ST / f"{k}_r.wav"), "rx"

# ---------- room events (sfx in the office) --------------------------------------------------------
ROOMFX = "aecho=0.8:0.5:23|41:0.16|0.09"
def synth_ping():
    """The planner's door alert: a soft two-note chime, identical every time, so the audience learns it."""
    def note(f, d):
        t = np.arange(int(SR * d)) / SR
        return (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)) * np.exp(-t / 0.12) * np.minimum(1, t / 0.004)
    x = np.concatenate([note(1046.5, 0.16), note(1568.0, 0.42)]) * 0.35
    wav_out(ST / "ping_raw.wav", np.concatenate([np.zeros(int(SR * 0.05)), x]))
    run(["ffmpeg", "-y", "-v", "error", "-i", str(ST / "ping_raw.wav"), "-af", "highpass=f=300,lowpass=f=6000," + ROOMFX, "-c:a", "pcm_s16le", str(ST / "ping.wav")])
def synth_hangup():
    """Lee's end of the line goes dead: a click, then the dead line's tone, on the desk phone's speaker."""
    t = np.arange(int(SR * 1.1)) / SR
    click = np.zeros(int(SR * 0.03)); click[:40] = np.hanning(80)[:40] * 0.6
    tone = 0.18 * np.sin(2 * np.pi * 425 * t) * np.minimum(1, np.minimum(t, 1.1 - t) / 0.02)
    wav_out(ST / "hangup_raw.wav", np.concatenate([np.zeros(int(SR * 0.1)), click, np.zeros(int(SR * 0.35)), tone]))
    run(["ffmpeg", "-y", "-v", "error", "-i", str(ST / "hangup_raw.wav"), "-af", PHONE + "," + ROOM, "-c:a", "pcm_s16le", str(ST / "hangup.wav")])

def room_fx(name, target):
    """-> wav at target LUFS, processed as a sound in the office."""
    out = ST / f"fx_{name}.wav"
    if name in ("ping", "hangup"):
        src = ST / f"{name}.wav"; chain = "anull"
    else:
        src = FX / f"{name}.mp3"
        chain = {"ring": ROOMFX, "keys_typing": ROOMFX}.get(name, "anull")
    cap = {"ring": 2.5, "keys_typing": 1.2}.get(name)
    trim = (f"silenceremove=start_periods=1:start_threshold=-50dB,atrim=0:{cap},afade=t=out:st={cap - 0.25}:d=0.25," if cap else "")
    run(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-af", f"aresample={SR},{trim}{chain}", "-ac", "1", "-c:a", "pcm_s16le", str(out) + ".raw.wav"])
    g = target - lufs(str(out) + ".raw.wav")
    run(["ffmpeg", "-y", "-v", "error", "-i", str(out) + ".raw.wav", "-af", f"volume={g:.2f}dB,alimiter=level=0:limit=0.9",
         "-c:a", "pcm_s16le", str(out)])
    return out

GAP = {"f05": 0.5, "f06": 0.15, "f12": 0.25, "f13": 1.0, "f14": 0.5, "f16": 1.6, "f19": 0.6, "f21": 0.7, "f23": 0.25,
       "f24": 0.3, "f29": 0.3, "f30": 0.4, "f31": 1.1, "f32": 1.3, "f33": 2.4}
def gap_before(prev, ln):
    if prev is None: return 0.3                         # the desk phone, almost at once
    if ln.get("cont"): return 0.0
    if ln["id"] in GAP: return GAP[ln["id"]]
    return 0.4 if prev["who"] == ln["who"] else 0.2       # radio talk answers quickly (user: pauses felt wrong)

def main():
    import radio_sfx; radio_sfx.build(ST)
    synth_ping(); synth_hangup()
    SFXL = {l["id"]: l for l in S.get("sfx_lines", [])}
    tl, ev, t, prev = [], [], 0.0, None
    for i, ln in enumerate(LINES):
        nxt = LINES[i + 1] if i + 1 < len(LINES) else None
        t += gap_before(prev, ln)
        for name, target, g in ln.get("fx_before", []):
            w = room_fx(name, target); ev.append({"name": name, "at": round(t, 3), "wav": w.name}); t += dur(w) + g
        dry, ws, rm = prep(ln)
        wav, voff, keyed, kind = station(ln, dry, opening=not ln.get("cont"), closing=not (nxt and nxt.get("cont")))
        tl.append({"id": ln["id"], "who": ln["who"], "kind": kind, "start": round(t, 3), "led_on": round(t, 3),
                   "led_off": round(t + keyed, 3), "end": round(t + dur(wav), 3), "text": ln["text"], "wav": wav.name,
                   "bg": ln.get("bg"), "remap": dict(rm, off=round(t + voff, 4)),
                   "words": [(w, round(t + voff + s, 3), round(t + voff + e, 3)) for w, s, e in ws]})
        t += dur(wav); prev = ln
        nid = f"d{int(ln['id'][1:]) + 1:02d}"
        if nid in SFXL:                                  # a transmission with no voice: Ash keys up, the doors clank shut
            sl = SFXL[nid]; t += 0.35; d = 3.0
            pl = place(sl["bg"], d, nid)
            run(["ffmpeg", "-y", "-v", "error", "-i", str(pl), "-af", BAND, "-c:a", "pcm_s16le", str(ST / f"{nid}_b.wav")])
            gb = BED_T[sl["bg"]] - lufs(ST / f"{nid}_b.wav")
            run(["ffmpeg", "-y", "-v", "error", "-i", str(ST / "sq_open.wav"), "-i", str(ST / f"{nid}_b.wav"), "-i", str(ST / "sq_tail.wav"),
                 "-filter_complex", f"[1:a]volume={gb:.2f}dB,alimiter=level=0:limit=0.85[b];[0:a][b][2:a]concat=n=3:v=0:a=1[o]",
                 "-map", "[o]", "-c:a", "pcm_s16le", str(ST / f"{nid}_st.wav")])
            w = ST / f"{nid}_st.wav"
            tl.append({"id": nid, "who": sl["who"], "kind": "rx", "start": round(t, 3), "led_on": round(t, 3),
                       "led_off": round(t + dur(w), 3), "end": round(t + dur(w), 3), "text": "", "wav": w.name, "bg": sl["bg"], "words": []})
            t += dur(w); prev = sl
        for name, target, g in ln.get("fx_after", []):
            t += 0.15
            if name == "EMPTY":
                ev.append({"name": "empty", "at": round(t, 3), "dur": g}); t += g; continue
            w = room_fx(name, target); ev.append({"name": name, "at": round(t, 3), "wav": w.name}); t += dur(w) + g
    total = t + 0.45                                    # cut on Mick reading "rear doors closed"
    # ---- the office bed: rain on the cabin, the PC fan and tube, reefers droning across the yard, radio hiss ----
    loop(FX / "office.mp3", total, 0.0, ST / "office.wav")
    loop(FX / "reefers.mp3", total, 0.0, ST / "reefers.wav", "lowpass=f=700")
    run(["ffmpeg", "-y", "-v", "error", "-i", str(ST / "office.wav"), "-i", str(ST / "reefers.wav"), "-f", "lavfi",
         "-i", f"anoisesrc=color=white:d={total:.3f}:a=0.5:r={SR}",
         "-filter_complex", f"[0:a]volume={-46 - lufs(ST / 'office.wav'):.2f}dB[o];[1:a]volume={-53 - lufs(ST / 'reefers.wav'):.2f}dB[r];"
                            "[2:a]bandpass=f=1600:width_type=h:w=2400,volume=0.02[h];[o][r][h]amix=inputs=3:normalize=0",
         "-ac", "1", "-c:a", "pcm_s16le", str(ST / "bed.wav")])
    ins, fc = ["-i", str(ST / "bed.wav")], []
    for e in ev:
        if "wav" not in e: continue
        n = len(ins) // 2; ins += ["-i", str(ST / e["wav"])]; ms = int(e["at"] * 1000)
        fc.append(f"[{n}:a]adelay={ms}|{ms}[e{n}]")
    for e in tl:
        n = len(ins) // 2; ins += ["-i", str(ST / e["wav"])]; ms = int(e["start"] * 1000)
        fc.append(f"[{n}:a]adelay={ms}|{ms}[d{n}]")
    labels = "".join(re.findall(r"\[[a-z]\d+\]$", f)[0] for f in fc)
    fc.append("[0:a]" + labels + f"amix=inputs={len(fc) + 1}:normalize=0:duration=first[m]")
    run(["ffmpeg", "-y", "-v", "error"] + ins + ["-filter_complex", ";".join(fc), "-map", "[m]",
         "-t", f"{total:.3f}", "-c:a", "pcm_s16le", str(D / "mix.wav")])
    def master(g, out, ch):
        run(["ffmpeg", "-y", "-v", "error", "-i", str(D / "mix.wav"), "-af",
             f"volume={g:.2f}dB,aresample=192000,alimiter=level=0:limit=0.84:attack=5:release=50,aresample=48000",
             "-ac", str(ch), "-c:a", "pcm_s16le", str(out)])
        return lufs(out)
    for out, target, ch in [(D / "master.wav", -15.0, 1), (D / "master_social.wav", -14.0, 2)]:
        g = target - lufs(D / "mix.wav")
        for _ in range(5):
            err = target - master(g, out, ch)
            if abs(err) < 0.15: break
            g += err
    json.dump({"total": round(total, 3), "events": ev, "lines": tl}, open(D / "timeline.json", "w"), indent=1)
    print(f"master.wav {total:.1f}s  {lufs(D / 'master.wav'):.1f} LUFS | social {lufs(D / 'master_social.wav'):.1f} LUFS")
    for e in tl:
        print(f"  {e['start']:6.2f}-{e['end']:6.2f}  {e['kind']:5} {e['who']:5s} {e['id']}  {e['text'][:56]}")
    for e in ev: print(f"  {e['at']:6.2f}  [{e['name']}]")

main()
