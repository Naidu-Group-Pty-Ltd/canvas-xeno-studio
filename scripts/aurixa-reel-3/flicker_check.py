"""Finds the frames of a run that one browser drew apart from the others: a flicker wherever the picture holds still.

  python3 -I flicker_check.py <run dir> [<run dir> ...]

render.cjs draws a run's frames on three browsers side by side. Each one paints a scaled page at a raster scale that
depends on what it painted before, so now and then one of them draws its frames a little apart from the other two:
the same picture, its letters and edges a fraction of a pixel different. In motion nothing shows. Where the picture
holds still the frames it drew stand out from their neighbours, every third frame, and that reads as a shimmer.
Measured on Reel 3: a run's own vote replaced up to 7 of the 15 frames it sampled, and every flicker these two tests
found was at a hold.

Each frame is compared at half size, in grey, counting the pixels that move more than 4 code values:
  odd one out   a frame that differs from each neighbour by more than 1.5 times what the neighbours differ by from
                each other, plus 200 pixels (one frame apart from two that agree);
  every third   a frame that differs from the frame three on by less than 0.35 times what it differs from either of
                the next two by, where those differ by more than 300 pixels (one browser in three drawing a stretch
                apart: its frames match each other better than they match their neighbours).
A frame that changes on purpose for one frame (a pointer's press, an ease's overshoot) is reported too: what a flicker
is, and what is not, is settled by drawing the stretch again, twice, and splicing it in where the draws agree
(verify_run.py splice). Two draws that agree with each other and still single the frame out show that it is the scene.
"""
import json
import subprocess
import sys

import numpy as np

W, H = 540, 960


def frames(run):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f"{run}/reference.mkv", "-vf", f"scale={W}:{H}:flags=area",
                          "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True, check=True).stdout
    n = len(raw) // (W * H)
    return np.frombuffer(raw[: n * W * H], np.uint8).reshape(n, H, W).astype(np.int16)


def stretches(found, gap=3):
    out = []
    for f in found:
        if out and f - out[-1][1] <= gap:
            out[-1][1] = f
        else:
            out.append([f, f])
    return [(a, b + 3) for a, b in out]


def check(run):
    lo = json.loads(open(f"{run}/film.json").read())["from"]
    fr = frames(run)
    n = len(fr)
    d = lambda i, j: int((np.abs(fr[i] - fr[j]) > 4).sum())
    odd, third = [], []
    for i in range(1, n - 1):
        a, b, s = d(i - 1, i), d(i, i + 1), d(i - 1, i + 1)
        if min(a, b) > 1.5 * s + 200:
            odd.append(lo + i)
    for i in range(n - 3):
        a, b, c = d(i, i + 1), d(i, i + 2), d(i, i + 3)
        if min(a, b) > 300 and c < 0.35 * min(a, b):
            third.append(lo + i)
    return odd, stretches(third)


status = 0
for run in sys.argv[1:]:
    run = run.rstrip("/")
    odd, third = check(run)
    name = run.split("/")[-1]
    if odd or third:
        status = 1
        print(f"{name}: odd one out at {odd or 'none'}; every third frame in {third or 'none'}")
    else:
        print(f"{name}: no frame drawn apart from its neighbours")
sys.exit(status)
