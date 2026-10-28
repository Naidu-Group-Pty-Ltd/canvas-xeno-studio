#!/usr/bin/env python3
"""The teaser's public map data, fetched once from the package registries into a cache, as Reel 1's satellite.py
fetches its own. Nothing in the packages is run: each is downloaded, and the one file wanted is read out of it.

  python3 -I scripts/aurixa-teaser/fetch.py <cache dir>

Writes, in the cache:
  pkgs/glm/global_land_mask/globe_combined_mask_compressed.npz
      GLOBE's 30 arc-second land mask (NOAA, public domain), from global-land-mask 1.0.0 (PyPI)
  pkgs/bmd/basemap_data-2.0.0-py3-none-any.whl
      NASA's Blue Marble Next Generation and Natural Earth's shaded relief (both public domain), basemap-data 2.0.0
  pkgs/bmdh/basemap_data_hires-2.0.0-py3-none-any.whl
      GSHHG's full-resolution shorelines (Wessel and Smith, LGPL), basemap-data-hires 2.0.0
  pkgs/atc/package/cities.pbf
      GeoNames' places of 1,000 people or more (CC BY 4.0), all-the-cities 3.1.0 (npm)
  data/au-places.json
      Australia's places, read from cities.pbf by places.py
  data/region-places.json
      every place from 100 E to 180 E and 0 to 50 S, with its country (We Are Here's Earth: Australia, New Zealand
      and their neighbours)
  terrain/<zoom>/<x>-<y>.png
      the ground's shape: Mapzen's terrain tiles (AWS Open Data), elevation in metres as Terrarium PNGs, from
      SRTM and GMTED2010 (USGS), ETOPO1 (NOAA) under the sea, and Geoscience Australia's and LINZ's own models
      (each asks for credit: DELIVERY.md); the region coarse, Australia finer, the chase's ranges finest. Read into
      grids by terrain.py.
Keep the cache outside the work's folder: the packages are large, public and fetched again in a minute."""
import math
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
C = Path(sys.argv[1]).resolve()


def pip(spec, dest):
    dest.mkdir(parents=True, exist_ok=True)
    name = spec.split("==")[0].replace("-", "_")
    if not list(dest.glob(f"{name}-*.whl")):
        subprocess.run([sys.executable, "-m", "pip", "download", spec, "--no-deps", "--only-binary", ":all:", "-q",
                        "-d", str(dest)], check=True)
    return next(dest.glob(f"{name}-*.whl"))


mask = C / "pkgs/glm/global_land_mask/globe_combined_mask_compressed.npz"
if not mask.exists():
    whl = pip("global-land-mask==1.0.0", C / "pkgs/glm")
    with zipfile.ZipFile(whl) as z:
        mask.parent.mkdir(parents=True, exist_ok=True)
        mask.write_bytes(z.read("global_land_mask/globe_combined_mask_compressed.npz"))
pip("basemap-data==2.0.0", C / "pkgs/bmd")
pip("basemap-data-hires==2.0.0", C / "pkgs/bmdh")

pbf = C / "pkgs/atc/package/cities.pbf"
if not pbf.exists():
    tgz = C / "pkgs/all-the-cities-3.1.0.tgz"
    if not tgz.exists():
        subprocess.run(["npm", "pack", "all-the-cities@3.1.0", "--pack-destination", str(C / "pkgs")], check=True,
                       stdout=subprocess.DEVNULL)
    with tarfile.open(tgz) as t:
        pbf.parent.mkdir(parents=True, exist_ok=True)
        pbf.write_bytes(t.extractfile("package/cities.pbf").read())

places = C / "data/au-places.json"
if not places.exists():
    places.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([sys.executable, "-I", str(HERE / "places.py"), str(pbf), str(places)], check=True)
region = C / "data/region-places.json"
if not region.exists():
    subprocess.run([sys.executable, "-I", str(HERE / "places.py"), str(pbf), str(region), "--region"], check=True)

# The terrain tiles: (zoom, west, east, north, south) of each set. Zoom 6 is about 2.4 km a pixel at the equator,
# 8 about 0.6 km and 9 about 0.3 km.
TILES = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png"
TERRAIN = [(6, 90.0, 180.0, 20.0, -60.0), (8, 112.0, 154.0, -9.0, -44.0), (9, 147.5, 152.0, -31.5, -35.0)]


def tile_range(z, west, east, north, south):
    n = 2 ** z
    tx = lambda lon: min(n - 1, int((lon + 180.0) / 360.0 * n))  # noqa: E731
    ty = lambda lat: min(n - 1, int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n))  # noqa: E731
    return range(tx(west), tx(east - 1e-9) + 1), range(ty(north), ty(south) + 1)


def tile(job):
    z, x, y = job
    out = C / f"terrain/{z}/{x}-{y}.png"
    if out.exists() and out.stat().st_size > 0:
        return
    for wait in (2, 4, 8, 16, None):
        try:
            with urllib.request.urlopen(TILES.format(z=z, x=x, y=y), timeout=60) as r:
                data = r.read()
            break
        except urllib.error.HTTPError as e:
            # a refusal (403, 407) is the network's policy: it is reported, never tried again
            raise SystemExit(f"{TILES.format(z=z, x=x, y=y)}: HTTP {e.code}") from e
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if wait is None:
                raise
            time.sleep(wait)
    if not data.startswith(b"\x89PNG"):
        raise SystemExit(f"tile {z}/{x}/{y} is not a PNG")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.with_suffix(".part").write_bytes(data)
    out.with_suffix(".part").replace(out)


jobs = []
for z, w, e, n, s in TERRAIN:
    xs, ys = tile_range(z, w, e, n, s)
    jobs += [(z, x, y) for x in xs for y in ys]
with ThreadPoolExecutor(8) as pool:
    list(pool.map(tile, jobs))
print("cache ready:", C)
