#!/usr/bin/env python3
"""The teaser's soundtrack: the studio's score as the bed, the three-note motif and the reveal drawn here on their
exact frames, and the brand voice's eight lines on their beats.

  python3 -I scripts/aurixa-teaser/sound.py <sound dir>

The sound dir holds score-v1.wav (Eleven Music, made in the studio to the plan's composition plan), vo/*.wav and
vo/takes.json (the eight lines spoken by the studio's brand voice, Gabby, through generate_voiceover). Writes
stems/bed.wav, stems/fx.wav, stems/voice.wav and mix.wav (48 kHz stereo, before mastering), and cues.json: where
each line's words fall on the teaser's clock, for the picture.

The score is in D major at A = 440, as its plan asked, but its energy doesn't follow the plan everywhere: its boom
lands at 30.46 s, not 30.0, and it fades out after 31 s. So it is the bed only up to the held breath at 29.4 s.
From there the reveal is drawn here: silence until 30.0, a deep boom, and the motif's three notes (D, F sharp, A)
struck together as the chord they were always part of, held under the name, then thinned to one D for "Soon."
"""
import json
import sys
import wave
from pathlib import Path

import numpy as np
from scipy import signal

D = Path(sys.argv[1])
SR = 48000
LENGTH = 37.5
N = int(LENGTH * SR)
rng = np.random.default_rng(37)

# Where each line is heard: its take and the time its first word starts on the teaser's clock.
LINES = [
    ("l1", 0.80, "Every property comes with three questions."),
    ("l2", 8.60, "Is it right for them?"),
    ("l3", 13.60, "Are they who they say they are?"),
    ("l4", 18.60, "Can they afford it?"),
    ("l5b", 23.00, "Until now... each one was answered somewhere else."),
    ("l6b", 27.10, "We've been building... the answer."),
    ("l7", 32.80, "Aurixa Systems."),
    ("l8b", 35.60, "Soon..."),
]
BREATH = (29.40, 30.00)  # the held breath before the reveal: nothing sounds


def read(path):
    w = wave.open(str(path))
    x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
    x = x.reshape(-1, w.getnchannels())
    if w.getframerate() != SR:
        raise SystemExit(f"{path}: {w.getframerate()} Hz, expected {SR}")
    return x if x.shape[1] == 2 else np.repeat(x, 2, 1)


def write(path, x):
    path.parent.mkdir(parents=True, exist_ok=True)
    y = np.clip(x, -1, 1)
    w = wave.open(str(path), "wb")
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((y * 32767).astype("<i2").tobytes())
    w.close()


def track():
    return np.zeros((N, 2), np.float32)


def place(dst, src, at, gain=1.0):
    i = int(round(at * SR))
    j = min(N, i + len(src))
    if j > i:
        dst[i:j] += src[: j - i] * gain


def env_adsr(n, a, d, s, r, sustain_for):
    """An envelope n samples long: attack, decay to s, held, then released over r seconds."""
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), 1.0)
    e = np.where((t >= a) & (t < a + d), 1 - (1 - s) * (t - a) / max(d, 1e-4), e)
    e = np.where((t >= a + d) & (t < sustain_for), s, e)
    e = np.where(t >= sustain_for, s * np.exp(-(t - sustain_for) / max(r / 4.6, 1e-4)), e)
    return e.astype(np.float32)


def hz(name):
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    note, octave = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((names[note] + 12 * (octave + 1) - 69) / 12)


def bell(f0, seconds=4.0, bright=1.0, pan=0.0):
    """A soft struck bell: inharmonic partials, each dying away at its own rate."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    partials = [(1.0, 1.0, 3.2), (2.0, 0.55, 1.7), (2.76, 0.32 * bright, 1.1), (4.07, 0.2 * bright, 0.75),
                (5.4, 0.11 * bright, 0.5), (6.8, 0.06 * bright, 0.35)]
    y = np.zeros(n, np.float32)
    for ratio, amp, decay in partials:
        f = f0 * ratio
        if f > SR / 2.2:
            continue
        y += (amp * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * np.exp(-t / decay)).astype(np.float32)
    y *= np.minimum(1, t / 0.002).astype(np.float32)  # a 2 ms strike
    y /= np.abs(y).max() + 1e-9
    left, right = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
    return np.stack([y * left, y * right], 1)


def saw(f, n, detune_cents=0.0):
    """A band-limited sawtooth (its harmonics up to 9 kHz)."""
    t = np.arange(n) / SR
    ff = f * 2 ** (detune_cents / 1200)
    y = np.zeros(n, np.float32)
    phase = rng.uniform(0, 6.28)
    for k in range(1, int(9000 / ff) + 1):
        y += (np.sin(2 * np.pi * ff * k * t + phase * k) / k).astype(np.float32)
    return y * (2 / np.pi)


def pad(notes, seconds, attack=0.35, release=2.2, cutoff=1900.0):
    """A wide, warm pad: five detuned saws a note, low-passed, spread across the stereo field."""
    n = int(seconds * SR)
    out = np.zeros((n, 2), np.float32)
    detunes = [0, 5, -5, 11, -11]
    pans = [0, -0.6, 0.6, -0.9, 0.9]
    for note in notes:
        f = hz(note)
        for det, pan in zip(detunes, pans):
            y = saw(f, n, det)
            left, right = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
            out[:, 0] += y * left
            out[:, 1] += y * right
    b, a = signal.butter(2, cutoff / (SR / 2), "low")
    out = signal.lfilter(b, a, out, axis=0).astype(np.float32)
    e = env_adsr(n, attack, 0.8, 0.85, release, seconds - release)
    out *= e[:, None]
    return out / (np.abs(out).max() + 1e-9)


def boom(seconds=3.0):
    """The reveal's hit: a sub falling from 78 to 36 Hz, a low thump of noise and a soft click."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    f = 36 + (78 - 36) * np.exp(-t / 0.18)
    phase = 2 * np.pi * np.cumsum(f) / SR
    sub = np.sin(phase) * np.exp(-t / 1.1) + 0.25 * np.sin(2 * phase) * np.exp(-t / 0.5)
    noise = rng.normal(0, 1, n)
    b, a = signal.butter(2, 220 / (SR / 2), "low")
    thump = signal.lfilter(b, a, noise) * np.exp(-t / 0.22) * 3.0
    click = rng.normal(0, 1, n) * np.exp(-t / 0.004) * 0.25
    y = (sub + thump + click) * np.minimum(1, t / 0.003)
    y = (y / (np.abs(y).max() + 1e-9)).astype(np.float32)
    return np.stack([y, y], 1)


