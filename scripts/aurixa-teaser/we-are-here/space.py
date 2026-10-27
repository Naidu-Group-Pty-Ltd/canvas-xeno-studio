"""We Are Here's world: the system's own space, in which the whole film is one continuous move of one camera.

The space is the emblem's own: navy, gold and ice. A core of ice light (the emblem's orb), the five tiers of the
platform as five rings about it (research, clients, reports, finance, communication), the threads that join them to
the world, and far below, as little as the property world needs to be there: a city at night drawn as its streets of
light, with a few towers at its heart. comp.py draws every frame of it through the camera here, and lays the panes,
the tags, the emblem and the words over it.

Everything is light, drawn in linear light and high range (comp.Light): a point is a Gaussian of its own width,
a line is points a fraction of a pixel apart. The camera is a lens: what is off its focus spreads (its circle of
confusion), and the light keeps its energy as it spreads, so a near mote is a large faint disc and a far one a fine
point. The air dims what is far.
"""
import math

import cv2
import numpy as np

W, H, FPS = 1080, 1920, 24

GOLD = np.array([1.0, 0.72, 0.32], np.float32)
WARM = np.array([1.0, 0.86, 0.62], np.float32)
ICE = np.array([0.62, 0.84, 1.0], np.float32)
WHITE = np.array([1.0, 1.0, 1.0], np.float32)
# The brand's navy in linear light (#081629).
NAVY = np.array([0.0024, 0.0080, 0.0222], np.float32)

# The widths light is gathered at (film px): each point is spread by the nearest.
SIGMAS = np.array([0.7, 1.0, 1.4, 2.0, 2.8, 4.0, 5.6, 8.0, 11.0, 16.0, 22.0])
_EDGES = np.sqrt(SIGMAS[:-1] * SIGMAS[1:])


def clamp(x, a=0.0, b=1.0):
    return min(b, max(a, x))


def lin(t, a, b):
    return clamp((t - a) / (b - a))


def smooth(x):
    return x * x * (3 - 2 * x)


def ss(t, a, b):
    return smooth(lin(t, a, b))


def ease_out(x):
    return 1 - (1 - x) ** 3


def ease_in(x):
    return x ** 3


def ease_in_out(x):
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def flash(t, at, rise=0.04, fall=0.6):
    """A flash that rises fast and falls slowly, at `at`."""
    if t < at - rise:
        return 0.0
    if t < at:
        return lin(t, at - rise, at)
    return math.exp(-(t - at) / fall)


def unit(v):
    v = np.asarray(v, np.float64)
    return v / max(1e-12, float(np.linalg.norm(v)))


