"""Face checks beyond lip sync, from the landmarks the lip scorer already finds.

- Framing: how big the face is (the span between the outer eye corners, in
  pixels and as a share of the frame's width) and where it sits. A presenter's
  eye span held at 136-153 px at 720p across the Aurixa job; a clip whose
  span is well off the others' was framed differently (a zoom, a push-in).
- The mouth in silences: wherever the voice pauses, the mouth should be
  closed and still. The gap between the inner lips (as a share of the eye
  span, so it doesn't depend on how big the face is) is read on every frame
  of each silence of a third of a second or more.

Only numpy: tested on its own (see tests/test_face_qc.py), without torch or
MediaPipe.
"""
import numpy as np

# MediaPipe face mesh landmarks: outer eye corners, inner lips (upper, lower).
LEFT_EYE_OUTER = 33
RIGHT_EYE_OUTER = 263
UPPER_INNER_LIP = 13
LOWER_INNER_LIP = 14

# The gap between the inner lips, as a share of the eye span, above which the
# mouth reads as open (closed lips measure about 0 to 0.03; speech about 0.05
# to 0.35).
MOUTH_OPEN = 0.08
# A silence is a stretch at least this long whose sound stays this far under
# the clip's speech (its 90th percentile level), in dB.
SILENCE_SECONDS = 0.3
SILENCE_DB = 20.0
# Frames at either edge of a silence left out: the mouth closes and opens over a frame or two.
EDGE_FRAMES = 2


def frame_geometry(points, width, height):
    """One frame's eye span (px), inner-lip gap (share of the eye span) and face centre (0-1).

    `points` is a sequence of (x, y) landmark positions as fractions of the
    frame, as MediaPipe gives them.
    """
    pts = np.asarray(points, dtype=float)
    if pts.ndim != 2 or len(pts) <= max(LEFT_EYE_OUTER, RIGHT_EYE_OUTER, UPPER_INNER_LIP, LOWER_INNER_LIP):
        return None
    px = pts * np.array([width, height], dtype=float)
    span = float(np.linalg.norm(px[LEFT_EYE_OUTER] - px[RIGHT_EYE_OUTER]))
    if span <= 1:
        return None
    gap = float(np.linalg.norm(px[UPPER_INNER_LIP] - px[LOWER_INNER_LIP]))
    return {
        "eye_span": span,
        "mouth": gap / span,
        "x": float(pts[:, 0].mean()),
        "y": float(pts[:, 1].mean()),
    }


def framing_report(geometry, width, height):
    """How big the face is and where it sits, over the frames it was found in (None if none)."""
    found = [entry for entry in geometry if entry]
    if not found:
        return None
    spans = np.array([entry["eye_span"] for entry in found])
    median = float(np.median(spans))
    low, high = np.percentile(spans, [10, 90])
    return {
        "eye_span_px": round(median, 1),
        "eye_span_frac": round(median / float(width), 4),
        # How much it changes within the clip (a push-in or pull-back shows here).
        "eye_span_spread": round(float((high - low) / median), 4) if median else 0.0,
        "face_x": round(float(np.median([entry["x"] for entry in found])), 4),
        "face_y": round(float(np.median([entry["y"] for entry in found])), 4),
        "frame_width": int(width),
        "frame_height": int(height),
    }


def frame_levels(audio, rate, fps, frames):
    """The sound's level (dB, RMS) over each picture frame, `frames` of them."""
    samples = np.asarray(audio, dtype=float)
    per = rate / float(fps)
    levels = np.full(frames, -120.0)
    for index in range(frames):
        chunk = samples[int(round(index * per)):int(round((index + 1) * per))]
        if len(chunk):
            rms = float(np.sqrt(np.mean(chunk ** 2)))
            levels[index] = 20 * np.log10(rms) if rms > 0 else -120.0
    return levels


def silences(levels, fps):
    """Stretches (start, end frame, end exclusive) where the sound stays well under the speech."""
    if not len(levels):
        return []
    speech = float(np.percentile(levels, 90))
    quiet = levels < speech - SILENCE_DB
    shortest = int(round(SILENCE_SECONDS * fps))
    spans, start = [], None
    for index, still in enumerate(list(quiet) + [False]):
        if still and start is None:
            start = index
        elif not still and start is not None:
            if index - start >= shortest:
                spans.append((start, index))
            start = None
    return spans


def silence_report(geometry, levels, fps):
    """How often the mouth is open where the voice is silent (None when there's no silence to judge)."""
    spans = silences(levels, fps)
    rows, judged = [], []
    for start, end in spans:
        inner = range(start + EDGE_FRAMES, end - EDGE_FRAMES)
        mouths = [geometry[index]["mouth"] for index in inner if index < len(geometry) and geometry[index]]
        if not mouths:
            continue
        open_share = float(np.mean(np.array(mouths) > MOUTH_OPEN))
        judged.extend(mouths)
        rows.append({
            "start": round(start / fps, 3),
            "end": round(end / fps, 3),
            "mouth_open": round(open_share, 3),
        })
    if not judged:
        return None
    silent = set()
    for start, end in spans:
        silent.update(range(start, end))
    speaking = [entry["mouth"] for index, entry in enumerate(geometry) if entry and index not in silent]
    return {
        "silent_seconds": round(len(judged) / fps, 3),
        # The share of silent frames whose mouth is open.
        "mouth_open_fraction": round(float(np.mean(np.array(judged) > MOUTH_OPEN)), 3),
        "mouth_silent": round(float(np.median(judged)), 4),
        "mouth_speaking": round(float(np.median(speaking)), 4) if speaking else None,
        "spans": sorted(rows, key=lambda row: -row["mouth_open"])[:8],
    }
