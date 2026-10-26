"""A second recogniser's reading of the voiceover, sentence by sentence: OpenAI's Whisper small.en (int8) in
sherpa-onnx, run locally, beside Parakeet's (transcribe.py).

  python -I second_opinion.py <whisper dir> <16 kHz mono wav> <voiceover-words.json> <out.json>

Whisper reads at most 30 s at a time, so the audio is cut at the sentences refine.py found, each padded by the
silence around it, and every sentence is read on its own. Where the two recognisers disagree, the word is one to
hear again before it becomes a caption: the captions are the script's words, and neither recogniser is the script.
"""

import json
import sys
import wave
from pathlib import Path

import numpy as np
import sherpa_onnx

model, audio, words_path, out = sys.argv[1:5]

recognizer = sherpa_onnx.OfflineRecognizer.from_whisper(
    encoder=f"{model}/small.en-encoder.int8.onnx",
    decoder=f"{model}/small.en-decoder.int8.onnx",
    tokens=f"{model}/small.en-tokens.txt",
    language="en",
    task="transcribe",
    num_threads=4,
)

with wave.open(audio) as w:
    assert w.getnchannels() == 1 and w.getframerate() == 16000 and w.getsampwidth() == 2
    samples = (
        np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
        / 32768.0
    )
rate = 16000

sentences = json.loads(Path(words_path).read_text())["sentences"]
read = []
for i, s in enumerate(sentences):
    # A sentence, with up to 0.2 s of the silence either side, never reaching into its neighbours' speech.
    lo = s["start"] - 0.2 if i == 0 else max(s["start"] - 0.2, sentences[i - 1]["end"])
    hi = (
        s["end"] + 0.2
        if i + 1 == len(sentences)
        else min(s["end"] + 0.2, sentences[i + 1]["start"])
    )
    clip = samples[int(max(lo, 0) * rate) : int(hi * rate)]
    if len(clip) > 30 * rate:
        raise SystemExit(
            f"sentence {i} runs {len(clip) / rate:.1f} s, past Whisper's 30 s"
        )
    stream = recognizer.create_stream()
    stream.accept_waveform(rate, clip)
    recognizer.decode_stream(stream)
    read.append(
        {
            "start": s["start"],
            "end": s["end"],
            "parakeet": s["text"],
            "whisper": stream.result.text.strip(),
        }
    )
    print(
        f"{s['start']:7.2f}  P: {s['text']}\n         W: {stream.result.text.strip()}"
    )

Path(out).write_text(
    json.dumps(
        {
            "model": "openai/whisper-small.en (int8, sherpa-onnx), sentence by sentence",
            "sentences": read,
        },
        indent=1,
        ensure_ascii=False,
    )
)
