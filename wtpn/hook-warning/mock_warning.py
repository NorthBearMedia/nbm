#!/usr/bin/env python3
"""Mock-ups of the opening warning (user, 25 Nov): seen and heard at the same time, first thing, then straight
into the episode. Each mock-up = the warning (voiced, with the words appearing as they're spoken) + the first
8 s of Transmission 02 so the hand-off can be judged.
  A  Narrator    black, words appear as spoken, deep calm voice, faint static
  B  The radio   the episode's kitchen (darkened); the warning comes out of the radio on the table, red light on
  C  Whisper     black, the whole line fades in, whispered close
  D  Punchy      black, "Easily scared? Scroll away. Everyone else, sound up." stamped phrase by phrase
Writes mockup_<X>.mp4 (and build/ intermediates). Usage: mock_warning.py [A B C D]"""
import json, urllib.request, urllib.error, base64, pathlib, subprocess, re, sys, time
D = pathlib.Path(__file__).parent; B = D / "build"; B.mkdir(exist_ok=True)
EP = D.parent / "radio02-corner" / "transmission02-part1-social.mp4"
SQ = D.parent / "radio02-corner" / "stations"
SR = 48000
LINE = "If you're easily scared, scroll away. Everyone else, sound up."
PUNCH = "Easily scared? Scroll away. Everyone else, sound up."
V = {
 "A": dict(voice="ofMPN3qFIoaLyL5P87YZ", model="eleven_multilingual_v2", text=LINE,                       # WTPN Mark - Deep British
           vs={"stability": 0.55, "similarity_boost": 0.85, "style": 0.25, "use_speaker_boost": True, "speed": 1.12}, tempo=1.06),
 "B": dict(voice="GsjQ0ydx7QzhDLqInGtT", model="eleven_multilingual_v2", text=LINE,                       # Olivia J - Suspense, British calm
           vs={"stability": 0.6, "similarity_boost": 0.85, "style": 0.2, "use_speaker_boost": True, "speed": 1.12}, tempo=1.06),
 "C": dict(voice="AeRdCCKzvd23BpJoofzx", model="eleven_v3", text="[whispering] " + LINE,                  # Nathaniel C - Suspense, British calm
           vs={"stability": 0.5, "similarity_boost": 0.85, "use_speaker_boost": True}, tempo=1.15),
 "D": dict(voice="C5rG2JoeFeqEgocBWvLg", model="eleven_multilingual_v2", text=PUNCH,                      # WTPN Jay - Gravelly British
           vs={"stability": 0.5, "similarity_boost": 0.85, "style": 0.35, "use_speaker_boost": True, "speed": 1.1}, tempo=1.04),
}
RADIO = ("highpass=f=300,lowpass=f=3400,acompressor=threshold=-24dB:ratio=3.5:attack=6:release=200:makeup=2,"
         "aresample=16000,aresample=48000,highpass=f=280,lowpass=f=3600,equalizer=f=2200:t=q:w=1.2:g=3")
CLEAN = "highpass=f=70,acompressor=threshold=-22dB:ratio=2.5:attack=8:release=160,aecho=0.8:0.3:14:0.05"
WHISPER = "highpass=f=110,equalizer=f=4500:t=q:w=1.2:g=3,acompressor=threshold=-26dB:ratio=3:attack=5:release=120"
LED = (116, 1316)                                     # top face of the radio in the episode's first frame

def run(c): subprocess.run(c, check=True, capture_output=True)
def dur(p): return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                                        capture_output=True, text=True).stdout)
def lufs(p):
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", str(p), "-af", "ebur128=framelog=quiet", "-f", "null", "-"], capture_output=True, text=True)
    return float(re.findall(r"I:\s*(-?[\d.]+)\s*LUFS", r.stderr)[-1])

def tts(k):
    v = V[k]; out = B / f"{k}_voice.mp3"; al = B / f"{k}_align.json"
    if out.exists() and al.exists(): return out, json.load(open(al))
    for attempt in range(6):
        try:
            r = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{v['voice']}/with-timestamps",
                data=json.dumps({"text": v["text"], "model_id": v["model"], "voice_settings": v["vs"]}).encode(), method="POST",
                headers={"xi-api-key": "proxy-injected", "Content-Type": "application/json"})
            d = json.load(urllib.request.urlopen(r, timeout=300)); break
        except urllib.error.HTTPError as e:
            if e.code in (409, 429, 500, 503): time.sleep(5 * (attempt + 1)); continue
            raise
    out.write_bytes(base64.b64decode(d["audio_base64"])); json.dump(d["alignment"], open(al, "w"))
    return out, d["alignment"]

def words(al):
    ch, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    out, cur, cs, ce, tag = [], "", None, None, False
    for c, s, e in zip(ch, st, en):
        if c == "[": tag = True; continue
        if tag:
            if c == "]": tag = False
            continue
        if c.isspace():
            if cur: out.append([cur, cs, ce]); cur = ""
        else:
            if not cur: cs = s
            cur += c; ce = e
    if cur: out.append([cur, cs, ce])
    return [w for w in out if any(x.isalnum() for x in w[0])]

