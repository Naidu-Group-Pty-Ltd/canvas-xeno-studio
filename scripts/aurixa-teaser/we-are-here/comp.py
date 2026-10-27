#!/usr/bin/env python3
"""We Are Here, put together frame by frame: the system's space (space.py) drawn through its one camera, with the
panes of software and the glass they break into, the one tool that comes apart, the client's context following the
pulse, the emblem and its pulse at the end, and over all of it the words (type.cjs).

  python3 -I comp.py <work files dir> [first:last] [--frames n,n,...] [--out path]      # (needs numpy and OpenCV)
  python3 -I comp.py <work files dir> --labels       # where the five tiers' names are, frame by frame, for type.py

Writes we-are-here/film/part-<first>.mkv (x264 at CRF 4, 4:4:4) for a run of frames, or PNGs of single frames
(--frames, into --out). film.sh joins the runs and lays them on master.wav.

The space is drawn in linear light and in high range: points and lines of light (space.Painter), each spread by its
own Gaussian and by the lens's focus, through as many moments of a half-frame shutter as the camera's speed needs.
The panes are glass, laid over the light they stand in front of. The whole is bloomed, given a soft shoulder (a
light's core goes to white as it passes the top), its colours parted a little toward the frame's edges as a lens's
are, vignetted and grained; then the words are laid over it.
"""
import json
import math
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))  # run with -I: space.py is beside it
import space  # noqa: E402

W, H, FPS = space.W, space.H, space.FPS

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


