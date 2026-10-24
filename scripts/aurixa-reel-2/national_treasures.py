"""Reel 2 to National Treasures: the client's track (Drake, National Treasures, the instrumental Reel 1 was cut to)
fitted under Reel 2's approved cut, which stays exactly as it is.

  python3 -I scripts/aurixa-reel-2/national_treasures.py <National Treasures.mp3> <dir>
      stretches the track to the cut's beat (<dir>/music.wav, 48 kHz stereo, for soundtrack.ts), checks its beat
      where the fit cuts it, and writes docs/brands/aurixa-reel-2/music-national-treasures.json
  bun scripts/aurixa-reel-2/soundtrack.ts <dir> --music docs/brands/aurixa-reel-2/music-national-treasures.json
      the soundtrack, mixed by the studio's own mixer, with its mix report

The client chose (24 October 2026) to keep the picture approved at Gates 2 and 3 and to put National Treasures
under it. The cut is paced to a 120.01 BPM score: every cut after the drop on its beat, every anchor on its bar
(pacing.json). National Treasures runs at 128.99 BPM (measured for Reel 1: scripts/aurixa-reel-1/pacing.py), so
it is slowed to the cut's beat, 7.0%, by Rubber Band (ffmpeg's rubberband filter: its pitch kept, its finest
quality, its channels together), and then cut on its own bar lines as Reel 1 cut it. The track's sections, from
the loudness of each of its 134 bars (bar 0 is the drop):

  bars -11 to -1   the intro: a note on every bar line, no drums, falling silent in its last bar
  bars 0 to 31     the drop and the groove
  bars 32 to 39    the groove thinned, its last bar leading into the breakdown
  bars 40 to 47    the breakdown, about 22 dB down, a faint figure ending each two-bar phrase
  bars 48 to 70    the groove's return, lighter, hats every other bar
  bar 71           a bass hit, then near silence: the track's stop
  bars 80 to 95    its biggest section, ending on bar 95's hit and a cymbal's ring

The fit, bar by bar of the film (its bars are the score's, pacing.json):

  film bars 0 to 20    the intro, its fall to silence the stall before the brand, then the drop on the brand's cut
  film bars 21 to 35   the fall to silence again under "And here's where it gets exciting", and the drop again on
                       the Passport's cut
  film bars 36 to 38   the bar that leads the track into its breakdown, then the breakdown's first phrase under
                       "The result?"
  film bars 39 to 49   the return, lighter, as the score's groove came back lighter
  film bars 50 to 53   the four statements, each on the track's bass hit and its ring, as the score's four stabs
  film bars 54 to 58   the full return on the closing card: the last four bars of the track's biggest section, then
                       its closing hit on the final press, the cymbal ringing out to the film's last frame

Every edit point sits 20 ms ahead of a bar's attack, so no note is cut, and is a 30 ms equal-power crossfade
(soundtrack.ts), except where a piece comes in out of quiet onto a bar the track reaches already sounding: the
statements' bass hit and the full return. A crossfade there would play the last 35 ms of the bar before the
piece's own, so the piece would arrive 35 ms early, and it enters on its bar line instead (ENTRY_LEAD). The
voiceover is untouched: it is the paced voiceover the picture was cut to.
"""
import hashlib
import json
import subprocess
import sys
from itertools import pairwise
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
DOCS = HERE.parents[1] / "docs" / "brands" / "aurixa-reel-2"
OUT = DOCS / "music-national-treasures.json"

# The client's file, as the studio holds it (Reel 1's asset).
ASSET = "221832d4-8d43-4302-b7a4-9fb517e80c5f"  # Drake – National Treasures (Instrumental).mp3, 272.25 s
SHA256 = "b22fc04d38b20007488cbd8669b2fe38352f81b29e2af46364d473af6e46d863"
# Its beat, measured for Reel 1 (scripts/aurixa-reel-1/pacing.py): one grid from 22 s to 200 s, rms 9.7 ms; beat 0
# is the drop, and the drop's attack (its onset) is 40 ms ahead of the tracked beat.
NATIVE_PERIOD = 0.46514101885610903
NATIVE_DROP = 22.29489162418665 - 0.04004

