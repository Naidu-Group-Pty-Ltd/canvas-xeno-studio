#!/usr/bin/env python3
"""The ground's shape for We Are Here's Australia: the terrain tiles fetch.py keeps (Mapzen's Terrarium PNGs, AWS Open
Data) read as data and laid on a grid of latitude and longitude, as earth.py samples its maps. Nothing in them is run:
each tile is decoded as a picture, and its colours are the elevation (metres = R x 256 + G + B / 256 - 32768).

  python3 -I scripts/aurixa-teaser/terrain.py <cache dir>

For each set of tiles fetch.py keeps, writes data/terrain-<zoom>.npy (int16 metres; row 0 at the north and column 0
at the west, each value at its cell's centre; cells square in degrees, the tiles' own size across) and
data/terrain-<zoom>.json (the first cell's latitude and longitude, the step in degrees, and the bounds). (Needs numpy
and OpenCV.)"""
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np

C = Path(sys.argv[1]).resolve()

# the sets fetch.py fetches (its TERRAIN): (zoom, west, east, north, south)
SETS = [(6, 90.0, 180.0, 20.0, -60.0), (8, 112.0, 154.0, -9.0, -44.0), (9, 147.5, 152.0, -31.5, -35.0)]


def merc_y(lat, n):
    """Web Mercator's y of a latitude, in pixels of a world 256 n wide."""
    return (1 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2 * 256 * n


def build(z, west, east, north, south):
    n = 2 ** z
    x0, x1 = int((west + 180) / 360 * n), min(n - 1, int((east - 1e-9 + 180) / 360 * n))
    y0, y1 = int(merc_y(north, n) // 256), min(n - 1, int(merc_y(south, n) // 256))
    mosaic = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256), np.float32)
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            path = C / f"terrain/{z}/{x}-{y}.png"
            im = cv2.imread(str(path), cv2.IMREAD_COLOR)
            if im is None or im.shape[:2] != (256, 256):
                sys.exit(f"{path}: missing or not a 256 px tile (run fetch.py)")
            b, g, r = (im[..., i].astype(np.float32) for i in range(3))
            mosaic[(y - y0) * 256:(y - y0 + 1) * 256, (x - x0) * 256:(x - x0 + 1) * 256] = r * 256 + g + b / 256 - 32768
    step = 360.0 / (256 * n)
    cols = int(round((east - west) / step))
    rows = int(round((north - south) / step))
    lat = north - (np.arange(rows) + 0.5) * step
    lon = west + (np.arange(cols) + 0.5) * step
    # each target cell's place in the mosaic, in its pixels (a pixel's centre at its index)
    my = (merc_y(lat, n) - y0 * 256 - 0.5).astype(np.float32)
    mx = ((lon + 180) / 360 * 256 * n - x0 * 256 - 0.5).astype(np.float32)
    out = np.empty((rows, cols), np.float32)
    band = 4096  # OpenCV's remap takes no side of 32767 or more, and a band keeps the maps small
    for r0 in range(0, rows, band):
        r1 = min(rows, r0 + band)
        mapx = np.broadcast_to(mx[None, :], (r1 - r0, cols)).copy()
        mapy = np.broadcast_to(my[r0:r1, None], (r1 - r0, cols)).copy()
        out[r0:r1] = cv2.remap(mosaic, mapx, mapy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    grid = np.clip(np.round(out), -32768, 32767).astype(np.int16)
    (C / "data").mkdir(parents=True, exist_ok=True)
    np.save(C / f"data/terrain-{z}.npy", grid, allow_pickle=False)
    meta = dict(zoom=z, lat0=float(lat[0]), lon0=float(lon[0]), step=step, north=north, south=south, west=west,
                east=east, shape=list(grid.shape))
    (C / f"data/terrain-{z}.json").write_text(json.dumps(meta))
    print(f"terrain-{z}: {grid.shape[1]} x {grid.shape[0]} cells of {step * 111.2:.2f} km, "
          f"{int(grid.min())} to {int(grid.max())} m")


for s in SETS:
    build(*s)
