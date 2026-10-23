"""Word times from the recogniser, held to the silences measured in the audio.

  python -I refine.py transcript.json silences.txt out.json

The recogniser (a TDT transducer) gives every word a start; its "end" runs on to the next word's start,
silence and all. The audio's own silences (ffmpeg silencedetect, -38 dB, 0.18 s) say where speech stops
and starts again, so:
  - a word whose span contains the start of a silence ends there;
  - a word the recogniser starts up to 0.15 s before a silence ends (or 0.05 s after) starts where it
    ends: measured on this voice, the recogniser's starts run 0.05 to 0.11 s early after a pause.
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
for s0, s1 in sil:
    for w in words:
        if s1 - 0.15 <= w["start"] <= s1 + 0.05:
            w["start"] = round(s1, 3)
            break
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
            "source": "local transcription (NVIDIA Parakeet TDT 0.6B v2, int8, in sherpa-onnx), held to the audio's own silences (silencedetect -38 dB, 0.18 s): word ends clipped to where a silence starts, and a word just after a silence started where it ends",
            "note": "The recogniser's spellings (Arixa, organized, authorized) are its own; captions spell from the script.",
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
