"""Joins renders of consecutive stretches of Reel 1 into the film, and encodes its master with the soundtrack.

python3 assemble.py <out dir> <soundtrack.wav> <render dir> [<render dir> ...] [--partial]

Each render dir is a render.cjs output for a run of shots (reference.mkv: lossless RGB at 30 fps; film.json: its
frames). Together they must cover the film from its first frame to its last, each starting where the one before
ends. Their references are joined frame for frame (FFV1, lossless, nothing re-drawn), the master is encoded from
the join with render.cjs's own chain (zimg to BT.709 4:2:0 with error-diffusion dither, x264 High CRF 12, aq-mode
3) and the soundtrack laid under it from the film's first frame, and their records are merged into film.json.
A stretch can so be drawn as soon as its scenes are final, and drawn again on its own.
"""
import json
import subprocess
import sys
from pathlib import Path

FPS = 30


def run(args):
    subprocess.run(args, check=True)


out, soundtrack, *parts = [a for a in sys.argv[1:] if not a.startswith("--")]
out, soundtrack, parts = Path(out), Path(soundtrack), [Path(p) for p in parts]
out.mkdir(parents=True, exist_ok=True)
logs = [json.loads((p / "film.json").read_text()) for p in parts]
order = sorted(range(len(parts)), key=lambda i: logs[i]["from"])
parts, logs = [parts[i] for i in order], [logs[i] for i in order]
start = logs[0]["from"]
if start != 0 and "--partial" not in sys.argv:
    raise SystemExit(f"The first stretch starts at frame {start}, not 0 (--partial joins a stretch of the film)")
for a, b in zip(logs, logs[1:]):
    if b["from"] != a["to"]:
        raise SystemExit(f"A stretch ends at frame {a['to']} but the next starts at {b['from']}")
for p, log in zip(parts, logs):
    n = int(subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries",
                            "stream=nb_read_frames", "-of", "csv=p=0", str(p / "reference.mkv")],
                           capture_output=True, text=True, check=True).stdout.strip())
    if n != log["to"] - log["from"]:
        raise SystemExit(f"{p}: its reference holds {n} frames, its record {log['to'] - log['from']}")
total = logs[-1]["to"]

# The reference: every stretch's frames in order, still lossless.
listing = out / "parts.txt"
listing.write_text("".join(f"file '{(p / 'reference.mkv').resolve()}'\n" for p in parts))
run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(listing),
     "-c", "copy", str(out / "reference.mkv")])

# The master, as render.cjs encodes it, with the soundtrack from the first frame.
run([
    "ffmpeg", "-y", "-loglevel", "error", "-i", str(out / "reference.mkv"),
    "-ss", str(start / FPS), "-t", str((total - start) / FPS), "-i", str(soundtrack),
    "-filter_complex",
    "[0:v]format=gbrp,zscale=rangein=full:primariesin=709:transferin=709:matrix=709:primaries=709:transfer=709:"
    "range=limited:dither=error_diffusion,format=yuv420p[master]",
    "-map", "[master]", "-map", "1:a",
    "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-profile:v", "high", "-level:v", "4.2",
    "-x264-params", "aq-mode=3:aq-strength=0.9", "-pix_fmt", "yuv420p",
    "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-r", str(FPS), "-g", str(FPS * 2),
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart",
    str(out / "film.mp4"),
])

merged = dict(logs[0])
merged["from"], merged["to"] = start, total
merged["frames"] = [f for log in logs for f in log["frames"]]
merged["shots"] = [s for log in logs for s in log["shots"]]
merged["measures"] = {k: v for log in logs for k, v in log.get("measures", {}).items()}
merged["drawings"] = sum(log.get("drawings", 0) for log in logs)
# Reel 2's renderer records how its drawings settled; the film's record is every stretch's.
if any("settle" in log for log in logs):
    settles = [log.get("settle", {}) for log in logs]
    captures = sum(s.get("captures") or 0 for s in settles)
    merged["settle"] = {
        "on": all(s.get("on", False) for s in settles),
        "frames_retried": sum(s.get("frames_retried", 0) for s in settles),
        "retried": {k: v for s in settles for k, v in s.get("retried", {}).items()},
        "unsettled": [f for s in settles for f in s.get("unsettled", [])],
        "captures": captures,
        "capture_ms_mean": round(sum((s.get("captures") or 0) * (s.get("capture_ms_mean") or 0) for s in settles) / captures)
        if captures else None,
    }
# Reel 2's stretches are each verified by agreement (verify_run.py), and some drawn by another session's machine.
if any("verified" in log for log in logs):
    merged["verified"] = [{"from": log["from"], "to": log["to"],
                           **{k: log["verified"].get(k) for k in ("against", "disagreed", "run_stands",
                                                                  "replaced_by_agreement", "unresolved")}}
                          for log in logs if "verified" in log]
merged.pop("drawn_by", None)
merged["assembled"] = [{"dir": str(p), "from": log["from"], "to": log["to"], "shots": log["shots"],
                        **({"drawn_by": log["drawn_by"]} if "drawn_by" in log else {})} for p, log in zip(parts, logs)]
merged["soundtrack"] = str(soundtrack)
(out / "film.json").write_text(json.dumps(merged) + "\n")
print(f"{len(parts)} stretches, frames {start} to {total} ({(total - start) / FPS:.3f} s) -> {out / 'film.mp4'}")
