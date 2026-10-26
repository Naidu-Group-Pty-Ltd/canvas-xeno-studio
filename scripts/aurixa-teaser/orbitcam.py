"""The orbit's camera (orbit.py), as functions: where a point on the Earth lands in the teaser's first picture.

film.py asks it where 14 Wattle Grove is and how a kilometre east and north of it lie on the picture, to hand the
dive over from the orbit to the city plates."""
import numpy as np

RE = 6371.0


def unit(lat, lon):
    la, lo = np.radians(lat), np.radians(lon)
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], -1)


def camera(P, W, H):
    """The camera of the params P (lat, lon, alt, heading, pitch, vfov, roll) on a W x H picture."""
    up0 = unit(P["lat"], P["lon"])
    east = np.array([-np.sin(np.radians(P["lon"])), np.cos(np.radians(P["lon"])), 0.0])
    north = np.cross(up0, east)
    cam = up0 * (RE + P["alt"])
    hd, pt = np.radians(P["heading"]), np.radians(P["pitch"])
    fwd = np.cos(pt) * (np.cos(hd) * north + np.sin(hd) * east) + np.sin(pt) * up0
    right = np.cross(fwd, up0)
    right /= np.linalg.norm(right)
    cup = np.cross(right, fwd)
    rl = np.radians(P["roll"])
    right, cup = np.cos(rl) * right + np.sin(rl) * cup, -np.sin(rl) * right + np.cos(rl) * cup
    ty = np.tan(np.radians(P["vfov"]) / 2)
    return dict(cam=cam, fwd=fwd, right=right, cup=cup, tx=ty * W / H, ty=ty, W=W, H=H)


def to_screen(c, pts):
    """World points (n, 3) to the picture's (x, y), and whether each faces the camera and is in front of it."""
    v = pts - c["cam"]
    z = v @ c["fwd"]
    x = (v @ c["right"]) / np.maximum(z, 1e-6) / c["tx"]
    y = (v @ c["cup"]) / np.maximum(z, 1e-6) / c["ty"]
    facing = np.einsum("ij,ij->i", pts / np.linalg.norm(pts, axis=1, keepdims=True), -v) > 0
    return (x + 1) * c["W"] / 2, (1 - y) * c["H"] / 2, (z > 0) & facing


def at_km(c, lon0, lat0, e, n):
    """The picture's (x, y) of the points e km east and n km north of (lon0, lat0)."""
    e, n = np.atleast_1d(e).astype(np.float64), np.atleast_1d(n).astype(np.float64)
    lat = lat0 + n / 110.57
    lon = lon0 + e / (111.32 * np.cos(np.radians(lat0)))
    x, y, _ = to_screen(c, unit(lat, lon) * RE)
    return x, y
