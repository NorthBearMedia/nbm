"""Surgical silence trim (rebuilt 15 Aug; same logic as 11 Aug). Caps word gaps: first 12s at
0.8s, rest at 1.5s, cutting the MIDDLE of each over-long gap. Rewrites alignment.json (backup
alignment-orig.json). Usage: tighten_gaps.py <dir> <narr_in> <narr_out>"""
import json,sys,subprocess,shutil,os
d,ni,no=sys.argv[1],sys.argv[2],sys.argv[3]
al=json.load(open(f"{d}/alignment.json"))
ch,st,en=al["characters"],al["character_start_times_seconds"],al["character_end_times_seconds"]
words=[];cur="";cs=ce=None;tag=False
for c,s,e in zip(ch,st,en):
    if c=="<": tag=True; continue
    if tag:
        if c==">": tag=False
        continue
    if c.isspace():
        if cur: words.append((cur,cs,ce)); cur=""
    else:
        if not cur: cs=s
        cur+=c; ce=e
if cur: words.append((cur,cs,ce))
cuts=[]
for a,b in zip(words,words[1:]):
    g=b[1]-a[2]; cap=0.8 if a[2]<12 else 1.5
    if g>cap+0.05: cuts.append((a[2]+cap/2, g-cap, a[0], g, cap))
total=en[-1]; removed=sum(c[1] for c in cuts)
print(f"{d}: {len(cuts)} cuts, -{removed:.2f}s  ({total:.2f} -> {total-removed:.2f}s)")
for p,r,w,g,cap in cuts: print(f"   after {w!r:22s} gap {g:.2f} -> {cap}  (cut {r:.2f} at {p:.2f})")
keeps=[];pos=0.0
for p,r,*_ in cuts: keeps.append((pos,p)); pos=p+r
keeps.append((pos,total+2))
f=[f"[0:a]atrim={a:.4f}:{b:.4f},asetpts=N/SR/TB[k{i}];" for i,(a,b) in enumerate(keeps)]
fc="".join(f)+"".join(f"[k{i}]" for i in range(len(keeps)))+f"concat=n={len(keeps)}:v=0:a=1[out]"
subprocess.run(["ffmpeg","-y","-v","error","-i",f"{d}/{ni}","-filter_complex",fc,"-map","[out]",
                "-c:a","libmp3lame","-q:a","2",f"{d}/{no}"],check=True)
def shift(t): return t-sum(r for p,r,*_ in cuts if p<t)
if not os.path.exists(f"{d}/alignment-orig.json"): shutil.copy(f"{d}/alignment.json",f"{d}/alignment-orig.json")
al["character_start_times_seconds"]=[shift(t) for t in st]
al["character_end_times_seconds"]=[shift(t) for t in en]
json.dump(al,open(f"{d}/alignment.json","w"))
json.dump({"cuts":[(p,r) for p,r,*_ in cuts]},open(f"{d}/cuts.json","w"))
print("new narration file:",no)
