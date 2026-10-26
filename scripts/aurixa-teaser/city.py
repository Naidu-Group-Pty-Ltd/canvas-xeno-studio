#!/usr/bin/env python3
"""Sydney at night from above, for the teaser's map: the coast is real, the streets are drawn from where people live.

  python3 -I city.py <scratch dir> <out.png> <width> [key=value ...]   (up, s, cx, cy, seed: see VIEW)

Real, read as data:
  - the coast, the harbour, the bays and the rivers' estuaries: GSHHG's full-resolution shoreline (Wessel and
    Smith, LGPL), basemap-data-hires 2.0.0, read by gshhs.py;
  - where people live: GeoNames' places (CC BY 4.0), each suburb at its own point with its own population.
Drawn from those, as no real street is named or traced:
  - the arterial roads, the boundaries between neighbouring suburbs (a Voronoi diagram of their points, plus
    points laid where people are densest), bent by a smooth warp so they wander as roads do; the boundaries
    between the largest suburbs' cells are the major roads, brighter and wider;
  - the streets, a grid in each suburb's cell at its own angle and spacing, curving in the newer outer suburbs;
  - the lights: every street lit in proportion to the people around it, a scatter of house lights, the tall
    centres bright and cool, a few industrial estates floodlit in sodium orange, and the shore's lights reflected
    in the water.
Every random pattern (the warps, the seeds, the street grids, the sparkle, the centres' towers) is anchored to
the ground in kilometres, not to the picture, so a view at any scale draws the same city: the teaser's dive zooms
from the whole basin to the suburbs through renders at several scales without the streets changing under it.
Prints the screen points (at 1080 wide) of the property, the three offices and the CBD."""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import citydata as cd  # noqa: E402

S = Path(sys.argv[1])
OUT = Path(sys.argv[2])
W = int(sys.argv[3])
H = W * 16 // 9
ARGS = dict(a.split("=") for a in sys.argv[4:])
K = W / 1080  # render px per 1080 px
WHL = S / "pkgs/bmdh/basemap_data_hires-2.0.0-py3-none-any.whl"
OFFICES = ("South Windsor", "Edensor Park", "Hornsby")  # the three questions' offices, left, right, apex
VIEW = dict(up=float(ARGS.get("up", 76.78)), s=float(ARGS.get("s", 24.0)), cx=float(ARGS.get("cx", -1)),
            cy=float(ARGS.get("cy", -1)), w=1080, h=1920)
rng = np.random.default_rng(int(ARGS.get("seed", 2155)))

pl = cd.places(S)
by = {p["n"]: p for p in pl}
tri = np.array([[by[k]["e"], by[k]["nn"]] for k in OFFICES])
BOX_Y = float(ARGS.get("boxy", 900))
if VIEW["cx"] < 0:  # centre the triangle's box: its middle at x 540, its height's middle at y BOX_Y
    v0 = dict(VIEW, cx=540.0, cy=BOX_Y)
    x, y = cd.km_to_px(v0, tri[:, 0], tri[:, 1])
    VIEW["cx"] = 540.0 + (540.0 - (x.min() + x.max()) / 2)
    VIEW["cy"] = BOX_Y + (BOX_Y - (y.min() + y.max()) / 2)
v = dict(VIEW, cx=VIEW["cx"] * K, cy=VIEW["cy"] * K, s=VIEW["s"] * K, w=W, h=H)
px_km = 1.0 / v["s"]  # km a render pixel

# ------------------------------------------------------------------ the ground
land = cd.land(v, WHL, ss=3)
dens_raw = cd.density(v, pl, land)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
E, N = cd.px_to_km(v, xx, yy)
E, N = E.astype(np.float32), N.astype(np.float32)


WORLD = 400.0  # km from the property that the ground's patterns are laid over


def noise_at(e, n_, scale_km, seed, octaves=1):
    """Smooth noise on the ground, about unit amplitude, its features `scale_km` across, at (e, n) km: the same
    values wherever, and at whatever scale, it is drawn."""
    r = np.random.default_rng(seed)
    out = np.zeros(e.shape, np.float32)
    amp = 1.0
    for o in range(octaves):
        sc = scale_km / 2 ** o
        n = int(2 * WORLD / sc) + 4
        g = ndimage.gaussian_filter(r.normal(0, 1, (n, n)).astype(np.float32), 1.2)
        g /= g.std() + 1e-6
        gi = (n_ + WORLD) / (2 * WORLD) * (n - 3) + 1
        gj = (e + WORLD) / (2 * WORLD) * (n - 3) + 1
        out += amp * ndimage.map_coordinates(g, [gi.ravel(), gj.ravel()], order=1).reshape(e.shape)
        amp *= 0.5
    return out


