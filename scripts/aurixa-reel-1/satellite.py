"""Reel 1, shot 01.1 (third cut): the continent from orbit and the pins that rain onto it.

  python3 scripts/aurixa-reel-1/satellite.py <plate-assets dir> [--cache <dir>]

Writes, into the plate-assets folder the renderer is given:
  v3-sat-global.jpg  the whole Earth, 15 px a degree (5400 x 2700), for the globe's far side and its limb
  v3-sat-au.jpg      Australia and its seas, 30 px a degree (lon 100 to 172, lat -2 to -50)
  v3-sat-nsw.jpg     the New South Wales coast, 120 px a degree (lon 144 to 157, lat -27 to -40)
and, into the repository, docs/brands/aurixa-reel-1/system-edition/pins.json: where the white pins land.

Everything is public data, fetched from the package registries into the cache the first time:
  - colour: NASA's Blue Marble Next Generation (bmng.jpg, public domain), from basemap-data 2.0.0 (PyPI);
  - relief: Natural Earth's shaded relief (shadedrelief.jpg, public domain), from the same package; its shading is
    lit from the north-west, as the film's sun is;
  - coastline: GLOBE's 30 arc-second land mask (NOAA, public domain), from global-land-mask 1.0.0 (PyPI);
  - where people live: GeoNames' towns and cities of 1,000 people or more (CC BY 4.0), from all-the-cities 3.1.0
    (npm).
Blue Marble is 15 px a degree and the relief 30, so the coast is redrawn from the land mask (120 px a degree) and
each colour is carried up to its own side of it: land colour never bleeds into the sea at the close view. The
graded textures are albedo for the film's sun (globe.cjs lights them); only the seas are deepened here.
"""
import io
import json
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None
HERE = Path(__file__).resolve().parent
PINS_OUT = HERE.parents[1] / "docs" / "brands" / "aurixa-reel-1" / "system-edition" / "pins.json"

# The film's own property: 14 Wattle Grove, Banksia Rise NSW 2155 (a suburb that does not exist), placed in that
# postcode, north-west of Sydney. The gold pin is drawn here, by the scene, never as one of the white ones.
GOLD = (150.915, -33.692)

AU = {"lon": (100.0, 172.0), "lat": (-2.0, -50.0), "ppd": 30}
NSW = {"lon": (144.0, 157.0), "lat": (-27.0, -40.0), "ppd": 120}


# ------------------------------------------------------------------------------------------------ the sources
def fetch(cache):
    """The four sources, fetched once into `cache` from the registries and read from there."""
    cache.mkdir(parents=True, exist_ok=True)
    wheel = cache / "basemap_data-2.0.0-py3-none-any.whl"
    mask_wheel = cache / "global_land_mask-1.0.0-py3-none-any.whl"
    cities = cache / "all-the-cities-3.1.0.tgz"
    if not wheel.exists():
        subprocess.run([sys.executable, "-m", "pip", "download", "basemap-data==2.0.0", "--no-deps", "-q", "-d", str(cache)], check=True)
    if not mask_wheel.exists():
        subprocess.run([sys.executable, "-m", "pip", "download", "global-land-mask==1.0.0", "--no-deps", "-q", "-d", str(cache)], check=True)
    if not cities.exists():
        subprocess.run(["npm", "pack", "all-the-cities@3.1.0", "--pack-destination", str(cache)], check=True,
                       stdout=subprocess.DEVNULL)
    with zipfile.ZipFile(wheel) as z:
        bmng = Image.open(io.BytesIO(z.read("mpl_toolkits/basemap_data/bmng.jpg"))).convert("RGB")
        relief = Image.open(io.BytesIO(z.read("mpl_toolkits/basemap_data/shadedrelief.jpg"))).convert("RGB")
    with zipfile.ZipFile(mask_wheel) as z:
        with z.open("global_land_mask/globe_combined_mask_compressed.npz") as f:
            mask = np.load(io.BytesIO(f.read()), allow_pickle=False)["mask"]  # rows south to north, 120 px a degree
    with tarfile.open(cities) as t:
        pbf = t.extractfile("package/cities.pbf").read()
    return bmng, relief, mask, pbf


