#!/usr/bin/env python3
"""We Are Here, put together frame by frame: the plates (plates.py), the light drawn on them, the panes of software and
the glass they break into, the five bands, the drop, the end card, and over all of it the words (type.cjs).

  python3 -I comp.py <work files dir> [first:last] [--frames n,n,...] [--out path]      # (needs numpy and OpenCV)

Writes we-are-here/film/part-<first>.mkv (x264 at CRF 4, 4:4:4) for a run of frames, or PNGs of single frames
(--frames, into --out). film.sh joins the runs and lays them on master.wav.

The light is drawn where the picture puts its points (plates/<shot>.json, from the stills' camera and the takes'
tracking), in linear light and in high range, as the thread of PLAN.md: a point of gold at the tower's crown, a
filament, the five worlds' own light (a scan, windows, a rim of light, floors, the traffic), the lines that join them
at the drop, the pulse and the client's context, the city's circuit, and the line that becomes the emblem's orb. Lines
are drawn as points along them, a fraction of a pixel apart, each spread by its own Gaussian, so a line of any width
lands where its points are to a fraction of a pixel. The whole is bloomed, given a soft shoulder (a light's core goes
to white as it passes the top), vignetted and grained, then the words are laid over it.
"""
import json
import math
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))  # run with -I: camera.py is beside it
from camera import FPS, H, W, StillCamera  # noqa: E402
from twin import Twin  # noqa: E402

# ------------------------------------------------------------------ helpers


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


def mixc(a, b, k):
    return tuple(x + (y - x) * k for x, y in zip(a, b))


def srgb_to_lin(x):
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4).astype(np.float32)


def lin_to_srgb(x):
    x = np.clip(x, 0, None)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055).astype(np.float32)


def hsh(n):
    s = math.sin(n * 127.1 + 311.7) * 43758.5453
    return s - math.floor(s)


# Light's colours, in linear light (As One's gold and warm, and the scan's cyan).
GOLD = (1.0, 0.72, 0.32)
WARM = (1.0, 0.86, 0.62)
ICE = (0.62, 0.84, 1.0)
CYAN = (0.30, 0.82, 1.0)
WHITE = (1.0, 1.0, 1.0)

# ------------------------------------------------------------------ light


class Light:
    """Light added to the picture, in linear light and high range. Lines are points spread by a Gaussian of their own
    width (the points of each width gathered and spread once); glows are drawn whole."""

    def __init__(self):
        self.splats = {}
        self.direct = np.zeros((H, W, 3), np.float32)
        self.used = False

    def _add(self, sigma, xs, ys, wr, wg, wb):
        self.splats.setdefault(sigma, []).append((xs, ys, wr, wg, wb))
        self.used = True

    def path(self, pts, k, rgb, sigma=1.0, spacing=0.6):
        """A line through pts (N x 2, film px), its brightness k at each point (N) or one for all: its middle reads k."""
        pts = np.asarray(pts, np.float64).reshape(-1, 2)
        if len(pts) < 2:
            return
        k = np.broadcast_to(np.asarray(k, np.float64), (len(pts),))
        seg = np.hypot(*np.diff(pts, axis=0).T)
        s = np.concatenate([[0.0], np.cumsum(seg)])
        if s[-1] < 1e-6:
            return
        n = max(2, int(s[-1] / spacing) + 1)
        u = np.linspace(0.0, s[-1], n)
        xs = np.interp(u, s, pts[:, 0])
        ys = np.interp(u, s, pts[:, 1])
        ks = np.interp(u, s, k) * (s[-1] / (n - 1)) * math.sqrt(2 * math.pi) * sigma
        keep = (xs > -4 * sigma - 2) & (xs < W + 4 * sigma + 2) & (ys > -4 * sigma - 2) & (ys < H + 4 * sigma + 2) & (ks > 0)
        if keep.any():
            xs, ys, ks = xs[keep], ys[keep], ks[keep]
            self._add(sigma, xs, ys, ks * rgb[0], ks * rgb[1], ks * rgb[2])

    def point(self, x, y, k, rgb, sigma):
        """One point, its peak reading k."""
        w = k * 2 * math.pi * sigma * sigma
        self._add(sigma, np.array([x]), np.array([y]), np.array([w * rgb[0]]), np.array([w * rgb[1]]), np.array([w * rgb[2]]))

    def glow(self, x, y, r, rgb, k):
        """A round Gaussian glow of radius r (its sigma), its centre reading k; drawn directly where it is wide."""
        if k <= 0 or not (-4 * r < x < W + 4 * r and -4 * r < y < H + 4 * r):
            return
        if r < 6:
            self.point(x, y, k, rgb, r)
            return
        x0, x1 = int(max(0, x - 3.5 * r)), int(min(W, x + 3.5 * r + 1))
        y0, y1 = int(max(0, y - 3.5 * r)), int(min(H, y + 3.5 * r + 1))
        if x0 >= x1 or y0 >= y1:
            return
        gx = np.exp(-((np.arange(x0, x1) + 0.5 - x) ** 2) / (2 * r * r)).astype(np.float32)
        gy = np.exp(-((np.arange(y0, y1) + 0.5 - y) ** 2) / (2 * r * r)).astype(np.float32)
        g = gy[:, None] * gx[None, :] * k
        self.direct[y0:y1, x0:x1] += g[..., None] * np.array(rgb, np.float32)
        self.used = True

    def streak(self, x, y, length, rgb, k):
        """An anamorphic streak: a thin horizontal line of light through (x, y), fading along its length."""
        if k <= 0:
            return
        xs = np.linspace(x - length, x + length, 64)
        fall = np.exp(-((xs - x) / (length / 2.4)) ** 2)
        self.path(np.stack([xs, np.full_like(xs, y)], 1), k * fall, rgb, 1.1)
        self.path(np.stack([xs, np.full_like(xs, y)], 1), 0.22 * k * fall, rgb, 5.0)

    def ring(self, x, y, r, rgb, k, sigma=1.2, n=None):
        n = n or max(24, int(2 * math.pi * r / 3))
        a = np.linspace(0, 2 * math.pi, n + 1)
        self.path(np.stack([x + r * np.cos(a), y + r * np.sin(a)], 1), k, rgb, sigma)

    def resolve(self):
        out = self.direct
        for sigma, parts in self.splats.items():
            xs = np.concatenate([p[0] for p in parts])
            ys = np.concatenate([p[1] for p in parts])
            x0 = np.floor(xs - 0.5)
            y0 = np.floor(ys - 0.5)
            fx = (xs - 0.5 - x0).astype(np.float32)
            fy = (ys - 0.5 - y0).astype(np.float32)
            x0 = x0.astype(np.int64)
            y0 = y0.astype(np.int64)
            acc = np.zeros((H, W, 3), np.float32)
            for dx, dy, wgt in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
                xi, yi = x0 + dx, y0 + dy
                ok = (xi >= 0) & (xi < W) & (yi >= 0) & (yi < H)
                idx = (yi * W + xi)[ok]
                for c in range(3):
                    wc = np.concatenate([p[2 + c] for p in parts])[ok] * wgt[ok]
                    acc[..., c] += np.bincount(idx, weights=wc, minlength=W * H).reshape(H, W).astype(np.float32)
            # (GaussianBlur's kernel sums to one: a point's weight spreads to a peak of weight / (2 pi sigma^2).)
            out = out + cv2.GaussianBlur(acc, (0, 0), sigma)
        return out


def bezier(p0, p1, p2, n=64):
    u = np.linspace(0, 1, n)[:, None]
    return (1 - u) ** 2 * np.asarray(p0) + 2 * (1 - u) * u * np.asarray(p1) + u ** 2 * np.asarray(p2)


def beacon(L, x, y, k, flare=0.0):
    """The thread's point of light: a hot core, its halo, a wide glow, and as it flares, an anamorphic streak."""
    if k <= 0:
        return
    L.point(x, y, 7.0 * k * (1 + flare), WARM, 1.4)
    L.point(x, y, 1.1 * k * (1 + 0.5 * flare), GOLD, 5.0)
    L.glow(x, y, 34, GOLD, 0.16 * k * (1 + 1.5 * flare))
    if flare > 0.02:
        L.streak(x, y, 230 * (0.4 + flare), mixc(GOLD, ICE, 0.35), 0.8 * flare)
        L.glow(x, y, 120, GOLD, 0.08 * flare)


def filament(L, x, y, top, k, head=True):
    """A fine line of light from (x, y) up to height `top` (film px), brightest at its root, with a bright head."""
    if k <= 0 or top >= y:
        return
    ys = np.linspace(y, top, max(8, int((y - top) / 6)))
    h = y - ys
    kk = k * (0.35 + 0.65 * np.exp(-h / 380.0)) * np.clip((ys - top) / 40.0 + 0.15, 0, 1) ** 0.5
    pts = np.stack([np.full_like(ys, x), ys], 1)
    L.path(pts, 1.8 * kk, WARM, 0.9)
    L.path(pts, 0.35 * kk, GOLD, 3.5)
    if head:
        L.point(x, top, 2.5 * k, WARM, 1.6)
        L.glow(x, top, 14, GOLD, 0.2 * k)


# ------------------------------------------------------------------ sources


