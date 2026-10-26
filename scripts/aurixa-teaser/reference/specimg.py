"""Spectrogram rows of the separated voice (and the reference under it), 5 s a row, 0-5 kHz, time ticks every 0.5 s."""
import sys
import numpy as np
from PIL import Image, ImageDraw
spec = np.load(sys.argv[1], allow_pickle=False)
out, t0, t1 = sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
sr, nfft, hop = 48000, 2048, 256
fmax = 5000
nb = int(fmax / (sr / nfft))
S = 20 * np.log10(spec[:nb] + 1e-9)
top = np.percentile(S, 99.7)
img_rows = []
fps = sr / hop
H = 260
for a in np.arange(t0, t1, 5.0):
    i, j = int(a * fps), int(min(a + 5.0, t1) * fps)
    seg = S[:, i:j]
    seg = np.clip((seg - (top - 60)) / 60, 0, 1)
    seg = seg[::-1]
    im = Image.fromarray((seg ** 0.8 * 255).astype(np.uint8)).resize((seg.shape[1], H), Image.BILINEAR).convert("RGB")
    canvas = Image.new("RGB", (int(5.0 * fps) + 60, H + 22), (0, 0, 0))
    canvas.paste(im, (50, 0))
    d = ImageDraw.Draw(canvas)
    for k in range(0, 11):
        x = 50 + int(k * 0.5 * fps)
        d.line([(x, H), (x, H + 6 if k % 2 else H + 12)], fill=(255, 255, 0))
        if k % 2 == 0: d.text((x + 2, H + 8), f"{a + k*0.5:.1f}", fill=(255, 255, 0))
    for khz in (1, 2, 3, 4):
        y = int(H * (1 - khz * 1000 / fmax))
        d.text((2, y - 6), f"{khz}k", fill=(0, 255, 255))
        d.line([(44, y), (50, y)], fill=(0, 255, 255))
    img_rows.append(canvas)
W = max(r.width for r in img_rows)
full = Image.new("RGB", (W, sum(r.height for r in img_rows)))
y = 0
for r in img_rows:
    full.paste(r, (0, y)); y += r.height
full.save(out)
print(out, full.size)
