"""How the reference sets National Treasures: its gain against the track itself, by band, every 0.5 s (a least-squares
fit of the reference's STFT onto the track's, in the pauses and under the voice alike).
  python -I ntgain.py reference.wav nt.wav out.json
"""
import json, sys
import numpy as np
import soundfile as sf
from scipy import signal
r, sr = sf.read(sys.argv[1], always_2d=True); n, _ = sf.read(sys.argv[2], always_2d=True)
r, n = r.mean(1), n[:len(r)].mean(1)
f, t, R = signal.stft(r, sr, nperseg=4096, noverlap=4096 - 1024)
_, _, N = signal.stft(n, sr, nperseg=4096, noverlap=4096 - 1024)
bands = {"sub 20-60": (20, 60), "bass 60-200": (60, 200), "mid 200-2k": (200, 2000), "high 2k-12k": (2000, 12000)}
rows = []
step = int(0.5 * sr / 1024)
for i in range(0, R.shape[1] - step, step):
    row = {"t": round(float(t[i]), 2)}
    for name, (lo, hi) in bands.items():
        m = (f >= lo) & (f < hi)
        num = np.sum((R[m, i:i + step] * np.conj(N[m, i:i + step])).real)
        den = np.sum(np.abs(N[m, i:i + step]) ** 2) + 1e-12
        row[name] = round(float(num / den), 3)
    rows.append(row)
json.dump(rows, open(sys.argv[3], "w"), indent=0)
print("   t   " + "  ".join(f"{k:>11}" for k in bands))
for row in rows:
    print(f"{row['t']:5.1f}  " + "  ".join(f"{20*np.log10(max(row[k],1e-3)):9.1f}dB" for k in bands))