PACING = json.loads((DOCS / "pacing.json").read_text())
GRID = PACING["music"]
PERIOD = GRID["period"]  # the cut's beat, 0.499978 s
FIRST_DOWNBEAT = GRID["first_downbeat"]
LEAD = GRID["splice_lead"]
TEMPO = NATIVE_PERIOD / PERIOD  # Rubber Band's tempo: below 1 slows the track down
SR = 48000

# (film bar, the track's bar from, its bar to (exclusive; None: to its end), why)
PIECES = [
    (0, -11, 10, "the intro, falling silent in its last bar, then the drop on the brand's cut and its groove"),
    (21, -1, 14, "the fall to silence again, then the drop again on the Passport's cut and its groove"),
    (36, 39, 42, "the bar that leads the track into its breakdown, then the breakdown's first phrase"),
    (39, 48, 59, "the groove's return, lighter"),
    (50, 71, 72, "statement 1: the track's bass hit and its ring"),
    (51, 71, 72, "statement 2: the bass hit again"),
    (52, 71, 72, "statement 3: the bass hit again"),
    (53, 71, 72, "statement 4: the bass hit again"),
    (54, 91, None, "the full return: the last bars of the track's biggest section, then its closing hit and ring"),
]
# How each stretch of the film sits under the voice: (label, film bar from, film bar to (None: the end), volume,
# duck level (None: never ducks)). Where a stretch does what it did in Reel 1, it sits as the client approved it there
# (scripts/aurixa-reel-1/soundtrack.ts): the intro 0.6 ducking to 0.25, the groove 0.5 to 0.22, the re-entry 0.6 to
# 0.3. The breakdown is the room around "The result?" and is never ducked; it is about 22 dB down in the track, so it
# sits higher than Reel 1's (0.45, under lines). The bar that leads into it is the groove's loudest in the voice's
# band and carries the last words of a line, so it ducks further (0.15: at the groove's 0.22 the voice was 6.5 dB
# clear there, under the studio's 8); free of the voice, it swells into the breakdown. Each statement's bass hit is
# never ducked, so it lands with its word and its ring is the bed between them; the last statement is the softest
# spoken, so its hit is the quietest.
SECTIONS = [
    ("The intro and the stall", 0, 11, 0.6, 0.25),
    ("The drop, the groove, the stall, the second drop and the groove", 11, 36, 0.5, 0.22),
    ("The bar that leads into the breakdown, under the line's last words", 36, 37, 0.5, 0.15),
    ("The breakdown", 37, 39, 0.7, None),
    ("The groove returns, lighter", 39, 50, 0.5, 0.22),
    ("Statement 1, on the bass hit", 50, 51, 0.7, None),
    ("Statement 2, on the bass hit", 51, 52, 0.7, None),
    ("Statement 3, on the bass hit", 52, 53, 0.7, None),
    ("Statement 4, on the bass hit", 53, 54, 0.5, None),
    ("The full return, the closing hit and its ring", 54, None, 0.6, 0.3),
]
# Where the fit cuts the track, and the bars either side of a cut: their attacks are checked in the stretched file.
CHECKED = sorted({-11, -10, -2, -1, 0, 1, 9, 10, 13, 14, 38, 39, 40, 41, 42, 47, 48, 58, 59, 71, 72, 90, 91, 95, 96})
# How a piece comes in. A join's crossfade starts half of it ahead of the splice, which is itself LEAD ahead of the
# bar line, so the incoming piece sounds the last 35 ms of the bar before its own. Where music runs on through the
# join that is part of the blend. Out of a quiet film into a bar the track reaches already sounding (the stop's bass
# hit, the middle of the biggest section) it is the piece arriving 35 ms early: measured at 35 to 40 ms ahead of
# the statements' cuts and the return's, here and in the score's stabs. So a piece whose 35 ms before its bar line
# is more than EARLY_DB louder than what the film plays there, and within MUSIC_DB of its bar's own first 100 ms
# (music, not the quiet before an attack), enters on its bar line: led in by ENTRY_LEAD and faded in over it, at
# full level on the bar. Levels are the file's, at the volume of the stretch the film plays it in.
ENTRY_LEAD = 0.003
EARLY_DB = 6.0
MUSIC_DB = 12.0