class Reader:
    """A plate (or one of its masks) read frame by frame from where it is first asked for."""

    def __init__(self, path, first, gray=False):
        self.path, self.first, self.gray = str(path), first, gray
        self.proc, self.pos, self.cur = None, None, None
        self.size = W * H * (2 if gray else 3)

    def _open(self, i):
        if self.proc:
            self.proc.kill()
        # Seek half a frame early: Matroska keeps its times in milliseconds, so frame i may sit just before i / 24.
        ss = max(0.0, (i - 0.5) / FPS)
        fmt = "gray16le" if self.gray else "rgb24"
        self.proc = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", f"{ss:.6f}", "-i", self.path, "-f", "rawvideo",
                                      "-pix_fmt", fmt, "-"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        self.pos = i - 1

    def get(self, n):
        i = n - self.first
        if self.pos is not None and i == self.pos and self.cur is not None:
            return self.cur
        if self.proc is None or i <= self.pos or i > self.pos + 36:
            self._open(i)
        while self.pos < i:
            buf = self.proc.stdout.read(self.size)
            if len(buf) < self.size:
                raise RuntimeError(f"{self.path}: no frame {i}")
            self.pos += 1
            if self.pos == i:
                if self.gray:
                    self.cur = np.frombuffer(buf, np.uint16).reshape(H, W).astype(np.float32) / 65535
                else:
                    self.cur = srgb_to_lin(np.frombuffer(buf, np.uint8).reshape(H, W, 3).astype(np.float32) / 255)
        return self.cur


class Sources:
    def __init__(self, root, edit):
        self.root = root
        self.shots = {s["key"]: s for s in edit["shots"]}
        self.readers = {}
        self.meta = {}

    def _meta(self, key):
        if key not in self.meta:
            self.meta[key] = json.loads((self.root / "plates" / f"{key}.json").read_text())
        return self.meta[key]

    def plate(self, key, n):
        s = self.shots[key]
        n = min(max(n, s["a"]), s["b"] - 1)
        r = self.readers.get(key) or self.readers.setdefault(key, Reader(self.root / "plates" / f"{key}.mkv", s["a"]))
        return r.get(n).copy()

    def mask(self, key, name, n):
        s = self.shots[key]
        n = min(max(n, s["a"]), s["b"] - 1)
        k = f"{key}-{name}"
        r = self.readers.get(k) or self.readers.setdefault(k, Reader(self.root / "plates" / f"{k}.mkv", s["a"], gray=True))
        return r.get(n)

    def at(self, key, name, n):
        """A point's place at frame n (fractional n between frames): x, y, followed, scale."""
        s = self.shots[key]
        rows = self._meta(key)["anchors"][name]
        f = min(max(n - s["a"], 0), len(rows) - 1)
        i0 = int(math.floor(f))
        i1 = min(i0 + 1, len(rows) - 1)
        u = f - i0
        a, b = rows[i0], rows[i1]
        return a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, bool(a[2]), a[3] + (b[3] - a[3]) * u


def load_rgba(path, premul=True):
    """A picture with transparency: linear light, premultiplied, and its alpha."""
    im = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    rgb = srgb_to_lin(im[..., 2::-1].astype(np.float32) / 255)
    a = im[..., 3].astype(np.float32) / 255
    return (rgb * a[..., None] if premul else rgb), a


# ------------------------------------------------------------------ the clock


class Clock:
    def __init__(self, cues):
        lines = {l["key"]: l for l in cues["lines"]}
        w = lambda key, i: lines[key]["words"][i]["start"]  # noqa: E731
        self.drop, self.bar = cues["drop"], cues["bar"]
        self.T = dict(
            operate=w("s1", 7), differently=w("s1", 8),
            not_=w("s2", 0), use=w("s2", 3), software=w("s2", 5), not2=w("s2", 6), have=w("s2", 9),
            dashboards=w("s2", 11), and_=w("s2", 12), not3=w("s2", 13), because3=w("s2", 14), ai=w("s2", 15),
            became=w("s2", 16), another=w("s2", 17), tab=w("s2", 18),
            at=w("s3", 0), certain=w("s3", 2), level=w("s3", 3), ambition=w("s3", 5), question=w("s3", 7),
            changes=w("s3", 8),
            names=[w("s4", i) for i in range(5)], powerful=w("s5", 0), own=w("s5", 3),
            more=w("s6", 0), stop=w("s6", 4), separate=w("s6", 7), destinations=w("s6", 8),
            when=w("s7", 0), intelligence=w("s7", 1), move=w("s7", 3), context=w("s7", 5), follow=w("s7", 7),
            business=w("s7", 10), act=w("s7", 12), one=w("s7", 14),
            so=w("s8", 0), next=w("s8", 5), tool=w("s8", 6), is_=w("s8", 7),
            ask=w("s9", 0), becomes=w("s9", 6), the=w("s9", 7), system=w("s9", 8),
            aurixa=w("s10", 0), systems=w("s10", 1), coming=w("s11", 5),
        )


# ------------------------------------------------------------------ the noise: panes of software, and their glass


def voronoi_cells(w, h, n, rng):
    """n cells of a w x h rectangle about random seeds: each a convex polygon (the rectangle cut by bisectors)."""
    seeds = np.stack([rng.uniform(0.04, 0.96, n) * w, rng.uniform(0.06, 0.94, n) * h], 1)
    cells = []
    rect = [(0.0, 0.0), (w, 0.0), (w, h), (0.0, h)]
    for i, p in enumerate(seeds):
        poly = rect
        for j, q in enumerate(seeds):
            if i == j:
                continue
            m = (p + q) / 2
            nrm = q - p
            # keep the side nearer p: (x - m) . nrm <= 0
            out = []
            for k in range(len(poly)):
                a, b = np.array(poly[k]), np.array(poly[(k + 1) % len(poly)])
                da, db = np.dot(a - m, nrm), np.dot(b - m, nrm)
                if da <= 0:
                    out.append(tuple(a))
                if (da <= 0) != (db <= 0):
                    u = da / (da - db)
                    out.append(tuple(a + (b - a) * u))
            poly = out
            if len(poly) < 3:
                break
        if len(poly) >= 3:
            cells.append(np.array(poly, np.float64))
    return cells


def rot(yaw, pitch, roll):
    cy, sy, cp, sp, cr, sr = math.cos(yaw), math.sin(yaw), math.cos(pitch), math.sin(pitch), math.cos(roll), math.sin(roll)
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rx = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]])
    rz = np.array([[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]])
    return ry @ rx @ rz


