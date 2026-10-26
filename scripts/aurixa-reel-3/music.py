"""Reel 3's music: National Treasures, the client's track (Reel 1's), cut on its own bar lines under Reel 3's cut,
as pacing.py lays it out. Nothing is stretched: the cut was paced to the track's own tempo (128.99 BPM) from the
start, so its pieces (pacing.json's music.pieces) play the file as it is.

  python3 -I scripts/aurixa-reel-3/music.py <Drake – National Treasures (Instrumental).mp3> <dir>
      decodes the track (<dir>/music.wav, 48 kHz stereo, for soundtrack.ts), checks its beat where the fit cuts it,
      decides how each piece comes in, and writes docs/brands/aurixa-reel-3/music-national-treasures.json
  bun scripts/aurixa-reel-3/soundtrack.ts <dir>
      the soundtrack, mixed by the studio's own mixer, with its mix report

The pieces are pacing.json's, never restated here: this record adds to each how it comes in, and says how each
stretch of the film sits under the voice (SECTIONS). Where the track does what it did in Reels 1 and 2 it sits as the
client approved it there: the intro 0.6 ducking to 0.25, the groove 0.5 to 0.22, the breakdown never ducked, the
bass hit under each statement never ducked (the last, the softest spoken, the quietest), the full return 0.6 to 0.3
(scripts/aurixa-reel-2/national_treasures.py).

How a piece comes in is Reel 2's rule (national_treasures.py, ENTRY_LEAD): a join's crossfade starts half of it ahead
of the splice, which is itself 20 ms ahead of the bar line, so the incoming piece sounds the last 35 ms of the bar
before its own. Out of a quiet film into a bar the track reaches already sounding, that is the piece arriving 35 ms
early, so a piece whose 35 ms before its bar line is more than EARLY_DB louder than what the film plays there, and
within MUSIC_DB of its bar's own first 100 ms, enters on its bar line instead: led in by ENTRY_LEAD and faded in over
it, at full level on the bar.
"""
import hashlib
import json
import subprocess
import sys
from itertools import pairwise
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
DOCS = HERE.parents[1] / "docs" / "brands" / "aurixa-reel-3"
OUT = DOCS / "music-national-treasures.json"
PACING = json.loads((DOCS / "pacing.json").read_text())
GRID = PACING["music"]
TRACK = GRID["track"]
ASSET = TRACK["asset"]
SHA256 = TRACK["sha256"]
PERIOD = GRID["period"]  # one beat of the track, 0.465141 s; a bar is four
DROP = GRID["drop"]  # the drop's attack in the file (bar 0), measured for Reel 1
FIRST_DOWNBEAT = GRID["first_downbeat"]
LEAD = GRID["splice_lead"]
XF = GRID["crossfade"]
SR = 48000

# How each stretch of the film sits under the voice: (label, film bar from, film bar to (None: the end), volume,
# duck level (None: never ducks)). The film's bars are pacing.json's (music.film_bars).
SECTIONS = [
    ("The intro's last eight bars, falling silent into the drop", 0, 8, 0.6, 0.25),
    ("The drop and the groove, under the brand and the questionnaire", 8, 14, 0.5, 0.22),
    ("The intro's last two bars again, falling away under 'here's where speed meets opportunity'", 14, 16, 0.6, 0.25),
    ("The drop again on 'With just one click', the groove under the assessment and the handover", 16, 42, 0.5, 0.22),
    ("The groove thinned, under the partner portal and what each gains", 42, 50, 0.5, 0.22),
    ("The breakdown's first phrase, under 'And that's just the beginning.'", 50, 52, 0.7, None),
    ("The groove's return, lighter, under the platform and the Aurixa Agent", 52, 60, 0.5, 0.22),
    ("The stop's bass hit on 'This means', and its quiet", 60, 61, 0.7, None),
    # The keys sit in the voice's own band, and the voice says what it means softly: at the groove's 0.5 to 0.22 it
    # was 4.9 dB clear (the studio's floor is 8), so the build starts lower and ducks further.
    ("The keys building, under what it means", 61, 65, 0.38, 0.14),
    ("The biggest section, under 'Aurixa Systems has arrived' and the free trial", 65, 71, 0.6, 0.25),
    ("Statement 1, on the bass hit", 71, 72, 0.7, None),
    ("Statement 2, on the bass hit", 72, 73, 0.6, None),
    ("Statement 3, on the bass hit", 73, 74, 0.5, None),
    ("The full return, the closing hit and its ring", 74, None, 0.6, 0.3),
]
ENTRY_LEAD = 0.003
EARLY_DB = 6.0
MUSIC_DB = 12.0


