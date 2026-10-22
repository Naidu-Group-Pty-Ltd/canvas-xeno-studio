"""Contact sheets of a full render, one row a shot: each beat half a second in, and the shot's last frame.

python3 review_sheet.py <render dir> <out dir>
Reads <render dir>/reference.mkv (lossless, frames from film.json's `from`) and the brief's shots and beats.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

BRIEF = json.loads((Path(__file__).resolve().parent / "../../docs/brands/aurixa-reel-1/system-edition/brief.json").read_text())
W, H = 1080, 1920
TW = 240
TH = TW * H // W

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
film = json.loads((src / "film.json").read_text())
f0, f1 = film["from"], film["to"]

rows = []
for s in BRIEF["shots"]:
    picks = [round((b["at"] + 0.5) * 30) for b in s["beats"]] + [round(s["out"] * 30) - 1]
    picks = [min(max(f, round(s["in"] * 30)), round(s["out"] * 30) - 1) for f in picks]
    picks = [f for f in dict.fromkeys(picks) if f0 <= f < f1]
    if picks:
        rows.append((s["id"], s["title"], picks))

wanted = sorted({f for _, _, p in rows for f in p})
expr = "+".join(f"eq(n\\,{f - f0})" for f in wanted)
raw = subprocess.run(
    ["ffmpeg", "-v", "error", "-i", str(src / "reference.mkv"), "-vf", f"select='{expr}',scale={TW}:{TH}:flags=area",
     "-vsync", "0", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    capture_output=True, check=True).stdout
tiles = np.frombuffer(raw, np.uint8).reshape(-1, TH, TW, 3)
assert len(tiles) == len(wanted), (len(tiles), len(wanted))
tile = {f: Image.fromarray(t) for f, t in zip(wanted, tiles)}

per_sheet = 6
for k in range(0, len(rows), per_sheet):
    chunk = rows[k:k + per_sheet]
    cols = max(len(p) for _, _, p in chunk)
    sheet = Image.new("RGB", (160 + cols * (TW + 4), len(chunk) * (TH + 24)), (24, 24, 28))
    d = ImageDraw.Draw(sheet)
    for r, (sid, title, picks) in enumerate(chunk):
        y = r * (TH + 24)
        d.text((8, y + 8), f"{sid}\n{title[:22]}", fill=(230, 230, 230))
        for c, f in enumerate(picks):
            x = 160 + c * (TW + 4)
            sheet.paste(tile[f], (x, y))
            d.text((x + 4, y + TH + 4), f"{f} ({f / 30:.2f} s)", fill=(200, 200, 200))
    name = out / f"sheet-{k // per_sheet + 1}.png"
    sheet.save(name)
    print(name, [sid for sid, _, _ in chunk])
