#!/usr/bin/env python3
"""As One's textures, drawn from noise: the hall's black marble and the fog the beam lights.

  python3 -I scripts/aurixa-teaser/as-one/textures.py <out dir>

marble.png  4096 x 4096, tiling: Nero Marquina-like black marble. A near-black ground with faint cloudy depth, a few
            broad grey drifts, and thin white veins that wander, branch and fade, from domain-warped noise. Its alpha is
            how much each point is vein (white, matt), so the floor's shader can let the polish (the reflection) through
            the black and not through the veins.
fog.png     1024 x 1024, tiling: soft billowing density for the fog sheets.
Every field is filtered in the frequency domain, so it is periodic and both tile without a seam.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)


def gauss(n, sigma):
    k = np.fft.fftfreq(n).astype(np.float32)
    return np.exp(-2 * (np.pi * sigma) ** 2 * (k[:, None] ** 2 + k[None, : n // 2 + 1] ** 2)).astype(np.float32)


def field(rng, n, sigma):
    """Periodic smooth noise (white noise through a Gaussian of `sigma` px, in the frequency domain), zero mean, unit
    deviation."""
    f = np.fft.irfft2(np.fft.rfft2(rng.normal(0, 1, (n, n)).astype(np.float32)) * gauss(n, sigma), s=(n, n))
    f = f.astype(np.float32)
    return (f - f.mean()) / (f.std() + 1e-9)


def blur(img, sigma):
    """A periodic Gaussian blur, in the frequency domain."""
    return np.fft.irfft2(np.fft.rfft2(img) * gauss(img.shape[0], sigma), s=img.shape).astype(np.float32)


def fbm(rng, n, sigmas):
    out = np.zeros((n, n), np.float32)
    amp, tot = 1.0, 0.0
    for s in sigmas:
        out += amp * field(rng, n, s)
        tot += amp
        amp *= 0.55
    return out / tot


def veins(rng, n, freq, angle, sharp, wscale):
    """Thin wandering lines where a warped ramp crosses zero: long and roughly parallel along `angle`, meandering,
    never closing on themselves (the warp is gentle beside the ramp), thinner and fainter where `sharp` rises."""
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32) / n
    w = fbm(rng, n, [n / 3, n / 7, n / 16, n / 40]) * wscale
    kx, ky = np.round(np.cos(angle) * freq), np.round(np.sin(angle) * freq)  # whole cycles across the tile
    if kx == 0 and ky == 0:
        kx = 1.0
    phase = 2 * np.pi * (kx * xx + ky * yy) + w
    thick = np.exp(0.5 * field(rng, n, n / 10))  # the vein swells and thins along its length
    return np.exp(-sharp * np.abs(np.sin(phase / 2)) / thick)


rng = np.random.default_rng(43)
N = int(sys.argv[2]) if len(sys.argv) > 2 else 4096
# The ground: near-black with slow cloudy depth and fine grain.
cloud = fbm(rng, N, [N / 4, N / 10, N / 25])
grain = field(rng, N, 0.9) * 0.5 + field(rng, N, 2.2) * 0.5
base = 0.045 + 0.018 * cloud + 0.006 * grain
# Broad grey drifts, few and soft.
drift = np.clip(fbm(rng, N, [N / 8, N / 20, N / 50]) - 0.9, 0, None)
drift = blur(drift, 6)
base += 0.06 * drift / (drift.max() + 1e-9)
# Veins: families of long lines at about one angle (the stone's grain), coarse to hairline, each faded along its
# length by its own noise so it starts and ends, and a few across the grain.
v = np.zeros((N, N), np.float32)
grain_angle = 0.55
for freq, d_angle, sharp, wscale, weight, fade_sigma, fade_bias in (
        (2, 0.0, 70, 1.5, 1.0, N / 6, 0.35), (3, 0.25, 130, 1.9, 0.7, N / 9, 0.15), (6, -0.2, 230, 2.2, 0.55, N / 14, 0.05),
        (11, 0.35, 380, 2.6, 0.42, N / 24, -0.1), (5, 1.45, 300, 2.4, 0.35, N / 18, -0.3), (17, 0.1, 600, 3.0, 0.3, N / 32, -0.2)):
    lines = veins(rng, N, freq, grain_angle + d_angle, sharp, wscale)
    fade = np.clip(field(rng, N, fade_sigma) * 0.8 + fade_bias, 0, 1)
    v = np.maximum(v, weight * lines * fade)
# A little feathering: veins bleed softly into the stone.
v = np.maximum(v, 0.35 * blur(v, 3))
v = np.clip(v, 0, 1)
lum = np.clip(base + 0.82 * v ** 1.15, 0, 1)
# Colour: the ground a cold blue-black, the veins a warm grey-white.
rgb = np.stack([lum * (0.92 + 0.10 * v), lum * (0.95 + 0.06 * v), lum * (1.06 - 0.04 * v)], -1)
alpha = np.clip(v * 1.6, 0, 1)
img = np.dstack([np.clip(rgb, 0, 1), alpha])
Image.fromarray((img * 255 + 0.5).astype(np.uint8), "RGBA").save(OUT / "marble.png", optimize=False, compress_level=3)

# The fog: billows, periodic.
rng = np.random.default_rng(7)
F = 1024
f = fbm(rng, F, [F / 5, F / 11, F / 24, F / 60])
f = np.clip((f + 0.6) / 2.2, 0, 1) ** 1.6
Image.fromarray((f * 255 + 0.5).astype(np.uint8), "L").save(OUT / "fog.png")
print("marble.png", "fog.png", "->", OUT)
