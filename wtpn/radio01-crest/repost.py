#!/usr/bin/env python3
"""Re-post Transmission 01 (user, 25 Nov: the first post "did shit"; re-cut with Corner's changes and go again).
Cover first: Metricool only copies `media` to permanent storage, so the cover rides in as a throwaway draft's
media, and its static.metricool.com URL becomes the post's videoThumbnailUrl. Then the video, with the same
ingestion rule as publish.py (saveExternalMediaFiles, GET until the media is on static.metricool.com).
Usage: repost.py <YYYY-MM-DDTHH:MM:SS Europe/London>"""
import json, os, pathlib, subprocess, sys, time, urllib.request
D = pathlib.Path(__file__).parent; BLOG, UID = "6562751", "3883072"; when = sys.argv[1]
def api(method, path, body=None):
    u = f"https://app.metricool.com/api{path}{'&' if '?' in path else '?'}blogId={BLOG}&userId={UID}"
    r = urllib.request.Request(u, method=method, data=json.dumps(body).encode() if body is not None else None,
                               headers={"X-Mc-Auth": "proxy-injected", "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=180) as resp:
        t = resp.read(); return json.loads(t) if t else {}
env = dict(os.environ, METRICOOL_TOKEN="proxy-injected", METRICOOL_BRAND_ID=BLOG, METRICOOL_USER_ID=UID)
def up(f): return subprocess.run([sys.executable, str(D.parent / "tools" / "mc_upload.py"), str(D / f)], env=env,
                                 check=True, capture_output=True, text=True).stdout.strip()
def ingested(pid):
    for _ in range(12):
        time.sleep(5); m = api("GET", f"/v2/scheduler/posts/{pid}")["data"].get("media") or []
        if m and "static.metricool.com" in m[0]: return m[0]
# 1) the cover, made permanent through a throwaway draft
draft = api("POST", "/v2/scheduler/posts", {"providers": [{"network": "instagram"}], "draft": True, "autoPublish": False,
             "publicationDate": {"dateTime": "2026-12-31T12:00:00", "timezone": "Europe/London"},
             "text": "cover holder - delete", "media": [up("cover-transmission01.jpg")], "saveExternalMediaFiles": True})["data"]["id"]
cover = ingested(draft); api("DELETE", f"/v2/scheduler/posts/{draft}")
if not cover: sys.exit("cover not ingested")
print("cover:", cover)
# 2) the post
body = {
    "providers": [{"network": "tiktok"}, {"network": "instagram"}, {"network": "facebook"}, {"network": "youtube"}],
    "publicationDate": {"dateTime": when, "timezone": "Europe/London"},
    "text": (D / "caption.txt").read_text().strip(), "media": [up("transmission01-part1-social.mp4")],
    "autoPublish": True, "draft": False, "saveExternalMediaFiles": True,
    "videoThumbnailUrl": cover, "videoCoverMilliseconds": 5800,     # fallback frame: the title, after the warning
    "tiktokData": {"disableComment": False, "disableDuet": False, "disableStitch": False,
                   "privacyOption": "PUBLIC_TO_EVERYONE", "isAigc": True, "isBrandContent": False, "isBrandOrganic": False},
    "instagramData": {"type": "REEL", "showReelOnFeed": True, "isAiGenerated": True},
    "facebookData": {"type": "REEL"},
    "youtubeData": {"title": "Mountain Rescue Radio: Nobody Was Reported Missing | Transmission Part 1",
                    "type": "SHORT", "privacy": "public", "madeForKids": False, "isAiGeneratedContent": True,
                    "tags": ["mountain rescue", "radio horror", "audio drama", "cairngorms", "scary story",
                             "horror short", "transmission", "where the path narrows"]},
}
pid = api("POST", "/v2/scheduler/posts", body)["data"]["id"]; print("created post", pid)
vid = ingested(pid); print("INGESTED OK ->", vid if vid else "!! NOT INGESTED: delete and recreate")
p = api("GET", f"/v2/scheduler/posts/{pid}")["data"]; json.dump(p, open(D / "published_post.json", "w"), indent=1)
print({k: p.get(k) for k in ("id", "publicationDate", "videoThumbnailUrl", "videoCoverMilliseconds")})
print([(x["network"], x["status"]) for x in p["providers"]])
