"""Reel 3 on National Treasures: the voiceover held open at its silences, and the track cut on its own bars.

  python3 -I scripts/aurixa-reel-3/pacing.py           # solve, check, and write docs/brands/aurixa-reel-3/pacing.json
  python3 -I scripts/aurixa-reel-3/pacing.py --table   # the pauses, and where every cut lands against the music
  python3 -I scripts/aurixa-reel-3/pacing.py --voiceover <voiceover 44.1 kHz 16-bit WAV> <paced.wav>

The client asked for Reel 1's National Treasures under the final (24 October 2026). Reel 2's cut was paced to a
120 BPM score and the track slowed 7.0% to fit it; this cut is paced to the track itself, at its own 128.99 BPM, so
nothing in the music is stretched. Reel 1's and Reel 2's rules hold:

- The voiceover is never stretched. It is held open in its own silences: each pause sits inside one of the silences
  measured in the audio (voiceover-words.json) and adds a whole number of frames there. A cut is moved by every pause
  before it; a pause placed exactly on a cut opens the new shot before its first word.
- The pauses are solved, not typed one by one. A small dynamic programme picks whole frames so that the cuts land on
  beats (a bar line where it can), while the anchors hold exactly: the brand's cut on the drop, "With just one
  click" on the drop again, "And that's just the beginning." on the breakdown and the groove's return after it,
  "This means" on the track's stop, "Aurixa Systems has arrived" on its biggest section, the three statements on
  the stop's bass hit (each as its words appear), the closing card on the full return, "the operating system" and
  "Start your free trial today." on their downbeats, and the press on the closing hit.
- The music is cut on its own bar lines: every piece is a whole number of bars, each edit point 20 ms ahead of its
  bar's attack, so the film's grid runs on unbroken. Its beat was measured for Reel 1 (scripts/aurixa-reel-1/
  pacing.py: one grid from 22 s to 200 s, 0.465141 s, rms 9.7 ms) and its sections for Reel 2 (national_treasures.py),
  bar by bar from the drop (bar 0):

    bars -11 to -1   the intro: a note on every bar line, no drums; its last bar falls silent into the drop
    bars 0 to 31     the drop and the groove, a hit on every other bar
    bars 32 to 39    the groove thinned, its last bar leading into the breakdown
    bars 40 to 47    the breakdown, about 22 dB down, a faint figure ending each two-bar phrase
    bars 48 to 70    the groove's return, lighter
    bar 71           a bass hit, then near silence: the track's stop
    bars 72 to 79    keys without drums, building
    bars 80 to 95    its biggest section, ending on bar 95's hit and a cymbal's ring
"""

import json
import math
import sys
from itertools import pairwise
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import shot_times

FPS = 30
SR = 44100
SPF = (
    SR // FPS
)  # 1470 samples a frame: a pause of whole frames is a whole number of samples
DOCS = HERE.parents[1] / "docs" / "brands" / "aurixa-reel-3"
OUT = DOCS / "pacing.json"
VOICE = json.loads((DOCS / "voiceover-words.json").read_text())

# ------------------------------------------------------------------------------------------------- the music
TRACK = {
    "title": "Drake, National Treasures (instrumental)",
    "asset": "221832d4-8d43-4302-b7a4-9fb517e80c5f",  # Reel 1's asset in the studio
    "file": "Drake – National Treasures (Instrumental).mp3, 272.300 s, 44.1 kHz stereo",
    "sha256": "b22fc04d38b20007488cbd8669b2fe38352f81b29e2af46364d473af6e46d863",
}
PERIOD = 0.46514101885610903  # 128.99 BPM
BAR = 4 * PERIOD
DROP = 22.29489162418665 - 0.04004  # bar 0's attack in the file: the drop
SPLICE_LEAD = (
    0.02  # an edit point sits this far ahead of its bar line, before the bar's notes
)
XFADE = 0.03  # each edit point is an equal-power crossfade this long, centred 20 ms ahead of its bar line
FILM_FIRST = (
    0.03  # the film's first bar line: the intro's first note, a frame into the film
)
RING = (
    2.0  # the picture holds this long after the closing hit, while the cymbal rings out
)


