#!/usr/bin/env python3
"""The teaser's soundtrack: a dark synthwave score cut on its own bar lines to the picture, the brand voice's eight
lines on their beats, and the motif and the hits drawn here on their exact frames.

  python3 -I scripts/aurixa-teaser/sound.py <sound dir>

The sound dir holds score-synthwave.wav (Eleven Music, made in the studio from score_plan.py's composition plan: B flat
minor, the key of the reels' National Treasures, at 96 BPM, so a bar is the picture's 2.5 s), vo/*.wav and
vo/takes.json (the eight lines spoken by the studio's brand voice, Gabby, through generate_voiceover). Writes
stems/bed.wav, stems/fx.wav, stems/voice.wav and mix.wav (48 kHz stereo, before mastering), and cues.json: where
each line's words fall on the teaser's clock, for the picture.

The score is laid out as the reels lay out National Treasures: pieces of it cut on its own bar lines (PIECES), nothing
stretched, each join a 30 ms crossfade that ends just before the bar line so the bar's own attack is whole. Its two
drops land on the picture's: the first on the first question (7.5 s), the biggest on the answer (30.0 s), with the
score's own beat of silence before it as the held breath. Over it, in synthwave's own voice (no bells): a pluck as the
pin's beam pulses, the three questions' notes as plucks through a ping-pong delay (B flat, D flat, F: the B flat minor
chord, one note a question), stabs as the triangle closes, an 808 hit on each drop, a fall as the groove cuts out, and
the chord held dark under "Soon.". Under each spoken line the score steps back, its mids more than its bass.
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

# ------------------------------------------------------------------ the bed: the synthwave score, cut on its bar lines
# (teaser s, score s, seconds): each piece on a bar line of both (96 BPM: a bar is 2.5 s, a beat 0.625 s).
PIECES = [
    (0.000, 12.500, 22.500),  # the intro's last bars and its build, the drop on the first question, the groove
    (22.500, 40.625, 5.000),  # the breakdown, under the gap
    (27.500, 48.125, 7.500),  # the second build at its peak as the triangle closes, its beat of silence (the
    #                           breath), then the final drop on the answer, at 30.0
    (35.000, 70.000, 2.500),  # the beat stopped dead, its tail, under "Soon."
]
JOIN = (0.035, 0.005)  # a join's crossfade: from 35 ms to 5 ms before the bar line
score = read(D / "score-synthwave.wav")
bed = track()
for k, (at, src, length) in enumerate(PIECES):
    lead = JOIN[0] if k else 0.0
    a, b = int(round((src - lead) * SR)), int(round((src + length + (JOIN[0] if k < len(PIECES) - 1 else 0)) * SR))
    piece = score[a:b].copy()
    i = int(round((at - lead) * SR))
    n = min(len(piece), N - i)
    piece = piece[:n]
    xf = int(round((JOIN[0] - JOIN[1]) * SR))
    if k:  # in over the join, whole 5 ms before its bar
        piece[:xf] *= np.sin(np.linspace(0, np.pi / 2, xf, dtype=np.float32))[:, None] ** 2
    else:
        fi = int(0.12 * SR)
        piece[:fi] *= np.linspace(0, 1, fi, dtype=np.float32)[:, None]
    if k < len(PIECES) - 1:  # out over the next piece's join
        end = int(round((PIECES[k + 1][0] - at + lead) * SR))
        o0, o1 = end - int(round(JOIN[0] * SR)), end - int(round(JOIN[1] * SR))
        if o1 <= len(piece):
            piece[o0:o1] *= np.cos(np.linspace(0, np.pi / 2, o1 - o0, dtype=np.float32))[:, None] ** 2
            piece[o1:] = 0
    bed[i:i + n] += piece
fade(bed, 37.0, 37.5)
# The opening is the hook: the intro's build 3 dB nearer than the score has it, back to the score's own level 50 ms
# before the drop, so the drop still lands 7 dB above it.
lift = np.ones(N, np.float32)
i, j = int(7.40 * SR), int(7.45 * SR)
lift[:i] = db(3.0)
lift[i:j] = np.linspace(db(3.0), 1, j - i)
bed *= lift[:, None]

# Under the voice the score steps back: its mids (where the voice is) 10 dB, its bass 4, in 60 ms, back over 400 ms.
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
DUCK = smooth  # 0 to 1: how much a line is being spoken, for the score and the effects alike
low = signal.filtfilt(*signal.butter(2, 220 / (SR / 2), "low"), bed, axis=0).astype(np.float32)
bed = low * (1 - DUCK * (1 - db(-4.0)))[:, None] + (bed - low) * (1 - DUCK * (1 - db(-10.0)))[:, None]


# ------------------------------------------------------------------ the synths
def svf_lowpass(x, cutoff, res=0.35):
    """An analogue synth's resonant low-pass: a state-variable filter whose cutoff (Hz, one a sample) moves."""
    y = np.empty_like(x)
    lo = bp = 0.0
    q = 2 * (1 - res) + 0.1
    for i in range(len(x)):
        f = 2 * np.sin(np.pi * min(cutoff[i], SR / 7) / SR)
        lo += f * bp
        hp = x[i] - lo - q * bp
        bp += f * hp
        y[i] = lo
    return y