def film_bar(b):
    return FIRST_DOWNBEAT + 4 * b * PERIOD


def attack(b):
    """The track's bar b's attack in the file (bar 0 is the drop)."""
    return DROP + 4 * b * PERIOD


def run(args):
    return subprocess.run(args, check=True, capture_output=True)


def mono(wav):
    raw = run(["ffmpeg", "-v", "error", "-i", str(wav), "-ac", "1", "-f", "f32le", "-"]).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def level(x, a, b):
    seg = x[int(a * SR):int(b * SR)]
    return float(20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-9))


def volume_db(film):
    return float(20 * np.log10(next(v for _, a, b, v, _ in SECTIONS if a <= film and (b is None or film < b))))


def onsets(x):
    hop, win = SR // 200, SR // 50
    n = (len(x) - win) // hop
    frames = np.lib.stride_tricks.as_strided(x, (n, win), (x.strides[0] * hop, x.strides[0]))
    lv = 10 * np.log10(np.mean(frames ** 2, axis=1) + 1e-12)
    rise = np.maximum(np.diff(lv, prepend=lv[0]), 0)
    return rise, len(x) / SR


def attack_near(rise, t, reach):
    """The strongest onset within `reach` of t: its time (the window's start, as its level first rises) and its
    strength in dB."""
    a, b = max(0, int((t - reach) * 200)), min(len(rise), int((t + reach) * 200) + 1)
    k = a + int(np.argmax(rise[a:b]))
    return k / 200, float(rise[k])


def first_rise(x, t, before=0.03, after=0.012, step=0.001):
    """Where a bar's attack begins, to the millisecond: the first 1 ms at least 12 dB over the level of the 15 ms
    before the search window's middle; None where the track is already sounding there (no quiet to rise out of)."""
    steps = np.arange(t - before, t + after, step)
    lv = [20 * np.log10(np.sqrt(np.mean(x[int(a * SR):int((a + step) * SR)] ** 2)) + 1e-9) for a in steps]
    base = float(np.median(lv[:15]))
    if base > -30:
        return None, base
    return next((float(a) for a, v in zip(steps, lv) if v > base + 12), None), base


