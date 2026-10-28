"""We Are Here's world: the system's own space, in which the whole film is one continuous move of one camera.

The space is the emblem's own, navy with its ice, and the system's light in it is electric cyan, set off against
the gold land below. A core of ice light (the emblem's orb), the five tiers of the platform as five rings about it
(research, clients, reports, finance, communication), the threads that join them to the country, and below, from the
first frame to the last, Australia (earth.py): its land in relief, its coast and its seas, every town's lights.
comp.py draws every frame of it through the camera here, and lays the panes, the tags, the emblem and the words over
it.

The system stays where it is and the Earth moves under it, on keys of its own (World._beats): how high the system
stands over the country, over which place, and which way the camera looks. It opens on the whole continent from
orbit at night, until on "operate" the system's light runs out over it (World.light_wave), comes down over the east
coast while the five tiers come in, rises in the silent bar so the drop lands over all of it, sends its threads to
forty places in every state and territory, which link up with each other across the country and carry its traffic
(World._network), goes down with the pulse the camera chases into Sydney, rises again for "one", when a beam of light
stands up from every place, draws the country's light up its threads into the core, and turns east over the land
toward the dawn for the end.

Everything is light, drawn in linear light and high range (comp.Light): a point is a Gaussian of its own width,
a line is points a fraction of a pixel apart. The camera is a lens: what is off its focus spreads (its circle of
confusion), and the light keeps its energy as it spreads, so a near mote is a large faint disc and a far one a fine
point. The air dims what is far.
"""
import heapq
import math

import cv2
import numpy as np

import earth as geo_earth

W, H, FPS = 1080, 1920, 24

# The places the threads reach, in every state and territory: the chase's two first (its run is from Dubbo, a regional
# city, 269 km over the ranges into Sydney to the demo property's pin, Banksia Rise, a suburb that does not exist, where
# Reel 1 put it), then the eight capitals, then regional cities across the country.
PLACES = ["Dubbo", "Banksia Rise", "Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Hobart", "Darwin",
          "Canberra", "Newcastle", "Wollongong", "Gold Coast", "Geelong", "Ballarat", "Bendigo", "Albury",
          "Wagga Wagga", "Tamworth", "Coffs Harbour", "Toowoomba", "Rockhampton", "Mackay", "Townsville", "Cairns",
          "Mount Isa", "Launceston", "Mildura", "Broken Hill", "Port Augusta", "Mount Gambier", "Bunbury", "Albany",
          "Geraldton", "Kalgoorlie", "Karratha", "Broome", "Katherine", "Alice Springs", "Tennant Creek"]
BANKSIA_RISE = (-33.692, 150.915)
# The routes the system's pulses run, each from one state or territory to another across the network's links
ROUTES = [("Perth", "Sydney"), ("Darwin", "Melbourne"), ("Brisbane", "Adelaide"), ("Hobart", "Cairns"),
          ("Broome", "Canberra"), ("Adelaide", "Darwin"), ("Sydney", "Perth"), ("Melbourne", "Brisbane"),
          ("Alice Springs", "Gold Coast"), ("Karratha", "Hobart"), ("Townsville", "Bunbury"), ("Canberra", "Darwin")]
LINK_MAX, LINK_NEAR = 1600.0, 0.92  # km: the mesh's longer crossings are left out; _network
ROUTE_KMS, ROUTE_TAIL, ROUTE_EVERY = 4200.0, 700.0, 1.9  # a pulse's speed (km a second), its tail (km), its round (s)

