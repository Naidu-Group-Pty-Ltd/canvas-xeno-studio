#!/usr/bin/env python3
"""Measures a rendered stretch of Reel 1 (render.cjs) against the frames it was made from.

render.cjs writes the master (film.mp4: H.264, 4:2:0, BT.709) and, from the same frames, a lossless RGB
reference (reference.mkv). Everything the master loses is the difference between the two, so this decodes
the master as a player does and measures that difference, then checks the master's timing against the brief:

  streams    what the file is: codec, profile, size, rate, colour tags, frame count, sound
  fidelity   SSIM and PSNR of the decoded master against the reference, whole film and worst frame
  colour     CIEDE2000 between them on every flat field (every 10th frame), and on the brand's own colours
  sharpness  edge energy of the master against the reference, on frames that hold still
  banding    the ground's glow, the smoothest gradient in the film, as a smoothed profile
  timing     every frame's caption where film.json says it is, and the cuts on the frames the brief puts them
  sound      the voiceover's offset from the picture, by cross-correlation with the source
  export     with --export, the same measures after the studio's own export (media-worker/src/sequence.js:
             each clip to an intermediate at CRF 14, then the cut at CRF 17, as the Editor renders it)

Run: python3 scripts/aurixa-reel-1/film_qc.py <outDir of render.cjs> [--voiceover vo.wav] [--export]
Writes qc.json and the crops it names into <outDir>/qc.
"""
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

W, H = 1080, 1920
FRAME_BYTES = W * H * 3
# The master as a player decodes it: BT.709, TV range, chroma upsampled bilinearly.
TO_RGB = "zscale=rangein=limited:matrixin=709:primariesin=709:transferin=709:range=full:primaries=709:transfer=709:filter=bilinear,format=gbrp,format=rgb24"


def run(args, **kw):
    return subprocess.run(args, check=True, capture_output=True, **kw)


def probe(file):
    out = run(["ffprobe", "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", str(file)])
    return json.loads(out.stdout)


def frames(file, decode, every=1, start=0):
    """Yields (index, H x W x 3 uint8) for every `every`-th frame from `start`, decoded with `decode`."""
    sel = f"select=gte(n\\,{start})*not(mod(n-{start}\\,{every}))," if every > 1 or start else ""
    p = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-i", str(file), "-vf", f"{sel}{decode}", "-fps_mode", "passthrough",
         "-f", "rawvideo", "-"],
        stdout=subprocess.PIPE,
    )
    try:
        i = 0
        while True:
            buf = p.stdout.read(FRAME_BYTES)
            if len(buf) < FRAME_BYTES:
                break
            yield start + i * every, np.frombuffer(buf, np.uint8).reshape(H, W, 3)
            i += 1
    finally:
        p.kill()
        p.wait()


def ssim_psnr(test, ref, decode_test):
    """Whole-film SSIM and PSNR (RGB) of `test` against `ref`, and the worst frame's SSIM."""
    stats = Path(test).with_suffix(".ssim.log")
    # Frames are paired by their index, never by timestamp: the reference's container keeps time in whole
    # milliseconds, and pairing by time matches some moving frames with their neighbours.
    index = "settb=1/30,setpts=N"
    graph = (f"[0:v]{index},{decode_test},format=gbrp[t];[1:v]{index},format=gbrp[r];"
             f"[t]split[t1][t2];[r]split[r1][r2];[t1][r1]ssim=stats_file={stats};[t2][r2]psnr")
    err = run(["ffmpeg", "-v", "info", "-i", str(test), "-i", str(ref), "-lavfi", graph, "-f", "null", "-"]).stderr.decode()
    ssim_line = [l for l in err.splitlines() if "SSIM" in l and "All:" in l][-1]
    psnr_line = [l for l in err.splitlines() if "PSNR" in l and "average:" in l][-1]
    ssim_all = float(ssim_line.split("All:")[1].split()[0])
    psnr_avg = float(psnr_line.split("average:")[1].split()[0])
    psnr_min = float(psnr_line.split("min:")[1].split()[0])
    per = []
    for line in stats.read_text().splitlines():
        fields = dict(kv.split(":") for kv in line.split() if ":" in kv)
        per.append((int(fields["n"]) - 1, float(fields["All"])))
    worst = min(per, key=lambda x: x[1])
    stats.unlink()
    return {"ssim": round(ssim_all, 5), "psnr_db": round(psnr_avg, 2), "psnr_min_db": round(psnr_min, 2),
            "worst_frame": {"index": worst[0], "ssim": round(worst[1], 5)}}


