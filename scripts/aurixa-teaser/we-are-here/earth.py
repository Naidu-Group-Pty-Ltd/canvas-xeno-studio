"""We Are Here's Australia: the Earth under the system, from the first frame to the last.

The continent as a relief map lit from orbit: its ranges drawn taller than they stand and lit by a key light from the
north-north-east with the shadows they cast and the sky's light in their valleys, so its topography reads at every
height; its own colours carried into the palette (the deserts the brand's gold, the green the deep steel between the
navy and the ice, pale ground sand, salt the ice's white); its shelf seas lifting toward the ice over the navy of the
deep ocean, so the coast is drawn by the sea itself; the air along the limb; and every town's lights. The Earth is a
sphere whose surface lies 30 units under the core, so the space's own light (the core, the rings, the threads) keeps
its scale. What moves is the Earth: how many kilometres a unit is (the system's height), the point under the core and
the bearing the camera's -z faces there, on keys of their own (space.World._beats).

It is drawn in two parts: the ground and the sky as a picture behind the space's light (a ray to every pixel, the
sphere it meets: Earth.plate), and the towns' lights as points of the space (Earth.lights), so they keep the lens's
focus and the shutter like everything else in it.

Everything on it is public data, read as data (fetched once into the work's cache by ../fetch.py and laid on grids by
../terrain.py; no package's code is run):
  land and sea      GLOBE's 30 arc-second land mask (NOAA, public domain), global-land-mask 1.0.0's .npz
  the ground's      Mapzen's terrain tiles (AWS Open Data): SRTM and GMTED2010 (USGS), ETOPO1 under the sea
  shape             (NOAA), Geoscience Australia's and LINZ's own models (each asks for credit: DELIVERY.md),
                    at 2.4 km over the region, 0.6 km over Australia and 0.3 km over the chase's ranges
  its colour        NASA's Blue Marble Next Generation (public domain), basemap-data 2.0.0's bmng.jpg
  where people live GeoNames' places of 1,000 people or more (CC BY 4.0), data/region-places.json (../places.py):
                    Australia's, and New Zealand's and the other neighbours' that a far view can reach
"""
import json
import math
import zipfile
from pathlib import Path

import cv2
import numpy as np

RE = 6371.0  # km
ORB = 30.0  # how far below the core the ground lies, in units

# The part of the globe every map here is cut to: Australia, New Zealand, the islands to the north and the seas
# between, as far as the widest view reaches.
NORTH, SOUTH, WEST, EAST = 20.0, -60.0, 90.0, 180.0

# The brand's colours, linear (space.py's).
NAVY = np.array([0.0024, 0.0080, 0.0222], np.float32)
GOLD = np.array([1.0, 0.72, 0.32], np.float32)
WARM = np.array([1.0, 0.86, 0.62], np.float32)
ICE = np.array([0.62, 0.84, 1.0], np.float32)

# The ground's own colours in the palette (ground_colour): the deserts the brand's gold, as the red centre is ochre;
# where the land is green and dark, a deep steel between the navy and the ice; pale ground a pale sand of the warm;
# salt pans and dry lakes the ice's white.
LAND_WARM = GOLD * 0.92
LAND_COOL = NAVY * 14.0 + ICE * 0.06
LAND_SAND = WARM * 0.5 + ICE * 0.12
LAND_SALT = WARM * 1.05
# The light on it: the key (a warm white, the sun's) and the sky (the ice), and how strong each is.
KEY_COL = np.array([1.0, 0.93, 0.80], np.float32)
KEY_K, SKY_K = 0.62, 0.16
# The sea over the shelf, where it is shallow: a deep ice between the navy and the emblem's ice.
SHELF = NAVY * 3.0 + ICE * 0.012


def ground_classes(bgr):
    """What the Blue Marble (8-bit BGR) says the ground is, cell by cell (H x W x 4): how much is red (the deserts),
    how much dark and not red (where it is green), how much bright and pale (salt), and its brightness, eased.
    ground_colour carries them into the palette."""
    s = bgr[..., ::-1].astype(np.float32) / 255
    lin = np.where(s <= 0.04045, s / 12.92, ((s + 0.055) / 1.055) ** 2.4)
    R, G = lin[..., 0], lin[..., 1]
    Y = lin @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    red = (R - G) / (R + G + 0.02)
    w = np.clip((red - 0.02) / 0.28, 0, 1)
    w = w * w * (3 - 2 * w)
    b = np.clip((Y / 0.08) ** 0.55, 0.42, 1.9)
    salt = np.clip((Y - 0.16) / 0.12, 0, 1) * (1 - np.clip((red - 0.2) / 0.2, 0, 1))
    cool = (1 - w) * np.clip((0.07 - Y) / 0.05, 0, 1)
    return np.stack([w, cool, salt, b], -1).astype(np.float32)