# ------------------------------------------------------------------------------------------------ the regions
def crop(img, lon, lat, ppd):
    """An equirectangular image's box (lon west to east, lat north to south) resampled to `ppd` px a degree."""
    w, h = img.size
    src = w / 360.0
    x0, x1 = (lon[0] + 180) * src, (lon[1] + 180) * src
    y0, y1 = (90 - lat[0]) * src, (90 - lat[1]) * src
    size = (round((lon[1] - lon[0]) * ppd), round((lat[0] - lat[1]) * ppd))
    out = img.resize(size, Image.BICUBIC, box=(x0, y0, x1, y1))
    return np.asarray(out, np.float32) / 255.0


def land(mask, lon, lat, ppd):
    """The share of each pixel that is land, from the 120 px a degree mask.

    The package's mask is the OCEAN (True is sea; its own is_land() negates it) and its rows run north to south
    (its lat axis starts at 90), so this reads it that way round. Read the other way it is the northern
    hemisphere upside down, and it nearly passes for Australia: the Philippine Sea lies where the interior
    does, and only south-west Western Australia, which falls on China, comes out grey."""
    k = 120 // ppd
    assert k * ppd == 120
    j0, j1 = round((lon[0] + 180) * 120), round((lon[1] + 180) * 120)
    i0, i1 = round((90 - lat[0]) * 120), round((90 - lat[1]) * 120)
    m = 1.0 - mask[i0:i1, j0:j1].astype(np.float32)
    if k > 1:
        m = m.reshape(m.shape[0] // k, k, m.shape[1] // k, k).mean(axis=(1, 3))
    return m


def extend(colour, weight, sigmas=(1, 2, 4, 8, 16, 32, 64)):
    """The colour where `weight` holds it, carried outward into the rest (normalised convolution, finer first)."""
    out = colour * weight[..., None]
    have = weight.copy()
    for s in sigmas:
        num = np.stack([ndimage.gaussian_filter(colour[..., c] * weight, s) for c in range(3)], -1)
        den = ndimage.gaussian_filter(weight, s)
        fill = num / np.maximum(den, 1e-6)[..., None]
        take = np.clip(den * 4, 0, 1) * (1 - have)
        out = out + fill * take[..., None]
        have = np.clip(have + take, 0, 1)
    return out / np.maximum(have, 1e-6)[..., None]


def luminance(c):
    return c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722


def relief_detail(relief, m, sigma):
    """The relief's own shading, its broad tint taken out: near 1 on flat land, above it on lit slopes."""
    L = luminance(relief)
    on = (m > 0.5).astype(np.float32)
    broad = ndimage.gaussian_filter(L * on, sigma) / np.maximum(ndimage.gaussian_filter(on, sigma), 1e-4)
    d = np.where(on > 0, L / np.maximum(broad, 1e-3), 1.0)
    return np.clip(d, 0.55, 1.6)


def grade_land(c, detail, k=1.25):
    """Land albedo: the relief laid in, then a little contrast and colour (Blue Marble reads flat when lit low)."""
    c = c * detail[..., None] ** k
    L = luminance(c)[..., None]
    c = L + (c - L) * 1.12  # saturation
    c = np.clip(c, 0, 1)
    return c ** 1.05


def grade_sea(c):
    """The seas, deepened toward the brand's night: their shelves kept, their surface darkened and cooled."""
    c = c * np.array([0.40, 0.55, 0.78], np.float32)
    return np.clip(c + np.array([0.004, 0.012, 0.03], np.float32), 0, 1)


URBAN = np.array([0.50, 0.47, 0.44], np.float32)  # a city from orbit: grey roofs and roads, a little warm


def compose(colour, m, detail, shore_sigma, noise=None, built=None):
    """Land and sea, each carried up to its own side of the coast, joined on the land mask, the shallows lit;
    the towns and cities laid on the land where `built` says (urban())."""
    pure_land = (ndimage.minimum_filter(m, 5) > 0.99).astype(np.float32)
    pure_sea = (ndimage.maximum_filter(m, 5) < 0.01).astype(np.float32)
    land_c = extend(colour, pure_land)
    sea_c = extend(colour, pure_sea)
    if noise is not None:
        land_c = np.clip(land_c * noise[..., None], 0, 1)
    if built is not None:
        grain = 1 + 0.10 * warped(m.shape, 7, (0.6, 1.2), (0.6, 0.4), warp=(3.0, 1.0))
        land_c = land_c + (URBAN * grain[..., None] - land_c) * (built * 0.72)[..., None]
    land_c = grade_land(land_c, detail)
    sea_c = grade_sea(sea_c)
    shore = np.clip(ndimage.gaussian_filter(m, shore_sigma) - m, 0, 1) * 2.2
    sea_c = sea_c + (np.array([0.42, 0.66, 0.70], np.float32) - sea_c) * np.clip(shore, 0, 1)[..., None] * 0.28
    out = land_c * m[..., None] + sea_c * (1 - m[..., None])
    return np.clip(out, 0, 1)


def sharpen(c, sigma, amount):
    """An unsharp mask: the relief's ridges kept crisp when it is carried up past its own resolution."""
    blur = np.stack([ndimage.gaussian_filter(c[..., k], sigma) for k in range(c.shape[-1])], -1)
    return np.clip(c + (c - blur) * amount, 0, 1)


def warped(shape, seed, sigmas, weights, warp=(18.0, 5.0)):
    """Fractal noise around 0 (unit spread), its domain warped so it reads as country rather than as grain."""
    rng = np.random.default_rng(seed)

    def fbm(ss, ws):
        n = np.zeros(shape, np.float32)
        for s, w in zip(ss, ws):
            layer = ndimage.gaussian_filter(rng.standard_normal(shape).astype(np.float32), s)
            n += w * layer / (layer.std() + 1e-6)
        return n

    base = fbm(sigmas, weights)
    wy = fbm((warp[0],), (1.0,)) * warp[1]
    wx = fbm((warp[0],), (1.0,)) * warp[1]
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]].astype(np.float32)
    out = ndimage.map_coordinates(base, [yy + wy, xx + wx], order=1, mode="reflect")
    return out / (out.std() + 1e-6)


