#!/bin/bash
# EP44 Black Shuck. Bed level $1 (LUFS), default -31.
set -e; cd "$(dirname "$0")"
BEDL=${1:--31}
D=85.31             # 0.3 lead + 83.44 narration (last word 83.71) + ~1.6 tail
THUNDER=300         # ms — storm image sound, cold open
GROWL=3400          # ms — "A black dog" (3.55)
SCORCH=9360         # ms — "burned its claw-marks" + door cut
BELL=31800          # ms — "They gave it a name." (31.88)
DIG=53800           # ms — "In twenty fourteen" (53.82)
HB=78500            # ms — heartbeat into the close
GRADE="eq=saturation=0.72:contrast=1.07:brightness=-0.03,vignette=PI/4.5,noise=alls=5:allf=t"

mk(){ F=$(python3 -c "print(f'{$2/10.041667:.4f}')")
  ffmpeg -y -v error -i "$1.mp4" -vf "scale=1080:1920:flags=lanczos:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setpts=PTS*${F},$GRADE" -t "$2" -an -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "$3"; }
mktrim(){ ffmpeg -y -v error -ss "$2" -i "$1.mp4" -vf "scale=1080:1920:flags=lanczos:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setpts=PTS-STARTPTS,$GRADE" -t "$3" -an -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "$4"; }

# Door and marsh dog each appear twice; the dog closes the episode.
mk s1-aisle        9.36 c1.mp4    # 0     -> 9.36   the dog in the aisle / the kills
mktrim s3-door 0   4.54 c2.mp4    # 9.36  -> 13.90  claw-marks burned into the door
mk s2-church       8.44 c3.mp4    # 13.90 -> 22.34  Blythburgh / Suffolk / 1577 storm
mk s1-aisle        9.26 c4.mp4    # 22.34 -> 31.60  the pamphlet / second church / dead at prayer
mk s6-door-night  11.90 c5.mp4    # 31.60 -> 43.50  Black Shuck named / the omen
mk s4-marsh       10.00 c6.mp4    # 43.50 -> 53.50  never stopped seeing him / treeline
mk s5-dig         11.40 c7.mp4    # 53.50 -> 64.90  2014 skeleton / the papers
mk s3-door         9.10 c8.mp4    # 64.90 -> 74.00  door still there / devil's fingerprints
mktrim s6-door-night 0 5.90 c9.mp4 # 74.00 -> 79.90 put your hand where it burned
mktrim s4-marsh 4.60 5.41 c10.mp4 # 79.90 -> 85.31  "If you see the dog, you have a year."

printf "file 'c1.mp4'\nfile 'c2.mp4'\nfile 'c3.mp4'\nfile 'c4.mp4'\nfile 'c5.mp4'\nfile 'c6.mp4'\nfile 'c7.mp4'\nfile 'c8.mp4'\nfile 'c9.mp4'\nfile 'c10.mp4'\n" > concat.txt
ffmpeg -y -v error -f concat -safe 0 -i concat.txt -c copy video-main.mp4
echo "picture $(ffprobe -v quiet -show_entries format=duration -of csv=p=0 video-main.mp4)s"

ffmpeg -y -v error -i narration-tight.mp3 -af "loudnorm=I=-16:TP=-1.5:LRA=7" -c:a libmp3lame -q:a 2 narration.mp3
ffmpeg -y -v error -i bed-room.mp3 -af "acompressor=threshold=-30dB:ratio=6:attack=20:release=400,loudnorm=I=${BEDL}:TP=-2:LRA=2" -c:a libmp3lame -q:a 2 bed-final.mp3
for s in thunder growl scorch bell dig heartbeat; do
  ffmpeg -y -v error -i sfx-$s.mp3 -af "loudnorm=I=-16:TP=-2:LRA=7" -c:a libmp3lame -q:a 2 $s-norm.mp3
done

IN="-i video-main.mp4 -i narration.mp3 -stream_loop 5 -i bed-final.mp3 -i thunder-norm.mp3 -i growl-norm.mp3 -i scorch-norm.mp3 -i bell-norm.mp3 -i dig-norm.mp3 -stream_loop 3 -i heartbeat-norm.mp3"
CHAIN_F="[1:a]adelay=300|300,apad,asplit=2[vo][key];\
[2:a]atrim=0:${D},afade=t=in:d=1.2,afade=t=out:st=$(echo "$D-3"|bc):d=3[bedraw];\
[bedraw][key]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=400[bed];\
[3:a]adelay=${THUNDER}|${THUNDER},volume=0.75[thn];\
[4:a]adelay=${GROWL}|${GROWL},volume=0.5[grl];\
[5:a]adelay=${SCORCH}|${SCORCH},volume=0.6[sco];\
[6:a]adelay=${BELL}|${BELL},volume=0.5[bel];\
[7:a]adelay=${DIG}|${DIG},volume=0.45,afade=t=out:st=57:d=1.5[dig];\
[8:a]adelay=${HB}|${HB},volume=0.30,afade=t=in:st=78.5:d=1.5[hb];\
[vo][bed][thn][grl][sco][bel][dig][hb]amix=inputs=8:duration=first:normalize=0,\
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
  -c:a aac -b:a 192k -movflags +faststart final-shuck.mp4

ffmpeg -v error -i final-shuck.mp4 -f null -
echo "FINAL: $(du -h final-shuck.mp4|cut -f1) $(ffprobe -v quiet -show_entries format=duration -of csv=p=0 final-shuck.mp4)s decode=CLEAN"
