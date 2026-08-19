import json, os, urllib.request, pathlib

D = pathlib.Path(__file__).parent
KEY = os.environ["FAL_KEY"]
urls = json.loads((D / "still_urls.json").read_text())

MOTION = {
 "s1-wall": "Static locked-off camera with a very slow push in toward the pencil scrawl on the wall. The candle flame flickers and gutters, making the light on the wall pulse and the dark shadow silhouette tremble slightly. No people enter frame. The scrawl does not change. Subtle, slow, ominous. Photorealistic, dark.",
 "s2-rectory": "Very slow drift forward toward the dark Victorian rectory. Thin mist creeps low across the lawn. Bare branches sway very slightly. The windows stay dark and still. No people, no lights turning on. Slow, quiet, ominous. Photorealistic night.",
 "s3-nun": "The distant nun figure walks slowly away from camera along the garden path, gliding smoothly, her dark habit and veil swaying very slightly. Her face is never visible. Camera stays locked off, static. Mist drifts. Slow, silent, ominous. Photorealistic night.",
 "s4-fire": "The fire glow inside the windows pulses and flickers brighter and dimmer. Thick smoke rises and drifts from the roof. A few embers float upward. Camera static, locked off. No people. The house does not collapse. Photorealistic night fire.",
 "s5-churchyard": "Very slow push forward between the gravestones. Low mist drifts slowly across the grass between the stones. Bare branches move very slightly. No people appear. Slow, quiet, cold, ominous. Photorealistic night.",
}

reqs = {}
for k, img in urls.items():
    body = json.dumps({
        "prompt": MOTION[k],
        "image_url": img,
        "duration": "10",
        "negative_prompt": "blur, distort, low quality, text, watermark, extra people, faces appearing, morphing",
    }).encode()
    r = urllib.request.Request(
        "https://queue.fal.run/fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
        data=body, headers={"Authorization": f"Key {KEY}", "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=60) as resp:
        j = json.load(resp)
    reqs[k] = j["request_id"]
    print(k, j["request_id"])

(D / "kling_reqs.json").write_text(json.dumps(reqs, indent=1))