def track_bar(b):
    """The track's bar b (0 is the drop): its attack, in the file's own seconds."""
    return DROP + 4 * b * PERIOD


# The edit: the track's bars, in the order the film plays them. Each entry is (its first bar, the bar after its last,
# why). The film's bars run on from 0 with no gap, so the film's bar n is n bars after its first.
PIECES = [
    (
        -8,
        6,
        (
            "the intro's last eight bars, falling silent into the drop on the brand's cut, and six bars of its "
            "groove under the questionnaire"
        ),
    ),
    (
        -2,
        26,
        (
            "the intro's last two bars again, so the groove falls away under 'here's where speed meets "
            "opportunity', then the drop again on 'With just one click', and its groove through the assessment "
            "and the handover"
        ),
    ),
    (
        32,
        42,
        (
            "the groove thinned, under the partner portal and what each gains, its last bar leading into the "
            "breakdown's first phrase, under 'And that's just the beginning.'"
        ),
    ),
    (48, 56, "the groove's return, lighter, under the platform and the Aurixa Agent"),
    (71, 72, "the stop's bass hit, on 'This means', and its quiet"),
    (
        76,
        86,
        (
            "the keys building into the biggest section, which lands on 'Aurixa Systems has arrived' and runs "
            "through the free trial"
        ),
    ),
    (71, 72, "statement 1: the stop's bass hit and its ring"),
    (71, 72, "statement 2: the bass hit again"),
    (71, 72, "statement 3: the bass hit again"),
    (
        91,
        None,
        "the full return: the last bars of the biggest section, its closing hit on the final press, and the ring",
    ),
]
FINAL_TRACK_BAR = 95  # the closing hit


def film_bars():
    """Each piece's first bar in the film, and the film's bar of the closing hit."""
    starts, n = [], 0
    for a, b, _ in PIECES:
        starts.append(n)
        n += (b if b is not None else FINAL_TRACK_BAR + 1) - a
    final = starts[-1] + FINAL_TRACK_BAR - PIECES[-1][0]
    return starts, final


STARTS, FINAL = film_bars()
LM = {
    "drop": STARTS[0] + 8,  # 03.1: the brand, on the track's bar 0
    "stall": STARTS[1],  # the groove falls away: the intro's bar -2
    "drop2": STARTS[1] + 2,  # 05.2: "With just one click", on bar 0 again
    "thin": STARTS[2],
    "breakdown": STARTS[2]
    + 8,  # 09.1: "And that's just the beginning.", on the track's bar 40
    "return": STARTS[3],  # 09.2: "Property intelligence", on bar 48
    "stop": STARTS[4],  # 10.1: "This means", on bar 71
    "build": STARTS[5],  # bar 76
    "biggest": STARTS[5] + 4,  # 11.1: "Aurixa Systems has arrived", on bar 80
    "statements": STARTS[
        6:9
    ],  # 13.1: business / experience / decision, each on bar 71's hit
    "reentry": STARTS[9],  # 14.1: the closing card, on bar 91
    "operating": STARTS[9] + 1,
    "start": STARTS[9] + 3,
    "final": FINAL,  # the press, on the closing hit (bar 95)
}


def film_bar(b, beat=0):
    """The film's bar b (beat `beat`): its attack, in the film's seconds."""
    return FILM_FIRST + (4 * b + beat) * PERIOD


def film_beat(n):
    """The film's beat n, counted from its first bar line."""
    return FILM_FIRST + n * PERIOD


