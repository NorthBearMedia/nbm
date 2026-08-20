#!/bin/bash
# EP43 Busby Stoop Chair. Bed level $1 (LUFS), default -31.
set -e; cd "$(dirname "$0")"
BEDL=${1:--31}
D=85.57             # 0.3 lead + 83.67 tightened narration + ~1.6 tail
SCRAPE=900          # ms — chair scrape under "sat in the chair"
CRASH=4500          # ms — "the roof under him gave way" (4.63)
GIBBET=26300        # ms — creak under "left to rot on a post"
BOMBERS=36990       # ms — drone under the war passage
CHAIN=66200         # ms — "So they hung it on the wall" (66.35)
HB=77500            # ms — heartbeat into the close
GRADE="eq=saturation=0.72:contrast=1.07:brightness=-0.03,vignette=PI/4.5,noise=alls=5:allf=t"

mk(){ F=$(python3 -c "print(f'{$2/10.041667:.4f}')")
  ffmpeg -y -v error -i "$1.mp4" -vf "scale=1080:1920:flags=lanczos:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setpts=PTS*${F},$GRADE" -t "$2" -an -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "$3"; }

# The chair is the through-line: inn -> crossroads -> gibbet -> war -> museum wall.
mk s1-inn          11.82 c1.mp4   # 0     -> 11.82  builder / hitchhiker deaths
mk s2-crossroads    7.65 c2.mp4   # 11.82 -> 19.47  Thirsk / Dead Man's Chair
mk s1-inn           6.83 c3.mp4   # 19.47 -> 26.30  the inn / Busby hanged 1702
mk s6-gibbet       10.69 c4.mp4   # 26.30 -> 36.99  rot on a post / the curse
mk s3-taproom       9.61 c5.mp4   # 36.99 -> 46.60  bomber crews / did not come back
mk s1-inn           9.17 c6.mp4   # 46.60 -> 55.77  deaths kept coming / landlord's count
mk s4-museum-day   10.58 c7.mp4   # 55.77 -> 66.35  1978 / one condition / ever again
mk s5-museum-night 12.22 c8.mp4   # 66.35 -> 78.57  hung on the wall / still there / says no
mk s7-chair-close   7.00 c9.mp4   # 78.57 -> 85.57  "why is it still up on that wall?"

printf "file 'c1.mp4'\nfile 'c2.mp4'\nfile 'c3.mp4'\nfile 'c4.mp4'\nfile 'c5.mp4'\nfile 'c6.mp4'\nfile 'c7.mp4'\nfile 'c8.mp4'\nfile 'c9.mp4'\n" > concat.txt
ffmpeg -y -v error -f concat -safe 0 -i concat.txt -c copy video-main.mp4
echo "picture $(ffprobe -v quiet -show_entries format=duration -of csv=p=0 video-main.mp4)s"

ffmpeg -y -v error -i narration-tight.mp3 -af "loudnorm=I=-16:TP=-1.5:LRA=7" -c:a libmp3lame -q:a 2 narration.mp3
ffmpeg -y -v error -i bed-room.mp3 -af "acompressor=threshold=-30dB:ratio=6:attack=20:release=400,loudnorm=I=${BEDL}:TP=-2:LRA=2" -c:a libmp3lame -q:a 2 bed-final.mp3
ffmpeg -y -v error -i sfx-scrape.mp3   -af "loudnorm=I=-16:TP=-2:LRA=7" -c:a libmp3lame -q:a 2 scrape-norm.mp3
ffmpeg -y -v error -i sfx-crash.mp3    -af "loudnorm=I=-16:TP=-2:LRA=7" -c:a libmp3lame -q:a 2 crash-norm.mp3
ffmpeg -y -v error -i sfx-gibbet.mp3   -af "loudnorm=I=-16:TP=-2:LRA=7" -c:a libmp3lame -q:a 2 gibbet-norm.mp3
ffmpeg -y -v error -i sfx-bombers.mp3  -af "loudnorm=I=-16:TP=-2:LRA=7" -c:a libmp3lame -q:a 2 bombers-norm.mp3
ffmpeg -y -v error -i sfx-chain.mp3    -af "loudnorm=I=-16:TP=-2:LRA=7" -c:a libmp3lame -q:a 2 chain-norm.mp3
ffmpeg -y -v error -i sfx-heartbeat.mp3 -af "loudnorm=I=-16:TP=-2:LRA=7" -c:a libmp3lame -q:a 2 hb-norm.mp3

IN="-i video-main.mp4 -i narration.mp3 -stream_loop 5 -i bed-final.mp3 -i scrape-norm.mp3 -i crash-norm.mp3 -i gibbet-norm.mp3 -i bombers-norm.mp3 -i chain-norm.mp3 -stream_loop 3 -i hb-norm.mp3"
CHAIN_F="[1:a]adelay=300|300,apad,asplit=2[vo][key];\
[2:a]atrim=0:${D},afade=t=in:d=1.2,afade=t=out:st=$(echo "$D-3"|bc):d=3[bedraw];\
[bedraw][key]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=400[bed];\
[3:a]adelay=${SCRAPE}|${SCRAPE},volume=0.8[scrape];\
[4:a]adelay=${CRASH}|${CRASH},volume=0.65[crash];\
[5:a]adelay=${GIBBET}|${GIBBET},volume=0.5,afade=t=out:st=29.2:d=1.2[gib];\
[6:a]adelay=${BOMBERS}|${BOMBERS},volume=0.5,afade=t=in:st=36.99:d=1.5,afade=t=out:st=43:d=2[bmb];\
[7:a]adelay=${CHAIN}|${CHAIN},volume=0.6[chn];\
[8:a]adelay=${HB}|${HB},volume=0.30,afade=t=in:st=77.5:d=1.5[hb];\
[vo][bed][scrape][crash][gib][bmb][chn][hb]amix=inputs=8:duration=first:normalize=0,\
acompressor=threshold=-12dB:ratio=2:attack=20:release=300"

ffmpeg -y -v error $IN -filter_complex "${CHAIN_F}[flat]" -map "[flat]" -t "$D" -c:a pcm_s16le -f wav flat.wav
I=$(ffmpeg -nostats -i flat.wav -af ebur128 -f null - 2>&1 | grep -oP '^\s+I:\s+\K-?[\d.]+' | tail -1)
G=$(python3 -c "print(f'{10**((-15-($I))/20):.4f}')")
echo "flat I=${I} LUFS -> static gain x${G}"

ffmpeg -y -v error $IN -filter_complex "${CHAIN_F},volume=${G},alimiter=limit=0.9,volume=0.54:enable='lt(t,2.5)'[mix]" \
  -map 0:v -map "[mix]" -vf "ass=captions.ass" -t "$D" \
  -c:v libx264 -preset medium -crf 23 -maxrate 8M -bufsize 12M -pix_fmt yuv420p \
  -c:a aac -b:a 192k -movflags +faststart body.mp4

ffmpeg -y -v error -i body.mp4 -i ../endcards/endcard.mp4 \
  -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]" \
  -map "[v]" -map "[a]" -c:v libx264 -preset medium -crf 23 -maxrate 8M -bufsize 12M -pix_fmt yuv420p \
  -c:a aac -b:a 192k -movflags +faststart final-busby.mp4

ffmpeg -v error -i final-busby.mp4 -f null -
echo "FINAL: $(du -h final-busby.mp4|cut -f1) $(ffprobe -v quiet -show_entries format=duration -of csv=p=0 final-busby.mp4)s decode=CLEAN"
