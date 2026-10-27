#!/usr/bin/env python3
"""We Are Here's pictures, shot by shot: each shot's frames as edit.json frames them, at 1080 x 1920, from its 4K
take or, until the take is in, from its 4K keyframe moved through its depth. Each is graded to the brand's look and
kept as plates/<shot>.mkv (x264 at CRF 4, 4:4:4: as good as lossless to the eye, a tenth of the size).

  python3 -I plates.py <work files dir> [shot ...]        # (needs numpy and OpenCV)

A still's camera (camera.py): every output pixel looks up its source through the camera's zoom, centre and turn,
then moves out from the centre as far as its nearness to the lens allows (the dolly) and across as far as the
camera's sideways move gives it (the truck), looked up twice so near and far agree. The picture is drawn at twice
the frame's size and scaled down, so its edges stay clean; where the camera moves fast (blur > 1), each frame is the
average of its moments over a half-frame shutter. A still also gets what a take has of its own: its small lights
breathe, and over the night's mist and the morning's a little haze drifts.

A shot's masks (masks/<shot>-<name>.png, from masks.py: its lights, its streets, a screen) are moved with its
picture and kept beside it (plates/<shot>-<name>.mkv, 16-bit), for light.py to light. Its named points, and a take's
tracked ones (track.py), are kept frame by frame in plates/<shot>.json, where the picture puts them.
"""
import json
import math
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))  # run with -I: camera.py is beside it
from camera import FPS, H, W, StillCamera, TakeCamera  # noqa: E402

SS = 2  # drawn at twice the size, then scaled down


def srgb_to_lin(x):
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(x):
    x = np.clip(x, 0, None)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


NAVY = np.array([0x08, 0x16, 0x29], np.float32) / 255
GOLD = np.array([0xF5, 0xD1, 0x7A], np.float32) / 255


def grade(img, look):
    """The brand's look over a picture in [0, 1] (sRGB): exposure, contrast about the middle, saturation, then the
    deepest shadows drawn toward navy and the brightest highlights warmed toward gold, a little."""
    exposure = look.get("exposure", 0.0)
    contrast = look.get("contrast", 1.0)
    saturation = look.get("saturation", 1.0)
    x = img
    if exposure:
        x = lin_to_srgb(srgb_to_lin(x) * (2.0 ** exposure))
    lum = x @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    if saturation != 1.0:
        x = lum[..., None] + (x - lum[..., None]) * saturation
    if contrast != 1.0:
        # An S about 0.4, so the night stays rich and the lights keep their glow.
        x = np.clip(x, 0, 1)
        x = np.where(x < 0.4, 0.4 * (x / 0.4) ** contrast, 1 - 0.6 * ((1 - x) / 0.6) ** contrast)
    shadow = np.clip(1 - lum / 0.18, 0, 1)[..., None] ** 2
    light = np.clip((lum - 0.72) / 0.28, 0, 1)[..., None] ** 2
    x = x * (1 - 0.18 * shadow) + NAVY * 0.18 * shadow
    x = x * (1 - 0.06 * light) + GOLD * 0.06 * light
    return np.clip(x, 0, 1).astype(np.float32)


class Haze:
    """A tileable field of soft noise that drifts, for the night's and the sky's haze over a still."""

    def __init__(self, seed=7, size=1024):
        rng = np.random.default_rng(seed)
        field = np.zeros((size, size), np.float32)
        for octave, amp in ((8, 0.5), (16, 0.25), (32, 0.13), (64, 0.07)):
            small = rng.random((octave, octave)).astype(np.float32)
            field += amp * cv2.resize(np.tile(small, (3, 3)), (size * 3, size * 3), interpolation=cv2.INTER_CUBIC)[size:2 * size, size:2 * size]
        field = (field - field.min()) / (field.max() - field.min())
        self.field = np.tile(field, (2, 2))
        self.size = size

    def at(self, t, w, h, speed=(14.0, -6.0), scale=1.0):
        ox = int(t * speed[0]) % self.size
        oy = int(t * speed[1]) % self.size
        crop = self.field[oy:oy + self.size, ox:ox + self.size]
        return cv2.resize(crop, (w, h), interpolation=cv2.INTER_LINEAR)