def ground_colour(cls, rug, fine):
    """The ground's colour in the palette, linear (N x 3): the deserts the gold, the green the deep steel, the rest
    the pale sand, salt the white; from ground_classes' cells (N x 4), and where the frame resolves finer than the
    Blue Marble does (`fine`, 0 to 1), its green laid where the ground is rugged (`rug`, 0 to 1: the forest on the
    ranges and the escarpments, the plains between cleared), so the colour follows the relief, not the map's cells."""
    w, cool, salt, b = cls[:, 0], cls[:, 1], cls[:, 2], cls[:, 3]
    on_slopes = np.clip((rug + cool - 1) / 0.3 + 0.5, 0, 1) * (1 - w)
    c = cool + (on_slopes - cool) * fine
    b = b * (1 + 0.5 * (cool - c))  # the forest darker, the cleared ground lighter
    pale = np.clip(1 - w - c, 0, 1)
    col = b[:, None] * (LAND_WARM * w[:, None] + LAND_COOL * c[:, None] + LAND_SAND * pale[:, None])
    return col * (1 - salt[:, None]) + LAND_SALT * salt[:, None]


def geo(lat, lon):
    """Unit vectors from the Earth's centre (x toward 0 E on the equator, z toward the north pole)."""
    la, lo = np.radians(lat), np.radians(lon)
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], -1)


def toward(lat, lon, bearing, km):
    """The point `km` from (lat, lon) along the great circle that leaves it on `bearing` (degrees from north)."""
    la, lo, b, d = math.radians(lat), math.radians(lon), math.radians(bearing), km / RE
    la2 = math.asin(math.sin(la) * math.cos(d) + math.cos(la) * math.sin(d) * math.cos(b))
    lo2 = lo + math.atan2(math.sin(b) * math.sin(d) * math.cos(la), math.cos(d) - math.sin(la) * math.sin(la2))
    return math.degrees(la2), math.degrees(lo2)


def course(lat1, lon1, lat2, lon2):
    """The bearing (degrees from north) and the distance (km) from one point to another along the great circle."""
    a, b = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    brg = math.degrees(math.atan2(math.sin(dl) * math.cos(b), math.cos(a) * math.sin(b) - math.sin(a) * math.cos(b) * math.cos(dl)))
    c = math.sin(a) * math.sin(b) + math.cos(a) * math.cos(b) * math.cos(dl)
    return brg % 360, RE * math.acos(max(-1.0, min(1.0, c)))


