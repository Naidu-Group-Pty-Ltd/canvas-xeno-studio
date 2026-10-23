"""Puts a shot drawn again into the delivered master, when the film's lossless reference is gone.

  node scripts/aurixa-reel-1/render.cjs <render dir> <assets> "" 12.1 12.1      # the shot, drawn again
  python3 scripts/aurixa-reel-1/splice_shot.py <master.mp4> <render dir> <out dir> ["why"]

replace_frames.py streams the film's lossless reference; without it, the master is the only copy of every other
frame, and encoding all of it again would cost every frame a generation. So only the stretch between the master's
keyframes around the shot is encoded again, with render.cjs's own chain (zimg to BT.709 4:2:0 with error-diffusion
dither, x264 High CRF 12, aq-mode 3, GOP 60): the shot's frames from the new drawing (the render's reference.mkv,
lossless RGB), and any frames between a keyframe and the shot's cuts from the master as it decodes (a second
generation, and none where a keyframe falls on a cut). Every other packet, the audio's included, is copied from the
master as it is. The new stretch must carry the master's own parameter sets (the same encoder and settings), or the
splice is refused rather than written.

Writes film.mp4 and splice.json: the stretch encoded again, and each part measured against what it should be (the
frames outside the stretch and the audio identical to the master's, the rest by PSNR against its source).
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

FPS = 30
ZIMG = ("format=gbrp,zscale=rangein=full:primariesin=709:transferin=709:matrix=709:primaries=709:transfer=709:"
        "range=limited:dither=error_diffusion,format=yuv420p")
X264 = ["-c:v", "libx264", "-preset", "slow", "-crf", "12", "-profile:v", "high", "-level:v", "4.2",
        "-x264-params", "aq-mode=3:aq-strength=0.9", "-pix_fmt", "yuv420p",
        "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
        "-r", str(FPS), "-g", str(FPS * 2)]


def run(args, **kw):
    return subprocess.run(args, check=True, capture_output=True, **kw)


def probe(path, *args):
    return json.loads(run(["ffprobe", "-v", "error", *args, "-of", "json", str(path)]).stdout)


def keyframes(path):
    """The video's keyframes, as frame numbers in presentation order, and its frame count."""
    packets = probe(path, "-select_streams", "v:0", "-show_entries", "packet=pts,flags")["packets"]
    tb = probe(path, "-select_streams", "v:0", "-show_entries", "stream=time_base")["streams"][0]["time_base"]
    num, den = map(int, tb.split("/"))
    first = min(int(p["pts"]) for p in packets)
    frame = lambda p: round((int(p["pts"]) - first) * num * FPS / den)
    numbers = sorted(frame(p) for p in packets)
    if numbers != list(range(len(packets))):
        raise SystemExit(f"{path}: its packets aren't one frame each at {FPS} fps")
    return sorted(frame(p) for p in packets if "K" in p["flags"]), len(packets)


def parameter_sets(path):
    """The SPS and PPS a file's video decodes with (its avcC, as Annex B puts them before the first frame)."""
    data = run(["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:v:0", "-c", "copy", "-bsf:v", "h264_mp4toannexb",
                "-frames:v", "1", "-f", "h264", "-"]).stdout
    units = [u.lstrip(b"\x00") for u in data.split(b"\x00\x00\x01") if u]
    return [u.rstrip(b"\x00").hex() for u in units if u and u[0] & 0x1F in (7, 8)]


def x264_options(path):
    """x264's own record of its settings (its SEI), less the machine's thread counts."""
    data = run(["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:v:0", "-c", "copy", "-bsf:v", "h264_mp4toannexb",
                "-frames:v", "1", "-f", "h264", "-"]).stdout
    at = data.find(b"x264 - core")
    if at < 0:
        return None
    text = data[at:data.find(b"\x00", at)].decode("ascii", "replace")
    return " ".join(o for o in text.split() if not o.startswith(("threads=", "lookahead_threads=")))