def music_pieces():
    """Each piece of the file, where it plays in the film: from 20 ms ahead of its first bar's attack to 20 ms ahead of
    the bar after its last, so every join sits just ahead of a bar's notes. The first is led in from the film's 0."""
    out = []
    for (a, b, why), at in zip(PIECES, STARTS):
        file_from = track_bar(a) - SPLICE_LEAD
        film_at = film_bar(at) - SPLICE_LEAD
        if at == 0:
            file_from, film_at = track_bar(a) - FILM_FIRST, 0.0
        out.append(
            {
                "film_bar": at,
                "bars": [a, b],
                "file_from": round(file_from, 6),
                "file_to": None if b is None else round(track_bar(b) - SPLICE_LEAD, 6),
                "film_at": round(film_at, 6),
                "why": why,
            }
        )
    for p, q in pairwise(out):  # each piece ends where the next begins in the film
        if abs(p["film_at"] + p["file_to"] - p["file_from"] - q["film_at"]) > 1e-4:
            raise SystemExit(
                f"the piece at film bar {p['film_bar']} does not meet the next"
            )
    return out


# ------------------------------------------------------------------------------------------------- the voice
# Onsets the anchors are measured on: the voiceover's own energy (20 ms windows in 5 ms steps), at the rise of the
# syllable that meets the music, as Reel 2's were. The statements meet their hits on their first word, "your", as
# their words appear on screen.
KEY_ONSETS = {
    "your business": 119.570,  # "Your business,": y- rising from -89 to -13 dB
    "your experience": 120.695,  # "your experience,": y- after the pause
    "your decision": 122.015,  # "your decision.": y- after the pause
    "operating": 124.780,  # "the operating system": op- after the dip at 124.77
    "Start": 128.010,  # "Start your free trial today.": the vowel of start, after the t (the dip at 128.00)
}

# (where, in the voiceover's own seconds; the length it should be near, in frames; the least and most; why; group).
# A pause at a cut's own time opens the new shot; anywhere else it holds the shot it falls in.
P = lambda at, near, lo, hi, why, group: {
    "at": at,
    "near": near,
    "lo": lo,
    "hi": hi,
    "why": why,
    "group": group,
}
PAUSES = [
    # The question and the old way, to the drop on the brand's cut.
    P(0.000, 9, 3, 18, "the property, composed, before 'Your client'", "open"),
    P(2.000, 6, 0, 12, "'the property.' held, before 'The big question?'", "open"),
    P(3.100, 6, 0, 12, "the question, held", "open"),
    P(4.600, 12, 3, 18, "'Can they afford it?' held", "open"),
    P(
        12.600,
        18,
        6,
        30,
        "after 'partners.': the old way stalls as the music falls silent",
        "open",
    ),
    # The brand and the questionnaire, to the drop again on "With just one click".
    P(
        14.300,
        6,
        0,
        12,
        "after 'With Aurixa Systems,': the logo, at the viewer",
        "brand",
    ),
    P(15.750, 9, 3, 18, "the logo settles, before the questionnaire", "brand"),
    P(22.900, 6, 0, 12, "the client card, filled, held", "brand"),
    P(
        26.000,
        12,
        3,
        24,
        "after 'opportunity.': the pointer over the button, before the click",
        "brand",
    ),
    # The assessment, the scenarios, the handover and what each gains, to the breakdown.
    P(30.600, 3, 0, 9, "after 'into magic,'", "click"),
    P(42.350, 0, 0, 3, "after 'key considerations'", "click"),
    P(45.000, 6, 0, 15, "the assessment, whole, held", "click"),
    P(48.700, 3, 0, 9, "after 'in moments.'", "click"),
    P(50.200, 3, 0, 9, "after 'And why stop there?'", "click"),
    P(52.600, 3, 0, 9, "the property, in focus", "click"),
    P(62.600, 6, 0, 15, "the report, held", "click"),
    P(64.200, 3, 0, 9, "after 'Ready for the next step?'", "click"),
    P(65.250, 0, 0, 6, "after 'One click,'", "click"),
    P(67.000, 6, 0, 15, "the handover, sent", "click"),
    P(78.600, 6, 0, 15, "the broker's portal, held", "click"),
    P(81.450, 0, 0, 6, "after 'clarity and transparency,'", "click"),
    P(83.500, 3, 0, 9, "after 'the broker gains context.'", "click"),
    P(85.800, 3, 0, 12, "after 'momentum.'", "click"),
    # The breakdown, two bars: the question of what comes next, held.
    P(
        87.500,
        None,
        6,
        75,
        "after 'just the beginning.': the breakdown, held",
        "beginning",
    ),
    # The platform and the Aurixa Agent, to the stop's hit on "This means".
    P(101.200, 24, 6, 45, "the agent's card, approved, held", "platform"),
    # What it means, to the biggest section on "Aurixa Systems has arrived".
    P(103.600, 3, 0, 9, "after 'less administration,'", "means"),
    P(105.000, 3, 0, 9, "after 'faster answers,'", "means"),
    P(
        109.400,
        9,
        0,
        24,
        "after 'deliver results.': the build, before the brand arrives",
        "means",
    ),
    # Arrived, and the free trial, to the first statement's hit.
    P(111.700, 3, 0, 9, "after 'has arrived'", "arrived"),
    P(114.100, 0, 0, 6, "after 'by property professionals'", "arrived"),
    P(115.900, 6, 0, 15, "the logo, before the free trial", "arrived"),
    P(
        119.300,
        6,
        0,
        30,
        "the call to action, pressed, before the statements",
        "arrived",
    ),
    # The statements on the stop's hit, the closing card on the full return, its lines on their downbeats.
    P(120.550, None, 0, 45, "'your experience,' on its hit", "close"),
    P(121.850, None, 0, 45, "'your decision.' on its hit", "close"),
    P(123.050, None, 0, 45, "held before the closing card", "close"),
    P(124.500, None, 0, 30, "'the operating system' on its downbeat", "close"),
    P(127.700, None, 0, 45, "'Start your free trial today.' on its downbeat", "close"),
]


