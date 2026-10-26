"""Reads every word on screen in the reference, every Nth frame, upscaled 2x: each line's text, box and confidence."""
import json, subprocess, sys
from concurrent.futures import ProcessPoolExecutor
import numpy as np
ref, step, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
W, H, K = 478, 850, 2
def frames():
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", ref, "-vf",
                          f"select=not(mod(n\\,{step})),scale={W*K}:{H*K}:flags=lanczos", "-vsync", "0",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    n = 0
    while True:
        buf = p.stdout.read(W * K * H * K * 3)
        if len(buf) < W * K * H * K * 3: break
        yield n * step, np.frombuffer(buf, np.uint8).reshape(H * K, W * K, 3)
        n += 1
_ocr = None
def read(item):
    global _ocr
    f, img = item
    if _ocr is None:
        from rapidocr_onnxruntime import RapidOCR
        _ocr = RapidOCR()
    res, _ = _ocr(img)
    return f, [{"text": r[1], "conf": round(float(r[2]), 3),
                "box": [[round(float(x) / K, 1), round(float(y) / K, 1)] for x, y in r[0]]} for r in (res or [])]
report = {}
with ProcessPoolExecutor(4) as pool:
    for f, lines in pool.map(read, frames(), chunksize=2):
        report[f] = lines
        if lines: print(f"{f/30:6.2f}s", " | ".join(f"{l['text']} ({l['conf']})" for l in lines), flush=True)
json.dump(report, open(out, "w"), indent=1)
print("read", len(report), "frames")
