#!/bin/bash
# TikTok per-video stats WITHOUT the (flaky) list endpoint. 23 Aug 2026.
# 1) Embed page lists video IDs + playCounts server-side (list API is often blocked, this isn't):
#      curl -A "$UA" https://www.tiktok.com/embed/@wherethepathnarrows   -> grep 'video/[0-9]*', '"playCount":[0-9]*'
# 2) Single-video pages carry FULL stats server-side:
#      curl -A "$UA" https://www.tiktok.com/@wherethepathnarrows/video/<id> \
#        | grep -o '"diggCount":[0-9]*\|"shareCount":[0-9]*\|"playCount":[0-9]*\|"commentCount":[0-9]*' | head -4
# TikTok video IDs are chronological — sort to find newest. Sleep 3s between fetches.
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
curl -s --max-time 40 -A "$UA" "https://www.tiktok.com/embed/@wherethepathnarrows" | grep -o 'video/[0-9]\{15,\}' | sort -u