def film_bar(b):
    return FIRST_DOWNBEAT + 4 * b * PERIOD


def run(args):
    return subprocess.run(args, check=True, capture_output=True)


def stretch(src, out):
    """The track at the cut's tempo: Rubber Band, its pitch kept, its finest quality, both channels together."""
    run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af",
         (f"rubberband=tempo={TEMPO:.9f}:pitchq=quality:channels=together:transients=crisp:detector=compound,"
          f"aresample={SR}"), "-ac", "2", "-c:a", "pcm_f32le", str(out)])


def mono(wav):
    """A file's samples, its channels averaged."""
    raw = run(["ffmpeg", "-v", "error", "-i", str(wav), "-ac", "1", "-f", "f32le", "-"]).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def level(x, a, b):
    """The level of x from a to b seconds, in dB (RMS)."""
    seg = x[int(a * SR):int(b * SR)]
    return float(20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-9))


def volume_db(film):
    """The volume of the stretch of the film its bar `film` is in, in dB."""
    return float(20 * np.log10(next(v for _, a, b, v, _ in SECTIONS if a <= film and (b is None or film < b))))


def onsets(x):
    """The onset strength every 5 ms: the rise in level (dB, 20 ms windows) from one step to the next."""
    hop, win = SR // 200, SR // 50
    n = (len(x) - win) // hop
    frames = np.lib.stride_tricks.as_strided(x, (n, win), (x.strides[0] * hop, x.strides[0]))
    level = 10 * np.log10(np.mean(frames ** 2, axis=1) + 1e-12)
    rise = np.maximum(np.diff(level, prepend=level[0]), 0)
    return rise, len(x) / SR


def attack_near(rise, t, reach):
    """The strongest onset within `reach` of t: its time (the window's start, as its level first rises) and its
    strength in dB."""
    a, b = max(0, int((t - reach) * 200)), min(len(rise), int((t + reach) * 200) + 1)
    k = a + int(np.argmax(rise[a:b]))
    return k / 200, float(rise[k])


