#!/usr/bin/env python3
"""TRANSMISSION 02 "CORNER" audio builder (adapted from radio01-crest/radio_audio.py).
We are in the farmhouse kitchen: May's handheld is on the table. May is in the room (dry, PTT
clicks, red light). Gerry and Jo arrive through the radio, each with the place they are standing
in behind them (processed apart from the voice, then sat a fixed margin under it, like a receiver's
AGC). Gerry moves: open hay shed -> the yard -> the lambing shed. The sheep he can hear from the
hay shed stop when he walks into the lambing shed. The kitchen bed runs throughout: range, rain on
the window, the weak lamb by the range; the lamb stops before the knocks.
Writes stations/*.wav, mix.wav, master.wav (-15 LUFS mono), master_social.wav (-14 LUFS stereo),
timeline.json."""
import json, pathlib, subprocess, re, sys
D = pathlib.Path(__file__).parent; sys.path.insert(0, str(D))
S = json.loads((D / "script.json").read_text()); LINES = S["lines"]
ST = D / "stations"; ST.mkdir(exist_ok=True); FX = D / "sfx"
SR = 48000
TEMPO = {"GERRY": 1.0, "MAY": 1.0, "JO": 1.0}
PAUSE_CAP = 0.6

def run(c): subprocess.run(c, check=True, capture_output=True)
def dur(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "csv=p=0", str(p)], capture_output=True, text=True).stdout)
def lufs(p):
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", str(p), "-af", "ebur128=framelog=quiet", "-f", "null", "-"],
                       capture_output=True, text=True)
    return float(re.findall(r"I:\s*(-?[\d.]+)\s*LUFS", r.stderr)[-1])

def words(al):
    """(word, start, end) from character alignment, skipping [delivery tags]."""
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

RADIO = ("highpass=f=380,lowpass=f=2700,"
         "acompressor=threshold=-24dB:ratio=4:attack=6:release=220:makeup=2,"
         "asoftclip=type=tanh,aresample=11025,aresample=48000,"
         "highpass=f=330,lowpass=f=3000,equalizer=f=1800:t=q:w=1.2:g=5")
BAND = "highpass=f=380,lowpass=f=2700,aresample=11025,aresample=48000"     # the bg gets the band, not the AGC
ROOM = "highpass=f=90,lowpass=f=7500,aecho=0.8:0.55:38|67:0.16|0.09,acompressor=threshold=-22dB:ratio=3:attack=10:release=150"

def prep(ln):
    """Trim (PTT clip / mid-word join), tighten long pauses, tempo, normalise. -> wav, words, cutoff, remap"""
    k = ln["id"]; al = json.loads((D / "vo" / f"{k}_align.json").read_text())
    ws = words(al); first, last = ws[0][1], ws[-1][2]
    if ln.get("trim_to"):
        ch, st = al["characters"], al["character_start_times_seconds"]
        a = st[next(i for i, c in enumerate(ch) if c == ln["trim_to"])] - 0.008
    elif ln.get("clip"):
        a = first + 0.025                          # PTT delay eats the attack of the first word
    else:
        a = max(0.0, first - 0.14)                 # in the room: keep the whole first consonant
    cutoff = ln["text"].rstrip().endswith("—")
    b = last + (0.02 if cutoff else 0.22)
    cap = ln.get("pause_cap", PAUSE_CAP); cuts = []
    for w1, w2 in zip(ws, ws[1:]):
        g = w2[1] - w1[2]
        if g > cap + 0.03 and w1[2] > a: cuts.append((w1[2] + cap / 2, g - cap))
    keeps, pos = [], a
    for p, r in cuts: keeps.append((pos, p)); pos = p + r
    keeps.append((pos, b)); tempo = TEMPO[ln["who"]]
    fc = "".join(f"[0:a]atrim={x:.4f}:{y:.4f},asetpts=N/SR/TB[k{i}];" for i, (x, y) in enumerate(keeps))
    fc += "".join(f"[k{i}]" for i in range(len(keeps))) + f"concat=n={len(keeps)}:v=0:a=1[c];[c]atempo={tempo},afade=t=in:d=0.01[o]"
    out = ST / f"{k}_v.wav"
    run(["ffmpeg", "-y", "-v", "error", "-i", str(D / "vo" / f"{k}.mp3"), "-filter_complex", fc,
         "-map", "[o]", "-ar", str(SR), "-ac", "1", "-c:a", "pcm_s16le", str(out)])
    g = -21.0 - lufs(out)
    run(["ffmpeg", "-y", "-v", "error", "-i", str(out), "-af", f"volume={g:.2f}dB,alimiter=level=0:limit=0.9",
         "-c:a", "pcm_s16le", str(ST / f"{k}_n.wav")])
    def remap(t): return max(0.0, t - a - sum(r for p, r in cuts if p < t)) / tempo
    return ST / f"{k}_n.wav", [(w, remap(s), remap(e)) for w, s, e in ws if e > a], cutoff, \
        {"a": round(a, 4), "cuts": [[round(p, 4), round(r, 4)] for p, r in cuts], "tempo": tempo}

