#!/bin/bash
# EP42 Borley Rectory. Bed level $1 (LUFS), default -33.
set -e; cd "$(dirname "$0")"
BEDL=${1:--33}
D=84.21             # 0.3 lead + 82.31 tightened narration + ~1.6 tail
SCRATCH=400         # ms — pencil scratching under the cold open
SCRUB=26300         # ms — lands on "scrubbed it off." (ends 27.34)
FIRE=47600          # ms — fire cut + "Then the house burned in the night"
HB1=54500           # ms — heartbeat builds under "It did not matter. The nun is still seen."
HB2=78500           # ms — heartbeat returns under the close
GRADE="eq=saturation=0.72:contrast=1.07:brightness=-0.03,vignette=PI/4.5,noise=alls=5:allf=t"

mk(){ F=$(python3 -c "print(f'{$2/10.041667:.4f}')")
  ffmpeg -y -v error -i "$1.mp4" -vf "scale=1080:1920:flags=lanczos:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setpts=PTS*${F},$GRADE" -t "$2" -an -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "$3"; }
# native-speed segment (no time-scaling) — for the walking nun
mktrim(){ ffmpeg -y -v error -ss "$2" -i "$1.mp4" -vf "scale=1080:1920:flags=lanczos:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setpts=PTS-STARTPTS,$GRADE" -t "$3" -an -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "$4"; }

# The wall bookends the writing beats; the nun takes "and a nun" and the close.
mk s1-wall        8.87 c1.mp4   # 0     -> 8.87   cold open on the writing
mk s2-rectory     8.32 c2.mp4   # 8.87  -> 17.19  Borley / Essex / most haunted
mk s1-wall       14.31 c3.mp4   # 17.19 -> 31.50  pencil / scrub / photographed
mk s2-rectory    12.59 c4.mp4   # 31.50 -> 44.09  1937 / 48 observers logging
mktrim s3-nun 0   3.51 c5.mp4   # 44.09 -> 47.60  "and a nun, walking the garden path"
mk s4-fire        9.77 c6.mp4   # 47.60 -> 57.37  burned / pulled down / still seen
mk s5-churchyard  6.55 c7.mp4   # 57.37 -> 63.92  churchyard / fields
mk s1-wall       15.22 c8.mp4   # 63.92 -> 79.14  never explained / nobody helped her
mktrim s3-nun 4.9716 5.07 c9.mp4 # 79.14 -> 84.21 "If she walks tonight, she is still waiting."

printf "file 'c1.mp4'\nfile 'c2.mp4'\nfile 'c3.mp4'\nfile 'c4.mp4'\nfile 'c5.mp4'\nfile 'c6.mp4'\nfile 'c7.mp4'\nfile 'c8.mp4'\nfile 'c9.mp4'\n" > concat.txt
ffmpeg -y -v error -f concat -safe 0 -i concat.txt -c copy video-main.mp4
echo "picture $(ffprobe -v quiet -show_entries format=duration -of csv=p=0 video-main.mp4)s"

ffmpeg -y -v error -i narration-tight.mp3 -af "loudnorm=I=-16:TP=-1.5:LRA=7" -c:a libmp3lame -q:a 2 narration.mp3
ffmpeg -y -v error -i bed-house2.mp3 -af "acompressor=threshold=-30dB:ratio=6:attack=20:release=400,loudnorm=I=${BEDL}:TP=-2:LRA=2" -c:a libmp3lame -q:a 2 bed-final.mp3
ffmpeg -y -v error -i sfx-scratch.mp3   -af "loudnorm=I=-16:TP=-2:LRA=7" -c:a libmp3lame -q:a 2 scratch-norm.mp3
ffmpeg -y -v error -i sfx-scrub.mp3     -af "loudnorm=I=-16:TP=-2:LRA=7" -c:a libmp3lame -q:a 2 scrub-norm.mp3
ffmpeg -y -v error -i sfx-fire.mp3      -af "loudnorm=I=-16:TP=-2:LRA=7" -c:a libmp3lame -q:a 2 fire-norm.mp3
ffmpeg -y -v error -i sfx-heartbeat.mp3 -af "loudnorm=I=-16:TP=-2:LRA=7" -c:a libmp3lame -q:a 2 hb-norm.mp3

IN="-i video-main.mp4 -i narration.mp3 -stream_loop 5 -i bed-final.mp3 -i scratch-norm.mp3 -i scrub-norm.mp3 -i fire-norm.mp3 -stream_loop 8 -i hb-norm.mp3"
CHAIN="[1:a]adelay=300|300,apad,asplit=2[vo][key];\
[2:a]atrim=0:${D},afade=t=in:d=1.2,afade=t=out:st=$(echo "$D-3"|bc):d=3[bedraw];\
[bedraw][key]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=400[bed];\
[3:a]adelay=${SCRATCH}|${SCRATCH},volume=0.55[scratch];\
[4:a]adelay=${SCRUB}|${SCRUB},volume=0.45[scrub];\
[5:a]adelay=${FIRE}|${FIRE},volume=0.7,afade=t=in:st=47.6:d=0.4,afade=t=out:st=51.3:d=1.5[fire];\
[6:a]asplit=2[h1][h2];\
[h1]adelay=${HB1}|${HB1},volume=0.30,afade=t=in:st=54.5:d=3,afade=t=out:st=61.5:d=2.5[hb1];\
[h2]adelay=${HB2}|${HB2},volume=0.30,afade=t=in:st=78.5:d=1.5[hb2];\
[vo][bed][scratch][scrub][fire][hb1][hb2]amix=inputs=7:duration=first:normalize=0,\
acompressor=threshold=-12dB:ratio=2:attack=20:release=300"

ffmpeg -y -v error $IN -filter_complex "${CHAIN}[flat]" -map "[flat]" -t "$D" -c:a pcm_s16le -f wav flat.wav
I=$(ffmpeg -nostats -i flat.wav -af ebur128 -f null - 2>&1 | grep -oP '^\s+I:\s+\K-?[\d.]+' | tail -1)
G=$(python3 -c "print(f'{10**((-15-($I))/20):.4f}')")
echo "flat I=${I} LUFS -> static gain x${G}"

ffmpeg -y -v error $IN -filter_complex "${CHAIN},volume=${G},alimiter=limit=0.9,volume=0.54:enable='lt(t,2.5)'[mix]" \
  -map 0:v -map "[mix]" -vf "ass=captions.ass" -t "$D" \
  -c:v libx264 -preset medium -crf 23 -maxrate 8M -bufsize 12M -pix_fmt yuv420p \
  -c:a aac -b:a 192k -movflags +faststart body.mp4

ffmpeg -y -v error -i body.mp4 -i ../endcards/endcard.mp4 \
  -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]" \
  -map "[v]" -map "[a]" -c:v libx264 -preset medium -crf 23 -maxrate 8M -bufsize 12M -pix_fmt yuv420p \
  -c:a aac -b:a 192k -movflags +faststart final-borley.mp4

ffmpeg -v error -i final-borley.mp4 -f null -
echo "FINAL: $(du -h final-borley.mp4|cut -f1) $(ffprobe -v quiet -show_entries format=duration -of csv=p=0 final-borley.mp4)s decode=CLEAN"