def swept_noise(seconds, f_from, f_to, shape, width=1.0):
    """Stereo noise through a band-pass that sweeps from f_from to f_to, shaped by `shape` (0 to 1 over time)."""
    n = int(seconds * SR)
    hop = 512
    out = np.zeros((n, 2), np.float32)
    for ch in range(2):
        x = rng.normal(0, 1, n).astype(np.float32)
        f, tt, Z = signal.stft(x, SR, nperseg=2048, noverlap=2048 - hop)
        prog = np.clip(tt / seconds, 0, 1)
        centre = f_from * (f_to / f_from) ** prog
        gain = np.exp(-0.5 * (np.log2(np.maximum(f[:, None], 1) / centre[None, :]) / width) ** 2)
        _, y = signal.istft(Z * gain, SR, nperseg=2048, noverlap=2048 - hop)
        out[:, ch] = y[:n]
    out *= shape(np.arange(n) / SR / seconds)[:, None].astype(np.float32)
    return out / (np.abs(out).max() + 1e-9)


def reverb(x, rt60=2.6, mix=0.3):
    """A plate-like room: stereo noise decaying at rt60, its highs dying sooner, convolved with x."""
    n = int(rt60 * 1.4 * SR)
    t = np.arange(n) / SR
    ir = np.zeros((n, 2), np.float32)
    for ch in range(2):
        noise = rng.normal(0, 1, n)
        lo = signal.lfilter(*signal.butter(2, 900 / (SR / 2), "low"), noise) * np.exp(-t * 6.9 / rt60)
        hi = signal.lfilter(*signal.butter(2, 900 / (SR / 2), "high"), noise) * np.exp(-t * 6.9 / (rt60 * 0.45))
        ir[:, ch] = (lo + hi) * np.minimum(1, t / 0.012)
    ir /= np.sqrt((ir ** 2).sum(0, keepdims=True)) + 1e-9
    wet = np.stack([signal.fftconvolve(x[:, ch], ir[:, ch])[: len(x)] for ch in range(2)], 1)
    return (x * (1 - mix) + wet * mix * 2.2).astype(np.float32)


def fade(x, start, end, to_zero=True):
    """A linear fade over [start, end] s: out (to_zero) or in."""
    i, j = int(start * SR), int(end * SR)
    ramp = np.linspace(1, 0, j - i, dtype=np.float32) if to_zero else np.linspace(0, 1, j - i, dtype=np.float32)
    x[i:j] *= ramp[:, None]
    if to_zero:
        x[j:] = 0
    else:
        x[:i] = 0


def db(v):
    return 10 ** (v / 20)


# ------------------------------------------------------------------ the voice
takes = json.loads((D / "vo/takes.json").read_text())
voice = track()
cues = []
b_hp, a_hp = signal.butter(2, 85 / (SR / 2), "high")
for key, at, text in LINES:
    x = read(D / f"vo/{key}.wav")
    x = signal.lfilter(b_hp, a_hp, x, axis=0).astype(np.float32)
    env = np.convolve(np.abs(x.mean(1)), np.ones(480) / 480, "same")
    lead = np.where(env > 0.01)[0][0] / SR  # the take's silence before its first word
    speech = x[np.abs(x.mean(1)) > 0]
    rms = np.sqrt(np.mean(x[env > 0.01] ** 2))
    x *= db(-20.0) / (rms + 1e-9)  # every line at the same speaking level
    if key.startswith("l8"):
        x *= db(-2.0)  # "Soon." a little closer and quieter than the rest
    place(voice, x, at - lead)
    words = [{"text": w["text"], "start": round(at - lead + w["start"], 3), "end": round(at - lead + w["end"], 3)}
             for w in takes[key]["words"]]
    cues.append({"take": key, "text": text, "at": at, "words": words})