def urban(places, lon, lat, ppd, m, seed):
    """How built-up each pixel is: every place of 1,000 people or more spread over the ground its people need
    (about 1,800 a square kilometre, the density of a middle suburb), with a ragged edge. A city's own entry,
    its whole population at one point, is left out: its suburbs are places of their own."""
    h, w = m.shape
    acc = np.zeros((h, w), np.float32)
    for c in places:
        if c["population"] > 400000:
            continue
        x = (c["lon"] - lon[0]) * ppd
        y = (lat[0] - c["lat"]) * ppd
        if not (-20 < x < w + 20 and -20 < y < h + 20):
            continue
        r_km = np.sqrt(c["population"] / 1800 / np.pi)
        r = max(r_km / (111.0 / ppd), 0.35)  # px
        i, j = int(round(y)), int(round(x))
        k = int(np.ceil(r * 3)) + 1
        i0, i1, j0, j1 = max(i - k, 0), min(i + k + 1, h), max(j - k, 0), min(j + k + 1, w)
        if i0 >= i1 or j0 >= j1:
            continue
        yy, xx = np.mgrid[i0:i1, j0:j1]
        d2 = (yy - y) ** 2 + (xx - x) ** 2
        # A town of a thousand is a faint smudge from orbit; a suburb of twenty thousand reads as city.
        acc[i0:i1, j0:j1] += np.exp(-d2 / (2 * (r * 0.8) ** 2)) * min(1.0, (c["population"] / 25000) ** 0.6)
    rough = warped((h, w), seed, (0.8, 1.6, 3.2), (0.4, 0.35, 0.25), warp=(6.0, 2.5))
    f = np.clip(acc * 1.4 - 0.15 + 0.22 * rough, 0, 1) ** 1.2
    return f * m


def save(arr, path, quality=93):
    Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)).save(path, quality=quality, subsampling=0)
    print(f"wrote {path} {arr.shape[1]} x {arr.shape[0]}")


