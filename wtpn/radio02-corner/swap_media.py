#!/usr/bin/env python3
"""Swap the media on the armed Transmission 02 post (440507769) for the re-cut (warning + new captions + new
title), with a dedicated cover image (user: "a good thumbnail, not a blank screen") and the caption as it now
stands. Same ingestion rule as publish.py: saveExternalMediaFiles, then GET until the media is on
static.metricool.com."""
import json, os, pathlib, subprocess, sys, time, urllib.request
D = pathlib.Path(__file__).parent; BLOG, UID, PID = "6562751", "3883072", 440507769
def api(method, path, body=None):
    u = f"https://app.metricool.com/api{path}{'&' if '?' in path else '?'}blogId={BLOG}&userId={UID}"
    r = urllib.request.Request(u, method=method, data=json.dumps(body).encode() if body is not None else None,
                               headers={"X-Mc-Auth": "proxy-injected", "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=180) as resp: return json.load(resp)
env = dict(os.environ, METRICOOL_TOKEN="proxy-injected", METRICOOL_BRAND_ID=BLOG, METRICOOL_USER_ID=UID)
def up(f): return subprocess.run([sys.executable, str(D.parent / "tools" / "mc_upload.py"), str(D / f)], env=env,
                                 check=True, capture_output=True, text=True).stdout.strip()
vid, cov = up("transmission02-part1-social.mp4"), up("cover-transmission02.jpg")
print("uploaded video:", vid[:70], "\nuploaded cover:", cov[:70])
p = api("GET", f"/v2/scheduler/posts/{PID}")["data"]
json.dump(p, open(D / "post_before_swap.json", "w"), indent=1)
body = {k: p[k] for k in ("providers", "publicationDate", "autoPublish", "draft", "tiktokData", "instagramData", "facebookData", "youtubeData") if k in p}
body["providers"] = [{"network": x["network"]} for x in p["providers"]]
body.update({"id": PID, "text": (D / "caption.txt").read_text().strip(), "media": [vid], "videoThumbnailUrl": cov,
             "videoCoverMilliseconds": 5800,          # fallback where a frame is used: the title (5.8 s, after the warning)
             "saveExternalMediaFiles": True, "draft": False})
r = api("PUT", f"/v2/scheduler/posts/{PID}", body); print("PUT ok" if r.get("data") else r)
for attempt in range(12):
    time.sleep(5)
    q = api("GET", f"/v2/scheduler/posts/{PID}")["data"]
    m = q.get("media") or []
    if m and "static.metricool.com" in str(m[0]) and m[0] != p["media"][0]: break
json.dump(q, open(D / "published_post.json", "w"), indent=1)
print("media:", q.get("media")); print("thumbnail:", q.get("videoThumbnailUrl")); print("cover ms:", q.get("videoCoverMilliseconds"))
print("when:", q.get("publicationDate")); print("providers:", [(x["network"], x["status"]) for x in q["providers"]])
print("text:", q.get("text", "")[:70].replace("\n", " "))
for k in ("tiktokData", "instagramData", "facebookData", "youtubeData"): print(k, json.dumps(q.get(k))[:160])
