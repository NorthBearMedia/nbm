#!/usr/bin/env python3
"""TRANSMISSION audio builder.
Hill traffic arrives through the desk radio: band-limited, hard-compressed, with wind mixed
in BEFORE the radio chain so it pumps with the voice as it does on a real handset. Base is in
the room with us: dry and close, a PTT click either side. After the last cut-off the channel
stays keyed with nobody speaking (open carrier), then drops. The final transmission has no wind
and a signal that is slightly too clean for someone on a ridge.
Writes stations/*.wav, mix.wav, master.wav and timeline.json (for the video stage)."""
import json, pathlib, subprocess, re, sys

D = pathlib.Path(__file__).parent
S = json.loads((D / "script.json").read_text())
ST = D / "stations"; ST.mkdir(exist_ok=True)
SR = 48000
TEMPO = {"EWAN": 1.10, "CAT": 1.10, "BASE": 1.03}
PAUSE_CAP = 0.34                       # radio traffic is clipped; v3 leaves theatrical pauses
PAUSE_CAP_SLOW = {"l15": 0.7, "l16": 0.6, "l17": 0.7, "l24": 0.55}

def run(c): subprocess.run(c, check=True, capture_output=True)
def dur(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "csv=p=0", str(p)], capture_output=True, text=True).stdout)
def lufs(p):
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", str(p), "-af", "ebur128=framelog=quiet",
                        "-f", "null", "-"], capture_output=True, text=True)
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

# ---------- synthesised sound effects ------------------------------------------------
def sfx():
    # squelch tail: the "kssh" when the far end unkeys
    run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"anoisesrc=color=white:d=0.24:a=0.5:r={SR}",
         "-af", "bandpass=f=1700:width_type=h:w=2600,afade=t=out:st=0:d=0.24:curve=exp,volume=0.55",
         "-ac", "1", "-c:a", "pcm_s16le", str(ST / "sq_tail.wav")])
    # squelch open: short burst as the carrier arrives
    run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"anoisesrc=color=white:d=0.06:a=0.5:r={SR}",
         "-af", "bandpass=f=1900:width_type=h:w=2400,afade=t=out:st=0.015:d=0.045,volume=0.32",
         "-ac", "1", "-c:a", "pcm_s16le", str(ST / "sq_open.wav")])
    # PTT click: a hard transient plus a little body, for Base keying the desk radio
    run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"anoisesrc=color=white:d=0.014:a=0.9:r={SR}",
         "-f", "lavfi", "-i", f"sine=f=190:d=0.03:r={SR}",
         "-filter_complex", "[0:a]highpass=f=1800,afade=t=out:st=0.002:d=0.012[a];"
                            "[1:a]afade=t=out:st=0:d=0.03,volume=0.5[b];[a][b]amix=inputs=2:normalize=0,volume=0.7",
         "-ac", "1", "-c:a", "pcm_s16le", str(ST / "ptt.wav")])

RADIO = ("highpass=f=380,lowpass=f=2700,"
         "acompressor=threshold=-27dB:ratio=9:attack=3:release=80:makeup=4,"
         "asoftclip=type=tanh,aresample=11025,aresample=48000,"
         "highpass=f=330,lowpass=f=3000,equalizer=f=1800:t=q:w=1.2:g=5")
CLEAN = ("highpass=f=240,lowpass=f=3900,"
         "acompressor=threshold=-24dB:ratio=4:attack=6:release=140:makeup=2,"
         "aresample=16000,aresample=48000")
ROOM = "highpass=f=90,lowpass=f=7500,aecho=0.8:0.55:38|67:0.16|0.09,acompressor=threshold=-22dB:ratio=3:attack=10:release=150"