def in_silence(at):
    """True when `at` lies in a silence measured in the audio (or at the very start, before the first word)."""
    if at <= 0:
        return True
    return any(s["start"] - 1e-6 <= at <= s["end"] + 1e-6 for s in VOICE["silences"])


def shift(t, pauses, include_at):
    s = 0
    for p in pauses:
        if p["frames"] and (p["at"] <= t + 1e-6 if include_at else p["at"] < t - 1e-6):
            s += p["frames"]
    return s / FPS


def warp_word(t, pauses=None):
    """A word's time (anything spoken or heard): moved by every pause at or before it."""
    return round(t + shift(t, pauses or SOLVED, True), 6)


def warp_cut(t, pauses=None):
    """A cut's or beat's time: moved by every pause before it; a pause on it opens what it starts."""
    return round(t + shift(t, pauses or SOLVED, False), 6)


# ---------------------------------------------------------------------------------------------- the solution
def _beat_cost(frame):
    """How far a cut's first frame is from a beat: 0 on a bar line, 0.25 on a beat, 1 off the grid. A cut is on a
    beat when the beat's attack falls in its first or second frame."""
    t = frame / FPS
    n = math.floor((t - film_beat(0)) / PERIOD)
    best = 1.0
    for k in (n - 1, n, n + 1, n + 2):
        if k < 0:
            continue
        f = math.floor(film_beat(k) * FPS)
        if frame in (f - 1, f):
            best = min(best, 0.0 if k % 4 == 0 else 0.25)
        elif frame in (f - 2, f + 1):
            best = min(best, 0.6)
    return best


def cuts_on_voice():
    """Every shot and where it starts on the voice's own clock (shot_times.py)."""
    return [(row[0], row[1]) for row in shot_times.shots(VOICE)]


