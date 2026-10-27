"""We Are Here's Australia: the night side of the Earth under the system, from 21 s to the end.

In the silent bar the system rises out of the city into orbit, and from the drop it travels over Australia at night:
the land in moonlight, its coast, the lights of every town and city where people live, and the air along the limb.
The Earth is a sphere whose surface lies 30 units under the core (the city's ground), so the space's own light (the
core, the rings, the threads) stays as it was. What moves is the Earth: how many kilometres a unit is (the system's
height), the point under the core and the bearing the camera's -z faces there, on keys of their own (space.World),
so one world rises from a street to orbit, travels and turns without a cut.

It is drawn in two parts: the ground and the sky as a picture behind the space's light (a ray to every pixel, the
sphere it meets: Earth.plate), and the towns' lights as points of the space (Earth.lights), so they keep the lens's
focus and the shutter like everything else in it.

Everything on it is public data, read as data (fetched once into the work's cache by ../fetch.py, as the first
teaser's orbit was; no package's code is run):
  land and sea      GLOBE's 30 arc-second land mask (NOAA, public domain), global-land-mask 1.0.0's .npz
  the ground        NASA's Blue Marble Next Generation and Natural Earth's shaded relief (public domain),
                    basemap-data 2.0.0's bmng.jpg and shadedrelief.jpg
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
ORB = 30.0  # how far below the core the ground lies, in units: the city's ground

# The part of the globe every map here is cut to: Australia, New Zealand and the seas between.
NORTH, SOUTH, WEST, EAST = 0.0, -50.0, 100.0, 180.0

# The land under the moon: the emblem's ice deepened toward the navy, so the ground reads navy, not grey.
MOONLIT = np.array([0.36, 0.60, 1.0], np.float32)


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

    # The city's ground was flat, and the space's paths on it (the threads, the chase's run, the rings on the
    # ground) were drawn on it. On the Earth they are drawn the same way in its flat picture about the point under
    # the core (each place at its distance along the ground, on its bearing: the azimuthal equidistant projection)
    # and bent onto the sphere, each point keeping its height over the ground. Near the core the two are one.

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
    the two nearest levels, so the coast and the relief neither shimmer far off nor alias toward the limb."""

    def __init__(self, img, lat0, lon0, step, levels, border=0.0):
        self.levels = [img]
        for _ in range(levels - 1):
            a = self.levels[-1]
            self.levels.append(cv2.resize(a, (a.shape[1] // 2, a.shape[0] // 2), interpolation=cv2.INTER_AREA))
        self.lat0, self.lon0, self.step, self.border = lat0, lon0, step, border
        self.texel = step * 111.2  # km a cell, north to south

    def sample(self, lat, lon, km_px):
        lvl = np.clip(np.log2(np.maximum(km_px, 1e-6) / self.texel), 0, len(self.levels) - 1)
        i0 = np.minimum(np.floor(lvl).astype(np.int32), len(self.levels) - 2)
        f = (lvl - i0).astype(np.float32)
        out = np.zeros(lat.shape, np.float32)
        for k in range(len(self.levels)):
            w = np.where(i0 == k, 1 - f, 0) + np.where(i0 + 1 == k, f, 0)
            sel = w > 0
            if not sel.any():
                continue
            s = 2 ** k
            v = _grid_sample(self.levels[k], lat[sel], lon[sel], self.lat0 - (s - 1) / 2 * self.step,
                             self.lon0 + (s - 1) / 2 * self.step, self.step * s, self.border)
            out[sel] += w[sel] * v
        return out


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
            rl = cv2.imdecode(np.frombuffer(z.read("mpl_toolkits/basemap_data/shadedrelief.jpg"), np.uint8),
                              cv2.IMREAD_GRAYSCALE)
        # Both whole-Earth, row 0 at the north, column 0 at 180 W, their samples at the cells' centres. The Blue
        # Marble gives the ground's own brightness; the relief, about its middle grey, its shape.
        alb, at = self._cut(bm.astype(np.float32) @ np.array([0.11, 0.59, 0.30], np.float32) / 255)
        self.albedo = Mips(alb, *at, 4, 0.3)
        rel, at = self._cut(rl.astype(np.float32) / 255)
        rel -= float(np.median(rel))
        self.relief = Mips(rel, *at, 5, 0.0)
        # the sea's swell, from a few hundred km down to a few: it breaks the moon's path on the water into a sheen,
        # and is read at each pixel's footprint like the maps, so it neither shimmers far off nor smears near
        rng = np.random.default_rng(seed)
        sw = sum(cv2.resize(rng.normal(0, 1, (8 * 2 ** i, 13 * 2 ** i)).astype(np.float32), (1664, 1024),
                            interpolation=cv2.INTER_CUBIC) / 2 ** (i * 0.45) for i in range(8))
        self.swell = Mips((sw / sw.std()).astype(np.float32), NORTH, WEST, (NORTH - SOUTH) / 1024, 5)
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

        look: detail (0 to 1: the land's own light, its relief and its coast; at 0 the ground is the city's dark),
        moon and sun (world directions), dawn (0 to 1), haze (the air's light along the horizon), and the space's
        colours (navy, ice, gold, warm)."""
        r, u, f = pose.R
        vx = (np.arange(W, dtype=np.float64) + 0.5 - pose.cx) / pose.F
        vy = -(np.arange(H, dtype=np.float64) + 0.5 - pose.cy) / pose.F
        inv = 1.0 / np.sqrt(1.0 + vx[None, :] ** 2 + vy[:, None] ** 2)
        oc = pose.pos - gr.C
        dist_c = float(np.linalg.norm(oc))
        b = (vx[None, :] * (r @ oc) + vy[:, None] * (u @ oc) + f @ oc) * inv  # each ray's reach toward the centre
        c = float(gr._c(pose.pos))
        # each ray's angle above the limb (negative where it meets the ground): the sky is graded on it, so the
        # city's flat horizon and the orbit's curved limb are one sky
        rho = math.asin(min(1.0, gr.R / dist_c))
        alpha = (np.arccos(np.clip(-b / dist_c, -1, 1)) - rho).astype(np.float32)
        cover = np.clip(0.5 - alpha * pose.F, 0, 1)
        navy, ice, gold, warm = (np.asarray(look[k], np.float32) for k in ("navy", "ice", "gold", "warm"))
        det, dawn, haze = float(look["detail"]), float(look["dawn"]), float(look["haze"])
        # At the city's own scale the sphere's horizon still lies a degree under the horizontal (35 units up over a
        # radius of 200,000), where the city's flat ground put it at the horizontal: there the sky and its haze are
        # graded on the true horizontal, as space.backdrop drew them, and the sliver between the two is the ground's
        # dark; as the system rises (look's "flat" from 1 to 0) the limb's own dip comes in, the horizon falling away.
        flat = float(look.get("flat", 0.0))
        grade = alpha - np.float32((math.pi / 2 - rho) * flat)

        # ---- the sky: the navy of space, lifting toward the limb, the air's haze along it, and its airglow
        up = np.sin(np.clip(grade, 0, None))
        sky = navy * (0.3 + 0.7 * np.exp(-up / 0.3))[..., None]
        if flat > 0:
            sky = np.where((grade < 0)[..., None], navy * (0.28 + 0.4 * np.exp(np.minimum(grade, 0) / 0.1))[..., None],
                           sky)
        band = np.exp(-(grade / 0.14) ** 2) * 0.7 + np.exp(-(grade / 0.04) ** 2) * 0.3
        cool = np.array([0.0030, 0.0065, 0.0130], np.float32)
        sky += band[..., None] * cool * haze
        h_km = gr.height(pose.pos)
        px = 1.0 / (gr.km * dist_c)  # radians a km of height at the limb
        orbit = det * float(np.clip((h_km - 100) / 150, 0, 1))
        if orbit > 0:  # above the air: its thin bright edge on the limb, and the airglow's line 92 km over it
            rho_a = math.asin(min(1.0, (gr.R + 92.0 / gr.km) / dist_c))
            line = np.exp(-((alpha - (rho_a - rho)) / (6.0 * px)) ** 2)
            edge = np.exp(-np.clip(alpha, 0, None) / (18.0 * px)) * (alpha > -2 / pose.F)
            sky += (line * 0.020 + edge * 0.012)[..., None] * ice * haze * orbit
        if dawn > 0:
            # The sun below the limb lights the air over it from behind, in layers as it is seen from orbit: the
            # lowest air a thin gold rim, cooler air over that in ice, strongest toward the sun and gone a little
            # way along the limb from it. A dawn spread wide over the sky lies on the navy as a brown veil.
            s = np.asarray(look["sun"], np.float64)
            ts = ((vx[None, :] * (r @ s) + vy[:, None] * (u @ s) + f @ s) * inv).astype(np.float32)
            along = np.exp(-(1 - ts) / 0.1)
            hk = np.clip(alpha, 0, None) / px  # km over the limb, along the sight line
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
            alb = np.clip(self.albedo.sample(lat, lon, km_px), 0, 1)
            rel = self.relief.sample(lat, lon, km_px)
            # where a cell of the relief covers many pixels its shape is a blur, and the land keeps only its tone
            sharp = np.clip((14.0 - self.relief.texel / np.maximum(km_px, 1e-6)) / 9.0, 0, 1)
            moon = np.asarray(look["moon"], np.float64)
            lam = np.clip(n @ moon, 0, 1).astype(np.float32)
            # the land in moonlight: its own brightness and its relief, in the emblem's ice deepened to navy
            tex = alb ** 0.85 * np.clip(1.0 + 3.0 * rel * sharp, 0.1, 3.0)
            ground = navy * (0.28 + 0.4 * np.exp(-cos_inc / 0.1))[:, None]
            lit = (0.004 + 0.08 * lam) * tex
            land_c = ground * (1 - det) + det * (navy * 0.55 + MOONLIT * lit[:, None])
            # the sea: darker, and the moon's path on it, a broad sheen broken by the swell
            hv = moon[None, :] - D
            hv /= np.linalg.norm(hv, axis=1, keepdims=True)
            nh = np.clip(np.einsum("ij,ij->i", n, hv), 0, 1)
            sw = self.swell.sample(lat, lon, km_px)
            rough = np.exp(0.35 * sw)
            sheen = (nh ** (260 / rough) * 0.03 + nh ** (45 / rough) * 0.007) * (0.7 + 0.3 * sw.clip(-2, 2))
            sea_c = ground * (1 - det) + det * (navy * (0.22 + 0.12 * cos_inc)[:, None] + sheen[:, None] * ice)
            surf = land_c * land[:, None] + sea_c * (1 - land)[:, None]
            # the air along the limb over the ground: it lifts toward the edge as the sight crosses more of it; with
            # no detail yet (the city's own ground) it is the city's haze, about the horizon on both sides of it as
            # space.backdrop drew it, so the plate takes the backdrop's place without a seam
            surf += (np.exp(-cos_inc * 7.0) * 1.1 * det + band.ravel()[idx] * (1 - det))[:, None] * cool * haze
            if dawn > 0:  # the first light on the ground, where the sun is up
                s = np.asarray(look["sun"], np.float64)
                day = np.clip(n @ s + 0.03, 0, None).astype(np.float32) * dawn
                surf += (day * (0.3 + 0.7 * alb) * np.clip(1 + 2.4 * rel * sharp, 0.2, 2.6))[:, None] * gold * 0.05
            cv_ = cover.ravel()[idx][:, None]
            img[idx] = img[idx] * (1 - cv_) + surf.astype(np.float32) * cv_
        return img.reshape(H, W, 3)

    # -------------------------------------------------------------- the towns' lights, as points of the space

    def lights(self, pt, gr, k, gold=None, cols=None, t=0.0, gain=None):
        """Every town's lights through the painter: a pale gold, a great city's heart warm-white and a few in ice,
        each turning the brand's full gold, and brighter, by its share of `gold` (per light: where the system has
        reached), and `gain` times as bright (per light, or none). Those over the horizon are left out, and those
        near the limb dimmed by the long way through the air. cols: the warm, the ice and the gold, linear."""
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
        warm, ice, gcol = (np.asarray(c, np.float64) for c in cols)
        hw = self.light_heart[vis][:, None]
        col = (0.5 * warm + 0.5 * gcol) * (1 - hw) + warm * hw
        col = np.where((self.light_warm[vis] > 0.94)[:, None], ice, col)
        if gold is not None:
            gk = gold[vis][:, None]
            col = col * (1 - gk) + gcol * gk
            kk = kk * (1 + 1.4 * gold[vis])
        if gain is not None:
            kk = kk * gain[vis]
        # Each light stands for a patch of a town's lamps. From orbit the patches are finer than a pixel and a city
        # is their sum; nearer, a point of fixed size would leave the city as faint dots far apart. So a light
        # grows as the camera nears it, inside 600 km, its peak the same and its light as the distance's square:
        # the town keeps its brightness on the frame at every height, as a lit city does.
        sig = 0.75 * np.clip(600.0 / np.maximum(dist[vis] * gr.km, 1e-6), 1.0, 7.0)
        pt.points(P[vis], kk, col, sig, max_sigma=8.0, fog=False)