def still_frames(shot, n0, n1, masks=()):
    """A still moved through its depth (camera.StillCamera): yields (frame, picture, masks) for frames n0..n1-1 of
    the shot, each mask (masks/<shot>-<name>.png) moved with the picture."""
    src = cv2.imread(shot["still"], cv2.IMREAD_COLOR)[:, :, ::-1].astype(np.float32) / 255
    hs, ws = src.shape[:2]
    cam = StillCamera(shot, src_size=(ws, hs))
    ow, oh = W * SS, H * SS
    lum = src @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    # The small bright lights (a city's windows and streetlights), to breathe.
    lights = np.clip((lum - cv2.GaussianBlur(lum, (0, 0), 6) - 0.08) / 0.2, 0, 1)
    rng = np.random.default_rng(abs(hash(shot["key"])) % (2 ** 32))
    phase = cv2.resize(rng.random((96, 54)).astype(np.float32), (ws, hs), interpolation=cv2.INTER_NEAREST) * 6.283
    rate = cv2.resize(rng.random((96, 54)).astype(np.float32), (ws, hs), interpolation=cv2.INTER_NEAREST) * 2.5 + 0.8
    # Haze only where the air holds some: the night's mist and the morning's (a clear sky would read it as noise).
    haze = Haze(seed=abs(hash(shot["key"])) % 1000) if shot["key"] in ("night-air", "rise") else None
    mask_src = {m: cv2.imread(str(Path(shot["still"]).parent.parent / "masks" / f"{shot['key']}-{m}.png"),
                              cv2.IMREAD_UNCHANGED).astype(np.float32) / 65535 for m in masks}
    blur = shot.get("blur", 1)
    for n in range(n0, n1):
        t = n / FPS
        acc = None
        # A moving camera's frame is the average of its moments over a half-frame shutter (blur > 1).
        for j in range(blur):
            nn = n if blur == 1 else n + ((j + 0.5) / blur - 0.5) * 0.5
            sx, sy = cam.source_of(nn, ow, oh)
            img = cv2.remap(src, sx, sy, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
            acc = img if acc is None else acc + img
        img = acc / blur
        lit = cv2.remap(lights, sx, sy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        ph = cv2.remap(phase, sx, sy, cv2.INTER_NEAREST, borderMode=cv2.BORDER_REFLECT)
        rt = cv2.remap(rate, sx, sy, cv2.INTER_NEAREST, borderMode=cv2.BORDER_REFLECT)
        img = img * (1 + 0.22 * lit * np.sin(t * rt * 2.2 + ph))[..., None]
        if haze is not None:
            field = haze.at(t, ow, oh)
            img = img + (field ** 2.2)[..., None] * (np.array([0.55, 0.62, 0.75], np.float32) * 0.04)
        img = cv2.resize(np.clip(img, 0, 1), (W, H), interpolation=cv2.INTER_AREA)
        moved = {m: cv2.resize(cv2.remap(v, sx, sy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT), (W, H),
                               interpolation=cv2.INTER_AREA) for m, v in mask_src.items()}
        yield n, img, moved


def take_frames(shot, n0, n1):
    """A 4K take, retimed and framed (camera.TakeCamera): yields (frame, picture, {}) for frames n0..n1-1."""
    cam = TakeCamera(shot)
    ws, hs, total = cam.ws, cam.hs, cam.total
    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", shot["clip"], "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                           stdout=subprocess.PIPE)
    size = ws * hs * 3
    cache = {}
    read = -1

    def frame(i):
        nonlocal read
        i = min(max(i, 0), total - 1)
        while read < i:
            buf = dec.stdout.read(size)
            if len(buf) < size:
                break
            read += 1
            cache[read] = np.frombuffer(buf, np.uint8).reshape(hs, ws, 3)
            for old in [k for k in cache if k < read - 2]:
                del cache[old]
        return cache[min(i, read)].astype(np.float32) / 255

    for n in range(n0, n1):
        fi = cam.take_frame(n)
        i0 = int(math.floor(fi))
        u = fi - i0
        img = frame(i0) if u < 0.02 else frame(i0) * (1 - u) + frame(i0 + 1) * u
        m = cam.matrix(n)
        scale = math.hypot(m[0, 0], m[0, 1])
        if scale < 0.75:
            # Down to a quarter of the take's size: an area resample first, then the move, so nothing aliases.
            pre = cv2.resize(img, (ws // 2, hs // 2), interpolation=cv2.INTER_AREA)
            m2 = m.copy()
            m2[:, :2] *= 2
            out = cv2.warpAffine(pre, m2, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
        else:
            out = cv2.warpAffine(img, m, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
        yield n, np.clip(out, 0, 1), {}
    dec.stdout.close()
    dec.wait()


def anchors(shot, root):
    """Where each of the shot's points is in the frame, frame by frame: its still's named points through the camera,
    or its take's tracked points through the framing (tracks/<take>.json), with whether each is still followed."""
    out = {}
    if shot["source"] == "take":
        path = root / "tracks" / f"{shot['key']}.json"
        cam = TakeCamera(shot, json.loads(path.read_text()) if path.exists() else None)
        for name in cam.tracks:
            rows = []
            for n in range(shot["a"], shot["b"]):
                (x, y), ok, sc = cam.tracked(n, name)
                rows.append([round(float(x), 2), round(float(y), 2), int(ok), round(float(sc), 4)])
            out[name] = rows
        fixed = shot.get("anchors", {})
        for name, pt in fixed.items():
            if name in out:
                continue
            out[name] = [[*map(lambda v: round(float(v), 2), cam.frame_of(n, [pt])[0]), 1, 1.0]
                         for n in range(shot["a"], shot["b"])]
    else:
        cam = StillCamera(shot)
        names = list(shot.get("anchors", {}))
        pts = [shot["anchors"][k] for k in names]
        if pts:
            per = [cam.frame_of(n, pts) for n in range(shot["a"], shot["b"])]
            for i, name in enumerate(names):
                out[name] = [[round(float(f[i][0]), 2), round(float(f[i][1]), 2), 1, round(cam.at(n)["zoom"], 4)]
                             for n, f in zip(range(shot["a"], shot["b"]), per)]
    return out


def render(work, shot, out_dir):
    out = out_dir / f"{shot['key']}.mkv"
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                            "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "4",
                            "-pix_fmt", "yuv444p", "-x264-params", "keyint=24", str(out)], stdin=subprocess.PIPE)
    masks = shot.get("masks", []) if shot["source"] == "still" else []
    menc = {m: subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray16le", "-s", f"{W}x{H}",
                                 "-r", str(FPS), "-i", "-", "-c:v", "ffv1", "-level", "3", "-pix_fmt", "gray16le",
                                 str(out_dir / f"{shot['key']}-{m}.mkv")], stdin=subprocess.PIPE) for m in masks}
    frames = take_frames(shot, shot["a"], shot["b"]) if shot["source"] == "take" else \
        still_frames(shot, shot["a"], shot["b"], masks)
    count = 0
    for n, img, moved in frames:
        img = grade(img, shot.get("look", {}))
        enc.stdin.write((img * 255 + 0.5).astype(np.uint8).tobytes())
        for m, v in moved.items():
            menc[m].stdin.write((np.clip(v, 0, 1) * 65535 + 0.5).astype(np.uint16).tobytes())
        count += 1
    for e in [enc, *menc.values()]:
        e.stdin.close()
        e.wait()
    meta = {"shot": shot["key"], "source": shot["source"], "a": shot["a"], "b": shot["b"], "frames": count,
            "masks": masks, "anchors": anchors(shot, out_dir.parent)}
    (out_dir / f"{shot['key']}.json").write_text(json.dumps(meta))
    print(f"{shot['key']}: {count} frames from its {shot['source']}"
          f"{', masks ' + ', '.join(masks) if masks else ''}", flush=True)


def main():
    work = Path(sys.argv[1]).resolve()
    root = work / "we-are-here"
    edit = json.loads((root / "edit.json").read_text())
    want = set(sys.argv[2:])
    out_dir = root / "plates"
    out_dir.mkdir(exist_ok=True)
    for shot in edit["shots"]:
        if want and shot["key"] not in want:
            continue
        render(work, shot, out_dir)


if __name__ == "__main__":
    main()