def noise(scale_km, seed, octaves=1):
    return noise_at(E, N, scale_km, seed, octaves)


def hash01(e, n_, cell_km, salt):
    """A value in [0, 1) for each cell of `cell_km` on the ground: fixed to the ground, not to the picture."""
    ci = np.floor(e / cell_km).astype(np.int64)
    cj = np.floor(n_ / cell_km).astype(np.int64)
    h = (ci * 73856093) ^ (cj * 19349663) ^ (salt * 83492791)
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) & 0xFFFFFF).astype(np.float32) / float(0x1000000)


warp_e = noise(3.2, 11, 2) * 0.32
warp_n = noise(3.2, 12, 2) * 0.32
We, Wn = E + warp_e, N + warp_n
# Where people live has ragged edges and gaps (parks, creeks, the bush between estates), never a smooth blob.
dens = dens_raw * np.clip(0.72 + 0.55 * noise(1.1, 13, 2), 0.05, 1.6)

# ------------------------------------------------------------------ the seeds of the road network
lit = np.clip(dens / 2500.0, 0, 1.6)
seeds = [(p["e"], p["nn"], p["p"]) for p in pl]
# More seeds where people are densest, one about every 5,200 people, laid by a density field on the ground
# itself (north up, 0.5 km a cell, 200 km each way), so every view gets the same seeds.
gw = dict(cx=400.0, cy=400.0, up=0.0, s=2.0, w=800, h=800)
g_land = cd.land(gw, WHL, ss=2)
gy, gx = np.mgrid[0:800, 0:800].astype(np.float32) + 0.5
g_e, g_n = cd.px_to_km(gw, gx, gy)
g_dens = cd.density(gw, pl, g_land) * np.clip(0.72 + 0.55 * noise_at(g_e, g_n, 1.1, 13, 2), 0.05, 1.6)
flat = (g_dens * g_land).ravel().astype(np.float64)
total = flat.sum() * 0.25
rs = np.random.default_rng(2155)
n_extra = int(min(total / 5200.0, 6000))
if n_extra:
    pick = rs.choice(flat.size, n_extra, p=flat / flat.sum())
    for k in pick:
        seeds.append((float(g_e.ravel()[k]) + rs.normal(0, 0.2), float(g_n.ravel()[k]) + rs.normal(0, 0.2), 2000))
# A sparse field of seeds everywhere, so the cells in the bush stay bounded (their roads stay dark).
n_rural = int((2 * 200.0) ** 2 / 12.0)
for _ in range(n_rural):
    seeds.append((rs.uniform(-200, 200), rs.uniform(-200, 200), 300))
seeds = np.array(seeds, np.float64)
tree = cKDTree(seeds[:, :2])
q = np.stack([We.ravel(), Wn.ravel()], -1)
d, idx = tree.query(q, k=2, workers=-1)
s1, s2 = seeds[idx[:, 0], :2], seeds[idx[:, 1], :2]
gap = np.linalg.norm(s2 - s1, axis=1)
bis = ((d[:, 1] ** 2 - d[:, 0] ** 2) / (2 * np.maximum(gap, 1e-6))).reshape(H, W).astype(np.float32)
cell = idx[:, 0].reshape(H, W)
# The major roads: the same, between the largest places only.
big = seeds[seeds[:, 2] >= 14000]
bt = cKDTree(big[:, :2])
qm = np.stack([(E + noise(6.0, 14, 2) * 0.9).ravel(), (N + noise(6.0, 15, 2) * 0.9).ravel()], -1)
db, ib = bt.query(qm, k=2, workers=-1)
del qm
gb = np.linalg.norm(big[ib[:, 1], :2] - big[ib[:, 0], :2], axis=1)
bis_major = ((db[:, 1] ** 2 - db[:, 0] ** 2) / (2 * np.maximum(gb, 1e-6))).reshape(H, W).astype(np.float32)
pair = np.minimum(ib[:, 0], ib[:, 1]) * 7919 + np.maximum(ib[:, 0], ib[:, 1])
keep_major = (np.sin(pair * 12.9898) * 43758.5453 % 1.0 > 0.28).reshape(H, W)  # not every pair is joined
del q, d, idx, db, ib

