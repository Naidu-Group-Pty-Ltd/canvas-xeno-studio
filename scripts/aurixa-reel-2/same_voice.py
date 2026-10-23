"""Is Reel 2's voiceover Reel 1's voice? Speaker embeddings (WeSpeaker ResNet34, VoxCeleb) on 10-second windows.

  python -I same_voice.py model.onnx reel1.wav reel2.wav

Prints the cosine similarity of windows within each file (the same speaker, as a baseline) and across files.
"""

import sys
import wave

import numpy as np
import sherpa_onnx

model, a, b = sys.argv[1:4]
cfg = sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=model, num_threads=4)
ex = sherpa_onnx.SpeakerEmbeddingExtractor(cfg)


def load(path):
    with wave.open(path) as w:
        assert w.getframerate() == 16000 and w.getnchannels() == 1
        return (
            np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(
                np.float32
            )
            / 32768.0
        )


def embeds(x, win=10.0):
    out = []
    n = int(win * 16000)
    for i in range(0, len(x) - n + 1, n):
        s = ex.create_stream()
        s.accept_waveform(16000, x[i : i + n])
        s.input_finished()
        e = np.array(ex.compute(s))
        out.append(e / np.linalg.norm(e))
    return np.array(out)


A, B = embeds(load(a)), embeds(load(b))


def within(E):
    m = E @ E.T
    return m[np.triu_indices(len(E), 1)]


wa, wb, x = within(A), within(B), (A @ B.T).ravel()
for name, v in (
    ("within Reel 1", wa),
    ("within Reel 2", wb),
    ("Reel 1 against Reel 2", x),
):
    print(
        f"{name:24s} n={len(v):3d}  mean {v.mean():.3f}  min {v.min():.3f}  max {v.max():.3f}"
    )
