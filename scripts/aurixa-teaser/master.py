#!/usr/bin/env python3
"""The teaser's master: sound.py's mix brought to -14 LUFS integrated with its true peak at -1 dBTP, as the feeds
play it, by gain and a look-ahead limiter that touches only the peaks.

  python3 -I scripts/aurixa-teaser/master.py <mix.wav> <master.wav>

The mix's peaks are short (the consonants of a few words, the bells' strikes) and sit about 4 dB above where the
gain puts them, so the limiter works on them alone: linked across both channels, at four times the sample rate (so
it sees the peaks between samples, as a true-peak meter does), seeing 5 ms ahead and letting go over 90 ms. Loudness
and true peak are measured by FFmpeg's EBU R128 meter, never estimated, and the gain is set again until the
integrated loudness is within 0.1 LU of the target. Writes 24-bit PCM, and prints what it measured.
"""
import json
import re
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from scipy import ndimage, signal

MIX, OUT = Path(sys.argv[1]), Path(sys.argv[2])
TARGET_I = -14.0
CEILING_DBTP = -1.25  # a little under -1, for what the return to 48 kHz and the AAC encoder add
OS = 4
LOOKAHEAD_S = 0.005
RELEASE_S = 0.09


def read(path):
    with wave.open(str(path)) as w:
        sr, ch, width = w.getframerate(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(w.getnframes())
    if width == 2:
        x = np.frombuffer(raw, np.int16).astype(np.float64) / 32768
    elif width == 3:
        b = np.frombuffer(raw, np.uint8).reshape(-1, 3).astype(np.int32)
        v = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)
        x = np.where(v >= 1 << 23, v - (1 << 24), v).astype(np.float64) / (1 << 23)
    else:
        raise SystemExit(f"{path}: {width * 8}-bit PCM is not read here")
    return sr, x.reshape(-1, ch)


def write24(path, sr, x):
    v = np.clip(np.round(x * (1 << 23)), -(1 << 23), (1 << 23) - 1).astype(np.int32)
    b = np.stack([v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF], -1).astype(np.uint8)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(3)
        w.setframerate(sr)
        w.writeframes(b.tobytes())


def measure(path):
    """FFmpeg's EBU R128 meter: integrated loudness (LUFS), loudness range (LU) and true peak (dBTP)."""
    err = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true",
                          "-f", "null", "-"], capture_output=True, text=True).stderr
    summary = err[err.rindex("Summary:"):]
    get = lambda label: float(re.search(label + r":\s+(-?[\d.]+|-inf)", summary).group(1))
    return {"I": get("I"), "LRA": get("LRA"), "TP": get("Peak")}


def limit(x, sr, gain_db):
    """x times the gain, its peaks held under the ceiling: linked, four times oversampled, 5 ms ahead, 90 ms back."""
    up = signal.resample_poly(x * 10 ** (gain_db / 20), OS, 1, axis=0)
    fs = sr * OS
    ceiling = 10 ** (CEILING_DBTP / 20)
    peak = np.abs(up).max(axis=1)
    want = np.minimum(1.0, ceiling / np.maximum(peak, 1e-12))
    L = int(LOOKAHEAD_S * fs)
    # Down before each peak and back up after: the least gain within the look-ahead either side, averaged over the
    # look-ahead, so the gain at a peak is never more than that peak allows.
    g = ndimage.minimum_filter1d(want, 2 * L + 1, mode="nearest")
    g = ndimage.uniform_filter1d(g, L + 1, mode="nearest")
    # Letting go slowly: per millisecond block, a release no faster than RELEASE_S, never above the gain the peaks need.
    blk = fs // 1000
    nb = -(-len(g) // blk)
    gb = np.pad(g, (0, nb * blk - len(g)), mode="edge").reshape(nb, blk).min(axis=1)
    rel = 1 - np.exp(-1 / (RELEASE_S * 1000))
    out = np.empty_like(gb)
    cur = 1.0
    for i, v in enumerate(gb):
        cur = v if v < cur else cur + (1 - cur) * rel
        out[i] = cur
    slow = np.interp(np.arange(len(g)), np.arange(nb) * blk + blk / 2, out)
    g = np.minimum(g, slow)
    return signal.resample_poly(up * g[:, None], 1, OS, axis=0), float(20 * np.log10(g.min()))


sr, mix = read(MIX)
before = measure(MIX)
gain = TARGET_I - before["I"]
for attempt in range(6):
    master, deepest = limit(mix, sr, gain)
    write24(OUT, sr, master)
    after = measure(OUT)
    if abs(after["I"] - TARGET_I) <= 0.1 and after["TP"] <= -1.0:
        break
    gain += TARGET_I - after["I"]
    if after["TP"] > -1.0:
        CEILING_DBTP -= after["TP"] + 1.0 + 0.05
print(json.dumps({"mix": before, "master": after, "gain_db": round(gain, 2), "deepest_limit_db": round(deepest, 2),
                  "ceiling_dbtp": CEILING_DBTP, "passes": attempt + 1}))
