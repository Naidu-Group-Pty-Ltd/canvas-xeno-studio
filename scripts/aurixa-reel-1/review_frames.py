"""Frames to look at before the full render: every beat of every shot, half a second into it, and just before each cut.

python3 review_frames.py [shot ids, comma-separated]
Prints the frame numbers, comma-separated, for render.cjs to draw alone (RENDER_FRAMES).
"""
import json
import sys
from pathlib import Path

b = json.loads((Path(__file__).resolve().parent / "../../docs/brands/aurixa-reel-1/system-edition/brief.json").read_text())
only = set(sys.argv[1].split(",")) if len(sys.argv) > 1 else None
frames = set()
for s in b["shots"]:
    if only and s["id"] not in only:
        continue
    for bt in s["beats"]:
        frames.add(round((bt["at"] + 0.5) * 30))
    frames.add(round(s["out"] * 30) - 2)
print(",".join(str(f) for f in sorted(frames)))