def solve():
    """Whole frames for every pause: each group by a dynamic programme to its anchor; the close from its own."""
    pauses = [dict(p, frames=None) for p in PAUSES]
    for p in pauses:
        if not in_silence(p["at"]):
            raise SystemExit(
                f"The pause at {p['at']} ({p['why']}) is not in a measured silence"
            )
    cuts = cuts_on_voice()
    cut_of = dict(cuts)
    before = lambda names: sum(p["frames"] or 0 for p in pauses if p["group"] in names)

    def group(name, first, anchor, bar, weight=1.0, done=()):
        """The group's pauses from cut `first` to the anchor cut, whose first frame holds the film's bar `bar`."""
        _dp(
            pauses,
            [
                c
                for c in cuts
                if cut_of[first] < c[1] < cut_of[anchor] - 1e-6
                or (first == "01.1" and 0 < c[1] < cut_of[anchor])
            ],
            name,
            anchor_old=cut_of[anchor],
            total=math.floor(film_bar(bar) * FPS)
            - round(cut_of[anchor] * FPS)
            - before(set(done)),
            weight=weight,
        )

    group("open", "01.1", "03.1", LM["drop"], weight=0.6)
    group("brand", "03.1", "05.2", LM["drop2"], done=("open",))
    group("click", "05.2", "09.1", LM["breakdown"], done=("open", "brand"))

    def place(name, i, old, target, word=True):
        """Set the group's pause i so that `old` (a word, or a cut) lands at `target` seconds (a cut: the target's
        attack in its first frame)."""
        own = [p for p in pauses if p["group"] == name]
        own[i]["frames"] = 0
        if word:
            now = (
                old
                + sum(p["frames"] or 0 for p in pauses if p["at"] <= old + 1e-6) / FPS
            )
            frames = round((target - now) * FPS)
        else:
            now = round(old * FPS) + sum(
                p["frames"] or 0 for p in pauses if p["at"] < old - 1e-6
            )
            frames = math.floor(target * FPS) - now
        lo, hi = own[i]["lo"], own[i]["hi"]
        if not lo <= frames <= hi:
            raise SystemExit(
                f"{own[i]['why']}: {frames} frames is outside {lo} to {hi}"
            )
        own[i]["frames"] = frames

    for p in pauses:
        if p["group"] in ("beginning", "close"):
            p["frames"] = 0
    place("beginning", 0, cut_of["09.2"], film_bar(LM["return"]), word=False)
    group(
        "platform",
        "09.2",
        "10.1",
        LM["stop"],
        done=("open", "brand", "click", "beginning"),
    )
    group(
        "means",
        "10.1",
        "11.1",
        LM["biggest"],
        done=("open", "brand", "click", "beginning", "platform"),
    )
    done = ("open", "brand", "click", "beginning", "platform", "means")
    total = round(
        (film_bar(LM["statements"][0]) - KEY_ONSETS["your business"]) * FPS
    ) - before(set(done))
    _dp(
        pauses,
        [c for c in cuts if cut_of["11.1"] < c[1] < cut_of["13.1"] - 1e-6],
        "arrived",
        anchor_old=KEY_ONSETS["your business"],
        total=total,
    )
    place("close", 0, KEY_ONSETS["your experience"], film_bar(LM["statements"][1]))
    place("close", 1, KEY_ONSETS["your decision"], film_bar(LM["statements"][2]))
    place("close", 2, cut_of["14.1"], film_bar(LM["reentry"]), word=False)
    place("close", 3, KEY_ONSETS["operating"], film_bar(LM["operating"]))
    place("close", 4, KEY_ONSETS["Start"], film_bar(LM["start"]))
    for p in pauses:
        if not p["lo"] <= p["frames"] <= p["hi"]:
            raise SystemExit(
                f"The pause at {p['at']} ({p['why']}) is {p['frames']} frames, outside {p['lo']} to {p['hi']}"
            )
    globals()["SOLVED"] = pauses
    last = max(w["end"] for w in VOICE["words"])
    if not warp_word(last) < film_bar(LM["final"]) - 0.3:
        raise SystemExit(
            f"'today.' ends at {warp_word(last):.3f} s, too near the press at {film_bar(LM['final']):.3f} s"
        )
    return pauses


