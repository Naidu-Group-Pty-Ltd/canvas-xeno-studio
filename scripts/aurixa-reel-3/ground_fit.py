"""Fits a cover of a screen's own ground over words the film keeps out of frame.

For each rect (the screen's CSS px), the ground is read from the rows just above it and just below it, smoothed along
the row, and set down as a horizontal gradient of evenly spaced stops that matches it to within a code value; where
the two rows differ by more than a code value, the cover blends from the one to the other down its height (`bottom`).

  python3 ground_fit.py <screen png> <its scale> '{"name": [x, y, w, h], ...}'

prints the covers as JSON, for a scene to keep beside the rects (scenes/page.cjs COVERS, scenes/platform.cjs).
"""

import json
import sys

import numpy as np
from PIL import Image


def smooth(row, k=15):
    pad = np.pad(row, ((k // 2, k // 2), (0, 0)), mode="edge")
    ker = np.ones(k) / k
    return np.stack([np.convolve(pad[:, c], ker, mode="valid") for c in range(3)], axis=1)


def stops(row):
    for n in range(2, 16):
        xs = np.linspace(0, len(row) - 1, n).round().astype(int)
        fit = np.stack([np.interp(np.arange(len(row)), xs, row[xs, c]) for c in range(3)], axis=1)
        err = np.abs(fit - row).max()
        if err <= 0.75 or n == 15:
            return ["#%02x%02x%02x" % tuple(int(round(v)) for v in row[i]) for i in xs], err


def main():
    im = np.asarray(Image.open(sys.argv[1]).convert("RGB")).astype(float)
    k = float(sys.argv[2])
    out = {}
    for name, (x, y, w, h) in json.loads(sys.argv[3]).items():
        x0, y0, x1, y1 = round(x * k), round(y * k), round((x + w) * k), round((y + h) * k)
        top = smooth(im[y0 - 3 : y0, x0:x1].mean(axis=0))
        bottom = smooth(im[y1 : y1 + 3, x0:x1].mean(axis=0))
        t, et = stops(top)
        b, eb = stops(bottom)
        apart = np.abs(top - bottom).max()
        out[name] = {"box": [x, y, w, h], "top": t, **({"bottom": b} if apart > 1.0 else {})}
        print(f"{name}: top within {et:.2f}, bottom within {eb:.2f}, top and bottom {apart:.1f} apart", file=sys.stderr)
    print(json.dumps(out))


if __name__ == "__main__":
    main()
