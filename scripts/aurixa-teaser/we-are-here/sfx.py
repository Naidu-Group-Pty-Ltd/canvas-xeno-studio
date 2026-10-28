#!/usr/bin/env python3
"""We Are Here's sound design: the film's moments given weight, drawn in code (numpy alone, nothing generated or
sampled), for the studio's mixer to lay under the voice and the music (soundtrack.ts).

  python3 -I scripts/aurixa-teaser/we-are-here/sfx.py <work files dir>      # writes sound-we-are-here/sfx.wav

Every sound is placed on the film's own clock, the words' times in sound-as-one/cues.json that the picture is placed
on too, and every one that has a pitch is in the track's key, B flat minor, at the track's own tuning: National
Treasures is tuned sharp of A440, measured on its stem by section (TUNING), and a note at A440 would sit a quarter
tone off it:

  - the night: a low swell under the opening line, and on "operate" a deep, soft boom with a shimmer as the light
    runs out over the country;
  - the noise: a glass tick as each pane comes in, and on "ambition" the glass breaking, its pieces rushing past;
  - "the question changes": a swell drawn in backwards to a soft hit as the core flares;
  - the five tiers: a chime as each box comes in, rising through the key to its B flat, and the network's data as
    they join;
  - the silent bar stays silent for "Powerful on their own."; from its last word a swell drawn in backwards runs
    into the drop: a deep impact, its crack and its body, and the rush of the camera thrown back;
  - the network's links running out, a hit on "destinations", the dive into New South Wales and the chase;
  - a rise into "one" and its impact, the beams going up;
  - the next tool coming apart; the country's light running into the core; the triangle closing with a deep, soft
    lock; a swell drawn in backwards into "Aurixa" and the reveal's impact, its shimmer; the light sweeping the logo;
    a heartbeat under each of its beats; and the sun coming up.

The voice comes first. Where it speaks, the sound design gives way to it in its own band (250 Hz to 5 kHz), as a
dialogue-keyed EQ on an effects bus does: brought down as far as CARVE_DB as the voice's level there rises
(sound-as-one/stems/voice.wav, on the same clock), on a fast attack and a slow release, so a hall's tail, a chime or a
shimmer under a word steps back and blooms again between the lines. Below the band (the hits' weight) and above it
(their air) nothing is touched, and each struck sound's first 60 ms passes whole, so a hit on a word still lands.

Writes a 24-bit 48 kHz stereo WAV of the film's 45.5 s, each sound at its own level, the whole a stem: soundtrack.ts
sets it in the mix on the Music & FX channel. It is high-passed at 25 Hz (no speaker plays what is under it, and it
would take the mix's headroom), its peak normalised to -1 dBFS here, and the mix sets its level.
"""
import json
import math
import sys
import wave
from pathlib import Path

import numpy as np

SR = 48000
LENGTH = 45.5
N = int(round(LENGTH * SR))
RNG = np.random.default_rng(2155)

NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
# The track's tuning: how many cents sharp of A440 its notes sit, from each time on, measured on
# sound-as-one/stems/music.wav (the spectrum's energy against the equal-tempered grid, 200 Hz to 4 kHz, slid a cent at
# a time): its intro's keys +55, the held F under the tiers +43, the groove from the drop +48. Its notes are B flat
# minor's (F, B flat and C the strongest).
TUNING = ((0.0, 55.0), (15.0, 43.0), (22.3, 48.0))


def hz(name, at):
    """A note (e.g. "Bb4") as the track tunes it at `at` seconds."""
    pc, octave = NAMES.index(name[:-1]), int(name[-1])
    cents = [c for t, c in TUNING if t <= at][-1]
    return 440.0 * 2 ** ((pc - 9 + 12 * (octave - 4)) / 12 + cents / 1200)


# ------------------------------------------------------------------ the instruments


def tt(dur):
    return np.arange(int(round(dur * SR))) / SR


def noise(n):
    return RNG.standard_normal(n)