def _dp(pauses, cuts, group, anchor_old, total, weight=1.0):
    """Choose the group's pause frames: every cut in `cuts` as near a beat as it can be, each pause near its length,
    and the group's total exactly `total` frames, so that its anchor (at `anchor_old` on the voice's clock) lands."""
    mine = [p for p in pauses if p["group"] == group]
    edges = [c[1] for c in cuts] + [anchor_old]
    intervals, prev = [], -1.0
    for e in edges:
        intervals.append([p for p in mine if prev - 1e-6 <= p["at"] < e - 1e-6])
        prev = e
    if sum(len(i) for i in intervals) != len(mine):
        stray = [p["at"] for p in mine if not any(p in i for i in intervals)]
        raise SystemExit(f"{group}: pauses outside its cuts and anchor: {stray}")
    base = sum(
        p["frames"] or 0
        for p in pauses
        if p["group"] != group and p["at"] < (cuts[0][1] if cuts else anchor_old)
    )
    states = {0: (0.0, [])}
    for k, (members, edge) in enumerate(zip(intervals, edges)):
        lo, hi = sum(p["lo"] for p in members), sum(p["hi"] for p in members)
        near = sum(p["near"] for p in members)
        nxt = {}
        for s, (cost, picks) in states.items():
            for x in range(lo, hi + 1):
                s2 = s + x
                if s2 > total:
                    break
                c = cost + 0.012 * (x - near) ** 2
                if k < len(cuts):
                    c += weight * _beat_cost(round(edge * FPS) + base + s2)
                if s2 not in nxt or c < nxt[s2][0]:
                    nxt[s2] = (c, picks + [x])
        states = nxt
    if total not in states:
        lo = sum(p["lo"] for p in mine)
        hi = sum(p["hi"] for p in mine)
        raise SystemExit(
            f"{group}: no pause lengths reach its anchor ({total} frames; its pauses allow {lo} to {hi})"
        )
    for members, x in zip(intervals, states[total][1]):
        _share(members, x)


def _share(members, x):
    """Split x frames across an interval's pauses near their lengths and within their limits."""
    if not members:
        assert x == 0
        return
    near = sum(p["near"] for p in members) or 1
    raw = [x * p["near"] / near for p in members]
    got = [max(p["lo"], min(p["hi"], math.floor(r))) for p, r in zip(members, raw)]
    order = sorted(range(len(members)), key=lambda i: -(raw[i] - math.floor(raw[i])))
    while sum(got) < x:
        for i in order:
            if sum(got) < x and got[i] < members[i]["hi"]:
                got[i] += 1
    while sum(got) > x:
        for i in reversed(order):
            if sum(got) > x and got[i] > members[i]["lo"]:
                got[i] -= 1
    for p, g in zip(members, got):
        p["frames"] = g


SOLVED = None


def end_frame():
    """The film's last frame: the press on the closing hit, then the ring."""
    return math.ceil((film_bar(LM["final"]) + RING) * FPS)


def table(cuts, pauses):
    rows = []
    for sid, old in cuts:
        new = warp_cut(old, pauses)
        f = round(new * FPS)
        rows.append((sid, old, new, f, (new - film_beat(0)) / PERIOD, _beat_cost(f)))
    return rows