# ---------- places --------------------------------------------------------------------------------
def loop(src, d, off, out, extra=""):
    """d seconds of src, looped, starting off seconds in, mono 48k."""
    run(["ffmpeg", "-y", "-v", "error", "-stream_loop", "-1", "-ss", f"{off:.2f}", "-i", str(src), "-t", f"{d:.3f}",
         "-af", f"aresample={SR}" + ("," + extra if extra else ""), "-ac", "1", "-c:a", "pcm_s16le", str(out)])

def place(kind, d, k):
    """The sound of where the speaker is standing, d seconds long, before the radio band."""
    seed = int(k[1:]); parts = []                         # (wav, dB relative to the bed target)
    def L(name, off, rel, extra=""):
        p = ST / f"{k}_{name}.wav"; loop(FX / f"{name}.mp3", d, off, p, extra); parts.append((p, rel))
    if kind.startswith("hay"):
        L("hayshed", (seed * 3.7) % 14, 0)
        L("ewe", (seed * 2.3) % 8, -3)
        if kind == "hay_panic": L("panic", (seed * 1.9) % 9, +1, "lowpass=f=1300,aecho=0.8:0.6:90|160:0.35|0.2")
    elif kind == "yard":
        L("yardwalk", (seed * 1.3) % 6, +1)
        L("panic", (seed * 2.9) % 9, +2, "lowpass=f=1800,aecho=0.8:0.5:70:0.3")
    elif kind.startswith("shed"):
        L("tinroof", (seed * 4.1) % 14, 0)
        if kind == "shed_straw": L("straw", 0.0, -2)
        if kind == "shed_door":
            p = ST / f"{k}_door.wav"
            run(["ffmpeg", "-y", "-v", "error", "-i", str(FX / "doordrag.mp3"), "-af", f"aresample={SR},atrim=0:2.3,apad=whole_dur={d:.3f}",
                 "-ac", "1", "-c:a", "pcm_s16le", str(p)]); parts.append((p, +4))
    elif kind == "fire":
        L("fire", (seed * 1.7) % 10, 0)
    out = ST / f"{k}_place.wav"
    if len(parts) == 1:
        run(["ffmpeg", "-y", "-v", "error", "-i", str(parts[0][0]), "-c:a", "pcm_s16le", str(out)])
    else:
        ins = sum((["-i", str(p)] for p, _ in parts), [])
        lv = [lufs(p) for p, _ in parts]
        fc = "".join(f"[{i}:a]volume={(-30 + rel) - l:.2f}dB[p{i}];" for i, ((_, rel), l) in enumerate(zip(parts, lv)))
        fc += "".join(f"[p{i}]" for i in range(len(parts))) + f"amix=inputs={len(parts)}:normalize=0:duration=first[o]"
        run(["ffmpeg", "-y", "-v", "error"] + ins + ["-filter_complex", fc, "-map", "[o]", "-c:a", "pcm_s16le", str(out)])
    return out

BED_T = {"hay": -32.0, "hay_panic": -29.0, "yard": -29.0, "shed": -34.0, "shed_door": -31.0,
         "shed_straw": -33.0, "fire": -36.0}

