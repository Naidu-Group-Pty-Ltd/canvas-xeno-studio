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
Keep the cache outside the work's folder: the packages are large, public and fetched again in a minute."""
import subprocess
import sys
import tarfile
import zipfile
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
print("cache ready:", C)
