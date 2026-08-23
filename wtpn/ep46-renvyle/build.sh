#!/bin/bash
# EP46 Renvyle House. Bed level $1 (LUFS), default -31.
set -e; cd "$(dirname "$0")"
BEDL=${1:--31}
D=82.71             # 0.3 lead + 80.95 narration (last word 81.21) + 1.5 tail
DOORSTRAIN=300      # ms — men pushing, cold open
DOORSWING=7590      # ms — "Then it swung open on its own" (7.59)
FOOTSTEPS=26510     # ms — "Footsteps crossed the upstairs rooms" (26.51)
WHOOSH=38870        # ms — "His wife saw the thing come through" (38.87)
FIRE=56760          # ms — "In nineteen twenty-three the house burned" (56.76)
HB=75900            # ms — heartbeat into the close
GRADE="eq=saturation=0.72:contrast=1.07:brightness=-0.03,vignette=PI/4.5,noise=alls=5:allf=t"

mk(){ F=$(python3 -c "print(f'{$2/10.041667:.4f}')")
  ffmpeg -y -v error -i "$1.mp4" -vf "scale=1080:1920:flags=lanczos:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setpts=PTS*${F},$GRADE" -t "$2" -an -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "$3"; }
mktrim(){ ffmpeg -y -v error -ss "$2" -i "$1.mp4" -vf "scale=1080:1920:flags=lanczos:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setpts=PTS-STARTPTS,$GRADE" -t "$3" -an -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "$4"; }

# Séance room empty -> boy is the reveal; the boy takes the close.
mk s1-door          9.50 c1.mp4    # 0     -> 9.50   the door pushes back / swings open
mk s2-house         7.40 c2.mp4    # 9.50  -> 16.90  Renvyle / Connemara / Atlantic
mk s4a-room         9.50 c3.mp4    # 16.90 -> 26.40  surgeon / Yeats / both wrote it down
mk s3-corridor      8.00 c4.mp4    # 26.40 -> 34.40  footsteps / servants would not stay
mktrim s4a-room 5.5 4.30 c5.mp4    # 34.40 -> 38.70  Yeats sat a vigil
mk s4b-room-boy    12.90 c6.mp4    # 38.70 -> 51.60  the boy / luminous eyes / a Blake child
mktrim s1-door 5.0  4.90 c7.mp4    # 51.60 -> 56.50  one grievance: strangers in his house
mk s5-fire          9.50 c8.mp4    # 56.50 -> 66.00  1923 fire / rebuilt / new name
mk s6-hotel         7.00 c9.mp4    # 66.00 -> 73.00  it did not help / book a room tonight
mk s4b-room-boy     9.71 c10.mp4   # 73.00 -> 82.71  "he does not like strangers... that is what you are"

printf "file 'c1.mp4'\nfile 'c2.mp4'\nfile 'c3.mp4'\nfile 'c4.mp4'\nfile 'c5.mp4'\nfile 'c6.mp4'\nfile 'c7.mp4'\nfile 'c8.mp4'\nfile 'c9.mp4'\nfile 'c10.mp4'\n" > concat.txt
ffmpeg -y -v error -f concat -safe 0 -i concat.txt -c copy video-main.mp4
echo "picture $(ffprobe -v quiet -show_entries format=duration -of csv=p=0 video-main.mp4)s"

ffmpeg -y -v error -i narration-tight.mp3 -af "loudnorm=I=-16:TP=-1.5:LRA=7" -c:a libmp3lame -q:a 2 narration.mp3
ffmpeg -y -v error -i bed-room.mp3 -af "acompressor=threshold=-30dB:ratio=6:attack=20:release=400,loudnorm=I=${BEDL}:TP=-2:LRA=2" -c:a libmp3lame -q:a 2 bed-final.mp3
for s in doorstrain doorswing footsteps whoosh fire heartbeat; do
  ffmpeg -y -v error -i sfx-$s.mp3 -af "loudnorm=I=-16:TP=-2:LRA=7" -c:a libmp3lame -q:a 2 $s-norm.mp3
done

IN="-i video-main.mp4 -i narration.mp3 -stream_loop 5 -i bed-final.mp3 -i doorstrain-norm.mp3 -i doorswing-norm.mp3 -i footsteps-norm.mp3 -i whoosh-norm.mp3 -i fire-norm.mp3 -stream_loop 3 -i heartbeat-norm.mp3"
CHAIN_F="[1:a]adelay=300|300,apad,asplit=2[vo][key];\
[2:a]atrim=0:${D},afade=t=in:d=1.2,afade=t=out:st=$(echo "$D-3"|bc):d=3[bedraw];\
[bedraw][key]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=400[bed];\
[3:a]adelay=${DOORSTRAIN}|${DOORSTRAIN},volume=0.7[dst];\
[4:a]adelay=${DOORSWING}|${DOORSWING},volume=0.6[dsw];\
[5:a]adelay=${FOOTSTEPS}|${FOOTSTEPS},volume=0.55[fts];\
[6:a]adelay=${WHOOSH}|${WHOOSH},volume=0.6[whs];\
[7:a]adelay=${FIRE}|${FIRE},volume=0.6,afade=t=in:st=56.76:d=0.4,afade=t=out:st=60.5:d=1.5[fir];\
[8:a]adelay=${HB}|${HB},volume=0.30,afade=t=in:st=75.9:d=1.5[hb];\
[vo][bed][dst][dsw][fts][whs][fir][hb]amix=inputs=8:duration=first:normalize=0,\
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
  -c:a aac -b:a 192k -movflags +faststart final-renvyle.mp4

ffmpeg -v error -i final-renvyle.mp4 -f null -
echo "FINAL: $(du -h final-renvyle.mp4|cut -f1) $(ffprobe -v quiet -show_entries format=duration -of csv=p=0 final-renvyle.mp4)s decode=CLEAN"
