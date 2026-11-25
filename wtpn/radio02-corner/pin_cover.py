#!/usr/bin/env python3
"""Metricool copies `media` into static.metricool.com on save, but not `videoThumbnailUrl` (it stayed on
metricool-temp, which expires). So: ingest the cover through a throwaway draft's `media`, point the armed
post's videoThumbnailUrl at that permanent copy, then delete the draft."""
import json, os, pathlib, subprocess, sys, time, urllib.request, urllib.error
D = pathlib.Path(__file__).parent; BLOG, UID = "6562751", "3883072"
def api(method, path, body=None):
    u = f"https://app.metricool.com/api{path}{'&' if '?' in path else '?'}blogId={BLOG}&userId={UID}"
    r = urllib.request.Request(u, method=method, data=json.dumps(body).encode() if body is not None else None,
                               headers={"X-Mc-Auth": "proxy-injected", "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=180) as resp:
        t = resp.read(); return json.loads(t) if t else {}
env = dict(os.environ, METRICOOL_TOKEN="proxy-injected", METRICOOL_BRAND_ID=BLOG, METRICOOL_USER_ID=UID)
cov = subprocess.run([sys.executable, str(D.parent / "tools" / "mc_upload.py"), str(D / "cover-transmission02.jpg")], env=env,
                     check=True, capture_output=True, text=True).stdout.strip()
draft = api("POST", "/v2/scheduler/posts", {"providers": [{"network": "instagram"}], "draft": True, "autoPublish": False,
             "publicationDate": {"dateTime": "2026-12-31T12:00:00", "timezone": "Europe/London"},
             "text": "cover holder - delete", "media": [cov], "saveExternalMediaFiles": True})["data"]["id"]
static = None
for _ in range(12):
    time.sleep(5); m = api("GET", f"/v2/scheduler/posts/{draft}")["data"].get("media") or []
    if m and "static.metricool.com" in m[0]: static = m[0]; break
print("draft", draft, "-> cover", static)
if not static: sys.exit("cover not ingested; draft left in place for inspection")
posts = api("GET", "/v2/scheduler/posts?start=2026-11-25T00:00:00&end=2026-11-26T00:00:00&timezone=Europe/London")["data"]
p = next(x for x in posts if x["publicationDate"]["dateTime"].startswith("2026-11-25T22:30") and "Corner" in x.get("text", ""))
pid = p["id"]
body = {k: p[k] for k in ("publicationDate", "autoPublish", "draft", "text", "media", "videoCoverMilliseconds",
                          "tiktokData", "instagramData", "facebookData", "youtubeData") if k in p}
body.update({"id": pid, "providers": [{"network": x["network"]} for x in p["providers"]], "videoThumbnailUrl": static,
             "saveExternalMediaFiles": True})
api("PUT", f"/v2/scheduler/posts/{pid}", body)
time.sleep(4)
posts = api("GET", "/v2/scheduler/posts?start=2026-11-25T00:00:00&end=2026-11-26T00:00:00&timezone=Europe/London")["data"]
q = [x for x in posts if x["publicationDate"]["dateTime"].startswith("2026-11-25T22:30")]
for x in q:
    print(x["id"], x["publicationDate"]["dateTime"], "| media", x["media"][0][-40:], "| thumb", x.get("videoThumbnailUrl"),
          "| cover ms", x.get("videoCoverMilliseconds"), "|", [(y["network"], y["status"]) for y in x["providers"]])
json.dump(q, open(D / "published_post.json", "w"), indent=1)
try: api("DELETE", f"/v2/scheduler/posts/{draft}"); print("draft", draft, "deleted")
except urllib.error.HTTPError as e: print("draft delete:", e.code)
