#!/usr/bin/env python3
"""Where the light is anchored in a moving take: named points followed frame by frame through the take, so the
light drawn over them stays on them (light.py). A point is given on the take's first frame, which is its keyframe
(the take starts on it), as shares of the picture.

  python3 -I track.py <work files dir> [take ...]        # (needs numpy and OpenCV); writes tracks/<take>.json

Each point is followed through the features about it, in a window of its own that need not hold the point itself
(a spire's tip is followed through the floors below it, where the features are, not through the sky behind it):
those features are followed from frame to frame, checked forward and back, and the window's motion (a move, a turn
and a scale) is fitted to the ones that agree and carried to the point. Features are found again as they are lost.
A point is marked lost when its window leaves the picture or its features stop agreeing; light.py fades it there.

A spire's tip ("tip": True) is then found in each frame itself, by climbing the thin line that stands out from the
sky from where the features put it to where it ends, and the difference is smoothed over the take and added back:
glass reflects the moving sky, so features on a tower's face drift a little, and the tip must not slide off the
spire.
"""
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

# The points, on each take's first frame: (x, y) as shares, and the window of features that carries it
# (x0, y0, x1, y1, as shares), measured on the keyframes (stills/*-1.png).
POINTS = {
    "open": {
        "crown": dict(at=(0.4880, 0.2388), window=(0.474, 0.246, 0.503, 0.300), tip=True),
    },
    "sunrise": {
        "crown": dict(at=(0.4893, 0.2092), window=(0.474, 0.222, 0.505, 0.290), tip=True),
        # Five places across the city, each a light of its own until the drop joins them.
        "p1": dict(at=(0.105, 0.452), window=(0.075, 0.432, 0.135, 0.472)),
        "p2": dict(at=(0.30, 0.335), window=(0.27, 0.315, 0.33, 0.355)),
        "p3": dict(at=(0.655, 0.385), window=(0.625, 0.365, 0.685, 0.405)),
        "p4": dict(at=(0.86, 0.47), window=(0.83, 0.45, 0.89, 0.49)),
        "p5": dict(at=(0.40, 0.545), window=(0.37, 0.525, 0.43, 0.565)),
    },
}

WORK_W = 1080  # followed at half the take's size: plenty for a fraction of a pixel in the film's frame


def frames(clip):
    probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                       "stream=width,height", "-of", "json", str(clip)],
                                      capture_output=True, text=True, check=True).stdout)["streams"][0]
    w, h = probe["width"], probe["height"]
    ww, wh = WORK_W, round(WORK_W * h / w)
    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(clip), "-vf", f"scale={ww}:{wh}:flags=area",
                            "-f", "rawvideo", "-pix_fmt", "gray", "-"], stdout=subprocess.PIPE)
    while True:
        buf = dec.stdout.read(ww * wh)
        if len(buf) < ww * wh:
            break
        yield np.frombuffer(buf, np.uint8).reshape(wh, ww)
    dec.wait()


def seed(gray, quad, mask_shape):
    """Features inside the window's quad."""
    mask = np.zeros(mask_shape, np.uint8)
    cv2.fillConvexPoly(mask, quad.astype(np.int32), 255)
    pts = cv2.goodFeaturesToTrack(gray, maxCorners=80, qualityLevel=0.01, minDistance=3, mask=mask, blockSize=5)
    return pts.reshape(-1, 2) if pts is not None else np.zeros((0, 2), np.float32)


def follow(clip, points):
    lk = dict(winSize=(21, 21), maxLevel=4, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))
    out = {name: [] for name in points}
    state = {}
    prev = None
    for i, gray in enumerate(frames(clip)):
        h, w = gray.shape
        if prev is None:
            for name, p in points.items():
                x0, y0, x1, y1 = p["window"]
                quad = np.array([[x0 * w, y0 * h], [x1 * w, y0 * h], [x1 * w, y1 * h], [x0 * w, y1 * h]], np.float32)
                state[name] = dict(pt=np.array([p["at"][0] * w, p["at"][1] * h], np.float32), quad=quad,
                                   feats=seed(gray, quad, gray.shape), ok=True, scale=1.0)
        else:
            for name, s in state.items():
                if not s["ok"]:
                    continue
                f0 = s["feats"].reshape(-1, 1, 2).astype(np.float32)
                ok = False
                if len(f0) >= 6:
                    f1, st, _ = cv2.calcOpticalFlowPyrLK(prev, gray, f0, None, **lk)
                    fb, st2, _ = cv2.calcOpticalFlowPyrLK(gray, prev, f1, None, **lk)
                    good = (st.ravel() == 1) & (st2.ravel() == 1) & (np.linalg.norm((fb - f0).reshape(-1, 2), axis=1) < 0.5)
                    a, b = f0.reshape(-1, 2)[good], f1.reshape(-1, 2)[good]
                    if len(a) >= 6:
                        m, inl = cv2.estimateAffinePartial2D(a, b, method=cv2.RANSAC, ransacReprojThreshold=1.0)
                        if m is not None and inl.sum() >= 5:
                            ok = True
                            s["pt"] = m[:, :2] @ s["pt"] + m[:, 2]
                            s["quad"] = s["quad"] @ m[:, :2].T + m[:, 2]
                            s["scale"] *= float(np.sqrt(abs(np.linalg.det(m[:, :2]))))
                            s["feats"] = b[inl.ravel() == 1]
                inside = (s["quad"][:, 0].min() > 2 and s["quad"][:, 1].min() > 2 and
                          s["quad"][:, 0].max() < w - 2 and s["quad"][:, 1].max() < h - 2)
                if not ok or not inside:
                    s["ok"] = False
                elif len(s["feats"]) < 25:
                    s["feats"] = np.concatenate([s["feats"], seed(gray, s["quad"], gray.shape)])
        for name, s in state.items():
            out[name].append([round(float(s["pt"][0] / w), 5), round(float(s["pt"][1] / h), 5), int(s["ok"]),
                              round(s["scale"], 4)])
        prev = gray
    return out