def pluck(note, seconds=1.4, bright=1.0, pan=0.0):
    """The synthwave pluck: two detuned saws and a square an octave down, their filter snapping shut."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    f = hz(note)
    x = 0.5 * saw(f, n, 7) + 0.5 * saw(f, n, -7) + 0.25 * np.sign(np.sin(2 * np.pi * f / 2 * t))
    cut = 280 + 5200 * bright * np.exp(-t / 0.11)
    y = svf_lowpass(x.astype(np.float32), cut, 0.45) * (np.minimum(1, t / 0.003) * np.exp(-t / 0.42)).astype(np.float32)
    y /= np.abs(y).max() + 1e-9
    left, right = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
    return np.stack([y * left, y * right], 1)


def stab(notes, seconds=1.0, bright=1.0):
    """A chord stab: detuned saws a note, their filter opening hard and closing, wide."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.zeros((n, 2), np.float32)
    for note in notes:
        for det, pan in ((0, 0.0), (9, -0.7), (-9, 0.7)):
            y = saw(hz(note), n, det)
            out[:, 0] += y * np.sqrt(0.5 * (1 - pan))
            out[:, 1] += y * np.sqrt(0.5 * (1 + pan))
    cut = 500 + 4800 * bright * np.exp(-t / 0.2)
    env = (np.minimum(1, t / 0.004) * np.exp(-t / 0.33)).astype(np.float32)
    out = np.stack([svf_lowpass(out[:, ch], cut, 0.3) for ch in range(2)], 1) * env[:, None]
    return out / (np.abs(out).max() + 1e-9)


def impact(seconds=3.5, start_hz=120.0, end_hz=38.0):
    """An 808 hit: a sub falling in pitch, driven, under a burst of bright noise that rings like a crash."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    f = end_hz + (start_hz - end_hz) * np.exp(-t / 0.09)
    sub = np.tanh(1.8 * np.sin(2 * np.pi * np.cumsum(f) / SR)) * np.exp(-t / 1.15)
    noise = rng.normal(0, 1, n)
    crash = signal.lfilter(*signal.butter(2, 2500 / (SR / 2), "high"), noise) * np.exp(-t / 0.9) * 0.35
    thump = signal.lfilter(*signal.butter(2, 180 / (SR / 2), "low"), noise) * np.exp(-t / 0.08) * 2.5
    y = (sub + crash + thump) * np.minimum(1, t / 0.002)
    y = (y / (np.abs(y).max() + 1e-9)).astype(np.float32)
    side = signal.lfilter(*signal.butter(1, 3000 / (SR / 2), "high"), rng.normal(0, 1, n)) * np.exp(-t / 0.7) * 0.08
    return np.stack([y + side, y - side], 1).astype(np.float32)


def downlifter(seconds=1.4):
    """The groove cut out: noise falling from bright to dull, and a sub sinking under it."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    air = swept_noise(seconds, 7000, 180, lambda p: (1 - p) ** 1.5, width=1.0)
    f = 30 + 70 * np.exp(-t / 0.35)
    sub = (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.6)).astype(np.float32)
    return air * 0.6 + np.stack([sub, sub], 1) * 0.8