def prep(ln):
    """Trim (PTT clip / mid-word join), tighten pauses, tempo. Returns wav path and remapped words."""
    k = ln["id"]; al = json.loads((D / "vo" / f"{k}_align.json").read_text())
    ws = words(al)
    first, last = ws[0][1], ws[-1][2]
    if ln.get("trim_to"):                          # join mid-word: start at the given letter
        ch, st = al["characters"], al["character_start_times_seconds"]
        idx = next(i for i, c in enumerate(ch) if c == ln["trim_to"])
        a = st[idx] - 0.008
    elif ln.get("clip"):
        a = first + 0.07                           # PTT delay eats the attack of the first word
    else:
        a = max(0.0, first - 0.06)
    cutoff = ln["text"].rstrip().endswith("—")
    b = last + (0.02 if cutoff else 0.22)          # a cut-off line ends hard on its last letter
    cap = PAUSE_CAP_SLOW.get(k, PAUSE_CAP)
    cuts = []
    for w1, w2 in zip(ws, ws[1:]):
        g = w2[1] - w1[2]
        if g > cap + 0.03 and w1[2] > a:
            cuts.append((w1[2] + cap / 2, g - cap))
    keeps, pos = [], a
    for p, r in cuts: keeps.append((pos, p)); pos = p + r
    keeps.append((pos, b))
    tempo = TEMPO[ln["who"]]
    fc = "".join(f"[0:a]atrim={x:.4f}:{y:.4f},asetpts=N/SR/TB[k{i}];" for i, (x, y) in enumerate(keeps))
    fc += "".join(f"[k{i}]" for i in range(len(keeps))) + f"concat=n={len(keeps)}:v=0:a=1[c];[c]atempo={tempo}"
    # a cut-off line simply ends on the trim point; it needs no fade. (An afade=out at st=0
    # silences everything after it — that muted the whole climax on the first build.)
    fc += ",afade=t=in:d=0.01"
    fc += "[o]"
    out = ST / f"{k}_v.wav"
    run(["ffmpeg", "-y", "-v", "error", "-i", str(D / "vo" / f"{k}.mp3"), "-filter_complex", fc,
         "-map", "[o]", "-ar", str(SR), "-ac", "1", "-c:a", "pcm_s16le", str(out)])
    # normalise the dry voice so every chain sees the same input level
    g = -21.0 - lufs(out)
    run(["ffmpeg", "-y", "-v", "error", "-i", str(out), "-af", f"volume={g:.2f}dB,alimiter=limit=0.9",
         "-c:a", "pcm_s16le", str(ST / f"{k}_n.wav")])
    def remap(t):
        return max(0.0, t - a - sum(r for p, r in cuts if p < t)) / tempo
    return ST / f"{k}_n.wav", [(w, remap(s), remap(e)) for w, s, e in ws if e > a], cutoff, \
        {"a": round(a, 4), "cuts": [[round(p, 4), round(r, 4)] for p, r in cuts], "tempo": tempo}

def station(ln, dry, cutoff):
    """Wrap a prepared voice in its station sound. Returns (wav, voice_offset, keyed_dur, kind)."""
    k, who = ln["id"], ln["who"]; d = dur(dry); out = ST / f"{k}_st.wav"
    if who == "BASE":                                  # in the room, keying the desk radio
        run(["ffmpeg", "-y", "-v", "error", "-i", str(ST / "ptt.wav"), "-i", str(dry), "-i", str(ST / "ptt.wav"),
             "-filter_complex",
             f"[1:a]{ROOM},apad=pad_dur=0.12[v];[0:a]apad=pad_dur=0.10[p1];"
             f"[p1][v][2:a]concat=n=3:v=0:a=1[o]",
             "-map", "[o]", "-c:a", "pcm_s16le", str(out)])
        return out, 0.114, dur(out), "tx"
    hold = 2.4 if k == "l06" else 0.0                 # 'standby': keeps the key down, wind only
    if ln.get("calm"):                                 # the last line: no wind, too clean a signal
        run(["ffmpeg", "-y", "-v", "error", "-i", str(ST / "sq_open.wav"), "-i", str(dry),
             "-filter_complex", f"[1:a]{CLEAN},volume=1.15[v];[0:a][v]concat=n=2:v=0:a=1[o]",
             "-map", "[o]", "-c:a", "pcm_s16le", str(out)])
        return out, dur(ST / "sq_open.wav"), dur(out), "rx"
    off = ln.get("off_mic")
    vlev, wlev = (0.62, 0.95) if off else (1.0, 0.62)
    vpre = ",lowpass=f=2600" if off else ""
    wl = d + hold + 0.08
    run(["ffmpeg", "-y", "-v", "error",
         "-i", str(dry), "-f", "lavfi", "-i", f"anoisesrc=color=brown:d={wl:.3f}:a=0.6:r={SR}:seed={int(k[1:]) * 7919}",
         "-filter_complex",
         f"[0:a]volume={vlev}{vpre},apad=pad_dur={hold+0.08:.3f}[v];"
         f"[1:a]lowpass=f=950,highpass=f=60,tremolo=f=0.33:d=0.55,volume={wlev}[w];"
         f"[v][w]amix=inputs=2:normalize=0:duration=longest,{RADIO}[r]",
         "-map", "[r]", "-c:a", "pcm_s16le", str(ST / f"{k}_r.wav")])
    parts = [ST / "sq_open.wav", ST / f"{k}_r.wav"] + ([] if cutoff else [ST / "sq_tail.wav"])
    ins = sum((["-i", str(p)] for p in parts), [])
    run(["ffmpeg", "-y", "-v", "error"] + ins + ["-filter_complex",
         "".join(f"[{i}:a]" for i in range(len(parts))) + f"concat=n={len(parts)}:v=0:a=1[o]",
         "-map", "[o]", "-c:a", "pcm_s16le", str(out)])
    keyed = dur(ST / "sq_open.wav") + dur(ST / f"{k}_r.wav")   # LED lit while the carrier is up
    return out, dur(ST / "sq_open.wav"), keyed, "rx"