def band(x, lo, hi, order=4):
    """x kept between lo and hi Hz, with soft skirts (by the spectrum: each a time-invariant filter, zero phase)."""
    n = len(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    g = np.ones_like(f)
    if lo:
        g *= 1 / (1 + (lo / np.maximum(f, 1e-3)) ** (2 * order))
    if hi:
        g *= 1 / (1 + (f / hi) ** (2 * order))
    return np.fft.irfft(np.fft.rfft(x) * g, n)


def sweep_band(x, centre, width_oct=0.8, frame=2048, hop=512):
    """x through a band-pass whose centre moves (centre(t) in Hz, t in s from x's start), width_oct octaves wide: by
    frames of its spectrum, laid back over each other (a Hann window, overlapped four times)."""
    n = len(x)
    win = np.hanning(frame)
    out = np.zeros(n + frame)
    norm = np.zeros(n + frame)
    f = np.fft.rfftfreq(frame, 1 / SR)
    xp = np.concatenate([x, np.zeros(frame)])
    for s in range(0, n, hop):
        seg = xp[s:s + frame] * win
        c = centre((s + frame / 2) / SR)
        g = np.exp(-0.5 * (np.log2(np.maximum(f, 1.0) / c) / (width_oct / 2)) ** 2)
        out[s:s + frame] += np.fft.irfft(np.fft.rfft(seg) * g, frame) * win
        norm[s:s + frame] += win ** 2
    return out[:n] / np.maximum(norm[:n], 1e-6)


def tone(freq, dur, phase=0.0):
    """A sine whose frequency may move: freq a number or an array over the samples."""
    n = int(round(dur * SR))
    f = np.broadcast_to(np.asarray(freq, np.float64), (n,))
    return np.sin(2 * math.pi * np.cumsum(f) / SR + phase)


def fade(x, a=0.004, b=0.02):
    """Fades at both ends, so nothing clicks in or out."""
    n = len(x)
    na, nb = min(n, int(a * SR)), min(n, int(b * SR))
    w = np.ones(n)
    if na:
        w[:na] = np.sin(np.linspace(0, math.pi / 2, na)) ** 2
    if nb:
        w[n - nb:] *= np.cos(np.linspace(0, math.pi / 2, nb)) ** 2
    return x * (w[:, None] if x.ndim == 2 else w)


def stereo(x, pan=0.0, width=0.0):
    """Mono to stereo, at pan (-1 left to 1 right), with a little of it decorrelated by width (0 to 1)."""
    l, r = math.cos((pan + 1) * math.pi / 4), math.sin((pan + 1) * math.pi / 4)
    out = np.stack([x * l, x * r], 1) * math.sqrt(2)
    if width > 0:
        d = int(0.011 * SR)
        side = np.concatenate([np.zeros(d), x[:-d]]) * width * 0.5
        out[:, 0] += side
        out[:, 1] -= side
    return out


IRS = {}


def impulse(rt60, damp, seed):
    """A room's answer: decaying noise, each side its own, the highs dying faster than the lows (by frames)."""
    key = (rt60, damp, seed)
    if key in IRS:
        return IRS[key]
    rng = np.random.default_rng(seed)
    n = int(rt60 * 1.2 * SR)
    t = np.arange(n) / SR
    out = []
    for _ in range(2):
        x = rng.standard_normal(n) * np.exp(-6.91 * t / rt60)
        # the highs darken with time: a low-pass falling from 12 kHz to damp Hz over the tail
        x = sweep_band(x, lambda s: max(damp, 12000.0 * math.exp(-s * 3.0 / rt60)), width_oct=6.0)
        x[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
        out.append(x / np.sqrt(np.sum(x ** 2)))
    IRS[key] = np.stack(out, 1)
    return IRS[key]


def reverb(x, rt60=2.4, mix=0.3, damp=2500.0, seed=1):
    """x (stereo) in a hall: the dry sound and the room's answer, convolved by the spectrum; the tail runs on."""
    ir = impulse(rt60, damp, seed)
    n = len(x) + len(ir)
    m = 1 << (n - 1).bit_length()
    wet = np.stack([np.fft.irfft(np.fft.rfft(x[:, c], m) * np.fft.rfft(ir[:, c], m), m)[:n] for c in range(2)], 1)
    dry = np.concatenate([x, np.zeros((len(ir), 2))])
    return dry * (1 - mix) + wet * mix * 3.0


def soft(x, drive=1.6):
    return np.tanh(drive * x) / math.tanh(drive)


def peak(x, level=1.0):
    p = np.max(np.abs(x))
    return x * (level / p) if p > 0 else x


# ------------------------------------------------------------------ the sounds


def sub_boom(f0, f1, dur=2.6, tau=1.0):
    """The weight of a hit: a tone falling from f0 to f1 (the key's B flat, two octaves down), its slam dying fast to
    half and the rest slowly, so that a word spoken on it is not buried under it."""
    t = tt(dur)
    f = f1 + (f0 - f1) * np.exp(-t / 0.09)
    x = tone(f, dur) + 0.25 * tone(2 * f, dur)
    env = (1 - np.exp(-t / 0.003)) * (0.5 * np.exp(-t / 0.12) + 0.5 * np.exp(-t / tau))
    return fade(soft(x * env, 1.4), 0.0, dur * 0.4)


def punch(dur=0.5):
    """An impact's body, which a phone's speaker can play: a falling knock, and a burst of air."""
    t = tt(dur)
    f = 70 + 90 * np.exp(-t / 0.03)
    body = tone(f, dur) * np.exp(-t / 0.09)
    air = band(noise(len(t)), 180, 2200) * np.exp(-t / 0.045)
    return body + 0.5 * peak(air) * 0.6


def crack(dur=0.25):
    t = tt(dur)
    return band(noise(len(t)), 1800, 12000) * np.exp(-t / 0.018)


def impact(at, size=1.0, rt60=3.2, weight=0.75):
    """A deep hit at `at` s: its weight (the boom, at `weight`, and the body's knock under 150 Hz) dry and in the
    middle, as a hall's tail on the sub-bass would only muddy the voice and take the mix's headroom; its body and its
    crack above that in a large hall."""
    b = peak(sub_boom(hz("Bb2", at), hz("Bb0", at), 2.4 + 0.8 * size, tau=0.8 + 0.5 * size))
    body = np.pad(peak(punch()), (0, len(b) - len(punch()))) * 0.55 * size
    body += np.pad(peak(crack()), (0, len(b) - len(crack()))) * 0.22 * size
    air = band(body, 150.0, 0)
    hall = reverb(stereo(air, 0.0, 0.35), rt60=rt60, mix=0.32, damp=1800, seed=3)
    return hall + np.pad(stereo(weight * b + body - air), ((0, len(hall) - len(b)), (0, 0)))


def riser(dur, lo=350.0, hi=9000.0, pitch=(110.0, 880.0), shape=2.4):
    """A rise: air narrowing as it climbs, and a pair of tones climbing with it, ending on its last sample."""
    t = tt(dur)
    u = t / dur
    air = sweep_band(noise(len(t)), lambda s: lo * (hi / lo) ** min(1.0, s / dur), width_oct=1.4)
    f = pitch[0] * (pitch[1] / pitch[0]) ** (u ** 1.4)
    tones = tone(f, dur) + tone(f * 1.007, dur, 1.3) + 0.4 * tone(2 * f, dur)
    trem = 1 + 0.25 * np.sin(2 * math.pi * np.cumsum(4 + 22 * u ** 2) / SR)
    x = (peak(air) * 0.8 + peak(tones) * 0.35 * trem) * u ** shape
    x[-int(0.004 * SR):] *= np.linspace(1, 0, int(0.004 * SR))
    return stereo(x, 0.0, 0.6)


def reverse_swell(at, dur, bright=1.0, seed=5):
    """A swell drawn in backwards into `at`: a bright hit's hall tail, reversed, ending on its last sample."""
    hit = np.zeros(int(0.05 * SR))
    hit[:int(0.03 * SR)] = band(noise(int(0.03 * SR)), 900, 9000) * bright
    hit = hit + 0.5 * np.pad(sum(tone(hz(n, at), 0.03) for n in ("Bb5", "F6", "Db6")), (0, int(0.02 * SR)))
    tail = reverb(stereo(fade(hit, 0.001, 0.005), 0.0, 0.6), rt60=dur * 0.9, mix=1.0, damp=3000, seed=seed)
    tail = tail[: int(dur * SR)][::-1]
    u = np.linspace(0, 1, len(tail))
    tail *= (u ** 1.5)[:, None]
    tail[-int(0.003 * SR):] *= np.linspace(1, 0, int(0.003 * SR))[:, None]
    return tail


def whoosh(dur, f_from, f_to, pan_from=-0.6, pan_to=0.6, width=1.2):
    """Air passing: a band of noise moving from f_from to f_to, swelling and dying, crossing from one side to the
    other."""
    t = tt(dur)
    u = t / dur
    x = sweep_band(noise(len(t)), lambda s: f_from * (f_to / f_from) ** min(1.0, s / dur), width_oct=width)
    env = np.sin(np.pi * u) ** 1.6 * (1 - 0.3 * u)
    x = peak(x) * env
    p = pan_from + (pan_to - pan_from) * u
    l, r = np.cos((p + 1) * np.pi / 4), np.sin((p + 1) * np.pi / 4)
    return np.stack([x * l, x * r], 1) * math.sqrt(2)


def bell(freq, dur=2.2, bright=1.0, ring=0.9):
    """A glass chime: its note (dying over `ring` s) and two partials above, the higher dying sooner."""
    t = tt(dur)
    x = (tone(freq, dur) * np.exp(-t / ring) + 0.35 * bright * tone(freq * 2.01, dur) * np.exp(-t / (ring * 0.4))
         + 0.15 * bright * tone(freq * 3.03, dur) * np.exp(-t / (ring * 0.18)))
    return fade(x * (1 - np.exp(-t / 0.004)), 0.002, 0.2)


def shimmer(at, notes, dur=2.6, attack=0.25, decay=1.2):
    """A bright chord of glass from `at`: each note doubled, a few cents apart left and right, slowly beating."""
    t = tt(dur)
    env = (1 - np.exp(-t / attack)) * np.exp(-np.maximum(t - attack, 0) / decay)
    L = sum(tone(hz(n, at) * 2 ** (-3 / 1200), dur, i) for i, n in enumerate(notes))
    R = sum(tone(hz(n, at) * 2 ** (3 / 1200), dur, 2 * i + 1) for i, n in enumerate(notes))
    trem = 1 + 0.12 * np.sin(2 * math.pi * 5.5 * t)
    return fade(np.stack([L * env * trem, R * env * trem], 1), 0.002, 0.3)


def tick(freq, dur=0.12):
    t = tt(dur)
    x = tone(freq, dur) * np.exp(-t / 0.022) + 0.3 * band(noise(len(t)), 3000, 9000) * np.exp(-t / 0.004)
    return fade(x, 0.0015, 0.02)


def glass_break(dur=1.8):
    """Glass breaking: a crack, then its pieces ringing high and fast, thinning out, each where it flies."""
    out = np.zeros((int(dur * SR), 2))
    c = peak(band(noise(int(0.12 * SR)), 1500, 14000) * np.exp(-tt(0.12) / 0.015))
    out[: len(c)] += stereo(c, 0.0, 0.8) * 0.8
    for _ in range(220):
        at = RNG.exponential(0.22)
        if at > dur - 0.1:
            continue
        f = RNG.uniform(2800, 11000)
        d = RNG.uniform(0.004, 0.04)
        g = tone(f, d * 5) * np.exp(-tt(d * 5) / d) * RNG.uniform(0.15, 0.6) * math.exp(-at / 0.6)
        s = int(at * SR)
        out[s:s + len(g)] += stereo(fade(g, 0.0005, 0.005), RNG.uniform(-0.9, 0.9))[: len(out) - s]
    return out


def thunk(at):
    """The triangle closing at `at`: a deep, soft lock, as a fine car's door closes, and its catch just after."""
    t = tt(0.9)
    body = tone(hz("Bb1", at), 0.9) * np.exp(-t / 0.13) + 0.6 * tone(hz("F3", at), 0.9) * np.exp(-t / 0.05)
    knock = band(noise(len(t)), 600, 3200) * np.exp(-t / 0.008)
    x = body + 0.35 * peak(knock)
    catch = np.zeros(len(t))
    s = int(0.045 * SR)
    k = tone(3800, 0.03) * np.exp(-tt(0.03) / 0.006)
    catch[s:s + len(k)] = k * 0.12
    return reverb(stereo(soft(x + catch, 1.2), 0.0, 0.2), rt60=0.6, mix=0.18, damp=1500, seed=7)


def heartbeat(at):
    """A beat under the logo at `at`: a soft, deep knock on the key's B flat."""
    t = tt(0.6)
    x = tone(hz("Bb1", at), 0.6) * (1 - np.exp(-t / 0.006)) * np.exp(-t / 0.16)
    x += 0.4 * tone(hz("F2", at), 0.6) * np.exp(-t / 0.05)
    return stereo(fade(soft(x, 1.3), 0.0, 0.15), 0.0, 0.1)


def streaks(dur, n, lo=2000.0, hi=8000.0):
    """The network's data: short streaks of air, each its own pitch and side, thickening."""
    out = np.zeros((int(dur * SR), 2))
    for _ in range(n):
        at = dur * RNG.random() ** 0.7
        d = RNG.uniform(0.03, 0.09)
        f0 = RNG.uniform(lo, hi)
        g = whoosh(d, f0, f0 * RNG.uniform(0.6, 1.6), RNG.uniform(-1, 1), RNG.uniform(-1, 1), 0.7)
        s = int(at * SR)
        out[s:s + len(g)] += g[: len(out) - s] * RNG.uniform(0.3, 1.0)
    return out


def dissolve(t0, dur=1.0):
    """The next tool coming apart into light from `t0`: fine, high grains, scattering and thinning."""
    out = np.zeros((int(dur * SR), 2))
    for _ in range(160):
        at = dur * RNG.random() ** 1.6
        f = RNG.choice([hz(n, t0) for n in ("Bb6", "Db7", "F7", "Ab7")]) * RNG.uniform(0.997, 1.003)
        d = RNG.uniform(0.01, 0.05)
        g = tone(f, d * 4) * np.exp(-tt(d * 4) / d) * RNG.uniform(0.2, 1.0) * (1 - at / dur)
        s = int(at * SR)
        out[s:s + len(g)] += stereo(fade(g, 0.001, 0.005), RNG.uniform(-0.8, 0.8))[: len(out) - s]
    return out


def drone(dur, f0, f1, attack=1.0):
    """A low swell, rising from f0 to f1 as it gathers, with its fifth and its octave."""
    t = tt(dur)
    u = t / dur
    f = f0 * (f1 / f0) ** u
    x = tone(f, dur) + 0.5 * tone(f * 1.5, dur, 0.7) + 0.3 * tone(f * 2.003, dur, 1.9)
    air = sweep_band(noise(len(t)), lambda s: 200 + 1800 * min(1.0, s / dur), width_oct=1.6)
    env = (1 - np.exp(-t / attack)) * u ** 1.2
    return stereo(fade(peak(x) * env + 0.25 * peak(air) * env, 0.05, 0.02), 0.0, 0.5)


# ------------------------------------------------------------------ the voice first


CARVE = (250.0, 5000.0)  # the band the sound design gives up to the voice
CARVE_DB = 9.0  # how far, while the voice speaks at its own level
CARVE_TIMES = (0.015, 0.25)  # the carve's attack and release (s)
CARVE_HIT = (0.06, 0.18)  # a struck sound passes whole for its first 60 ms; the carve is back by 180 ms


def read_pcm(path):
    """A 24-bit PCM WAV at SR, on +-1, as (samples, channels)."""
    with wave.open(str(path), "rb") as f:
        if f.getsampwidth() != 3 or f.getframerate() != SR:
            raise ValueError(f"{path}: expected 24-bit PCM at {SR} Hz")
        ch, n = f.getnchannels(), f.getnframes()
        b = np.frombuffer(f.readframes(n), np.uint8).reshape(-1, 3).astype(np.int32)
    v = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)
    return (np.where(v >= 1 << 23, v - (1 << 24), v) / float(1 << 23)).reshape(-1, ch)


def carve(x, voice, hits):
    """x (the sound design, stereo) given way to the voice: its band CARVE brought down as the voice's level in the
    speech band (300 Hz to 4 kHz, the mix report's) rises, from nothing 30 dB under the voice's speaking level to
    CARVE_DB from 15 dB under it, on 10 ms frames, the gain eased on CARVE_TIMES; around each of `hits` (s) the carve
    lets go (CARVE_HIT). The rest of x is untouched: the band is split off by the spectrum, so x is whole where the
    carve is at nothing."""
    n = len(x)
    v = band(np.pad(voice.mean(1), (0, max(0, n - len(voice))))[:n], 300.0, 4000.0)
    hop = int(0.01 * SR)
    k = n // hop + 1
    v = np.pad(v, (0, k * hop - n))
    level = 10 * np.log10(np.mean(v.reshape(k, hop) ** 2, 1) + 1e-12)
    speaking = np.percentile(level[level > level.max() - 40], 90)
    target = -CARVE_DB * np.clip((level - (speaking - 30)) / 15, 0, 1)
    attack, release = (math.exp(-0.01 / tc) for tc in CARVE_TIMES)
    gain = np.empty(k)
    now = 0.0
    for i in range(k):
        c = attack if target[i] < now else release
        now = c * now + (1 - c) * target[i]
        gain[i] = now
    t = np.arange(k) * 0.01
    for h in hits:
        u = np.clip((t - h - CARVE_HIT[0]) / (CARVE_HIT[1] - CARVE_HIT[0]), 0, 1)
        free = np.where((t >= h - 0.01) & (t < h + CARVE_HIT[1]), 0.5 + 0.5 * np.cos(np.pi * u), 0.0)
        gain *= 1 - free
    g = 10 ** (np.interp(np.arange(n) / SR, t, gain) / 20)
    mid = np.stack([band(x[:, c], *CARVE) for c in range(2)], 1)
    return x - mid * (1 - g)[:, None], gain


# ------------------------------------------------------------------ the film's cues


def main():
    work = Path(sys.argv[1]).resolve()
    cues = json.loads((work / "sound-as-one" / "cues.json").read_text())
    lines = {l["key"]: l for l in cues["lines"]}
    w = lambda key, i: lines[key]["words"][i]["start"]  # noqa: E731
    drop, bars = cues["drop"], cues["bars"]
    out = np.zeros((N + 5 * SR, 2))

    def put(at, x, db=0.0):
        """x laid on the film at `at` seconds (its first sample), db its level."""
        if x.ndim == 1:
            x = stereo(x)
        s = int(round(at * SR))
        if s < 0:
            x, s = x[-s:], 0
        out[s:s + len(x)] += x[: len(out) - s] * 10 ** (db / 20)

    def ending(at, x, db=0.0):
        """x laid so that its last sample falls at `at`."""
        put(at - len(x) / SR, x, db)

    hits = []  # where a struck sound lands: the carve lets its first moments through

    operate = w("s1", 7)
    # the night, and the light coming on: a low swell rising to the key's B flat, cut by the hit
    put(0.0, drone(operate, hz("F1", 0.0), hz("Bb1", 0.0), attack=1.6), -20)
    put(operate, impact(operate, 0.6, rt60=3.6), -7)
    put(operate + 0.02, reverb(shimmer(operate, ["Bb5", "F6", "C6", "Db6"], 3.2, 0.35, 1.3), 3.0, 0.45, seed=11), -17)
    put(operate + 0.05, whoosh(2.2, 600, 5200, -0.3, 0.3, 1.6), -22)
    # the noise: a glass tick as each pane comes in, and each tab, the AI's a fifth higher
    panes = [w("s2", 0), w("s2", 3), w("s2", 5), w("s2", 6), w("s2", 9), w("s2", 11), w("s3", 2), w("s3", 3),
             w("s3", 3) + 0.32]
    tabs = [w("s2", 12), w("s2", 13), w("s2", 14), w("s2", 15), w("s2", 16), w("s2", 17)]
    keys = ["F7", "Db7", "Bb6", "Eb7", "C7", "Ab6", "F7", "Db7", "Bb6"]
    for k, (at, n) in enumerate(zip(panes, keys)):
        put(at, reverb(stereo(tick(hz(n, at)), (k % 3 - 1) * 0.5), rt60=1.2, mix=0.3, seed=13), -27)
    hits += panes + tabs
    for k, at in enumerate(tabs):
        put(at, reverb(stereo(tick(hz("Bb6" if k != 3 else "F7", at), 0.08), -0.2 + 0.08 * k), 1.0, 0.25, seed=13),
            -29 if k != 3 else -24)
    # "ambition": the glass breaks, its pieces rushing past the lens
    amb = w("s3", 5)
    put(amb, reverb(glass_break(1.9), rt60=1.8, mix=0.25, seed=17), -15)
    hits.append(amb)
    put(amb + 0.05, whoosh(1.1, 5000, 700, -0.8, 0.8, 1.0), -17)
    # "the question changes": drawn in backwards to a soft hit as the core flares
    changes = w("s3", 8)
    ending(changes, reverse_swell(changes, 0.9, 0.8), -21)
    put(changes, impact(changes, 0.35, rt60=2.6), -15)
    hits.append(changes)
    # the five tiers: a chime as each box comes in, rising through the key to its B flat; then the network's data as
    # they join. The music holds its F under them (F4 and F6 at +35 to +51 cents, but F5 at +21 to +28): a chime on F
    # would beat against it, so the chimes rise around it
    # (each struck as its box starts in, 60 ms before its name is spoken, so that it is heard before the word, and
    # short, so that it has rung out before the next name)
    for k, n in enumerate(["Bb4", "Db5", "Eb5", "Ab5", "Bb5"]):
        at = w("s4", k) - 0.06
        put(at, reverb(stereo(bell(hz(n, at), 1.4, 1.0, 0.28), -0.5 + 0.25 * k, 0.3), rt60=1.8, mix=0.3, seed=19), -17)
        hits.append(at)
    put(w("s4", 4) + 0.15, streaks(0.9, 26, 5000, 12000), -22)
    # the silent bar: silent for its line; from its last word, drawn in backwards into the drop, rising to the key's F
    ending(drop, reverse_swell(drop, 0.55, 1.0, seed=23), -12)
    ending(drop, riser(0.42, 900, 10000, (hz("F3", drop), hz("F5", drop)), 3.0), -22)
    put(drop, impact(drop, 1.4, rt60=4.0), -1)
    hits.append(drop)
    put(drop + 0.04, whoosh(1.3, 2600, 260, 0.6, -0.6, 1.3), -14)
    # the network's links running out, the hit on "destinations", the dive and the chase
    put(drop + 0.75, streaks(2.6, 70, 5000, 12000), -20)
    dest = w("s6", 8)
    put(dest, impact(dest, 0.5, rt60=2.8), -11)
    hits.append(dest)
    put(dest + 0.15, whoosh(1.2, 900, 3600, 0.2, -0.4, 1.4), -18)
    put(dest + 0.95, whoosh(1.0, 4200, 400, -0.6, 0.6, 1.0), -15)
    chase = w("s7", 1)
    put(chase - 0.05, whoosh(0.9, 3000, 9000, -0.9, 0.9, 0.9), -14)
    context = w("s7", 5)
    put(context + 0.1, reverb(stereo(tick(hz("F7", context)), 0.4), 1.2, 0.3, seed=29), -26)
    put(context + 0.35, reverb(stereo(tick(hz("Db7", context)), 0.5), 1.2, 0.3, seed=29), -26)
    hits += [context + 0.1, context + 0.35]
    # a rise into "one", its impact, the beams going up
    one = w("s7", 14)
    ending(one, riser(1.3, 400, 9000, (hz("Bb2", one), hz("F5", one)), 2.6), -17)
    ending(one, reverse_swell(one, 0.6, 1.0, seed=31), -16)
    put(one, impact(one, 1.0, rt60=3.6), -5)
    hits.append(one)
    put(one + 0.04, whoosh(1.0, 500, 7000, 0.0, 0.0, 1.6), -17)
    # the next tool comes apart; the country's light runs into the core; the triangle closes
    tool = w("s8", 7) - 0.02
    put(tool, reverb(dissolve(tool, 1.1), rt60=2.2, mix=0.35, seed=37), -19)
    ask, becomes, system = w("s9", 0), w("s9", 6), w("s9", 8)
    put(ask - 0.1, drone(system - ask + 0.1, hz("F1", ask), hz("Bb1", ask), attack=0.8), -20)
    put(becomes, reverb(stereo(bell(hz("F5", becomes), 1.6, 0.6)), 2.0, 0.35, seed=41), -25)
    put(system, thunk(system), -6)
    hits += [becomes, system]
    # the reveal: drawn in backwards into "Aurixa", its impact and its shimmer; the light sweeping the logo
    aurixa, systems = w("s10", 0), w("s10", 1)
    ending(aurixa, reverse_swell(aurixa, 1.1, 1.2, seed=43), -10)
    # the voice peaks on "Aurixa" 0.2 s into the hit, at full scale: a lighter boom under it, so the mix's limiter
    # does not have to take the word down with it
    put(aurixa, impact(aurixa, 1.6, rt60=4.4, weight=0.45), -2)
    hits.append(aurixa)
    put(aurixa + 0.03, reverb(shimmer(aurixa, ["Bb4", "F5", "Bb5", "Db6", "F6"], 4.2, 0.4, 1.8), 3.6, 0.5, seed=47),
        -15)
    put(systems + 0.45, whoosh(0.9, 3000, 9000, -0.7, 0.7, 0.8), -22)
    put(systems + 0.5, reverb(shimmer(systems, ["F6", "Bb6"], 1.2, 0.05, 0.4), 2.0, 0.4, seed=53), -24)
    # a heartbeat under each of the logo's beats, and the sun coming up
    for at in (systems + 0.05, bars[22], bars[23]):
        put(at, heartbeat(at), -10)
        hits.append(at)
    last = bars[23]
    sun = shimmer(last, ["Bb4", "F5", "C6", "Db6"], LENGTH - last + 0.3, 0.45, 2.0)
    put(last - 0.3, reverb(sun, 2.8, 0.5, seed=59), -18)

    mix = out[:N]
    # the voice first: the sound design gives way to it in its band while it speaks
    mix, given = carve(mix, read_pcm(work / "sound-as-one" / "stems" / "voice.wav"), hits)
    mix = mix - np.stack([band(mix[:, c], 0, 25.0, 2) for c in range(2)], 1)
    # the film ends on its last frame: what still sounds is brought down over its last quarter second
    mix[-int(0.25 * SR):] *= np.linspace(1, 0, int(0.25 * SR))[:, None] ** 2
    mix = peak(mix, 10 ** (-1 / 20))
    dst = work / "sound-we-are-here" / "sfx.wav"
    dst.parent.mkdir(parents=True, exist_ok=True)
    v = np.clip(np.round(mix * (1 << 23)), -(1 << 23), (1 << 23) - 1).astype(np.int32)
    b = np.stack([v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF], -1).astype(np.uint8)
    with wave.open(str(dst), "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(3)
        f.setframerate(SR)
        f.writeframes(b.tobytes())
    print(json.dumps({"sfx": str(dst), "seconds": LENGTH, "carved_db": {"mean_while_speaking": round(float(
        np.mean(given[given < -0.5])), 2), "deepest": round(float(given.min()), 2)}}))


if __name__ == "__main__":
    main()