GOLD = np.array([1.0, 0.72, 0.32], np.float32)
WARM = np.array([1.0, 0.86, 0.62], np.float32)
ICE = np.array([0.62, 0.84, 1.0], np.float32)
WHITE = np.array([1.0, 1.0, 1.0], np.float32)
# The system's light is electric cyan (the client's note 10: gold light did not stand out over the gold land): CYAN is
# its glow and its fine lines, electric cyan itself (#0FF0FC), CYAN_HOT its core, a pale cyan that goes to white as it
# passes the top. A dim cyan line reads as teal where a dim gold one read as gold, so CYAN carries 1.6 times the light
# the gold did. Everything the system draws is in these; the land, the towns' own lights, the sky and its dust, the
# core's ice and the supplied logo keep their own.
CYAN = np.array([0.005, 0.87, 0.97], np.float32) * 1.6
CYAN_HOT = np.array([0.43, 0.97, 1.0], np.float32)
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
    moments of a shutter share it). With a `ground` (earth.Ground), what is drawn with `occlude` is hidden where the
    Earth stands between it and the camera: the threads and the rings on the ground, over the limb."""

    def __init__(self, L, pose, weight=1.0, air=160.0, ground=None):
        self.L, self.p, self.w, self.air, self.ground = L, pose, weight, air, ground

    def _fog(self, z):
        return np.exp(-np.maximum(z, 0) / self.air)

    def _seen(self, C):
        """Which points (in the camera's frame) the Earth leaves in sight."""
        return ~self.ground.hidden(self.p.pos + C @ self.p.R, self.p.pos)

    def _deposit(self, X, Y, sig, wr, wg, wb):
        b = np.digitize(sig, _EDGES)
        for i in np.unique(b):
            sel = b == i
            self.L._add(float(SIGMAS[i]), X[sel], Y[sel], wr[sel], wg[sel], wb[sel])

    def points(self, P, k, rgb, sigma=0.8, max_sigma=22.0, fog=True, occlude=False):
        """Points of light: in focus each peaks at k; off focus it spreads and keeps its energy (and the air dims it
        by its distance, unless `fog` is off: the Earth's lights are dimmed by the Earth's own air). sigma is one
        width for all, or one a point."""
        P = np.asarray(P, np.float64).reshape(-1, 3)
        if not len(P):
            return
        C = self.p.cam(P)
        z = C[:, 2]
        k = np.broadcast_to(np.asarray(k, np.float64), (len(P),))
        rgb = np.broadcast_to(np.asarray(rgb, np.float64).reshape(-1, 3), (len(P), 3))
        each = np.ndim(sigma) > 0
        ok = (z > 0.08) & (k > 0)
        if occlude and self.ground is not None and ok.any():
            ok[ok] = self._seen(C[ok])
        if not ok.any():
            return
        C, z, k, rgb = C[ok], z[ok], k[ok], rgb[ok]
        if each:
            sigma = np.asarray(sigma, np.float64)[ok]
        X, Y = self.p.screen(C)
        sig = np.minimum(np.sqrt(sigma ** 2 + self.p.defocus(z) ** 2), max_sigma)
        m = 3 * sig + 2
        ok = (X > -m) & (X < W + m) & (Y > -m) & (Y < H + m)
        if not ok.any():
            return
        s0 = sigma[ok] if each else sigma
        e = k[ok] * (2 * math.pi * s0 * s0) * (self._fog(z[ok]) if fog else 1.0) * self.w
        self._deposit(X[ok], Y[ok], sig[ok], e * rgb[ok, 0], e * rgb[ok, 1], e * rgb[ok, 2])

    def segments(self, A, B, k, rgb, sigma=0.9, spacing=0.6, max_sigma=22.0, occlude=False):
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
        big = Ls > spacing * 6000
        if big.any():
            # A line longer on the frame than its points can cover (one end close to the lens, thrown far off the
            # frame) is first cut to the frame and its margin, so its points stay a fraction of a pixel apart where it
            # is seen; the depth's inverse and the brightness are carried to the cut, as they run on the screen.
            mg = 3 * max_sigma + 2
            dx, dy = XB - XA, YB - YA
            u0, u1 = np.zeros(len(Ls)), np.ones(len(Ls))
            for p_, q_ in ((-dx, XA + mg), (dx, W + mg - XA), (-dy, YA + mg), (dy, H + mg - YA)):
                r = q_ / np.where(p_ == 0, 1.0, p_)
                u0 = np.where(big & (p_ < 0), np.maximum(u0, r), u0)
                u1 = np.where(big & (p_ > 0), np.minimum(u1, r), u1)
                u1 = np.where(big & (p_ == 0) & (q_ < 0), -1.0, u1)
            seen = ~big | (u1 > u0)
            iza, izb = 1 / za2, 1 / zb2
            cut = (XA + dx * u0, YA + dy * u0, XA + dx * u1, YA + dy * u1, 1 / (iza + (izb - iza) * u0),
                   1 / (iza + (izb - iza) * u1), ka + (kb - ka) * u0, ka + (kb - ka) * u1)
            XA, YA, XB, YB, za2, zb2, ka, kb = (np.where(big, c, v) for c, v in zip(cut, (XA, YA, XB, YB, za2, zb2,
                                                                                            ka, kb)))
            XA, YA, XB, YB, za2, zb2, ka, kb, rgb = (v[seen] for v in (XA, YA, XB, YB, za2, zb2, ka, kb, rgb))
            if not len(XA):
                return
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
        if occlude and self.ground is not None and ok.any():
            # each drawn point back into the camera's frame, and those behind the Earth left out
            zo = z[ok]
            ok[ok] = self._seen(np.stack([(X[ok] - self.p.cx) * zo / self.p.F, -(Y[ok] - self.p.cy) * zo / self.p.F,
                                          zo], 1))
        if not ok.any():
            return
        step = (Ls / (n - 1))[idx]
        # a line's light per unit of its length is kept as it spreads: in focus its middle reads k
        e = kk * step * math.sqrt(2 * math.pi) * sigma * self._fog(z) * self.w
        e, X, Y, sig, c = e[ok], X[ok], Y[ok], sig[ok], rgb[idx][ok]
        self._deposit(X, Y, sig, e * c[:, 0], e * c[:, 1], e * c[:, 2])

    def polyline(self, P, k, rgb, sigma=0.9, closed=False, occlude=False):
        """A line through the points P (N x 3), k per point (N) or one for all."""
        P = np.asarray(P, np.float64).reshape(-1, 3)
        if len(P) < 2:
            return
        k = np.broadcast_to(np.asarray(k, np.float64), (len(P),))
        if closed:
            P = np.vstack([P, P[:1]])
            k = np.concatenate([k, k[:1]])
        self.segments(P[:-1], P[1:], np.stack([k[:-1], k[1:]], 1), rgb, sigma, occlude=occlude)

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
    """The far sky's points: fixed, as far as the camera ever goes. One set lies above the horizontal; in orbit the
    Earth's limb lies well under it, and a second set (`below`) fills the sky down to the limb. The Earth hides those
    behind it."""

    def __init__(self, n=2200, seed=4, r=900.0, below=False):
        rng = np.random.default_rng(seed)
        d = rng.normal(0, 1, (n, 3))
        d /= np.linalg.norm(d, axis=1, keepdims=True)
        d[:, 1] = np.abs(d[:, 1]) * 0.9 + 0.02
        if below:
            d[:, 1] = -d[:, 1]
        d /= np.linalg.norm(d, axis=1, keepdims=True)
        self.P = d * r
        self.k = 0.02 + 0.2 * rng.random(n) ** 6
        self.rgb = np.where(rng.random(n)[:, None] < 0.8, ICE, WHITE)

    def draw(self, pt, k, ground):
        P = self.P + pt.p.pos * 0.98
        d = P - pt.p.pos
        seen = ~ground.blocks(d / np.linalg.norm(d, axis=1, keepdims=True), pt.p.pos)
        pt.points(P[seen], self.k[seen] * k, self.rgb[seen], 0.7, max_sigma=1.4)


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


def orbit(az, el, r, look=(0.0, -0.4, 0.0)):
    """A camera `r` from the core, `az` degrees round it from +z toward +x and `el` up, and where it looks."""
    a, e = math.radians(az), math.radians(el)
    return (r * math.cos(e) * math.sin(a), r * math.sin(e), r * math.cos(e) * math.cos(a)), look


def heading(pos, look):
    """Which way a camera looks across the ground: degrees from the world's -z toward +x."""
    return math.degrees(math.atan2(look[0] - pos[0], -(look[2] - pos[2])))


class World:
    """The film's one world, at any moment: what is lit, where it is, and the camera's path through it (PLAN.md has
    the story, comp.py draws it), over Australia (earth.Earth) from the first frame to the last."""

    def __init__(self, T, drop, bars, earth):
        self.T, self.drop, self.bars = T, drop, bars
        self.dust, self.stars, self.low_stars, self.tiers = Dust(), Stars(), Stars(seed=6, below=True), Tiers()
        self.earth = earth
        self._g = {}
        self._places()
        self._beats()
        self._chase()
        self._camera()
        self._falls()
        self._network()

    # -------------------------------------------------------------- the beats: the camera, and the Earth under it

    def _beats(self):
        """The film's moves, beat by beat: where the camera is about the core and where it looks (its focal length,
        where its axis meets the frame, its aperture), and where the Earth is under the system: the point under the
        core (lat, lon), km a unit (the system stands 30 units over the ground) and which way the camera looks across
        it (a compass bearing), or, while the pulse runs, the Earth's own bearing, held. The camera's keys make its
        path with the chase's (_camera); the Earth's, its journey."""
        T, d = self.T, self.drop
        E = self.earth
        cam, geo = [], []

        def beat(t, c, e=None, F=1663.0, cy=H / 2, blur=3.0, hold=False):
            pos, look = c
            cam.append((t, np.array(pos, np.float64), np.array(look, np.float64), F, W / 2, cy, blur))
            if e is not None:
                lat, lon, view, km = e
                geo.append([t, lat, lon, view - heading(pos, look), math.log(km), hold])

        # The opening: the whole continent from orbit, its relief, its coast and its seas, the camera coming down
        # toward the core as the core kindles over it, and the Earth bringing the east coast under the system.
        beat(0.0, orbit(0, 62, 118, (0, 0, 0)), (-28.0, 135.5, 5, 46), blur=2.6)
        beat(T["operate"], orbit(0, 57, 92, (0, 0, 0)), (-29.0, 138.5, 10, 40), blur=2.6)
        beat(T["not_"] - 0.2, orbit(0, 52, 72, (0, 0, 0)), (-30.0, 141.0, 15, 34), F=1700, blur=2.6)
        # The panes: the camera's slow approach, the system coming down over the east.
        beat(T["dashboards"], orbit(0, 50, 69, (0, 0, 0)), (-31.0, 143.8, 20, 29), F=1700)
        beat(T["ambition"], orbit(0, 48, 66.5, (0, 0, 0)), (-32.4, 147.4, 28, 22), F=1700)
        beat(T["changes"], orbit(0, 42, 40, (0, 0, 0)), (-33.0, 149.0, 32, 17), F=1700)
        # The five tiers: the camera circles the core over the Sydney basin, the ranges and the coast; the Earth
        # holds its bearing, so the land turns under the camera's circle.
        beat(T["names"][0], orbit(0, 34, 17.5), (-33.5, 150.0, 35, 13.5))
        beat(T["names"][2], orbit(28, 35, 16.5))
        beat(T["names"][4], orbit(52, 36, 16.0))
        beat(T["powerful"] + 0.3, orbit(62, 33, 14.0), (-33.6, 150.4, 35 - 62, 14.5))
        # The silent bar: the rings drift apart and are drawn in, and the system rises over the country.
        beat(d - 0.02, orbit(70, 20, 9.5), (-32.0, 146.0, 10, 26), blur=4.0)
        # The drop, and the system over the whole of it, north up the frame: its threads fall to every state and
        # territory, and the places link up with each other (_network).
        beat(d + 0.45, orbit(76, 30, 19, (0, -3, 0)), (-30.6, 142.5, 4, 38), blur=3.0)
        beat(d + 1.15, orbit(82, 50, 24, (0, -5, 0)), (-31.6, 139.0, 1, 54), F=1640, blur=2.8)
        beat(T["stop"], orbit(86, 64, 28, (0, -6, 0)), (-31.8, 136.0, 0, 66), F=1620, blur=2.6)
        beat(T["destinations"], orbit(90, 70, 31, (0, -7, 0)), (-31.4, 134.6, 0, 76), F=1600, blur=2.2)
        # into New South Wales: the Earth comes up to the chase's frame while the camera still looks down on the
        # system (then the camera comes down beside the pulse: _camera)
        beat(T["destinations"] + 1.1, orbit(71, 62, 25, (0, -6, 0)), None, F=1580, blur=2.4)
        # The chase: the frame that puts Dubbo and Banksia Rise where the camera's run beside the pulse was made
        # for, held while the pulse runs (the camera's keys beside it are _camera's).
        self.chase_frame = geo_earth.frame_for(
            [E.place("Dubbo"), BANKSIA_RISE],
            [(26.0 * math.cos(a), 26.0 * math.sin(a)) if i == 0 else (30.0 * math.cos(a), 30.0 * math.sin(a))
             for i, a in enumerate((1.35, 0.78))], (-29.23, 151.47, 51.2, 16.6))
        la, lo, br, km = self.chase_frame
        geo.append([T["destinations"] + 1.1, la, lo, br, math.log(km), True])
        geo.append([T["follow"] + 0.2, la, lo, br, math.log(km), True])
        # "Act as one": the system rises over the whole country again, its light crossing it.
        beat(T["business"], orbit(30, 38, 22, (0, -5, -3)), (-30.0, 147.0, 30, 24), F=1500, blur=2.5)
        beat(T["one"], orbit(14, 66, 34, (0, -8, 0)), (-31.2, 136.5, 0, 62), F=1550, blur=2.0)
        # "So don't ask": stillness, one pane before the core, the Earth below turning east.
        beat(T["so"] + 0.3, ((-3.0, 4.0, 24.0), (0.0, -0.5, 0.0)), (-27.6, 140.5, 45, 30), blur=2.5)
        beat(T["is_"], ((0.0, 1.6, 19.0), (0.0, 0.2, 0.0)), (-27.3, 142.5, 75, 19))
        beat(T["ask"] + 0.2, ((0.0, 1.4, 19.5), (0.0, 0.1, 0.0)), (-27.1, 143.6, 88, 15))
        # The end: the camera faces the core (the emblem's place on the frame), east over the land toward the dawn.
        beat(T["system"], ((0.0, 0.0, 27.5), (0.0, 0.0, 0.0)), (-27.0, 144.5, 95, 12.8), cy=710.5, blur=2.4,
             hold=True)
        beat(45.5, ((0.0, 0.0, 26.6), (0.0, 0.0, 0.0)), (-27.0, 144.5, 95, 12.8), cy=710.5, blur=2.4)
        self.cam_keys = cam
        geo.sort(key=lambda k: k[0])
        brg = np.degrees(np.unwrap(np.radians([k[3] for k in geo])))  # the shortest way round from each to the next
        self.journey = Track([(k[0], (k[1], k[2], b, k[4])) + (("hold",) if k[5] else ())
                              for k, b in zip(geo, brg)])

    def ground(self, t):
        """The Earth's place at t (earth.Ground)."""
        g = self._g.get(t)
        if g is None:
            lat, lon, brg, lk = self.journey(t)
            g = geo_earth.Ground(lat, lon, brg, math.exp(lk))
            if len(self._g) > 64:
                self._g.clear()
            self._g[t] = g
        return g

    def look(self, t):
        """How the Earth's plate is lit at t (earth.Earth.plate): the key light on the land, the air's haze (lifting
        on "one"), and the dawn of the end, the sun just under the limb straight ahead and nearing it."""
        T = self.T
        g = self.ground(t)
        # while the network is at its busiest over the whole country the land gives it a little room
        busy = max(ss(t, self.drop + 0.4, self.drop + 1.4) * (1 - ss(t, T["destinations"] + 0.5, T["when"])),
                   ss(t, T["business"] - 0.1, T["business"] + 0.6) * (1 - ss(t, T["so"] - 0.2, T["so"] + 0.5)))
        lw = self.light_wave(t)
        wave = None if lw is None else dict(g=self.op_g, r=lw[0], w=self.LIGHT_EDGE[0], fw=self.LIGHT_EDGE[1],
                                             front=lw[1], all=lw[2], night=self.LIGHT_NIGHT)
        return dict(day=1.0 - 0.28 * busy, sun=self.sun(t, g), dawn=ss(t, T["aurixa"] - 0.6, 45.5),
                    haze=1.0 + 0.6 * flash(t, T["one"], 0.05, 0.8), navy=NAVY, ice=ICE, gold=GOLD, warm=WARM,
                    wave=wave)

    # The film opens on the country at night, its towns' lights the only light on it; on "operate" the system comes on
    # and its light runs out over the land from under the core, the relief flaring as it reaches it, until the whole
    # continent lies in the day the rest of the film is in.
    LIGHT_NIGHT = 0.07  # the land's light before it comes on, a share of the day's: the sky's ice, as moonlight
    LIGHT_RUN = (1700.0, 120.0, 2.6)  # it runs 1,700 km in its first second, slowing by 120 km/s each second, 2.6 s
    LIGHT_EDGE = (300.0, 130.0)  # its edge's softness, and the width of the flare along it (km)

    def light_wave(self, t):
        """The light coming on at t: how far it has run (km), its edge's flare (0 to 1) and how far the rest of the
        world is lit (0 to 1); None once it is all day."""
        t0 = self.T["operate"] + 0.04
        v, slow, dur = self.LIGHT_RUN
        if t > t0 + dur + 0.3:
            return None
        tau = clamp(t - t0, 0.0, dur)
        r = v * tau - slow * tau * tau if t >= t0 else -3 * self.LIGHT_EDGE[0]
        front = (1 - tau / dur) ** 0.6 * (t >= t0)
        return r, front, ss(t, t0 + 1.4, t0 + dur + 0.3)

    def sun(self, t, g):
        """The sun at the end: straight ahead of the camera, under the limb by 3 degrees as the emblem lands, nearing
        it, and breaking over it on the last bar (World.sunrise)."""
        return self.sunrise(t, g)[0]

    def sunrise(self, t, g=None):
        """The sun at the end and how far over the limb it stands (degrees, negative under it): 3 under as the emblem
        lands, at the limb on the last bar, and half a degree over it, its first light, at the last frame."""
        g = self.ground(t) if g is None else g
        pos = self.pose(t).pos
        lo, hi = 0.0, math.pi / 2  # the limb's depression straight ahead, by bisection on the tangent ray
        for _ in range(40):
            e = (lo + hi) / 2
            dvec = np.array([0.0, -math.sin(e), -math.cos(e)])
            if g.blocks(dvec, pos)[0]:
                hi = e
            else:
                lo = e
        last = self.bars[23]
        under = 3.0 * (1 - ease_in_out(lin(t, self.T["aurixa"] - 0.6, last))) - 0.5 * ease_out(lin(t, last, 45.5))
        e = lo + math.radians(under)
        return np.array([0.0, -math.sin(e), -math.cos(e)]), -under

    def _places(self):
        """The places the threads reach (PLACES), held as the Earth's own unit vectors so they travel with it, and
        the tier each thread leaves from."""
        E = self.earth
        self.dest_ll = np.array([BANKSIA_RISE if n == "Banksia Rise" else E.place(n) for n in PLACES])
        self.dest_g = geo_earth.geo(self.dest_ll[:, 0], self.dest_ll[:, 1])
        n = len(PLACES)
        self.dest_tier = np.arange(n) % 5
        self.dest_tier[0], self.dest_tier[1] = 4, 1

    def _falls(self):
        """When each thread falls (a sweep round the system by where each place lies about it as they begin); and,
        for each of the Earth's lights, its nearest reached place and when the system's light reaches it, and how far
        it is from the points the waves of "one" and of the end run out from."""
        T = self.T
        E = self.earth
        n = len(PLACES)
        F = self.ground(T["more"]).flat(self.dest_g)
        th = np.arctan2(F[:, 2], F[:, 0])
        order = np.argsort(np.mod(th - 2.2, 2 * math.pi))
        t0 = T["more"] + 0.15  # forty threads in a fast cascade, all down before "destinations"
        span = T["destinations"] - 1.4 - t0
        self.dest_t = np.empty(n)
        self.dest_t[order] = t0 + span * np.arange(n) / (n - 1)
        self.dest_fly = 0.85
        # the light spreads from each reached place over its own lights, about 100 km a second, to 80 km out
        cos_d = np.clip(E.light_g @ self.dest_g.T, -1, 1)
        near = np.argmax(cos_d, 1)
        self.e_near = np.arccos(cos_d[np.arange(len(near)), near]) * geo_earth.RE
        self.e_reach = self.dest_t[near] + self.dest_fly + self.e_near / 100.0
        # the wave before "one" and its ring run out from the point under the core on "one"; the end's pulses from
        # the point under it as the emblem lands
        self.one_g = self.ground(T["one"]).M[1].copy()
        self.e_wave = np.arccos(np.clip(E.light_g @ self.one_g, -1, 1)) * geo_earth.RE
        self.end_g = self.ground(T["aurixa"]).M[1].copy()
        self.e_end = np.arccos(np.clip(E.light_g @ self.end_g, -1, 1)) * geo_earth.RE
        # the light that comes on over the country on "operate" runs out from the point under the core then
        self.op_g = self.ground(T["operate"]).M[1].copy()
        self.e_op = np.arccos(np.clip(E.light_g @ self.op_g, -1, 1)) * geo_earth.RE
        self.end_pulses = (T["aurixa"], T["systems"] + 0.05, self.bars[22], self.bars[23])

    # -------------------------------------------------------------- the national network

    def _network(self):
        """The places joined across the country: each to its neighbours (a Delaunay mesh of where they lie, its
        longest crossings left out), each link a fine arc of cyan light over the ground; and the routes the system's
        pulses run along the links, from one state or territory to another (ROUTES), so the whole reads as one network.
        Each link runs out, fast, from whichever of its two places the system reaches first to the other once both are
        reached; a route's pulses run once all its links are there."""
        ll = self.dest_ll
        nodes = [j for j, n in enumerate(PLACES) if n != "Banksia Rise"]  # Sydney's lights stand for it
        P = np.stack([(ll[:, 1] - 134.0) * math.cos(math.radians(27.0)), -ll[:, 0]], 1) * 100.0
        lo, hi = P[nodes].min(0) - 50, P[nodes].max(0) + 50
        sub = cv2.Subdiv2D((int(lo[0]), int(lo[1]), int(hi[0] - lo[0]) + 1, int(hi[1] - lo[1]) + 1))
        for j in nodes:
            sub.insert((float(P[j, 0]), float(P[j, 1])))
        pairs = set()
        for tri in sub.getTriangleList():
            q = tri.reshape(3, 2)
            d2 = ((P[nodes][None, :, :] - q[:, None, :]) ** 2).sum(-1)
            if d2.min(1).max() > 1.0:
                continue  # a triangle on the mesh's outer frame
            ids = [nodes[int(i)] for i in d2.argmin(1)]
            for a, b in ((0, 1), (1, 2), (2, 0)):
                pairs.add(tuple(sorted((ids[a], ids[b]))))
        gd = lambda a, b: float(np.arccos(np.clip(self.dest_g[a] @ self.dest_g[b], -1, 1)) * geo_earth.RE)  # noqa
        # a link stays only where no other place lies nearer both its ends than they are to each other (the relative
        # neighbourhood graph, a little lenient): each place joined to its own neighbours, as roads and lines join
        # towns, the whole still one network
        pairs = sorted(p for p in pairs if gd(*p) < LINK_MAX and not any(
            max(gd(p[0], c), gd(p[1], c)) < LINK_NEAR * gd(*p) for c in nodes if c not in p))
        reach = self.dest_t + self.dest_fly
        g_all, lift_all, slices, length, on, dur, ends = [], [], [], [], [], [], []
        n0 = 0
        for a, b in pairs:
            if reach[b] < reach[a]:
                a, b = b, a  # each link runs out from the place reached first
            L = gd(a, b)
            om = L / geo_earth.RE
            u = np.linspace(0, 1, int(np.clip(10 + L / 35.0, 12, 72)))[:, None]
            g = (np.sin((1 - u) * om) * self.dest_g[a] + np.sin(u * om) * self.dest_g[b]) / math.sin(om)
            g_all.append(g)
            lift_all.append(np.clip(0.07 * L, 12.0, 200.0) * np.sin(math.pi * u[:, 0]))  # km over the ground
            slices.append((n0, n0 + len(g)))
            n0 += len(g)
            length.append(L)
            on.append(reach[b])
            dur.append(0.16 + L / 9000.0)
            ends.append((a, b))
        self.link_g = np.concatenate(g_all)
        self.link_lift = np.concatenate(lift_all)
        self.link_slices, self.link_len = slices, np.array(length)
        self.link_on, self.link_dur, self.link_ends = np.array(on), np.array(dur), ends
        # the traffic: once a link is there it carries the country's business both ways, a few points of light on
        # each (more on the long ones), each at its own speed, from 900 to 1,600 km a second
        rng = np.random.default_rng(9)
        self.traffic = []
        for i, L in enumerate(length):
            for _ in range(2 + int(L / 650.0)):
                self.traffic.append((i, rng.uniform(0, 1), rng.choice([-1.0, 1.0]), rng.uniform(900.0, 1600.0),
                                     rng.uniform(0.6, 1.0)))
        # how far each of the network's points is from where the wave of "one" and the end's pulses run out from
        self.l_wave = np.arccos(np.clip(self.link_g @ self.one_g, -1, 1)) * geo_earth.RE
        self.l_end = np.arccos(np.clip(self.link_g @ self.end_g, -1, 1)) * geo_earth.RE
        # the routes: the shortest way along the links from one place to the other
        adj = {}
        for i, (a, b) in enumerate(ends):
            adj.setdefault(a, []).append((b, i, False))
            adj.setdefault(b, []).append((a, i, True))
        self.routes = []
        for r, (na, nb) in enumerate(ROUTES):
            src, dst = PLACES.index(na), PLACES.index(nb)
            best, prev, todo = {src: 0.0}, {}, [(0.0, src)]
            while todo:
                dist, x = heapq.heappop(todo)
                if x == dst or dist > best.get(x, 1e18):
                    continue
                for y, i, back in adj.get(x, []):
                    nd = dist + length[i]
                    if nd < best.get(y, 1e18):
                        best[y], prev[y] = nd, (x, i, back)
                        heapq.heappush(todo, (nd, y))
            steps, x = [], dst
            while x != src:
                x0, i, back = prev[x]
                steps.append((i, back))
                x = x0
            steps.reverse()
            pts, km, base = [], [], 0.0
            for n, (i, back) in enumerate(steps):
                s0, s1 = slices[i]
                g, lf = self.link_g[s0:s1], self.link_lift[s0:s1]
                if back:
                    g, lf = g[::-1], lf[::-1]
                d = base + np.linspace(0, length[i], len(g))
                if n:  # the place it passes through is the last link's end
                    g, lf, d = g[1:], lf[1:], d[1:]
                pts.append(np.column_stack([g, lf]))
                km.append(d)
                base += length[i]
            pts, km = np.concatenate(pts), np.concatenate(km)
            ready = max(self.link_on[i] + self.link_dur[i] for i, _ in steps)
            starts = ready + 0.1 + (0.13 * r) % 0.7 + ROUTE_EVERY * np.arange(30)
            self.routes.append(dict(pts=pts, km=km, starts=starts[starts < 45.5]))

    def _links(self, pt, t, gr):
        """The network over the ground: each link as it runs out and once it is there, the routes' pulses running it,
        all of it flaring on "destinations" and on "one", the wave before "one" lighting it as it crosses; at the end
        it stays, finer, and the emblem's pulses run out along it."""
        T = self.T
        if t < self.link_on.min():
            return
        settle = 1 - 0.55 * ss(t, T["ask"], T["becomes"] + 0.5)
        flare = flash(t, T["destinations"], 0.05, 0.6) + 1.3 * flash(t, T["one"], 0.03, 0.5)
        k0 = (0.34 + 0.5 * flare + 0.14 * self.beat(t)) * settle
        Pw = gr.C + (gr.R + self.link_lift / gr.km)[:, None] * (self.link_g @ gr.M.T)
        kp = np.full(len(Pw), k0)
        if T["business"] - 0.2 < t < T["one"] + 0.1:
            kp = kp * (1 + 2.0 * np.exp(-((self.sweep(t) - self.l_wave) / 180.0) ** 2))
        gain = self._pulse_gain(t, self.l_end)
        if gain is not None:
            kp = kp * gain
        for i, (s0, s1) in enumerate(self.link_slices):
            u = (t - self.link_on[i]) / self.link_dur[i]
            if u <= 0:
                continue
            seg, kk = Pw[s0:s1], kp[s0:s1]
            if u < 1:
                m = ease_out(u) * (len(seg) - 1)
                j = int(m)
                tip = seg[j] + (seg[min(j + 1, len(seg) - 1)] - seg[j]) * (m - j)
                seg, kk = np.vstack([seg[:j + 1], tip]), np.append(kk[:j + 1], kk[j])
                pt.points(tip[None], 2.6, WHITE, 1.1, occlude=True)
                pt.points(tip[None], 0.3, CYAN, 3.0, occlude=True)
            pt.polyline(seg, kk, CYAN_HOT, 0.85, occlude=True)
            pt.polyline(seg, 0.09 * kk, CYAN, 3.2, occlude=True)
        # the traffic along every link that is there, as the network carries the country's business
        run = 1 - ss(t, T["ask"], T["becomes"])
        if run <= 0:
            return
        for i, s0_, dirn, v, kk0 in self.traffic:
            ready = self.link_on[i] + self.link_dur[i]
            if t < ready:
                continue
            s0, s1 = self.link_slices[i]
            seg = Pw[s0:s1]
            n = len(seg)
            L = self.link_len[i]
            k = kk0 * run * ss(t, ready, ready + 0.5) * (0.8 + 0.6 * flare)
            head = (s0_ + dirn * v * (t - ready) / L) % 1.0
            tail = head - dirn * np.linspace(0.0, min(0.5, 110.0 / L), 7)
            if np.any((tail < 0) | (tail > 1)):
                tail = np.clip(tail, 0, 1)
            q = np.stack([np.interp(tail * (n - 1), np.arange(n), seg[:, c]) for c in range(3)], 1)
            pt.polyline(q[::-1], np.linspace(0.05, 1.1, 7) * k, CYAN_HOT, 0.9, occlude=True)
            pt.points(q[:1], 2.6 * k, WHITE, 1.0, occlude=True)
            pt.points(q[:1], 0.2 * k, CYAN, 3.0, occlude=True)
        # the pulses, each running a route from one state or territory to another, faster than the eye can follow
        # the land under it, a short tail of light behind it
        for r in self.routes:
            for s in r["starts"]:
                head = (t - s) * ROUTE_KMS
                if head < 0 or head - ROUTE_TAIL > r["km"][-1]:
                    continue
                d = np.linspace(max(0.0, head - ROUTE_TAIL), min(head, r["km"][-1]), 18)
                q = np.stack([np.interp(d, r["km"], r["pts"][:, c]) for c in range(4)], 1)
                g = q[:, :3] / np.linalg.norm(q[:, :3], axis=1, keepdims=True)
                P = gr.C + (gr.R + q[:, 3] / gr.km)[:, None] * (g @ gr.M.T)
                ramp = np.linspace(0, 1, len(P)) ** 1.5
                pt.polyline(P, (0.2 + 2.0 * ramp) * run, CYAN_HOT, 1.0, occlude=True)
                pt.polyline(P, (0.02 + 0.16 * ramp) * run, CYAN, 4.0, occlude=True)
                if head <= r["km"][-1]:
                    pt.points(P[-1:], 4.5 * run, WHITE, 1.2, occlude=True)
                    pt.points(P[-1:], 0.5 * run, CYAN, 3.5, occlude=True)

    # -------------------------------------------------------------- the threads to the country

    def thread(self, j, t, apart, stand, spread, g=None, F=None):
        """Thread j's curve (64 x 3) from its ring to its place: a fine line of light with a gentle outward bow, drawn
        so in the flat picture about the point under the core and bent onto the sphere (from none of it at the ring
        to all of it at the place), so it leaves its ring as a line in the space does, keeps its height over the
        ground all the way, and comes down on its place even over the horizon. F: the places' flat points at t."""
        i = self.dest_tier[j]
        r = BASE_R[i] * spread
        g = g if g is not None else self.ground(t)
        p3 = (F if F is not None else g.flat(self.dest_g))[j]
        th = math.atan2(p3[2], p3[0])
        # the ring's point that faces the place, whatever the ring's turn
        p0 = (np.array([r * math.cos(th), 0.0, r * math.sin(th)])) @ \
            axis_angle([1, 0, 0], math.pi / 2 * stand).T
        out = np.array([math.cos(th), 0.0, math.sin(th)])
        span = float(np.linalg.norm(p3 - p0))
        c = (p0 + p3) / 2 + out * (0.08 * span)
        u = np.linspace(0, 1, 64)[:, None]
        B = (1 - u) ** 2 * p0 + 2 * (1 - u) * u * c + u ** 2 * p3
        return B + (g.bend(B) - B) * (u * u * (3 - 2 * u))

    # -------------------------------------------------------------- the pulse the camera chases

    def _chase(self):
        """Intelligence moving: a pulse leaves the outer ring, runs down a thread to Dubbo, along the ground over the
        ranges to Banksia Rise, and up another thread back to the system, then in to the core. The client's context
        follows it."""
        T = self.T
        j1, j2 = 0, 1  # its two threads: the first two places
        self.j1, self.j2 = j1, j2
        ta = T["intelligence"]
        down = self.thread(j1, ta, 0.0, 0.0, 1.0)
        up = self.thread(j2, ta, 0.0, 0.0, 1.0)[::-1]
        # along the ground from Dubbo to Banksia Rise: the great circle, 0.15 over it (the Earth holds still while
        # the pulse runs: _beats)
        gr = self.ground(ta)
        fa, fb = gr.flat(self.dest_g[[j1, j2]])
        G = np.stack([fa + (fb - fa) * u for u in np.linspace(0, 1, 40)])
        G[:, 1] = -geo_earth.ORB + 0.15
        ground = gr.bend(G)
        spoke = np.stack([up[-1] * (1 - u) for u in np.linspace(0, 0.94, 30)])
        legs = [(down, ta, T["move"] + 0.05), (ground, T["move"] + 0.05, T["context"] - 0.05),
                (up, T["context"] - 0.05, T["follow"] + 0.15), (spoke, T["follow"] + 0.15, T["business"] - 0.1)]
        self.legs = []
        for pts, t0, t1 in legs:
            s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
            self.legs.append((pts, s / s[-1], t0, t1))
        self.chase_t = (ta, T["business"] - 0.1)
        rng = np.random.default_rng(41)
        # the wake the run leaves on the ground, laid out in the flat picture, bent onto the sphere, and kept in the
        # Earth's own axes so it stays where it was laid as the Earth moves again
        a, b = fa, fb
        n = max(8, int(np.linalg.norm(b - a) / 0.5))
        u = np.linspace(0, 1, n)
        line = a[None, :] + (b - a)[None, :] * u[:, None]
        side = unit(np.cross([0.0, 1.0, 0.0], b - a))
        w = np.concatenate([line + side * 0.55, line - side * 0.55]) + rng.normal(0, 0.06, (2 * n, 3))
        w[:, 1] = -geo_earth.ORB + 0.05
        self.wake_g = gr.to_geo(gr.bend(w[np.argsort(np.concatenate([u, u]))]))
        self.run_g = gr.to_geo(ground)

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
        """The camera's path: the beats' keys, and while the pulse runs, keys beside it: the camera runs alongside, a
        little above and behind, and keeps to one side of it all the way, so the eye always knows where it is going."""
        T = self.T
        keys = list(self.cam_keys)
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
            pos[1] = max(pos[1], -geo_earth.ORB + 7.0)
            keys.append((tt, pos, p + fwd * 1.5, 1550.0, W / 2, H / 2, 2.8))
            prev = pos
        keys.sort(key=lambda k: k[0])
        self.keys = keys
        self.c_pos = Track([(k[0], k[1]) for k in keys])
        self.c_look = Track([(k[0], k[2]) for k in keys])
        self.c_F = Track([(k[0], k[3]) for k in keys])
        self.c_cy = Track([(k[0], k[5]) for k in keys])
        self.c_blur = Track([(k[0], k[6]) for k in keys])

    def pose(self, t):
        pos, look = self.c_pos(t), self.c_look(t)
        focus = float(np.linalg.norm(look - pos))
        return Pose(pos, look, self.c_F(t), W / 2, self.c_cy(t), focus=focus, blur=self.c_blur(t))

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
        # the silent bar: the core gathers itself before the drop; and again as the country's light runs up into it
        gather = ss(t, T["own"] - 0.2, d) * (t < d)
        gather += 0.8 * ss(t, T["ask"] + 0.2, T["becomes"]) * (1 - ss(t, T["system"], T["system"] + 0.35))
        return k, fl, gather

    def draw_lights(self, L, t, n, shutter):
        """The Earth's lights alone, at n moments of the shutter about t: over the Earth the camera's moves carry
        thousands of points across the frame, which drawn at the space's few moments would leave dotted trails
        (World.draw with lights=False draws the rest)."""
        for j in range(n):
            ts = t if n == 1 else t + ((j + 0.5) / n - 0.5) * shutter
            g = self.ground(ts)
            self._earth_lights(Painter(L, self.pose(ts), 1.0 / n, ground=g), g, ts)

    def draw(self, L, t, weight=1.0, lights=True):
        T = self.T
        pose = self.pose(t)
        g = self.ground(t)
        pt = Painter(L, pose, weight, ground=g)
        apart, stand, spread = self.state(t)
        # the far sky and the air
        k_sky = 1.0 - 0.6 * ss(t, T["intelligence"], T["move"]) + 0.6 * ss(t, T["business"], T["one"])
        self.stars.draw(pt, k_sky, ground=g)
        self.low_stars.draw(pt, k_sky, ground=g)
        self.dust.draw(pt, t, 1.0)
        if lights:
            self._earth_lights(pt, g, t)
        # the core, and the thread that rises from it on "operate"
        ck, fl, gather = self.core_light(t)
        self._core(pt, L, pose, t, ck, fl, gather)
        climb = ease_out(lin(t, T["operate"] + 0.2, T["differently"] + 0.8)) * (1 - ss(t, T["changes"], T["changes"] + 0.4))
        if climb > 0:
            top = 2.0 + climb * 60
            pt.segments([[0, 0.25, 0]], [[0, top, 0]], np.array([[1.6, 0.3]]) * ck, CYAN_HOT, 0.9)
            pt.segments([[0, 0.25, 0]], [[0, top, 0]], np.array([[0.25, 0.04]]) * ck, CYAN, 3.0)
        # the tiers
        self._tiers(pt, t, apart, stand, spread)
        # the national network over the ground, the threads to the country and their pulses
        self._links(pt, t, g)
        self._threads(pt, t, apart, stand, spread)
        # on "one" every place sends a beam of light up into the sky at once
        self._beams(pt, t, g)
        # intelligence moving
        self._chase_draw(pt, t)
        # the waves: on "operate", on "changes", at the drop, on "one", and the emblem's pulses at the end
        self._waves(pt, L, pose, t)
        # the emblem's triangle, drawn by the system
        self._triangle(pt, t)
        return pose

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

    def _earth_lights(self, pt, g, t):
        """The Earth's lights: every town's, each turning cyan as the system reaches its place, all of them in the
        wave before "one" and on it, and at the end answering every pulse of the emblem as it runs out over the
        country from under the core."""
        T, d = self.T, self.drop
        reach = np.clip((t - self.e_reach) / 0.5, 0, 1) * (self.e_near < 80.0) * (t > d)
        sweep = self.sweep(t)
        wave = np.clip((sweep - self.e_wave) / 150.0, 0, 1) * (t > T["business"] - 0.2)
        reached = np.maximum(reach, wave)
        one = flash(t, T["one"], 0.03, 0.45)
        settle = 1 - 0.55 * ss(t, T["ask"], T["becomes"] + 0.5)
        k = 0.06 * (0.85 + 1.4 * one) * settle * (1 + 0.5 * self.beat(t))
        gain = self._pulse_gain(t)
        lw = self.light_wave(t)
        if lw is not None:
            # at night the towns' lights are the country's only light; each flares as the light comes over it
            r, front, rest = lw
            lit = np.clip((r - self.e_op) / self.LIGHT_EDGE[0] + 0.5, 0, 1)
            lit = np.maximum(lit * lit * (3 - 2 * lit), rest)
            gain = (1 + 1.6 * (1 - lit)) * (1 + 2.6 * front * np.exp(-((self.e_op - r) / 150.0) ** 2))
        if T["business"] - 0.2 < t < T["one"] + 0.1:
            # the wave's front: each town flares as it reaches it, so the light is seen crossing the country
            front = 1 + 2.2 * np.exp(-((sweep - self.e_wave) / 180.0) ** 2)
            gain = front if gain is None else gain * front
        self.earth.lights(pt, g, k, reached, (WARM, ICE, GOLD, CYAN_HOT), t, gain)

    def sweep(self, t):
        """How far the wave of light before "one" has crossed the country from under the core, in km."""
        return 4500.0 * ease_in_out(lin(t, self.T["business"] - 0.2, self.T["one"]))

    def _pulse_gain(self, t, dist=None):
        """How much brighter each of the Earth's lights (or the points at `dist` km from it) is as the end's pulses
        pass it (None while none runs): each pulse of the emblem runs out over the country from the point under the
        core, 3,400 km in its 1.6 s."""
        if t < self.T["aurixa"]:
            return None
        dist = self.e_end if dist is None else dist
        gain = None
        for at in self.end_pulses:
            u = lin(t, at, at + 1.6)
            if 0 < u < 1:
                r = 3400.0 * ease_out(u)
                a = (1.0 if at == self.T["aurixa"] else 0.75) * (1 - u) ** 1.2
                bump = 2.5 * a * np.exp(-((dist - r) / 140.0) ** 2)
                gain = 1 + bump if gain is None else gain + bump
        return gain


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
                L.streak(float(X[0]), float(Y[0]), 260 * (0.4 + min(fl, 2.0)), tuple(0.6 * CYAN + 0.4 * ICE), 0.7 * min(fl, 2.0) * pt.w)

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
            col = CYAN * a + ICE * (1 - a)
            k_ring = (0.06 * ghost + (0.36 + 0.2 * bt) * a) * end
            P = tr.ring(R, 0.0, r, th)
            pt.polyline(P, k_ring, col, 0.9)
            pt.polyline(P, 0.05 * k_ring * a, col, 3.5)  # a named ring's soft glow: the cyan reads as light, not teal
            if a <= 0 or elem <= 0:
                continue
            ka = a * elem
            age = t - T["names"][i]
            if i == 0:  # research: a scan reading the ring, its points answering
                head = tr.ph0[0] + 2.7 * age
                lag = np.mod(head - (tr.rs_th + phi), 2 * math.pi)
                kk = (0.06 + 1.1 * np.exp(-lag / 0.55)) * tr.rs_k * ka
                P = tr.ring(R, phi, r, tr.rs_th, tr.rs_dy, tr.rs_dr)
                pt.points(P, kk, CYAN_HOT, 0.85)
                arc = np.linspace(head - 0.7, head, 40)
                Pa = tr.ring(R, 0.0, r, arc)
                pt.polyline(Pa, np.linspace(0, 1.5, 40) * ka, CYAN, 1.0)
                pt.segments([[0, 0, 0]], [tr.ring(R, 0.0, r, np.array([head]))[0]], np.array([[0.05, 0.35]]) * ka,
                            CYAN_HOT, 0.8)
            elif i == 1:  # clients: points of light, joined
                P = tr.ring(R, phi, r, tr.cl_th)
                on = np.clip((age - np.arange(12) * 0.03) / 0.2, 0, 1)
                pulse = 0.8 + 0.2 * np.sin(t * 2.4 + tr.cl_ph)
                pt.points(P, 1.8 * on * pulse * ka, CYAN_HOT, 1.0)
                pt.points(P, 0.22 * on * ka, CYAN, 3.0)
                j2 = (np.arange(12) + 2) % 12
                pt.segments(P, P[j2], np.minimum(on, on[j2]) * 0.12 * ka, CYAN_HOT, 0.8)
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
                    pt.polyline(corners, kk, CYAN_HOT, 0.8, closed=True)
                    for yy in (0.45, 0.1, -0.25):
                        a1 = c - tan * w2 * 0.7 + up * h2 * yy
                        b1 = c + tan * w2 * (0.7 if yy < 0.4 else 0.2) + up * h2 * yy
                        pt.segments((a1 @ R.T)[None], (b1 @ R.T)[None], 0.18 * kk, CYAN_HOT, 0.75)
                    del out
            elif i == 3:  # finance: a rise of light around the ring, and its flow
                base = tr.ring(R, phi, r, tr.fi_th)
                grow = ease_out(clamp(age / 0.6))
                h = tr.fi_h * grow * (1 + 0.15 * bt)
                upv = R @ np.array([0.0, 1.0, 0.0])
                tops = base + upv[None, :] * h[:, None]
                pt.segments(base, tops, np.stack([0.1 * np.ones(30), 0.7 * np.ones(30)], 1) * ka, CYAN, 0.85)
                pt.points(tops, 0.9 * ka, CYAN_HOT, 0.9)
                ang = tr.fi_p + tr.fi_v * age * 1.6
                P = tr.ring(R, phi, r, ang, tr.fi_y * 0.15)
                pt.points(P, 0.45 * ka, CYAN, 0.8)
            else:  # communication: pulses running the ring
                for j, a0 in enumerate(tr.cm_th):
                    hd = a0 + phi + 2.3 * age
                    arc = np.linspace(hd - 0.5, hd, 24)
                    Pa = tr.ring(R, 0.0, r, arc)
                    pt.polyline(Pa, np.linspace(0, 1.4, 24) * ka, CYAN_HOT, 1.0)
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
                pt.segments([[0, 0, 0]], [p], np.array([[k_sp * 0.4, k_sp]]), CYAN, 0.8)
                # a pulse out along it, and back
                u = (t * 0.7 + 0.31 * j + 0.17 * i) % 1.0
                pt.points([p * u], 1.2 * k_sp / 0.16 * a, CYAN_HOT, 1.0)
        if comm > 0:
            for s in range(5):
                ang = s * 2 * math.pi / 5 + 0.2 * t
                P = np.stack([tr.ring(R, 0.0, r, np.array([ang]))[0] for (R, phi, r, a) in rings])
                P = np.vstack([np.zeros((1, 3)), P])
                pt.polyline(P, 0.22 * comm * (1 + bt), CYAN, 0.85)
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
        gr = self.ground(t)
        F = gr.flat(self.dest_g)
        dest = gr.world(self.dest_g)
        occ = True
        # high over the whole country forty threads are a sheaf: they are drawn finer there, and the network between
        # the places (_links) carries the picture
        fine = 1 - 0.5 * ss(math.log(gr.km), math.log(25.0), math.log(70.0))
        # and close to the ground the threads to the far places, arching over the horizon, give way
        far = np.arccos(np.clip(self.dest_g @ gr.M[1], -1, 1)) * geo_earth.RE / gr.km  # units from under the core
        near = 1 - np.clip((far - 45.0) / 35.0, 0, 1)
        for j in range(len(dest)):
            g = ease_in_out(lin(t, self.dest_t[j], self.dest_t[j] + self.dest_fly))
            if g <= 0 or near[j] <= 0:
                continue
            C = self.thread(j, t, apart, stand, spread, gr, F)
            lo = retract
            hi = g * (1 - retract)
            if hi <= lo + 0.005:
                continue
            u = np.linspace(0, 1, 64)
            keep = (u >= lo) & (u <= hi)
            seg = C[keep]
            if len(seg) < 2:
                continue
            k = (0.3 + 0.8 * flare + 0.3 * bt) * fine * near[j] * np.linspace(1.0, 0.6, len(seg))
            pt.polyline(seg, k, CYAN, 0.8, occlude=occ)
            pt.polyline(seg, 0.05 * k, CYAN, 3.0, occlude=occ)
            # as the threads are drawn up, the country's light runs up every one of them into the core
            conv = ss(t, T["ask"] - 0.35, T["ask"] + 0.1) * (1 - ss(t, T["becomes"] - 0.1, T["becomes"] + 0.2))
            if conv > 0.002:
                for u0 in (0.0, 0.34, 0.67):
                    ph = ((t - T["ask"]) / 0.62 + u0 + 0.137 * j) % 1.0
                    uh = hi - (hi - lo) * ph  # from the place end up toward the ring
                    ut = np.clip(uh + np.linspace(0.0, 0.07, 6), lo, hi)
                    q = np.stack([np.interp(ut * 63, np.arange(64), C[:, c]) for c in range(3)], 1)
                    pt.polyline(q, np.linspace(2.4, 0.05, 6) * conv * near[j], CYAN_HOT, 1.0, occlude=occ)
                    pt.points(q[:1], 4.5 * conv * near[j], WHITE, 1.1, occlude=occ)
                    pt.points(q[:1], 0.35 * conv * near[j], CYAN, 3.5, occlude=occ)
            if g < 1:
                pt.points(seg[-1:], 3.0, WHITE, 1.2, occlude=occ)
                pt.points(seg[-1:], 0.4, CYAN, 3.5, occlude=occ)
            else:
                arrive = flash(t, self.dest_t[j] + self.dest_fly, 0.03, 0.6)
                if arrive > 0.01:
                    pt.points(dest[j:j + 1], 4.0 * arrive, WHITE, 1.2, occlude=occ)
                    ring = np.linspace(0, 2 * math.pi, 72)
                    rr = (6.0 + 80.0 * (1 - arrive)) / gr.km  # out to 86 km on the ground
                    # laid on the Earth about the place
                    P = gr.bend(F[j] + np.stack([rr * np.cos(ring), np.full(72, 0.05), rr * np.sin(ring)], 1))
                    pt.polyline(P, 0.7 * arrive, CYAN, 0.85, closed=True, occlude=occ)
                pt.points(dest[j:j + 1], 0.9 * (1 + flare), CYAN_HOT, 1.0, occlude=occ)
                # pulses down each thread on the beat
                if t < T["ask"]:
                    for u0 in (0.0, 0.5):
                        u = ((t - self.dest_t[j]) * 0.55 + u0 + j * 0.071) % 1.0
                        if lo < u < hi:
                            i = int(u * 63)
                            pt.points(C[i:i + 1], 1.6, CYAN_HOT, 1.0, occlude=occ)

    BEAM_KM = 900.0  # how high the beams of "one" reach over their places

    def _beams(self, pt, t, gr):
        """On "one" the whole country acts as one: from every one of the forty places a beam of light rises into the
        sky at once, brightest at the ground and fading as it climbs, and falls away over a second and a half."""
        T = self.T
        k = flash(t, T["one"] - 0.02, 0.04, 0.95)
        if k < 0.004:
            return
        h = self.BEAM_KM / gr.km * (0.15 + 0.85 * ease_out(lin(t, T["one"] - 0.06, T["one"] + 0.35)))
        base = gr.world(self.dest_g, 0.0)
        up = (base - gr.C) / np.linalg.norm(base - gr.C, axis=1, keepdims=True)
        top = base + up * h
        kk = np.stack([np.full(len(base), 2.2 * k), np.zeros(len(base))], 1)
        pt.segments(base, top, kk, CYAN_HOT, 1.0, occlude=True)
        pt.segments(base, top, kk * 0.14, CYAN, 4.5, occlude=True)
        pt.points(base, 2.2 * k, WHITE, 1.2, occlude=True)

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
            pt.polyline(tail, np.linspace(0, 1.8, len(tail)) * fade, CYAN_HOT, 1.0)
            pt.polyline(tail, np.linspace(0, 0.25, len(tail)) * fade, CYAN, 4.0)
        pt.points([p], 16.0 * fade, WHITE, 1.4)
        pt.points([p], 2.0 * fade, CYAN_HOT, 3.5)
        pt.glow(p, 0.35, 0.22 * fade, CYAN_HOT)
        # the ground it runs lights behind it, and stays lit: a line of the towns' lights turned cyan
        pts, sv, t0, t1 = self.legs[1]
        if t > t0:
            gr = self.ground(t)
            wake = gr.world(self.wake_g, 0.05)
            u = np.clip((np.linspace(0, 1, len(wake)) - 0.0), 0, 1)
            passed = t0 + (t1 - t0) * u
            on = np.clip((t - passed) / 0.12, 0, 1) * (t > passed)
            k = on * (0.55 + 1.6 * np.exp(-(t - passed) / 0.35)) * (1 - ss(t, self.T["ask"], self.T["becomes"]))
            pt.points(wake, k, CYAN * 0.6 + CYAN_HOT * 0.4, 1.2, occlude=True)
            reach = clamp((t - t0) / (t1 - t0))
            kl = 0.6 * (1 - ss(t, self.T["ask"], self.T["becomes"]))
            if reach > 0:
                # the run's line along the ground, as far as the pulse has come, where the ground now is
                run = gr.world(self.run_g, 0.15)
                s = np.linspace(0, 1, len(run))
                m = int(np.searchsorted(s, reach))
                line = np.vstack([run[:m], run[max(m - 1, 0)] + (run[min(m, len(run) - 1)] - run[max(m - 1, 0)])
                                  * ((reach - s[max(m - 1, 0)]) / max(s[1], 1e-9))])
                kk = np.linspace(0.5 * kl, kl, len(line))
                pt.polyline(line, kk, CYAN, 1.0, occlude=True)
                pt.polyline(line, kk * 0.08, CYAN, 6.0, occlude=True)

    def _waves(self, pt, L, pose, t):
        T, d = self.T, self.drop
        X, Y, z = pose.project(np.zeros((1, 3)))
        if z[0] <= 0.3:
            return
        x, y, zz = float(X[0]), float(Y[0]), float(z[0])
        s = pose.F / zz  # px per world unit at the core
        for at, life, rmax, k, col in ((T["operate"] + 0.05, 1.0, 9.0, 0.7, CYAN), (T["changes"], 0.9, 30.0, 0.9, mixc_np(ICE, CYAN, 0.3)),
                                       (d, 0.8, 40.0, 1.3, mixc_np(CYAN_HOT, ICE, 0.2)),
                                       (T["one"], 0.9, 40.0, 0.8, CYAN),
                                       (T["system"], 0.9, 30.0, 0.9, mixc_np(ICE, CYAN, 0.4))):
            g = lin(t, at, at + life)
            if 0 < g < 1:
                r = (0.4 + rmax * ease_out(g)) * s
                if r < 2600:
                    L.ring(x, y, r, tuple(col), k * (1 - g) ** 1.5 * pt.w, 1.3)
                    L.ring(x, y, r, tuple(col), 0.08 * k * (1 - g) ** 1.5 * pt.w, 14.0)
        gr = self.ground(t)
        # the edge of the light coming on, running out over the land from under the core
        lw = self.light_wave(t)
        if lw is not None and lw[1] > 0.002 and lw[0] > 1.0:
            q = geo_earth.circle(self.op_g, lw[0] / geo_earth.RE, 900)
            pt.polyline(gr.world(q, 0.06), 0.9 * lw[1], CYAN_HOT, 1.0, closed=True, occlude=True)
            pt.polyline(gr.world(q, 0.06), 0.07 * lw[1], CYAN, 6.0, closed=True, occlude=True)
        # the ground's ring on "one": the whole country answering at once; the wave before it has its front drawn
        # too, a faint line of light crossing the land
        g = lin(t, T["one"], T["one"] + 1.2)
        if T["business"] - 0.2 < t < T["one"] + 0.05:
            kf = 0.4 * ss(t, T["business"] - 0.2, T["business"] + 0.15) * (1 - ss(t, T["one"] - 0.2, T["one"] + 0.05))
            if kf > 0.002 and self.sweep(t) > 1.0:
                q = geo_earth.circle(self.one_g, self.sweep(t) / geo_earth.RE, 720)
                pt.polyline(gr.world(q, 0.1), kf, CYAN, 1.0, closed=True, occlude=True)
        if 0 < g < 1:
            q = geo_earth.circle(self.one_g, (40.0 + 3000.0 * ease_out(g)) / geo_earth.RE, 720)
            pt.polyline(gr.world(q, 0.1), 0.9 * (1 - g) ** 1.4, CYAN, 1.0, closed=True, occlude=True)
        # the emblem's pulses, from the orb, on "Aurixa", on "Systems" and on the bars after (the beats after the
        # first a little stronger: the logo's beat is the film's last word), each with a fine echo just behind it, as
        # a beat carries; each also runs out over the country from under the core, its towns and its network
        # answering as it passes (_pulse_gain, _links)
        for at in (T["aurixa"], T["systems"] + 0.05, self.bars[22], self.bars[23]):
            g = lin(t, at, at + 1.6)
            if 0 < g < 1:
                r = (0.6 + 24.0 * ease_out(g)) * s
                kk = (1.0 if at == T["aurixa"] else 0.875) * (1 - g) ** 1.7
                L.ring(x, y, r, tuple(mixc_np(ICE, CYAN, 0.35)), 1.1 * kk * pt.w, 1.2)
                L.ring(x, y, r, tuple(mixc_np(ICE, CYAN, 0.35)), 0.1 * kk * pt.w, 12.0)
                ge = lin(t, at + 0.14, at + 1.6)
                if 0 < ge < 1:
                    L.ring(x, y, (0.6 + 21.0 * ease_out(ge)) * s, tuple(mixc_np(ICE, CYAN, 0.6)),
                           0.45 * kk * pt.w, 1.0)
                q = geo_earth.circle(self.end_g, (60.0 + 3400.0 * ease_out(g)) / geo_earth.RE, 900)
                kg = 0.7 * (1.0 if at == T["aurixa"] else 0.75) * (1 - g) ** 1.2
                pt.polyline(gr.world(q, 0.08), kg, CYAN, 1.0, closed=True, occlude=True)
                pt.polyline(gr.world(q, 0.08), 0.06 * kg, CYAN, 5.0, closed=True, occlude=True)

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
            pt.segments([p], [e], kk, CYAN_HOT, 1.1)
            pt.segments([p], [e], 0.16 * kk, CYAN, 5.0)
            if g < 1:
                pt.points([e], 4.0 * k, WHITE, 1.4)

    # -------------------------------------------------------------- what the boxes need: where the tiers are

    # the way from the core to each tier's box on the frame (type.py's BOX_AT: research up and left, clients up and
    # right, reports and finance down, communication straight up)
    LABEL_DIRS = np.array([[-0.75, -0.66], [0.75, -0.66], [-0.8, 0.6], [0.8, 0.6], [0.0, -1.0]])
    # the room each point keeps clear toward its box: the tier's name as it was once set on its ring (Inconsolata 700
    # at 30 px, letter-spaced 0.3 em: 24 px a letter), and how far from its point the name began
    LABEL_W = np.array([8, 7, 7, 7, 13]) * 24.0
    LABEL_GAP = 66.0

    def labels(self, t):
        """Where each tier's box joins its ring at t: the point of the ring furthest toward the box's side of the
        frame, from the core, of those that keep the room of its name inside the frame and above the words (the names
        were set there before the boxes); and how much the tier shows."""
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