def write(pauses):
    bars = {
        k: [round(film_bar(b), 6) for b in v]
        if isinstance(v, list)
        else round(film_bar(v), 6)
        for k, v in LM.items()
    }
    data = {
        "provisional": (
            "Paced on the voiceover's local word times (voiceover-words.json). Solved again once the "
            "studio has measured the imported voiceover."
        ),
        "fps": FPS,
        "sample_rate": SR,
        "voiceover": {
            "seconds": VOICE["seconds"],
            "speech_end": max(w["end"] for w in VOICE["words"]),
        },
        "end": end_frame() / FPS,
        "pauses": [
            {
                "at": p["at"],
                "frames": p["frames"],
                "seconds": round(p["frames"] / FPS, 4),
                "why": p["why"],
                "group": p["group"],
            }
            for p in pauses
            if p["frames"]
        ],
        "music": {
            "track": TRACK,
            "period": PERIOD,
            "bpm": round(60 / PERIOD, 3),
            "drop": round(DROP, 6),
            "first_downbeat": FILM_FIRST,
            "splice_lead": SPLICE_LEAD,
            "crossfade": XFADE,
            "pieces": music_pieces(),
            "film_bars": {k: v for k, v in LM.items()},
            "bars": bars,
            "ring": RING,
        },
    }
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
    return data


def paced_voiceover(src, out):
    """The voiceover held open: silence of each pause's length inserted at its place, sample for sample (a frame is
    1470 samples at 44.1 kHz), and silence after the last word to the film's end."""
    import wave

    import numpy as np

    with wave.open(str(src)) as w:
        if w.getframerate() != SR or w.getsampwidth() != 2:
            raise SystemExit(f"{src}: expected 16-bit audio at {SR} Hz")
        ch = w.getnchannels()
        x = np.frombuffer(w.readframes(w.getnframes()), np.int16).reshape(-1, ch)
    pieces, at = [], 0
    for p in sorted((p for p in SOLVED if p["frames"]), key=lambda p: p["at"]):
        cut = round(p["at"] * SR)
        pieces += [x[at:cut], np.zeros((p["frames"] * SPF, ch), np.int16)]
        at = cut
    pieces.append(x[at:])
    y = np.concatenate(pieces)
    total = end_frame() * SPF
    if len(y) > total:
        raise SystemExit(
            f"The paced voiceover runs {len(y) / SR:.3f} s, past the film's end"
        )
    y = np.concatenate([y, np.zeros((total - len(y), ch), np.int16)])
    with wave.open(str(out), "wb") as w:
        w.setnchannels(ch)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(y.tobytes())
    return len(y) / SR


def main():
    solve()
    cuts = cuts_on_voice()
    if sys.argv[1:2] == ["--voiceover"]:
        seconds = paced_voiceover(Path(sys.argv[2]), Path(sys.argv[3]))
        print(f"the voiceover held open: {seconds:.3f} s -> {sys.argv[3]}")
        return
    if sys.argv[1:] == ["--table"]:
        for p in SOLVED:
            print(
                f"{p['at']:8.3f} {p['frames']:3d}f {p['frames'] / FPS:5.2f}s  {p['group']:9}  {p['why']}"
            )
        print()
        rows = table(cuts, SOLVED)
        for i, (sid, old, new, f, n, c) in enumerate(rows):
            nxt = rows[i + 1][2] if i + 1 < len(rows) else end_frame() / FPS
            print(
                f"{sid:5} {old:8.3f} -> {new:8.3f} ({nxt - new:5.2f} s)  frame {f:5d}  bar {n / 4:6.2f}  "
                f"{'bar' if c == 0 else 'beat' if c < 0.3 else 'near' if c < 1 else 'off'}"
            )
        for k, v in KEY_ONSETS.items():
            print(f"{k:16} {v:8.3f} -> {warp_word(v):8.3f}")
        for k, v in LM.items():
            print(
                f"{k:12} film bar {v}  at {film_bar(v) if not isinstance(v, list) else [round(film_bar(b), 3) for b in v]}"
            )
        print(
            f"end {end_frame()} frames = {end_frame() / FPS:.3f} s; pauses {sum(p['frames'] for p in SOLVED) / FPS:.3f} s"
        )
        return
    data = write(SOLVED)
    print(
        f"{len(data['pauses'])} pauses, {sum(p['frames'] for p in SOLVED) / FPS:.3f} s; the film ends at "
        f"{data['end']:.3f} s; wrote {OUT}"
    )


if __name__ == "__main__":
    main()