def pingpong(x, time=0.46875, feedback=0.4, mix=0.38):
    """Synthwave's dotted-eighth echo, bouncing left and right, each repeat duller."""
    d = int(time * SR)
    x = np.concatenate([x, np.zeros((7 * d, 2), np.float32)])  # room for the echoes to ring out
    out = x.copy()
    tap = x.copy()
    b, a = signal.butter(1, 2800 / (SR / 2), "low")
    for k in range(1, 7):
        tap = signal.lfilter(b, a, tap, axis=0).astype(np.float32) * feedback
        shifted = np.zeros_like(x)
        shifted[k * d:] = tap[: len(x) - k * d]
        if k % 2:
            shifted = shifted[:, ::-1]  # each repeat on the other side
        out += shifted * mix / feedback
    return out


def gated(x, length=0.32, mix=0.5):
    """The 80s gated reverb: a dense room cut off dead after `length` s."""
    n = int(length * SR)
    t = np.arange(n) / SR
    ir = rng.normal(0, 1, (n, 2)).astype(np.float32) * (np.minimum(1, t / 0.004) * (1 - (t / length) ** 6))[:, None]
    ir /= np.sqrt((ir ** 2).sum(0, keepdims=True)) + 1e-9
    wet = np.stack([signal.fftconvolve(x[:, ch], ir[:, ch])[: len(x)] for ch in range(2)], 1)
    return (x + wet * mix * 1.5).astype(np.float32)


# ------------------------------------------------------------------ the motif and the hits
fx = track()
place(fx, pingpong(pluck("A#5", 1.0, 0.8)), 0.40, db(-22))  # the pin's beam
# The dive: air rushing up through the haze into the drop, and an 808 hit on the drop itself.
whoosh = swept_noise(2.75, 250, 4200, lambda p: np.sin(np.pi * np.clip(p / 0.9, 0, 1) * 0.5) ** 2
                     * np.where(p < 0.9, 1, np.exp(-(p - 0.9) / 0.03)), width=0.9)
place(fx, whoosh, 4.85, db(-17))
place(fx, impact(2.5), 7.50, db(-11))
# The three questions: one note each as the line lands (B flat, D flat, F), echoing.
for note, at, pan in (("A#4", 8.30, -0.35), ("C#5", 13.30, 0.35), ("F5", 18.30, 0.0)):
    place(fx, pingpong(pluck(note, 1.4, 1.0, pan)), at, db(-12))
# The gap: the groove cuts out under a fall; the first two notes again, far apart, dull, never resolving.
place(fx, downlifter(1.6), 22.48, db(-14))
for note, at in (("A#4", 24.36), ("C#5", 26.78)):
    place(fx, pingpong(pluck(note, 1.2, 0.45)), at, db(-21))
# The shape: the three notes climb as stabs as the triangle closes, then the breath.
for note, at in (("A#4", 27.75), ("C#5", 28.25), ("F5", 28.75)):
    place(fx, gated(stab([note, note[:-1] + str(int(note[-1]) - 1)], 0.6)), at, db(-17))
# The answer: the biggest hit, the B flat minor chord struck as a stab on it.
place(fx, impact(4.0, 140, 34), 30.00, db(-6))
place(fx, gated(stab(["A#3", "C#4", "F4", "A#4"], 1.2, 1.2), 0.4), 30.00, db(-13))
# Soon: the beat stops on one last hit, the chord left ringing dark, one note echoing as the orb pulses.
place(fx, impact(3.0, 110, 36), 35.00, db(-9))
place(fx, pad(["A#2", "F3", "A#3", "C#4", "F4"], 2.5, attack=0.05, release=1.8, cutoff=1300), 35.00, db(-16))
place(fx, pingpong(pluck("A#4", 1.2, 0.6)), 36.25, db(-18))
fx = reverb(fx, rt60=1.8, mix=0.18)
fx *= (1 - DUCK * (1 - db(-8.0)))[:, None]  # the effects step back under a line too
for x in (fx, bed):
    i, j = int(BREATH[0] * SR), int(BREATH[1] * SR)
    x[i:j] = 0  # the breath holds: nothing at all
fade(fx, 36.95, 37.48)

# ------------------------------------------------------------------ stems and the mix
mix = bed * db(-5.0) + fx * db(-2.0) + voice * db(4.0)
peak = np.abs(mix).max()
if peak > 0.98:
    mix *= 0.98 / peak
for name, x in (("stems/bed.wav", bed), ("stems/fx.wav", fx), ("stems/voice.wav", voice), ("mix.wav", mix)):
    write(D / name, x)
(D / "cues.json").write_text(json.dumps({"length": LENGTH, "breath": BREATH, "lines": cues}, indent=1))
print("mix written; peak before trim", round(float(peak), 3))