def station(ln, dry, cutoff, opening=True, closing=True):
    """-> (wav, voice_offset, keyed_dur, kind)"""
    k, who = ln["id"], ln["who"]; d = dur(dry); out = ST / f"{k}_st.wav"
    if who == "MAY":                                  # in the room with us, keying the handheld
        run(["ffmpeg", "-y", "-v", "error", "-i", str(ST / "ptt.wav"), "-i", str(dry), "-i", str(ST / "ptt.wav"),
             "-filter_complex", f"[1:a]{ROOM},apad=pad_dur=0.12[v];[0:a]apad=pad_dur=0.10[p1];[p1][v][2:a]concat=n=3:v=0:a=1[o]",
             "-map", "[o]", "-c:a", "pcm_s16le", str(out)])
        return out, 0.114, dur(out), "tx"
    hold = ln.get("hold_after", 0.0)
    run(["ffmpeg", "-y", "-v", "error", "-i", str(dry), "-af", RADIO, "-c:a", "pcm_s16le", str(ST / f"{k}_rv.wav")])
    gv = -18.0 - lufs(ST / f"{k}_rv.wav")
    bl = d + hold + 0.08
    pl = place(ln["bg"], bl, k)
    run(["ffmpeg", "-y", "-v", "error", "-i", str(pl), "-af", BAND, "-c:a", "pcm_s16le", str(ST / f"{k}_b.wav")])
    gb = BED_T[ln["bg"]] - lufs(ST / f"{k}_b.wav")
    run(["ffmpeg", "-y", "-v", "error", "-i", str(ST / f"{k}_rv.wav"), "-i", str(ST / f"{k}_b.wav"),
         "-filter_complex",
         f"[0:a]volume={gv:.2f}dB,apad=pad_dur={hold + 0.08:.3f}[v];[1:a]volume={gb:.2f}dB[w];"
         f"[v][w]amix=inputs=2:normalize=0:duration=longest,alimiter=level=0:limit=0.85"
         + (",afade=t=in:d=0.03" if opening else "") + "[r]",
         "-map", "[r]", "-c:a", "pcm_s16le", str(ST / f"{k}_r.wav")])
    tail = [] if not closing else ([ST / "gap80.wav", ST / "sq_tail_short.wav"] if cutoff and not hold else [ST / "sq_tail.wav"])
    parts = ([ST / "sq_open.wav"] if opening else []) + [ST / f"{k}_r.wav"] + tail
    ins = sum((["-i", str(p)] for p in parts), [])
    run(["ffmpeg", "-y", "-v", "error"] + ins + ["-filter_complex",
         "".join(f"[{i}:a]" for i in range(len(parts))) + f"concat=n={len(parts)}:v=0:a=1[o]",
         "-map", "[o]", "-c:a", "pcm_s16le", str(out)])
    voff = dur(ST / "sq_open.wav") if opening else 0.0
    return out, voff, voff + dur(ST / f"{k}_r.wav"), "rx"

GAP = {"l06": 0.9, "l09": 0.6, "l12": 2.4, "l17": 1.3, "l18": 0.0, "l19": 1.3, "l22": 2.6, "l24": 1.3, "l25": 0.9}
def gap_before(prev, ln):
    if prev is None: return 0.6
    if ln["id"] in GAP: return GAP[ln["id"]]
    return 0.72 if prev["who"] == ln["who"] else 0.45

