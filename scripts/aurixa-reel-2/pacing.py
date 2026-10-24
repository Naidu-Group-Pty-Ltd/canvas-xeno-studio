"""Reel 2 on its music: the voiceover held open at its silences, and the score (score.py) the film is cut to.

  python3 -I scripts/aurixa-reel-2/pacing.py           # solve, check, and write docs/brands/aurixa-reel-2/pacing.json
  python3 -I scripts/aurixa-reel-2/pacing.py --table   # the pauses, and where every cut lands against the music
  python3 -I scripts/aurixa-reel-2/pacing.py --voiceover <voiceover.wav> <paced.wav>   # the voiceover held open

Reel 1's rules (scripts/aurixa-reel-1/pacing.py), on music made for the film:

- The voiceover is never stretched. It is held open in its own silences: each pause sits inside one of the silences
  measured in the audio (voiceover-words.json) and adds a whole number of frames there. A cut is moved by every pause
  before it; a pause placed exactly on a cut opens the new shot before its first word (brief.py's warp_cut against
  warp_word).
- The pauses are solved, not typed one by one. Each has a length it should be near and limits; a small dynamic
  programme picks whole frames so that the cuts land on beats (a bar line where it can), while the anchors hold
  exactly: the brand's cut on the first drop, the Passport's on the second, "The result?" on the breakdown and the
  groove's return after it, the four statements on the four stabs (each as its words appear), the closing card on
  the full return,
  "the operating system" and "Start your free trial today." on their downbeats, and the press on the last.
- The music is take 33 of the score, measured: one grid through all its 239 beats (0.499978 s, 120.005 BPM, rms
  0.3 ms), every section starting on the bar the plan gave it. It plays as it was made except at the four stabs,
  which it played as groove: there each bar is the take's own ending, its last beat's hit gated into the ring after
  the stop on bar 58, so the stabs and the final press are one sound. Each edit point into a bar sits 20 ms ahead of
  its bar line, under a 30 ms crossfade, so the grid runs on unbroken and the film's clock is the take's.
"""
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import score  # noqa: E402
import shot_times  # noqa: E402

FPS = 30
SR = 44100
SPF = SR // FPS  # 1470 samples a frame: a pause of whole frames is a whole number of samples
DOCS = HERE.parents[1] / "docs" / "brands" / "aurixa-reel-2"
OUT = DOCS / "pacing.json"
VOICE = json.loads((DOCS / "voiceover-words.json").read_text())

# ------------------------------------------------------------------------------------------------- the music
TAKE = {
    "seed": 33,
    "plan": "b",
    "title": "Aurixa Reel 2 score, seed 33",
    "model": "music_v2_5",
    "file": "take-seed-33.mp3, 119.040 s, MP3 128 kbit/s, 44.1 kHz stereo",
    "measured": "24 October 2026: the Editor's bar finder (structure.ts) finds 120.01 BPM, 4 beats a bar, confidence 0.89; one grid through its 239 beats, rms 0.3 ms, worst 1 ms",
}
PERIOD = 0.499978
FIRST_DOWNBEAT = 0.03007  # bar 0's attack in the file; every section's start falls 25 to 30 ms after its bar line
BAR = 4 * PERIOD
SPLICE_LEAD = 0.02  # an edit point sits this far ahead of its bar line, before the bar's notes
XFADE = 0.03  # each edit point is an equal-power crossfade this long, centred on it
MUSIC_AT = 0.0  # the take starts with the film's first frame
RING = 2.0  # the picture holds this long after the last downbeat, while the music rings out


def take_bar(b, beat=0):
    """Bar b's beat (0 is its downbeat) in the take: its attack, in the file's own seconds."""
    return FIRST_DOWNBEAT + (4 * b + beat) * PERIOD


STAB = take_bar(57, 3)  # the take's last beat: its attack, half a beat before the stop on bar 58
# A stab is that beat's hit, gated: its first 0.21 s, joined at the hit's own dip (-30 dB in the speech band) to the
# ring just after the stop (-31 dB there), so the join is level and the body that would cover a word is gone. As
# it was made, the beat holds -24 to -31 dB for half a second, louder than "experience" and "decision" are said.
STAB_HIT = 0.21
RING_FROM = take_bar(58) + 0.02  # just after the stop's last transient
LM = score.LANDMARKS