def axis_angle(axis, ang):
    x, y, z = unit(axis)
    c, s = math.cos(ang), math.sin(ang)
    C = 1 - c
    return np.array([[c + x * x * C, x * y * C - z * s, x * z * C + y * s],
                     [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
                     [z * x * C - y * s, z * y * C + x * s, c + z * z * C]])


# ------------------------------------------------------------------ motion through time


class Track:
    """A value through time, through its keys (t, value[, "hold"]): a cubic through each pair of keys whose speed at
    a key is the speed between its neighbours (zero at the first and last key, and at a key that holds), so the
    camera never jerks and only stops where it is told to."""

    def __init__(self, keys):
        self.t = np.array([k[0] for k in keys], np.float64)
        self.v = np.array([np.atleast_1d(np.asarray(k[1], np.float64)) for k in keys])
        n = len(keys)
        self.m = np.zeros_like(self.v)
        for i in range(1, n - 1):
            if len(keys[i]) > 2 and keys[i][2] == "hold":
                continue
            self.m[i] = (self.v[i + 1] - self.v[i - 1]) / (self.t[i + 1] - self.t[i - 1])
        self.scalar = np.ndim(keys[0][1]) == 0

    def __call__(self, t):
        if t <= self.t[0]:
            v = self.v[0]
        elif t >= self.t[-1]:
            v = self.v[-1]
        else:
            i = int(np.searchsorted(self.t, t)) - 1
            h = self.t[i + 1] - self.t[i]
            u = (t - self.t[i]) / h
            v = ((2 * u ** 3 - 3 * u ** 2 + 1) * self.v[i] + (u ** 3 - 2 * u ** 2 + u) * h * self.m[i]
                 + (-2 * u ** 3 + 3 * u ** 2) * self.v[i + 1] + (u ** 3 - u ** 2) * h * self.m[i + 1])
        return float(v[0]) if self.scalar else v.copy()


# ------------------------------------------------------------------ the camera


class Pose:
    """The camera at one moment: where it is, where it looks, its focal length (film px), its lens shift (where its
    axis meets the frame), and its focus and aperture (`blur`: a point at infinity spreads to this, in px)."""

    def __init__(self, pos, look, F, cx=W / 2, cy=H / 2, focus=30.0, blur=3.0, roll=0.0, up=(0.0, 1.0, 0.0)):
        self.pos = np.asarray(pos, np.float64)
        f = unit(np.asarray(look, np.float64) - self.pos)
        r = unit(np.cross(f, up))
        u = np.cross(r, f)
        if roll:
            c, s = math.cos(roll), math.sin(roll)
            r, u = r * c + u * s, -r * s + u * c
        self.R = np.stack([r, u, f])
        self.F, self.cx, self.cy, self.focus, self.blur = F, cx, cy, focus, blur

    def cam(self, P):
        """World points (N x 3) in the camera's frame: x right, y up, z ahead."""
        return (np.asarray(P, np.float64) - self.pos) @ self.R.T

    def screen(self, C):
        z = np.maximum(C[:, 2], 1e-6)
        return self.cx + self.F * C[:, 0] / z, self.cy - self.F * C[:, 1] / z

    def project(self, P):
        C = self.cam(P)
        X, Y = self.screen(C)
        return X, Y, C[:, 2]

    def defocus(self, z):
        """How far a point at distance z spreads (a Gaussian's sigma, px): half its circle of confusion."""
        return 0.5 * self.blur * np.abs(1.0 - self.focus / np.maximum(z, 1e-3))

    def ray(self, X, Y):
        """The world direction through film px (X, Y)."""
        d = np.stack([(X - self.cx) / self.F, -(Y - self.cy) / self.F, np.ones_like(X)], -1)
        return d @ self.R


# ------------------------------------------------------------------ drawing in the space


class Painter:
    """Draws points and lines of the space into a comp.Light through one pose, `weight` of the frame's light (the
    moments of a shutter share it)."""

    def __init__(self, L, pose, weight=1.0, air=160.0):
        self.L, self.p, self.w, self.air = L, pose, weight, air

    def _fog(self, z):
        return np.exp(-np.maximum(z, 0) / self.air)

    def _deposit(self, X, Y, sig, wr, wg, wb):
        b = np.digitize(sig, _EDGES)
        for i in np.unique(b):
            sel = b == i
            self.L._add(float(SIGMAS[i]), X[sel], Y[sel], wr[sel], wg[sel], wb[sel])

    def points(self, P, k, rgb, sigma=0.8, max_sigma=22.0, fog=True):
        """Points of light: in focus each peaks at k; off focus it spreads and keeps its energy (and the air dims it
        by its distance, unless `fog` is off: the Earth's lights are dimmed by the Earth's own air)."""
        P = np.asarray(P, np.float64).reshape(-1, 3)
        if not len(P):
            return
        C = self.p.cam(P)
        z = C[:, 2]
        k = np.broadcast_to(np.asarray(k, np.float64), (len(P),))
        rgb = np.broadcast_to(np.asarray(rgb, np.float64).reshape(-1, 3), (len(P), 3))
        ok = (z > 0.08) & (k > 0)
        if not ok.any():
            return
        C, z, k, rgb = C[ok], z[ok], k[ok], rgb[ok]
        X, Y = self.p.screen(C)
        sig = np.minimum(np.sqrt(sigma ** 2 + self.p.defocus(z) ** 2), max_sigma)
        m = 3 * sig + 2
        ok = (X > -m) & (X < W + m) & (Y > -m) & (Y < H + m)
        if not ok.any():
            return
        e = k[ok] * (2 * math.pi * sigma * sigma) * (self._fog(z[ok]) if fog else 1.0) * self.w
        self._deposit(X[ok], Y[ok], sig[ok], e * rgb[ok, 0], e * rgb[ok, 1], e * rgb[ok, 2])

    def segments(self, A, B, k, rgb, sigma=0.9, spacing=0.6, max_sigma=22.0):
        """Straight lines A -> B (M x 3 each): k is each line's brightness (M), or its brightness at each end (M x 2).
        Each is cut at the lens's near plane, drawn as points `spacing` px apart, and spread by its own focus."""
        A = np.asarray(A, np.float64).reshape(-1, 3)
        B = np.asarray(B, np.float64).reshape(-1, 3)
        M = len(A)
        if not M:
            return
        k = np.asarray(k, np.float64)
        k2 = np.broadcast_to(k.reshape(-1, 2) if k.ndim == 2 else np.repeat(np.broadcast_to(k, (M,))[:, None], 2, 1),
                             (M, 2)).copy()
        rgb = np.broadcast_to(np.asarray(rgb, np.float64).reshape(-1, 3), (M, 3))
        CA, CB = self.p.cam(A), self.p.cam(B)
        near = 0.08
        za, zb = CA[:, 2], CB[:, 2]
        keep = ((za > near) | (zb > near)) & (k2.max(1) > 0)
        if not keep.any():
            return
        CA, CB, za, zb, k2, rgb = CA[keep], CB[keep], za[keep], zb[keep], k2[keep], rgb[keep]
        # Cut at the near plane, the brightness carried to the cut.
        ua = np.where(za < near, (near - za) / np.where(zb - za == 0, 1, zb - za), 0.0)
        ub = np.where(zb < near, (near - zb) / np.where(za - zb == 0, 1, za - zb), 0.0)
        CA2 = CA + (CB - CA) * ua[:, None]
        CB2 = CB + (CA - CB) * ub[:, None]
        ka = k2[:, 0] + (k2[:, 1] - k2[:, 0]) * ua
        kb = k2[:, 1] + (k2[:, 0] - k2[:, 1]) * ub
        XA, YA = self.p.screen(CA2)
        XB, YB = self.p.screen(CB2)
        # Lines far outside the frame are left out; long ones are kept and cut by the point test below.
        lo = np.minimum(XA, XB) < W + 40
        lo &= np.maximum(XA, XB) > -40
        lo &= np.minimum(YA, YB) < H + 40
        lo &= np.maximum(YA, YB) > -40
        if not lo.any():
            return
        XA, YA, XB, YB, ka, kb, rgb = XA[lo], YA[lo], XB[lo], YB[lo], ka[lo], kb[lo], rgb[lo]
        za2, zb2 = CA2[lo, 2], CB2[lo, 2]
        Ls = np.hypot(XB - XA, YB - YA)
        n = np.clip(np.ceil(Ls / spacing), 1, 6000).astype(np.int64) + 1
        idx = np.repeat(np.arange(len(n)), n)
        starts = np.cumsum(n) - n
        u = (np.arange(int(n.sum())) - starts[idx]) / (n[idx] - 1)
        X = XA[idx] + (XB - XA)[idx] * u
        Y = YA[idx] + (YB - YA)[idx] * u
        # depth along the line, in perspective: 1/z is linear on the screen
        iz = (1 / za2)[idx] * (1 - u) + (1 / zb2)[idx] * u
        z = 1 / iz
        kk = ka[idx] * (1 - u) + kb[idx] * u
        sig = np.minimum(np.sqrt(sigma ** 2 + self.p.defocus(z) ** 2), max_sigma)
        m = 3 * sig + 2
        ok = (X > -m) & (X < W + m) & (Y > -m) & (Y < H + m) & (kk > 0)
        if not ok.any():
            return
        step = (Ls / (n - 1))[idx]
        # a line's light per unit of its length is kept as it spreads: in focus its middle reads k
        e = kk * step * math.sqrt(2 * math.pi) * sigma * self._fog(z) * self.w
        e, X, Y, sig, c = e[ok], X[ok], Y[ok], sig[ok], rgb[idx][ok]
        self._deposit(X, Y, sig, e * c[:, 0], e * c[:, 1], e * c[:, 2])

    def polyline(self, P, k, rgb, sigma=0.9, closed=False):
        """A line through the points P (N x 3), k per point (N) or one for all."""
        P = np.asarray(P, np.float64).reshape(-1, 3)
        if len(P) < 2:
            return
        k = np.broadcast_to(np.asarray(k, np.float64), (len(P),))
        if closed:
            P = np.vstack([P, P[:1]])
            k = np.concatenate([k, k[:1]])
        self.segments(P[:-1], P[1:], np.stack([k[:-1], k[1:]], 1), rgb, sigma)

    def glow(self, P, r, k, rgb):
        """A wide round glow about a world point: r is its radius (world units), so it shrinks with distance."""
        X, Y, z = self.p.project(np.asarray(P, np.float64).reshape(1, 3))
        if z[0] <= 0.1:
            return
        rp = self.p.F * r / z[0]
        cap = 160.0
        kk = k * (min(1.0, cap / rp) ** 2 if rp > cap else 1.0)
        self.L.glow(float(X[0]), float(Y[0]), max(1.0, min(rp, cap)), tuple(rgb), kk * float(self._fog(z)[0]) * self.w)

    def flare(self, P, k, rgb, length=1.0):
        """A star's cross of light (the emblem's sparkle): a fine horizontal and a finer vertical streak."""
        X, Y, z = self.p.project(np.asarray(P, np.float64).reshape(1, 3))
        if z[0] <= 0.1 or k <= 0:
            return
        x, y = float(X[0]), float(Y[0])
        k = k * self.w
        for dx, dy, ln, kk in ((1, 0, 60 * length, 1.0), (0, 1, 32 * length, 0.6)):
            s = np.linspace(-ln, ln, 48)
            fall = np.exp(-(s / (ln / 2.6)) ** 2)
            pts = np.stack([x + dx * s, y + dy * s], 1)
            self.L.path(pts, k * kk * fall, tuple(rgb), 0.8)


# ------------------------------------------------------------------ the sky and the ground's haze


def backdrop(pose, glow=1.0, dawn=0.0):
    """The navy of the space, by where each pixel looks: deepest overhead, lifting toward the horizon, where the
    city's light hangs in the air as a wide faint haze; below it the dark of the ground. `dawn` warms the horizon
    toward gold (the end). Linear light, H x W x 3."""
    sw, sh = W // 8, H // 8
    X, Y = np.meshgrid((np.arange(sw) + 0.5) * 8, (np.arange(sh) + 0.5) * 8)
    d = pose.ray(X.astype(np.float64), Y.astype(np.float64))
    d /= np.linalg.norm(d, axis=-1, keepdims=True)
    el = d[..., 1]  # the sine of the elevation
    up = np.clip(el, 0, 1)
    sky = NAVY * (0.3 + 0.7 * np.exp(-up / 0.3))[..., None]
    haze = (np.exp(-(el / 0.14) ** 2) * 0.7 + np.exp(-(el / 0.04) ** 2) * 0.3)[..., None]
    cool = np.array([0.0030, 0.0065, 0.0130], np.float32)
    warm = np.array([0.0110, 0.0075, 0.0040], np.float32)
    tint = cool * (1 - dawn) + warm * dawn * 1.6
    below = np.clip(-el, 0, 1)
    ground = NAVY * (0.28 + 0.4 * np.exp(-below / 0.1))[..., None]
    img = np.where(el[..., None] > 0, sky, ground) + haze * tint * glow
    return cv2.resize(img.astype(np.float32), (W, H), interpolation=cv2.INTER_CUBIC)


# ------------------------------------------------------------------ what fills the space


class Dust:
    """Motes of light in the air, drifting: what tells the eye the space is deep. A few are sparkles, as in the
    emblem's own sky."""

    def __init__(self, n=26000, seed=3, box=((-70, 70), (-26, 34), (-160, 110))):
        rng = np.random.default_rng(seed)
        lo = np.array([b[0] for b in box], np.float64)
        hi = np.array([b[1] for b in box], np.float64)
        self.P0 = lo + rng.random((n, 3)) * (hi - lo)
        self.v = rng.normal(0, 0.06, (n, 3))
        self.ph = rng.uniform(0, 6.28, n)
        self.k = 0.012 + 0.05 * rng.random(n) ** 3
        mix = rng.random(n)
        self.rgb = np.where(mix[:, None] < 0.72, ICE, np.where(mix[:, None] < 0.9, WHITE, WARM)).astype(np.float64)
        self.spark = rng.choice(n, 40, replace=False)
        self.k[self.spark] = 0.6 + 0.8 * rng.random(40)

    def at(self, t):
        return self.P0 + self.v * t + 0.12 * np.sin(t * 0.4 + self.ph)[:, None]

    def draw(self, pt, t, k=1.0):
        P = self.at(t)
        twinkle = 0.75 + 0.25 * np.sin(t * 2.1 + self.ph * 3)
        pt.points(P, self.k * twinkle * k, self.rgb, 0.75)
        for i in self.spark[:16]:
            pt.flare(P[i], 0.05 * k * twinkle[i], WHITE, 0.6)


class Stars:
    """The far sky's points: fixed, as far as the camera ever goes."""

    def __init__(self, n=2200, seed=4, r=900.0):
        rng = np.random.default_rng(seed)
        d = rng.normal(0, 1, (n, 3))
        d /= np.linalg.norm(d, axis=1, keepdims=True)
        d[:, 1] = np.abs(d[:, 1]) * 0.9 + 0.02
        d /= np.linalg.norm(d, axis=1, keepdims=True)
        self.P = d * r
        self.k = 0.02 + 0.2 * rng.random(n) ** 6
        self.rgb = np.where(rng.random(n)[:, None] < 0.8, ICE, WHITE)

    def draw(self, pt, k=1.0):
        pt.points(self.P + pt.p.pos * 0.98, self.k * k, self.rgb, 0.7, max_sigma=1.4)


class City:
    """The property world, as little as it needs to be: a city far below, as a city is seen at night from the air.
    Its streets are lines of points of light, district by district each on its own grid; a harbour and a river cut
    through it, dark; roads run out of it with their traffic moving; and at its centre a few slender towers rise,
    each a column of lit floors. Its lights are the places the system reaches (World._city draws it)."""

    def __init__(self, ground=-30.0, seed=9, centre=(0.0, -6.0), radius=190.0):
        rng = np.random.default_rng(seed)
        self.ground, self.centre = ground, np.array(centre, np.float64)
        cx, cz = centre
        # districts: each a Voronoi cell with its own street grid
        nd = 46
        ang = rng.uniform(0, 2 * math.pi, nd)
        rad = radius * np.sqrt(rng.random(nd))
        seeds = np.stack([cx + rad * np.cos(ang), cz + rad * np.sin(ang) * 1.15], 1)
        orient = rng.uniform(0, math.pi / 2, nd)
        spacing = rng.uniform(2.6, 4.4, nd)
        pts = []
        street = 0
        for d in range(nd):
            c, o, s = seeds[d], orient[d], spacing[d]
            u = np.array([math.cos(o), math.sin(o)])
            v = np.array([-u[1], u[0]])
            span = 70.0
            for direction, across in ((u, v), (v, u)):
                for off in np.arange(-span, span, s):
                    if rng.random() < 0.18:
                        continue  # a street that is not there
                    step = rng.uniform(0.55, 0.85)
                    a = np.arange(-span, span, step)
                    P = c + direction[None, :] * a[:, None] + across[None, :] * (off + rng.normal(0, 0.05))
                    P = P + rng.normal(0, 0.12, P.shape)
                    pts.append(np.column_stack([P, np.full(len(P), d), np.full(len(P), street), np.arange(len(P))]))
                    street += 1
        P = np.vstack(pts)
        # each point belongs to the district whose seed is nearest
        d2 = ((P[:, None, :2] - seeds[None, :, :]) ** 2).sum(-1)
        P = P[np.argmin(d2, 1) == P[:, 2].astype(int)]
        r = np.hypot(P[:, 0] - cx, (P[:, 1] - cz) / 1.15)
        # the harbour: water reaching in from one side, its shore a gentle curve
        shore = -55 + 30 * np.sin((P[:, 1] - cz) / 60.0) + 12 * np.sin((P[:, 1] - cz) / 23.0)
        dry = (P[:, 0] - cx) > shore
        # a river through it
        river = np.abs((P[:, 1] - cz) - 0.35 * (P[:, 0] - cx) - 18 * np.sin((P[:, 0] - cx) / 40.0) - 10) > 3.2
        dense = np.exp(-(r / (radius * 0.55)) ** 2)
        keep = dry & river & (rng.random(len(P)) < 0.12 + 0.88 * dense) & (r < radius)
        P = P[keep]
        self.lights = np.column_stack([P[:, 0], np.full(len(P), ground), P[:, 1]])
        # the streets themselves: each light joined to the next on its street, where the next is still there
        same = (P[1:, 3] == P[:-1, 3]) & (P[1:, 4] - P[:-1, 4] <= 2) & \
            (np.hypot(P[1:, 0] - P[:-1, 0], P[1:, 1] - P[:-1, 1]) < 1.8)
        i = np.nonzero(same)[0]
        self.sa, self.sb = self.lights[i], self.lights[i + 1]
        nl = len(P)
        self.lk = (0.08 + 0.32 * rng.random(nl) ** 2.5) * (0.5 + 0.5 * dense[keep])
        self.lwarm = rng.random(nl) < 0.68
        self.lph = rng.uniform(0, 6.28, nl)
        # the roads out of the city: long curves, their traffic moving along them
        roads = []
        for i in range(7):
            a0 = rng.uniform(0, 2 * math.pi)
            s = np.linspace(0, radius * 1.4, 900)
            bend = rng.normal(0, 0.003)
            a = a0 + bend * s
            pts2 = np.stack([cx + s * np.cos(a), cz + s * np.sin(a)], 1)
            roads.append(pts2)
        self.roads = roads
        self.cars = []
        for i, rd in enumerate(roads):
            m = 70
            self.cars.append((i, rng.random(m), rng.choice([-1, 1], m) * rng.uniform(0.012, 0.03, m)))
        # the towers at its centre: fine lines with their lit floors
        nt = 34
        ta = rng.uniform(0, 2 * math.pi, nt)
        tr = 16 * np.sqrt(rng.random(nt))
        self.tx = cx + 4 + tr * np.cos(ta)
        self.tz = cz + tr * np.sin(ta)
        self.th = 3.0 + rng.random(nt) ** 1.8 * 15.0
        fl = []
        for i in range(nt):
            for y in np.arange(0.9, self.th[i] - 0.3, 0.75):
                if rng.random() < 0.5:
                    fl.append((i, y))
        self.floors = np.array(fl, np.float64).reshape(-1, 2)

    def tops(self):
        return np.stack([self.tx, self.ground + self.th, self.tz], 1)


# ------------------------------------------------------------------ the five tiers


TIERS = ["research", "clients", "reports", "finance", "communication"]
BASE_R = np.array([2.2, 2.95, 3.7, 4.45, 5.2])


class Tiers:
    """The platform's five tiers, each a ring about the core with a life of its own. Research is a scan that reads
    what lies on its ring. Clients are a constellation of points, joined. Reports are pages that gather on it.
    Finance is a rise of light around it. Communication is pulses running it, and the spokes that join every ring to
    every other and to the core. Apart, each turns on its own tilt; as one, they lie in one plane and turn together;
    at the end they stand to face the camera as the emblem's rings."""

    def __init__(self, seed=21):
        rng = np.random.default_rng(seed)
        self.tilt = np.radians([20.0, -15.0, 24.0, -19.0, 12.0])
        self.az = np.array([0.4, 1.9, 3.1, 4.3, 5.4])
        self.prec = np.array([0.20, -0.16, 0.12, -0.19, 0.14])
        self.spin = np.array([0.34, -0.27, 0.21, -0.17, 0.29])
        self.ph0 = rng.uniform(0, 2 * math.pi, 5)
        self.common = 0.16
        n = 130
        self.rs_th = rng.uniform(0, 2 * math.pi, n)
        self.rs_dr = rng.normal(0, 0.1, n)
        self.rs_dy = rng.normal(0, 0.07, n)
        self.rs_k = 0.5 + 0.5 * rng.random(n)
        self.cl_th = np.linspace(0, 2 * math.pi, 12, endpoint=False) + rng.normal(0, 0.07, 12)
        self.cl_ph = rng.uniform(0, 6.28, 12)
        self.rp_th = np.linspace(0, 2 * math.pi, 8, endpoint=False) + 0.2
        self.fi_th = np.linspace(0, 2 * math.pi, 30, endpoint=False)
        self.fi_h = 0.08 + 0.62 * (np.arange(30) / 29.0) ** 1.5
        self.fi_n = 150
        self.fi_p = rng.uniform(0, 2 * math.pi, self.fi_n)
        self.fi_v = rng.uniform(0.6, 1.1, self.fi_n)
        self.fi_y = rng.uniform(0.0, 1.0, self.fi_n)
        self.cm_th = np.linspace(0, 2 * math.pi, 5, endpoint=False)

    def frame(self, i, t, apart, stand, spread=1.0, drop=1e9):
        """Tier i's ring at t: its rotation (3 x 3: the ring's own plane to the world) and its in-plane angle."""
        az = self.az[i] + self.prec[i] * min(t, drop)
        rt = axis_angle([math.cos(az), 0.0, math.sin(az)], self.tilt[i] * apart * spread)
        rs = axis_angle([1.0, 0.0, 0.0], math.pi / 2 * stand)
        phi = self.ph0[i] + self.spin[i] * min(t, drop) + self.common * max(0.0, t - drop)
        return rs @ rt, phi

    @staticmethod
    def ring(R, phi, r, th, dy=0.0, dr=0.0):
        """Points on a ring of radius r at angles th (its own), lifted dy off its plane and dr out of its radius."""
        a = th + phi
        local = np.stack([(r + dr) * np.cos(a), np.broadcast_to(dy, np.shape(a)), (r + dr) * np.sin(a)], -1)
        return local @ R.T


# ------------------------------------------------------------------ the world, through the film


class World:
    """The film's one world, at any moment: what is lit, where it is, and the camera's path through it (PLAN.md has
    the story, comp.py draws it)."""

    def __init__(self, T, drop, bars):
        self.T, self.drop, self.bars = T, drop, bars
        self.dust, self.stars, self.city, self.tiers = Dust(), Stars(), City(), Tiers()
        self._destinations()
        self._chase()
        self._camera()

    # -------------------------------------------------------------- the threads to the city

    def _destinations(self):
        """Forty places in the city the system reaches after the drop, all round it, near and far, each with the
        thread down to it from one of the tiers' rings, and when."""
        c = self.city
        rng = np.random.default_rng(31)
        L = c.lights
        cen = np.array([c.centre[0], c.centre[1]])
        rel = L[:, [0, 2]] - cen
        r = np.hypot(rel[:, 0], rel[:, 1])
        ang = np.arctan2(rel[:, 1], rel[:, 0])
        picks = []
        n = 30
        for j in range(n):
            a = 2 * math.pi * j / n + rng.normal(0, 0.05)
            want = 14 + 95 * rng.random() ** 1.3
            score = np.abs(np.angle(np.exp(1j * (ang - a)))) * 60 + np.abs(r - want)
            picks.append(int(np.argmin(score)))
        # the first two are the chase's: near the core on the camera's side, a short street apart
        for j, (a, want) in enumerate(((1.35, 26.0), (0.78, 30.0))):
            q = np.array([want * math.cos(a), want * math.sin(a)])
            picks[j] = int(np.argmin(np.hypot(L[:, 0] - q[0], L[:, 2] - q[1])))
        self.dest_i = np.array(picks)
        self.dest = L[self.dest_i].copy()
        self.dest_tier = np.arange(n) % 5
        self.dest_tier[0], self.dest_tier[1] = 4, 1
        # the thread leaves its ring where the ring faces the place
        self.dest_th = np.arctan2(self.dest[:, 2], self.dest[:, 0])
        order = np.argsort(np.mod(self.dest_th - 2.2, 2 * math.pi))
        t0 = self.T["more"] + 0.15
        span = self.T["destinations"] - 0.75 - t0
        self.dest_t = np.empty(n)
        self.dest_t[order] = t0 + span * np.arange(n) / (n - 1)
        self.dest_fly = 0.85
        # how far each of the city's lights is from the nearest reached place, and when it is reached
        d = np.hypot(L[:, 0, None] - self.dest[None, :, 0], L[:, 2, None] - self.dest[None, :, 2])
        near = np.argmin(d, 1)
        self.light_reach = self.dest_t[near] + self.dest_fly + d[np.arange(len(L)), near] / 14.0
        self.light_near = d[np.arange(len(L)), near]

    def thread(self, j, t, apart, stand, spread):
        """Thread j's curve (64 x 3) from its ring to its place: a fine line of light with a gentle outward bow."""
        i = self.dest_tier[j]
        r = BASE_R[i] * spread
        # the ring's point that faces the place, whatever the ring's turn
        p0 = (np.array([r * math.cos(self.dest_th[j]), 0.0, r * math.sin(self.dest_th[j])])) @ \
            axis_angle([1, 0, 0], math.pi / 2 * stand).T
        p3 = self.dest[j]
        out = np.array([math.cos(self.dest_th[j]), 0.0, math.sin(self.dest_th[j])])
        span = float(np.linalg.norm(p3 - p0))
        c = (p0 + p3) / 2 + out * (0.08 * span)
        u = np.linspace(0, 1, 64)[:, None]
        return (1 - u) ** 2 * p0 + 2 * (1 - u) * u * c + u ** 2 * p3

    # -------------------------------------------------------------- the pulse the camera chases

    def _chase(self):
        """Intelligence moving: a pulse leaves the outer ring, runs down a thread into the city, along its streets,
        and up another thread back to the system, then in to the core. The client's context follows it."""
        T = self.T
        # its two threads: the first two places (_destinations)
        j1, j2 = 0, 1
        self.j1, self.j2 = j1, j2
        ta = T["intelligence"]
        down = self.thread(j1, ta, 0.0, 0.0, 1.0)
        up = self.thread(j2, ta, 0.0, 0.0, 1.0)[::-1]
        a, b = down[-1], up[0]
        ground = np.stack([a + (b - a) * u for u in np.linspace(0, 1, 40)])
        ground[:, 1] = self.city.ground + 0.15
        spoke = np.stack([up[-1] * (1 - u) for u in np.linspace(0, 0.94, 30)])
        legs = [(down, ta, T["move"] + 0.05), (ground, T["move"] + 0.05, T["context"] - 0.05),
                (up, T["context"] - 0.05, T["follow"] + 0.15), (spoke, T["follow"] + 0.15, T["business"] - 0.1)]
        self.legs = []
        for pts, t0, t1 in legs:
            s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
            self.legs.append((pts, s / s[-1], t0, t1))
        self.chase_t = (ta, T["business"] - 0.1)
        rng = np.random.default_rng(41)
        seg = np.linalg.norm(b - a)
        n = max(8, int(seg / 0.5))
        u = np.linspace(0, 1, n)
        line = a[None, :] + (b - a)[None, :] * u[:, None]
        side = unit(np.cross([0.0, 1.0, 0.0], b - a))
        w = np.concatenate([line + side * 0.55, line - side * 0.55]) + rng.normal(0, 0.06, (2 * n, 3))
        w[:, 1] = self.city.ground + 0.05
        order = np.argsort(np.concatenate([u, u]))
        self.wake = w[order]

    def pulse_at(self, t):
        """Where the chased pulse is at t (None before it leaves or after it arrives)."""
        for pts, s, t0, t1 in self.legs:
            if t0 <= t <= t1:
                u = ease_in_out(lin(t, t0, t1)) if pts is self.legs[0][0] else lin(t, t0, t1)
                x = np.interp(u, s, pts[:, 0])
                y = np.interp(u, s, pts[:, 1])
                z = np.interp(u, s, pts[:, 2])
                return np.array([x, y, z])
        return None

    # -------------------------------------------------------------- the camera's one move

    def _camera(self):
        T, d = self.T, self.drop
        # the orbit about the core while the five tiers come in
        def orbit(az, el, r, look=(0.0, -0.4, 0.0)):
            a, e = math.radians(az), math.radians(el)
            return (r * math.cos(e) * math.sin(a), r * math.sin(e), r * math.cos(e) * math.cos(a)), look
        keys = []

        def key(t, pos, look, F=1663.0, cx=W / 2, cy=H / 2, blur=3.0, hold=False):
            keys.append((t, np.array(pos, np.float64), np.array(look, np.float64), F, cx, cy, blur, hold))

        key(0.0, (7.0, -23.0, 118.0), (1.0, -21.0, 0.0), 1663, blur=2.6)
        key(T["operate"], (4.0, -14.0, 90.0), (0.0, -5.0, 0.0), 1663, blur=2.6)
        key(T["not_"] - 0.2, (1.8, -2.0, 72.0), (0.0, -0.4, 0.0), 1700, blur=2.6)
        key(T["dashboards"], (1.2, -0.6, 69.0), (0.0, 0.0, 0.0), 1700)
        key(T["ambition"], (0.8, 0.6, 66.5), (0.0, 0.0, 0.0), 1700)
        key(T["changes"], (0.4, 2.6, 40.0), (0.0, 0.0, 0.0), 1700)
        p, l = orbit(0, 19, 17.5)
        key(T["names"][0], p, l, 1663)
        p, l = orbit(28, 22, 16.5)
        key(T["names"][2], p, l, 1663)
        p, l = orbit(52, 24, 16.0)
        key(T["names"][4], p, l, 1663)
        p, l = orbit(62, 21, 14.0)
        key(T["powerful"] + 0.3, p, l, 1663)
        p, l = orbit(70, 14, 9.5)
        key(d - 0.02, p, l, 1663, blur=4.0)
        p, l = orbit(76, 14, 19.0, (0.0, -3.0, 0.0))
        key(d + 0.45, p, l, 1663, blur=3.0)
        key(d + 1.15, (-3.5, 7.0, 21.0), (0.0, -3.0, -3.0), 1640, blur=2.8)
        key(T["stop"], (-7.0, 9.0, 24.0), (0.0, -6.0, -8.0), 1620, blur=2.6)
        key(T["destinations"], (-12.0, 16.0, 30.0), (0.0, -13.0, -18.0), 1600, blur=2.2)
        # the chase, from beside it: the camera runs alongside the pulse, a little above and behind, and keeps to
        # one side of it all the way, so the eye always knows where it is going
        prev = np.array([30.0, 10.0, 40.0])
        for tt in (T["intelligence"] + 0.3, T["intelligence"] + 0.62, T["move"] - 0.02, T["move"] + 0.45,
                   T["context"] - 0.12, T["context"] + 0.4, T["follow"] + 0.05, T["follow"] + 0.55):
            p = self.pulse_at(tt)
            a, b = self.pulse_at(tt - 0.12), self.pulse_at(tt + 0.12)
            if p is None or a is None or b is None:
                continue
            fwd = b - a
            fwd[1] = 0.0
            if np.linalg.norm(fwd) < 1e-3:
                fwd = np.array([p[0], 0.0, p[2]])
            fwd = unit(fwd)
            side = unit(np.cross([0.0, 1.0, 0.0], fwd))
            if np.dot(prev - p, side) < 0:
                side = -side
            pos = p + side * 9.0 + np.array([0.0, 5.5, 0.0]) - fwd * 5.0
            pos[1] = max(pos[1], self.city.ground + 7.0)
            key(tt, pos, p + fwd * 1.5, 1550, blur=2.8)
            prev = pos
        key(T["business"], (-3.0, 8.0, 20.0), (0.0, -6.0, -10.0), 1500, blur=2.5)
        key(T["one"], (-9.0, 15.0, 33.0), (0.0, -14.0, -26.0), 1550, blur=2.0)
        key(T["so"] + 0.3, (-3.0, 4.0, 24.0), (0.0, -0.5, 0.0), 1663, blur=2.5)
        key(T["is_"], (0.0, 1.6, 19.0), (0.0, 0.2, 0.0), 1663, blur=3.0)
        key(T["ask"] + 0.2, (0.0, 1.4, 19.5), (0.0, 0.1, 0.0), 1663, cy=H / 2, blur=3.0)
        key(T["system"], (0.0, 0.0, 27.5), (0.0, 0.0, 0.0), 1663, cy=710.5, blur=2.4)
        key(45.5, (0.0, 0.0, 26.6), (0.0, 0.0, 0.0), 1663, cy=710.5, blur=2.4)
        keys.sort(key=lambda k: k[0])
        self.keys = keys
        self.c_pos = Track([(k[0], k[1]) + (("hold",) if k[7] else ()) for k in keys])
        self.c_look = Track([(k[0], k[2]) for k in keys])
        self.c_F = Track([(k[0], k[3]) for k in keys])
        self.c_cy = Track([(k[0], k[5]) for k in keys])
        self.c_blur = Track([(k[0], k[6]) for k in keys])

    def pose(self, t):
        pos, look = self.c_pos(t), self.c_look(t)
        focus = float(np.linalg.norm(look - pos))
        return Pose(pos, look, self.c_F(t), W / 2, self.c_cy(t), focus=focus, blur=self.c_blur(t))

    # -------------------------------------------------------------- what the world is doing at t

    def state(self, t):
        """The tiers' shape at t: how far apart (1, each on its own tilt) or one (0), how far stood up to face the
        camera (1 at the end), how far spread (the silent bar pulls them away from each other), how near the core
        (the moment before the drop draws them in)."""
        T, d = self.T, self.drop
        apart = 1.0 if t < d else 1.0 - ease_out(lin(t, d, d + 0.3))
        stand = ease_in_out(lin(t, T["ask"] + 0.15, T["becomes"] + 0.25))
        spread = 1.0 + 0.32 * ss(t, T["powerful"], T["own"] + 0.25)
        if t < d:
            spread *= 1.0 - 0.72 * ease_in(lin(t, d - 0.42, d))
        else:
            spread = 0.28 + 0.72 * ease_out(lin(t, d, d + 0.28)) + 0.06 * math.sin(math.pi * lin(t, d + 0.1, d + 0.9))
        # at the end the rings take the emblem's radii (the camera's end distance gives their size on the frame)
        return apart, stand, spread

    def core_light(self, t):
        T, d = self.T, self.drop
        k = 0.04 + 0.96 * ss(t, T["operate"] - 0.12, T["operate"] + 0.18)
        fl = (0.9 * flash(t, T["operate"] + 0.08, 0.08, 0.6) + 1.3 * flash(t, T["changes"], 0.1, 0.7)
              + 2.4 * flash(t, d, 0.03, 0.5) + 0.8 * flash(t, T["destinations"], 0.06, 0.5)
              + 1.2 * flash(t, T["one"], 0.03, 0.5) + 1.6 * flash(t, T["system"], 0.06, 0.6))
        # the silent bar: the core gathers itself before the drop
        gather = ss(t, T["own"] - 0.2, d) * (t < d)
        return k, fl, gather

    def draw(self, L, t, weight=1.0):
        T, d = self.T, self.drop
        pose = self.pose(t)
        pt = Painter(L, pose, weight)
        apart, stand, spread = self.state(t)
        # the far sky and the air
        self.stars.draw(pt, 1.0 - 0.6 * ss(t, T["intelligence"], T["move"]) + 0.6 * ss(t, T["business"], T["one"]))
        self.dust.draw(pt, t, 1.0)
        # the city: there from the first frame, reached by the system after the drop, all of it as one on "one"
        reach = np.clip((t - self.light_reach) / 0.5, 0, 1) * (self.light_near < 16) * (t > d)
        sweep_r = 260 * ease_in_out(lin(t, T["business"] - 0.2, T["one"]))
        cdist = np.hypot(self.city.lights[:, 0] - self.city.centre[0], self.city.lights[:, 2] - self.city.centre[1])
        wave = np.clip((sweep_r - cdist) / 18.0, 0, 1) * (t > T["business"] - 0.2)
        lit = np.maximum(reach, wave)
        one = flash(t, T["one"], 0.03, 0.45)
        settle = 1 - 0.55 * ss(t, T["ask"], T["becomes"] + 0.5)
        city_k = (0.85 + 1.4 * one) * settle * (1 + 0.5 * self.beat(t))
        self._city(pt, t, lit, city_k, one)
        # the core, and the thread that rises from it on "operate"
        ck, fl, gather = self.core_light(t)
        self._core(pt, L, pose, t, ck, fl, gather)
        climb = ease_out(lin(t, T["operate"] + 0.2, T["differently"] + 0.8)) * (1 - ss(t, T["changes"], T["changes"] + 0.4))
        if climb > 0:
            top = 2.0 + climb * 60
            pt.segments([[0, 0.25, 0]], [[0, top, 0]], np.array([[1.6, 0.3]]) * ck, WARM, 0.9)
            pt.segments([[0, 0.25, 0]], [[0, top, 0]], np.array([[0.25, 0.04]]) * ck, GOLD, 3.0)
        # the tiers
        self._tiers(pt, t, apart, stand, spread)
        # the threads to the city and their pulses
        self._threads(pt, t, apart, stand, spread)
        # intelligence moving
        self._chase_draw(pt, t)
        # the waves: on "operate", on "changes", at the drop, on "one", and the emblem's pulses at the end
        self._waves(pt, L, pose, t)
        # the emblem's triangle, drawn by the system
        self._triangle(pt, t)
        return pose

    def sky(self, t):
        """The backdrop's haze (how much of the city's light hangs at the horizon) and its dawn (the end warms it)."""
        T = self.T
        return 1.0 + 0.6 * flash(t, T["one"], 0.05, 0.8), 0.85 * ss(t, T["aurixa"] - 0.6, 45.5)

    def beat(self, t):
        """The track's beat after the drop: a soft lift on each beat, stronger on the bar."""
        if t < self.drop:
            return 0.0
        q = self.bars[1] - self.bars[0]
        u = (t - self.drop) / (q / 4)
        ph = u - math.floor(u)
        on_bar = (int(math.floor(u)) % 4) == 0
        return math.exp(-ph * 5) * (1.0 if on_bar else 0.45) * (1 - ss(t, self.T["so"], self.T["so"] + 0.4)) + \
            math.exp(-ph * 5) * 0.6 * ss(t, self.T["aurixa"] - 0.5, self.T["aurixa"]) * on_bar

    # -------------------------------------------------------------- the parts

    def _city(self, pt, t, lit, k, one):
        c = self.city
        warm = np.where(c.lwarm[:, None], WARM, ICE)
        col = warm * (1 - lit[:, None]) + GOLD * lit[:, None]
        flick = 0.8 + 0.2 * np.sin(t * 1.7 + c.lph)
        pt.points(c.lights, c.lk * k * flick * (1 + 1.3 * lit), col, 0.75)
        pt.segments(c.sa, c.sb, 0.022 * k, WARM * 0.5 + ICE * 0.5, 0.7)
        for rd in c.roads:
            P = np.column_stack([rd[:, 0], np.full(len(rd), c.ground), rd[:, 1]])
            pt.polyline(P[::6], 0.03 * k, WARM, 0.8)
        for i, u0, v in c.cars:
            rd = c.roads[i]
            u = np.mod(u0 + v * t, 1.0)
            j = np.clip((u * (len(rd) - 1)).astype(int), 0, len(rd) - 1)
            P = np.column_stack([rd[j, 0], np.full(len(j), c.ground + 0.05), rd[j, 1]])
            pt.points(P, 0.3 * k, np.where((v > 0)[:, None], WARM, ICE), 0.8)
        n = len(c.tx)
        base = np.stack([c.tx, np.full(n, c.ground), c.tz], 1)
        top = c.tops()
        tl = float(np.clip((t - self.drop - 1.0) / 1.5, 0, 1)) * (t > self.drop)
        tl = max(tl, one)
        tcol = ICE * (1 - tl) + GOLD * tl
        pt.segments(base, top, np.stack([np.full(n, 0.012), np.full(n, 0.05)], 1) * k * (1 + tl), tcol, 0.8)
        pt.points(top, 0.6 * k * (1 + tl), tcol, 0.85)
        if len(c.floors):
            i = c.floors[:, 0].astype(int)
            P = np.stack([c.tx[i], c.ground + c.floors[:, 1], c.tz[i]], 1)
            pt.points(P, 0.24 * k * (1 + 1.2 * tl), WARM * (1 - tl) + GOLD * tl, 0.75)


    def _core(self, pt, L, pose, t, k, fl, gather):
        if k <= 0:
            return
        O = np.zeros((1, 3))
        # bounded: a hotter core only blooms wider, and the bloom would veil the navy
        hot = k * min(3.2, 1 + fl + 1.5 * gather)
        pt.points(O, 7.0 * hot, WHITE, 1.3)
        pt.points(O, 1.3 * hot, ICE, 4.0)
        pt.glow(O[0], 0.42, 0.22 * k * (1 + 0.6 * min(fl, 2.0)), ICE)
        pt.glow(O[0], 1.3, 0.035 * k * (1 + 0.5 * min(fl, 2.0)), ICE)
        if fl > 0.02:
            X, Y, z = pose.project(O)
            if z[0] > 0.2:
                L.streak(float(X[0]), float(Y[0]), 260 * (0.4 + min(fl, 2.0)), tuple(0.6 * GOLD + 0.4 * ICE), 0.7 * min(fl, 2.0) * pt.w)

    def _tiers(self, pt, t, apart, stand, spread):
        T, d = self.T, self.drop
        tr = self.tiers
        ghost = ss(t, T["changes"] + 0.05, T["changes"] + 0.6)
        elem = 1 - ss(t, T["ask"], T["becomes"])
        # as the rings are drawn into the core before the drop their details go, and they come back after the burst
        elem *= 1 - (ss(t, d - 0.42, d - 0.14) if t < d else 1 - ss(t, d + 0.18, d + 0.6))
        # once the emblem has landed the rings go, with the system's triangle: the logo's own rings stay, as it is
        end = 1 - ss(t, T["aurixa"] + 0.15, T["aurixa"] + 1.1)
        sep = ss(t, T["powerful"], T["own"]) * (t < d)  # the silent bar: each on its own
        bt = self.beat(t)
        th = np.linspace(0, 2 * math.pi, 361)
        rings = []
        for i in range(5):
            R, phi = tr.frame(i, t, apart, stand, 1.0, d)
            a = ss(t, T["names"][i] - 0.08, T["names"][i] + 0.3)
            r = BASE_R[i] * spread
            rings.append((R, phi, r, a))
            if ghost <= 0:
                continue
            col = GOLD * a + ICE * (1 - a)
            k_ring = (0.06 * ghost + (0.26 + 0.2 * bt) * a) * end
            P = tr.ring(R, 0.0, r, th)
            pt.polyline(P, k_ring, col, 0.9)
            if a <= 0 or elem <= 0:
                continue
            ka = a * elem
            age = t - T["names"][i]
            if i == 0:  # research: a scan reading the ring, its points answering
                head = tr.ph0[0] + 2.7 * age
                lag = np.mod(head - (tr.rs_th + phi), 2 * math.pi)
                kk = (0.06 + 1.1 * np.exp(-lag / 0.55)) * tr.rs_k * ka
                P = tr.ring(R, phi, r, tr.rs_th, tr.rs_dy, tr.rs_dr)
                pt.points(P, kk, ICE, 0.85)
                arc = np.linspace(head - 0.7, head, 40)
                Pa = tr.ring(R, 0.0, r, arc)
                pt.polyline(Pa, np.linspace(0, 1.5, 40) * ka, GOLD, 1.0)
                pt.segments([[0, 0, 0]], [tr.ring(R, 0.0, r, np.array([head]))[0]], np.array([[0.05, 0.35]]) * ka, ICE, 0.8)
            elif i == 1:  # clients: points of light, joined
                P = tr.ring(R, phi, r, tr.cl_th)
                on = np.clip((age - np.arange(12) * 0.03) / 0.2, 0, 1)
                pulse = 0.8 + 0.2 * np.sin(t * 2.4 + tr.cl_ph)
                pt.points(P, 1.8 * on * pulse * ka, WARM, 1.0)
                pt.points(P, 0.22 * on * ka, GOLD, 3.0)
                j2 = (np.arange(12) + 2) % 12
                pt.segments(P, P[j2], np.minimum(on, on[j2]) * 0.12 * ka, ICE, 0.8)
            elif i == 2:  # reports: pages gathering on the ring
                for j, a0 in enumerate(tr.rp_th):
                    f = ease_out(clamp((age - j * 0.045) / 0.45))
                    if f <= 0:
                        continue
                    ang = a0 + phi
                    rr = r * (1.6 - 0.6 * f)
                    c = np.array([rr * math.cos(ang), 0.0, rr * math.sin(ang)])
                    out = np.array([math.cos(ang), 0.0, math.sin(ang)])
                    tan = np.array([-math.sin(ang), 0.0, math.cos(ang)])
                    up = np.array([0.0, 1.0, 0.0])
                    w2, h2 = 0.25, 0.34
                    corners = np.array([c - tan * w2 - up * h2, c + tan * w2 - up * h2, c + tan * w2 + up * h2,
                                        c - tan * w2 + up * h2]) @ R.T
                    kk = 0.55 * f * ka
                    pt.polyline(corners, kk, ICE, 0.8, closed=True)
                    for yy in (0.45, 0.1, -0.25):
                        a1 = c - tan * w2 * 0.7 + up * h2 * yy
                        b1 = c + tan * w2 * (0.7 if yy < 0.4 else 0.2) + up * h2 * yy
                        pt.segments((a1 @ R.T)[None], (b1 @ R.T)[None], 0.18 * kk, ICE, 0.75)
                    del out
            elif i == 3:  # finance: a rise of light around the ring, and its flow
                base = tr.ring(R, phi, r, tr.fi_th)
                grow = ease_out(clamp(age / 0.6))
                h = tr.fi_h * grow * (1 + 0.15 * bt)
                upv = R @ np.array([0.0, 1.0, 0.0])
                tops = base + upv[None, :] * h[:, None]
                pt.segments(base, tops, np.stack([0.1 * np.ones(30), 0.7 * np.ones(30)], 1) * ka, GOLD, 0.85)
                pt.points(tops, 0.9 * ka, WARM, 0.9)
                ang = tr.fi_p + tr.fi_v * age * 1.6
                P = tr.ring(R, phi, r, ang, tr.fi_y * 0.15)
                pt.points(P, 0.45 * ka, GOLD, 0.8)
            else:  # communication: pulses running the ring
                for j, a0 in enumerate(tr.cm_th):
                    hd = a0 + phi + 2.3 * age
                    arc = np.linspace(hd - 0.5, hd, 24)
                    Pa = tr.ring(R, 0.0, r, arc)
                    pt.polyline(Pa, np.linspace(0, 1.4, 24) * ka, WARM, 1.0)
                    pt.points(Pa[-1:], 2.2 * ka, WHITE, 1.2)
        # the spokes: every ring joined to the core as it comes in, and on "communication" all of them to each other
        comm = ss(t, T["names"][4] - 0.05, T["names"][4] + 0.45) * (1 - 0.85 * sep) * elem
        for i, (R, phi, r, a) in enumerate(rings):
            k_sp = 0.16 * a * (1 - 0.85 * sep) * elem * (1 + bt)
            if k_sp <= 0.002:
                continue
            for j in range(3):
                ang = tr.ph0[i] * 0.5 + j * 2 * math.pi / 3 + 0.3 * i
                p = tr.ring(R, phi, r, np.array([ang]))[0]
                pt.segments([[0, 0, 0]], [p], np.array([[k_sp * 0.4, k_sp]]), GOLD, 0.8)
                # a pulse out along it, and back
                u = (t * 0.7 + 0.31 * j + 0.17 * i) % 1.0
                pt.points([p * u], 1.2 * k_sp / 0.16 * a, WARM, 1.0)
        if comm > 0:
            for s in range(5):
                ang = s * 2 * math.pi / 5 + 0.2 * t
                P = np.stack([tr.ring(R, 0.0, r, np.array([ang]))[0] for (R, phi, r, a) in rings])
                P = np.vstack([np.zeros((1, 3)), P])
                pt.polyline(P, 0.22 * comm * (1 + bt), GOLD, 0.85)
                # a pulse running out through all five, and one running in
                for u0, sgn in ((0.0, 1), (0.5, -1)):
                    u = (t * 0.9 + u0 + s * 0.13) % 1.0
                    u = u if sgn > 0 else 1 - u
                    seg = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
                    q = np.array([np.interp(u * seg[-1], seg, P[:, c]) for c in range(3)])
                    pt.points([q], 2.0 * comm, WHITE, 1.1)
        self._rings = rings

    def _threads(self, pt, t, apart, stand, spread):
        T, d = self.T, self.drop
        if t < self.dest_t.min():
            return
        retract = ss(t, T["ask"] + 0.1, T["becomes"] + 0.1)
        flare = flash(t, T["destinations"], 0.05, 0.5) + 1.2 * flash(t, T["one"], 0.03, 0.45)
        bt = self.beat(t)
        for j in range(len(self.dest)):
            g = ease_in_out(lin(t, self.dest_t[j], self.dest_t[j] + self.dest_fly))
            if g <= 0:
                continue
            C = self.thread(j, t, apart, stand, spread)
            lo = retract
            hi = g * (1 - retract)
            if hi <= lo + 0.005:
                continue
            u = np.linspace(0, 1, 64)
            keep = (u >= lo) & (u <= hi)
            seg = C[keep]
            if len(seg) < 2:
                continue
            k = (0.3 + 0.8 * flare + 0.3 * bt) * np.linspace(1.0, 0.6, len(seg))
            pt.polyline(seg, k, GOLD, 0.8)
            pt.polyline(seg, 0.05 * k, GOLD, 3.0)
            if g < 1:
                pt.points(seg[-1:], 3.0, WHITE, 1.2)
                pt.points(seg[-1:], 0.4, GOLD, 3.5)
            else:
                arrive = flash(t, self.dest_t[j] + self.dest_fly, 0.03, 0.6)
                if arrive > 0.01:
                    pt.points(self.dest[j:j + 1], 4.0 * arrive, WHITE, 1.2)
                    ring = np.linspace(0, 2 * math.pi, 72)
                    rr = 0.3 + 4.0 * (1 - arrive)
                    P = self.dest[j] + np.stack([rr * np.cos(ring), np.zeros(72), rr * np.sin(ring)], 1)
                    pt.polyline(P, 0.7 * arrive, GOLD, 0.85, closed=True)
                pt.points(self.dest[j:j + 1], 0.9 * (1 + flare), WARM, 1.0)
                # pulses down each thread on the beat
                if t < T["ask"]:
                    for u0 in (0.0, 0.5):
                        u = ((t - self.dest_t[j]) * 0.55 + u0 + j * 0.071) % 1.0
                        if lo < u < hi:
                            i = int(u * 63)
                            pt.points(C[i:i + 1], 1.6, WARM, 1.0)

    def _chase_draw(self, pt, t):
        a, b = self.chase_t
        if not (a - 0.02 < t < b + 0.3):
            return
        p = self.pulse_at(min(t, b))
        if p is None:
            return
        fade = 1 - lin(t, b - 0.05, b + 0.3)
        tail = [self.pulse_at(max(a, min(b, t - s))) for s in np.linspace(0.5, 0.0, 30)]
        tail = np.array([q for q in tail if q is not None])
        if len(tail) > 1:
            pt.polyline(tail, np.linspace(0, 1.8, len(tail)) * fade, WARM, 1.0)
            pt.polyline(tail, np.linspace(0, 0.25, len(tail)) * fade, GOLD, 4.0)
        pt.points([p], 16.0 * fade, WHITE, 1.4)
        pt.points([p], 2.0 * fade, WARM, 3.5)
        pt.glow(p, 0.35, 0.22 * fade, WARM)
        # the street it runs lights behind it, and stays lit: a line of the city's lights turned gold
        pts, sv, t0, t1 = self.legs[1]
        if t > t0:
            u = np.clip((np.linspace(0, 1, len(self.wake)) - 0.0), 0, 1)
            passed = t0 + (t1 - t0) * u
            on = np.clip((t - passed) / 0.12, 0, 1) * (t > passed)
            k = on * (0.55 + 1.6 * np.exp(-(t - passed) / 0.35)) * (1 - ss(t, self.T["ask"], self.T["becomes"]))
            pt.points(self.wake, k, GOLD * 0.6 + WARM * 0.4, 1.2)
            a0, b0 = pts[0], pts[-1]
            reach = clamp((t - t0) / (t1 - t0))
            e = a0 + (b0 - a0) * reach
            kl = 0.6 * (1 - ss(t, self.T["ask"], self.T["becomes"]))
            pt.segments([a0], [e], np.array([[0.5 * kl, kl]]), GOLD, 1.0)
            pt.segments([a0], [e], np.array([[0.04 * kl, 0.08 * kl]]), GOLD, 6.0)

    def _waves(self, pt, L, pose, t):
        T, d = self.T, self.drop
        X, Y, z = pose.project(np.zeros((1, 3)))
        if z[0] <= 0.3:
            return
        x, y, zz = float(X[0]), float(Y[0]), float(z[0])
        s = pose.F / zz  # px per world unit at the core
        for at, life, rmax, k, col in ((T["operate"] + 0.05, 1.0, 9.0, 0.7, GOLD), (T["changes"], 0.9, 30.0, 0.9, mixc_np(ICE, GOLD, 0.3)),
                                       (d, 0.8, 40.0, 1.3, mixc_np(WARM, ICE, 0.2)), (T["one"], 0.9, 40.0, 0.8, GOLD),
                                       (T["system"], 0.9, 30.0, 0.9, mixc_np(ICE, GOLD, 0.4))):
            g = lin(t, at, at + life)
            if 0 < g < 1:
                r = (0.4 + rmax * ease_out(g)) * s
                if r < 2600:
                    L.ring(x, y, r, tuple(col), k * (1 - g) ** 1.5 * pt.w, 1.3)
                    L.ring(x, y, r, tuple(col), 0.08 * k * (1 - g) ** 1.5 * pt.w, 14.0)
        # the ground's ring on "one": the whole city answering at once
        g = lin(t, T["one"], T["one"] + 1.2)
        if 0 < g < 1:
            c = self.city
            rr = 5 + 260 * ease_out(g)
            ring = np.linspace(0, 2 * math.pi, 400)
            P = np.stack([c.centre[0] + rr * np.cos(ring), np.full(400, c.ground + 0.1), c.centre[1] + rr * np.sin(ring)], 1)
            pt.polyline(P, 0.9 * (1 - g) ** 1.4, GOLD, 1.0, closed=True)
        # the emblem's pulses, from the orb, on "Aurixa", on "Systems" and on the bars after
        for at in (T["aurixa"], T["systems"] + 0.05, self.bars[22], self.bars[23]):
            g = lin(t, at, at + 1.6)
            if 0 < g < 1:
                r = (0.6 + 24.0 * ease_out(g)) * s
                kk = (1.0 if at == T["aurixa"] else 0.7) * (1 - g) ** 1.7
                L.ring(x, y, r, tuple(mixc_np(ICE, GOLD, 0.35)), 1.1 * kk * pt.w, 1.2)
                L.ring(x, y, r, tuple(mixc_np(ICE, GOLD, 0.35)), 0.1 * kk * pt.w, 12.0)

    # The emblem's triangle (the art's apex and lower corners, as the end card places them on the frame) carried back
    # into the space through the camera's last pose: 27.5 from the core, 1663 px of focal length, its axis at y 710.5.
    TRI = np.array([[0.0, 5.424, 0.0], [-4.997, -3.098, 0.0], [5.063, -2.900, 0.0]])

    def _triangle(self, pt, t):
        T = self.T
        a = T["becomes"] - 0.05
        # once the emblem has landed the triangle gives way to it entirely, and the logo stays as it is
        k = 1.0 - ss(t, T["aurixa"] + 0.05, T["aurixa"] + 0.9)
        if t < a or k <= 0:
            return
        lock = flash(t, T["system"], 0.05, 0.6)
        A, Bl, Br = self.TRI
        for (p, q, t0, t1) in ((A, Bl, a, a + 0.45), (A, Br, a, a + 0.45), (Bl, Br, a + 0.3, T["system"] + 0.05)):
            g = ease_in_out(lin(t, t0, t1))
            if g <= 0:
                continue
            e = p + (q - p) * g
            kk = (1.6 + 2.5 * lock) * k
            pt.segments([p], [e], kk, WARM, 1.1)
            pt.segments([p], [e], 0.16 * kk, GOLD, 5.0)
            if g < 1:
                pt.points([e], 4.0 * k, WHITE, 1.4)

    # -------------------------------------------------------------- what the words need: where the tiers are

    LABEL_DIRS = np.array([[-0.75, -0.66], [0.75, -0.66], [-0.8, 0.6], [0.8, 0.6], [0.0, 1.0]])
    # each name's width on the frame (Inconsolata 700 at 30 px, letter-spaced 0.3 em: 24 px a letter), and how far
    # from its point it begins
    LABEL_W = np.array([8, 7, 7, 7, 13]) * 24.0
    LABEL_GAP = 66.0

    def labels(self, t):
        """Each tier's name at t: the point of its ring furthest toward its own side of the frame, from the core, of
        those that leave the whole name inside the frame and above the words; and how much it shows."""
        pose = self.pose(t)
        apart, stand, spread = self.state(t)
        T, d = self.T, self.drop
        X0, Y0, _ = pose.project(np.zeros((1, 3)))
        out = []
        th = np.linspace(0, 2 * math.pi, 240, endpoint=False)
        for i in range(5):
            R, phi = self.tiers.frame(i, t, apart, stand, 1.0, d)
            P = self.tiers.ring(R, 0.0, BASE_R[i] * spread, th)
            X, Y, z = pose.project(P)
            dx, dy = self.LABEL_DIRS[i]
            w = self.LABEL_W[i]
            if dy > 0.7:  # the name centred below its point
                x0, x1, y0, y1 = X - w / 2, X + w / 2, Y, Y + 56 + 34
            elif dx < 0:  # the name to the left of its point
                x0, x1, y0, y1 = X - self.LABEL_GAP - w, X, Y - 20, Y + 20
            else:
                x0, x1, y0, y1 = X, X + self.LABEL_GAP + w, Y - 20, Y + 20
            fits = (x0 > 28) & (x1 < W - 28) & (y0 > 180) & (y1 < 1500) & (z > 0.5)
            score = (X - X0[0]) * dx + (Y - Y0[0]) * dy - 1e6 * (~fits)
            j = int(np.argmax(score))
            a = ss(t, T["names"][i] - 0.06, T["names"][i] + 0.22) * (1 - ss(t, T["powerful"] - 0.2, T["powerful"] + 0.15))
            out.append(dict(x=float(X[j]), y=float(Y[j]), k=float(a), dx=float(dx), dy=float(dy)))
        return out

    def tag_anchor(self, t, lag):
        """Where the client's context is as it follows the pulse: the pulse's place `lag` seconds before, on the frame."""
        a, b = self.chase_t
        p = self.pulse_at(min(b, max(a, t - lag)))
        if p is None:
            return None
        X, Y, z = self.pose(t).project(p[None])
        if z[0] < 0.5:
            return None
        return float(X[0]), float(Y[0]), float(z[0])


def mixc_np(a, b, k):
    return np.asarray(a) * (1 - k) + np.asarray(b) * k