def textures(bmng, relief, mask, places, out):
    # The whole Earth at 15 px a degree.
    g = {"lon": (-180.0, 180.0), "lat": (90.0, -90.0), "ppd": 15}
    colour = crop(bmng, g["lon"], g["lat"], 15)
    m = land(mask, g["lon"], g["lat"], 15)
    rel = crop(relief, g["lon"], g["lat"], 15)
    save(compose(colour, m, relief_detail(rel, m, 6), 0.8), out / "v3-sat-global.jpg")
    # Australia and its seas at 30, its cities laid on.
    au_places = [c for c in places if c["country"] == "AU"]
    colour = crop(bmng, AU["lon"], AU["lat"], 30)
    m = land(mask, AU["lon"], AU["lat"], 30)
    rel = crop(relief, AU["lon"], AU["lat"], 30)
    built = urban(au_places, AU["lon"], AU["lat"], 30, m, 30)
    save(compose(colour, m, relief_detail(rel, m, 10), 1.0, built=built), out / "v3-sat-au.jpg")
    # The New South Wales coast at 120: Australia's colour and relief carried up, its coast redrawn from the mask,
    # the relief's ridges sharpened, the country given a grain the colour cannot resolve, and Sydney's suburbs,
    # Newcastle's and Wollongong's laid on as the grey of a city from orbit.
    colour = crop(bmng, NSW["lon"], NSW["lat"], 120)
    m = land(mask, NSW["lon"], NSW["lat"], 120)
    m = np.clip(ndimage.gaussian_filter(m, 0.6), 0, 1)
    rel = sharpen(crop(relief, NSW["lon"], NSW["lat"], 120), 3.0, 0.9)
    detail = relief_detail(rel, m, 40)
    grain = 1 + 0.07 * warped(m.shape, 14, (0.7, 1.5, 3.0, 6.0), (0.3, 0.3, 0.25, 0.15))
    built = urban(au_places, NSW["lon"], NSW["lat"], 120, m, 120)
    save(compose(colour, m, detail, 2.0, noise=grain, built=built), out / "v3-sat-nsw.jpg")


# ------------------------------------------------------------------------------------------------ the pins
def read_cities(pbf):
    """all-the-cities' records (its index.js decodes them with pbf): name, country, population, lon, lat."""
    pos = 0
    n = len(pbf)
    last_lon = last_lat = 0

    def varint():
        nonlocal pos
        shift = result = 0
        while True:
            b = pbf[pos]
            pos += 1
            result |= (b & 0x7F) << shift
            if b < 0x80:
                return result
            shift += 7

    def svarint():
        v = varint()
        return (v >> 1) ^ -(v & 1)

    out = []
    while pos < n:
        end = varint() + pos
        city = {"name": "", "country": "", "population": 0, "lon": 0.0, "lat": 0.0}
        while pos < end:
            key = varint()
            tag, wire = key >> 3, key & 7
            if wire == 2:
                length = varint()
                value = pbf[pos:pos + length].decode("utf-8", "replace")
                pos += length
                if tag == 2:
                    city["name"] = value
                elif tag == 3:
                    city["country"] = value
            elif wire == 0:
                if tag == 1:
                    svarint()
                elif tag == 9:
                    city["population"] = varint()
                elif tag == 10:
                    last_lon += svarint()
                    city["lon"] = last_lon / 1e5
                elif tag == 11:
                    last_lat += svarint()
                    city["lat"] = last_lat / 1e5
                else:
                    varint()
            else:
                raise ValueError(f"unexpected wire type {wire} at {pos}")
        out.append(city)
    return out


def on_land(mask, lon, lat):
    """Whether a point is land (the mask is the ocean, rows north to south: see land())."""
    i = int((90 - lat) * 120)
    j = int((lon + 180) * 120)
    return not bool(mask[min(max(i, 0), mask.shape[0] - 1), min(max(j, 0), mask.shape[1] - 1)])


# The capitals and the large regional centres the pins gather round, west to east: their crowds land in that
# order, each blooming out from its centre, so the cities light up across the continent as a wave.
CENTRES = [
    ("Perth", 115.861, -31.952, 0.70), ("Darwin", 130.842, -12.461, 0.80), ("Adelaide", 138.599, -34.929, 0.86),
    ("Melbourne", 144.963, -37.814, 1.00), ("Hobart", 147.329, -42.879, 1.05), ("Canberra", 149.128, -35.283, 1.10),
    ("Sydney", 151.207, -33.868, 1.16), ("Newcastle", 151.780, -32.930, 1.24), ("Brisbane", 153.028, -27.468, 1.30),
    ("Gold Coast", 153.431, -28.000, 1.36),
]


