"""The Sydney basin as data, on a local plane in kilometres around 14 Wattle Grove.

  land(view)     the land's share of each pixel, from GSHHG's full-resolution shoreline (gshhs.py), drawn at four
                 times the view's size and taken down, so the coast is smooth at any scale
  density(view)  people a square kilometre, from GeoNames' places (CC BY 4.0): each suburb's people spread over
                 the area its population would take at a suburban density, on land only
A view is a dict: cx, cy (screen px of the property), up (the bearing the screen's top faces, degrees), s (px a
km), w, h (px). km_to_px and px_to_km turn the plane's (east, north) kilometres into the view's pixels and back."""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

import gshhs

PROPERTY = (150.915, -33.692)  # Reel 1's gold pin: 14 Wattle Grove, Banksia Rise NSW 2155 (a suburb that does not exist)
KM_LON = 111.32 * np.cos(np.radians(PROPERTY[1]))
KM_LAT = 110.57


def ll_to_km(lon, lat):
    return (np.asarray(lon) - PROPERTY[0]) * KM_LON, (np.asarray(lat) - PROPERTY[1]) * KM_LAT


def km_to_ll(e, n):
    return PROPERTY[0] + np.asarray(e) / KM_LON, PROPERTY[1] + np.asarray(n) / KM_LAT


def km_to_px(v, e, n):
    b = np.radians(v["up"])
    ux, uy = np.sin(b), np.cos(b)  # the screen's up, as (east, north)
    rx, ry = uy, -ux  # its right
    e, n = np.asarray(e, np.float64), np.asarray(n, np.float64)
    return v["cx"] + (e * rx + n * ry) * v["s"], v["cy"] - (e * ux + n * uy) * v["s"]


def px_to_km(v, x, y):
    b = np.radians(v["up"])
    ux, uy = np.sin(b), np.cos(b)
    rx, ry = uy, -ux
    a, c = (np.asarray(x) - v["cx"]) / v["s"], (v["cy"] - np.asarray(y)) / v["s"]
    return a * rx + c * ux, a * ry + c * uy


def view_box_ll(v, pad_km=6):
    xs = np.array([0, v["w"], 0, v["w"]])
    ys = np.array([0, 0, v["h"], v["h"]])
    e, n = px_to_km(v, xs, ys)
    lon, lat = km_to_ll(e, n)
    p = pad_km / KM_LAT
    return lat.min() - p, lat.max() + p, lon.min() - p * 1.3, lon.max() + p * 1.3


def land(v, whl, ss=4):
    south, north, west, east = view_box_ll(v)
    polys = gshhs.polygons(whl, south, north, west, east)
    W, H = v["w"] * ss, v["h"] * ss
    vv = dict(v, cx=v["cx"] * ss, cy=v["cy"] * ss, s=v["s"] * ss, w=W, h=H)
    im = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(im)
    for lev, pts in sorted(polys, key=lambda p: p[0]):
        e, n = ll_to_km(pts[:, 0], pts[:, 1])
        x, y = km_to_px(vv, e, n)
        d.polygon(list(zip(x.tolist(), y.tolist())), fill=255 if lev % 2 == 1 else 0)
    return np.asarray(im.resize((v["w"], v["h"]), Image.BOX), np.float32) / 255


def places(S):
    pl = json.loads((Path(S) / "data/au-places.json").read_text())
    out = []
    for p in pl:
        if not (149.6 < p["lon"] < 152.2 and -35.0 < p["lat"] < -32.6):
            continue
        pop = p["p"]
        if p["n"] == "Sydney":  # the metro's figure on the CBD's point: the CBD's own entry and its suburbs carry it
            continue
        e, n = ll_to_km(p["lon"], p["lat"])
        out.append({"n": p["n"], "p": max(pop, 1000), "f": p["f"], "e": float(e), "nn": float(n)})
    return out


def density(v, pl, land_frac, per_km2=2600.0):
    """People a km^2 at each pixel of the view (a Gaussian per place, sized by its population)."""
    H, W = land_frac.shape
    k = 4  # worked at a quarter of the view's size
    gy, gx = np.mgrid[0:H:k, 0:W:k].astype(np.float32) + k / 2
    e, n = px_to_km(v, gx, gy)
    dens = np.zeros_like(gx)
    for p in pl:
        r = np.sqrt(p["p"] / per_km2 / np.pi)  # km
        sig = max(r * 0.75, 0.45)
        d2 = (e - p["e"]) ** 2 + (n - p["nn"]) ** 2
        near = d2 < (5 * sig) ** 2
        dens[near] += p["p"] / (2 * np.pi * sig * sig) * np.exp(-d2[near] / (2 * sig * sig))
    dens = np.kron(dens, np.ones((k, k), np.float32))[:H, :W]
    dens = ndimage.gaussian_filter(dens, k)
    return dens * (land_frac > 0.5)