def main():
    src, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    digest = hashlib.sha256(src.read_bytes()).hexdigest()
    if digest != SHA256:
        sys.exit(f"{src} is not the client's National Treasures (SHA-256 {digest})")
    out_dir.mkdir(parents=True, exist_ok=True)
    music = out_dir / "music.wav"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af", f"aresample={SR}", "-ac", "2", "-c:a", "pcm_f32le",
         str(music)])
    x = mono(music)
    rise, seconds = onsets(x)
    pieces = [dict(p) for p in GRID["pieces"]]
    # The bars either side of every cut, and the drop: their attacks are where the grid says. The onset detector
    # reports a window's start, so it is read against the drop as it finds it (Reel 2's check); and where a bar rises
    # out of quiet, its attack is found to the millisecond and must come after its splice, so no note is cut.
    drop_found, drop_db = attack_near(rise, DROP, 0.25)
    bias = drop_found - DROP
    cut_bars = sorted({b for p in pieces for b in p["bars"] if b is not None}
                      | {b + d for p in pieces for b in p["bars"] if b is not None for d in (-1, 1)} | {0})
    checks = []
    for b in cut_bars:
        if attack(b) >= seconds - 0.1 or attack(b) < 0.1:
            continue
        found, db = attack_near(rise, attack(b) + bias, 0.06)
        begins, base = first_rise(x, attack(b))
        checks.append({"bar": b, "expected": round(attack(b), 4), "onset": round(found - bias, 4),
                       "off_ms": round(1000 * (found - bias - attack(b)), 1), "rise_db": round(db, 1),
                       "attack_begins": None if begins is None else round(begins, 4),
                       "after_splice_ms": None if begins is None else round(1000 * (begins - attack(b) + LEAD), 1),
                       "quiet_before_db": round(base, 1)})
    clear = [c for c in checks if c["rise_db"] >= 6]
    worst = max((abs(c["off_ms"]) for c in clear), default=0.0)
    if worst >= 1000 * LEAD:
        sys.exit(f"an attack is {worst} ms from the grid where the fit cuts: {json.dumps(clear)}")
    cut = [c for c in checks if c["after_splice_ms"] is not None and c["after_splice_ms"] <= 0]
    if cut:
        sys.exit(f"a splice cuts into its bar's attack: {json.dumps(cut)}")
    for p, q in pairwise(pieces):  # each piece ends where the next begins in the film
        if abs(p["film_at"] + p["file_to"] - p["file_from"] - q["film_at"]) > 1e-4:
            sys.exit(f"the piece at film bar {p['film_bar']} does not meet the next")
    for p, q in pairwise(pieces):  # how each piece comes in
        early = level(x, q["file_from"] - XF / 2, q["file_from"] + LEAD) + volume_db(q["film_bar"])
        own = level(x, q["file_from"] + LEAD, q["file_from"] + LEAD + 0.1) + volume_db(q["film_bar"])
        outgoing = level(x, p["file_to"] - XF / 2, p["file_to"] + LEAD) + volume_db(q["film_bar"] - 1)
        q["entry"] = "bar" if early - outgoing > EARLY_DB and own - early < MUSIC_DB else "crossfade"
        q["entry_levels_db"] = {"before_its_bar": round(early, 1), "the_film_there": round(outgoing, 1),
                                "its_bar": round(own, 1)}
    record = {
        "written": "2026-10-24",
        "note": ("National Treasures, the client's track (Reel 1's), under Reel 3's cut at its own tempo, cut on its own "
                 "bar lines as pacing.py lays it out (music.py): nothing stretched."),
        "asset": ASSET,
        "file": f"Drake – National Treasures (Instrumental).mp3, {seconds:.3f} s, SHA-256 {SHA256}",
        "beat_checked": {"bars": checks, "worst_clear_ms": worst, "drop_found": round(drop_found, 4),
                         "drop_rise_db": round(drop_db, 1), "detector_bias_ms": round(1000 * bias, 1),
                         "least_after_splice_ms": min((c["after_splice_ms"] for c in checks
                                                       if c["after_splice_ms"] is not None), default=None)},
        "period": PERIOD,
        "first_downbeat": FIRST_DOWNBEAT,
        "splice_lead": LEAD,
        "crossfade": XF,
        "entry_lead": ENTRY_LEAD,
        "bars": GRID["bars"],
        "film_bars": GRID["film_bars"],
        "ring": GRID["ring"],
        "pieces": pieces,
        "sections": [{"label": label, "from_bar": a, "to_bar": b, "volume": v, "duck": d}
                     for label, a, b, v, d in SECTIONS],
    }
    OUT.write_text(json.dumps(record, indent=1, ensure_ascii=False) + "\n")
    print(f"{music}: {seconds:.3f} s at {60 / PERIOD:.3f} BPM; the clear attacks where the fit cuts are within "
          f"{worst} ms of the grid")
    for c in checks:
        print(f"  bar {c['bar']:4d}: expected {c['expected']:9.4f}, onset {c['onset']:9.4f}, {c['off_ms']:+6.1f} ms, "
              f"rise {c['rise_db']:5.1f} dB; attack {c['after_splice_ms']} ms after its splice")
    for q in pieces[1:]:
        print(f"  film bar {q['film_bar']:3d} (the track's {q['bars'][0]:3d}) enters "
              f"{'on its bar line' if q['entry'] == 'bar' else 'under the crossfade'}: {q['entry_levels_db']}")
    print(f"{len(pieces)} pieces -> {OUT}")


if __name__ == "__main__":
    main()