def gap_before(prev, ln):
    if prev is None: return 0.6
    if prev["text"].rstrip().endswith("—") and prev["who"] != ln["who"]: return 0.10   # cut across
    if prev["id"] == "l11": return 1.3                     # he walks over to it
    if prev["id"] == "l23": return 0.0                     # handled by the open carrier
    if ln["id"] == "l25": return 2.6                       # the wait for an answer
    if prev["who"] == ln["who"]: return 0.72               # same station lets go and re-keys
    return 0.45

def main():
    sfx()
    tl, t, prev = [], 0.0, None
    for ln in S["lines"]:
        dry, ws, cutoff, rm = prep(ln)
        wav, voff, keyed, kind = station(ln, dry, cutoff)
        t += gap_before(prev, ln)
        tl.append({"id": ln["id"], "who": ln["who"], "kind": kind, "start": round(t, 3),
                   "led_on": round(t, 3), "led_off": round(t + keyed, 3),
                   "end": round(t + dur(wav), 3), "text": ln["text"], "wav": wav.name,
                   "remap": dict(rm, off=round(t + voff, 4)),
                   "words": [(w, round(t + voff + s, 3), round(t + voff + e, 3)) for w, s, e in ws]})
        t += dur(wav); prev = ln
        if ln["id"] == "l23":                              # the key stays down. nobody speaks.
            carrier = 3.6
            run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi",
                 "-i", f"anoisesrc=color=white:d={carrier}:a=0.35:r={SR}",
                 "-af", f"{RADIO},volume=0.5", "-c:a", "pcm_s16le", str(ST / "carrier.wav")])
            run(["ffmpeg", "-y", "-v", "error", "-i", str(ST / "carrier.wav"), "-i", str(ST / "sq_tail.wav"),
                 "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1[o]", "-map", "[o]",
                 "-c:a", "pcm_s16le", str(ST / "carrier_st.wav")])
            tl.append({"id": "carrier", "who": "", "kind": "rx", "start": round(t, 3),
                       "led_on": round(t, 3), "led_off": round(t + carrier, 3),
                       "end": round(t + dur(ST / "carrier_st.wav"), 3), "text": "",
                       "wav": "carrier_st.wav", "words": []})
            t += dur(ST / "carrier_st.wav") + 2.0          # then the room, and nothing else
    total = t + 0.05
    # bed: base hut room tone, plus the faint hiss of a squelch set low for weak signals
    run(["ffmpeg", "-y", "-v", "error",
         "-f", "lavfi", "-i", f"anoisesrc=color=brown:d={total:.3f}:a=0.5:r={SR}",
         "-f", "lavfi", "-i", f"anoisesrc=color=white:d={total:.3f}:a=0.5:r={SR}",
         "-filter_complex", "[0:a]lowpass=f=180,volume=0.06[a];"
                            "[1:a]bandpass=f=1600:width_type=h:w=2400,volume=0.010[b];"
                            "[a][b]amix=inputs=2:normalize=0",
         "-ac", "1", "-c:a", "pcm_s16le", str(ST / "bed.wav")])
    ins, fc = ["-i", str(ST / "bed.wav")], []
    for i, e in enumerate(tl, 1):
        ins += ["-i", str(ST / e["wav"])]
        ms = int(e["start"] * 1000)
        fc.append(f"[{i}:a]adelay={ms}|{ms}[d{i}]")
    fc.append("[0:a]" + "".join(f"[d{i}]" for i in range(1, len(tl) + 1)) +
              f"amix=inputs={len(tl)+1}:normalize=0:duration=first[m]")
    run(["ffmpeg", "-y", "-v", "error"] + ins + ["-filter_complex", ";".join(fc), "-map", "[m]",
         "-t", f"{total:.3f}", "-c:a", "pcm_s16le", str(D / "mix.wav")])
    g = -15.0 - lufs(D / "mix.wav")
    run(["ffmpeg", "-y", "-v", "error", "-i", str(D / "mix.wav"),
         "-af", f"volume={g:.2f}dB,alimiter=limit=0.89", "-c:a", "pcm_s16le", str(D / "master.wav")])
    json.dump({"total": round(total, 3), "lines": tl}, open(D / "timeline.json", "w"), indent=1)
    print(f"master.wav  {total:.1f}s  (mix gain {g:+.2f} dB, master {lufs(D/'master.wav'):.1f} LUFS)")
    for e in tl:
        print(f"  {e['start']:6.2f}-{e['end']:6.2f}  {e['kind']}  {e['who']:4s} {e['id']:8s} {e['text'][:46]}")

main()