voice = reverb(voice, rt60=0.9, mix=0.12)

# ------------------------------------------------------------------ the bed: the studio's score, to the breath
score = read(D / "score-v1.wav")
bed = track()
bed[: min(N, len(score))] = score[:N]
fade(bed, BREATH[0] - 0.12, BREATH[0])  # cut clean into the held breath
# Under the voice the bed steps back: 7 dB, in 60 ms, back up over 400 ms.
venv = np.abs(voice).max(1)
venv = np.convolve(venv, np.ones(960) / 960, "same")
duck = np.clip(venv / 0.02, 0, 1)
smooth = np.zeros_like(duck)
level = 0.0
att, rel = 1 - np.exp(-1 / (0.06 * SR)), 1 - np.exp(-1 / (0.4 * SR))
for i in range(0, len(duck), 64):  # one gain a 64-sample block is plenty for a duck
    target = duck[i]
    level += (target - level) * (att if target > level else rel) * 64
    level = min(max(level, 0.0), 1.0)
    smooth[i:i + 64] = level
DUCK = smooth  # 0 to 1: how much a line is being spoken, for the bed and the effects alike
bed *= (1 - DUCK * (1 - db(-10.0)))[:, None]

# ------------------------------------------------------------------ the motif and the reveal
fx = track()
place(fx, bell(hz("D6"), 3.5, 0.6, 0.15), 0.40, db(-17))  # the pin's beam
# The dive: air rushing up through the haze, then gone as the city settles.
whoosh = swept_noise(2.9, 250, 3200, lambda p: np.sin(np.pi * np.clip(p / 0.82, 0, 1) * 0.5) ** 2
                     * np.where(p < 0.82, 1, np.exp(-(p - 0.82) / 0.05)), width=0.9)
place(fx, whoosh, 4.85, db(-15))
# The three questions: one note each as the line lands (D, F sharp, A).
for note, at, pan in (("D5", 8.30, -0.35), ("F#5", 13.30, 0.35), ("A5", 18.30, 0.0)):
    place(fx, bell(hz(note), 4.5, 1.0, pan), at, db(-9))
    place(fx, bell(hz(note[:-1] + str(int(note[-1]) - 1)), 4.5, 0.5, -pan), at, db(-18))
# The gap: the same notes, far apart and soft, in the line's pauses, never resolving.
for note, at in (("D5", 24.36), ("F#5", 26.78)):
    place(fx, bell(hz(note), 3.0, 0.7, 0.0), at, db(-19))
# The shape: the three notes climb as the triangle closes, then silence.
riser = swept_noise(1.95, 500, 7000, lambda p: p ** 2.2, width=1.2)
place(fx, riser, 27.45, db(-17))
for note, at in (("D5", 27.75), ("F#5", 28.25), ("A5", 28.75)):
    place(fx, bell(hz(note), 1.2, 1.1, 0.0), at, db(-15))
# The reveal: the boom, and the chord the three notes make, held under the name, thinned to one D for "Soon."
place(fx, boom(3.5), 30.00, db(-3))
for note, pan in (("D5", -0.3), ("F#5", 0.3), ("A5", 0.0), ("D6", 0.0)):
    place(fx, bell(hz(note), 5.0, 1.0, pan), 30.00, db(-11))
chord = pad(["D3", "A3", "D4", "F#4", "A4"], 5.6, attack=0.25, release=1.6)
place(fx, chord, 30.00, db(-13))
low = pad(["D3", "D4"], 7.5, attack=0.4, release=2.4, cutoff=1200)
place(fx, low, 30.00, db(-17))
place(fx, bell(hz("A6"), 3.0, 0.8, 0.4), 32.62, db(-24))  # the lettering's glint
place(fx, bell(hz("D6"), 3.0, 0.8, -0.4), 32.86, db(-25))
place(fx, bell(hz("D5"), 4.0, 0.6, 0.0), 36.25, db(-15))  # the last bell, under "Soon."
fx = reverb(fx, rt60=2.8, mix=0.32)
fx *= (1 - DUCK * (1 - db(-8.0)))[:, None]  # the effects step back under a line too
for x in (fx, bed):
    i, j = int(BREATH[0] * SR), int(BREATH[1] * SR)
    x[i:j] = 0  # the breath holds: nothing at all
fade(fx, 36.9, 37.45)

# ------------------------------------------------------------------ stems and the mix
mix = bed * db(-3.0) + fx * db(-3.0) + voice * db(4.0)
peak = np.abs(mix).max()
if peak > 0.98:
    mix *= 0.98 / peak
for name, x in (("stems/bed.wav", bed), ("stems/fx.wav", fx), ("stems/voice.wav", voice), ("mix.wav", mix)):
    write(D / name, x)
(D / "cues.json").write_text(json.dumps({"length": LENGTH, "breath": BREATH, "lines": cues}, indent=1))
print("mix written; peak before trim", round(float(peak), 3))
