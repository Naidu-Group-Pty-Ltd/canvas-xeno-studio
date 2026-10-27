#!/usr/bin/env python3
"""What the light acts on in each keyframe, found in the keyframe itself: its lights, its edges, its streets, a screen.
Each is a 16-bit mask at the keyframe's size (masks/<shot>-<name>.png), moved with the picture by plates.py and lit by
light.py, so the light that runs along a road or comes up in a window is the picture's own road and window.

  python3 -I masks.py <work files dir> [shot ...]        # (needs numpy and OpenCV); writes we-are-here/masks/

A "phase" is a path's length from where the light comes in: along the motorway's trails from the frame's edges, and
along the city's streets from its centre, measured inside the trails or the streets (not across them), so the light
flows the way the roads go.
"""
import sys
from pathlib import Path

import cv2
import numpy as np


def lum_of(img):
    return img @ np.array([0.2126, 0.7152, 0.0722], np.float32)


def region(shape, x0, y0, x1, y1):
    h, w = shape[:2]
    m = np.zeros((h, w), np.float32)
    m[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)] = 1
    return cv2.GaussianBlur(m, (0, 0), 0.01 * w)


def soft(m, sigma):
    return np.clip(cv2.GaussianBlur(m.astype(np.float32), (0, 0), sigma), 0, 1)


def geodesic(mask, seeds, size=(540, 960), limit=4000):
    """Path length (in the small grid's px) from the seeds to every pixel of the mask, inside the mask."""
    m = cv2.resize(mask.astype(np.float32), size, interpolation=cv2.INTER_AREA) > 0.25
    s = cv2.resize(seeds.astype(np.float32), size, interpolation=cv2.INTER_AREA) > 0.25
    s &= m
    big = 1e9
    d = np.where(s, 0.0, big).astype(np.float64)
    steps = [(-1, 0, 1.0), (1, 0, 1.0), (0, -1, 1.0), (0, 1, 1.0),
             (-1, -1, 1.4142), (-1, 1, 1.4142), (1, -1, 1.4142), (1, 1, 1.4142)]
    for _ in range(limit):
        prev = d
        e = np.pad(d, 1, constant_values=big)
        best = d.copy()
        for dy, dx, c in steps:
            nb = e[1 + dy:1 + dy + d.shape[0], 1 + dx:1 + dx + d.shape[1]] + c
            best = np.minimum(best, nb)
        d = np.where(m, best, big)
        if np.array_equal(d, prev):
            break
    d[d >= big] = 0
    return d.astype(np.float32), m


def save(out, name, m):
    cv2.imwrite(str(out / f"{name}.png"), (np.clip(m, 0, 1) * 65535 + 0.5).astype(np.uint16))
    print(f"{name}: covers {float((m > 0.5).mean()) * 100:.1f}% of the picture")


def research(img, out):
    # The lots' edges, for the scan to trace: fences, roofs and kerbs.
    g = (lum_of(img) * 255).astype(np.uint8)
    e = cv2.Canny(cv2.GaussianBlur(g, (0, 0), 2.2), 70, 170).astype(np.float32) / 255
    save(out, "research-edges", soft(cv2.dilate(e, np.ones((3, 3), np.uint8)), 1.2))


def clients(img, out):
    # The home's lit windows and door: warm and bright, within the house.
    lum = lum_of(img)
    warm = np.clip((img[..., 0] - img[..., 2] - 0.12) / 0.15, 0, 1) * np.clip((lum - 0.35) / 0.25, 0, 1)
    save(out, "clients-windows", soft(warm * region(img.shape, 0.06, 0.26, 0.97, 0.6), 2.0))


def reports(img, out):
    # The white model: bright and unsaturated, on the table, its edges kept.
    lum = lum_of(img)
    sat = img.max(axis=2) - img.min(axis=2)
    white = np.clip((lum - 0.42) / 0.2, 0, 1) * np.clip((0.3 - sat) / 0.15, 0, 1)
    save(out, "reports-model", soft(white * region(img.shape, 0.02, 0.12, 0.99, 0.8), 1.5))


def finance(img, out):
    # The towers' lit windows: small bright points above their surroundings.
    lum = lum_of(img)
    lights = np.clip((lum - cv2.GaussianBlur(lum, (0, 0), 8) - 0.05) / 0.12, 0, 1) * np.clip((lum - 0.3) / 0.2, 0, 1)
    save(out, "finance-lights", soft(lights, 1.0))


def comms(img, out):
    # The light trails, and how far along them from where they come into the frame.
    lum = lum_of(img)
    h, w = lum.shape
    trails = np.clip((lum - 0.32) / 0.25, 0, 1) * np.clip((lum - cv2.GaussianBlur(lum, (0, 0), 30) + 0.05) / 0.15, 0, 1)
    trails *= region(img.shape, 0, 0.19, 1, 1)
    trails = soft(trails, 1.2)
    save(out, "comms-trails", trails)
    edge = np.zeros_like(trails, bool)
    b = int(0.02 * w)
    edge[-b:, :] = True
    edge[:, :b] = True
    edge[:, -b:] = True
    d, m = geodesic(soft(trails, 4) > 0.15, edge)
    phase = d / max(1.0, float(np.percentile(d[m], 99)))
    save(out, "comms-phase", cv2.resize(np.clip(phase, 0, 1), (w, h), interpolation=cv2.INTER_LINEAR))


