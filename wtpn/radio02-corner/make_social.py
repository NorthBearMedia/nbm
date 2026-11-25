#!/usr/bin/env python3
"""The social upload for Transmission 02: final-transmission02.mp4 with the social master (-14 LUFS stereo),
with the series' opening warning (hook-warning/build/E_intro.mp4, 3.15 s: "Easily scared? Scroll away.
Everyone else, sound up.") in front. Writes transmission02-part1-social.mp4 and a 720p preview."""
import json, pathlib, subprocess, re
D = pathlib.Path(__file__).parent
WARN = D.parent / "hook-warning" / "build" / "E_intro.mp4"
def run(c): subprocess.run(c, check=True, capture_output=True)
def dur(p): return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                                        capture_output=True, text=True).stdout)
T = json.load(open(D / "timeline.json"))["total"]; TOT = dur(D / "final-transmission02.mp4")
ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-maxrate", "10M", "-bufsize", "20M", "-profile:v", "high",
       "-level", "4.2", "-pix_fmt", "yuv420p", "-r", "30", "-g", "60", "-color_primaries", "bt709", "-color_trc", "bt709",
       "-colorspace", "bt709", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"]
run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", str(WARN), "-i", str(D / "final-transmission02.mp4"), "-i", str(D / "master_social.wav"),
     "-filter_complex",
     f"[2:a]atrim=0:{T},asetpts=N/SR/TB,apad=whole_dur={TOT}[ea];"
     "[0:v]setsar=1,fps=30,format=yuv420p[v0];[1:v]setsar=1,fps=30,format=yuv420p[v1];"
     "[0:a]aresample=48000,aformat=channel_layouts=stereo[a0];[ea]aresample=48000,aformat=channel_layouts=stereo[a1];"
     "[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]",
     "-map", "[v]", "-map", "[a]"] + ENC + [str(D / "transmission02-part1-social.mp4")])
run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", str(D / "transmission02-part1-social.mp4"), "-vf", "scale=720:1280:flags=lanczos",
     "-c:v", "libx264", "-preset", "medium", "-crf", "25", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", str(D / "preview-transmission02-v4.mp4")])
r = subprocess.run(["ffmpeg", "-nostdin", "-i", str(D / "transmission02-part1-social.mp4"), "-af", "ebur128=peak=true", "-f", "null", "-"],
                   capture_output=True, text=True).stderr
I_RE, P_RE = r"I:\s*(-?[\d.]+) LUFS", r"Peak:\s*(-?[\d.]+)"
lu, pk = re.findall(I_RE, r)[-1], re.findall(P_RE, r)[-1]
print(f"social: {dur(D / 'transmission02-part1-social.mp4'):.2f}s (warning {dur(WARN):.2f}s + episode {TOT:.2f}s) | {lu} LUFS, peak {pk} dBFS")
