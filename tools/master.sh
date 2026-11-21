#!/usr/bin/env bash
# Loudness for social: -14 LUFS integrated, -1 dBTP peak. Video stream is copied untouched.
#   tools/master.sh out/ep001-two-sum.mp4   ->  out/ep001-two-sum.final.mp4
set -euo pipefail
in="$1"; out="${in%.mp4}.final.mp4"
ffmpeg -v error -y -i "$in" -c:v copy -af "loudnorm=I=-14:TP=-1.0:LRA=9" -ar 48000 -c:a aac -b:a 192k -movflags +faststart "$out"
echo "$out"