# ------------------------------------------------------------------ the streets in each cell
ncell = len(seeds)
rc = np.random.default_rng(1234)
theta = rc.uniform(0, np.pi, ncell).astype(np.float32)
spacing = rc.uniform(0.085, 0.14, ncell).astype(np.float32)  # km between parallel streets
block = rc.uniform(2.0, 3.2, ncell).astype(np.float32)  # the cross streets are this many times further apart
far_out = np.hypot(seeds[:, 0] - 27.1, seeds[:, 1] + 19.1) > 30  # beyond 30 km of the CBD: the newer suburbs
curl = np.where(far_out, rc.uniform(0.6, 1.4, ncell), rc.uniform(0.0, 0.35, ncell)).astype(np.float32)
th, sp, bl, cu = theta[cell], spacing[cell], block[cell], curl[cell]
ce, cn = seeds[cell, 0].astype(np.float32), seeds[cell, 1].astype(np.float32)
le, ln = We - ce, Wn - cn
bend = cu * 0.11 * np.sin(ln * 9.0 + cell % 7) + cu * 0.09 * np.sin(le * 7.0 + cell % 5)
u = (le * np.cos(th) + ln * np.sin(th) + bend) / sp
w_ = (-le * np.sin(th) + ln * np.cos(th) - bend * 0.6) / (sp * bl)
ui, wi = np.round(u), np.round(w_)
du = np.abs(u - ui) * sp
dw = np.abs(w_ - wi) * sp * bl
half = max(0.016, 0.55 * px_km)  # km: a street's half width, never under half a pixel
street = np.exp(-(du / half) ** 2) + np.exp(-(dw / half) ** 2)
# Lamps along each street, and blocks with no lights (parks, schools, the bush between estates).
h1 = np.sin(ui * 12.9898 + wi * 78.233 + cell * 0.37) * 43758.5453
blockrand = (h1 - np.floor(h1)).astype(np.float32)
dark_blocks = (blockrand < 0.14) | (noise(0.9, 21) > 1.25)
street *= ~dark_blocks
lamp = 0.55 + 0.45 * np.cos(2 * np.pi * (u * sp + w_ * sp * bl) / 0.045) ** 2
street *= lamp

# ------------------------------------------------------------------ the lights
on_land = land > 0.5
art = np.exp(-(bis / max(0.026, 0.65 * px_km)) ** 2)
major = np.exp(-(bis_major / max(0.040, 0.85 * px_km)) ** 2)
pop_here = np.clip(dens / 1800.0, 0, 1.4)
wide = ndimage.gaussian_filter(dens, 2.0 / px_km)  # the metro's extent, kilometres wide
in_metro = np.clip((wide - 250.0) / 900.0, 0, 1)
vary = 0.5 + 0.5 * np.clip(noise(0.7, 31) * 0.5 + 0.5, 0, 1)  # roads brighter and dimmer along their length
L_art = art * np.clip((dens - 250.0) / 1600.0, 0, 1) ** 0.8 * vary * 0.62
L_maj = major * keep_major * in_metro * (0.55 + 0.45 * vary) * 1.05
L_res = street * np.clip(pop_here, 0, 1.2) ** 1.25 * 0.46 * (0.7 + 0.3 * vary)
sparkle = ((hash01(E, N, 0.035, 1) < 0.009 * np.clip(pop_here, 0.004, 1.2)).astype(np.float32)
           * (0.5 + 1.5 * hash01(E, N, 0.035, 2)))
SODIUM = np.array([1.0, 0.66, 0.30], np.float32)
WARM = np.array([1.0, 0.84, 0.58], np.float32)
WHITE = np.array([1.0, 0.95, 0.88], np.float32)
COOL = np.array([0.80, 0.93, 1.0], np.float32)
mix = noise(2.0, 41) * 0.5 + 0.5
art_col = SODIUM[None, None] * (1 - mix[..., None] * 0.6) + WARM[None, None] * (mix[..., None] * 0.6)
light = (L_art[..., None] * art_col + L_maj[..., None] * SODIUM + L_res[..., None] * WARM
         + sparkle[..., None] * WHITE * 0.8)
