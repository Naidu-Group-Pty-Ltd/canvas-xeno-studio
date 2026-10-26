#!/usr/bin/env python3
"""Measures the teaser's delivery master (encode.sh) against the lossless reference it was made from (render.cjs).

  python3 -I scripts/aurixa-teaser/qc.py <master.mp4> <reference.mkv> <out.json> [frames]

[frames] is how many the film has: Three Questions' 1,125 unless given (As One's are 1,365).

  streams    what the file is: codec, profile, size, rate, colour tags, frame count, length, sound
  fidelity   SSIM and PSNR of the master, decoded as a player decodes it, against the reference: whole film and
             its worst frame
  sound      the master's loudness (EBU R128: integrated, range, true peak) as a player hears it, after AAC
  flicker    frames drawn apart from both neighbours (Reel 3's odd-one-out test: a frame that differs from each
             neighbour by more than 1.5 times what the neighbours differ by from each other, plus 200 pixels, at
             half size in grey, counting pixels that move more than 4 code values)
  black      any frame with nothing in it (FFmpeg's blackdetect)
Prints the summary and writes it whole to out.json; exits 1 if a measure is out of bounds.
"""
import json
import re
import subprocess
import sys

import numpy as np

MASTER, REF, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
FRAMES = int(sys.argv[4]) if len(sys.argv) > 4 else 1125
W, H = 540, 960
TO_RGB = "zscale=rangein=limited:matrixin=709:primariesin=709:transferin=709:range=full:primaries=709:transfer=709:filter=bilinear,format=gbrp"


def run(args):
    return subprocess.run(args, capture_output=True, text=True)


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

err = run(["ffmpeg", "-hide_banner", "-nostats", "-i", MASTER, "-i", REF, "-filter_complex",
           f"[0:v]{TO_RGB}[m];[1:v]format=gbrp[r];[m][r]ssim=stats_file=-;[0:v]{TO_RGB}[m2];[1:v]format=gbrp[r2];[m2][r2]psnr",
           "-f", "null", "-"]).stderr
ssim_all = float(re.search(r"SSIM .*All:([\d.]+)", err).group(1))
psnr_avg = float(re.search(r"PSNR .*average:([\d.inf]+)", err).group(1))
per_frame = [float(x) for x in re.findall(r"n:\d+ .*?All:([\d.]+)", run(["ffmpeg", "-hide_banner", "-nostats", "-i", MASTER, "-i", REF,
             "-filter_complex", f"[0:v]{TO_RGB}[m];[1:v]format=gbrp[r];[m][r]ssim=stats_file=/dev/stdout", "-f", "null", "-"]).stdout)]
worst = int(np.argmin(per_frame)) if per_frame else None
fidelity = {"ssim": ssim_all, "psnr_db": psnr_avg, "worst_frame": worst, "worst_ssim": per_frame[worst] if per_frame else None}

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
if fidelity["ssim"] < 0.97:
    problems.append(f"SSIM {fidelity['ssim']}")
if black:
    problems.append(f"black stretches {black}")
report["problems"] = problems
open(OUT, "w").write(json.dumps(report, indent=1))
print(json.dumps({k: report[k] for k in ("fidelity", "sound", "flicker_odd_frames", "black", "problems")}))
print(json.dumps(streams))
sys.exit(1 if problems else 0)
