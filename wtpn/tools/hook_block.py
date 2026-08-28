#!/usr/bin/env python3
"""Hook-block builder — the WITNESS FORMAT open (standard since 28 Aug 2026,
user: "it doesnt grab attention at all to start with, needs the hook").

t=0 of every witness episode: the witness's single most impossible claim in big
serif type over grain-black, fading in while the tape click fires and the witness
voice speaks the SAME claim from ~0.45s. Title/disclosure card comes AFTER.

Usage as a library from a build script:
    from hook_block import hook_png, hook_block
    hook_block(workdir, "w3", ["They carried me", "out of that house.", "I am a doctor."],
               dur=alen("d_open") + 0.9, out=workdir / "b00.mp4")
The voice segment itself is adelay'd to the block's mark (+0.45s) in the audio mix.
"""
import subprocess, pathlib
from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"


def run(cmd):
    subprocess.run(cmd, check=True, capture_output=True)


def hook_png(path, lines):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(BOLD, 88)
    lh = 118
    tot = len(lines) * lh
    y = (H - tot) // 2 - 160  # upper third
    for ln in lines:
        w = d.textlength(ln, font=f)
        x = (W - w) / 2
        d.text((x + 3, y + 3), ln, font=f, fill=(0, 0, 0, 255))       # shadow
        d.text((x, y), ln, font=f, fill=(232, 229, 220, 255))          # off-white
        y += lh
    img.save(path)
    return path


def hook_block(workdir, key, lines, dur, out):
    workdir = pathlib.Path(workdir)
    hp = hook_png(workdir / f"hook_{key}.png", lines)
    run(["ffmpeg", "-y", "-v", "error",
         "-f", "lavfi", "-i", "color=c=0x0a0a0a:s=1080x1920:r=30",
         "-loop", "1", "-i", str(hp), "-t", f"{dur:.3f}",
         "-filter_complex",
         "[0:v]noise=alls=9:allf=t[bg];[1:v]fade=in:st=0.12:d=0.18:alpha=1[tx];[bg][tx]overlay=0:0",
         "-t", f"{dur:.3f}", "-an",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", str(out)])
    return out