class Ground:
    """Where the Earth is in the world at one moment: `km` kilometres a unit, the point (lat, lon) under the core,
    and the bearing (degrees from north) the world's -z faces there. Its centre is straight below the core."""

    def __init__(self, lat, lon, bearing, km):
        self.lat, self.lon, self.bearing, self.km = lat, lon, bearing, km
        self.R = RE / km
        self.C = np.array([0.0, -ORB - self.R, 0.0])
        up = geo(lat, lon)
        lo = math.radians(lon)
        east = np.array([-math.sin(lo), math.cos(lo), 0.0])
        north = np.cross(up, east)
        b = math.radians(bearing)
        fwd = math.cos(b) * north + math.sin(b) * east
        right = -math.sin(b) * north + math.cos(b) * east
        self.M = np.stack([right, up, -fwd])  # the world's x, y and z, in the Earth's own axes

    def world(self, g, lift=0.0):
        """World points of the Earth's unit vectors g (N x 3), `lift` units above the ground."""
        return self.C + (self.R + lift) * (np.asarray(g, np.float64) @ self.M.T)

    def to_geo(self, P):
        v = (np.asarray(P, np.float64) - self.C) @ self.M
        return v / np.linalg.norm(v, axis=-1, keepdims=True)

    def direction(self, g):
        """A direction fixed to the Earth (a unit vector in its own axes), in the world."""
        return np.asarray(g, np.float64) @ self.M.T

    def _c(self, o):
        """|o - C|^2 - R^2 for points o, without the loss of subtracting two large squares."""
        o = np.asarray(o, np.float64)
        h = o[..., 1] + ORB
        return o[..., 0] ** 2 + o[..., 2] ** 2 + h * (h + 2 * self.R)

    def hidden(self, P, cam):
        """Which world points P the Earth hides from a camera at `cam`: those whose sight line meets the ground
        before it reaches them."""
        P = np.asarray(P, np.float64).reshape(-1, 3)
        d = P - cam
        a = np.einsum("ij,ij->i", d, d)
        b = d @ (cam - self.C)
        c = float(self._c(cam))
        disc = b * b - a * c
        sq = np.sqrt(np.maximum(disc, 0))
        t1 = c / np.maximum(-b + sq, 1e-30)  # the nearer meeting, as a share of the way to the point
        return (disc > 0) & (b < 0) & (t1 < 1 - 1e-9)

    def height(self, cam):
        """The camera's height over the ground, in km."""
        return (math.sqrt(float(self._c(cam)) + self.R ** 2) - self.R) * self.km

    def meet(self, o, d):
        """Where rays from o along unit directions d (N x 3) first meet the ground (NaN where they miss it)."""
        d = np.asarray(d, np.float64).reshape(-1, 3)
        b = d @ (np.asarray(o, np.float64) - self.C)
        c = float(self._c(o))
        disc = b * b - c
        t = np.where((disc > 0) & (b < 0), c / np.maximum(-b + np.sqrt(np.maximum(disc, 0)), 1e-30), np.nan)
        return np.asarray(o, np.float64) + t[:, None] * d

    def blocks(self, d, cam):
        """Which directions d (unit, N x 3) from a camera at `cam` meet the Earth: the stars it hides."""
        d = np.asarray(d, np.float64).reshape(-1, 3)
        b = d @ (np.asarray(cam, np.float64) - self.C)
        return (b < 0) & (b * b > float(self._c(cam)))

    # The space's paths on the ground (the threads, the chase's run, the rings on the ground) are drawn in the Earth's
    # flat picture about the point under the core (each place at its distance along the ground, on its bearing: the
    # azimuthal equidistant projection) and bent onto the sphere, each point keeping its height over the ground. Near
    # the core the two are one.

    def flat(self, g):
        """The Earth's unit vectors g (N x 3) in the flat picture: world x and z, y on the ground (-ORB)."""
        g = np.asarray(g, np.float64).reshape(-1, 3)
        up = self.M[1]
        c = g @ up
        side = g - c[:, None] * up[None, :]
        sn = np.linalg.norm(side, axis=1)
        th = np.arctan2(sn, c)
        e = (side / np.maximum(sn, 1e-300)[:, None]) @ self.M.T  # the world's horizontal direction to it
        s = self.R * th
        return np.stack([s * e[:, 0], np.full(len(g), -ORB), s * e[:, 2]], 1)

    def bend(self, F):
        """Points of the flat picture (N x 3, y their height with the ground at -ORB) onto the sphere: exact, and
        without the loss of subtracting large numbers while the radius is huge (the rise)."""
        F = np.asarray(F, np.float64).reshape(-1, 3)
        s = np.hypot(F[:, 0], F[:, 2])
        h = F[:, 1] + ORB
        th = s / self.R
        k = np.where(s > 1e-12, (self.R + h) * np.sin(th) / np.maximum(s, 1e-300), 1.0 + h / self.R)
        y = -ORB + h * np.cos(th) - 2 * self.R * np.sin(th / 2) ** 2
        return np.stack([F[:, 0] * k, y, F[:, 2] * k], 1)