def main():
    src, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    digest = hashlib.sha256(src.read_bytes()).hexdigest()
    if digest != SHA256:
        sys.exit(f"{src} is not the client's National Treasures (SHA-256 {digest})")
    out_dir.mkdir(parents=True, exist_ok=True)
    music = out_dir / "music.wav"
    stretch(src, music)
    x = mono(music)
    rise, seconds = onsets(x)
    # The drop's attack in the stretched file: after the intro's silence, the clearest onset in the track.
    drop, drop_db = attack_near(rise, NATIVE_DROP / TEMPO, 0.25)
    def attack(b):
        return drop + 4 * b * PERIOD
    checks = []
    for b in CHECKED:
        if attack(b) >= seconds - 0.1:
            continue
        found, db = attack_near(rise, attack(b), 0.06)
        checks.append({"bar": b, "expected": round(attack(b), 4), "onset": round(found, 4),
                       "off_ms": round(1000 * (found - attack(b)), 1), "rise_db": round(db, 1)})
    # Where an attack is clear (a rise of 6 dB or more in 5 ms), it must sit within the splice's 20 ms lead.
    clear = [c for c in checks if c["rise_db"] >= 6]
    worst = max((abs(c["off_ms"]) for c in clear), default=0.0)
    if worst >= 1000 * LEAD:
        sys.exit(f"an attack is {worst} ms from the grid where the fit cuts: {json.dumps(clear)}")
    pieces = []
    for film, a, b, why in PIECES:
        file_from = attack(a) - LEAD
        film_at = film_bar(film) - LEAD
        if film == 0:  # the film starts at its own 0: the piece is led in by the time before its first downbeat
            file_from, film_at = attack(a) - film_bar(0), 0.0
        pieces.append({"film_bar": film, "bars": [a, b], "file_from": round(file_from, 6),
                       "file_to": None if b is None else round(attack(b) - LEAD, 6), "film_at": round(film_at, 6),
                       "why": why})
    for p, q in pairwise(pieces):  # each piece ends where the next begins in the film
        if abs(p["film_at"] + p["file_to"] - p["file_from"] - q["film_at"]) > 1e-4:
            sys.exit(f"the piece at film bar {p['film_bar']} does not meet the next")
    xf = GRID["crossfade"]
    for p, q in pairwise(pieces):  # how each piece comes in (ENTRY_LEAD)
        early = level(x, q["file_from"] - xf / 2, q["file_from"] + LEAD) + volume_db(q["film_bar"])
        own = level(x, q["file_from"] + LEAD, q["file_from"] + LEAD + 0.1) + volume_db(q["film_bar"])
        outgoing = level(x, p["file_to"] - xf / 2, p["file_to"] + LEAD) + volume_db(q["film_bar"] - 1)
        q["entry"] = "bar" if early - outgoing > EARLY_DB and own - early < MUSIC_DB else "crossfade"
        q["entry_levels_db"] = {"before_its_bar": round(early, 1), "the_film_there": round(outgoing, 1),
                                "its_bar": round(own, 1)}
    record = {
        "written": "2026-10-24",
        "note": ("National Treasures, the client's track (Reel 1's), under Reel 2's approved cut: slowed 7.0% to the "
                 "cut's beat by Rubber Band, its pitch kept, and cut on its own bar lines (national_treasures.py)."),
        "asset": ASSET,
        "file": f"Drake – National Treasures (Instrumental).mp3, {seconds * TEMPO:.3f} s, SHA-256 {SHA256}",
        "native": {"period": NATIVE_PERIOD, "bpm": round(60 / NATIVE_PERIOD, 3), "drop": round(NATIVE_DROP, 6)},
        "stretch": {"tool": "Rubber Band (ffmpeg rubberband: pitchq=quality, channels=together, transients=crisp)",
                    "tempo": round(TEMPO, 9), "slower_by": f"{100 * (1 - TEMPO):.2f}%",
                    "bpm": round(60 / PERIOD, 3), "seconds": round(seconds, 3),
                    "drop": round(drop, 6), "drop_rise_db": round(drop_db, 1)},
        "beat_checked": {"bars": checks, "worst_clear_ms": worst},
        "period": PERIOD,
        "first_downbeat": FIRST_DOWNBEAT,
        "splice_lead": LEAD,
        "crossfade": GRID["crossfade"],
        "entry_lead": ENTRY_LEAD,
        "bars": GRID["bars"],
        "ring": GRID["ring"],
        "pieces": pieces,
        "sections": [{"label": label, "from_bar": a, "to_bar": b, "volume": v, "duck": d}
                     for label, a, b, v, d in SECTIONS],
    }
    OUT.write_text(json.dumps(record, indent=1, ensure_ascii=False) + "\n")
    print(f"{music}: {seconds:.3f} s at {60 / PERIOD:.3f} BPM (tempo {TEMPO:.6f}); the drop's attack at {drop:.4f} s "
          f"(+{drop_db:.1f} dB); the clear attacks where the fit cuts are within {worst} ms of the grid")
    for c in checks:
        print(f"  bar {c['bar']:4d}: expected {c['expected']:9.4f}, onset {c['onset']:9.4f}, {c['off_ms']:+6.1f} ms, "
              f"rise {c['rise_db']:5.1f} dB")
    for q in pieces[1:]:
        print(f"  film bar {q['film_bar']:3d} (the track's {q['bars'][0]:3d}) enters "
              f"{'on its bar line' if q['entry'] == 'bar' else 'under the crossfade'}: {q['entry_levels_db']}")
    print(f"{len(pieces)} pieces -> {OUT}")


if __name__ == "__main__":
    main()
