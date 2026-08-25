#!/usr/bin/env python3
"""mc_upload.py (rebuilt 25 Aug 2026 from the Metricool swagger spec).
Uploads a video to Metricool's S3 via /v2/media/s3/upload-transactions and
prints the final fileUrl for use as `media` in scheduler posts.
Usage: mc_upload.py <file.mp4>   (requires METRICOOL_* env vars)"""
import os, sys, json, hashlib, base64, math, urllib.request

TOKEN = os.environ["METRICOOL_TOKEN"]
BLOG = os.environ["METRICOOL_BRAND_ID"]
UID = os.environ["METRICOOL_USER_ID"]
BASE = "https://app.metricool.com/api"
PART = 8 * 1024 * 1024

def api(method, path, body=None):
    url = f"{BASE}{path}{'&' if '?' in path else '?'}blogId={BLOG}&userId={UID}"
    r = urllib.request.Request(url, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"X-Mc-Auth": TOKEN, "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=120) as resp:
        return json.load(resp)

path = sys.argv[1]
data = open(path, "rb").read()
size = len(data)
nparts = max(1, math.ceil(size / PART))
parts = []
for i in range(nparts):
    a, b = i * PART, min(size, (i + 1) * PART)
    h = base64.b64encode(hashlib.sha256(data[a:b]).digest()).decode()
    parts.append({"size": b - a, "startByte": a, "endByte": b, "hash": h})

tx = api("PUT", "/v2/media/s3/upload-transactions", {
    "resourceType": "planner", "contentType": "video/mp4",
    "fileExtension": "mp4", "parts": parts})["data"]
sys.stderr.write(f"transaction: type={tx['uploadType']} key={tx['key']}\n")

if tx["uploadType"] == "SIMPLE":
    r = urllib.request.Request(tx["presignedUrl"], data=data, method="PUT",
        headers={"Content-Type": "video/mp4", "x-amz-checksum-sha256": parts[0]["hash"]})
    with urllib.request.urlopen(r, timeout=600) as resp:
        resp.read()
    done = api("PATCH", "/v2/media/s3/upload-transactions",
               {"simple": {"fileUrl": tx["fileUrl"]}})["data"]
else:
    etags = []
    for p in tx["parts"]:
        n = p.get("partNumber") or (tx["parts"].index(p) + 1)
        a, b = (n - 1) * PART, min(size, n * PART)
        req = urllib.request.Request(p["presignedUrl"] if "presignedUrl" in p else p["url"],
            data=data[a:b], method="PUT",
            headers={"Content-Type": "video/mp4", "x-amz-checksum-sha256": parts[n - 1]["hash"]})
        with urllib.request.urlopen(req, timeout=600) as resp:
            etag = resp.headers.get("ETag", "").strip('"')
        etags.append({"partNumber": n, "etag": etag})
        sys.stderr.write(f"part {n}/{nparts} uploaded\n")
    done = api("PATCH", "/v2/media/s3/upload-transactions",
               {"multipart": {"uploadId": tx["uploadId"], "key": tx["key"], "parts": etags}})["data"]

print(done.get("fileUrl") or done.get("url") or json.dumps(done))