def axis_angle(axis, ang):
    axis = np.asarray(axis, np.float64)
    axis = axis / np.linalg.norm(axis)
    x, y, z = axis
    c, s = math.cos(ang), math.sin(ang)
    C = 1 - c
    return np.array([[c + x * x * C, x * y * C - z * s, x * z * C + y * s],
                     [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
                     [z * x * C - y * s, z * y * C + x * s, c + z * z * C]])


class Noise:
    """The panes that crowd the office, each on a word, and the glass they break into on "ambition"."""

    F0 = 1500.0  # the panes' focal length in film px at the office's first frame

    def __init__(self, tex_dir, T, office):
        self.T = T
        self.office = office  # the office shot (its zoom)
        tex = {}
        for p in sorted(tex_dir.glob("*.png")):
            prem, a = load_rgba(p)
            if p.stem.startswith(("pane", "tab")):
                # Glass: the dark fill lets the city through, the drawing on it stays, and light lies across it.
                lum = prem @ np.array([0.2126, 0.7152, 0.0722], np.float32)
                drawn = np.clip(lum / max(1e-4, float(np.percentile(lum[a > 0.5], 99))), 0, 1) ** 0.5
                a2 = a * (0.5 + 0.5 * drawn)
                prem = prem * (a2 / np.maximum(a, 1e-4))[..., None]
                h, w = a.shape
                yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
                diag = (xx / w * 0.65 + yy / h * 0.35)
                sheen = (0.035 * np.exp(-((diag - 0.32) / 0.07) ** 2) + 0.012 * (1 - yy / h))[..., None]
                prem = prem + sheen * a2[..., None] * np.array([0.8, 0.9, 1.0], np.float32)
                a = a2
            tex[p.stem] = (prem, a)
        self.tex = tex
        rng = np.random.default_rng(7)
        # (texture, appears at, screen centre at appearance (px), depth (m), width (m), yaw (deg))
        P = [
            ("pane-window-0", T["not_"], (300, 560), 2.6, 0.62, 13),
            ("pane-window-1", T["use"], (780, 830), 2.2, 0.6, -11),
            ("pane-window-2", T["software"], (560, 455), 3.0, 0.66, 4),
            ("pane-dash-0", T["not2"], (250, 990), 2.0, 0.6, 15),
            ("pane-dash-1", T["have"], (830, 540), 2.8, 0.64, -14),
            ("pane-dash-2", T["dashboards"], (520, 730), 1.8, 0.56, -5),
            ("pane-window-3", T["certain"], (150, 300), 2.5, 0.6, 18),
            ("pane-dash-3", T["level"], (930, 1010), 2.1, 0.6, -16),
            ("pane-window-4", T["level"] + 0.32, (470, 1080), 1.6, 0.52, 6),
        ]
        tabs = [T["and_"], T["not3"], T["because3"], T["ai"], T["became"], T["another"]]
        self.panes = []
        for name, t0, (sx, sy), z, wm, yaw in P:
            self.panes.append(self._pane(name, t0, sx, sy, z, wm, yaw, rng, shards=14))
        for i, t0 in enumerate(tabs):
            sx = 120 + i * 178
            self.panes.append(self._pane("tab-ai" if i == 3 else "tab", t0, sx, 975 + 6 * math.sin(i * 1.7), 1.75,
                                         0.235, -6 + 2 * i, rng, shards=3, tab=i))
        # Break order: the nearest first, a few hundredths apart.
        order = sorted(range(len(self.panes)), key=lambda i: self.panes[i]["z"])
        for rank, i in enumerate(order):
            self.panes[i]["break"] = T["ambition"] + 0.025 * rank

    def _pane(self, name, t0, sx, sy, z, wm, yaw, rng, shards, tab=None):
        prem, a = self.tex[name]
        th, tw = a.shape
        hm = wm * th / tw
        f = self.F0 * self.zoom(t0)
        cz = self.cam_z(t0)
        Z = z
        X = (sx - W / 2) * (Z - cz) / f
        Y = (sy - H / 2) * (Z - cz) / f
        cells = voronoi_cells(tw, th, shards, rng)
        sh = []
        for c in cells:
            cen = c.mean(axis=0)
            out = np.array([(cen[0] / tw - 0.5) * wm, (cen[1] / th - 0.5) * hm])
            d = out / (np.linalg.norm(out) + 1e-6)
            sh.append(dict(poly=c, cen=cen,
                           v=np.array([d[0] * rng.uniform(0.5, 1.4) + rng.normal(0, 0.2),
                                       d[1] * rng.uniform(0.5, 1.4) + rng.normal(0, 0.2) - 0.15,
                                       -rng.uniform(2.6, 5.2)]),
                           axis=rng.normal(0, 1, 3), w=rng.uniform(3.0, 9.0) * rng.choice([-1, 1]),
                           glint=rng.uniform(0, 6.28)))
        return dict(name=name, t0=t0, X=X, Y=Y, z=Z, wm=wm, hm=hm, tw=tw, th=th, yaw=math.radians(yaw),
                    drift=np.array([rng.normal(0, 0.012), rng.normal(0, 0.01)]), spin=rng.normal(0, 0.03),
                    shards=sh, tab=tab, seed=rng.uniform(0, 100))

    def zoom(self, t):
        s = self.office
        p = clamp((t * FPS - s["a"]) / max(1, (s["b"] - s["a"] - 1)))
        p = p * p * (3 - 2 * p)
        z = s["move"]["zoom"]
        return z[0] + (z[1] - z[0]) * p

    def cam_z(self, t):
        return 0.45 * ss(t, self.office["a"] / FPS, 14.0)

    def project(self, P, t):
        f = self.F0 * self.zoom(t)
        Z = P[:, 2] - self.cam_z(t)
        return np.stack([W / 2 + f * P[:, 0] / Z, H / 2 + f * P[:, 1] / Z], 1), Z

    def _pose(self, p, t):
        """A pane's centre and turn at t (before it breaks): drifting, and as ambition grows, trembling."""
        age = t - p["t0"]
        tremble = ss(t, self.T["at"], self.T["ambition"]) * 0.006
        c = np.array([p["X"] + p["drift"][0] * age + tremble * math.sin(t * 47 + p["seed"]),
                      p["Y"] + p["drift"][1] * age + tremble * math.cos(t * 41 + p["seed"]), p["z"]])
        r = rot(p["yaw"] + p["spin"] * age, 0.04 * math.sin(p["seed"]), 0.02 * math.cos(p["seed"]))
        return c, r

    def draw(self, img, L, t, samples=1, shutter=0.5 / FPS):
        """Over img (linear, in place): every pane that has appeared and not yet broken, then its glass. Rim light and
        glints go to L."""
        layer = np.zeros((H, W, 3), np.float32)
        alpha = np.zeros((H, W), np.float32)
        n_s = samples if any(t >= p["break"] - 0.02 for p in self.panes) else 1
        for j in range(n_s):
            ts = t if n_s == 1 else t + ((j + 0.5) / n_s - 0.5) * shutter
            lay = np.zeros((H, W, 3), np.float32)
            alp = np.zeros((H, W), np.float32)
            for p in sorted(self.panes, key=lambda p: -p["z"]):
                if ts < p["t0"] - 0.02:
                    continue
                if ts < p["break"]:
                    self._whole(p, ts, lay, alp, L if j == 0 else None)
                else:
                    self._glass(p, ts, lay, alp, L if j == 0 else None)
            layer += lay / n_s
            alpha += alp / n_s
        img *= (1 - alpha)[..., None]
        img += layer

    def _quad_warp(self, prem, a, src, dst, lay, alp, k, mask_poly=None):
        """The texture's src points (texture px) to dst (film px), premultiplied, over lay/alp with opacity k; with a
        mask_poly (film px), only inside it (a shard's outline, which may reach past its quad)."""
        ext = dst if mask_poly is None else np.vstack([dst, mask_poly])
        x0, y0 = np.floor(ext.min(axis=0)).astype(int) - 2
        x1, y1 = np.ceil(ext.max(axis=0)).astype(int) + 2
        x0, y0 = max(x0, 0), max(y0, 0)
        x1, y1 = min(x1, W), min(y1, H)
        if x1 <= x0 or y1 <= y0 or k <= 0:
            return
        M = cv2.getPerspectiveTransform(src.astype(np.float32), (dst - [x0, y0]).astype(np.float32))
        size = (x1 - x0, y1 - y0)
        tex = np.dstack([prem, a])
        out = cv2.warpPerspective(tex, M, size, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        if mask_poly is not None:
            m = np.zeros((size[1], size[0]), np.uint8)
            cv2.fillConvexPoly(m, np.round((mask_poly - [x0, y0]) * 16).astype(np.int32), 255, cv2.LINE_AA, shift=4)
            out *= (m.astype(np.float32) / 255)[..., None]
        out *= k
        sub_a = alp[y0:y1, x0:x1]
        lay[y0:y1, x0:x1] = lay[y0:y1, x0:x1] * (1 - out[..., 3:4]) + out[..., :3]
        alp[y0:y1, x0:x1] = sub_a + out[..., 3] * (1 - sub_a)

    def _whole(self, p, t, lay, alp, L):
        prem, a = self.tex[p["name"]]
        c, r = self._pose(p, t)
        grow = ease_out(lin(t, p["t0"], p["t0"] + 0.32))
        s = 0.86 + 0.14 * grow
        hw, hh = p["wm"] / 2 * s, p["hm"] / 2 * s
        corners = np.array([[-hw, -hh, 0], [hw, -hh, 0], [hw, hh, 0], [-hw, hh, 0]]) @ r.T + c
        dst, Z = self.project(corners, t)
        if (Z < 0.1).any():
            return
        tw, th = p["tw"], p["th"]
        src = np.array([[0, 0], [tw, 0], [tw, th], [0, th]], np.float64)
        k = lin(t, p["t0"] - 0.02, p["t0"] + 0.1) * 0.94
        # Screens give light: the panes' own colours a little brighter than the room's.
        bright = 1.35 + (1.2 * flash(t, self.T["tab"] + 0.02, 0.05, 0.5) if p["tab"] == 3 else 0)
        self._quad_warp(prem * bright, a, src, dst, lay, alp, k)
        if L is not None:
            rim = 0.18 + 1.6 * flash(t, p["t0"] + 0.04, 0.04, 0.32)
            if p["tab"] == 3:
                rim += 1.4 * flash(t, self.T["ai"] + 0.04, 0.04, 0.4) + 1.2 * flash(t, self.T["tab"] + 0.02, 0.04, 0.5)
            loop = np.vstack([dst, dst[:1]])
            L.path(loop, 0.55 * rim * k, ICE, 1.0)
            L.path(loop, 0.12 * rim * k, ICE, 4.0)

    def _glass(self, p, t, lay, alp, L):
        prem, a = self.tex[p["name"]]
        c0, r0 = self._pose(p, p["break"])
        tau = t - p["break"]
        tw, th = p["tw"], p["th"]
        sx, sy = p["wm"] / tw, p["hm"] / th
        for sh in p["shards"]:
            cen_local = np.array([(sh["cen"][0] - tw / 2) * sx, (sh["cen"][1] - th / 2) * sy, 0.0])
            cen = c0 + r0 @ cen_local + sh["v"] * tau + np.array([0, 0.35, 0]) * tau * tau
            rr = axis_angle(sh["axis"], sh["w"] * tau) @ r0
            local = np.column_stack([(sh["poly"][:, 0] - sh["cen"][0]) * sx, (sh["poly"][:, 1] - sh["cen"][1]) * sy,
                                     np.zeros(len(sh["poly"]))])
            pts3 = local @ rr.T + cen
            if (pts3[:, 2] - self.cam_z(t) < 0.16).any():
                continue
            dst, Z = self.project(pts3, t)
            if np.abs(dst).max() > 6000:
                continue
            # The shard's plane through four of its texture's points, for the warp.
            q = np.array([[-1, -1], [1, -1], [1, 1], [-1, 1]], np.float64) * 40
            src = sh["cen"] + q
            q3 = np.column_stack([q[:, 0] * sx, q[:, 1] * sy, np.zeros(4)]) @ rr.T + cen
            qd, _ = self.project(q3, t)
            near = clamp((min(Z) - 0.16) / 0.3)
            nrm = rr @ np.array([0, 0, 1.0])
            h = np.array([0.0, -0.35, -1.0])
            h /= np.linalg.norm(h)
            spec = abs(float(np.dot(nrm, h))) ** 14
            self._quad_warp(prem * (1.35 + 2.5 * spec), a, src, qd, lay, alp, 0.9 * near, mask_poly=dst)
            if L is not None:
                glint = (0.12 + 2.6 * spec) * near
                loop = np.vstack([dst, dst[:1]])
                L.path(loop, 0.45 * glint, ICE, 0.9)
                L.path(loop, 0.07 * glint, ICE, 4.0)


# ------------------------------------------------------------------ the film


class Film:
    def __init__(self, work):
        self.work = work
        self.root = work / "we-are-here"
        self.edit = json.loads((self.root / "edit.json").read_text())
        self.cut = self.edit["cut"]
        self.src = Sources(self.root, self.edit)
        self.clock = Clock(self.edit["cues"])
        self.T = self.clock.T
        office = self.src.shots["office"]
        self.noise = Noise(self.root / "textures", self.T, office)
        self.tags = {k: load_rgba(self.root / "textures" / f"tag-{k}.png") for k in ("client", "property")}
        self.type_dir = self.root / "type" / "frames"
        art = json.loads((work / "film-as-one" / "data.json").read_text())
        self.art, self.letters = art["art"], art["letters"]
        self.emblem = load_rgba(work / "film-as-one" / "emblem.png", premul=False)
        self.lettering = load_rgba(work / "film-as-one" / "letters-key.png", premul=False)
        rng = np.random.default_rng(11)
        self.grain = [cv2.GaussianBlur(rng.normal(0, 1, (H, W)).astype(np.float32), (0, 0), 0.7) for _ in range(6)]
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        self.vignette = (1 - 0.2 * (((xx - W / 2) / (W / 2)) ** 2 * 0.7 + ((yy - H / 2) / (H / 2)) ** 2)).clip(0, 1)
        self.xx, self.yy = xx, yy
        # A real lens parts its colours a little toward the frame's edges: red out, blue in, half a pixel at most.
        self.ca = {}
        for c, k in ((0, 1.00045), (2, 0.99955)):
            self.ca[c] = ((W / 2 + (xx - W / 2) / k).astype(np.float32), (H / 2 + (yy - H / 2) / k).astype(np.float32))
        # The end card: the supplied art's emblem and lettering, the triangle's apex at (540, 382), 0.9 px a pixel.
        self.card_s = 0.9
        self.card_o = (540.0, 382.0)
        tr = {tuple(x["pair"]): x for x in self.edit["transitions"]}[("rise", "sky")]
        self.dissolve = (tr["a"], tr["b"])
        self.twins = {}

    # ---------------------------------------------------------------- the digital twin and the platform's marks

    def twin(self, key):
        """A shot's digital twin (twin.py), built the first time it is wanted."""
        if key not in self.twins:
            shot = self.src.shots[key]
            self.twins[key] = Twin(shot, StillCamera(shot), seed=len(self.twins) + 5)
        return self.twins[key]

    def turn(self, img, L, key, n, cx, cy, R, extra=0.0, dim=0.9, soft=160.0, ring=1.0, scan=None, k=1.0):
        """The physical picture turned into its digital twin behind a wave of light going out from (cx, cy) to radius
        R: the picture dims behind the wave (by `dim`), the twin is drawn there, and the wave's front is a ring."""
        if R <= 0:
            return img
        dist = np.hypot(self.xx - cx, self.yy - cy)
        m = np.clip((R - dist) / soft, 0, 1)
        img *= (1 - dim * m)[..., None]

        def reveal(pos):
            return np.clip((R - np.hypot(pos[:, 0] - cx, pos[:, 1] - cy)) / soft, 0, 1)

        self.twin(key).draw(L, n, extra=extra, reveal=reveal, k=k, scan=scan)
        if ring > 0 and R < 2600:
            L.ring(cx, cy, R, mixc(ICE, GOLD, 0.25), 0.9 * ring, 1.4)
            L.ring(cx, cy, R, mixc(ICE, GOLD, 0.25), 0.1 * ring, 14.0)
        return img

    def layer(self, img, L, key, n, t0, t1, k=0.85):
        """The platform's layer laid over a world: a scan crosses the frame from top to bottom between t0 and t1, and
        behind it the world's twin lies over its picture, which stays, a little darker. The scan line is cyan."""
        t = self.t_of(n)
        p = lin(t, t0, t1)
        ys = -80 + ease_in_out(p) * (H + 160)
        yy = self.yy[:, :1]
        m = np.clip((ys - yy) / 120.0, 0, 1)
        img *= (1 - 0.42 * m)[..., None]
        self.twin(key).draw(L, n, reveal=lambda pos: np.clip((ys - pos[:, 1]) / 120.0, 0, 1), k=k, links=0.25)
        if 0 < p < 1:
            L.path([[-10, ys], [W + 10, ys]], 1.3, CYAN, 1.2)
            L.path([[-10, ys], [W + 10, ys]], 0.16, CYAN, 10.0)
        return img

    MODULES = ["research", "clients", "reports", "finance", "communication"]

    def glyph(self, L, i, x, y, k, r=26.0):
        """A module's mark, in gold line: research a scan of a lot, clients a home, reports a page, finance a rise,
        communication a signal; each in its ring."""
        if k <= 0.01:
            return
        g = GOLD
        L.ring(x, y, r, g, 1.0 * k, 1.0)
        L.ring(x, y, r, g, 0.12 * k, 5.0)
        L.glow(x, y, r * 1.3, g, 0.05 * k)
        s = r * 0.52

        def line(*pts):
            L.path(np.array(pts, np.float64) * s + [x, y], 1.2 * k, WARM, 0.9)

        if i == 0:
            line((-1, -1), (1, -1), (1, 1), (-1, 1), (-1, -1))
            line((-0.5, 0), (0.5, 0))
            line((0, -0.5), (0, 0.5))
        elif i == 1:
            line((-0.9, 0.85), (-0.9, -0.1), (0, -0.95), (0.9, -0.1), (0.9, 0.85), (-0.9, 0.85))
            line((-0.25, 0.85), (-0.25, 0.3), (0.25, 0.3), (0.25, 0.85))
        elif i == 2:
            line((-0.7, -1), (0.35, -1), (0.75, -0.6), (0.75, 1), (-0.7, 1), (-0.7, -1))
            for yy in (-0.35, 0.05, 0.45):
                line((-0.42, yy), (0.45, yy))
        elif i == 3:
            for j, hh in enumerate((0.55, 1.0, 1.5)):
                xx = -0.7 + j * 0.6
                line((xx, 0.9), (xx, 0.9 - hh), (xx + 0.32, 0.9 - hh), (xx + 0.32, 0.9))
            line((-0.85, 0.15), (-0.2, -0.3), (0.3, -0.15), (0.9, -0.85))
        else:
            L.point(x - 0.55 * s, y + 0.55 * s, 2.0 * k, WARM, 1.4)
            for j, rr in enumerate((0.55, 1.0, 1.45)):
                a = np.linspace(-1.35, -0.2, 16)
                line(*[(-0.55 + rr * math.cos(v), 0.55 + rr * math.sin(v)) for v in a])

    # ---------------------------------------------------------------- the five worlds and the shots' own light

    def t_of(self, n):
        return n / FPS

    def open_(self, n, L):
        T, t = self.T, self.t_of(n)
        img = self.src.plate("open", n)
        x, y, ok, _ = self.src.at("open", "crown", n)
        kindle = ss(t, T["operate"] - 0.1, T["operate"] + 0.15)
        k = 0.05 + 0.95 * kindle
        beacon(L, x, y, k * (1 + 0.06 * math.sin(t * 5.1)), flare=0.9 * flash(t, T["operate"] + 0.1, 0.08, 0.6))
        # A ring of light goes out from it as it kindles.
        g = lin(t, T["operate"] + 0.05, T["operate"] + 1.0)
        if 0 < g < 1:
            L.ring(x, y, 6 + 150 * ease_out(g), GOLD, 0.7 * (1 - g) ** 1.5, 1.1)
        # The filament climbs into the sky.
        climb = ease_out(lin(t, T["operate"] + 0.25, T["differently"] + 0.75))
        if climb > 0:
            filament(L, x, y - 3, y - 3 - climb * (y + 40), 0.85 * k)
        return img

    def office(self, n, L, front):
        T, t = self.T, self.t_of(n)
        img = self.src.plate("office", n)
        x, y, _, _ = self.src.at("office", "crown", n)
        # The point at the crown, out across the city, lost behind the panes as they come.
        k = 0.9 + 0.08 * math.sin(t * 4.3)
        back = Light()
        beacon(back, x, y, k)
        filament(back, x, y - 3, y - 3 - 210, 0.5 * k, head=False)
        if back.used:
            img += back.resolve()
        self.noise.draw(img, front, t, samples=3)
        return img

    def air(self, n, L):
        T, t = self.T, self.t_of(n)
        img = self.src.plate("night-air", n)
        x, y, _, _ = self.src.at("night-air", "glow", n)
        tx, ty, _, _ = self.src.at("night-air", "crown", n)
        surge = flash(t, T["changes"], 0.12, 0.7)
        beacon(L, tx, ty, 1.1, flare=1.2 * surge)
        L.glow(x, y, 26, GOLD, 0.25 + 0.4 * surge)
        g = lin(t, T["changes"], T["changes"] + 0.9)
        if 0 < g < 1:
            L.ring(tx, ty, 8 + 260 * ease_out(g), GOLD, 0.9 * (1 - g) ** 1.4, 1.2)
        # Free: the filament runs up from the crown out of the frame.
        climb = ease_out(lin(t, T["question"] - 0.1, T["changes"] + 0.45))
        filament(L, tx, ty - 3, ty - 3 - (0.12 + 0.88 * climb) * (ty + 60), 1.1 + 0.8 * surge)
        # On "changes" the question changes the world: the city turns into its digital twin from the crown out, and
        # the camera flies on into it, a plane of light passing through it ahead of the camera.
        a = T["changes"] - 0.02
        if t > a:
            R = 2400 * ease_out(lin(t, a, a + 0.6))
            end = self.cut["research"] / FPS
            fly = 0.92 * ease_in_out(lin(t, a + 0.05, end + 0.05))
            sweep = 0.95 - 0.9 * lin(t, a + 0.1, end)
            img = self.turn(img, L, "night-air", n, tx, ty, R, extra=fly, dim=0.9, scan=(sweep, 2.5))
        return img

    def research(self, n, L):
        T, t = self.T, self.t_of(n)
        img = self.src.plate("research", n)
        e = self.src.mask("research", "edges", n)
        a = T["names"][0]
        # The platform reads the suburb: its scan crosses the frame, its layer lies on the lots behind it, and the lots'
        # lit edges answer in cyan.
        img = self.layer(img, L, "research", n, a + 0.02, a + 0.8)
        p = lin(t, a + 0.02, a + 0.8)
        ys = -80 + ease_in_out(p) * (H + 160)
        near = np.exp(-((self.yy[:, :1] - ys) / 26.0) ** 2)
        img += (e * (1.6 * near * (0 < p < 1) + 0.25 * (self.yy[:, :1] < ys)))[..., None] * np.array(CYAN, np.float32) * 0.8
        # Then the one lot: four corners of gold drawn about it.
        sel = ease_out(lin(t, a + 0.5, a + 0.95))
        if sel > 0:
            cs = [np.array(self.src.at("research", f"lot{i}", n)[:2]) for i in range(4)]
            for i in range(4):
                c, nx, pv = cs[i], cs[(i + 1) % 4], cs[(i - 1) % 4]
                arm = 0.28 * sel
                L.path([c + (nx - c) * arm, c, c + (pv - c) * arm], 1.6 * sel, GOLD, 1.0)
                L.path([c + (nx - c) * arm, c, c + (pv - c) * arm], 0.25 * sel, GOLD, 4.0)
            m = np.mean(cs, axis=0)
            L.glow(m[0], m[1], 60, GOLD, 0.05 * sel)
        return img

    def clients(self, n, L):
        T, t = self.T, self.t_of(n)
        img = self.src.plate("clients", n)
        win = self.src.mask("clients", "windows", n)
        a = T["names"][1]
        img = self.layer(img, L, "clients", n, a + 0.02, a + 0.9)
        up = ss(t, a - 0.05, a + 0.7)
        img += (win * (0.35 + 0.9 * up))[..., None] * img * 1.0
        x, y, _, _ = self.src.at("clients", "door", n)
        L.glow(x, y, 48, WARM, 0.12 + 0.2 * up)
        return img

    def reports(self, n, L):
        T, t = self.T, self.t_of(n)
        img = self.src.plate("reports", n)
        m = self.src.mask("reports", "model", n)
        a = T["names"][2]
        img = self.layer(img, L, "reports", n, a + 0.02, a + 0.85)
        # A rim of gold climbs the model.
        p = lin(t, a, a + 0.85)
        yb = H * (1.02 - 1.15 * ease_in_out(p))
        band = np.exp(-((self.yy[:, :1] - yb) / 70.0) ** 2)
        img += (m * band * 2.2)[..., None] * np.array(GOLD, np.float32) * (1 if 0 < p < 1 else 0)
        img += (m * 0.25 * ss(t, a, a + 0.9))[..., None] * np.array(GOLD, np.float32) * img.mean(axis=2, keepdims=True)
        return img

    def finance(self, n, L):
        T, t = self.T, self.t_of(n)
        img = self.src.plate("finance", n)
        m = self.src.mask("finance", "lights", n)
        a = T["names"][3]
        img = self.layer(img, L, "finance", n, a + 0.02, a + 0.85)
        # The towers' floors light from the street up: dark above the wave, gold below it.
        p = lin(t, a - 0.02, a + 0.94)
        yw = H * (1.05 - 1.2 * ease_in_out(p))
        yy = self.yy[:, :1]
        below = np.clip((yy - yw) / 60.0 + 0.5, 0, 1)
        front = np.exp(-((yy - yw) / 40.0) ** 2)
        img *= (1 - m * 0.75 * (1 - below))[..., None]
        img += (m * (0.55 * below + 1.6 * front))[..., None] * np.array(WARM, np.float32) * 0.8
        return img

    def comms(self, n, L):
        T, t = self.T, self.t_of(n)
        img = self.src.plate("comms", n)
        tr = self.src.mask("comms", "trails", n)
        ph = self.src.mask("comms", "phase", n)
        a = T["names"][4]
        img = self.layer(img, L, "comms", n, a + 0.02, a + 0.85)
        # Streams of light along the trails, toward the city: pulses travelling up each trail's own length.
        u = ph * 7.0 - t * 2.6
        pulse = np.exp(-((u - np.floor(u) - 0.5) / 0.08) ** 2)
        img += (tr * (0.25 + 1.6 * pulse))[..., None] * img
        return img

    WORLDS = ["research", "clients", "reports", "finance", "comms"]

    def world(self, key, n, L):
        return getattr(self, key)(n, L)

    def sunrise(self, n, L):
        T, t = self.T, self.t_of(n)
        img = self.src.plate("sunrise", n)
        cx, cy, cok, csc = self.src.at("sunrise", "crown", n)
        names = ["p4", "p1", "p3", "p5", "p2"]
        starts = [T["more"] - 0.4, T["more"] - 0.2, T["more"] + 0.05, T["valuable"] if "valuable" in T else T["more"] + 0.3,
                  T["more"] + 0.6]
        dest = T["destinations"]
        arrived = 0.0
        fade = 1 - ss(t, dest + 0.25, dest + 0.85)
        for name, t0 in zip(names, starts):
            ox, oy, ook, _ = self.src.at("sunrise", name, n)
            # Each place a module of its own first: its mark, lit with a ring going out.
            on = ss(t, t0 - 0.35, t0 - 0.1) * fade
            if on > 0 and -50 < ox < W + 50 and -50 < oy < H + 50:
                mod = names.index(name)
                self.glyph(L, mod, ox, oy - 34, on)
                L.point(ox, oy, 2.2 * on, WARM, 1.4)
                L.path([[ox, oy], [ox, oy - 8]], 0.8 * on, GOLD, 0.8)
                pg = lin(t, t0 - 0.35, t0 + 0.4)
                if 0 < pg < 1:
                    L.ring(ox, oy - 34, 26 + 60 * ease_out(pg), GOLD, 0.6 * (1 - pg), 1.0)
            g = ease_in_out(lin(t, t0, t0 + 1.45))
            if g <= 0 or fade <= 0:
                continue
            mid = ((ox + cx) / 2, min(oy, cy) - 0.32 * math.hypot(cx - ox, cy - oy))
            curve = bezier((ox, oy), mid, (cx, cy), 96)
            m = max(2, int(len(curve) * g))
            seg = curve[:m]
            kk = np.linspace(0.35, 1.0, m) * fade * (1 + 1.2 * flash(t, dest, 0.06, 0.4))
            L.path(seg, 0.95 * kk, GOLD, 0.85)
            L.path(seg, 0.22 * kk, GOLD, 3.2)
            L.path(seg, 0.05 * kk, GOLD, 11.0)
            if g < 1:
                hx, hy = seg[-1]
                L.point(hx, hy, 3.0 * fade, WARM, 1.4)
                L.glow(hx, hy, 16, GOLD, 0.28 * fade)
            arrived += flash(t, t0 + 1.45, 0.03, 0.35)
        if cok or n < self.src.shots["sunrise"]["a"] + 100:
            beacon(L, cx, cy, 1.0 + 0.6 * arrived, flare=0.6 * arrived + 1.4 * flash(t, dest, 0.06, 0.6))
        return img

    def pulse_(self, n, L):
        T, t = self.T, self.t_of(n)
        img = self.src.plate("pulse", n)
        road = self.src.mask("pulse", "road", n)
        vx, vy, _, _ = self.src.at("pulse", "vp", n)
        bx, by, _, _ = self.src.at("pulse", "road", n)

        def on_road(D):
            """The road's centre line D road-lengths away (1 at the frame's foot), in the frame."""
            return vx + (bx - vx) / D, vy + (by - vy) / D

        def pulse_at(t0, tt):
            # It leaves the camera behind, slower than its own speed looks: it is chased, not lost.
            return math.exp(1.25 * max(0.0, tt - t0)) * 0.92

        # Behind the pulses the avenue takes on the platform's layer: intelligence moving through the city, and the
        # city known as it passes.
        D1 = pulse_at(T["intelligence"], t) if t > T["intelligence"] else 0.0
        if D1 > 0:
            hy = on_road(D1)[1]
            reach = H - (H - hy) * 1.0
            self.twin("pulse").draw(L, n, reveal=lambda pos: np.clip((pos[:, 1] - reach) / 260.0, 0, 1)
                                    * np.clip(1.2 - np.abs(pos[:, 0] - W / 2) / 520.0, 0, 1), k=0.55, links=0.2)
            img *= (1 - 0.25 * np.clip((self.yy[:, :1] - reach) / 260.0, 0, 1))[..., None]
        for t0, k in ((T["intelligence"], 1.0), (T["move"], 0.8), (T["context"], 0.9)):
            if t < t0 - 0.02 or t > t0 + 2.6:
                continue
            D = pulse_at(t0, t)
            hx, hy = on_road(D)
            # its tail: where it was over the last half second
            ts = np.linspace(max(t0, t - 0.5), t, 56)
            tail = np.array([on_road(pulse_at(t0, s)) for s in ts])
            w = max(1.0 / D, 0.22)
            fade = 1 - lin(t, t0 + 1.8, t0 + 2.6)
            kk = np.linspace(0.0, 1.0, len(tail)) ** 1.5 * k * fade
            L.path(tail, 1.8 * kk, WARM, max(0.9, 3.6 * w))
            L.path(tail, 0.4 * kk, GOLD, max(2.5, 13 * w))
            L.point(hx, hy, 14.0 * k * fade, WHITE, max(1.4, 5.5 * w))
            L.point(hx, hy, 2.0 * k * fade, WARM, max(3.0, 14 * w))
            L.glow(hx, hy, max(12, 90 * w), GOLD, 0.5 * k * fade)
            L.streak(hx, hy, max(60, 380 * w), mixc(GOLD, WHITE, 0.3), 1.0 * k * fade)
            # its light on the wet road
            pool = np.exp(-(((self.xx - hx) / (220 * w + 12)) ** 2 + ((self.yy - hy) / (360 * w + 16)) ** 2))
            img += (road * pool * 1.6 * k * fade)[..., None] * np.array(GOLD, np.float32)
        return img

    def context_tags(self, img, n):
        """The client's and the property's tags, following the third pulse up the avenue from "context", above the
        words: they come in low over the road one after the other and glide toward the light, smaller as they go."""
        T, t = self.T, self.t_of(n)
        end = self.cut["grid"] / FPS
        if not (T["context"] - 0.05 < t < end):
            return
        vx, vy, _, _ = self.src.at("pulse", "vp", n)
        bx, by, _, _ = self.src.at("pulse", "road", n)
        y0 = 1075.0
        for i, (key, lag) in enumerate((("client", 0.1), ("property", 0.42))):
            tt = t - T["context"] - lag
            if tt < 0:
                continue
            y = vy + (y0 - vy) / (1 + 0.75 * tt)
            x = vx + (bx - vx) * (y - vy) / (by - vy)
            s = 0.34 * ((y - vy) / (y0 - vy)) ** 0.3
            y += i * 92 * s / 0.34
            k = ease_out(lin(tt, 0, 0.22)) * (1 - ss(t, end - 0.4, end - 0.08))
            prem, a = self.tags[key]
            th, tw = a.shape
            rise = (1 - ease_out(lin(tt, 0, 0.3))) * 18
            dst = np.array([[x - tw * s / 2, y - th * s / 2 + rise], [x + tw * s / 2, y - th * s / 2 + rise],
                            [x + tw * s / 2, y + th * s / 2 + rise], [x - tw * s / 2, y + th * s / 2 + rise]])
            lay = np.zeros((H, W, 3), np.float32)
            alp = np.zeros((H, W), np.float32)
            self.noise._quad_warp(prem * 1.15, a, np.array([[0, 0], [tw, 0], [tw, th], [0, th]], np.float64), dst,
                                  lay, alp, k)
            img *= (1 - alp)[..., None]
            img += lay

    def grid(self, n, L):
        T, t = self.T, self.t_of(n)
        img = self.src.plate("grid", n)
        st = self.src.mask("grid", "streets", n)
        li = self.src.mask("grid", "lights", n)
        ph = self.src.mask("grid", "phase", n)
        a = self.cut["grid"] / FPS
        r = 0.02 + 0.98 * ease_in_out(lin(t, a + 0.05, T["one"] - 0.05))
        lit = np.clip((r - ph) / 0.04, 0, 1) * (ph > 0)
        front = np.exp(-((ph - r) / 0.025) ** 2) * (r < 0.99)
        one = flash(t, T["one"], 0.03, 0.55)
        after = ss(t, T["one"], T["one"] + 0.3)
        gold = np.array(GOLD, np.float32)
        img += (st * (0.55 * lit + 1.4 * front))[..., None] * gold
        img += ((st * 1.1 + li * 1.4) * one + (st * 0.3 + li * 0.35) * after)[..., None] * gold * (0.6 + 0.4 * img)
        cx, cy, _, _ = self.src.at("grid", "centre", n)
        g = lin(t, T["one"], T["one"] + 0.9)
        if 0 < g < 1:
            L.ring(cx, cy, 20 + 1300 * ease_out(g), GOLD, 1.1 * (1 - g) ** 1.6, 2.0)
        L.glow(cx, cy, 260, GOLD, 0.35 * one)
        return img

    def device(self, n, L):
        T, t = self.T, self.t_of(n)
        img = self.src.plate("device", n)
        sc = self.src.mask("device", "screen", n)
        sp = self.src.mask("device", "spill", n)
        k = ease_in_out(lin(t, T["is_"], T["is_"] + 0.35))
        if k > 0:
            glass = np.array([0.006, 0.008, 0.012], np.float32)
            img = img * (1 - (sc * k * 0.97))[..., None] + (sc * k)[..., None] * glass
            img *= (1 - sp * k * 0.75)[..., None]
        return img

    RISE_EDGES = [("n1", "n14"), ("n14", "n4"), ("n1", "n2"), ("n2", "n3"), ("n3", "n4"), ("n3", "n8"), ("n8", "n7"),
                  ("n7", "n12"), ("n4", "n11"), ("n11", "n13"), ("n13", "n5"), ("n5", "n6"), ("n5", "n10"),
                  ("n10", "n9"), ("n9", "n13"), ("n12", "n11")]
    RISE_HUBS = ["n1", "n14", "n4", "n13", "n9", "n3"]

    def rise(self, n, L, lift_off=True):
        T, t = self.T, self.t_of(n)
        img = self.src.plate("rise", n)
        P = {k: np.array(self.src.at("rise", k, n)[:2]) for k in [f"n{i}" for i in range(1, 15)] + ["crown", "base"]}
        crown = P["crown"]
        a = self.cut["rise"] / FPS
        grow = ease_out(lin(t, a + 0.1, a + 1.0))
        draw_in = ease_in_out(lin(t, T["becomes"] - 0.1, T["system"] + 0.05))
        lift = flash(t, T["system"], 0.05, 0.7)
        k = (1 - draw_in) * grow
        # The network across the city, each line drawn from its middle out, then all of it drawn in to the tower.
        for i, (u, v) in enumerate(self.RISE_EDGES):
            p0, p1 = P[u], P[v]
            p0 = p0 + (crown - p0) * draw_in
            p1 = p1 + (crown - p1) * draw_in
            m = (p0 + p1) / 2
            s = clamp(grow * 1.4 - i * 0.025)
            q0, q1 = m + (p0 - m) * s, m + (p1 - m) * s
            L.path([q0, q1], 0.55 * k, GOLD, 0.8)
            L.path([q0, q1], 0.12 * k, GOLD, 3.0)
            # a pulse running each line toward the tower
            ph = (t * 0.9 + i * 0.37) % 1.0
            pp = q0 + (q1 - q0) * ph
            L.point(pp[0], pp[1], 1.6 * k, WARM, 1.3)
        for hub in self.RISE_HUBS:
            p = P[hub] + (crown - P[hub]) * draw_in
            kh = k * ss(t, a + 0.4, a + 1.2)
            L.path([p, crown], 0.5 * kh, GOLD, 0.8)
            L.path([p, crown], 0.1 * kh, GOLD, 3.0)
        for i in range(1, 15):
            p = P[f"n{i}"] + (crown - P[f"n{i}"]) * draw_in
            L.point(p[0], p[1], 1.5 * k * grow, WARM, 1.4)
            L.glow(p[0], p[1], 12, GOLD, 0.12 * k * grow)
        gathered = ss(t, T["becomes"], T["system"])
        # "becomes the system": the city turns into its digital twin from the tower out, the whole of it one system.
        R = 2600 * ease_in_out(lin(t, T["becomes"] - 0.15, T["system"] + 0.2))
        if R > 0:
            gone = 1 - ss(n, self.dissolve[0], self.dissolve[1])
            img = self.turn(img, L, "rise", n, crown[0], crown[1], R, dim=0.85 * gone, k=0.9 * gone,
                            ring=gone * (1 - lin(t, T["system"], T["system"] + 0.3)))
        beacon(L, crown[0], crown[1], 0.9 + 1.4 * gathered, flare=1.3 * lift + 0.4 * gathered)
        # On "the system", the line of light lifts off the crown and rises out of the frame.
        up = ease_out(lin(t, T["system"], T["system"] + 0.55))
        if up > 0 and lift_off:
            top = crown[1] - 3 - up * (crown[1] + 80)
            filament(L, crown[0], crown[1] - 3, top, 2.0)
            L.path([[crown[0], crown[1]], [crown[0], top]], 0.12, mixc(GOLD, ICE, 0.4), 14.0)
        return img

    # ---------------------------------------------------------------- the end card

    def rise_crown(self):
        """Where the rise leaves the crown: the line of light hangs down to there in the sky."""
        s = self.src.shots["rise"]
        return self.src.at("rise", "crown", s["b"] - 1)[:2]

    def art_to_film(self, ax, ay):
        s = self.card_s
        return self.card_o[0] + (ax - self.art["apex"][0]) * s, self.card_o[1] + (ay - self.art["apex"][1]) * s

    def card(self, img, L, t, beam_x=None, beam_bottom=None):
        """The beam drawn into the emblem's orb, the triangle traced, the emblem, its lettering letter by letter, and
        the light circling inside the A until the orb keeps it (As One's end card)."""
        T = self.T
        ox, oy = self.art_to_film(*self.art["orb"])
        gather = ease_in_out(lin(t, T["aurixa"] - 0.1, T["aurixa"] + 1.05))
        # The beam: from the top of the frame and up from the horizon, both ends closing on the orb.
        if gather < 1:
            top = -40 + (oy + 40) * gather
            b0 = self.rise_crown()[1] if beam_bottom is None else beam_bottom
            bot = b0 + (oy - b0) * gather
            bx = ox if beam_x is None else beam_x
            if bot - top > 2:
                ys = np.linspace(top, bot, 160)
                kk = (1.0 - 0.6 * gather) * (1 + 1.0 * flash(t, T["aurixa"] + 0.05, 0.18, 0.9))
                pts = np.stack([np.full_like(ys, bx), ys], 1)
                col = mixc(WARM, ICE, 0.45 + 0.4 * gather)
                L.path(pts, 1.5 * kk, col, 1.0)
                L.path(pts, 0.3 * kk, col, 4.0)
                L.path(pts, 0.05 * kk, col, 26.0)
        # The triangle traced in gold as the beam closes, gone as the emblem comes.
        tri = [self.art_to_film(*self.art[k]) for k in ("apex", "bl", "br")]
        kt = ss(t, T["aurixa"] - 0.35, T["aurixa"] + 0.05) * (1 - ss(t, T["aurixa"] + 0.15, T["aurixa"] + 0.7))
        if kt > 0:
            for i in range(3):
                L.path([tri[i], tri[(i + 1) % 3]], 2.2 * kt, GOLD, 1.3)
                L.path([tri[i], tri[(i + 1) % 3]], 0.3 * kt, GOLD, 6.0)
        # The emblem: its light, added.
        e = ss(t, T["aurixa"] - 0.05, T["aurixa"] + 0.6)
        if e > 0:
            x0, y0, x1, y1 = self.art["emblem_crop"]
            X0, Y0 = self.art_to_film(x0, y0)
            X1, Y1 = self.art_to_film(x1, y1)
            self.paste_light(img, self.emblem, (X0, Y0, X1, Y1), 0.9 * e * (1 + 0.6 * flash(t, T["aurixa"] + 0.35, 0.1, 0.8)))
            L.glow(ox, oy, 220, WARM, 0.05 * e)
        # Its lettering, letter by letter: AURIXA on "Aurixa", SYSTEMS on "Systems".
        for i, Lr in enumerate(self.letters):
            first = i < 6
            t0 = (T["aurixa"] + 0.05 if first else T["systems"] - 0.05) + (i if first else i - 6) * 0.075
            f = ease_out(lin(t, t0, t0 + 0.5))
            if f <= 0:
                continue
            dy = (1 - f) * 42
            X0, Y0 = self.art_to_film(Lr["l"], Lr["y0"])
            X1, Y1 = self.art_to_film(Lr["r"], Lr["y1"])
            self.paste_over(img, self.lettering, (Lr["l"], Lr["y0"], Lr["r"], Lr["y1"]), (X0, Y0 + dy, X1, Y1 + dy), f)
        # The light in the orb: three rings circle inside the A, each faster as it tightens, and close on the orb one
        # after another; the orb takes each in and keeps the light, breathing.
        if gather > 0.4:
            s = self.card_s
            u = 390.7 * s  # film px a metre of As One's world
            OR = 0.19 * u
            rings = [(0.37 * u, T["aurixa"] + 0.62, T["aurixa"] + 2.45, 1, 1.9),
                     (0.31 * u, T["aurixa"] + 0.8, T["aurixa"] + 2.85, -1, 4.3),
                     (0.255 * u, T["aurixa"] + 0.98, T["aurixa"] + 3.25, 1, 0.4)]
            taken = 0.0
            for r0, born, close, d, ph in rings:
                k = ss(t, born, born + 0.3) * (1 - ss(t, close - 0.1, close + 0.4))
                taken += flash(t, close + 0.05, 0.2, 0.7)
                if k <= 0.002:
                    continue
                radius = lambda tt: r0 + (OR * 1.04 - r0) * ease_in_out(lin(tt, born, close))  # noqa: E731
                span = max(0.0, t - born)
                steps = 48
                ang = ph + d * sum(math.pi * (r0 / radius(born + (j + 0.5) * span / steps)) ** 2 * span / steps
                                   for j in range(steps))
                r = radius(t)
                phis = np.linspace(0, 2 * math.pi, 120, endpoint=False)
                behind = np.mod((ang - phis) if d > 0 else (phis - ang), 2 * math.pi)
                kk = 2.6 * k * (0.1 + np.exp(-behind / 0.9))
                pts = np.stack([ox + r * np.cos(phis), oy - r * np.sin(phis)], 1)
                order = np.argsort(phis)
                pts, kk = np.vstack([pts[order], pts[order][:1]]), np.concatenate([kk[order], kk[order][:1]])
                L.path(pts, kk, ICE, 1.15)
                L.path(pts, 0.15 * kk, ICE, 5.0)
                hx, hy = ox + r * math.cos(ang), oy - r * math.sin(ang)
                L.point(hx, hy, 3.5 * k, WHITE, 1.6)
                L.glow(hx, hy, 12, ICE, 0.3 * k)
            kept = ss(t, rings[2][2] - 0.3, rings[2][2] + 0.8)
            arrive = ss(gather, 0.55, 1.0)
            breath = 0.88 + 0.12 * math.sin((t - T["aurixa"]) * 2.2)
            orb = 0.42 * arrive * (1 - 0.45 * kept) + 0.3 * taken + 0.3 * kept * breath
            L.glow(ox, oy, OR * 0.9, ICE, 0.55 * orb)
            L.glow(ox, oy, OR * 2.2, ICE, 0.12 * orb)
            if kept > 0.002:
                rr = OR * 1.07
                a0 = 0.6 + (t - rings[2][2]) * 1.3
                phis = np.linspace(0, 2 * math.pi, 120)
                behind = np.mod(a0 - phis, 2 * math.pi)
                kk = 0.55 * kept * breath * (0.18 + np.exp(-behind / 1.4))
                L.path(np.stack([ox + rr * np.cos(phis), oy - rr * np.sin(phis)], 1), kk, ICE, 1.15)

    def paste_light(self, img, pic, box, k):
        """A picture's light, added (As One's emblem): its colour times its own alpha, scaled into box."""
        rgb, a = pic
        X0, Y0, X1, Y1 = box
        sx, sy = (X1 - X0) / rgb.shape[1], (Y1 - Y0) / rgb.shape[0]
        M = np.array([[sx, 0, X0], [0, sy, Y0]], np.float32)
        src = rgb * a[..., None]
        warped = cv2.warpAffine(src, M, (W, H), flags=cv2.INTER_AREA if sx < 1 else cv2.INTER_LINEAR,
                                borderMode=cv2.BORDER_CONSTANT)
        img += warped * k

    def paste_over(self, img, pic, src_box, dst_box, k):
        """Part of a picture (src_box, its px), laid over img at dst_box (film px), by its alpha."""
        rgb, a = pic
        l, t0, r, b = [int(round(v)) for v in src_box]
        X0, Y0, X1, Y1 = dst_box
        crop = np.dstack([rgb[t0:b, l:r] * a[t0:b, l:r, None], a[t0:b, l:r]])
        sx, sy = (X1 - X0) / crop.shape[1], (Y1 - Y0) / crop.shape[0]
        M = np.array([[sx, 0, X0], [0, sy, Y0]], np.float32)
        out = cv2.warpAffine(crop, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        a2 = out[..., 3:4] * k
        img *= (1 - a2 * 0.92)
        img += out[..., :3] * k * 1.08

    # ---------------------------------------------------------------- transitions

    def bands(self, n, L):
        """The five worlds side by side; as the drop nears they close on the frame's centre line, a seam of gold."""
        t = self.t_of(n)
        B = self.edit["bands"]
        out = np.zeros((H, W, 3), np.float32)
        t_open = B["open"] / FPS
        c = ease_in(lin(n, B["close"], B["drop"] - 0.6))
        for i, s in enumerate(B["strips"]):
            arrive = ease_out(lin(t, t_open + 0.06 * i, t_open + 0.06 * i + 0.34))
            if arrive <= 0:
                continue
            w = Light()
            pic = self.world(s["key"], n, w)
            if w.used:
                pic += w.resolve()
            x0, x1 = s["x0"], s["x1"]
            # the strip shows its world's middle
            sw = x1 - x0
            src = pic[:, W // 2 - sw // 2: W // 2 - sw // 2 + sw]
            # closing: each strip squeezes toward the centre line
            nx0 = W / 2 + (x0 - W / 2) * (1 - c)
            nx1 = W / 2 + (x1 - W / 2) * (1 - c)
            dy = (1 - arrive) * (H if i % 2 == 0 else -H) * 0.6
            M = np.array([[(nx1 - nx0) / sw, 0, nx0], [0, 1, dy]], np.float32)
            strip = cv2.warpAffine(src, M, (W, H), flags=cv2.INTER_AREA if c > 0.05 else cv2.INTER_LINEAR,
                                   borderMode=cv2.BORDER_CONSTANT)
            mask = cv2.warpAffine(np.ones((H, sw), np.float32), M, (W, H), flags=cv2.INTER_LINEAR,
                                  borderMode=cv2.BORDER_CONSTANT)
            out = out * (1 - mask[..., None]) + strip
        # The seam: as the five close, a line of gold at the centre, burning brighter to the drop.
        if c > 0:
            k = 0.4 + 3.0 * c ** 2
            L.path([[W / 2, -20], [W / 2, H + 20]], 1.8 * k, WARM, 1.0 + 1.5 * c)
            L.path([[W / 2, -20], [W / 2, H + 20]], 0.25 * k, GOLD, 8.0)
            out *= 1 - 0.6 * c
        return out

    def reveal(self, img, n, L):
        """The drop: the seam bursts open on the sunrise, edges of gold opening outward, a flash and a wave."""
        t = self.t_of(n)
        d = self.clock.drop
        p = ease_out(lin(t, d - 0.01, d + 0.3))
        half = 8 + p * (W / 2 + 60)
        dx = np.abs(self.xx[:1] - W / 2)
        open_ = np.clip((half - dx) / 3.0, 0, 1)
        img *= open_[..., None] if p < 1 else 1
        if p < 1:
            for sgn in (-1, 1):
                x = W / 2 + sgn * half
                L.path([[x, -20], [x, H + 20]], 1.6 * (1 - p) + 0.3, GOLD, 1.2)
                L.path([[x, -20], [x, H + 20]], 0.25 * (1 - p), GOLD, 9.0)
        fl = flash(t, d, 0.02, 0.12)
        L.glow(W / 2, H * 0.45, 150, WARM, 0.9 * fl)
        L.glow(W / 2, H * 0.45, 420, GOLD, 0.12 * fl)
        L.streak(W / 2, H * 0.45, 420, mixc(GOLD, ICE, 0.3), 1.2 * fl)
        return img

    def wave(self, img, cx, cy, t, at, amp=16.0, speed=1600.0, width=60.0, life=0.8):
        """A shockwave through the picture: a ring that bends what is behind it as it passes."""
        g = t - at
        if not 0 < g < life:
            return img
        r = speed * g
        dx, dy = self.xx - cx, self.yy - cy
        dist = np.sqrt(dx * dx + dy * dy) + 1e-3
        k = amp * (1 - g / life) ** 2 * np.exp(-((dist - r) / width) ** 2) * ((dist - r) / width)
        mx = (self.xx - k * dx / dist).astype(np.float32)
        my = (self.yy - k * dy / dist).astype(np.float32)
        return cv2.remap(img, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

    def zoom_about(self, img, cx, cy, s):
        M = np.array([[s, 0, cx - s * cx], [0, s, cy - s * cy]], np.float32)
        return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

    # ---------------------------------------------------------------- one frame

    def picture(self, n):
        """The frame's picture and its light, in linear light (before the finish and the words)."""
        T, t, C = self.T, self.t_of(n), self.cut
        L = Light()
        if n < C["office"]:
            img = self.open_(n, L)
        elif n < C["air"] - 6:
            img = self.office(n, L, L)
        elif n < C["air"] + 6:
            # Through the glass: the office rushes at its window, and the night opens through it.
            g = lin(n, C["air"] - 6, C["air"] + 6)
            front = Light()
            off = self.office(n, front, front)
            if front.used:
                off += front.resolve()
            x, y, _, _ = self.src.at("office", "crown", n)
            cy = y + 120
            base = 1 + 0.9 * ease_in(g)
            acc = None
            for j in range(6):
                z = self.zoom_about(off, x, cy, base * (1 + 0.05 * g * j / 5))
                acc = z if acc is None else acc + z
            off = acc / 6
            air = self.air(n, L)
            ax, ay, _, _ = self.src.at("night-air", "glow", n)
            acc = None
            za = 0.82 + 0.18 * ease_out(g)
            for j in range(6):
                z = self.zoom_about(air, ax, ay, za * (1 + 0.05 * (1 - g) * j / 5))
                acc = z if acc is None else acc + z
            air = acc / 6
            m = ss(g, 0.3, 0.72)
            img = off * (1 - m) + air * m
            # at the crossing, the light of the pane itself
            img *= 1 + 0.35 * math.sin(math.pi * clamp((g - 0.3) / 0.42))
            # the glass catching the light as it is passed: a fine glint across the pane
            gl = lin(g, 0.2, 0.75)
            if 0 < gl < 1:
                d0 = -300 + 2600 * gl
                xs = np.array([-50.0, W + 50.0])
                ys = (d0 - xs * 0.6) / 0.8
                kg = math.sin(math.pi * gl)
                L.path(np.stack([xs, ys], 1), 1.2 * kg, ICE, 1.2)
                L.path(np.stack([xs, ys], 1), 0.12 * kg, ICE, 18.0)
        elif n < C["research"]:
            img = self.air(n, L)
        elif n < C["bands"]:
            key = self.WORLDS[max(i for i, k in enumerate(self.WORLDS) if n >= C[k])]
            img = self.world(key, n, L)
        elif n < C["drop"]:
            img = self.bands(n, L)
        elif n < C["pulse"]:
            img = self.sunrise(n, L)
            if n < C["drop"] + 10:
                img = self.reveal(img, n, L)
            img = self.wave(img, W / 2, H * 0.45, t, self.clock.drop, amp=22, speed=1900, width=70, life=0.7)
        elif n < C["grid"]:
            img = self.pulse_(n, L)
            self.context_tags(img, n)
        elif n < C["device"]:
            img = self.grid(n, L)
            cx, cy, _, _ = self.src.at("grid", "centre", n)
            img = self.wave(img, cx, cy, t, T["one"], amp=14, speed=1500, width=60, life=0.8)
        elif n < C["rise"]:
            img = self.device(n, L)
        elif n < self.dissolve[0]:
            img = self.rise(n, L)
        elif n < self.dissolve[1]:
            g = ss(n, *self.dissolve)
            rl = Light()
            a = self.rise(n, rl, lift_off=False)
            if rl.used:
                a += rl.resolve()
            b = self.src.plate("sky", n)
            img = a * (1 - g) + b * g
            self.sun(img, L, t)
            # The rise's line of light is the card's beam: from the crown's column to the orb's as the sky comes.
            crown_x, crown_y = self.src.at("rise", "crown", n)[:2]
            ox = self.art_to_film(*self.art["orb"])[0]
            self.card(img, L, t, beam_x=crown_x + (ox - crown_x) * g, beam_bottom=crown_y)
        else:
            img = self.src.plate("sky", n)
            self.sun(img, L, t)
            self.card(img, L, t)
        if L.used:
            img += L.resolve()
        return self.jolt(img, t)

    def jolt(self, img, t):
        """The camera taken by the drop and by "one": a few pixels, settling in a third of a second."""
        k = 0.0
        for at, amp in ((self.clock.drop, 7.0), (self.T["one"], 5.0)):
            g = t - at
            if 0 <= g < 0.35:
                k = max(k, amp * math.exp(-g / 0.09))
        if k < 0.3:
            return img
        ph = t * 61.0
        dx, dy = k * math.sin(ph * 1.7), k * math.cos(ph * 2.3)
        M = np.array([[1.01, 0, dx - 0.01 * W / 2], [0, 1.01, dy - 0.01 * H / 2]], np.float32)
        return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

    def sun(self, img, L, t):
        T = self.T
        x, y, _, _ = self.src.at("sky", "sun", max(self.cut["end"], int(t * FPS)))
        swell = ss(t, T["aurixa"] + 0.5, 45.5)
        L.glow(x, y, 40 + 50 * swell, WARM, 0.3 + 0.5 * swell)
        L.glow(x, y, 160 + 120 * swell, GOLD, 0.03 + 0.05 * swell)
        L.streak(x, y, 300 + 260 * swell, WARM, 0.1 + 0.2 * swell)

    def finish(self, lin_img, n):
        """Bloom, a soft shoulder (a light's core goes to white as it passes the top), vignette, then sRGB and grain."""
        t = self.t_of(n)
        img = lin_img
        # bloom: what is brighter than the paper, spread wide
        m = img.max(axis=2, keepdims=True)
        knee = np.clip(m - 0.75, 0, None)
        hot = img * (knee * knee / (knee + 0.5 + 1e-4) / np.maximum(m, 1e-4))
        bl = np.zeros_like(img)
        level = hot
        for i, wgt in enumerate((0.3, 0.3, 0.25, 0.2, 0.15, 0.1)):
            level = cv2.pyrDown(level)
            blur = cv2.GaussianBlur(level, (0, 0), 1.2)
            up = blur
            for _ in range(i + 1):
                up = cv2.pyrUp(up)
            bl += cv2.resize(up, (W, H), interpolation=cv2.INTER_LINEAR) * wgt
        img = img + bl * 0.45
        # the shoulder
        m = img.max(axis=2, keepdims=True)
        k0 = 0.82
        m2 = np.where(m > k0, k0 + (1 - k0) * (1 - np.exp(-(m - k0) / (1 - k0))), m)
        out = img * (m2 / np.maximum(m, 1e-6))
        white = np.clip((m - 1.0) / 2.5, 0, 1) ** 0.8 * 0.7
        out = out * (1 - white) + m2 * white
        out *= self.vignette[..., None]
        for c, (mx, my) in self.ca.items():
            out[..., c] = cv2.remap(np.ascontiguousarray(out[..., c]), mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        # the opening comes up out of the dark (its first frame is never black: it may be the one a feed shows)
        out *= 0.3 + 0.7 * ease_in_out(lin(t, 0.0, 0.75))
        srgb = lin_to_srgb(out)
        luma = srgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)
        # fine, and light: a platform encodes the film again, and heavy grain comes out of that as blocks
        amt = 0.0055 * (0.35 + 0.65 * (1 - np.abs(2 * luma - 1)))
        g = np.roll(self.grain[n % 6], (n * 37) % H, axis=0)
        srgb = srgb + (g * amt)[..., None]
        return np.clip(srgb, 0, 1)

    def words(self, srgb, n):
        path = self.type_dir / f"{n:05d}.png"
        if not path.exists():
            return srgb
        im = cv2.imread(str(path), cv2.IMREAD_UNCHANGED).astype(np.float32) / 255
        a = im[..., 3:4]
        return srgb * (1 - a) + im[..., 2::-1] * a

    def frame(self, n):
        return self.words(self.finish(self.picture(n), n), n)


def main():
    work = Path(sys.argv[1]).resolve()
    args = sys.argv[2:]
    film = Film(work)
    frames = None
    out = None
    first, last = 0, film.edit["frames"]
    i = 0
    while i < len(args):
        if args[i] == "--frames":
            frames = [int(v) for v in args[i + 1].split(",")]
            i += 2
        elif args[i] == "--out":
            out = Path(args[i + 1])
            i += 2
        else:
            first, last = map(int, args[i].split(":"))
            i += 1
    if frames:
        out = out or film.root / "film" / "frames"
        out.mkdir(parents=True, exist_ok=True)
        for n in frames:
            img = film.frame(n)
            cv2.imwrite(str(out / f"{n:05d}.png"), (img[..., ::-1] * 255 + 0.5).astype(np.uint8))
            print(f"frame {n} ({n / FPS:.2f} s)", flush=True)
        return
    d = film.root / "film"
    d.mkdir(exist_ok=True)
    path = out or d / f"part-{first:05d}.mkv"
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                            "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "4",
                            "-pix_fmt", "yuv444p", "-x264-params", "keyint=24", str(path)], stdin=subprocess.PIPE)
    for n in range(first, last):
        img = film.frame(n)
        enc.stdin.write((img * 255 + 0.5).astype(np.uint8).tobytes())
        if (n - first) % 24 == 0:
            print(f"{path.name}: frame {n}", flush=True)
    enc.stdin.close()
    enc.wait()
    print(f"{path}: frames {first} to {last - 1}", flush=True)


if __name__ == "__main__":
    main()
