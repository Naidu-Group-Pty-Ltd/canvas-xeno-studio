#!/usr/bin/env python3
"""The teaser's first picture: the Earth's night side from low orbit, looking up Australia's east coast.

  python3 -I orbit.py <scratch dir> <out.png> <width> [key=value ...]

A perspective camera, a ray to every pixel, the sphere it meets. Everything on it is public data, read as data:
  - land and sea: GLOBE's 30 arc-second land mask (NOAA, public domain), global-land-mask 1.0.0's .npz;
  - the ground in moonlight: NASA's Blue Marble Next Generation and Natural Earth's shaded relief (both public
    domain), basemap-data 2.0.0's bmng.jpg and shadedrelief.jpg;
  - where people live: GeoNames' places of 1,000 people or more (CC BY 4.0), data/au-places.json (places.py).
Each place is a spread of lights on the ground, in kilometres, projected through the same camera, so they crowd
and brighten toward the horizon as real ones do. The air is a haze along the limb and the thin line of airglow
above it. Prints the screen point of 14 Wattle Grove (Reel 1's gold pin) for the frames to draw the pin at.
"""
import io
import json
import sys
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None
sys.path.insert(0, str(Path(__file__).resolve().parent))
import orbitcam  # noqa: E402

S = Path(sys.argv[1])
OUT = Path(sys.argv[2])
W = int(sys.argv[3])
H = W * 16 // 9
ARGS = dict(a.split("=") for a in sys.argv[4:])
# padx, pady (frame px at 1080 wide) widen the picture past the frame on every side, with the same camera: the
# film's dive turns the picture as it falls, and its corners must never show. The frame inside is the one drawn
# without them, but for the lights just past its edge now glowing into it.
P = {k: float(ARGS.get(k, v)) for k, v in dict(
    lat=-41.6, lon=147.2, alt=900.0, heading=24.0, pitch=-44.0, vfov=62.0, roll=0.0, glow=1.0, seed=14,
    moon_az=72.0, moon_el=16.0, sheen=1.0, stars=1.0, padx=0.0, pady=0.0).items()}
RE = orbitcam.RE
PROPERTY = (150.915, -33.692)  # Reel 1's gold pin: 14 Wattle Grove, Banksia Rise NSW 2155 (a suburb that does not exist)
rng = np.random.default_rng(int(P["seed"]))
sc = W / 1080
PX, PY = int(round(P["padx"] * sc)), int(round(P["pady"] * sc))
CW, CH = W + 2 * PX, H + 2 * PY  # the picture, the frame and its margins
unit = orbitcam.unit

# ------------------------------------------------------------------ the camera
CAM = orbitcam.camera(P, W, H)
cam, fwd, right, cup, tx, ty = (CAM[k] for k in ("cam", "fwd", "right", "cup", "tx", "ty"))


def to_screen(pts):
    """World points (n, 3) to the picture's (x, y), margins included, and whether each is seen."""
    x, y, seen = orbitcam.to_screen(CAM, pts)
    return x + PX, y + PY, seen


jj, ii = np.meshgrid((np.arange(CW) + 0.5 - PX) / W * 2 - 1, 1 - (np.arange(CH) + 0.5 - PY) / H * 2)
d = fwd[None, None] + jj[..., None] * tx * right + ii[..., None] * ty * cup
d /= np.linalg.norm(d, axis=-1, keepdims=True)
b = d @ cam
c = cam @ cam - RE ** 2
disc = b * b - c
hit = (disc > 0) & (b < 0)
t = np.where(hit, -b - np.sqrt(np.maximum(disc, 0)), 0)
X = cam + t[..., None] * d
lat = np.degrees(np.arcsin(np.clip(X[..., 2] / RE, -1, 1)))
lon = np.degrees(np.arctan2(X[..., 1], X[..., 0]))
cos_inc = np.where(hit, -np.einsum("ijk,ijk->ij", X / RE, d), 0)  # 1 straight down, 0 at the limb

# ------------------------------------------------------------------ the ground in moonlight
m = np.load(S / "pkgs/glm/global_land_mask/globe_combined_mask_compressed.npz", allow_pickle=False)
LAT, LON = m["lat"], m["lon"]
la0, la1 = np.searchsorted(LAT, -52.0), np.searchsorted(LAT, 2.0)
lo0, lo1 = np.searchsorted(LON, 100.0), np.searchsorted(LON, 180.0)
OCEAN = m["mask"][la0:la1, lo0:lo1].astype(np.float32)
LATc, LONc = LAT[la0:la1], LON[lo0:lo1]
del m


