"""GSHHG's full-resolution shorelines (Wessel and Smith, LGPL; credit them), read as data from basemap-data-hires
2.0.0's files. Our own reader; the package's code is never run.

gshhsmeta_f.dat has a line per polygon: level, area, points, south, north, byte offset, byte count, id. gshhs_f.dat
holds each polygon's points as little-endian float32 (lon, lat) pairs. Levels: 1 land, 2 lake, 3 island in a lake,
4 pond on such an island."""
import zipfile

import numpy as np

_DIR = "mpl_toolkits/basemap_data/"


def polygons(whl, south, north, west, east):
    """[(level, points (n, 2) lon/lat)] for the shorelines whose box meets the region's."""
    out = []
    with zipfile.ZipFile(whl) as z:
        meta = z.read(_DIR + "gshhsmeta_f.dat").decode().splitlines()
        data = z.read(_DIR + "gshhs_f.dat")
    for line in meta:
        f = line.split()
        lev, s, n, off, cnt = int(f[0]), float(f[3]), float(f[4]), int(f[5]), int(f[6])
        if n < south or s > north:
            continue
        pts = np.frombuffer(data, "<f4", count=cnt // 4, offset=off).astype(np.float64).reshape(-1, 2)
        lon = pts[:, 0]
        if lon.max() < west or lon.min() > east:
            continue
        out.append((lev, pts))
    return out

