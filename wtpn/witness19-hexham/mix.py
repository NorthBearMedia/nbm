#!/usr/bin/env python3
"""Mix + master to the bible recipe: voices adelay'd at block marks -> amix(normalize=0)
-> asplit [vo][key]; bed2 at loudnorm I=BED sidechain-ducked by [key]; pink hiss until
hiss_end; tape clicks at 30ms and hiss_end; one door sting at the story beat; bus
compressor; flat measure -> ONE static gain to -15 -> alimiter 0.9."""
import json,subprocess,pathlib,sys,re
D=pathlib.Path(__file__).parent
BED=float(sys.argv[1]) if len(sys.argv)>1 else -34.0
P=json.loads((D/"planb.json").read_text()); S=json.loads((D/"script.json").read_text())
DUR=P["D"]; marks=P["marks"]; keys=list(S["segments"].keys())
def run(c): subprocess.run(c,check=True,capture_output=True)
ins=[]; fc=[]
for i,k in enumerate(keys):
    ins += ["-i", f"{k}-t.mp3"]
    fc.append(f"[{i}:a]adelay={int(marks[k]*1000)}|{int(marks[k]*1000)}[v{i}]")
n=len(keys)
fc.append("".join(f"[v{i}]" for i in range(n))+f"amix=inputs={n}:normalize=0[vo0]")
fc.append("[vo0]asplit=2[vo][key]")
ins += ["-stream_loop","-1","-i","bed2.mp3"]; bed_i=n
ins += ["-i","click-t.mp3"]; clk_i=n+1
ins += ["-i","door-t.mp3"]; dor_i=n+2
ins += ["-f","lavfi","-i",f"anoisesrc=color=pink:amplitude=0.006:d={DUR:.3f}"]; hiss_i=n+3
fc.append(f"[{bed_i}:a]atrim=0:{DUR:.3f},asetpts=N/SR/TB,loudnorm=I={BED}:TP=-2:LRA=7[bed0]")
fc.append("[bed0][key]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[bedd]")
fc.append(f"[{hiss_i}:a]bandpass=f=300:width_type=h:w=8700,atrim=0:{P['hiss_end']:.3f},asetpts=N/SR/TB[hiss]")
fc.append(f"[{clk_i}:a]asplit=2[ca][cb]")
fc.append("[ca]adelay=30|30,volume=0.6[clk1]")
fc.append(f"[cb]adelay={int(P['hiss_end']*1000)}|{int(P['hiss_end']*1000)},volume=0.6[clk2]")
fc.append(f"[{dor_i}:a]adelay={P['sting_ms']}|{P['sting_ms']},volume={S['sting']['vol']}[sting]")
fc.append("[vo][bedd][hiss][clk1][clk2][sting]amix=inputs=6:normalize=0,"
          "acompressor=threshold=-12dB:ratio=2:attack=20:release=250,apad[busout]")
run(["ffmpeg","-y","-v","error"]+ins+["-filter_complex",";".join(fc),"-map","[busout]",
     "-t",f"{DUR:.3f}","-c:a","pcm_s16le","flatb.wav"])
r=subprocess.run(["ffmpeg","-v","info","-i","flatb.wav","-af","ebur128=framelog=quiet","-f","null","-"],
                 capture_output=True,text=True)
I=float(re.findall(r"I:\s*(-?[\d.]+)\s*LUFS",r.stderr)[-1])
pk=float(re.findall(r"max_volume:\s*(-?[\d.]+)",subprocess.run(
    ["ffmpeg","-v","info","-i","flatb.wav","-af","volumedetect","-f","null","-"],
    capture_output=True,text=True).stderr)[-1])
G=-15.0-I
print(f"flat mix: I={I:.2f} LUFS  peak={pk:.1f} dB  ->  static gain {G:+.2f} dB")
run(["ffmpeg","-y","-v","error","-i","videob-main.mp4","-i","flatb.wav","-filter_complex",
     f"[1:a]volume={G:.2f}dB,alimiter=limit=0.9[a]","-map","0:v","-map","[a]",
     "-c:v","copy","-c:a","aac","-b:a","192k","-shortest","bodyb.mp4"])
print("bodyb.mp4 written")