def frames_of(args, w, h):
    """Raw 4:2:0 frames out of ffmpeg, one at a time."""
    size = w * h * 3 // 2
    proc = subprocess.Popen(["ffmpeg", "-v", "error", *args, "-f", "rawvideo", "-pix_fmt", "yuv420p", "-"],
                            stdout=subprocess.PIPE)
    while True:
        buf = proc.stdout.read(size)
        if len(buf) < size:
            break
        yield buf
    if proc.wait() != 0:
        raise SystemExit(f"ffmpeg {' '.join(args)} failed")


def decoded(path, a, b, w, h):
    """Frames a to b - 1 of a file, as it decodes."""
    if a >= b:
        return iter(())
    return frames_of(["-i", str(path), "-vf", f"select='between(n\\,{a}\\,{b - 1})'", "-fps_mode", "passthrough"], w, h)


def psnr(x, y, w, h):
    """PSNR of the luma, in dB (inf where identical)."""
    a = np.frombuffer(x, np.uint8, w * h).astype(np.float64)
    b = np.frombuffer(y, np.uint8, w * h).astype(np.float64)
    mse = np.mean((a - b) ** 2)
    return float("inf") if mse == 0 else 10 * np.log10(255 ** 2 / mse)


def summary(values):
    finite = [v for v in values if v != float("inf")]
    return {"frames": len(values), "identical": len(values) - len(finite),
            "min_db": round(min(finite), 2) if finite else None, "mean_db": round(sum(finite) / len(finite), 2) if finite else None}


