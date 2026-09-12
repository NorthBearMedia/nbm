#!/usr/bin/env python3
"""Per-segment: gap-tighten (cap 0.8s, cut the middle) -> atempo -> tape chain ->
measured static gain to -16 -> limiter. Scratch stage is s16 WAV with 6 dB of staging
headroom: an intermediate mp3 injected a full-scale spike, and a float wav reads back as
0 dB clipped, both of which broke the ebur128 measurement (12 Sep). HEADROOM is added
back into the measured gain, so the -16 target is unchanged.
Remaps alignment: (t - cuts_before)/TEMPO."""
import json,subprocess,pathlib,sys,re
D=pathlib.Path(__file__).parent
TEMPO=float(sys.argv[1]); CAP=0.8; HEADROOM=6.0
S=json.loads((D/"script.json").read_text())
def run(c): subprocess.run(c,check=True,capture_output=True)
def words(al):
    ch,st,en=al["characters"],al["character_start_times_seconds"],al["character_end_times_seconds"]
    out=[];cur="";cs=ce=None;tag=False
    for c,s,e in zip(ch,st,en):
        if c=="[": tag=True; continue
        if tag:
            if c=="]": tag=False
            continue
        if c.isspace():
            if cur: out.append((cur,cs,ce)); cur=""
        else:
            if not cur: cs=s
            cur+=c; ce=e
    if cur: out.append((cur,cs,ce))
    return out
CHAIN=("highpass=f=240,lowpass=f=3600,aresample=8000,aresample=48000,"
       "acompressor=threshold=-24dB:ratio=4:attack=10:release=200,vibrato=f=0.4:d=0.015")
tot=0.0
for k in S["segments"]:
    al=json.loads((D/f"{k}_align_orig.json").read_text())
    ws=words(al); total=al["character_end_times_seconds"][-1]
    cuts=[]
    for a,b in zip(ws,ws[1:]):
        g=b[1]-a[2]
        if g>CAP+0.05: cuts.append((a[2]+CAP/2, g-CAP))
    keeps=[];pos=0.0
    for p,r in cuts: keeps.append((pos,p)); pos=p+r
    keeps.append((pos,total+2))
    f="".join(f"[0:a]atrim={a:.4f}:{b:.4f},asetpts=N/SR/TB[k{i}];" for i,(a,b) in enumerate(keeps))
    fc=f+"".join(f"[k{i}]" for i in range(len(keeps)))+f"concat=n={len(keeps)}:v=0:a=1[c];[c]atempo={TEMPO},volume=-{HEADROOM}dB,{CHAIN}[out]"
    run(["ffmpeg","-y","-v","error","-i",f"{k}.mp3","-filter_complex",fc,"-map","[out]",
         "-c:a","pcm_s16le",f"{k}-p.wav"])
    r=subprocess.run(["ffmpeg","-v","info","-i",f"{k}-p.wav","-af","ebur128=framelog=quiet","-f","null","-"],
                     capture_output=True,text=True)
    I=float(re.findall(r"I:\s*(-?[\d.]+)\s*LUFS",r.stderr)[-1])
    pk=float(re.findall(r"max_volume:\s*(-?[\d.]+)",subprocess.run(
        ["ffmpeg","-v","info","-i",f"{k}-p.wav","-af","volumedetect","-f","null","-"],
        capture_output=True,text=True).stderr)[-1])
    G=-16.0-(I+HEADROOM)+HEADROOM   # measured file is HEADROOM dB down; target stays -16
    run(["ffmpeg","-y","-v","error","-i",f"{k}-p.wav","-af",f"volume={G:.2f}dB,alimiter=limit=0.95",
         "-c:a","libmp3lame","-q:a","2",f"{k}-t.mp3"])
    def remap(t,_c=cuts):
        return max(0.0,(t-sum(r for p,r in _c if p<t)))/TEMPO
    al["character_start_times_seconds"]=[remap(t) for t in al["character_start_times_seconds"]]
    al["character_end_times_seconds"]=[remap(t) for t in al["character_end_times_seconds"]]
    (D/f"{k}_align.json").write_text(json.dumps(al))
    d=float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f"{k}-t.mp3"],capture_output=True,text=True).stdout)
    tot+=d
    print(f"{k}: {total:.2f}s  cuts {len(cuts)} (-{sum(r for _,r in cuts):.2f}s)  tempo {TEMPO} -> {d:.2f}s   I={I+HEADROOM:6.1f}  peak={pk+HEADROOM:6.1f}  G={G:+.2f}")
print(f"VOICE TOTAL {tot:.2f}s")
