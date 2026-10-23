"""Word times from the recogniser, with each word's end clipped to the silence that follows it.

  python -I refine.py transcript.json silences.txt out.json

The recogniser (a TDT transducer) gives every word a start; its "end" runs on to the next word's start,
silence and all. The audio's own silences (ffmpeg silencedetect, -38 dB, 0.18 s) say where speech stops,
so a word whose span contains the start of a silence ends there. Provisional until the studio prepares
the voice.
"""

import json
import re
import sys
from pathlib import Path

transcript, silences_path, out = sys.argv[1:4]
d = json.loads(Path(transcript).read_text())
sil = []
for line in Path(silences_path).read_text().splitlines():
    m = re.findall(r"silence_(start|end): ([0-9.]+)", line)
    if len(m) == 2:
        sil.append((float(m[0][1]), float(m[1][1])))

words = d["words"]
for i, w in enumerate(words):
    nxt = words[i + 1]["start"] if i + 1 < len(words) else d["seconds"]
    end = w["end"] if w["end"] is not None else nxt
    for s0, s1 in sil:
        if w["start"] < s0 < end + 0.05:
            end = min(end, s0)
            break
    w["end"] = round(end, 3)

# sentences, from the recogniser's own punctuation
sentences, cur = [], []
for w in words:
    cur.append(w)
    if w["word"][-1:] in ".?!":
        sentences.append(cur)
        cur = []
if cur:
    sentences.append(cur)

Path(out).write_text(
    json.dumps(
        {
            "source": "local transcription (NVIDIA Parakeet TDT 0.6B v2, int8, in sherpa-onnx), word ends clipped to the audio's own silences (silencedetect -38 dB, 0.18 s)",
            "provisional": True,
            "note": "Provisional until the studio prepares the voice (import_audio). The recogniser's spellings (Arixa, organized, authorized) are its own; captions spell from the script.",
            "seconds": d["seconds"],
            "silences": [{"start": round(a, 3), "end": round(b, 3)} for a, b in sil],
            "sentences": [
                {
                    "text": " ".join(x["word"] for x in s),
                    "start": s[0]["start"],
                    "end": s[-1]["end"],
                }
                for s in sentences
            ],
            "words": [
                {"text": w["word"], "start": w["start"], "end": w["end"]} for w in words
            ],
        },
        indent=1,
        ensure_ascii=False,
    )
)

for s in sentences:
    print(
        f"{s[0]['start']:6.2f} {s[-1]['end']:6.2f}  " + " ".join(x["word"] for x in s)
    )