def music_pieces():
    """The take, edited: each piece of the file, where it plays in the film. Each stab is a bar long, so the film's
    grid is the take's."""
    first, last = LM["stabs"][0], LM["reentry"]
    pieces = [{"file_from": 0.0, "file_to": take_bar(first) - SPLICE_LEAD,
               "why": "the take as made: the intro, the stall, both drops, the breakdown and the groove's return"}]
    for i, bar in enumerate(LM["stabs"]):
        pieces.append({"file_from": STAB - SPLICE_LEAD, "file_to": STAB + STAB_HIT,
                       "why": f"stab {i + 1} on bar {bar}: the take's last beat, its hit"})
        pieces.append({"file_from": RING_FROM, "file_to": RING_FROM + BAR - SPLICE_LEAD - STAB_HIT,
                       "why": f"stab {i + 1}: the ring after the take's stop, to the next bar"})
    pieces.append({"file_from": take_bar(last) - SPLICE_LEAD, "file_to": None,
                   "why": f"the full return from bar {last}, the stop on bar {LM['final']} and its ring"})
    t = MUSIC_AT
    for p in pieces:
        p["film_at"] = round(t, 6)
        if p["file_to"] is not None:
            t += p["file_to"] - p["file_from"]
        p["file_from"], p["file_to"] = round(p["file_from"], 6), None if p["file_to"] is None else round(p["file_to"], 6)
    return pieces


def film_bar(b, beat=0):
    """The film's bar b (beat `beat`): its attack, in the film's seconds. The edit keeps the take's grid."""
    return MUSIC_AT + take_bar(b, beat)


def film_beat(n):
    """The film's beat n, counted from bar 0's downbeat."""
    return MUSIC_AT + FIRST_DOWNBEAT + n * PERIOD


# ------------------------------------------------------------------------------------------------- the voice
# Onsets the anchors are measured on: the voiceover's own energy (20 ms windows in 5 ms steps), at the stressed
# syllable's rise, as Reel 1's were.
KEY_ONSETS = {
    "result": 68.19,  # "The result?": the vowel of -sult, after the z (the dip at 68.18)
    "Fourteen": 88.895,  # "14 days.": the vowel of four-, from -35 to -14 dB after the f
    # The other three statements are met on their first word, "your", as their words appear on screen: a stab on the
    # stressed syllable would cover it, and the client says "experience" 7 dB and "decision" 10 dB below the rest of
    # the voiceover (in the speech band), while each "your" is said at -23 dB.
    "your business": 90.062,  # "Your business,": y- rising from -40 to -24 dB
    "your experience": 91.087,  # "your experience,": y- from -39 to -23 dB
    "your decision": 92.367,  # "your decision.": y- from -42 to -22 dB
    "operating": 95.133,  # "the operating system": op- after the dip at 95.12
    "Start": 98.435,  # "Start your free trial today.": the vowel of start, after the t (the dip at 98.42)
}

