"""The voiceover's words and their times, from NVIDIA's Parakeet TDT 0.6B v2 (int8) in sherpa-onnx, run locally.

  python -I transcribe.py <model dir> <16 kHz mono wav> <out.json>

Writes the text, and every word with the time it starts (and ends, where the model's token durations give it).
Times are provisional: the studio's own preparation measures the voice when it is imported.
"""

import json
import sys
import wave
from pathlib import Path

import numpy as np
import sherpa_onnx

model, audio, out = sys.argv[1:4]

recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
    encoder=f"{model}/encoder.int8.onnx",
    decoder=f"{model}/decoder.int8.onnx",
    joiner=f"{model}/joiner.int8.onnx",
    tokens=f"{model}/tokens.txt",
    model_type="nemo_transducer",
    num_threads=4,
)

with wave.open(audio) as w:
    assert w.getnchannels() == 1 and w.getframerate() == 16000 and w.getsampwidth() == 2
    samples = (
        np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
        / 32768.0
    )
    rate = w.getframerate()

stream = recognizer.create_stream()
stream.accept_waveform(rate, samples)
recognizer.decode_stream(stream)
result = stream.result

tokens = list(result.tokens)
starts = list(result.timestamps)
durations = list(getattr(result, "durations", []) or [])
words = []
for i, (token, start) in enumerate(zip(tokens, starts)):
    end = start + durations[i] if i < len(durations) and durations[i] else None
    if token.startswith(("▁", " ")) or not words:
        words.append(
            {
                "word": token.lstrip("▁ "),
                "start": round(float(start), 3),
                "end": round(float(end), 3) if end is not None else None,
            }
        )
    else:
        words[-1]["word"] += token
        if end is not None:
            words[-1]["end"] = round(float(end), 3)
words = [w for w in words if w["word"]]

Path(out).write_text(
    json.dumps(
        {
            "model": "nvidia/parakeet-tdt-0.6b-v2 (int8, sherpa-onnx)",
            "seconds": round(len(samples) / rate, 3),
            "text": result.text.strip(),
            "words": words,
            "has_durations": bool(durations),
        },
        indent=1,
        ensure_ascii=False,
    )
)
print(
    f"{len(words)} words over {len(samples) / rate:.2f} s; durations: {bool(durations)}"
)
print(result.text.strip())