def circle(q, ang, n=200):
    """A small circle on the Earth: n unit vectors `ang` radians about the unit vector q."""
    q = np.asarray(q, np.float64)
    a = np.array([0.0, 0.0, 1.0]) if abs(q[2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    e1 = np.cross(q, a)
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(q, e1)
    phi = np.linspace(0, 2 * math.pi, n)
    return (math.cos(ang) * q[None, :] + math.sin(ang) * (np.cos(phi)[:, None] * e1[None, :]
                                                            + np.sin(phi)[:, None] * e2[None, :]))


def frame_for(places, targets, guess):
    """The point under the core, the bearing and the km a unit that put two places (lat, lon) at two points of the
    flat picture (world x, z): Gauss-Newton from a guess (lat, lon, bearing, km)."""

    def resid(p):
        lat, lon, brg, km = p
        out = []
        for (la, lo), (x, z) in zip(places, targets):
            b, dist = course(lat, lon, la, lo)
            dl = math.radians(b - brg)
            s = dist / km
            out += [s * math.sin(dl) - x, -s * math.cos(dl) - z]
        return np.array(out)

    p = np.array(guess, np.float64)
    for _ in range(30):
        r0 = resid(p)
        J = np.stack([(resid(p + dp) - r0) / 1e-6 for dp in np.eye(4) * 1e-6], 1)
        step = np.linalg.lstsq(J, -r0, rcond=None)[0]
        p += step
        if np.abs(step).max() < 1e-10:
            break
    return tuple(float(v) for v in p)


def _grid_sample(img, lat, lon, lat0, lon0, step, border=0.0):
    """Bilinear samples of a map whose row 0 is at lat0 and column 0 at lon0, `step` degrees a cell."""
    lat, lon = np.asarray(lat), np.asarray(lon)
    shape = lat.shape
    mx = ((lon - lon0) / step).astype(np.float32).ravel()
    my = ((lat0 - lat) / step).astype(np.float32).ravel()
    # OpenCV's remap takes no side of 32767 or more: any list of samples is laid out in rows of 4096
    n = mx.size
    pad = (-n) % 4096
    mx = np.concatenate([mx, np.full(pad, -9.0, np.float32)]).reshape(-1, 4096)
    my = np.concatenate([my, np.full(pad, -9.0, np.float32)]).reshape(-1, 4096)
    out = cv2.remap(img, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=border)
    return out.reshape(-1, *img.shape[2:])[:n].reshape(*shape, *img.shape[2:]).astype(np.float32)


class Mips:
    """A map and its halvings: each point is read at its own footprint on the frame (km a pixel there), a blend of
    the two nearest levels, so the coast and the relief neither shimmer far off nor alias toward the limb. `given`:
    the levels made already (Relief's light, worked out at each level's own cell)."""

    def __init__(self, img, lat0, lon0, step, levels, border=0.0, given=None):
        self.levels = given or [img]
        for _ in range(levels - len(self.levels)):
            a = self.levels[-1]
            self.levels.append(cv2.resize(a, (a.shape[1] // 2, a.shape[0] // 2), interpolation=cv2.INTER_AREA))
        self.lat0, self.lon0, self.step, self.border = lat0, lon0, step, border
        self.texel = step * 111.2  # km a cell, north to south

    def sample(self, lat, lon, km_px):
        lvl = np.clip(np.log2(np.maximum(km_px, 1e-6) / self.texel), 0, len(self.levels) - 1)
        i0 = np.minimum(np.floor(lvl).astype(np.int32), len(self.levels) - 2)
        f = (lvl - i0).astype(np.float32)
        out = np.zeros(lat.shape + self.levels[0].shape[2:], np.float32)
        for k in range(len(self.levels)):
            w = np.where(i0 == k, 1 - f, 0) + np.where(i0 + 1 == k, f, 0)
            sel = w > 0
            if not sel.any():
                continue
            s = 2 ** k
            v = _grid_sample(self.levels[k], lat[sel], lon[sel], self.lat0 - (s - 1) / 2 * self.step,
                             self.lon0 + (s - 1) / 2 * self.step, self.step * s, self.border)
            out[sel] += (w[sel] if v.ndim == 1 else w[sel][:, None]) * v
        return out


# ------------------------------------------------------------------ the ground's shape, and its light

# The relief's key light: from the north-north-east, 28 degrees up, as the sun stands over Australia in a winter's late
# morning. The whole film looks north to east, so in the frame it falls from ahead and a little to the left, and the
# ranges read as ranges (a light from below the frame turns them into valleys). It is given as a relief map gives its
# light, from the same bearing and height over every place, so each level's light is worked out once.
KEY_AZ, KEY_EL = 20.0, 28.0
# How much taller the ground is drawn than it stands: a little at the chase's height, more from orbit, where a range a
# kilometre high is otherwise a shade no eye can find. By each level's cell (km), so every height has its own.
EX0, EX_POW = 5.0, 0.8


def exaggeration(cell_km):
    return EX0 * (cell_km / 0.3) ** EX_POW


class Relief:
    """The ground's shape, terrain.py's grids (../terrain.py: the region at 2.4 km, Australia at 0.6 km, the chase's
    ranges at 0.3 km), and at each level of each the light it takes: the key light's shading (its slopes toward the
    light and away, and the shadows its ranges cast) and the sky's (open ground lit, valleys less). Read at each
    point's footprint from the finest grid that holds it, blended across each grid's edge."""

    def __init__(self, cache):
        self.grids = []
        for z, levels in ((6, 6), (8, 7), (9, 5)):
            meta = json.loads((cache / f"data/terrain-{z}.json").read_text())
            h = np.load(cache / f"data/terrain-{z}.npy", allow_pickle=False).astype(np.float32)
            key, fill, rug, hh = [], [], [], []
            for L in range(levels):
                if L:
                    h = cv2.resize(h, (h.shape[1] // 2, h.shape[0] // 2), interpolation=cv2.INTER_AREA)
                k, f, r = self._light(h, meta["lat0"] - (2 ** L - 1) / 2 * meta["step"], meta["step"] * 2 ** L)
                key.append(k)
                fill.append(f)
                rug.append(r)
                hh.append(np.clip(np.round(h), -32768, 32767).astype(np.int16))
            at = (meta["lat0"], meta["lon0"], meta["step"])
            self.grids.append(dict(bounds=(meta["north"], meta["south"], meta["west"], meta["east"]),
                                   key=Mips(None, *at, levels, 0, key), fill=Mips(None, *at, levels, 200, fill),
                                   rug=Mips(None, *at, levels, 0, rug), h=Mips(None, *at, levels, -4000, hh)))
        self.grids.reverse()  # the finest first

    @staticmethod
    def _light(h, lat0, step):
        """The key light's shading, the sky's, and how rugged the ground is, on one level (uint8, 255 full): h its
        heights (m), lat0 its first row's latitude, step its cell (degrees)."""
        rows, cols = h.shape
        dy = step * 111200.0
        coslat = np.cos(np.radians(lat0 - np.arange(rows) * step)).astype(np.float32)
        ex = exaggeration(dy / 1000.0)
        hl = np.maximum(h, 0.0)  # the sea's floor is not lit: the sea lies flat over it
        gx = np.empty_like(hl)
        gy = np.empty_like(hl)
        gx[:, 1:-1] = hl[:, 2:] - hl[:, :-2]
        gx[:, 0], gx[:, -1] = gx[:, 1], gx[:, -2]
        gy[1:-1] = hl[:-2] - hl[2:]  # rows run south: this is the rise to the north
        gy[0], gy[-1] = gy[1], gy[-2]
        gx *= ex / (2 * dy * coslat[:, None])
        gy *= ex / (2 * dy)
        # rugged: the ground's own slope (not drawn taller), steep at a tenth, about a cell
        rug = cv2.GaussianBlur(np.sqrt(gx * gx + gy * gy) / ex, (0, 0), 1.0) / 0.10
        az, el = math.radians(KEY_AZ), math.radians(KEY_EL)
        lx, ly, lz = math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)
        inv = 1.0 / np.sqrt(gx * gx + gy * gy + 1.0)
        shade = np.clip((-gx * lx - gy * ly + lz) * inv, 0, 1)
        nz = inv
        del gx, gy
        # the shadows: from each cell, the steepest rise to any cell on the light's way, against the light's height
        n = int(np.clip(math.ceil(ex * 1500.0 / math.tan(el) / dy), 3, 48))
        best = np.full((rows, cols), -1.0, np.float32)
        for r0 in range(0, rows, 512):  # each band of rows at its own cos(latitude)
            r1 = min(rows, r0 + 512)
            a0, a1 = max(0, r0 - n - 2), min(rows, r1 + n + 2)
            band = np.ascontiguousarray(hl[a0:a1])
            c = float(coslat[(r0 + r1) // 2])
            for s in range(1, n + 1):
                M = np.float32([[1, 0, s * lx / math.cos(el) / c], [0, 1, -s * ly / math.cos(el)]])
                ahead = cv2.warpAffine(band, M, (cols, a1 - a0), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP,
                                       borderMode=cv2.BORDER_REPLICATE)
                np.maximum(best[r0:r1], (ahead[r0 - a0:r1 - a0] - band[r0 - a0:r1 - a0]) * (ex / (s * dy)),
                           out=best[r0:r1])
        lit = np.clip(0.5 + (math.tan(el) - best) / 0.14, 0, 1)
        del best
        key = shade * lit
        # the sky: open ground takes all of it, a slope less, a valley less again (its depth under its surroundings)
        sig = 2.5
        deep = hl - cv2.GaussianBlur(hl, (0, 0), sig)
        open_ = np.clip(1.0 + 1.2 * ex * deep / (sig * dy), 0.35, 1.25)
        fill = (0.5 + 0.5 * nz) * open_ / 1.25
        return tuple(np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8) for a in (key, fill, rug))

    def sample(self, lat, lon, km_px):
        """The key light's shading, the sky's and how rugged the ground is (0 to 1), and the height (m, the sea's
        floor below 0), at each point."""
        key = np.zeros(lat.shape, np.float32)
        rug = np.zeros(lat.shape, np.float32)
        fill = np.full(lat.shape, 200 / 255, np.float32)
        h = np.full(lat.shape, -4000.0, np.float32)
        left = np.ones(lat.shape, np.float32)  # how much of each point is still to be read from a coarser grid
        for g in self.grids:
            n, s, w, e = g["bounds"]
            m = 0.25  # degrees over which a grid gives way to the next coarser one at its edge
            inside = np.minimum.reduce([lat - s, n - lat, lon - w, e - lon]) / m
            wgt = np.clip(inside, 0, 1).astype(np.float32) * left
            sel = wgt > 0
            if not sel.any():
                continue
            la, lo, kp, ww = lat[sel], lon[sel], km_px[sel], wgt[sel]
            key[sel] += ww * g["key"].sample(la, lo, kp) / 255.0
            rug[sel] += ww * g["rug"].sample(la, lo, kp) / 255.0
            fill[sel] += ww * (g["fill"].sample(la, lo, kp) / 255.0 - 200 / 255)
            h[sel] += ww * (g["h"].sample(la, lo, kp) + 4000.0)
            left[sel] -= ww
            if not (left > 1e-6).any():
                break
        return key, fill, h, rug


class Earth:
    """The maps and the places, cut to the region, and how they are drawn."""

    def __init__(self, cache, seed=5):
        cache = Path(cache)
        m = np.load(cache / "pkgs/glm/global_land_mask/globe_combined_mask_compressed.npz", allow_pickle=False)
        # GLOBE's grid: 120 to a degree, row 0 at 90 N, column 0 at 180 W; True is water
        r0, r1 = int(round((90 - NORTH) * 120)), int(round((90 - SOUTH) * 120)) + 1
        c0, c1 = int(round((WEST + 180) * 120)), min(43200, int(round((EAST + 180) * 120)) + 1)
        land = np.where(m["mask"][r0:r1, c0:c1], 0, 255).astype(np.uint8)
        del m
        self.land = Mips(land, 90 - r0 / 120, -180 + c0 / 120, 1 / 120, 6)
        with zipfile.ZipFile(cache / "pkgs/bmd/basemap_data-2.0.0-py3-none-any.whl") as z:
            bm = cv2.imdecode(np.frombuffer(z.read("mpl_toolkits/basemap_data/bmng.jpg"), np.uint8), cv2.IMREAD_COLOR)
        # Whole-Earth, row 0 at the north, column 0 at 180 W, its samples at the cells' centres: the ground's own
        # colour, carried into the palette (ground_colour)
        cls, at = self._cut(ground_classes(bm))
        self.classes = Mips(cls, *at, 4, 0.0)
        self.relief = Relief(cache)
        self._places(cache, seed)

    @staticmethod
    def _cut(img):
        n = img.shape[0] / 180.0
        r0, r1 = int((90 - NORTH) * n), int(math.ceil((90 - SOUTH) * n))
        c0, c1 = int((WEST + 180) * n), int(math.ceil((EAST + 180) * n))
        return np.ascontiguousarray(img[r0:r1, c0:c1]), (90 - (r0 + 0.5) / n, -180 + (c0 + 0.5) / n, 1 / n)

    # -------------------------------------------------------------- where people live

    def _places(self, cache, seed):
        """Every place of 1,000 people or more as a spread of lights on the ground, in kilometres: a town's lights
        are few and faint, a city's spread wide about a bright heart. A great city's own entry carries its whole
        metropolitan figure, which its suburbs already carry, so it is taken as its centre only."""
        rng = np.random.default_rng(seed)
        self.places = json.loads((cache / "data/region-places.json").read_text())
        pts, amp, warm, home, heart = [], [], [], [], []
        for i, p in enumerate(self.places):
            pop = max(p["p"], 1000)
            if pop > 500000:
                pop = 220000
            n = int(np.clip(6 + 7 * math.sqrt(pop / 1000), 6, 2600))
            sig = 0.5 + 1.1 * math.log10(pop / 1000 + 1)  # km
            r = sig * np.sqrt(-2 * np.log(rng.uniform(1e-4, 1, n)))  # a Gaussian's spread, drawn by its radius
            a = rng.uniform(0, 2 * math.pi, n)
            lat = p["lat"] + r * np.cos(a) / 110.57
            lon = p["lon"] + r * np.sin(a) / (111.32 * math.cos(math.radians(p["lat"])))
            pts.append(np.stack([lat, lon], 1))
            total = 2.4 * (pop / 1000) ** 0.72  # a town's light grows slower than its people
            core = np.exp(-2 * (r / sig) ** 2)
            amp.append(np.full(n, total / n) * rng.uniform(0.35, 1.65, n) * (1 + 1.5 * core))
            warm.append(rng.random(n))
            home.append(np.full(n, i))
            # how much of a light is a city's heart: only a large place's middle burns warm-white, the rest is gold
            heart.append(core * float(np.clip((math.log10(pop / 1000) - 1.0) / 1.4, 0, 1)))
        ll = np.concatenate(pts)
        on = self.land.sample(ll[:, 0], ll[:, 1], np.zeros(len(ll))) > 127  # no light falls in the sea
        self.light_ll = ll[on]
        self.light_g = geo(ll[on, 0], ll[on, 1])
        self.light_k = np.concatenate(amp)[on]
        self.light_warm = np.concatenate(warm)[on]
        self.light_home = np.concatenate(home)[on]
        self.light_heart = np.concatenate(heart)[on]
        self.light_ph = rng.uniform(0, 2 * math.pi, len(self.light_k))

    def place(self, name, country="AU"):
        """The place of that name (in that country) with the most people: (lat, lon)."""
        best = max((p for p in self.places if p["n"] == name and p.get("c", "AU") == country), key=lambda p: p["p"])
        return best["lat"], best["lon"]

    # -------------------------------------------------------------- the picture behind the space

    def plate(self, pose, gr, look, W, H):
        """The Earth and the sky at one pose, in linear light (H x W x 3).

        look: day (the light on the land, 0 to 1: all of the key light's and half of the sky's go with it), dawn (0 to
        1) with the sun (a world direction) just under the limb, haze (the air's light), and the space's colours
        (navy, ice, gold, warm)."""
        r, u, f = pose.R
        vx = (np.arange(W, dtype=np.float64) + 0.5 - pose.cx) / pose.F
        vy = -(np.arange(H, dtype=np.float64) + 0.5 - pose.cy) / pose.F
        inv = 1.0 / np.sqrt(1.0 + vx[None, :] ** 2 + vy[:, None] ** 2)
        oc = pose.pos - gr.C
        dist_c = float(np.linalg.norm(oc))
        b = (vx[None, :] * (r @ oc) + vy[:, None] * (u @ oc) + f @ oc) * inv  # each ray's reach toward the centre
        c = float(gr._c(pose.pos))
        # each ray's angle above the limb (negative where it meets the ground): the sky is graded on it
        rho = math.asin(min(1.0, gr.R / dist_c))
        alpha = (np.arccos(np.clip(-b / dist_c, -1, 1)) - rho).astype(np.float32)
        cover = np.clip(0.5 - alpha * pose.F, 0, 1)
        navy, ice, gold, warm = (np.asarray(look[k], np.float32) for k in ("navy", "ice", "gold", "warm"))
        day, dawn, haze = float(look["day"]), float(look["dawn"]), float(look["haze"])

        # ---- the sky: the navy of space, lifting toward the limb; over the lit Earth the air seen edge on along the
        # limb, the brightest of the sky, in ice, falling away into space; and the airglow's fine line 92 km up
        up = np.sin(np.clip(alpha, 0, None))
        sky = navy * (0.3 + 0.7 * np.exp(-up / 0.3))[..., None]
        band = np.exp(-(alpha / 0.14) ** 2) * 0.7 + np.exp(-(alpha / 0.04) ** 2) * 0.3
        cool = np.array([0.0030, 0.0065, 0.0130], np.float32)
        sky += band[..., None] * cool * haze
        px = 1.0 / (gr.km * dist_c)  # radians a km of height at the limb
        hk = np.clip(alpha, 0, None) / px  # km over the limb, along the sight line
        edge = alpha > -2 / pose.F
        sky += ((np.exp(-hk / 14.0) * 0.07 + np.exp(-hk / 60.0) * 0.012) * edge * day)[..., None] * ice * haze
        rho_a = math.asin(min(1.0, (gr.R + 92.0 / gr.km) / dist_c))
        sky += (np.exp(-((alpha - (rho_a - rho)) / (6.0 * px)) ** 2) * 0.012)[..., None] * ice * haze
        if dawn > 0:
            # The sun below the limb lights the air over it from behind, in layers as it is seen from orbit: the
            # lowest air a thin gold rim, cooler air over that in ice, strongest toward the sun and gone a little
            # way along the limb from it. A dawn spread wide over the sky lies on the navy as a brown veil.
            s = np.asarray(look["sun"], np.float64)
            ts = ((vx[None, :] * (r @ s) + vy[:, None] * (u @ s) + f @ s) * inv).astype(np.float32)
            along = np.exp(-(1 - ts) / 0.1)
            lit = along * (alpha > -1.5 / pose.F)
            sky += ((np.exp(-hk / 9.0) * 0.10 * lit)[..., None] * (0.7 * gold + 0.3 * warm)
                    + (np.exp(-hk / 45.0) * 0.022 * lit)[..., None] * ice) * dawn
            # the sun's own place, just under the limb: its light gathered there, and the limb's edge brightest
            near = np.exp(-(1 - ts) / 0.02)
            rim = np.exp(-np.abs(alpha) * pose.F / 1.6)
            sky += ((near * np.exp(-hk / 60.0) * 0.12)[..., None] * gold
                    + (rim * (0.25 * along + 0.9 * near))[..., None] * (0.5 * gold + 0.5 * warm)) * dawn
        img = sky.reshape(-1, 3)

        # ---- the ground, where a ray meets it (and on the limb's last pixel, where it nearly does)
        idx = np.flatnonzero(cover.ravel() > 0)
        if len(idx):
            yi, xi = np.divmod(idx, W)
            iv = inv[yi, xi]
            D = (vx[xi, None] * r + vy[yi, None] * u + f) * iv[:, None]
            bb = b.ravel()[idx]
            disc = bb * bb - c
            sq = np.sqrt(np.maximum(disc, 0))
            t = np.where(disc > 0, c / np.maximum(-bb + sq, 1e-30), -bb)
            P = pose.pos + t[:, None] * D
            n = P - gr.C
            n /= np.linalg.norm(n, axis=1, keepdims=True)
            g = n @ gr.M
            lat = np.degrees(np.arcsin(np.clip(g[:, 2], -1, 1))).astype(np.float32)
            lon = np.degrees(np.arctan2(g[:, 1], g[:, 0])).astype(np.float32)
            cos_inc = np.clip(-np.einsum("ij,ij->i", D, n), 0, 1).astype(np.float32)
            km_px = (t * gr.km * iv / pose.F / np.sqrt(np.maximum(cos_inc, 0.02))).astype(np.float32)
            land = self.land.sample(lat, lon, km_px) / 255.0
            key, fill, hgt, rug = self.relief.sample(lat, lon, km_px)
            base = np.maximum(ground_colour(self.classes.sample(lat, lon, km_px), rug,
                                            np.clip((6.0 - km_px) / 4.0, 0, 1)), 0)
            # the land: its own colour, lit by the key light on its slopes toward it and the sky's ice on the rest
            land_c = base * (KEY_COL * (KEY_K * day * key)[:, None] + ice * (SKY_K * (0.5 + 0.5 * day) * fill)[:, None])
            # the sea: the navy, deepest over the abyss, its shallows over the shelf lifting toward the ice
            depth = np.minimum(hgt, 0.0)
            sea_c = (navy * (0.55 + 0.35 * np.exp(depth / 1500.0))[:, None]
                     + SHELF * (np.exp(depth / 120.0) + 0.25 * np.exp(depth / 700.0))[:, None])
            surf = land_c * land[:, None] + sea_c * (1 - land)[:, None]
            if dawn > 0:  # the first light on the ground, where the sun is up
                s = np.asarray(look["sun"], np.float64)
                dd = np.clip(n @ s + 0.03, 0, None).astype(np.float32) * dawn
                surf += (dd * (0.3 + 0.7 * land) * 0.05)[:, None] * gold
            # the air between: the farther and the more edge on the ground is seen, the more of the air's light is
            # over it and the less of its own comes through; along the limb it is all air
            air = 1 - np.exp(-0.035 / np.maximum(cos_inc, 0.02))
            surf = surf * (1 - 0.72 * air)[:, None] + (air * 0.035 * haze)[:, None] * ice \
                + (band.ravel()[idx] * haze)[:, None] * cool
            cv_ = cover.ravel()[idx][:, None]
            img[idx] = img[idx] * (1 - cv_) + surf.astype(np.float32) * cv_
        return img.reshape(H, W, 3)

    # -------------------------------------------------------------- the towns' lights, as points of the space

    def lights(self, pt, gr, k, reached=None, cols=None, t=0.0, gain=None):
        """Every town's lights through the painter: a pale gold, a great city's heart warm-white and a few in ice,
        each turning the system's colour, and brighter, by its share of `reached` (per light: where the system has
        reached it), and `gain` times as bright (per light, or none). Those over the horizon are left out, and those
        near the limb dimmed by the long way through the air. cols: the warm, the ice, the gold and the system's
        colour, linear."""
        cam = pt.p.pos
        P = gr.world(self.light_g)
        to = P - cam
        dist = np.linalg.norm(to, axis=1)
        n = (P - gr.C) / (gr.R)
        facing = -np.einsum("ij,ij->i", n, to) / np.maximum(dist, 1e-9)
        vis = facing > 0.003
        if not vis.any():
            return
        air = np.clip(facing[vis] / 0.3, 0, 1) ** 0.7
        flick = 0.88 + 0.12 * np.sin(t * 1.3 + self.light_ph[vis])
        kk = self.light_k[vis] * k * air * flick
        warm, ice, gcol, scol = (np.asarray(c, np.float64) for c in cols)
        hw = self.light_heart[vis][:, None]
        col = (0.5 * warm + 0.5 * gcol) * (1 - hw) + warm * hw
        col = np.where((self.light_warm[vis] > 0.94)[:, None], ice, col)
        if reached is not None:
            rk = reached[vis][:, None]
            col = col * (1 - rk) + scol * rk
            kk = kk * (1 + 1.4 * reached[vis])
        if gain is not None:
            kk = kk * gain[vis]
        # Each light stands for a patch of a town's lamps. From orbit the patches are finer than a pixel and a city
        # is their sum; nearer, a point of fixed size would leave the city as faint dots far apart. So a light
        # grows as the camera nears it, inside 600 km, its peak the same and its light as the distance's square:
        # the town keeps its brightness on the frame at every height, as a lit city does.
        sig = 0.75 * np.clip(600.0 / np.maximum(dist[vis] * gr.km, 1e-6), 1.0, 7.0)
        pt.points(P[vis], kk, col, sig, max_sigma=8.0, fog=False)
