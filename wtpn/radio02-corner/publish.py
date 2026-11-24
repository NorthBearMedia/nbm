#!/usr/bin/env python3
"""Upload the social master to Metricool and schedule it to the WTPN brand (TikTok, Instagram,
Facebook, YouTube). The Metricool token is injected by the session proxy (X-Mc-Auth), so it never
appears here. Follows the bible's ingestion rule: create the post immediately after upload with
saveExternalMediaFiles, then GET it and confirm media moved to static.metricool.com.
Usage: publish.py <video.mp4> <YYYY-MM-DDTHH:MM:SS (Europe/London)>"""
import json, os, pathlib, subprocess, sys, time, urllib.request
D = pathlib.Path(__file__).parent
BLOG, UID = "6562751", "3883072"
video, when = sys.argv[1], sys.argv[2]

def api(method, path, body=None):
    u = f"https://app.metricool.com/api{path}{'&' if '?' in path else '?'}blogId={BLOG}&userId={UID}"
    r = urllib.request.Request(u, method=method, data=json.dumps(body).encode() if body is not None else None,
                               headers={"X-Mc-Auth": "proxy-injected", "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=180) as resp:
        return json.load(resp)

env = dict(os.environ, METRICOOL_TOKEN="proxy-injected", METRICOOL_BRAND_ID=BLOG, METRICOOL_USER_ID=UID)
url = subprocess.run([sys.executable, str(D.parent / "tools" / "mc_upload.py"), video], env=env,
                     check=True, capture_output=True, text=True).stdout.strip()
print("uploaded:", url[:80])

body = {
    "providers": [{"network": "tiktok"}, {"network": "instagram"}, {"network": "facebook"}, {"network": "youtube"}],
    "publicationDate": {"dateTime": when, "timezone": "Europe/London"},
    "text": (D / "caption.txt").read_text().strip(), "media": [url],
    "autoPublish": True, "draft": False, "saveExternalMediaFiles": True,
    "videoCoverMilliseconds": 2400,          # the HILL FARM / CO. MAYO title over the kitchen
    "tiktokData": {"disableComment": False, "disableDuet": False, "disableStitch": False,
                   "privacyOption": "PUBLIC_TO_EVERYONE", "isAigc": True,
                   "isBrandContent": False, "isBrandOrganic": False},
    # the v2 API reads "type" / "showReelOnFeed"; the old "postType" was silently ignored and stored POST
    "instagramData": {"type": "REEL", "showReelOnFeed": True, "isAiGenerated": True},
    "facebookData": {"type": "REEL"},
    "youtubeData": {"title": "Irish Farm Radio, 3 A.M.: Something Got In With the Ewes | Transmission Part 1",
                    "type": "SHORT", "privacy": "public", "madeForKids": False, "isAiGeneratedContent": True,
                    "tags": ["irish farm", "radio horror", "audio drama", "county mayo", "scary story",
                             "horror short", "transmission", "where the path narrows"]},
}
pid = api("POST", "/v2/scheduler/posts", body)["data"]["id"]
print("created post", pid)
for attempt in range(8):
    time.sleep(5)
    p = api("GET", f"/v2/scheduler/posts/{pid}")["data"]
    m = p.get("media") or []
    print(f"  check {attempt + 1}: media={str(m[:1])[:90]}")
    if m and "static.metricool.com" in str(m[0]):
        print("INGESTED OK ->", pid); break
else:
    print("!! NOT INGESTED: delete and recreate while the upload URL is fresh")
json.dump(p, open(D / "published_post.json", "w"), indent=1)
keep = {k: p.get(k) for k in ("id", "uuid", "publicationDate", "providers", "videoCoverMilliseconds")}
keep.update({k: p.get(k) for k in ("tiktokData", "instagramData", "facebookData", "youtubeData")})
print(json.dumps(keep, indent=1)[:2500])