def tip_offsets(clip, rows):
    """For each frame where the point is followed, how far the spire's top is from it (in shares), or None. The
    spire is climbed from the point: row by row up the column where the picture stands out from the sky most, until
    it has stood out in none of the last few rows (a spire's markings leave gaps), and its top is the last row it
    stood out in. If the point is above the spire, the spire is first found below it."""
    probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                       "stream=width,height", "-of", "json", str(clip)],
                                      capture_output=True, text=True, check=True).stdout)["streams"][0]
    w, h = probe["width"], probe["height"]
    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(clip), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                           stdout=subprocess.PIPE)
    found = []
    for i, (x, y, ok, scale) in enumerate(rows):
        buf = dec.stdout.read(w * h * 3)
        if len(buf) < w * h * 3:
            break
        if not ok:
            found.append(None)
            continue
        img = np.frombuffer(buf, np.uint8).reshape(h, w, 3).astype(np.float32)
        px, py = x * w, y * h
        k = max(1.0, scale)
        hw, span = int(50 * k), int(160 * k)
        x0, x1 = int(px) - hw, int(px) + hw
        y0, y1 = int(py) - span, int(py) + span
        if x0 < 0 or y0 < 0 or x1 > w or y1 > h:
            found.append(None)
            continue
        win = cv2.GaussianBlur(img[y0:y1, x0:x1], (0, 0), 1.0)
        sky = np.median(win, axis=1, keepdims=True)
        diff = np.abs(win - sky).sum(axis=2)
        tau = max(12.0, 3.0 * float(np.median(diff)))
        reach = max(2, int(round(1.5 * k ** 0.5)))
        col, row = hw, span

        def strongest(r, c, rad):
            lo, hi = max(0, c - rad), min(diff.shape[1], c + rad + 1)
            j = int(np.argmax(diff[r, lo:hi]))
            return lo + j, diff[r, lo + j]

        # On the spire? If not, look down for it (the point may sit above the tip).
        c, v = strongest(row, col, int(8 * k))
        while v < tau and row < diff.shape[0] - 1 and row < span + int(60 * k):
            row += 1
            c, v = strongest(row, col, int(8 * k))
        if v < tau:
            found.append(None)
            continue
        col, top, misses = c, row, 0
        r = row
        while r > 0 and misses <= int(6 * k ** 0.5):
            r -= 1
            c, v = strongest(r, col, reach)
            if v >= tau:
                col, top, misses = c, r, 0
            else:
                misses += 1
        found.append(((x0 + col - px) / w, (y0 + top - py) / h))
    dec.kill()
    return found


def refine(rows, offsets):
    """The tip's offsets, smoothed over the take (a straight-line fit in a sliding window), added to the point."""
    idx = [i for i, o in enumerate(offsets) if o is not None]
    if len(idx) < 8:
        return rows, 0
    ox = np.array([offsets[i][0] for i in idx])
    oy = np.array([offsets[i][1] for i in idx])
    t = np.array(idx, np.float32)
    out = [list(r) for r in rows]
    for i, r in enumerate(rows):
        if not r[2]:
            continue
        near = np.abs(t - i) <= 12
        if near.sum() < 5:
            near = np.argsort(np.abs(t - i))[:5]
        tt, xx, yy = t[near], ox[near], oy[near]
        # A robust line: drop the worst fifth, then fit.
        for _ in range(2):
            fx = np.polyfit(tt, xx, 1) if len(tt) > 2 else (0, xx.mean())
            fy = np.polyfit(tt, yy, 1) if len(tt) > 2 else (0, yy.mean())
            err = np.hypot(np.polyval(fx, tt) - xx, np.polyval(fy, tt) - yy)
            keep = err <= np.percentile(err, 80)
            tt, xx, yy = tt[keep], xx[keep], yy[keep]
        out[i][0] = round(r[0] + float(np.polyval(fx, i)), 5)
        out[i][1] = round(r[1] + float(np.polyval(fy, i)), 5)
    return out, len(idx)


def main():
    work = Path(sys.argv[1]).resolve()
    root = work / "we-are-here"
    (root / "tracks").mkdir(exist_ok=True)
    for take, points in POINTS.items():
        if len(sys.argv) > 2 and take not in sys.argv[2:]:
            continue
        clip = root / "clips" / f"{take}-1.mp4"
        if not clip.exists():
            continue
        out = follow(clip, points)
        for name, p in points.items():
            if p.get("tip"):
                offsets = tip_offsets(clip, out[name])
                out[name], n = refine(out[name], offsets)
                print(f"{take}.{name}: tip found in {n} of {sum(r[2] for r in out[name])} frames")
        (root / "tracks" / f"{take}.json").write_text(json.dumps({"take": take, "points": out}))
        for name, rows in out.items():
            lost = next((i for i, r in enumerate(rows) if not r[2]), None)
            print(f"{take}.{name}: {len(rows)} frames, {rows[0][:2]} -> {rows[-1][:2]}, scale {rows[-1][3]}"
                  f"{'' if lost is None else f', lost at frame {lost}'}")


if __name__ == "__main__":
    main()