def sample(grid, glat, glon, lat0, dlat, lon0, dlon, fill):
    """Bilinear sample of a regular lat/lon grid; `fill` outside it."""
    fi = (glat - lat0) / dlat
    fj = (glon - lon0) / dlon
    inside = (fi >= 0) & (fi <= grid.shape[0] - 1) & (fj >= 0) & (fj <= grid.shape[1] - 1)
    i0 = np.clip(np.floor(fi).astype(int), 0, grid.shape[0] - 2)
    j0 = np.clip(np.floor(fj).astype(int), 0, grid.shape[1] - 2)
    di, dj = np.clip(fi - i0, 0, 1), np.clip(fj - j0, 0, 1)
    if grid.ndim == 3:
        di, dj = di[..., None], dj[..., None]
    v = (grid[i0, j0] * (1 - di) * (1 - dj) + grid[i0 + 1, j0] * di * (1 - dj)
         + grid[i0, j0 + 1] * (1 - di) * dj + grid[i0 + 1, j0 + 1] * di * dj)
    ins = inside[..., None] if grid.ndim == 3 else inside
    return np.where(ins, v, fill)


sea = sample(OCEAN, lat, lon, LATc[0], LATc[1] - LATc[0], LONc[0], LONc[1] - LONc[0], 1.0)
sea = np.where(hit, sea, 1.0)
with zipfile.ZipFile(S / "pkgs/bmd/basemap_data-2.0.0-py3-none-any.whl") as z:
    bm = np.asarray(Image.open(io.BytesIO(z.read("mpl_toolkits/basemap_data/bmng.jpg"))).convert("RGB"), np.float32) / 255
    rel = np.asarray(Image.open(io.BytesIO(z.read("mpl_toolkits/basemap_data/shadedrelief.jpg"))).convert("L"), np.float32) / 255
# Both are whole-Earth, north row first, from 180 W.
bm_lat0, bm_dlat = 90 - 0.5 * 180 / bm.shape[0], -180 / bm.shape[0]
alb = sample(bm, lat, lon, bm_lat0, bm_dlat, -180 + 0.5 * 360 / bm.shape[1], 360 / bm.shape[1], 0.0)
rl_lat0, rl_dlat = 90 - 0.5 * 180 / rel.shape[0], -180 / rel.shape[0]
shade = sample(rel, lat, lon, rl_lat0, rl_dlat, -180 + 0.5 * 360 / rel.shape[1], 360 / rel.shape[1], 0.5)
luma = alb @ np.array([0.3, 0.55, 0.15], np.float32)
moon = np.array([0.55, 0.68, 1.0], np.float32)  # moonlight reads blue to the eye
land = np.array([0.020, 0.040, 0.078], np.float32) + moon * (0.030 * luma[..., None] ** 0.8 * (0.55 + 0.9 * shade[..., None]))
ocean = np.array([0.010, 0.022, 0.048], np.float32)[None, None] * (0.75 + 0.25 * cos_inc[..., None])
img = land * (1 - sea[..., None]) + ocean * sea[..., None]
# The moon low in the east-north-east, its path on the sea: a broad sheen and the glitter of the waves in it.
nn_ = unit(PROPERTY[1], PROPERTY[0])
ee_ = np.array([-np.sin(np.radians(PROPERTY[0])), np.cos(np.radians(PROPERTY[0])), 0.0])
no_ = np.cross(nn_, ee_)
ma, me = np.radians(P["moon_az"]), np.radians(P["moon_el"])
moon_dir = np.cos(me) * (np.cos(ma) * no_ + np.sin(ma) * ee_) + np.sin(me) * nn_
Nrm = X / RE
half_v = -d + moon_dir[None, None]
half_v /= np.linalg.norm(half_v, axis=-1, keepdims=True)
nh = np.clip(np.einsum("ijk,ijk->ij", Nrm, half_v), 0, 1)
waves = ndimage.gaussian_filter(rng.normal(0, 1, (H, W)).astype(np.float32), 2.2 * W / 1080)
waves = np.pad(np.clip(0.5 + waves / (waves.std() + 1e-6) * 0.25, 0, 1), ((PY, PY), (PX, PX)), mode="reflect")
sheen = (nh ** 900 * 0.22 + nh ** 140 * 0.07 * (0.5 + waves)) * sea * hit
img += sheen[..., None] * np.array([0.62, 0.74, 0.95], np.float32) * P["sheen"]
# Limb darkening on the ground, then the haze of the air the ray crosses near the edge.
img *= (0.45 + 0.55 * cos_inc[..., None] ** 0.6)
haze_col = np.array([0.10, 0.30, 0.52], np.float32)
img += hit[..., None] * haze_col * (np.exp(-cos_inc * 9.0)[..., None]) * 0.42 * P["glow"]
img = np.where(hit[..., None], img, 0.0)

