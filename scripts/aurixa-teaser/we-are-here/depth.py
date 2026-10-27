#!/usr/bin/env python3
"""Each keyframe's depth, for its camera to move through (camera.py): Depth Anything V2 (small, ONNX), relative
inverse depth aligned to the keyframe's edges by a guided filter, kept as a 16-bit PNG at 1080 x 1920 (near is bright).

  python3 -I depth.py <depth_anything_v2_vits.onnx> <out dir> <still.png> ...    # (needs numpy, OpenCV, onnxruntime)

The model is fabio-sim's export of Depth Anything V2 small (Apache 2.0), from its GitHub release:
  https://github.com/fabio-sim/Depth-Anything-ONNX/releases/download/v2.0.0/depth_anything_v2_vits.onnx
  sha256 d2b11a11c1d4a12b47608fa65a17ee9a4c605b55ee1730c8e3b526304f2562be
Hugging Face is closed to this environment; the release is the same weights. Check the hash before running it.
"""
import sys
from pathlib import Path
import numpy as np
import cv2
import onnxruntime as ort

model, out_dir, *stills = sys.argv[1:]
sess = ort.InferenceSession(model, providers=["CPUExecutionProvider"])
inp = sess.get_inputs()[0]
print("input", inp.name, inp.shape, file=sys.stderr)
size = 518
mean = np.array([0.485, 0.456, 0.406], np.float32)
std = np.array([0.229, 0.224, 0.225], np.float32)


def guided(I, p, r, eps):
    # He et al.'s guided filter, grey guide.
    mean = lambda x: cv2.boxFilter(x, -1, (r, r))
    mI, mp = mean(I), mean(p)
    a = (mean(I * p) - mI * mp) / (mean(I * I) - mI * mI + eps)
    b = mp - a * mI
    return mean(a) * I + mean(b)


for path in stills:
    img = cv2.imread(path, cv2.IMREAD_COLOR)[:, :, ::-1].astype(np.float32) / 255.0
    small = cv2.resize(img, (size, size), interpolation=cv2.INTER_AREA)
    x = ((small - mean) / std).transpose(2, 0, 1)[None].astype(np.float32)
    d = sess.run(None, {inp.name: x})[0].squeeze().astype(np.float32)
    d = cv2.resize(d, (1080, 1920), interpolation=cv2.INTER_CUBIC)
    d = (d - d.min()) / max(1e-6, d.max() - d.min())
    guide = cv2.cvtColor(cv2.resize(img, (1080, 1920), interpolation=cv2.INTER_AREA), cv2.COLOR_RGB2GRAY)
    d = np.clip(guided(guide, d, 9, 1e-3), 0, 1)
    out = Path(out_dir) / (Path(path).stem + "-depth.png")
    cv2.imwrite(str(out), (d * 65535).astype(np.uint16))
    print(out.name, round(float(d.mean()), 3))
