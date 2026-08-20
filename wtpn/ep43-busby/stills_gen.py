import json, os, time, urllib.request, pathlib

D = pathlib.Path(__file__).parent
KEY = os.environ["FAL_KEY"]

P = {
 "s1-inn": "Vertical portrait night photograph taken from standing eye level looking straight across a dim seventeenth-century English inn corner, low beamed ceiling at the top of frame, worn stone-flag floor at the bottom. A single heavy dark oak armchair stands alone at a small wooden table by a leaded window, lit by one low amber lamp. No people. Dust in the air. Grim, quiet, photorealistic.",
 "s2-crossroads": "Vertical portrait night photograph taken from standing eye level looking straight along a lonely rural English crossroads at night, storm clouds and a bare tree at the top of frame, wet road and grass verge at the bottom. A tall weathered wooden post stands at the junction, and far behind it a low white-walled roadside inn with one lit window. No people. Cold moonlight, photorealistic.",
 "s3-taproom": "Vertical portrait night photograph taken from standing eye level looking straight across a nineteen-forties English pub taproom at night, low dark ceiling beams at the top of frame, bare floorboards at the bottom. Empty tables with abandoned pint glasses, firelight from a small grate, and against the far wall one heavy dark oak armchair standing apart from the other chairs. No people. Photorealistic, wartime, somber.",
 "s4-museum-day": "Vertical portrait photograph taken from standing eye level looking straight at a plain pale museum wall in cold grey daylight from a side window, white ceiling at the top of frame, polished wooden museum floor at the bottom. High on the wall, well above head height, a single heavy dark oak armchair is mounted flat against the wall, with a small typed label beside it. No people. Institutional, quiet, unsettling, photorealistic.",
 "s5-museum-night": "Vertical portrait night photograph taken from standing eye level looking up at a museum wall in near darkness, dark ceiling at the top of frame, faint gallery floor at the bottom. High on the wall a heavy dark oak armchair hangs as a black shape, edge-lit by weak bluish light from a far window. No people. Photorealistic, ominous.",
 "s6-gibbet": "Vertical portrait night photograph taken from standing eye level looking up at a tall weathered wooden gibbet post against racing storm clouds and a hazy moon, sky filling the top of frame, dark hedgerow and road at the bottom. The old post is cracked and iron-banded, empty. No people. Photorealistic, dread.",
 "s7-chair-close": "Vertical portrait night photograph taken from below looking up at a heavy dark oak armchair mounted high on a shadowed museum wall, dark ceiling at the top of frame, the wall falling into darkness at the bottom. Close enough to see wood grain and worn armrests, lit by one weak cold spotlight. No people. Photorealistic, ominous.",
}

H = {"Authorization": f"Key {KEY}", "Content-Type": "application/json"}
reqs = {}
for k, prompt in P.items():
    body = json.dumps({"prompt": prompt, "image_size": {"width": 1080, "height": 1920}}).encode()
    r = urllib.request.Request("https://queue.fal.run/fal-ai/bytedance/seedream/v4/text-to-image", data=body, headers=H)
    with urllib.request.urlopen(r, timeout=60) as resp:
        reqs[k] = json.load(resp)["request_id"]
    print("queued", k)

urls = {}
deadline = time.time() + 300
while reqs and time.time() < deadline:
    for k, rid in list(reqs.items()):
        r = urllib.request.Request(f"https://queue.fal.run/fal-ai/bytedance/requests/{rid}/status", headers=H)
        with urllib.request.urlopen(r, timeout=30) as resp:
            st = json.load(resp)["status"]
        if st == "COMPLETED":
            r2 = urllib.request.Request(f"https://queue.fal.run/fal-ai/bytedance/requests/{rid}", headers=H)
            with urllib.request.urlopen(r2, timeout=30) as resp:
                out = json.load(resp)
            urls[k] = out["images"][0]["url"]
            urllib.request.urlretrieve(urls[k], D / f"{k}.jpg")
            print(k, "done")
            del reqs[k]
    if reqs: time.sleep(6)

(D / "still_urls.json").write_text(json.dumps(urls, indent=1))
(D / "still_prompts.json").write_text(json.dumps(P, indent=1))
print("pending:", list(reqs))