class Panes:
    """The panes that crowd the space before the core as the voice names them, and the glass they break into on
    "ambition" (As One's panes). They are set out in the camera's frame of one moment (x right, y down, z ahead) and
    stay where they are put in the space, so the camera's slow approach carries past them, the near ones faster."""

    S = 5.5  # As One's room's metres, in the space's units

    def __init__(self, tex_dir, T, world):
        self.T, self.world = T, world
        ref = world.pose(T["use"])
        self.ref_pos, self.ref_R, self.F_ref = ref.pos, ref.R, ref.F
        tex = {}
        for p in sorted(tex_dir.glob("*.png")):
            prem, a = load_rgba(p)
            if p.stem.startswith(("pane", "tab")):
                # Glass: the dark fill lets the space through, the drawing on it stays, and light lies across it.
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
            ("pane-window-0", T["not_"], (290, 760), 2.6, 0.62, 13),
            ("pane-window-1", T["use"], (790, 1120), 2.2, 0.6, -11),
            ("pane-window-2", T["software"], (560, 700), 3.0, 0.66, 4),
            ("pane-dash-0", T["not2"], (260, 1230), 2.0, 0.6, 15),
            ("pane-dash-1", T["have"], (830, 780), 2.8, 0.64, -14),
            ("pane-dash-2", T["dashboards"], (520, 990), 1.8, 0.56, -5),
            ("pane-window-3", T["certain"], (170, 520), 2.5, 0.6, 18),
            ("pane-dash-3", T["level"], (920, 1290), 2.1, 0.6, -16),
            ("pane-window-4", T["level"] + 0.32, (480, 1350), 1.6, 0.52, 6),
        ]
        tabs = [T["and_"], T["not3"], T["because3"], T["ai"], T["became"], T["another"]]
        self.panes = []
        for name, t0, (sx, sy), z, wm, yaw in P:
            self.panes.append(self._pane(name, t0, sx, sy, z, wm, yaw, rng, shards=14))
        for i, t0 in enumerate(tabs):
            sx = 120 + i * 178
            self.panes.append(self._pane("tab-ai" if i == 3 else "tab", t0, sx, 1100 + 6 * math.sin(i * 1.7), 1.75,
                                         0.235, -6 + 2 * i, rng, shards=3, tab=i))
        # Break order: the nearest first, a few hundredths apart.
        order = sorted(range(len(self.panes)), key=lambda i: self.panes[i]["z"])
        for rank, i in enumerate(order):
            self.panes[i]["break"] = T["ambition"] + 0.025 * rank

    def _pane(self, name, t0, sx, sy, z, wm, yaw, rng, shards, tab=None):
        prem, a = self.tex[name]
        th, tw = a.shape
        z, wm = z * self.S, wm * self.S
        hm = wm * th / tw
        Z = z
        X = (sx - W / 2) * Z / self.F_ref
        Y = (sy - H / 2) * Z / self.F_ref
        cells = voronoi_cells(tw, th, shards, rng)
        sh = []
        for c in cells:
            cen = c.mean(axis=0)
            out = np.array([(cen[0] / tw - 0.5) * wm, (cen[1] / th - 0.5) * hm])
            d = out / (np.linalg.norm(out) + 1e-6)
            sh.append(dict(poly=c, cen=cen,
                           v=self.S * np.array([d[0] * rng.uniform(0.5, 1.4) + rng.normal(0, 0.2),
                                                d[1] * rng.uniform(0.5, 1.4) + rng.normal(0, 0.2) - 0.15,
                                                -rng.uniform(2.6, 5.2)]),
                           axis=rng.normal(0, 1, 3), w=rng.uniform(3.0, 9.0) * rng.choice([-1, 1]),
                           glint=rng.uniform(0, 6.28)))
        return dict(name=name, t0=t0, X=X, Y=Y, z=Z, wm=wm, hm=hm, tw=tw, th=th, yaw=math.radians(yaw),
                    drift=self.S * np.array([rng.normal(0, 0.012), rng.normal(0, 0.01)]), spin=rng.normal(0, 0.03),
                    shards=sh, tab=tab, seed=rng.uniform(0, 100))

    def project(self, P, t):
        """Points in the panes' frame (x right, y down, z ahead) to the film's frame at t, and their distance."""
        Pw = self.ref_pos + (np.asarray(P, np.float64) * [1.0, -1.0, 1.0]) @ self.ref_R
        X, Y, z = self.world.pose(t).project(Pw)
        return np.stack([X, Y], 1), z

    def _pose(self, p, t):
        """A pane's centre and turn at t (before it breaks): drifting, and as ambition grows, trembling."""
        age = t - p["t0"]
        tremble = ss(t, self.T["at"], self.T["ambition"]) * 0.006 * self.S
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
            cen = c0 + r0 @ cen_local + sh["v"] * tau + np.array([0, 0.35 * self.S, 0]) * tau * tau
            rr = axis_angle(sh["axis"], sh["w"] * tau) @ r0
            local = np.column_stack([(sh["poly"][:, 0] - sh["cen"][0]) * sx, (sh["poly"][:, 1] - sh["cen"][1]) * sy,
                                     np.zeros(len(sh["poly"]))])
            pts3 = local @ rr.T + cen
            dst, Z = self.project(pts3, t)
            if (Z < 0.16 * self.S).any():
                continue
            if np.abs(dst).max() > 6000:
                continue
            # The shard's plane through four of its texture's points, for the warp.
            q = np.array([[-1, -1], [1, -1], [1, 1], [-1, 1]], np.float64) * 40
            src = sh["cen"] + q
            q3 = np.column_stack([q[:, 0] * sx, q[:, 1] * sy, np.zeros(4)]) @ rr.T + cen
            qd, _ = self.project(q3, t)
            near = clamp((min(Z) - 0.16 * self.S) / (0.3 * self.S))
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




