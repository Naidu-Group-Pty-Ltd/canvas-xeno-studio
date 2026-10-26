"""The reference without National Treasures: the track (offset 0) cancelled bin by bin in the STFT with a complex gain
fitted over a sliding 0.3 s window, so its EQ, ducking and codec are followed; what is left is the voice.
  python -I separate.py reference.wav nt.wav out.wav out-levels.json
"""
import json, sys, wave
import numpy as np
from scipy import signal, ndimage

def load(p):
    w = wave.open(p)
    x = np.frombuffer(w.readframes(w.getnframes()), np.int16).reshape(-1, w.getnchannels()).astype(np.float64) / 32768
    return w.getframerate(), x
sr, ref = load(sys.argv[1]); _, nt = load(sys.argv[2])
nt = nt[:len(ref)]
rm, nm = ref.mean(1), nt.mean(1)
# sample alignment over 2..20 s
seg = slice(sr * 2, sr * 20)
c = signal.correlate(rm[seg], nm[sr * 2 - 480: sr * 20 + 480], mode="valid")
lag = int(np.argmax(c)) - 480
print("lag (samples):", lag)
nm = np.roll(nm, -lag) if lag else nm
nfft, hop = 2048, 256
f, t, R = signal.stft(rm, sr, nperseg=nfft, noverlap=nfft - hop)
_, _, N = signal.stft(nm, sr, nperseg=nfft, noverlap=nfft - hop)
win = int(0.3 * sr / hop)
k = np.hanning(win + 2)[1:-1]; k /= k.sum()
def smooth(x):
    x = ndimage.convolve1d(x, k, axis=1, mode="nearest")
    return ndimage.uniform_filter1d(x, 3, axis=0, mode="nearest")
num = smooth((R * np.conj(N)).real) + 1j * smooth((R * np.conj(N)).imag)
den = smooth(np.abs(N) ** 2) + 1e-12
H = num / den
V = R - H * N
_, v = signal.istft(V, sr, nperseg=nfft, noverlap=nfft - hop)
v = v[:len(rm)]
w = wave.open(sys.argv[3], "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
w.writeframes((np.clip(v / (np.abs(v).max() + 1e-9) * 0.9, -1, 1) * 32767).astype("<i2").tobytes()); w.close()
# levels: speech band of the reference, the cancelled music, and what is left, per 100 ms
band = (f >= 200) & (f <= 4000)
def lev(X): return 10 * np.log10((np.abs(X[band]) ** 2).sum(0) + 1e-12)
lr, ln, lv = lev(R), lev(H * N), lev(V)
step = int(0.1 * sr / hop)
rows = []
for i in range(0, len(t), step):
    rows.append({"t": round(float(t[i]), 2), "ref": round(float(lr[i:i + step].mean()), 1),
                 "music": round(float(ln[i:i + step].mean()), 1), "left": round(float(lv[i:i + step].mean()), 1),
                 "gain": round(float(np.median(np.abs(H[band, i:i + step]))), 3)})
json.dump({"lag": lag, "rows": rows}, open(sys.argv[4], "w"))
np.save(sys.argv[3] + ".spec.npy", np.abs(V[: int(8000 / (sr / nfft))]).astype(np.float32), allow_pickle=False)
np.save(sys.argv[3] + ".specref.npy", np.abs(R[: int(8000 / (sr / nfft))]).astype(np.float32), allow_pickle=False)
print("frames", len(t), "hop s", hop / sr)
