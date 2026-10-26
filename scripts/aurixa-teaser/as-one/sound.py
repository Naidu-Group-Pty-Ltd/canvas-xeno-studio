#!/usr/bin/env python3
"""As One's soundtrack: National Treasures from its first sample, as the client's reference has it, with Gabby's dry
voice speaking the reference's script over it.

  python3 -I scripts/aurixa-teaser/as-one/sound.py <sound dir> <national treasures, decoded to 48 kHz WAV>

<sound dir> holds vo/full.wav and vo/takes.json (voice.py). Writes stems/voice.wav, stems/music.wav, mix.wav (24-bit,
48 kHz stereo, 45.5 s) and cues.json: every spoken word on the film's clock, each sentence's place, and the track's
bars. master.py then brings mix.wav to -14 LUFS and -1 dBTP.

The music is the reference's, measured (docs/brands/aurixa-teaser/REFERENCE.md, reference/ntgain.py):
  - National Treasures from 0.000 s, uncut and unstretched, every band at the same gain;
  - -1 dB to the drop (22.2549 s), then easing from -1.5 dB to -4 dB by 42 s, held, and faded out from 43.95 s at
    12 dB a second, as the reference fades it, closing on silence in the last 60 ms;
  - nothing ducked under the voice, as in the reference.

The voice is the brand voice's single take of the whole script, so its delivery runs on as one reading, cut into its
eleven sentences in the silences between them and placed on the track: the five names in the intro's last bars,
"Powerful on their own." alone in the bar where the track falls silent, ending 0.2 s before the drop, and every
sentence after it clear of the drop's first hit. It is dry, as the reels' voices are and the reference's is: no
reverb, no compression, no EQ but a high-pass at 70 Hz under the speech. It sits 4.9 LU over the music through the
intro: the reference's balance is 2.9, and the 2 LU more keep the words clear of the intro's keys, which share the
speech band, on a phone's speaker as on headphones.
"""
import json
import sys
import wave
from pathlib import Path

import numpy as np
from scipy import signal

SR = 48000
LENGTH = 45.5
N = int(LENGTH * SR)
DROP = 22.2549  # bar 0 of National Treasures (scripts/aurixa-reel-2/national_treasures.py)
BAR = 4 * 0.46514101885610903

# The take is laid down in three runs, each as the voice read it, and only the silences between the runs are set:
#   sentences 1 to 5 as read, "own." ending S5_CLEAR before the drop, so the last line of the intro is heard alone in
#     the bar where the track falls silent;
#   sentence 6 after the drop's first hit, its first word S6_AFTER past it;
#   sentences 7 to 11 as read, "one." sounding on the bar, where everything acts as one.
ENDS = ["differently.", "tab.", "changes.", "communication.", "own.", "destinations.", "one.", "is.", "system.",
        "Systems.", "coming."]
RUNS = [(0, 5), (5, 6), (6, 11)]
S5_CLEAR = 0.2
S6_AFTER = 0.70
BALANCE_LU = 4.9  # the voice over the music through the intro (the reference's: 2.9)
S7_ONE_ON = DROP + 6 * BAR  # 33.419 s


def read(path):
    with wave.open(str(path)) as w:
        sr, ch, width = w.getframerate(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(w.getnframes())
    if width == 2:
        x = np.frombuffer(raw, np.int16).astype(np.float64) / 32768
    elif width == 3:
        b = np.frombuffer(raw, np.uint8).reshape(-1, 3).astype(np.int32)
        v = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)
        x = np.where(v >= 1 << 23, v - (1 << 24), v).astype(np.float64) / (1 << 23)
    else:
        raise SystemExit(f"{path}: {width * 8}-bit PCM is not read here")
    if sr != SR:
        raise SystemExit(f"{path}: {sr} Hz, not {SR}")
    return x.reshape(-1, ch)


def write24(path, x):
    v = np.clip(np.round(x * (1 << 23)), -(1 << 23), (1 << 23) - 1).astype(np.int32)
    b = np.stack([v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF], -1).astype(np.uint8)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(3)
        w.setframerate(SR)
        w.writeframes(b.tobytes())


def k_loudness(x):
    """Integrated loudness by ITU-R BS.1770 (K-weighting, 400 ms blocks, both gates), for setting the voice's level;
    the finished mix is measured by FFmpeg's meter in master.py."""
    x = np.atleast_2d(x.T).T
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    y = signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    z = np.array([(y[i:i + blk] ** 2).mean(0).sum() for i in range(0, len(y) - blk, hop)])
    lk = -0.691 + 10 * np.log10(z + 1e-20)
    z = z[lk > -70]
    rel = -0.691 + 10 * np.log10(z.mean()) - 10
    z = z[-0.691 + 10 * np.log10(z) > rel]
    return -0.691 + 10 * np.log10(z.mean())