def ass_time(t):
    t = max(0.0, t); h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"

HEAD = ("[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\n\n[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        "Style: W,IBM Plex Mono SemiBold,70,&H00E8EFF2,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,2,5,95,150,0,1\n"
        "Style: P,IBM Plex Mono SemiBold,92,&H00F2F2F2,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,2,0,1,2,2,5,100,160,0,1\n"
        "Style: S,IBM Plex Mono Medium,64,&H00C8CED2,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,0,0,5,95,150,0,1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")

def cards(ws):
    """Split the words into the two sentences: up to 'away.' and the rest."""
    i = next(j for j, w in enumerate(ws) if w[0].lower().startswith("away")) + 1
    return [ws[:i], ws[i:]]

def layout(ws):
    """Card text with a line break: 'If you're easily scared,' / 'scroll away.' and 'Everyone else,' / 'sound up.'"""
    toks = [w[0] for w in ws]
    brk = next((j + 1 for j, t in enumerate(toks) if t.endswith(",") or t.endswith("?")), len(toks))
    return toks, brk

def events(k, ws, t0, t_end):
    ev = []
    if k in ("A", "B"):                                 # words appear as spoken; layout fixed (unspoken words transparent)
        cs = cards(ws)
        for ci, card in enumerate(cs):
            toks, brk = layout(card)
            c_end = cs[ci + 1][0][1] + t0 - 0.05 if ci + 1 < len(cs) else t_end
            for i in range(len(card)):
                a = card[i][1] + t0; b = card[i + 1][1] + t0 if i + 1 < len(card) else c_end
                txt = ""
                for j, t in enumerate(toks):
                    sep = "\\N" if j == brk else (" " if j else "")
                    txt += sep + (t if j <= i else "{\\alpha&HFF&}" + t + "{\\alpha&H00&}")
                ev.append(f"Dialogue: 0,{ass_time(a)},{ass_time(b)},W,,0,0,0,,{txt}")
    elif k == "C":                                      # whole sentence fades in as the whisper starts it
        cs = cards(ws)
        for ci, card in enumerate(cs):
            toks, brk = layout(card)
            a = card[0][1] + t0 - 0.05; b = cs[ci + 1][0][1] + t0 - 0.05 if ci + 1 < len(cs) else t_end
            txt = " ".join(toks[:brk]) + ("\\N" + " ".join(toks[brk:]) if brk < len(toks) else "")
            ev.append(f"Dialogue: 0,{ass_time(a)},{ass_time(b)},S,,0,0,0,,{{\\fad(220,120)}}{txt}")
    else:                                               # D: phrase by phrase, stamped
        phrases, cur = [], []
        for w in ws:
            cur.append(w)
            if w[0].endswith((",", "?", ".")): phrases.append(cur); cur = []
        if cur: phrases.append(cur)
        for pi, ph in enumerate(phrases):
            a = ph[0][1] + t0 - 0.04; b = phrases[pi + 1][0][1] + t0 - 0.04 if pi + 1 < len(phrases) else t_end
            txt = " ".join(w[0] for w in ph).upper()
            ev.append(f"Dialogue: 0,{ass_time(a)},{ass_time(b)},P,,0,0,0,,{{\\fscx118\\fscy118\\t(0,110,\\fscx100\\fscy100)}}{txt}")
    return ev

