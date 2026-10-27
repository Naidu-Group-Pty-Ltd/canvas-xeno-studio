"""The camera over a shot's picture, shared by plates.py (which draws the picture through it) and light.py (which
places the light on it), so the light lands where the picture puts its point.

A still's camera (StillCamera) is a move over a 4K keyframe and its depth: a zoom, a centre and a turn, the dolly
(nearer points move out from the centre as the camera comes in) and the truck (nearer points slide across as the
camera moves sideways, about the depth that stays put). Every output pixel looks up its source; a source point is
placed by the same move forward.

A take's camera (TakeCamera) frames a 4K take: its zoom, centre and turn over the shot, its retiming, and its tracked
points (track.py), carried through the framing.
"""
import json
import math

import cv2
import numpy as np

W, H = 1080, 1920
FPS = 24


def ease(p):
    p = min(1.0, max(0.0, p))
    return p * p * (3 - 2 * p)


def lerp(a, b, p):
    return a + (b - a) * p


def pair(v, default):
    if v is None:
        return (default, default)
    return tuple(v) if isinstance(v, (list, tuple)) else (v, v)


class StillCamera:
    def __init__(self, shot, src_size=None, depth=None):
        self.shot = shot
        move = shot["move"]
        self.z = pair(move.get("zoom"), 1.0)
        self.cx = pair(move.get("cx"), 0.5)
        self.cy = pair(move.get("cy"), 0.5)
        self.spin = pair(move.get("spin"), 0.0)
        self.truck = pair(move.get("orbit"), 0.0)
        self.pivot = move.get("pivot", 0.5)
        self.dolly = move.get("dolly", 0.0)
        # Nearness below `far` counts as far: the distance's depth is the estimator's least sure, and a thin
        # spire it reads as sky must move with the tower it stands on.
        self.far = move.get("far", 0.0)
        self.a, self.b = shot["a"], shot["b"]
        if depth is None:
            depth = cv2.imread(shot["depth"], cv2.IMREAD_UNCHANGED).astype(np.float32) / 65535
        if src_size is None:
            src_size = cv2.imread(shot["still"], cv2.IMREAD_UNCHANGED).shape[1::-1]
        self.ws, self.hs = src_size
        depth = np.clip((depth - self.far) / (1.0 - self.far), 0, 1) if self.far else depth
        self.depth = cv2.resize(depth, (self.ws, self.hs), interpolation=cv2.INTER_LINEAR)

    def at(self, n):
        """The camera at frame n (a fraction of a frame is a moment within it): zoom, centre (source px), turn
        (radians), dolly and truck (source px per unit of nearness)."""
        p = ease((n - self.a) / max(1, (self.b - self.a - 1)))
        return dict(zoom=lerp(*self.z, p), ccx=lerp(*self.cx, p) * self.ws, ccy=lerp(*self.cy, p) * self.hs,
                    ang=math.radians(lerp(*self.spin, p)), k=self.dolly * p, truck=lerp(*self.truck, p) * self.ws)

    @staticmethod
    def scale(k, w):
        return 1.0 / np.maximum(0.2, 1.0 - k * (0.15 + 0.85 * w))

    def source_of(self, n, ow, oh):
        """Every pixel of an ow x oh output at frame n -> its source (sx, sy), as float32 maps for cv2.remap."""
        c = self.at(n)
        X, Y = np.meshgrid(np.arange(ow, dtype=np.float32) + 0.5 - ow / 2, np.arange(oh, dtype=np.float32) + 0.5 - oh / 2)
        unit = (self.ws / ow) / c["zoom"]
        ca, sa = math.cos(c["ang"]), math.sin(c["ang"])
        bx = (X * ca - Y * sa) * unit
        by = (X * sa + Y * ca) * unit
        sx = c["ccx"] + bx
        sy = c["ccy"] + by
        if c["k"] or c["truck"]:
            # Where the pixel comes from depends on how near that point is: look the nearness up where the pixel
            # would come from, twice.
            for _ in range(2):
                w = cv2.remap(self.depth, sx, sy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
                s = self.scale(c["k"], w)
                sx = c["ccx"] + bx / s + c["truck"] * (w - self.pivot)
                sy = c["ccy"] + by / s
        return sx.astype(np.float32), sy.astype(np.float32)

    def frame_of(self, n, pts, extra=0.0, with_scale=False, near=None):
        """Source points (shares of the still) -> where they are in the film's frame (px of 1080 x 1920) at n. `extra`
        moves the camera further in than the shot's own dolly (into the digital twin, twin.py), `near` gives the
        points' nearness when it is known (else it is looked up), and with_scale also returns how much each point is
        magnified, and how near the camera has come to it (1 - travelled / its distance; at 0 it is passed)."""
        c = self.at(n)
        pts = np.asarray(pts, np.float64).reshape(-1, 2)
        px, py = pts[:, 0] * self.ws, pts[:, 1] * self.hs
        if near is None:
            w = cv2.remap(self.depth, px.astype(np.float32).reshape(1, -1), py.astype(np.float32).reshape(1, -1),
                          cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT).reshape(-1).astype(np.float64)
        else:
            w = np.asarray(near, np.float64)
        gap = 1.0 - (c["k"] + extra) * (0.15 + 0.85 * w)
        s = 1.0 / np.maximum(0.2, gap) if not extra else 1.0 / np.maximum(1e-3, gap)
        dx = (px - c["ccx"] - c["truck"] * (w - self.pivot)) * s
        dy = (py - c["ccy"]) * s
        unit = (self.ws / W) / c["zoom"]
        ca, sa = math.cos(-c["ang"]), math.sin(-c["ang"])
        X = (dx * ca - dy * sa) / unit
        Y = (dx * sa + dy * ca) / unit
        out = np.stack([X + W / 2, Y + H / 2], axis=1)
        return (out, s, gap) if with_scale else out

    def px_per_share(self, n):
        """How many film pixels one share of the still's width spans at n (at the centre, before the dolly)."""
        return W * self.at(n)["zoom"]


class TakeCamera:
    def __init__(self, shot, tracks=None):
        self.shot = shot
        probe = json.loads(__import__("subprocess").run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,nb_frames,r_frame_rate",
             "-of", "json", shot["clip"]], capture_output=True, text=True, check=True).stdout)["streams"][0]
        self.ws, self.hs = probe["width"], probe["height"]
        self.total = int(probe["nb_frames"])
        num, den = map(int, probe["r_frame_rate"].split("/"))
        self.src_fps = num / den
        move = shot["move"]
        self.z = pair(move.get("zoom"), 1.0)
        self.cx = pair(move.get("cx"), 0.5)
        self.cy = pair(move.get("cy"), 0.5)
        self.spin = pair(move.get("spin"), 0.0)
        self.a, self.b = shot["a"], shot["b"]
        self.tracks = (tracks or {}).get("points", {})

    def take_frame(self, n):
        """The take's frame (fractional) shown at film frame n."""
        take = self.shot["take"]
        return (take["start"] + (n - self.a) / FPS * take["speed"]) * self.src_fps

    def matrix(self, n):
        """Take pixels -> film pixels at n (2 x 3)."""
        p = ease((n - self.a) / max(1, (self.b - self.a - 1)))
        zoom, ang = lerp(*self.z, p), lerp(*self.spin, p)
        cx, cy = lerp(*self.cx, p) * self.ws, lerp(*self.cy, p) * self.hs
        m = cv2.getRotationMatrix2D((cx, cy), ang, zoom * W / self.ws)
        m[0, 2] += W / 2 - cx
        m[1, 2] += H / 2 - cy
        return m

    def frame_of(self, n, pts):
        pts = np.asarray(pts, np.float64).reshape(-1, 2) * [self.ws, self.hs]
        m = self.matrix(n)
        return pts @ m[:, :2].T + m[:, 2]

    def tracked(self, n, name):
        """A tracked point at film frame n: (x, y) in film px, whether it is still followed, and its scale.
        Past where it was lost it carries on at its last speed, so the light leaving the frame with it goes on."""
        rows = self.tracks[name]
        f = self.take_frame(n)
        i0 = int(math.floor(f))
        u = f - i0
        last_ok = max((i for i, r in enumerate(rows) if r[2]), default=0)

        def row(i):
            if i <= last_ok:
                return np.array(rows[max(0, i)][:2], np.float64), rows[max(0, i)][3]
            # Extrapolate from the last two followed frames.
            a, b = np.array(rows[max(0, last_ok - 1)][:2]), np.array(rows[last_ok][:2])
            return b + (b - a) * (i - last_ok), rows[last_ok][3]

        (p0, s0), (p1, s1) = row(i0), row(i0 + 1)
        p = p0 * (1 - u) + p1 * u
        ok = f <= last_ok
        return self.frame_of(n, [p])[0], ok, s0 * (1 - u) + s1 * u
