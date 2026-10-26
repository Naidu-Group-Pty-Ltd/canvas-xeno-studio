#!/usr/bin/env python3
"""Holds frames drawn on another machine against the same frames drawn here.

  python3 -I scripts/aurixa-teaser/as-one/verify.py <share.mkv> <its first frame> <png dir> <frame> [<frame> ...]

<png dir> holds frame-NNNN.png for each frame given, drawn here by render.cjs (RENDER_FRAMES=...). Each frame is
read out of the share (its index in the share is the frame less the share's first) and compared, pixel by pixel:
the largest difference in any channel, the share of pixels that differ at all, and the PSNR. One renderer on one
browser draws the same frame the same way on any machine, so a share passes when every frame it is held against
matches to within a code value or two. Exits 1 if one does not.
"""
import subprocess
import sys

import numpy as np
from PIL import Image

share, first, pngs, frames = sys.argv[1], int(sys.argv[2]), sys.argv[3], [int(f) for f in sys.argv[4:]]
bad = 0
for f in frames:
    k = f - first
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", share, "-vf", f"select=eq(n\\,{k})", "-vsync", "0", "-frames:v", "1",
                          "-pix_fmt", "rgb24", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    a = np.frombuffer(raw, np.uint8).reshape(1920, 1080, 3).astype(np.int16)
    b = np.asarray(Image.open(f"{pngs}/frame-{f:04d}.png").convert("RGB")).astype(np.int16)
    d = np.abs(a - b)
    mse = float((d.astype(np.float64) ** 2).mean())
    psnr = float("inf") if mse == 0 else 10 * np.log10(255 ** 2 / mse)
    ok = d.max() <= 2
    bad += not ok
    print(f"frame {f}: largest difference {d.max()}, {100 * (d.max(axis=2) > 0).mean():.3f}% of pixels differ, "
          f"PSNR {psnr:.1f} dB {'ok' if ok else 'DIFFERS'}")
sys.exit(1 if bad else 0)