def build(k):
    vo, al = tts(k); ws = words(al)
    lead = 0.08; radio = k == "B"; tempo = V[k]["tempo"]
    a0 = max(0.0, ws[0][1] - 0.04); keeps, pos, cut = [], a0, []
    for w1, w2 in zip(ws, ws[1:]):
        cap = 0.22 if w1[0].endswith((".", "?", ",")) else 0.06
        g = w2[1] - w1[2]
        if g > cap: keeps.append((pos, w1[2] + cap / 2)); pos = w2[1] - cap / 2; cut.append((w1[2] + cap / 2, g - cap))
    keeps.append((pos, ws[-1][2] + 0.12))
    fc = "".join(f"[0:a]atrim={x:.4f}:{y:.4f},asetpts=N/SR/TB[k{i}];" for i, (x, y) in enumerate(keeps))
    fc += "".join(f"[k{i}]" for i in range(len(keeps))) + f"concat=n={len(keeps)}:v=0:a=1,atempo={tempo}[o]"
    run(["ffmpeg", "-y", "-v", "error", "-i", str(vo), "-filter_complex", fc, "-map", "[o]", "-c:a", "libmp3lame", "-q:a", "2", str(B / f"{k}_tight.mp3")])
    def rm(t): return (t - a0 - sum(r for p, r in cut if p < t)) / tempo
    ws = [[w, rm(s), rm(e)] for w, s, e in ws]; vo = B / f"{k}_tight.mp3"
    # ---- audio: the voice, processed, at -16 LUFS ----
    chain = RADIO if radio else WHISPER if k == "C" else CLEAN
    run(["ffmpeg", "-y", "-v", "error", "-i", str(vo), "-af", f"aresample={SR},{chain}", "-ac", "1", "-c:a", "pcm_s16le", str(B / f"{k}_v.wav")])
    g = -16.0 - lufs(B / f"{k}_v.wav")
    run(["ffmpeg", "-y", "-v", "error", "-i", str(B / f"{k}_v.wav"), "-af", f"volume={g:.2f}dB,alimiter=level=0:limit=0.9",
         "-c:a", "pcm_s16le", str(B / f"{k}_vn.wav")])
    last = ws[-1][2]
    if radio:                                           # the radio keys up, speaks, and drops
        so = dur(SQ / "sq_open.wav"); voff = lead + so
        total = voff + last + 0.15 + dur(SQ / "sq_tail.wav") + 0.25
        fc = (f"[1:a]adelay={int(lead*1000)}|{int(lead*1000)}[o];[2:a]adelay={int(voff*1000)}|{int(voff*1000)}[v];"
              f"[3:a]adelay={int((voff+last+0.15)*1000)}|{int((voff+last+0.15)*1000)}[t];")
        ins = ["-i", str(SQ / "sq_open.wav"), "-i", str(B / f"{k}_vn.wav"), "-i", str(SQ / "sq_tail.wav")]
        bed = f"[0:a]volume=-41dB[b];"
        mix = "[b][o][v][t]amix=inputs=4:normalize=0:duration=first"
        bed_src = ["-stream_loop", "-1", "-i", str(D.parent / "radio02-corner" / "sfx" / "kitchen.mp3")]
    else:
        voff = lead; total = voff + last + 0.3
        fc = f"[1:a]adelay={int(voff*1000)}|{int(voff*1000)}[v];"
        ins = ["-i", str(B / f"{k}_vn.wav")]
        bed = "[0:a]bandpass=f=1700:width_type=h:w=2600,volume=0.035,afade=t=out:st=" + f"{total-0.3:.2f}:d=0.3[b];"
        mix = "[b][v]amix=inputs=2:normalize=0:duration=first"
        bed_src = ["-f", "lavfi", "-i", f"anoisesrc=color=white:d={total+1:.2f}:a=0.5:r={SR}"]
    run(["ffmpeg", "-y", "-v", "error"] + bed_src + ins + ["-filter_complex", bed + fc + mix + f",atrim=0:{total:.3f}[m]",
         "-map", "[m]", "-ar", str(SR), "-ac", "2", "-c:a", "pcm_s16le", str(B / f"{k}_intro.wav")])
    # ---- picture ----
    (B / f"{k}.ass").write_text(HEAD + "\n".join(events(k, ws, voff, total)) + "\n")
    if radio:
        x, y = LED; on, off = voff - 0.08, voff + last + 0.15
        bg = (f"[0:v]scale=1080:1920,eq=brightness=-0.10:saturation=0.85,"
              f"drawbox=x=0:y=0:w=1080:h=1920:color=black@0.35:t=fill,"
              f"drawbox=x={x-14}:y={y-6}:w=28:h=12:color=red@0.35:t=fill:enable='between(t,{on:.2f},{off:.2f})',"
              f"drawbox=x={x-5}:y={y-3}:w=10:h=6:color=0xff3020@0.95:t=fill:enable='between(t,{on:.2f},{off:.2f})'")
        vin = ["-loop", "1", "-framerate", "30", "-t", f"{total:.3f}", "-i", str(B / "corner_f0.png")]
    else:
        bg = "[0:v]null"
        vin = ["-f", "lavfi", "-i", f"color=c=black:s=1080x1920:r=30:d={total:.3f}"]
    run(["ffmpeg", "-y", "-v", "error"] + vin + ["-i", str(B / f"{k}_intro.wav"), "-filter_complex",
         f"{bg},ass={B / f'{k}.ass'}:fontsdir=/root/.fonts,format=yuv420p,fps=30[vv]", "-map", "[vv]", "-map", "1:a",
         "-t", f"{total:.3f}", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-c:a", "aac", "-b:a", "192k", "-ar", str(SR), str(B / f"{k}_intro.mp4")])
    # ---- + the first 8 s of the episode ----
    out = D / f"mockup_{k}.mp4"
    run(["ffmpeg", "-y", "-v", "error", "-i", str(B / f"{k}_intro.mp4"), "-t", "8", "-i", str(EP), "-filter_complex",
         "[0:v]setsar=1[a0];[1:v]setsar=1,fps=30,format=yuv420p[a1];[1:a]aresample=48000,aformat=channel_layouts=stereo[b1];"
         "[0:a]aformat=channel_layouts=stereo[b0];[a0][b0][a1][b1]concat=n=2:v=1:a=1[v][a]",
         "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "19", "-preset", "medium", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out)])
    print(f"mockup_{k}: warning {total:.2f}s ({' '.join(w[0] for w in ws)}) + 8 s of the episode")

for k in (sys.argv[1:] or ["A", "B", "C", "D"]): build(k)