def km(a_lon, a_lat, b_lon, b_lat):
    dx = (a_lon - b_lon) * 111.32 * np.cos(np.radians((a_lat + b_lat) / 2))
    return float(np.hypot(dx, (a_lat - b_lat) * 110.57))


def pins(cities, mask, total=600, seed=2155):
    """Where the white pins land: about `total` of GeoNames' 3,800 Australian places of 1,000 people or more, drawn
    with a weight of their population to the power 0.62, so they sit where Australians live. GeoNames lists the
    cities' suburbs as places of their own, so a city's pins already spread over its suburbs; its own entry (a
    whole metropolitan population at one point) is weighted as its largest suburb would be. Each pin stands at its
    place, nudged within a few hundred metres so two never coincide. Deterministic.

    When each lands: the towns rain across the continent from the start, sparse at first and thickening; each
    city's crowd blooms out from its centre in turn, west to east (CENTRES), so the coast lights up as a wave."""
    rng = np.random.default_rng(seed)
    au = [c for c in cities if c["country"] == "AU" and c["population"] >= 1000 and -44 < c["lat"] < -10 and 112 < c["lon"] < 154.5]
    au = [c for c in au if on_land(mask, c["lon"], c["lat"])]
    # A metropolitan entry carries the whole city at one point: weight it as a large suburb, so its pins are
    # its suburbs' and not a stack at the city hall.
    names = {n for n, *_ in CENTRES}
    pop = np.array([min(c["population"], 60000) if c["name"] in names else c["population"] for c in au], float)
    w = pop ** 0.62
    pick = rng.choice(len(au), size=min(total, len(au)), replace=False, p=w / w.sum())
    out = []
    for i in pick:
        c = au[i]
        for _ in range(20):
            r = 0.004 * np.sqrt(rng.random())  # degrees: within a few hundred metres of the place
            a = rng.random() * 2 * np.pi
            lon = c["lon"] + r * np.cos(a) / np.cos(np.radians(c["lat"]))
            lat = c["lat"] + r * np.sin(a)
            if on_land(mask, lon, lat):
                break
        else:
            lon, lat = c["lon"], c["lat"]
        # Keep clear of the gold pin, which the scene draws.
        if km(lon, lat, *GOLD) < 2.2:
            continue
        near = min(((km(lon, lat, x, y), n, at) for n, x, y, at in CENTRES), key=lambda v: v[0])
        if near[0] < 75:
            # A city's crowd: it blooms out from the centre over about half a second.
            land = near[2] + 0.55 * (near[0] / 75) ** 0.8 + 0.12 * rng.random()
        else:
            # The towns: few at first, then many; the last of them as the cities finish.
            land = 0.12 + 1.75 * rng.random() ** 0.55
        out.append({"lon": round(float(lon), 4), "lat": round(float(lat), 4), "land": round(float(land), 3),
                    "size": round(float(0.88 + 0.24 * rng.random()), 3)})
    out.sort(key=lambda p: p["land"])
    by = {}
    for p in out:
        near = min(((km(p["lon"], p["lat"], x, y), n) for n, x, y, _ in CENTRES), key=lambda v: v[0])
        key = near[1] if near[0] < 75 else "regional"
        by[key] = by.get(key, 0) + 1
    print("pins by centre:", by)
    return out


def main():
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    out = Path(args[0])
    cache = Path(args[args.index("--cache") + 1]) if "--cache" in args else Path.home() / ".cache" / "aurixa-reel-1"
    bmng, relief, mask, pbf = fetch(cache)
    places = read_cities(pbf)
    if "--pins-only" not in args:
        textures(bmng, relief, mask, places, out)
    ps = pins(places, mask)
    PINS_OUT.write_text(json.dumps({
        "source": "GeoNames towns and cities of 1,000 people or more (CC BY 4.0), from the all-the-cities 3.1.0 package; "
                  "each spread over its own extent on GLOBE's land mask (NOAA). Written by scripts/aurixa-reel-1/satellite.py.",
        "gold": {"lon": GOLD[0], "lat": GOLD[1], "what": "14 Wattle Grove, Banksia Rise NSW 2155 (fictional), in the 2155 postcode"},
        "pins": ps,
    }, separators=(",", ":")) + "\n")
    print(f"wrote {PINS_OUT}: {len(ps)} pins")


if __name__ == "__main__":
    main()
