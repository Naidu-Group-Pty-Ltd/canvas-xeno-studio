"""The digital twin: a keyframe as the platform sees it. Every point of the picture is placed in depth (its depth map)
and drawn as light: a cool point where a surface is, a brighter one along its edges, gold where its own lights are, and
threads of gold between neighbouring lights. It is drawn through the shot's own camera (camera.StillCamera), so where it
appears it lies exactly on the picture; and it can be flown into, further than the picture can.

comp.py turns the physical city into its twin behind a wave of light, or lays the twin over a world as the platform's
layer on it: the bridge between the property and the system that knows it.
"""
import math

import cv2
import numpy as np

ICE = np.array([0.62, 0.84, 1.0], np.float32)
CYAN = np.array([0.30, 0.82, 1.0], np.float32)
GOLD = np.array([1.0, 0.72, 0.32], np.float32)
# Point sizes (Gaussian sigma, film px): each point is drawn at the nearest, by how far the camera has come to it.
SIGMAS = (0.75, 1.2, 1.9, 3.0, 4.6)


class Twin:
    def __init__(self, shot, cam, step=3, edges=110000, lights=320, seed=5):
        """The twin of a still shot: points on a grid a few pixels apart (jittered, so no pattern shows), the still's
        edges, and its brightest lights, with the threads between them."""
        rng = np.random.default_rng(seed)
        still = cv2.imread(shot["still"], cv2.IMREAD_COLOR)[:, :, ::-1].astype(np.float32) / 255
        img = cv2.resize(still, (1080, 1920), interpolation=cv2.INTER_AREA)
        h, w = img.shape[:2]
        lum = img @ np.array([0.2126, 0.7152, 0.0722], np.float32)
        near = cv2.resize(cam.depth, (w, h), interpolation=cv2.INTER_AREA)
        # surfaces: a jittered grid
        gy, gx = np.mgrid[0:h:step, 0:w:step].astype(np.float32)
        gx = (gx + rng.uniform(0, step, gx.shape)).ravel()
        gy = (gy + rng.uniform(0, step, gy.shape)).ravel()
        keep = (gx < w - 1) & (gy < h - 1)
        gx, gy = gx[keep], gy[keep]
        sl = lum[gy.astype(int), gx.astype(int)]
        surf_k = 0.015 + 1.2 * np.clip(sl - 0.1, 0, 1) ** 1.2
        # edges: Canny on the still, a share of them
        g8 = (cv2.GaussianBlur(lum, (0, 0), 1.2) * 255).astype(np.uint8)
        e = cv2.Canny(g8, 40, 110)
        ey, ex = np.nonzero(e)
        if len(ex) > edges:
            pick = rng.choice(len(ex), edges, replace=False)
            ex, ey = ex[pick], ey[pick]
        ex = ex.astype(np.float32) + rng.uniform(-0.3, 0.3, len(ex))
        ey = ey.astype(np.float32) + rng.uniform(-0.3, 0.3, len(ey))
        el = lum[np.clip(ey.astype(int), 0, h - 1), np.clip(ex.astype(int), 0, w - 1)]
        edge_k = 0.5 + 1.3 * el
        # lights: the brightest small points of the picture, and threads to their nearest neighbours
        hp = lum - cv2.GaussianBlur(lum, (0, 0), 6)
        peaks = (hp == cv2.dilate(hp, np.ones((9, 9), np.uint8))) & (hp > 0.08) & (lum > 0.45)
        ly, lx = np.nonzero(peaks)
        order = np.argsort(-hp[ly, lx])[:lights]
        lx, ly = lx[order].astype(np.float32), ly[order].astype(np.float32)
        light_k = 0.9 + 1.6 * np.clip(lum[ly.astype(int), lx.astype(int)], 0, 1)
        # threads only between near neighbours at about the same depth: a building's lights, a street's
        links = []
        if len(lx) > 3:
            P = np.stack([lx, ly], 1)
            ln = near[ly.astype(int), lx.astype(int)]
            d = np.hypot(P[:, None, 0] - P[None, :, 0], P[:, None, 1] - P[None, :, 1])
            d[np.abs(ln[:, None] - ln[None, :]) > 0.04] = 1e9
            np.fill_diagonal(d, 1e9)
            for i in range(len(P)):
                for j in np.argsort(d[i])[:2]:
                    if i < j and d[i, j] < 110:
                        links.append((i, j))
        self.links = np.array(links, np.int64).reshape(-1, 2)
        xs = np.concatenate([gx, ex, lx])
        ys = np.concatenate([gy, ey, ly])
        self.kind = np.concatenate([np.zeros(len(gx), np.int8), np.ones(len(ex), np.int8), np.full(len(lx), 2, np.int8)])
        self.base = np.concatenate([surf_k, edge_k, light_k]).astype(np.float32)
        self.pts = np.stack([xs / w, ys / h], 1)
        self.near = near[np.clip(ys.astype(int), 0, h - 1), np.clip(xs.astype(int), 0, w - 1)].astype(np.float64)
        self.n_lights = len(lx)
        self.cam = cam
        cols = np.empty((len(xs), 3), np.float32)
        cols[self.kind == 0] = ICE
        cols[self.kind == 1] = 0.4 * ICE + 0.6 * CYAN
        cols[self.kind == 2] = GOLD
        # the distance is dimmer: depth reads as a haze of points
        fog = (0.35 + 0.65 * np.clip(self.near, 0, 1) ** 0.6).astype(np.float32)
        self.rgb = cols * (self.base * fog)[:, None]

    def draw(self, L, n, extra=0.0, reveal=None, k=1.0, links=0.35, scan=None):
        """The twin at frame n into L (a comp.Light), flown `extra` further in than the shot's own camera. reveal maps
        the points' film positions (N x 2) to how much of each is shown (0 to 1): the wave that turns the picture.
        scan is (nearness, strength): a plane of light passing through the twin's depth, brightening what it meets.
        Returns the points' film positions and how far each has been magnified."""
        pos, s, gap = self.cam.frame_of(n, self.pts, extra=extra, with_scale=True, near=self.near)
        alive = np.clip((gap - 0.03) / 0.18, 0, 1)
        m = alive * k
        if reveal is not None:
            m = m * reveal(pos)
        if scan is not None:
            m = m * (1 + scan[1] * np.exp(-((self.near - scan[0]) / 0.02) ** 2))
        on = (m > 0.003) & (pos[:, 0] > -8) & (pos[:, 0] < 1088) & (pos[:, 1] > -8) & (pos[:, 1] < 1928)
        if not on.any():
            return pos, s
        px, py, ms, ss_ = pos[on, 0], pos[on, 1], m[on], s[on]
        rgb = self.rgb[on] * ms[:, None].astype(np.float32)
        # a point grows as the camera comes to it, and keeps its brightness
        sig = 0.75 * np.clip(ss_, 1.0, 8.0) ** 0.9
        b = np.digitize(sig, [(a + c) / 2 for a, c in zip(SIGMAS[:-1], SIGMAS[1:])])
        for i, sigma in enumerate(SIGMAS):
            sel = b == i
            if not sel.any():
                continue
            wgt = 2 * math.pi * sigma * sigma * 0.55
            L._add(sigma, px[sel], py[sel], rgb[sel, 0] * wgt, rgb[sel, 1] * wgt, rgb[sel, 2] * wgt)
        # threads between the lights, faint, and gone as they near the camera (a thread across the lens is noise)
        if links > 0 and len(self.links):
            first = len(self.pts) - self.n_lights
            a, c = self.links[:, 0] + first, self.links[:, 1] + first
            span = np.hypot(*(pos[a] - pos[c]).T)
            ka = np.minimum(m[a], m[c]) * links * np.clip((180 - span) / 80, 0, 1)
            for (i, j), kk in zip(zip(a, c), ka):
                if kk > 0.01:
                    L.path([pos[i], pos[j]], float(kk), tuple(GOLD), 0.8)
        return pos, s
