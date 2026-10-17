"""Run with: python3 -I media-worker/lipcheck/tests/test_face_qc.py (needs only numpy)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import face_qc  # noqa: E402

FPS = 25
RATE = 16000


def landmarks(eye_span=0.2, mouth=0.0, cx=0.5, cy=0.4, width=720, height=1280):
    """478 points around (cx, cy), with the eye corners `eye_span` of the width apart and the
    inner lips `mouth` of the eye span apart."""
    points = [(cx, cy)] * 478
    half = eye_span / 2
    points[face_qc.LEFT_EYE_OUTER] = (cx - half, cy - 0.02)
    points[face_qc.RIGHT_EYE_OUTER] = (cx + half, cy - 0.02)
    gap = mouth * eye_span * width / height  # the gap in the frame's height
    points[face_qc.UPPER_INNER_LIP] = (cx, cy + 0.05)
    points[face_qc.LOWER_INNER_LIP] = (cx, cy + 0.05 + gap)
    return points


def speech(seconds, silent_from=None, silent_to=None):
    """Loud noise, silent between the two times."""
    import numpy as np

    rng = np.random.default_rng(1)
    audio = rng.normal(0, 3000, int(seconds * RATE))
    if silent_from is not None:
        audio[int(silent_from * RATE):int(silent_to * RATE)] = rng.normal(0, 3, int((silent_to - silent_from) * RATE))
    return audio


class FramingTest(unittest.TestCase):
    def test_eye_span_in_pixels_and_share_of_width(self):
        rows = [face_qc.frame_geometry(landmarks(0.2), 720, 1280) for _ in range(50)]
        report = face_qc.framing_report(rows, 720, 1280)
        self.assertAlmostEqual(report["eye_span_px"], 144.0, places=0)
        self.assertAlmostEqual(report["eye_span_frac"], 0.2, places=3)
        self.assertLess(report["eye_span_spread"], 0.01)

    def test_a_push_in_shows_as_spread(self):
        rows = [face_qc.frame_geometry(landmarks(0.16 + 0.002 * i), 720, 1280) for i in range(50)]
        self.assertGreater(face_qc.framing_report(rows, 720, 1280)["eye_span_spread"], 0.3)

    def test_no_face_no_report(self):
        self.assertIsNone(face_qc.framing_report([None, None], 720, 1280))


class SilenceTest(unittest.TestCase):
    def geometry(self, mouth_in_silence):
        # 4 s: speaking (mouth moving) except 1.6-2.6 s.
        rows = []
        for index in range(4 * FPS):
            t = index / FPS
            silent = 1.6 <= t < 2.6
            mouth = mouth_in_silence if silent else (0.2 if index % 2 else 0.05)
            rows.append(face_qc.frame_geometry(landmarks(0.2, mouth), 720, 1280))
        return rows

    def levels(self):
        return face_qc.frame_levels(speech(4, 1.6, 2.6), RATE, FPS, 4 * FPS)

    def test_finds_the_silence(self):
        spans = face_qc.silences(self.levels(), FPS)
        self.assertEqual(len(spans), 1)
        start, end = spans[0]
        self.assertAlmostEqual(start / FPS, 1.6, delta=0.05)
        self.assertAlmostEqual(end / FPS, 2.6, delta=0.05)

    def test_a_closed_mouth_in_silence_is_fine(self):
        report = face_qc.silence_report(self.geometry(0.01), self.levels(), FPS)
        self.assertEqual(report["mouth_open_fraction"], 0.0)
        self.assertGreater(report["silent_seconds"], 0.7)

    def test_a_mouth_moving_in_silence_is_seen(self):
        report = face_qc.silence_report(self.geometry(0.25), self.levels(), FPS)
        self.assertEqual(report["mouth_open_fraction"], 1.0)
        self.assertEqual(len(report["spans"]), 1)

    def test_no_silence_nothing_to_judge(self):
        levels = face_qc.frame_levels(speech(4), RATE, FPS, 4 * FPS)
        self.assertIsNone(face_qc.silence_report(self.geometry(0.25), levels, FPS))


if __name__ == "__main__":
    unittest.main()