# The tall centres: many bright points, cool and white.
CENTRES = {"Sydney Central Business District": 2.6, "North Sydney": 1.6, "Parramatta": 1.7, "Chatswood": 1.3,
           "Bondi Junction": 1.0, "Hurstville": 0.9, "Liverpool": 1.0, "Penrith": 0.9, "Blacktown": 1.0,
           "Castle Hill": 0.9, "Hornsby": 1.0, "Macquarie Park": 1.0, "Burwood": 0.8, "Bankstown": 0.9,
           "St Leonards": 0.9, "Strathfield": 0.6, "Rhodes": 0.7, "Norwest": 0.7, "Campbelltown": 0.9}
cent = np.zeros((H, W), np.float32)
for name, k in CENTRES.items():
    p = by.get(name)
    if not p:
        continue
    x, y = cd.km_to_px(v, p["e"], p["nn"])
    rt = np.random.default_rng(abs(hash(name)) % (2 ** 31))
    n = int(1040 * k)
    te, tn = rt.normal(p["e"], 0.20 * np.sqrt(k), n), rt.normal(p["nn"], 0.20 * np.sqrt(k), n)
    amp = rt.uniform(0.2, 1.3, n) * (K * K / 4) * (v["s"] / (36.0 * K)) ** 0  # each tower's light, as drawn at 2160
    qx, qy = cd.km_to_px(v, te, tn)
    ok = (qx >= 0) & (qx < W) & (qy >= 0) & (qy < H)
    np.add.at(cent, (qy[ok].astype(int), qx[ok].astype(int)), amp[ok])
cent *= on_land
light += cent[..., None] * (COOL * 0.35 + WHITE * 0.65)
# Industrial estates: some cells floodlit, in sodium orange.
ind_cells = rng.random(ncell) < 0.06
ind = ind_cells[cell] & (dens > 400) & (dens < 3200)
flood = (ind & (hash01(E, N, 0.03, 3) < 0.02)).astype(np.float32) * (0.6 + 1.8 * hash01(E, N, 0.03, 4))
light += flood[..., None] * SODIUM
light *= on_land[..., None]

# The shore's lights in the water, soft and dim.
water = 1 - land
refl = np.stack([ndimage.gaussian_filter(light[..., c], 0.09 / px_km) for c in range(3)], -1)
near_shore = ndimage.gaussian_filter(land, 0.25 / px_km)
light += refl * (water * np.clip(near_shore * 2, 0, 1))[..., None] * 0.35

# ------------------------------------------------------------------ the ground, the bloom, the tone
ground_land = np.array([0.020, 0.036, 0.068], np.float32)
ground_sea = np.array([0.006, 0.014, 0.032], np.float32)
relief = noise(4.0, 51, 3)
base = (ground_land[None, None] * (1 + 0.10 * relief[..., None])) * land[..., None] + ground_sea * water[..., None]
coast = np.clip(1 - np.abs(land - 0.5) * 2.2, 0, 1)
base += coast[..., None] * np.array([0.0, 0.03, 0.05], np.float32)
glow = np.clip(ndimage.gaussian_filter(dens_raw, 1.4 / px_km) / 3000.0, 0, 1.2)
base += glow[..., None] * np.array([0.050, 0.036, 0.024], np.float32)  # the sky-glow over the lit city
bloom = np.zeros_like(light)
for s_, w8 in ((0.6, 1.0), (1.8, 0.45), (5.5, 0.26), (18, 0.14), (55, 0.07)):
    bloom += w8 * np.stack([ndimage.gaussian_filter(light[..., c], s_ * K) for c in range(3)], -1)
img = base + bloom * 0.9
vig = 1 - 0.30 * (((xx / W - 0.5) * 1.25) ** 2 + ((yy / H - 0.5) * 0.85) ** 2)
img *= vig[..., None]
img = 1 - np.exp(-img * 1.5)
img += rng.normal(0, 0.005, img.shape).astype(np.float32)
Image.fromarray(np.clip(img * 255 + 0.5, 0, 255).astype(np.uint8)).save(OUT)


def at(lon_lat=None, km=None):
    e, n = km if km is not None else cd.ll_to_km(*lon_lat)
    x, y = cd.km_to_px(VIEW, e, n)
    return [round(float(x), 1), round(float(y), 1)]


meta = {"view": VIEW, "property": at(km=(0.0, 0.0)),
        "offices": {k: at(km=(by[k]["e"], by[k]["nn"])) for k in OFFICES},
        "cbd": at(km=(by["Sydney Central Business District"]["e"], by["Sydney Central Business District"]["nn"]))}
print(json.dumps(meta))