def main():
    master, render, out = (Path(a) for a in sys.argv[1:4])
    why = sys.argv[4] if len(sys.argv) > 4 else "a shot drawn again"
    out.mkdir(parents=True, exist_ok=True)
    work = out / "work"
    work.mkdir(exist_ok=True)

    info = probe(master, "-show_streams", "-show_format")
    video = next(s for s in info["streams"] if s["codec_type"] == "video")
    audio = [s for s in info["streams"] if s["codec_type"] == "audio"]
    w, h = video["width"], video["height"]
    if video["codec_name"] != "h264" or video["pix_fmt"] != "yuv420p" or video["avg_frame_rate"] != f"{FPS}/1":
        raise SystemExit(f"{master}: not an H.264 4:2:0 master at {FPS} fps")
    log = json.loads((render / "film.json").read_text())
    frm, to = log["from"], log["to"]
    keys, total = keyframes(master)
    if to > total:
        raise SystemExit(f"The render draws frames {frm} to {to}, past the master's {total}")
    k1 = max(k for k in keys if k <= frm)
    k2 = min([k for k in keys if k >= to] or [total])
    print(f"master: {total} frames, {len(keys)} keyframes; shot {frm}-{to - 1}; encoded again {k1}-{k2 - 1}")

    # The stretch, encoded again: the master's frames before and after the shot as they decode, the shot's from the render.
    middle = work / "middle.mp4"
    # Raw frames carry no pixel aspect, and x264 writes one into the parameter sets only when it is given one.
    sar = video.get("sample_aspect_ratio", "0:1")
    enc = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "yuv420p", "-s", f"{w}x{h}",
                            "-r", str(FPS), "-i", "-", *([] if sar in ("0:1", "N/A") else ["-vf", f"setsar={sar}"]),
                            *X264, str(middle)], stdin=subprocess.PIPE)
    sources = {"before": decoded(master, k1, frm, w, h),
               "shot": frames_of(["-i", str(render / "reference.mkv"), "-vf", ZIMG, "-fps_mode", "passthrough"], w, h),
               "after": decoded(master, to, k2, w, h)}
    counts = {}
    inputs = work / "stretch-in.yuv"  # what the encoder was given, to measure the encode against
    with open(inputs, "wb") as kept:
        for name, frames in sources.items():
            counts[name] = 0
            for buf in frames:
                enc.stdin.write(buf)
                kept.write(buf)
                counts[name] += 1
    enc.stdin.close()
    if enc.wait() != 0:
        raise SystemExit("x264 failed on the stretch")
    expected = {"before": frm - k1, "shot": to - frm, "after": k2 - to}
    if counts != expected:
        raise SystemExit(f"Frames given {counts}, expected {expected}")
    if parameter_sets(middle) != parameter_sets(master):
        raise SystemExit("The stretch's parameter sets differ from the master's (another encoder or setting): refused")
    options = {"master": x264_options(master), "stretch": x264_options(middle)}

    # The master's packets before and after the stretch, as they are; the stretch between them.
    cuts = [k for k in (k1, k2) if 0 < k < total]
    segments = work / "part%d.mp4"
    for old in work.glob("part*.mp4"):
        old.unlink()
    run(["ffmpeg", "-y", "-v", "error", "-i", str(master), "-map", "0:v:0", "-c", "copy", "-f", "segment",
         *(["-segment_frames", ",".join(map(str, cuts))] if cuts else ["-segment_time", "100000"]),
         "-reset_timestamps", "1", "-segment_format", "mp4", str(segments)])
    parts = sorted(work.glob("part*.mp4"), key=lambda p: int(p.stem[4:]))
    lengths = [keyframes(p)[1] for p in parts]
    bounds = [0, *cuts, total]
    if lengths != [b - a for a, b in zip(bounds, bounds[1:])]:
        raise SystemExit(f"The master split into {lengths} frames, not at {bounds}")
    chosen = [middle if a == k1 else p for p, a in zip(parts, bounds)]
    listing = work / "parts.txt"
    listing.write_text("".join(f"file '{p.resolve()}'\n" for p in chosen))
    film = out / "film.mp4"
    run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(listing), "-i", str(master),
         "-map", "0:v:0", *(["-map", "1:a:0"] if audio else []), "-c", "copy", "-movflags", "+faststart", str(film)])

    # Measured: the frames outside the stretch and the audio as the master's; the stretch against what it was given.
    keys_out, total_out = keyframes(film)
    if total_out != total:
        raise SystemExit(f"The spliced film has {total_out} frames, the master {total}")
    md5 = lambda p, a, b: [l.split(",")[-1].strip() for l in run(
        ["ffmpeg", "-v", "error", "-i", str(p), "-map", "0:v:0", "-vf", f"select='between(n\\,{a}\\,{b - 1})'",
         "-fps_mode", "passthrough", "-f", "framemd5", "-"], text=True).stdout.splitlines() if l and not l.startswith("#")]
    untouched = {"head": [0, k1], "tail": [k2, total]}
    same = {name: md5(film, a, b) == md5(master, a, b) for name, (a, b) in untouched.items() if a < b}
    sound = (lambda p: run(["ffmpeg", "-v", "error", "-i", str(p), "-map", "0:a:0", "-c", "copy", "-f", "framemd5", "-"],
                           text=True).stdout.split("\n", 8)[-1])
    audio_same = sound(film) == sound(master) if audio else None
    size = w * h * 3 // 2
    given = open(inputs, "rb")
    measured = {"before": [], "shot": [], "after": []}
    for i, buf in enumerate(decoded(film, k1, k2, w, h)):
        f = k1 + i
        part = "before" if f < frm else "shot" if f < to else "after"
        measured[part].append(psnr(buf, given.read(size), w, h))
    given.close()
    record = {
        "master": str(master), "render": str(render), "why": why, "frames": total, "shot": [frm, to],
        "encoded_again": [k1, k2], "master_keyframes_near": [k for k in keys if k1 - 120 <= k <= k2 + 120],
        "untouched_identical": same, "audio_identical": audio_same,
        "stretch_psnr_vs_its_source": {k: summary(v) for k, v in measured.items() if v},
        "x264": options, "parameter_sets_identical": True,
    }
    (out / "splice.json").write_text(json.dumps(record, indent=1) + "\n")
    inputs.unlink()
    print(json.dumps(record, indent=1))
    if not all(same.values()) or audio_same is False:
        raise SystemExit("The splice changed frames or sound it should have copied")


if __name__ == "__main__":
    main()