def grid(img, out):
    # The city's streets seen from above (long, bright, thin), and how far along them from the centre.
    lum = lum_of(img)
    h, w = lum.shape
    top = lum - cv2.morphologyEx(lum, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41)))
    bright = np.clip((top - 0.06) / 0.12, 0, 1) * np.clip((lum - 0.25) / 0.2, 0, 1)
    k = int(0.035 * w)
    lines = np.maximum(cv2.morphologyEx(bright, cv2.MORPH_OPEN, np.ones((1, k), np.uint8)),
                       cv2.morphologyEx(bright, cv2.MORPH_OPEN, np.ones((k, 1), np.uint8)))
    streets = soft(cv2.dilate(lines, np.ones((5, 5), np.uint8)), 2.0)
    save(out, "grid-streets", streets)
    lights = np.clip((lum - cv2.GaussianBlur(lum, (0, 0), 8) - 0.05) / 0.12, 0, 1) * np.clip((lum - 0.3) / 0.2, 0, 1)
    save(out, "grid-lights", soft(lights, 1.0))
    yy, xx = np.mgrid[0:h, 0:w]
    seeds = np.hypot(xx - w / 2, yy - h / 2) < 0.06 * w
    # Bridged first, so a street broken by a tree or a shadow still carries the light on.
    bridged = cv2.dilate((streets > 0.2).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
    d, m = geodesic(bridged, seeds)
    phase = d / max(1.0, float(np.percentile(d[m], 99)))
    # Anything the paths do not reach takes its distance from the centre instead.
    small = (m.shape[1], m.shape[0])
    ry, rx = np.mgrid[0:small[1], 0:small[0]]
    radial = np.hypot(rx - small[0] / 2, ry - small[1] / 2) / np.hypot(small[0] / 2, small[1] / 2)
    phase = np.where(m & (d > 0) | (m & (radial < 0.07)), phase, np.clip(radial * 1.15, 0, 1))
    save(out, "grid-phase", cv2.resize(np.clip(phase, 0, 1), (w, h), interpolation=cv2.INTER_LINEAR))


def device(img, out):
    # The phone's lit screen (the largest bright patch on the table), and the light it throws on the stone.
    lum = lum_of(img)
    h, w = lum.shape
    bright = ((lum > 0.62) * (region(img.shape, 0.05, 0.45, 0.97, 0.78) > 0.5)).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(bright, 8)
    if n < 2:
        raise SystemExit("device: no screen found")
    biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    screen = (lab == biggest).astype(np.uint8)
    # Its outline, filled: the screen is one convex face.
    cnts, _ = cv2.findContours(screen, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    hull = cv2.convexHull(max(cnts, key=cv2.contourArea))
    face = np.zeros_like(screen)
    cv2.fillConvexPoly(face, hull, 1)
    save(out, "device-screen", soft(face, 2.0))
    blue = np.clip((img[..., 2] - img[..., 0]) / 0.25, 0, 1) * np.clip(lum / 0.25, 0, 1)
    spill = soft(face, 0.05 * w) * blue * (1 - soft(face, 3.0))
    save(out, "device-spill", spill / max(1e-3, float(spill.max())))


def pulse(img, out):
    # The wet avenue, where the pulse's light falls: the road between its kerbs, where it shines.
    lum = lum_of(img)
    h, w = lum.shape
    road = np.zeros((h, w), np.uint8)
    vp = (0.507 * w, 0.31 * h)
    cv2.fillConvexPoly(road, np.array([[vp[0] - 4, vp[1]], [vp[0] + 4, vp[1]], [0.75 * w, h], [0.3 * w, h]], np.int32), 1)
    shine = np.clip((lum - cv2.GaussianBlur(lum, (0, 0), 20) + 0.04) / 0.12, 0, 1)
    save(out, "pulse-road", soft(road.astype(np.float32) * (0.35 + 0.65 * shine), 2.0))


MAKERS = {"research": research, "clients": clients, "reports": reports, "finance": finance, "comms": comms,
          "grid": grid, "device": device, "pulse": pulse}


def main():
    work = Path(sys.argv[1]).resolve()
    root = work / "we-are-here"
    out = root / "masks"
    out.mkdir(exist_ok=True)
    want = set(sys.argv[2:])
    for shot, make in MAKERS.items():
        if want and shot not in want:
            continue
        img = cv2.imread(str(root / "stills" / f"{shot}-1.png"), cv2.IMREAD_COLOR)[:, :, ::-1].astype(np.float32) / 255
        make(img, out)


if __name__ == "__main__":
    main()
