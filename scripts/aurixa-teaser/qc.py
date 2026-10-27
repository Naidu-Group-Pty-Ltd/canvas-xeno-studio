#!/usr/bin/env python3
"""Measures the teaser's delivery master (encode.sh) against the lossless reference it was made from (render.cjs).

  python3 -I scripts/aurixa-teaser/qc.py <master.mp4> <reference.mkv> <out.json> [frames] [fps]

[frames] is how many the film has: Three Questions' 1,125 unless given (As One's are 1,365, We Are Here's 1,092).
[fps] is its rate: 30 unless given (We Are Here's is 24).

  streams    what the file is: codec, profile, size, rate, colour tags, frame count, length, sound
  fidelity   the picture three ways, each over the film and at its worst frame:
               encoder  the master against the picture the encoder was given (the reference through encode.sh's own
                        conversion to BT.709 4:2:0 in the TV range), in that format: SSIM of Y, U and V
               master   the master decoded as a player decodes it, against the reference: SSIM of R, G and B, and PSNR
               ceiling  the reference through the same conversion and back, with no encoder: the most a master in
                        this format can score on the measure above
  sound      the master's loudness (EBU R128: integrated, range, true peak) as a player hears it, after AAC
  flicker    frames drawn apart from both neighbours (Reel 3's odd-one-out test: a frame that differs from each
             neighbour by more than 1.5 times what the neighbours differ by from each other, plus 200 pixels, at
             half size in grey, counting pixels that move more than 4 code values)
  black      any frame with nothing in it (FFmpeg's blackdetect)
Prints the summary and writes it whole to out.json; exits 1 if a measure is out of bounds.

Frames are paired by index, never by time stamp: the lossless reference (FFV1 in Matroska) keeps its time stamps in
milliseconds (0.033, 0.067, ...) where the master keeps them exact, and a comparison that pairs by time pairs some
frames with a neighbour, which reads as a large loss wherever the picture moves fast (As One read 0.946 at 12.27 s
paired by time; paired by index, none of its frames is below 0.994). Reel 2 taught the studio's own measures the same.

The picture is bounded on the encoder (SSIM 0.98 of the picture it was given) and on the colour tags, not on the
master against the RGB reference. The conversion to 8-bit 4:2:0 costs a dark film several hundredths there before any
encoder touches it: SSIM reads a change of a code value or two, in a colour channel near zero, as lost structure. As
One's ceiling is 0.958 (its red 0.890), where Three Questions' master scored 0.979.
"""
import json
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

MASTER, REF, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
FRAMES = int(sys.argv[4]) if len(sys.argv) > 4 else 1125
W, H = 540, 960
FPS = int(sys.argv[5]) if len(sys.argv) > 5 else 30
# Each input's frames numbered, so the comparing filters pair frame N with frame N.
BY_INDEX = f"settb=1/{FPS},setpts=N"
TO_RGB = "zscale=rangein=limited:matrixin=709:primariesin=709:transferin=709:range=full:primaries=709:transfer=709:filter=bilinear,format=gbrp"
# What the encoder is given: encode.sh's own conversion, read out of encode.sh so the two cannot drift apart.
TO_YUV = re.search(r'"\[0:v\](.+?)\[v\]"', (Path(__file__).resolve().parent / "encode.sh").read_text()).group(1)


def run(args):
    return subprocess.run(args, capture_output=True, text=True)


def compare(inputs, graph):
    """SSIM by plane over the film (FFmpeg's summary) and each frame's (its stats on stdout), for a graph whose ssim
    writes its stats to /dev/stdout; with PSNR's average where the graph has one."""
    r = run(["ffmpeg", "-hide_banner", "-nostats", *[a for i in inputs for a in ("-i", i)], "-filter_complex", graph,
             "-f", "null", "-"])
    planes = {k: float(v) for k, v in re.findall(r"(\w+):([\d.]+) \(", re.search(r"SSIM (.+)", r.stderr).group(1))}
    each = [float(x) for x in re.findall(r"n:\d+ .*?All:([\d.]+)", r.stdout)]
    worst = int(np.argmin(each))
    out = {"ssim": planes.pop("All"), "planes": planes, "worst_frame": worst, "worst_ssim": each[worst], "frames": len(each)}
    psnr = re.search(r"PSNR .*average:([\d.inf]+)", r.stderr)
    if psnr:
        out["psnr_db"] = float(psnr.group(1))
    return out


