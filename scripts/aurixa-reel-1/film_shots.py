"""One frame of every shot of the finished film, decoded from the master as a player decodes it, in a grid.

python3 film_shots.py <film dir> <out.jpg> [columns]
Each shot is shown 70% of the way through it, labelled with its id, its time and its title.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

BRIEF = json.loads((Path(__file__).resolve().parent / "../../docs/brands/aurixa-reel-1/system-edition/brief.json").read_text())
W, H, FPS = 1080, 1920, 30
film, out = Path(sys.argv[1]), Path(sys.argv[2])
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 9
TW = 236
TH = TW * H // W
LABEL = 46
PAD = 6

picks = []
for s in BRIEF["shots"]:
    f = round((s["in"] + 0.7 * (s["out"] - s["in"])) * FPS)
    f = min(max(f, round(s["in"] * FPS)), round(s["out"] * FPS) - 2)
    picks.append((s["id"], s["title"], f))

frames = {}
sel = "+".join(f"eq(n,{f})" for _, _, f in picks)
dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(film / "film.mp4"), "-vf", f"select='{sel}'", "-vsync", "0",
                        "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
for _, _, f in picks:
    buf = dec.stdout.read(W * H * 3)
    frames[f] = Image.fromarray(np.frombuffer(buf, np.uint8).reshape(H, W, 3))
dec.wait()

rows = (len(picks) + cols - 1) // cols
sheet = Image.new("RGB", (PAD + cols * (TW + PAD), PAD + rows * (TH + LABEL + PAD)), (14, 15, 20))
d = ImageDraw.Draw(sheet)
try:
    bold = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 13)
    reg = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
except OSError:
    bold = reg = ImageFont.load_default()
for i, (sid, title, f) in enumerate(picks):
    x = PAD + (i % cols) * (TW + PAD)
    y = PAD + (i // cols) * (TH + LABEL + PAD)
    sheet.paste(frames[f].resize((TW, TH), Image.LANCZOS), (x, y))
    d.text((x + 2, y + TH + 5), f"{sid} · {f / FPS:.2f} s", fill=(215, 179, 95), font=bold)
    t = title if len(title) <= 34 else title[:33] + "…"
    d.text((x + 2, y + TH + 24), t, fill=(200, 206, 219), font=reg)
sheet.save(out, quality=88)
print(f"{len(picks)} shots → {out} {sheet.size}")