# ------------------------------------------------------------------ colour
def srgb_to_lab(rgb):
    c = rgb / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]])
    xyz = (c @ m.T) / np.array([0.95047, 1.0, 1.08883])
    d = 6 / 29
    f = np.where(xyz > d ** 3, np.cbrt(xyz), xyz / (3 * d * d) + 4 / 29)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def ciede2000(lab1, lab2):
    L1, a1, b1 = lab1[..., 0], lab1[..., 1], lab1[..., 2]
    L2, a2, b2 = lab2[..., 0], lab2[..., 1], lab2[..., 2]
    C1, C2 = np.hypot(a1, b1), np.hypot(a2, b2)
    Cb7 = ((C1 + C2) / 2) ** 7
    G = 0.5 * (1 - np.sqrt(Cb7 / (Cb7 + 25.0 ** 7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = np.hypot(a1p, b1), np.hypot(a2p, b2)
    h1p = np.degrees(np.arctan2(b1, a1p)) % 360
    h2p = np.degrees(np.arctan2(b2, a2p)) % 360
    zero = (C1p * C2p) == 0
    dh = h2p - h1p
    dh = np.where(dh > 180, dh - 360, np.where(dh < -180, dh + 360, dh))
    dh = np.where(zero, 0, dh)
    dL, dC = L2 - L1, C2p - C1p
    dH = 2 * np.sqrt(C1p * C2p) * np.sin(np.radians(dh / 2))
    Lb, Cb = (L1 + L2) / 2, (C1p + C2p) / 2
    hs = h1p + h2p
    hb = np.where(zero, hs, np.where(np.abs(h1p - h2p) <= 180, hs / 2, np.where(hs < 360, (hs + 360) / 2, (hs - 360) / 2)))
    T = (1 - 0.17 * np.cos(np.radians(hb - 30)) + 0.24 * np.cos(np.radians(2 * hb))
         + 0.32 * np.cos(np.radians(3 * hb + 6)) - 0.20 * np.cos(np.radians(4 * hb - 63)))
    dt = 30 * np.exp(-(((hb - 275) / 25) ** 2))
    Rc = 2 * np.sqrt(Cb ** 7 / (Cb ** 7 + 25.0 ** 7))
    Sl = 1 + 0.015 * (Lb - 50) ** 2 / np.sqrt(20 + (Lb - 50) ** 2)
    Sc, Sh = 1 + 0.045 * Cb, 1 + 0.015 * Cb * T
    Rt = -np.sin(np.radians(2 * dt)) * Rc
    return np.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh))


# Sharma, Wu and Dalal's test data: the implementation is checked before it is believed.
_check = ciede2000(np.array([50, 2.6772, -79.7751]), np.array([50, 0.0, -82.7485]))
assert abs(float(_check) - 2.0425) < 1e-3, _check

# The brand's colours as the frames draw them flat (aurixa-reel.css, the plates, NEW-REPORT-PAGES).
SWATCHES = {
    "ground #040B16 (the site's base-950)": "040B16",
    "report cover #251F18 (obsidian)": "251F18",
    "Command Centre selection #0832DE": "0832DE",
    "Command Centre page #0B0C15": "0B0C15",
    "caption white #FFFFFF": "FFFFFF",
}


def flat_mask(img, tol=1):
    """Pixels whose 3 x 3 neighbourhood is one colour (within tol): flat fields, not edges or texture."""
    a = img.astype(np.int16)
    lo = a.copy()
    hi = a.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            s = np.roll(np.roll(a, dy, 0), dx, 1)
            lo = np.minimum(lo, s)
            hi = np.maximum(hi, s)
    m = ((hi - lo) <= tol).all(-1)
    m[:1, :] = m[-1:, :] = False
    m[:, :1] = m[:, -1:] = False
    return m


# CIEDE2000 is gathered into a histogram as the frames go by (0.001 a bin, to 30), never held per pixel: a
# whole film's flat fields are hundreds of millions of values, and holding them ended the process.
DE_BIN = 0.001
DE_BINS = 30000


def colour(test, ref, decode_test, every=10):
    hist = np.zeros(DE_BINS + 1, np.int64)
    total, below_1, de_max = 0.0, 0, 0.0
    sw = {k: [[], []] for k in SWATCHES}
    for (i, t), (j, r) in zip(frames(test, decode_test, every), frames(ref, "format=rgb24", every)):
        assert i == j
        m = flat_mask(r)
        if not m.any():
            continue
        de = ciede2000(srgb_to_lab(r[m].astype(float)), srgb_to_lab(t[m].astype(float)))
        hist += np.bincount(np.minimum((de / DE_BIN).astype(np.int64), DE_BINS), minlength=DE_BINS + 1)
        total += float(de.sum())
        below_1 += int((de < 1).sum())
        de_max = max(de_max, float(de.max()))
        for name, hexv in SWATCHES.items():
            c = np.array([int(hexv[k:k + 2], 16) for k in (0, 2, 4)])
            hit = m & (np.abs(r.astype(int) - c).max(-1) <= 1)
            if hit.sum() >= 50:
                sw[name][0].append(r[hit].astype(float).mean(0))
                sw[name][1].append(t[hit].astype(float).mean(0))
    count = int(hist.sum())
    p99 = (int(np.searchsorted(np.cumsum(hist), 0.99 * count)) + 0.5) * DE_BIN
    swatches = {}
    for name, (rs, ts) in sw.items():
        if not rs:
            continue
        rr, tt = np.mean(rs, 0), np.mean(ts, 0)
        swatches[name] = {
            "reference": "#" + "".join(f"{round(v):02X}" for v in rr),
            "master": "#" + "".join(f"{round(v):02X}" for v in tt),
            "delta_e_2000": round(float(ciede2000(srgb_to_lab(rr), srgb_to_lab(tt))), 3),
            "frames": len(rs),
        }
    return {
        "flat_pixels": count,
        "delta_e_2000": {"mean": round(total / count, 3), "p99": round(p99, 3), "max": round(de_max, 3),
                         "share_below_1": round(below_1 / count, 5)},
        "swatches": swatches,
    }


def luma(img):
    return img.astype(float) @ np.array([0.2126, 0.7152, 0.0722])


def gradient(y):
    gx = np.zeros_like(y)
    gy = np.zeros_like(y)
    gx[:, 1:-1] = (y[:, 2:] - y[:, :-2]) / 2
    gy[1:-1, :] = (y[2:, :] - y[:-2, :]) / 2
    return np.hypot(gx, gy)


def edge_keep(test_y, ref_y, strong=24.0):
    """How much of the reference's edge contrast the test keeps, at the reference's strong edges (text,
    rules, borders): 1.0 is nothing softened. Dither and grain don't count, being far below `strong`."""
    gr = gradient(ref_y)
    m = gr >= strong
    if not m.any():
        return None  # a frame with no strong edge (the night before the logo) says nothing about sharpness
    return float(gradient(test_y)[m].mean() / gr[m].mean())


def timing(test, ref, decode_test, log, cuts):
    """Captions where film.json puts them; each hard cut on its frame; the picture as sharp as its source."""
    zone = slice(1300, 1560)
    expect = [bool(f["caption"]) for f in log["frames"]]
    seen = []
    diffs = []
    prev = None
    keep = []
    psnr = []
    for (i, t), (_, r) in zip(frames(test, decode_test), frames(ref, "format=rgb24")):
        y = luma(t)
        # A caption is type: strong edges in the caption zone, on the glass panel or the white card alike (a
        # panel's own border and an empty panel have few). Measured as the share of the zone's pixels on an
        # edge of type's contrast.
        seen.append(float((gradient(y[zone, 60:1020]) >= 40).mean()))
        yr = luma(r)
        # The picture's change from the frame before, outside the captions (a caption's change is its own).
        if prev is not None:
            diffs.append(float(np.concatenate([np.abs(yr - prev)[:1300], np.abs(yr - prev)[1560:]]).mean()))
        prev = yr
        mse = float(((t.astype(float) - r.astype(float)) ** 2).mean())
        psnr.append(99.0 if mse == 0 else 10 * math.log10(255 ** 2 / mse))
        if i % 10 == 0 and (k := edge_keep(y, yr)) is not None:
            keep.append(k)
    # The threshold between "words on screen" and "none" is read from the film itself: midway (geometrically)
    # between the median edge share of the frames that should carry words and of those that should not. A frame
    # within 4 frames of a change in what should be on screen is a transition and is not judged.
    n = min(len(seen), len(expect))
    # Before the captions' first frame and after their last the zone is the composition's own (the closing card
    # sets its type there), so only the captions' span is judged.
    spoken = [k for k in range(n) if expect[k]]
    lo, hi = (spoken[0], spoken[-1]) if spoken else (0, -1)
    on = [seen[k] for k in range(n) if expect[k]]
    off = [seen[k] for k in range(lo, hi + 1) if not expect[k]]
    edge_on = float(np.median(on)) if on else 0.0
    edge_off = float(np.median(off)) if off else 0.0
    threshold = math.sqrt(max(edge_on, 1e-6) * max(edge_off, 1e-6))
    steady = [k for k in range(lo, hi + 1) if all(expect[j] == expect[k] for j in range(max(0, k - 4), min(n, k + 5)))]
    mismatched = [log["frames"][k]["frame"] for k in steady if (seen[k] > threshold) != expect[k]]
    # Every shot boundary, judged by the picture: a cut is the one frame in its neighbourhood (+/- 6 frames)
    # where the picture changes most, and changes a lot (the change into frame c is diffs[c - 1]); a boundary
    # the film carries through in one move changes no more than its neighbours. A large change anywhere else
    # in the neighbourhood is a cut that missed its frame.
    cut_report = []
    for c in cuts:
        if c < 1 or c > len(diffs):
            continue
        near = {k: diffs[k - 1] for k in range(max(1, c - 6), min(len(diffs), c + 6) + 1)}
        others = sorted(v for k, v in near.items() if k != c)
        top = max(near, key=near.get)
        kind = ("cut" if top == c and diffs[c - 1] > 4 * others[-1] else
                "missed its frame" if near[top] > 8 and near[top] > 4 * sorted(near.values())[-2] else "carried through")
        cut_report.append({"frame": c + log["from"], "change": round(diffs[c - 1], 2),
                           "next_largest_nearby": round(others[-1], 2), "reads_as": kind})
    worst = int(np.argmin(psnr))
    return {
        "frames_checked": len(seen),
        "caption_frames_expected": int(sum(expect)),
        "caption_edge_share": {"with_words_median": round(edge_on, 4), "without_median": round(edge_off, 4),
                               "threshold": round(threshold, 4), "steady_frames_judged": len(steady)},
        "caption_mismatches": mismatched,
        "cuts": cut_report,
        "psnr_by_frame_db": {"mean": round(float(np.mean(psnr)), 2), "min": round(psnr[worst], 2), "worst_frame_index": worst},
        "edges_kept": {"frames": len(keep), "min": round(min(keep), 4), "mean": round(float(np.mean(keep)), 4)},
    }


def banding(test, ref, decode_test, index, out):
    """The ground's glow on one frame: a 12x contrast stretch of both, and the smoothed profiles' worst gap."""
    t = next(frames(test, decode_test, 1, index))[1]
    r = next(frames(ref, "format=rgb24", 1, index))[1]
    # Above the logo, inside the ground's radial glow: the film's smoothest gradient, and its darkest.
    box = (slice(120, 480), slice(0, W))
    yt, yr = luma(t[box]), luma(r[box])
    prof_t, prof_r = yt.mean(1), yr.mean(1)
    lo = min(yr.min(), yt.min())
    stretch = lambda y: np.clip((y - lo) * 12, 0, 255).astype(np.uint8)
    both = np.concatenate([stretch(yr), np.full((8, W), 255, np.uint8), stretch(yt)], 0)
    Image.fromarray(both).save(out / "banding-glow-x12.png")
    return {"frame_index": index, "rows": "120-480", "profile_max_gap_code_values": round(float(np.abs(prof_t - prof_r).max()), 3),
            "crop": "banding-glow-x12.png"}


def crops(test, ref, decode_test, picks, out):
    names = []
    for index, (x, y, w, h), label in picks:
        t = next(frames(test, decode_test, 1, index))[1]
        r = next(frames(ref, "format=rgb24", 1, index))[1]
        a = Image.fromarray(r[y:y + h, x:x + w]).resize((w * 2, h * 2), Image.NEAREST)
        b = Image.fromarray(t[y:y + h, x:x + w]).resize((w * 2, h * 2), Image.NEAREST)
        sheet = Image.new("RGB", (w * 4 + 12, h * 2), (255, 0, 128))
        sheet.paste(a, (0, 0))
        sheet.paste(b, (w * 2 + 12, 0))
        name = f"crop-{label}.png"
        sheet.save(out / name)
        names.append(name)
    return names


def sound(test, voiceover, start, seconds):
    rate = 8000

    def pcm(args):
        raw = run(["ffmpeg", "-v", "error", *args, "-ac", "1", "-ar", str(rate), "-f", "f32le", "-"]).stdout
        return np.frombuffer(raw, np.float32)

    a = pcm(["-i", str(test)])
    b = pcm(["-ss", f"{start:.6f}", "-t", f"{seconds:.6f}", "-i", str(voiceover)])
    n = min(len(a), len(b))
    a, b = a[:n] - a[:n].mean(), b[:n] - b[:n].mean()
    lag = 400  # +/- 50 ms
    corr = [float(np.dot(a[max(0, k):n + min(0, k)], b[max(0, -k):n - max(0, k)])) for k in range(-lag, lag + 1)]
    best = int(np.argmax(corr)) - lag
    return {"offset_ms": round(best * 1000 / rate, 2), "audio_seconds": round(len(a) / rate, 3)}


def worker_export(film, out):
    """The studio's export of this one clip: media-worker/src/sequence.js's pass 1 and final pass, verbatim."""
    inter = out / "export-intermediate.mp4"
    final = out / "export-final.mp4"
    n = int(probe(film)["streams"][0]["nb_read_frames"])
    dur = n / 30
    run(["ffmpeg", "-y", "-v", "error", "-ss", "0", "-t", f"{dur + 0.25:.6f}", "-i", str(film),
         "-f", "lavfi", "-t", f"{dur:.6f}", "-i", "anullsrc=r=48000:cl=stereo",
         "-filter_complex",
         "[0:v]scale=trunc(iw*sar/2)*2:ih,setsar=1,setpts=PTS-STARTPTS,fps=30[paced];"
         "[paced]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(iw-ow)*0.5:(ih-oh)*0.5[framed];"
         f"[framed]setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration={dur + 1:.6f},trim=end_frame={n},setpts=PTS-STARTPTS[v];"
         f"[1:a]aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=end={dur:.6f},asetpts=PTS-STARTPTS[a]",
         "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "superfast", "-crf", "14", "-pix_fmt", "yuv420p",
         "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", "-frames:v", str(n), str(inter)])
    run(["ffmpeg", "-y", "-v", "error", "-i", str(inter),
         "-filter_complex", "[0:v]setpts=PTS-STARTPTS,format=yuv420p[vout]", "-map", "[vout]",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-profile:v", "high", "-pix_fmt", "yuv420p",
         "-r", "30", "-g", "60", "-movflags", "+faststart", "-t", f"{dur:.6f}", str(final)])
    inter.unlink()
    return final


def main():
    out_dir = Path(sys.argv[1])
    voiceover = sys.argv[sys.argv.index("--voiceover") + 1] if "--voiceover" in sys.argv else None
    film, ref = out_dir / "film.mp4", out_dir / "reference.mkv"
    log = json.loads((out_dir / "film.json").read_text())
    qc = out_dir / "qc"
    qc.mkdir(exist_ok=True)
    brief = json.loads((Path(__file__).parent / "../../docs/brands/aurixa-reel-1/system-edition/brief.json").read_text())
    fps = log["fps"]
    shots = [s for s in brief["shots"] if s["id"] in log["shots"]]
    # Every shot boundary inside the stretch: each is judged as a cut, or as carried through in one move.
    boundaries = sorted({round(s["in"] * fps) - log["from"] for s in shots} - {0})
    # The pictures looked at closely, at absolute frames; those outside the stretch are left out.
    inside = lambda f: log["from"] <= f < log["to"]
    glow = next((f for f in (796, 2990) if inside(f)), log["from"])
    picks = [(f - log["from"], box, label) for f, box, label in [
        (1072, (300, 820, 520, 300), "build-types-04.3"),
        (855, (150, 370, 780, 840), "logo-04.1"),
        (925, (160, 1360, 760, 140), "caption-04.1"),
        (1336, (60, 240, 960, 160), "rail-05.2"),
        (1351, (180, 760, 720, 480), "cover-05.2"),
        (1952, (80, 460, 960, 540), "report-08.2"),
        (2361, (180, 400, 720, 780), "trial-card-10.2"),
        (2924, (120, 1020, 840, 180), "phrase-14.1"),
        (3155, (160, 1160, 760, 480), "closing-card-15.1"),
    ] if inside(f)]

    p = probe(film)
    v = next(s for s in p["streams"] if s["codec_type"] == "video")
    a = next((s for s in p["streams"] if s["codec_type"] == "audio"), None)
    report = {
        "streams": {
            "video": {k: v.get(k) for k in ("codec_name", "profile", "level", "width", "height", "pix_fmt", "r_frame_rate",
                                             "nb_read_frames", "duration", "color_range", "color_space", "color_primaries",
                                             "color_transfer", "bit_rate")},
            "audio": {k: a.get(k) for k in ("codec_name", "sample_rate", "channels", "duration", "bit_rate")} if a else None,
            "frames_expected": log["to"] - log["from"],
            "size_mb": round(int(p["format"]["size"]) / 1e6, 2),
        },
        "fidelity": ssim_psnr(film, ref, TO_RGB),
        "colour": colour(film, ref, TO_RGB),
        "timing": timing(film, ref, TO_RGB, log, boundaries),
        "banding": banding(film, ref, TO_RGB, glow - log["from"], qc),
        "crops": crops(film, ref, TO_RGB, picks, qc),
    }
    if voiceover:
        report["sound"] = sound(film, voiceover, log["from"] / fps, (log["to"] - log["from"]) / fps)
    if "--export" in sys.argv:
        final = worker_export(film, qc)
        report["export"] = {
            "settings": "the Editor's export (media-worker/src/sequence.js): intermediate x264 superfast CRF 14, final x264 veryfast CRF 17, High, 4:2:0",
            "fidelity": ssim_psnr(final, ref, TO_RGB),
            "colour": colour(final, ref, TO_RGB),
            "size_mb": round(final.stat().st_size / 1e6, 2),
        }
    (qc / "qc.json").write_text(json.dumps(report, indent=1) + "\n")
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
