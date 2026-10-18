"""SyncNet lip-sync score (Chung & Zisserman), as syncnet_python computes it:
the AV offset (frames at 25 fps; positive: the audio leads, negative: the lips
lead), the minimum embedding distance and the confidence (median minus minimum
distance over the offsets tried). Real, well-synced speech typically scores a
confidence of about 6-8; badly synced video scores under about 3.

Faces are cropped as syncnet_python's pipeline crops them (a square 2.8x the
face's half-size, the face centre a third of the way down, padded grey,
resized to 224x224), with the face box from MediaPipe's landmarks instead of
S3FD, smoothed over time.

Two ways to run it:

  syncnet_score.py audio.wav|self key=clip.mp4 [key=clip.mp4 ...]
      One line per clip, for a person (the form used for every number in the
      Aurixa findings). "self" scores a clip against its own sound.

  syncnet_score.py --json --video clip.mp4 [--audio voice.wav] [--duration S] [--window S]
      One JSON object on stdout, for the media worker's lip_check task: the
      whole clip's score, and the score of each window of --window seconds.
      Without --audio the clip's own sound is used; --duration scores only its
      first S seconds (a clip runs a moment longer than its piece of voiceover).

Files it needs (paths can be set with SYNCNET_DIR and FACE_MODEL):
  <SYNCNET_DIR>/SyncNetModel.py and syncnet_v2.model, from joonson/syncnet_python
  (MIT; the weights through its download_model.sh, over https), and MediaPipe's
  face_landmarker.task.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
import python_speech_features
import torch
from scipy import signal
from scipy.io import wavfile

HERE = Path(__file__).resolve().parent


def beside(*parts):
    """A file kept next to this script (as in the worker's image, /opt/lipcheck), else one folder up."""
    near = HERE.joinpath(*parts)
    return near if near.exists() else HERE.parent.joinpath(*parts)


SYNC = Path(os.environ.get("SYNCNET_DIR", str(beside("syncnet"))))
sys.path.insert(0, str(SYNC))
sys.path.insert(0, str(HERE))
from SyncNetModel import S  # noqa: E402
import face_qc  # noqa: E402

MODEL = os.environ.get("FACE_MODEL", str(beside("models", "face_landmarker.task")))
CS = 0.4
VSHIFT = 15
FPS = 25
AUDIO_RATE = 16000


def load_model():
    model = S(num_layers_in_fc_layers=1024)
    state = torch.load(str(SYNC / "syncnet_v2.model"), map_location="cpu", weights_only=True)
    own = model.state_dict()
    for name, param in state.items():
        own[name].copy_(param)
    model.eval()
    return model


def face_crops(clip, workdir, duration=None):
    """The face, cropped as SyncNet expects, in every frame at 25 fps; how many frames had a face;
    each frame's face geometry (see face_qc, None where no face was found); and the frame's size."""
    frames_dir = Path(workdir)
    args = ["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", clip]
    if duration:
        args += ["-t", f"{duration:.3f}"]
    args += ["-vf", f"fps={FPS}", "-q:v", "2", str(frames_dir / "%06d.jpg")]
    subprocess.run(args, check=True)
    files = sorted(frames_dir.glob("*.jpg"))
    base = mp.tasks.BaseOptions(model_asset_path=MODEL)
    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=base, running_mode=mp.tasks.vision.RunningMode.IMAGE, num_faces=1
    )
    landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(options)
    boxes, images, geometry = [], [], []
    size = (0, 0)
    for f in files:
        img = cv2.imread(str(f))
        h, w = img.shape[:2]
        size = (w, h)
        res = landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))
        if res.face_landmarks:
            xs = np.array([p.x * w for p in res.face_landmarks[0]])
            ys = np.array([p.y * h for p in res.face_landmarks[0]])
            boxes.append([(xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2, max(xs.max() - xs.min(), ys.max() - ys.min()) / 2])
            geometry.append(face_qc.frame_geometry([(p.x, p.y) for p in res.face_landmarks[0]], w, h))
        else:
            boxes.append([np.nan, np.nan, np.nan])
            geometry.append(None)
        images.append(img)
    landmarker.close()
    if not images:
        return [], 0, [], size
    boxes = np.array(boxes, dtype=float)
    found = int(np.sum(~np.isnan(boxes[:, 0])))
    if not found:
        return [], 0, geometry, size
    for c in range(3):
        col = boxes[:, c]
        good = ~np.isnan(col)
        col[~good] = np.interp(np.flatnonzero(~good), np.flatnonzero(good), col[good])
        boxes[:, c] = signal.medfilt(col, kernel_size=13) if len(col) >= 13 else col
    crops = []
    for img, (x, y, s) in zip(images, boxes):
        bsi = int(s * (1 + 2 * CS))
        frame = np.pad(img, ((bsi, bsi), (bsi, bsi), (0, 0)), "constant", constant_values=(110, 110))
        my, mx = y + bsi, x + bsi
        face = frame[int(my - s):int(my + s * (1 + 2 * CS)), int(mx - s * (1 + CS)):int(mx + s * (1 + CS))]
        crops.append(cv2.resize(face, (224, 224)))
    return crops, found, geometry, size


def distances(model, crops, audio):
    """Per frame, the distance between its lips and the sound at each offset (-VSHIFT..VSHIFT)."""
    im = np.stack(crops, axis=3)
    im = np.expand_dims(im, axis=0)
    im = np.transpose(im, (0, 3, 4, 1, 2))
    imtv = torch.from_numpy(im.astype(float)).float()
    mfcc = np.stack([np.array(i) for i in zip(*python_speech_features.mfcc(audio, AUDIO_RATE))])
    cct = torch.from_numpy(np.expand_dims(np.expand_dims(mfcc, 0), 0).astype(float)).float()
    min_length = min(len(crops), int(np.floor(len(audio) / 640)))
    last = min_length - 5
    if last <= 0:
        return None
    im_feat, cc_feat = [], []
    with torch.no_grad():
        for i in range(0, last, 20):
            im_in = torch.cat([imtv[:, :, v:v + 5, :, :] for v in range(i, min(last, i + 20))], 0)
            im_feat.append(model.forward_lip(im_in))
            cc_in = torch.cat([cct[:, :, :, v * 4:v * 4 + 20] for v in range(i, min(last, i + 20))], 0)
            cc_feat.append(model.forward_aud(cc_in))
    im_feat, cc_feat = torch.cat(im_feat, 0), torch.cat(cc_feat, 0)
    win = VSHIFT * 2 + 1
    padded = torch.nn.functional.pad(cc_feat, (0, 0, VSHIFT, VSHIFT))
    dists = [torch.nn.functional.pairwise_distance(im_feat[[i], :].repeat(win, 1), padded[i:i + win, :]) for i in range(len(im_feat))]
    return torch.stack(dists, 1)  # offsets x frames


def summary(dists):
    """Offset, minimum distance, confidence, and confidence at offset 0, over the frames given."""
    mdist = torch.mean(dists, 1)
    minval, minidx = torch.min(mdist, 0)
    offset = VSHIFT - int(minidx)
    conf = float(torch.median(mdist) - minval)
    # Confidence at zero offset too: what the clip scores where it is meant to sit.
    conf0 = float(torch.median(mdist) - mdist[VSHIFT])
    return offset, float(minval), conf, conf0


def score(model, crops, audio):
    dists = distances(model, crops, audio)
    if dists is None:
        return None
    return summary(dists)


def audio_16k(path, duration=None):
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        args = ["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", path]
        if duration:
            args += ["-t", f"{duration:.3f}"]
        args += ["-ac", "1", "-vn", "-acodec", "pcm_s16le", "-ar", str(AUDIO_RATE), tmp.name]
        subprocess.run(args, check=True)
        _, audio = wavfile.read(tmp.name)
    return audio


def json_report(video, audio_path, duration, window):
    model = load_model()
    with tempfile.TemporaryDirectory() as work:
        crops, found, geometry, (width, height) = face_crops(video, work, duration)
    audio = audio_16k(audio_path or video, duration)
    base = {"model": "syncnet_v2", "fps": FPS, "frames": len(crops), "face_frames": found}
    # Framing, and the mouth wherever the voice is silent: read from the same landmarks.
    framing = face_qc.framing_report(geometry, width, height) if found else None
    if framing:
        base["framing"] = framing
    if found and len(audio):
        silence = face_qc.silence_report(geometry, face_qc.frame_levels(audio, AUDIO_RATE, FPS, len(geometry)), FPS)
        if silence:
            base["silence"] = silence
    if not crops or found < max(5, 0.5 * len(crops)):
        return {**base, "status": "no_face"}
    if len(audio) < AUDIO_RATE or float(np.sqrt(np.mean(audio.astype(float) ** 2))) < 30:
        return {**base, "status": "no_speech"}
    dists = distances(model, crops, audio)
    if dists is None:
        return {**base, "status": "no_speech"}
    offset, mind, conf, conf0 = summary(dists)
    windows = []
    step = max(1, int(round(window * FPS)))
    frames = dists.shape[1]
    for start in range(0, frames, step):
        end = min(frames, start + step)
        if end - start < max(10, step // 2):
            break
        w_offset, _, w_conf, w_conf0 = summary(dists[:, start:end])
        windows.append({
            "start": round(start / FPS, 3),
            "end": round(end / FPS, 3),
            "offset_frames": w_offset,
            "confidence": round(w_conf, 3),
            "confidence_at_zero": round(w_conf0, 3),
        })
    return {
        **base,
        "status": "scored",
        "offset_frames": offset,
        "min_distance": round(mind, 4),
        "confidence": round(conf, 3),
        "confidence_at_zero": round(conf0, 3),
        "windows": windows,
    }


def main():
    if "--json" in sys.argv:
        parser = argparse.ArgumentParser()
        parser.add_argument("--json", action="store_true")
        parser.add_argument("--video", required=True)
        parser.add_argument("--audio")
        parser.add_argument("--duration", type=float)
        parser.add_argument("--window", type=float, default=3.0)
        args = parser.parse_args()
        duration = args.duration if args.duration and args.duration > 0 else None
        print(json.dumps(json_report(args.video, args.audio, duration, max(1.0, args.window))), flush=True)
        return
    source = sys.argv[1]
    model = load_model()
    for arg in sys.argv[2:]:
        key, clip = arg.split("=", 1)
        with tempfile.TemporaryDirectory() as work:
            crops, _, _, _ = face_crops(clip, work)
        audio = audio_16k(clip if source == "self" else source)
        result = score(model, crops, audio) if crops else None
        if result is None:
            print(f"{key:6s} no face or no speech to score", flush=True)
            continue
        offset, mind, conf, conf0 = result
        print(f"{key:6s} offset {offset:+d} frames ({offset * 40:+d} ms)  min dist {mind:.2f}  confidence {conf:.2f}  confidence at 0 {conf0:.2f}", flush=True)


if __name__ == "__main__":
    main()
