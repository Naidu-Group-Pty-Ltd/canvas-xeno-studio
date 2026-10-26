"""The reference voice's phrases (where it speaks and pauses), its rate in syllable nuclei a second, its pitch, and how
fast a phrase's end dies away (a dry voice falls 30 dB in tens of ms; a wet one tails off at 60 dB per RT60).
  python -I phrases.py voice.wav out.json [label]
"""
import json, sys
import numpy as np
import soundfile as sf
from scipy import signal
x, sr = sf.read(sys.argv[1], always_2d=True)
x = x.mean(1)
x = signal.resample_poly(x, 16000, sr); sr = 16000
hop = 160  # 10 ms
sos = signal.butter(4, [250, 3500], "band", fs=sr, output="sos")
b = signal.sosfiltfilt(sos, x)
e = np.array([np.mean(b[i:i + 320] ** 2) for i in range(0, len(b) - 320, hop)])
edb = 10 * np.log10(e + 1e-12)
peak = np.percentile(edb, 99)
act = edb > peak - 30
# close gaps < 180 ms, drop blips < 80 ms
def runs(m):
    d = np.diff(np.r_[0, m.astype(int), 0]); return list(zip(np.where(d == 1)[0], np.where(d == -1)[0]))
segs = runs(act)
merged = []
for a, z in segs:
    if merged and a - merged[-1][1] < 18: merged[-1] = (merged[-1][0], z)
    else: merged.append((a, z))
merged = [(a, z) for a, z in merged if z - a >= 8]
# syllable nuclei: peaks of the 300-2500 Hz envelope smoothed to 12 Hz, 4 dB prominence, >= 100 ms apart
sos2 = signal.butter(2, 12, "low", fs=100, output="sos")
env = signal.sosfiltfilt(sos2, edb)
pk, _ = signal.find_peaks(env, prominence=4, distance=10)
pk = [p for p in pk if act[p]]
# pitch by autocorrelation in active 40 ms frames, 75-450 Hz
f0 = []
for i in range(0, len(x) - 640, hop):
    if not act[min(i // hop, len(act) - 1)]: continue
    fr = x[i:i + 640] * np.hanning(640)
    ac = np.correlate(fr, fr, "full")[639:]
    lo, hi = sr // 450, sr // 75
    k = lo + int(np.argmax(ac[lo:hi]))
    if ac[k] > 0.45 * ac[0]: f0.append(sr / k)
f0 = np.array(f0)
# decay after phrase ends followed by >= 300 ms of quiet: level drop from the last 50 ms to 40-90 ms after
decays = []
for a, z in merged:
    nxt = [s for s, _ in merged if s > z]
    if nxt and nxt[0] - z < 30: continue
    if z + 10 >= len(edb): continue
    before = edb[max(z - 5, 0):z].mean(); after = edb[z + 4:z + 9].mean()
    decays.append(round(float(before - after), 1))
out = {"phrases": [{"start": round(a / 100, 2), "end": round(z / 100, 2), "dur": round((z - a) / 100, 2),
                    "nuclei": int(sum(1 for p in pk if a <= p < z))} for a, z in merged],
       "voiced_seconds": round(float(act.sum() / 100), 2), "nuclei": len(pk),
       "f0_median": round(float(np.median(f0)), 1) if len(f0) else None,
       "f0_iqr": [round(float(np.percentile(f0, 25)), 1), round(float(np.percentile(f0, 75)), 1)] if len(f0) else None,
       "end_drop_db": decays}
json.dump(out, open(sys.argv[2], "w"), indent=1)
print(sys.argv[3] if len(sys.argv) > 3 else "", "phrases", len(merged), "voiced s", out["voiced_seconds"], "nuclei", len(pk),
      "rate /s voiced", round(len(pk) / max(out["voiced_seconds"], 1e-9), 2), "f0", out["f0_median"], out["f0_iqr"],
      "end drop dB (median of", len(decays), ")", np.median(decays) if decays else None)
for p in out["phrases"]: print(f"  {p['start']:6.2f}-{p['end']:6.2f}  {p['dur']:5.2f}s  ~{p['nuclei']} syl")