class Tool:
    """The next tool: one pane before the core while the question is asked ("So don't ask what the next tool is"),
    which comes apart on "is" into motes of its own light that drift into the system."""

    def __init__(self, tex, world, T, n=7000, seed=17):
        self.prem, self.a = tex
        self.th, self.tw = self.a.shape
        self.T, self.world = T, world
        pose = world.pose(T["so"] + 0.6)
        w = 3.3
        self.w, self.h = w, w * self.th / self.tw
        self.c = pose.pos + np.array([0.0, -0.45, 7.6]) @ pose.R
        self.r, self.u = pose.R[0], pose.R[1]
        lum = self.prem @ np.array([0.2126, 0.7152, 0.0722], np.float32)
        wgt = (lum * self.a).ravel().astype(np.float64)
        wgt /= wgt.sum()
        rng = np.random.default_rng(seed)
        idx = rng.choice(len(wgt), n, p=wgt)
        py, px = np.divmod(idx, self.tw)
        top = float(np.percentile(lum[self.a > 0.5], 99))
        self.k = np.clip(lum.ravel()[idx] / max(top, 1e-4), 0.08, 1.0)
        u = (px + rng.random(n)) / self.tw - 0.5
        v = (py + rng.random(n)) / self.th - 0.5
        self.P0 = self.c + np.outer(u * self.w, self.r) - np.outer(v * self.h, self.u)
        self.vel = rng.normal(0, 0.16, (n, 3)) + self.u * 0.06
        self.lag = rng.random(n) * 0.25

    def corners(self, t):
        drift = self.u * 0.06 * (t - self.T["so"])
        hw, hh = self.w / 2, self.h / 2
        c = self.c + drift
        return np.array([c - self.r * hw + self.u * hh, c + self.r * hw + self.u * hh,
                         c + self.r * hw - self.u * hh, c - self.r * hw - self.u * hh])

    def draw(self, panes, img, L, t):
        """The pane over img (linear, in place) while it holds; its motes into L once it comes apart."""
        T = self.T
        show = ss(t, T["so"] + 0.1, T["so"] + 0.55) * (1 - lin(t, T["is_"], T["is_"] + 0.12))
        if show > 0.002:
            X, Y, z = self.world.pose(t).project(self.corners(t))
            if (z > 0.3).all():
                lay = np.zeros((H, W, 3), np.float32)
                alp = np.zeros((H, W), np.float32)
                src = np.array([[0, 0], [self.tw, 0], [self.tw, self.th], [0, self.th]], np.float64)
                dst = np.stack([X, Y], 1)
                panes._quad_warp(self.prem * 1.35, self.a, src, dst, lay, alp, 0.94 * show)
                img *= (1 - alp)[..., None]
                img += lay
                loop = np.vstack([dst, dst[:1]])
                rim = 0.25 + 1.2 * flash(t, T["so"] + 0.2, 0.06, 0.4) + 1.5 * flash(t, T["tool"] + 0.05, 0.05, 0.35)
                L.path(loop, 0.55 * rim * show, ICE, 1.0)
                L.path(loop, 0.1 * rim * show, ICE, 4.0)
        tau = t - T["is_"]
        if 0 < tau < 2.2:
            go = np.clip((tau - self.lag) / 0.08, 0, 1)
            pull = ease_in_out(clamp((tau - 0.12) / 1.5))
            P = self.P0 + self.vel * tau + (np.zeros(3) - self.P0) * (0.92 * pull)
            k = self.k * go * (0.35 + 2.2 * np.exp(-tau / 0.22)) * (1 - lin(tau, 1.3, 2.2))
            col = space.ICE * (1 - pull) + space.GOLD * pull
            pt = space.Painter(L, self.world.pose(t))
            pt.points(P, k, col, 0.8)


# ------------------------------------------------------------------ the film