# ------------------------------------------------------------------ the air above the limb, and the stars
closest = np.sqrt(np.maximum(cam @ cam - b * b, 0))
hmin = np.where(hit, 0.0, closest - RE)
sky = ~hit
glow_line = np.exp(-((hmin - 92.0) / 7.0) ** 2) * sky
haze = np.exp(-np.maximum(hmin, 0) / 16.0) * sky
img += glow_line[..., None] * np.array([0.10, 0.62, 0.66], np.float32) * 0.55 * P["glow"]
img += haze[..., None] * haze_col * 0.55 * P["glow"]
stars = np.zeros((CH, CW), np.float32)
n_st = int(W * H / 1500 * P["stars"])
sx, sy = rng.integers(0, W, n_st) + PX, rng.integers(0, H, n_st) + PY
mag = rng.pareto(2.6, n_st) * 0.10 + 0.04
if PX or PY:  # the margins' own stars, drawn apart so the frame's stay where they were
    r2 = np.random.default_rng(int(P["seed"]) + 1)
    n2 = int(CW * CH / 1500 * P["stars"])
    x2, y2 = r2.integers(0, CW, n2), r2.integers(0, CH, n2)
    out = (x2 < PX) | (x2 >= PX + W) | (y2 < PY) | (y2 >= PY + H)
    sx, sy = np.concatenate([sx, x2[out]]), np.concatenate([sy, y2[out]])
    mag = np.concatenate([mag, r2.pareto(2.6, n2)[out] * 0.10 + 0.04])
ok = sky[sy, sx] & (hmin[sy, sx] > 140)
np.add.at(stars, (sy[ok], sx[ok]), np.minimum(mag[ok], 1.4))
stars = ndimage.gaussian_filter(stars, 0.6 * W / 1080) * (W / 1080) ** 2 * 1.6
img += stars[..., None] * np.array([0.85, 0.9, 1.0], np.float32)

# ------------------------------------------------------------------ where people live
places = json.loads((S / "data/au-places.json").read_text())
pts, amps, cols = [], [], []
WARM = np.array([[1.0, 0.86, 0.62], [1.0, 0.78, 0.48], [1.0, 0.95, 0.86], [0.70, 0.92, 0.98]], np.float32)
for p in places:
    pop = max(p["p"], 1000)
    if p["n"] == "Sydney":  # the metro's figure on the CBD's point: its suburbs carry the rest
        pop = 260000
    if p["n"] == "Melbourne":
        pop = 240000
    n = int(np.clip(8 + 8 * np.sqrt(pop / 1000), 8, 3000))
    sig = 0.6 + 1.0 * np.log10(pop / 1000 + 1)  # km
    dn, de = rng.normal(0, sig, n), rng.normal(0, sig, n)
    plat = p["lat"] + dn / 110.57
    plon = p["lon"] + de / (111.32 * np.cos(np.radians(p["lat"])))
    pts.append(unit(plat, plon) * RE)
    total = 2.4 * (pop / 1000) ** 0.72  # a town's light grows slower than its people
    amps.append(np.full(n, total / n) * rng.uniform(0.4, 1.6, n))
    cols.append(WARM[rng.choice(4, n, p=[0.44, 0.30, 0.20, 0.06])])
pts, amps, cols = np.concatenate(pts), np.concatenate(amps), np.concatenate(cols)
lx, ly, vis = to_screen(pts)
k = vis & (lx >= 0) & (lx < CW) & (ly >= 0) & (ly < CH)
light = np.zeros((CH, CW, 3), np.float32)
np.add.at(light, (ly[k].astype(int), lx[k].astype(int)), cols[k] * amps[k, None])


def blur(a, sigma):
    """A Gaussian blur. A wide one is taken at a fraction of the size and brought back up: a glow that wide has
    nothing in it the smaller picture loses, and it takes seconds where the full one takes minutes."""
    f = int(sigma // 4)
    if f < 3:
        return ndimage.gaussian_filter(a, sigma)
    h, w = a.shape
    hp, wp = -(-h // f) * f, -(-w // f) * f
    small = np.pad(a, ((0, hp - h), (0, wp - w)), mode="edge").reshape(hp // f, f, wp // f, f).mean(axis=(1, 3))
    small = ndimage.gaussian_filter(small, sigma / f)
    big = Image.fromarray(small.astype(np.float32), mode="F").resize((wp, hp), Image.BILINEAR)
    return np.asarray(big)[:h, :w]


bloom = np.zeros_like(light)
for s, w in ((0.7, 1.0), (2.2, 0.55), (7, 0.32), (24, 0.16), (70, 0.08)):
    bloom += w * np.stack([blur(light[..., ch], s * sc) for ch in range(3)], -1)
img += bloom * 1.35

# ------------------------------------------------------------------ tone, vignette, grain
yy, xx = np.mgrid[0:CH, 0:CW].astype(np.float32)
vig = 1 - 0.35 * ((((xx - PX) / W - 0.5) * 1.3) ** 2 + (((yy - PY) / H - 0.52) * 0.9) ** 2)
img *= np.maximum(vig, 0.2)[..., None]
img = 1 - np.exp(-img * 1.6)  # a soft shoulder, so the brightest cities never clip flat
img += rng.normal(0, 0.006, img.shape).astype(np.float32)
Image.fromarray(np.clip(img * 255 + 0.5, 0, 255).astype(np.uint8)).save(OUT)
px, py, pv = to_screen(unit(PROPERTY[1], PROPERTY[0])[None] * RE)
# The pin in the frame's own px at 1080 wide (the margins, frame px, around it).
print(json.dumps({"property": [float(px[0] - PX) / sc, float(py[0] - PY) / sc], "visible": bool(pv[0]),
                  "pad": [PX / sc, PY / sc], "params": P}))
