"""Replace single frames of a render.cjs film with frames drawn again, and encode the master again.

  RENDER_FRAMES=193,194,... node scripts/aurixa-reel-1/render.cjs <frames dir> <assets> <voiceover.wav> 01.1 15.1
  python3 scripts/aurixa-reel-1/replace_frames.py <render dir> <frames dir> <out dir> <voiceover.wav> ["why"]

A change that touches a few frames (a caption's timing) needs those frames drawn again, not two hours of film. The
reference is streamed frame by frame (lossless RGB in, lossless FFV1 out) with the new frames in their places, and
the master is encoded from it with render.cjs's own chain. film.json keeps its frames; a caller whose change moves
the captions writes their record again (captions.cjs's visibleAt), as render.cjs does.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

W, H, FPS = 1080, 1920, 30
FRAME = W * H * 3

src, patch, out, voiceover = (Path(a) for a in sys.argv[1:5])
why = sys.argv[5] if len(sys.argv) > 5 else "captions: a line clears before the next arrives"
out.mkdir(parents=True, exist_ok=True)
log = json.loads((src / "film.json").read_text())
f0, f1 = log["from"], log["to"]
new = {int(p.stem.split("-")[1]): p for p in patch.glob("frame-*.png")}

dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(src / "reference.mkv"), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                       stdout=subprocess.PIPE)
enc = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
                        "-i", "-", "-vf", "format=gbrp", "-c:v", "ffv1", "-level", "3", "-g", "1", str(out / "reference.mkv")],
                       stdin=subprocess.PIPE)
n, swapped = 0, 0
while True:
    buf = dec.stdout.read(FRAME)
    if len(buf) < FRAME:
        break
    f = f0 + n
    if f in new:
        img = np.asarray(Image.open(new[f]).convert("RGB"), np.uint8)
        assert img.shape == (H, W, 3), (f, img.shape)
        buf = img.tobytes()
        swapped += 1
    enc.stdin.write(buf)
    n += 1
enc.stdin.close()
assert enc.wait() == 0 and dec.wait() == 0
assert n == f1 - f0, (n, f1 - f0)
assert swapped == len(new), (swapped, len(new))

subprocess.run([
    "ffmpeg", "-y", "-loglevel", "error", "-i", str(out / "reference.mkv"),
    "-ss", str(f0 / FPS), "-t", str((f1 - f0) / FPS), "-i", str(voiceover),
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
], check=True)
log["patched"] = log.get("patched", []) + [{"frames": sorted(new), "why": why}]
(out / "film.json").write_text(json.dumps(log))
print(f"{n} frames, {swapped} replaced -> {out}")