class Film:
    def __init__(self, work):
        self.work = work
        self.root = work / "we-are-here"
        cues = json.loads((work / "sound-as-one" / "cues.json").read_text())
        self.clock = Clock(cues)
        self.T = dict(self.clock.T)
        self.drop = self.clock.drop
        self.bars = cues["bars"]
        self.frames = int(round(cues["length"] * FPS))
        self.world = space.World(self.T, self.drop, self.bars)
        self.panes = Panes(self.root / "textures", self.T, self.world)
        self.tool = Tool(self.panes.tex["pane-window-2"], self.world, self.T)
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
        # A real lens parts its colours a little toward the frame's edges: red out, blue in, half a pixel at most.
        self.ca = {}
        for c, k in ((0, 1.00045), (2, 0.99955)):
            self.ca[c] = ((W / 2 + (xx - W / 2) / k).astype(np.float32), (H / 2 + (yy - H / 2) / k).astype(np.float32))
        # The end card: the supplied art's emblem and lettering, the triangle's apex at (540, 382), 0.9 px a pixel; the
        # camera's last pose puts the core on the art's orb.
        self.card_s = 0.9
        self.card_o = (540.0, 382.0)

    def t_of(self, n):
        return n / FPS

    # ---------------------------------------------------------------- how many moments a frame needs

    def samples(self, t):
        """The moments of a half-frame shutter a frame is drawn at: one while the camera is slow, up to four where it
        moves fast, by how far points ahead of it move across the frame in the shutter's time."""
        a, b = self.world.pose(t - 0.25 / FPS), self.world.pose(t + 0.25 / FPS)
        look = self.world.c_look(t)
        ring = np.array([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0, 0, 0]]) * 6.0 + look
        Xa, Ya, za = a.project(ring)
        Xb, Yb, zb = b.project(ring)
        ok = (za > 0.5) & (zb > 0.5)
        if not ok.any():
            return 3
        d = float(np.max(np.hypot(Xb - Xa, Yb - Ya)[ok]))
        return 1 if d < 1.0 else 2 if d < 3.0 else 3 if d < 8.0 else 4

    # ---------------------------------------------------------------- the client's context

    def context_tags(self, img, t):
        """The client's and the property's tags, following the pulse from "context": they come in beside it one
        after the other and ride with it, up its thread to the system."""
        T = self.T
        a0, end = T["context"], T["business"]
        if not (a0 - 0.05 < t < end + 0.3):
            return
        pose = self.world.pose(t)
        lay = np.zeros((H, W, 3), np.float32)
        alp = np.zeros((H, W), np.float32)
        for i, (key, lag) in enumerate((("client", 0.16), ("property", 0.4))):
            tt = t - a0 - (lag - 0.16)
            if tt < 0:
                continue
            anc = self.world.tag_anchor(t, lag)
            if anc is None:
                continue
            x, y, z = anc
            prem, a = self.tags[key]
            th, tw = a.shape
            s = clamp(pose.F * 3.0 / z / tw, 0.14, 0.4)
            k = ease_out(lin(tt, 0, 0.25)) * (1 - ss(t, end - 0.2, end + 0.2))
            rise = (1 - ease_out(lin(tt, 0, 0.3))) * 18
            cx, cy = x + 40 * s / 0.3, y - (95 + i * 86) * s / 0.3 + rise
            dst = np.array([[cx, cy - th * s / 2], [cx + tw * s, cy - th * s / 2],
                            [cx + tw * s, cy + th * s / 2], [cx, cy + th * s / 2]])
            self.panes._quad_warp(prem * 1.15, a, np.array([[0, 0], [tw, 0], [tw, th], [0, th]], np.float64), dst,
                                  lay, alp, k)
        img *= (1 - alp)[..., None]
        img += lay

    # ---------------------------------------------------------------- the end card

    def art_to_film(self, ax, ay):
        s = self.card_s
        return self.card_o[0] + (ax - self.art["apex"][0]) * s, self.card_o[1] + (ay - self.art["apex"][1]) * s

    def card(self, img, L, t):
        """The emblem over the system's own triangle, its lettering letter by letter, and the light circling inside
        the A until the orb keeps it (As One's end card); the orb's pulses are the space's (space.World._waves)."""
        T = self.T
        ox, oy = self.art_to_film(*self.art["orb"])
        gather = ease_in_out(lin(t, T["aurixa"] - 0.1, T["aurixa"] + 1.05))
        # The emblem: its light, added, as the system's triangle of light gives way to it.
        e = ss(t, T["aurixa"] - 0.12, T["aurixa"] + 0.55)
        if e > 0:
            x0, y0, x1, y1 = self.art["emblem_crop"]
            X0, Y0 = self.art_to_film(x0, y0)
            X1, Y1 = self.art_to_film(x1, y1)
            self.paste_light(img, self.emblem, (X0, Y0, X1, Y1), 0.9 * e * (1 + 0.6 * flash(t, T["aurixa"] + 0.35, 0.1, 0.8)))
            L.glow(ox, oy, 220, WARM, 0.04 * e)
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
            orb = 0.32 * arrive * (1 - 0.45 * kept) + 0.25 * taken + 0.25 * kept * breath
            L.glow(ox, oy, OR * 0.9, ICE, 0.45 * orb)
            L.glow(ox, oy, OR * 2.2, ICE, 0.1 * orb)
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

    # ---------------------------------------------------------------- one frame

    def picture(self, n):
        """The frame's picture and its light, in linear light (before the finish and the words)."""
        T, t = self.T, self.t_of(n)
        L = Light()
        k = self.samples(t)
        shutter = 0.5 / FPS
        for j in range(k):
            ts = t if k == 1 else t + ((j + 0.5) / k - 0.5) * shutter
            self.world.draw(L, ts, 1.0 / k)
        pose = self.world.pose(t)
        glow, dawn = self.world.sky(t)
        img = space.backdrop(pose, glow, dawn)
        if L.used:
            img += L.resolve()
        # the panes, the glass they break into, and the light that lies on them
        front = Light()
        if T["not_"] - 0.1 < t < T["changes"] + 1.2:
            self.panes.draw(img, front, t, samples=3)
        # the next tool, and what it comes apart into
        if T["so"] < t < T["ask"] + 1.5:
            self.tool.draw(self.panes, img, front, t)
        self.context_tags(img, t)
        if t > T["aurixa"] - 0.4:
            self.card(img, front, t)
        if front.used:
            img += front.resolve()
        # the drop: the frame takes the light, for a moment
        fl = flash(t, self.drop, 0.02, 0.16)
        if fl > 0.001:
            img = img * (1 + 1.1 * fl) + 0.02 * fl
        return self.jolt(img, t)

    def jolt(self, img, t):
        """The camera taken by the drop and by "one": a few pixels, settling in a third of a second."""
        k = 0.0
        for at, amp in ((self.drop, 7.0), (self.T["one"], 5.0)):
            g = t - at
            if 0 <= g < 0.35:
                k = max(k, amp * math.exp(-g / 0.09))
        if k < 0.3:
            return img
        ph = t * 61.0
        dx, dy = k * math.sin(ph * 1.7), k * math.cos(ph * 2.3)
        M = np.array([[1.01, 0, dx - 0.01 * W / 2], [0, 1.01, dy - 0.01 * H / 2]], np.float32)
        return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

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

    def labels(self):
        """Where each tier's name goes, frame by frame, while the five come in: for type.py."""
        T = self.T
        a, b = int(math.floor((T["names"][0] - 0.2) * FPS)), int(math.ceil((T["powerful"] + 0.3) * FPS))
        frames = {}
        for n in range(a, b + 1):
            frames[n] = [[round(l["x"], 1), round(l["y"], 1), round(l["k"], 3), l["dx"], l["dy"]]
                         for l in self.world.labels(n / FPS)]
        return {"fps": FPS, "first": a, "last": b, "names": [t.upper() for t in space.TIERS], "frames": frames}


def main():
    work = Path(sys.argv[1]).resolve()
    args = sys.argv[2:]
    film = Film(work)
    if args and args[0] == "--labels":
        out = film.root / "type"
        out.mkdir(parents=True, exist_ok=True)
        (out / "labels.json").write_text(json.dumps(film.labels()))
        print(f"{out / 'labels.json'}: the tiers' names, frame by frame")
        return
    frames = None
    out = None
    first, last = 0, film.frames
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
    cv2.setNumThreads(1)  # film.sh runs four of these side by side, one to a core
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