# (where, in the voiceover's own seconds; the length it should be near, in frames; the least and most; why; group).
# A pause at a cut's own time opens the new shot; anywhere else it holds the shot it falls in. A group's pauses are
# solved together to its anchor; `None` lengths are set by an anchor of their own.
P = lambda at, near, lo, hi, why, group: {"at": at, "near": near, "lo": lo, "hi": hi, "why": why, "group": group}
PAUSES = [
    # The messenger and the requests, to the first drop on the brand's cut.
    P(0.000, 12, 6, 24, "the switchboard, before 'One property'", "open"),
    P(1.135, 0, 0, 6, "after 'One property,'", "open"),
    P(3.270, 3, 0, 9, "after 'six property professionals,'", "open"),
    P(6.533, 12, 6, 21, "the freeze, before 'Sound familiar?'", "open"),
    P(7.700, 9, 3, 18, "after 'Sound familiar?': the client's chip pulses", "open"),
    P(13.850, 0, 0, 6, "after 'Another identity check,'", "open"),
    P(16.900, 6, 0, 12, "after 'another explanation.'", "open"),
    P(20.050, 18, 6, 36, "after 'paperwork.': the bar stalled, held before the drop", "open"),
    # The brand and the connected system, to the second drop on the Passport's cut.
    P(20.200, 9, 0, 18, "the drop, before 'That's where'", "brand"),
    P(23.600, 9, 0, 18, "the logo, glowing, held", "brand"),
    P(31.320, 0, 0, 4, "after 'financial analysis,'", "brand"),
    P(37.850, 12, 3, 24, "the connected system, held", "brand"),
    P(39.850, 15, 6, 30, "the press and the build, before 'Introducing'", "brand"),
    # The Passport and its sharing, to the breakdown on "The result?".
    P(44.450, 15, 6, 30, "the Passport, face-on, held", "passport"),
    P(46.240, 3, 0, 9, "after 'One digital passport,'", "passport"),
    P(48.380, 3, 0, 9, "after 'one organised client record,'", "passport"),
    P(52.120, 0, 0, 6, "after 'due diligence'", "passport"),
    P(53.800, 9, 3, 18, "'all in one place.', held", "passport"),
    P(56.690, 3, 0, 9, "after 'controlled access,'", "passport"),
    P(67.550, 6, 0, 24, "after 'duplication.'", "passport"),
    # The breakdown, two bars: the question on its second downbeat, the groove's return on the next cut.
    P(67.767, None, 15, 60, "the Passport alone, before 'The result?'", "breakdown"),
    P(68.650, None, 15, 60, "the question, held", "breakdown"),
    # The result and the trial, to the first stab.
    P(70.040, 3, 0, 6, "after 'Less paperwork,'", "result"),
    P(71.450, 3, 0, 6, "after 'less repetition,'", "result"),
    P(75.210, 0, 0, 4, "after 'a smoother property journey'", "result"),
    P(78.900, 9, 3, 18, "the journey, held", "result"),
    P(81.600, 9, 0, 18, "the call to action, before 'Experience it yourself'", "result"),
    P(88.300, 9, 0, 45, "after 'what a truly connected business can achieve.'", "result"),
    # The four statements on the four stabs, the closing card on the return, its lines on their downbeats.
    P(89.890, None, 0, 45, "'Your business,' on its stab", "close"),
    P(90.980, None, 0, 45, "'your experience,' on its stab", "close"),
    P(92.230, None, 0, 45, "'your decision.' on its stab", "close"),
    P(93.300, None, 15, 60, "held before the closing card", "close"),
    P(94.870, None, 0, 30, "'the operating system' on its downbeat", "close"),
    P(98.140, None, 0, 45, "'Start your free trial today.' on its downbeat", "close"),
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
    """Whole frames for every pause: the groups by a dynamic programme each, to their anchors; the breakdown and the
    close from theirs."""
    pauses = [dict(p, frames=None) for p in PAUSES]
    for p in pauses:
        if not in_silence(p["at"]):
            raise SystemExit(f"The pause at {p['at']} ({p['why']}) is not in a measured silence")
    cuts = cuts_on_voice()
    cut_of = dict(cuts)
    before = lambda group_names: sum(p["frames"] or 0 for p in pauses if p["group"] in group_names)

    # The open group: the brand's cut lands on the first drop (the drop's attack in its first frame).
    _dp(pauses, [c for c in cuts if 0 < c[1] < cut_of["03.1"] - 1e-6], "open",
        anchor_old=cut_of["03.1"], total=math.floor(film_bar(LM["drop"]) * FPS) - round(cut_of["03.1"] * FPS),
        weight=0.6)
    # The brand: the Passport's cut on the second drop.
    _dp(pauses, [c for c in cuts if cut_of["03.1"] < c[1] < cut_of["04.1"] - 1e-6], "brand",
        anchor_old=cut_of["04.1"],
        total=math.floor(film_bar(LM["drop2"]) * FPS) - round(cut_of["04.1"] * FPS) - before({"open"}))
    # The Passport: the breakdown on "The result?" (06.1's cut).
    _dp(pauses, [c for c in cuts if cut_of["04.1"] < c[1] < cut_of["06.1"] - 1e-6], "passport",
        anchor_old=cut_of["06.1"],
        total=math.floor(film_bar(LM["breakdown"]) * FPS) - round(cut_of["06.1"] * FPS) - before({"open", "brand"}))

    def place(group, i, old, target, word=True):
        """Set the group's pause i so that `old` (a word, or a cut) lands at `target` seconds (a cut: the target's
        attack in its first frame)."""
        own = [p for p in pauses if p["group"] == group]
        own[i]["frames"] = 0
        if word:
            now = old + sum(p["frames"] or 0 for p in pauses if p["at"] <= old + 1e-6) / FPS
            frames = round((target - now) * FPS)
        else:
            now = round(old * FPS) + sum(p["frames"] or 0 for p in pauses if p["at"] < old - 1e-6)
            frames = math.floor(target * FPS) - now
        lo, hi = own[i]["lo"], own[i]["hi"]
        if not lo <= frames <= hi:
            raise SystemExit(f"{own[i]['why']}: {frames} frames is outside {lo} to {hi}")
        own[i]["frames"] = frames

    # The breakdown: the question's stress on its second downbeat, the groove back on 06.2's cut.
    for p in pauses:
        if p["group"] in ("breakdown", "close"):
            p["frames"] = 0
    place("breakdown", 0, KEY_ONSETS["result"], film_bar(LM["breakdown"] + 1))
    place("breakdown", 1, cut_of["06.2"], film_bar(LM["return"]), word=False)
    # The result: its cuts on beats, "Fourteen" on the first stab.
    before_result = before({"open", "brand", "passport", "breakdown"})
    total = round((film_bar(LM["stabs"][0]) - KEY_ONSETS["Fourteen"]) * FPS) - before_result
    _dp(pauses, [c for c in cuts if cut_of["06.2"] < c[1] < cut_of["08.1"] - 1e-6], "result",
        anchor_old=KEY_ONSETS["Fourteen"], total=total)
    # The statements on the stabs, the closing card on the return, its lines on their downbeats.
    place("close", 0, KEY_ONSETS["your business"], film_bar(LM["stabs"][1]))
    place("close", 1, KEY_ONSETS["your experience"], film_bar(LM["stabs"][2]))
    place("close", 2, KEY_ONSETS["your decision"], film_bar(LM["stabs"][3]))
    place("close", 3, cut_of["09.1"], film_bar(LM["reentry"]), word=False)
    place("close", 4, KEY_ONSETS["operating"], film_bar(LM["operating"]))
    place("close", 5, KEY_ONSETS["Start"], film_bar(LM["start"]))
    for p in pauses:
        if not p["lo"] <= p["frames"] <= p["hi"]:
            raise SystemExit(f"The pause at {p['at']} ({p['why']}) is {p['frames']} frames, outside {p['lo']} to {p['hi']}")
    globals()["SOLVED"] = pauses
    # The last word ends before the press, and the press leaves the ring inside the film.
    last = max(w["end"] for w in VOICE["words"])
    if not warp_word(last) < film_bar(LM["final"]) - 0.3:
        raise SystemExit(f"'today.' ends at {warp_word(last):.3f} s, too near the press at {film_bar(LM['final']):.3f} s")
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
    base = sum(p["frames"] or 0 for p in pauses if p["group"] != group and p["at"] < (cuts[0][1] if cuts else anchor_old))
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
        raise SystemExit(f"{group}: no pause lengths reach its anchor ({total} frames; its pauses allow {lo} to {hi})")
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
    """The film's last frame: the press on the last downbeat, then the ring."""
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
        "drop": film_bar(LM["drop"]),
        "drop2": film_bar(LM["drop2"]),
        "breakdown": film_bar(LM["breakdown"]),
        "return": film_bar(LM["return"]),
        "statements": [film_bar(b) for b in LM["stabs"]],
        "reentry": film_bar(LM["reentry"]),
        "operating": film_bar(LM["operating"]),
        "start": film_bar(LM["start"]),
        "final": film_bar(LM["final"]),
    }
    data = {
        "fps": FPS,
        "sample_rate": SR,
        "voiceover": {"seconds": VOICE["seconds"], "speech_end": max(w["end"] for w in VOICE["words"])},
        "end": end_frame() / FPS,
        "pauses": [{"at": p["at"], "frames": p["frames"], "seconds": round(p["frames"] / FPS, 4), "why": p["why"],
                    "group": p["group"]} for p in pauses if p["frames"]],
        "music": {
            "take": TAKE,
            "period": PERIOD,
            "first_downbeat": FIRST_DOWNBEAT,
            "splice_lead": SPLICE_LEAD,
            "crossfade": XFADE,
            "pieces": music_pieces(),
            "film_drop": round(film_bar(LM["drop"]), 6),
            "bars": {k: [round(x, 6) for x in v] if isinstance(v, list) else round(v, 6) for k, v in bars.items()},
            "ring": RING,
        },
    }
    OUT.write_text(json.dumps(data, indent=1) + "\n")
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
        raise SystemExit(f"The paced voiceover runs {len(y) / SR:.3f} s, past the film's end")
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
            print(f"{p['at']:8.3f} {p['frames']:3d}f {p['frames'] / FPS:5.2f}s  {p['group']:9}  {p['why']}")
        print()
        rows = table(cuts, SOLVED)
        for i, (sid, old, new, f, n, c) in enumerate(rows):
            nxt = rows[i + 1][2] if i + 1 < len(rows) else end_frame() / FPS
            print(f"{sid:5} {old:8.3f} -> {new:8.3f} ({nxt - new:5.2f} s)  frame {f:5d}  beat {n:7.2f}  "
                  f"{'bar' if c == 0 else 'beat' if c < 0.3 else 'near' if c < 1 else 'off'}")
        for k, v in KEY_ONSETS.items():
            print(f"{k:10} {v:8.3f} -> {warp_word(v):8.3f}")
        print(f"end {end_frame()} frames = {end_frame() / FPS:.3f} s; pauses {sum(p['frames'] for p in SOLVED) / FPS:.3f} s")
        return
    data = write(SOLVED)
    print(f"{len(data['pauses'])} pauses, {sum(p['frames'] for p in SOLVED) / FPS:.3f} s; the film ends at "
          f"{data['end']:.3f} s; wrote {OUT}")


if __name__ == "__main__":
    main()