probe = json.loads(run(["ffprobe", "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", MASTER]).stdout)
v = next(s for s in probe["streams"] if s["codec_type"] == "video")
a = next(s for s in probe["streams"] if s["codec_type"] == "audio")
streams = {
    "video": {k: v.get(k) for k in ("codec_name", "profile", "width", "height", "pix_fmt", "r_frame_rate", "nb_read_frames",
                                     "color_range", "color_space", "color_primaries", "color_transfer")},
    "audio": {k: a.get(k) for k in ("codec_name", "sample_rate", "channels", "bit_rate")},
    "duration": float(probe["format"]["duration"]),
    "bytes": int(probe["format"]["size"]),
}

STATS = "ssim=stats_file=/dev/stdout"
GRAPHS = {
    "encoder": ([MASTER, REF], f"[1:v]{BY_INDEX},{TO_YUV}[c];[0:v]{BY_INDEX},format=yuv420p[m];[m][c]{STATS}"),
    "master": ([MASTER, REF], f"[0:v]{BY_INDEX},{TO_RGB},split[m][m2];[1:v]{BY_INDEX},format=gbrp,split[r][r2];[m][r]{STATS};[m2][r2]psnr"),
    "ceiling": ([REF], f"[0:v]format=gbrp,split[a][b];[a]{TO_YUV},{TO_RGB}[c];[c][b]{STATS}"),
}
with ThreadPoolExecutor(len(GRAPHS)) as pool:
    fidelity = dict(zip(GRAPHS, pool.map(lambda g: compare(*g), GRAPHS.values())))

summary = run(["ffmpeg", "-hide_banner", "-nostats", "-i", MASTER, "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr
summary = summary[summary.rindex("Summary:"):]
get = lambda label: float(re.search(label + r":\s+(-?[\d.]+)", summary).group(1))
sound = {"integrated_lufs": get("I"), "lra_lu": get("LRA"), "true_peak_dbtp": get("Peak")}

raw = subprocess.run(["ffmpeg", "-v", "error", "-i", REF, "-vf", f"scale={W}:{H}:flags=area,format=gray", "-f", "rawvideo", "-"],
                     capture_output=True, check=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.int16)
d = lambda i, j: int((np.abs(fr[i] - fr[j]) > 4).sum())
odd = [i for i in range(1, len(fr) - 1) if min(d(i - 1, i), d(i, i + 1)) > 1.5 * d(i - 1, i + 1) + 200]

black = re.findall(r"black_start:([\d.]+) black_end:([\d.]+)", run(["ffmpeg", "-hide_banner", "-nostats", "-i", MASTER, "-vf",
                   "blackdetect=d=0.05:pix_th=0.02", "-an", "-f", "null", "-"]).stderr)

report = {"streams": streams, "fidelity": fidelity, "sound": sound, "flicker_odd_frames": odd, "black": black}
problems = []
if streams["video"]["nb_read_frames"] != str(FRAMES):
    problems.append(f"{streams['video']['nb_read_frames']} frames, not {FRAMES}")
if abs(sound["integrated_lufs"] + 14) > 0.5:
    problems.append(f"loudness {sound['integrated_lufs']} LUFS")
if sound["true_peak_dbtp"] > -0.9:
    problems.append(f"true peak {sound['true_peak_dbtp']} dBTP")
if fidelity["encoder"]["ssim"] < 0.98:
    problems.append(f"the encoder kept SSIM {fidelity['encoder']['ssim']} of its picture")
tags = [streams["video"][k] for k in ("color_range", "color_space", "color_primaries", "color_transfer")]
if tags != ["tv", "bt709", "bt709", "bt709"]:
    problems.append(f"colour tags {tags}")
if black:
    problems.append(f"black stretches {black}")
report["problems"] = problems
open(OUT, "w").write(json.dumps(report, indent=1))
print(json.dumps({k: report[k] for k in ("fidelity", "sound", "flicker_odd_frames", "black", "problems")}))
print(json.dumps(streams))
sys.exit(1 if problems else 0)