def main():
    import radio_sfx; radio_sfx.build(ST)
    run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"anullsrc=r={SR}:cl=mono", "-t", "0.08", "-c:a", "pcm_s16le", str(ST / "gap80.wav")])
    tl, t, prev = [], 0.0, None
    for i, ln in enumerate(LINES):
        nxt = LINES[i + 1] if i + 1 < len(LINES) else None
        dry, ws, cutoff, rm = prep(ln)
        wav, voff, keyed, kind = station(ln, dry, cutoff, opening=not ln.get("cont"), closing=not (nxt and nxt.get("cont")))
        t += gap_before(prev, ln)
        tl.append({"id": ln["id"], "who": ln["who"], "kind": kind, "start": round(t, 3), "led_on": round(t, 3),
                   "led_off": round(t + keyed, 3), "end": round(t + dur(wav), 3), "text": ln["text"], "wav": wav.name,
                   "remap": dict(rm, off=round(t + voff, 4)),
                   "words": [(w, round(t + voff + s, 3), round(t + voff + e, 3)) for w, s, e in ws]})
        t += dur(wav); prev = ln
    # the ending: nothing on the radio; the lamb has stopped; three slow knocks; a breath of room; cut
    t_knock = t + 2.8
    total = t_knock + 2.3 + 1.6
    # ---- the kitchen: range + rain on the window, the radio's idle hiss, the lamb ----
    loop(FX / "kitchen.mp3", total, 0.0, ST / "kitchen.wav")
    run(["ffmpeg", "-y", "-v", "error", "-i", str(ST / "kitchen.wav"), "-f", "lavfi",
         "-i", f"anoisesrc=color=white:d={total:.3f}:a=0.5:r={SR}",
         "-filter_complex", f"[0:a]volume={-40 - lufs(ST / 'kitchen.wav'):.2f}dB[k];"
                            "[1:a]bandpass=f=1600:width_type=h:w=2400,volume=0.02[h];[k][h]amix=inputs=2:normalize=0",
         "-ac", "1", "-c:a", "pcm_s16le", str(ST / "bed.wav")])
    # lamb: a soft bleat in the gaps after some of May's lines and between transmissions; none after l23
    starts = {e["id"]: e for e in tl}
    lamb_at = [starts["l02"]["end"] + 0.2, starts["l05"]["end"] + 0.3, starts["l10"]["end"] + 0.25,
               starts["l16"]["end"] + 0.2, starts["l19"]["end"] + 0.4, starts["l21"]["end"] + 0.15]
    segs = [(0.0, 2.6), (3.2, 5.5), (6.1, 9.7)]
    ins, fc = ["-i", str(ST / "bed.wav")], []
    lamb_raw = ST / "lamb_raw.wav"
    run(["ffmpeg", "-y", "-v", "error", "-i", str(FX / "lamb.mp3"), "-af", f"aresample={SR}", "-ac", "1", "-c:a", "pcm_s16le", str(lamb_raw)])
    gl = -33.0 - lufs(lamb_raw)
    for j, at in enumerate(lamb_at):
        a, b = segs[j % 3]; n = len(ins) // 2
        ins += ["-i", str(lamb_raw)]
        ms = int(at * 1000)
        fc.append(f"[{n}:a]atrim={a}:{min(b, a + 1.6)},asetpts=N/SR/TB,afade=t=out:st={min(b - a, 1.6) - 0.4:.2f}:d=0.4,"
                  f"volume={gl - 2 * (j > 3):.2f}dB,{ROOM},adelay={ms}|{ms}[l{j}]")
    # knocks: one clean knock from the generated take, three times, about a second apart
    knock = ST / "knock.wav"
    run(["ffmpeg", "-y", "-v", "error", "-i", str(FX / "knocks.mp3"), "-af", f"aresample={SR},atrim=0.17:0.75,asetpts=N/SR/TB,afade=t=out:st=0.45:d=0.13",
         "-ac", "1", "-c:a", "pcm_s16le", str(knock)])
    gk = -22.5 - lufs(knock)
    for j, (off, g) in enumerate([(0.0, 0.0), (1.15, -0.8), (2.3, 0.4)]):
        n = len(ins) // 2; ins += ["-i", str(knock)]; ms = int((t_knock + off) * 1000)
        fc.append(f"[{n}:a]volume={gk + g:.2f}dB,aecho=0.8:0.5:23|41:0.2|0.12,adelay={ms}|{ms}[k{j}]")
    for e in tl:
        n = len(ins) // 2; ins += ["-i", str(ST / e["wav"])]; ms = int(e["start"] * 1000)
        fc.append(f"[{n}:a]adelay={ms}|{ms}[d{n}]")
    labels = "".join(re.findall(r"\[[a-z]\d+\]$", f)[0] for f in fc)
    fc.append("[0:a]" + labels + f"amix=inputs={len(fc) + 1}:normalize=0:duration=first[m]")
    run(["ffmpeg", "-y", "-v", "error"] + ins + ["-filter_complex", ";".join(fc), "-map", "[m]",
         "-t", f"{total:.3f}", "-c:a", "pcm_s16le", str(D / "mix.wav")])
    def master(g, out, target, ch):
        run(["ffmpeg", "-y", "-v", "error", "-i", str(D / "mix.wav"), "-af",
             f"volume={g:.2f}dB,aresample=192000,alimiter=level=0:limit=0.84:attack=5:release=50,aresample=48000",
             "-ac", str(ch), "-c:a", "pcm_s16le", str(out)])
        return lufs(out)
    for out, target, ch in [(D / "master.wav", -15.0, 1), (D / "master_social.wav", -14.0, 2)]:
        g = target - lufs(D / "mix.wav")
        for _ in range(5):
            err = target - master(g, out, target, ch)
            if abs(err) < 0.15: break
            g += err
    json.dump({"total": round(total, 3), "knocks": [round(t_knock + o, 3) for o in (0, 1.15, 2.3)],
               "lines": tl}, open(D / "timeline.json", "w"), indent=1)
    print(f"master.wav {total:.1f}s  {lufs(D / 'master.wav'):.1f} LUFS | social {lufs(D / 'master_social.wav'):.1f} LUFS")
    for e in tl:
        print(f"  {e['start']:6.2f}-{e['end']:6.2f}  {e['kind']}  {e['who']:5s} {e['id']}  {e['text'][:52]}")
    print(f"  {t_knock:6.2f}         knocks x3, end {total:.2f}")

main()