def main():
    out = Path(sys.argv[1])
    nt = read(sys.argv[2])
    (out / "stems").mkdir(parents=True, exist_ok=True)
    takes = json.loads((out / "vo/takes.json").read_text())["full"]
    take = read(out / "vo/full.wav")[:, 0]
    words = takes["words"]

    # ---- the music: the track from 0, the reference's gains, its fade
    music = nt[:N].copy()
    t = np.arange(N) / SR
    g_db = np.where(t < DROP, -1.0, -1.5 + (-4.0 + 1.5) * np.clip((t - DROP) / (42.0 - DROP), 0, 1))
    g_db = np.where(t > 43.95, g_db - 12.0 * (t - 43.95), g_db)
    gain = 10 ** (g_db / 20)
    tail = int(0.06 * SR)
    gain[-tail:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, tail)))
    music *= gain[:, None]

    # ---- the voice: the take cut in its silences between sentences
    sents, cur = [], []
    for w in words:
        cur.append(w)
        if w["text"] == ENDS[len(sents)]:
            sents.append(cur)
            cur = []
    if len(sents) != 11 or cur:
        raise SystemExit("the take's words are not the script's eleven sentences")
    sos = signal.butter(2, 70, "high", fs=SR, output="sos")
    take = signal.sosfiltfilt(sos, take)
    env = np.sqrt(np.convolve(take ** 2, np.ones(480) / 480, mode="same"))  # 10 ms RMS
    env_db = 20 * np.log10(env + 1e-9)
    # The cut between two sentences: the quietest 10 ms between one's last word and the next's first.
    cuts = [0]
    for a, b in zip(sents, sents[1:]):
        lo, hi = int((a[-1]["end"] - 0.02) * SR), int((b[0]["start"] + 0.04) * SR)
        cuts.append(lo + int(np.argmin(env_db[lo:hi])))
    cuts.append(len(take))
    floor = np.percentile(env_db, 99.5) - 45
    clips = []
    for i in range(11):
        a, b = cuts[i], cuts[i + 1]
        seg = take[a:b].copy()
        f = int(0.010 * SR)
        seg[:f] *= np.linspace(0, 1, f)
        seg[-f:] *= np.linspace(1, 0, f)
        loud = np.nonzero(env_db[a:b] > floor)[0]
        on, off = loud[0] / SR, loud[-1] / SR  # the sentence's first and last sound, within its clip
        clips.append({"seg": seg, "on": on, "off": off, "cut": a / SR})
    # Each run's shift, take time to film time.
    one = next(w for w in sents[6] if w["text"] == "one.")
    o0 = int((one["start"] - 0.06) * SR)
    one_on = (o0 + np.nonzero(env_db[o0:o0 + int(0.2 * SR)] > floor + 20)[0][0]) / SR  # its voice beginning
    shifts = [DROP - S5_CLEAR - (clips[4]["cut"] + clips[4]["off"]),
              DROP + S6_AFTER - sents[5][0]["start"],
              S7_ONE_ON - one_on]
    voice = np.zeros(N)
    lines = []
    for (first, last), shift in zip(RUNS, shifts):
        for i in range(first, last):
            c = clips[i]
            s0 = int(round((c["cut"] + shift) * SR))  # where the clip's first sample goes
            seg = c["seg"][: max(0, N - s0)]
            voice[s0:s0 + len(seg)] += seg
            lines.append({"key": f"s{i + 1}", "shift": round(shift, 4),
                          "start": round(sents[i][0]["start"] + shift, 3),
                          "sound": [round(c["cut"] + c["on"] + shift, 3), round(c["cut"] + c["off"] + shift, 3)],
                          "text": " ".join(w["text"] for w in sents[i]),
                          "words": [{"text": w["text"], "start": round(w["start"] + shift, 3),
                                     "end": round(w["end"] + shift, 3)} for w in sents[i]]})
    for a, b in zip(lines, lines[1:]):
        if b["sound"][0] < a["sound"][1]:
            raise SystemExit(f"{a['key']} and {b['key']} run into each other")
    if lines[4]["sound"][1] > DROP - 0.15 or lines[5]["sound"][0] < DROP:
        raise SystemExit("the drop is not clear of the voice")
    if lines[-1]["sound"][1] > LENGTH - 1.0:
        raise SystemExit("the last line runs into the fade's end")

    # ---- the balance: the voice BALANCE_LU over the music through the intro
    intro = slice(0, int(DROP * SR))
    v_gain_db = (k_loudness(music[intro]) + BALANCE_LU) - k_loudness(voice[intro])
    voice *= 10 ** (v_gain_db / 20)
    mix = music + voice[:, None]
    write24(out / "stems/music.wav", music)
    write24(out / "stems/voice.wav", np.repeat(voice[:, None], 2, 1))
    write24(out / "mix.wav", mix)
    cues = {
        "length": LENGTH, "drop": DROP, "bar": BAR,
        "bars": [round(DROP + k * BAR, 4) for k in range(-12, 13) if 0 <= DROP + k * BAR < LENGTH],
        "voice_gain_db": round(float(v_gain_db), 2),
        "lines": lines,
    }
    (out / "cues.json").write_text(json.dumps(cues, indent=1))
    for ln in lines:
        print(f"{ln['key']:>4} words from {ln['start']:6.2f}, sound {ln['sound'][0]:6.2f}-{ln['sound'][1]:6.2f}  {ln['text']}")
    print(f"voice gain {v_gain_db:+.2f} dB; intro: music {k_loudness(music[intro]):.1f}, voice {k_loudness(voice[intro]):.1f} LUFS;"
          f" after the drop: music {k_loudness(music[int(DROP * SR):int(44 * SR)]):.1f},"
          f" voice {k_loudness(voice[int(DROP * SR):int(44 * SR)]):.1f} LUFS")


if __name__ == "__main__":
    main()
