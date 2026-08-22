#!/bin/bash
# EP45 Sauchie Poltergeist 1960. Bed level $1 (LUFS), default -31.
set -e; cd "$(dirname "$0")"
BEDL=${1:--31}
D=81.69             # 0.3 lead + 79.93 narration (last word 80.19) + 1.5 tail
DESKLID=500         # ms — desk lid, cold open image sound
KNOCKS=24830        # ms — "The knocking followed her" (24.83)
SCRAPE=28210        # ms — sideboard (28.21)
TAPE=41500          # ms — "They tape-recorded the knocking" + recorder cut
DESKGROAN=49080     # ms — "watched Virginia's desk lift" (49.08)
HB=74000            # ms — heartbeat into the close
GRADE="eq=saturation=0.72:contrast=1.07:brightness=-0.03,vignette=PI/4.5,noise=alls=5:allf=t"

mk(){ F=$(python3 -c "print(f'{$2/10.041667:.4f}')")
  ffmpeg -y -v error -i "$1.mp4" -vf "scale=1080:1920:flags=lanczos:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setpts=PTS*${F},$GRADE" -t "$2" -an -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "$3"; }
mktrim(){ ffmpeg -y -v error -ss "$2" -i "$1.mp4" -vf "scale=1080:1920:flags=lanczos:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setpts=PTS-STARTPTS,$GRADE" -t "$3" -an -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "$4"; }

# The classroom is the icon (x3); the street bookends; the recorder is the evidence.
mk s1-classroom   10.40 c1.mp4    # 0     -> 10.40  desk lid rises / nobody moved
mk s2-street      11.20 c2.mp4    # 10.40 -> 21.60  Sauchie / 1960 / Virginia
mk s3-parlour     10.90 c3.mp4    # 21.60 -> 32.50  knocking / sideboard
mk s4-bedroom      9.00 c4.mp4    # 32.50 -> 41.50  doctors / minister / chest
mktrim s5-recorder 0 5.40 c5.mp4  # 41.50 -> 46.90  tape-recorded / BBC broadcast
mk s1-classroom    8.30 c6.mp4    # 46.90 -> 55.20  desk lift / Miss Stewart
mk s6-house-night  6.70 c7.mp4    # 55.20 -> 61.90  prayed / faded / never explained
mk s1-classroom    8.00 c8.mp4    # 61.90 -> 69.90  two doctors... twenty children
mktrim s5-recorder 5.4 4.10 c9.mp4 # 69.90 -> 74.00 recording still exists / street still there
mk s2-street       7.69 c10.mp4   # 74.00 -> 81.69  what followed Virginia / where it went next

printf "file 'c1.mp4'\nfile 'c2.mp4'\nfile 'c3.mp4'\nfile 'c4.mp4'\nfile 'c5.mp4'\nfile 'c6.mp4'\nfile 'c7.mp4'\nfile 'c8.mp4'\nfile 'c9.mp4'\nfile 'c10.mp4'\n" > concat.txt
ffmpeg -y -v error -f concat -safe 0 -i concat.txt -c copy video-main.mp4
echo "picture $(ffprobe -v quiet -show_entries format=duration -of csv=p=0 video-main.mp4)s"

ffmpeg -y -v error -i narration-tight.mp3 -af "loudnorm=I=-16:TP=-1.5:LRA=7" -c:a libmp3lame -q:a 2 narration.mp3
ffmpeg -y -v error -i bed-room.mp3 -af "acompressor=threshold=-30dB:ratio=6:attack=20:release=400,loudnorm=I=${BEDL}:TP=-2:LRA=2" -c:a libmp3lame -q:a 2 bed-final.mp3
for s in desklid knocks scrape tape deskgroan heartbeat; do
  ffmpeg -y -v error -i sfx-$s.mp3 -af "loudnorm=I=-16:TP=-2:LRA=7" -c:a libmp3lame -q:a 2 $s-norm.mp3
done

IN="-i video-main.mp4 -i narration.mp3 -stream_loop 5 -i bed-final.mp3 -i desklid-norm.mp3 -i knocks-norm.mp3 -i scrape-norm.mp3 -i tape-norm.mp3 -i deskgroan-norm.mp3 -stream_loop 3 -i heartbeat-norm.mp3"
CHAIN_F="[1:a]adelay=300|300,apad,asplit=2[vo][key];\
[2:a]atrim=0:${D},afade=t=in:d=1.2,afade=t=out:st=$(echo "$D-3"|bc):d=3[bedraw];\
[bedraw][key]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=400[bed];\
[3:a]adelay=${DESKLID}|${DESKLID},volume=0.7[lid];\
[4:a]adelay=${KNOCKS}|${KNOCKS},volume=0.6[knk];\
[5:a]adelay=${SCRAPE}|${SCRAPE},volume=0.55[scr];\
[6:a]adelay=${TAPE}|${TAPE},volume=0.55,afade=t=out:st=45.5:d=1.2[tpe];\
[7:a]adelay=${DESKGROAN}|${DESKGROAN},volume=0.55[grn];\
[8:a]adelay=${HB}|${HB},volume=0.30,afade=t=in:st=74:d=1.5[hb];\
[vo][bed][lid][knk][scr][tpe][grn][hb]amix=inputs=8:duration=first:normalize=0,\
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
  -c:a aac -b:a 192k -movflags +faststart final-sauchie.mp4

ffmpeg -v error -i final-sauchie.mp4 -f null -
echo "FINAL: $(du -h final-sauchie.mp4|cut -f1) $(ffprobe -v quiet -show_entries format=duration -of csv=p=0 final-sauchie.mp4)s decode=CLEAN"
