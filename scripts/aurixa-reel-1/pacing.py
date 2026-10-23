"""Reel 1, third cut: the voiceover held open at its silences, and the music the film is cut to.

  python3 scripts/aurixa-reel-1/pacing.py           # solve, check, and write docs/brands/aurixa-reel-1/system-edition/pacing.json
  python3 scripts/aurixa-reel-1/pacing.py --table   # the pauses and where every cut lands against the music
  python3 scripts/aurixa-reel-1/pacing.py --voiceover <master.wav> <paced.wav>   # the voiceover held open

The client's review of the second cut (22 October 2026) asked for room to breathe between screens and for National
Treasures under the whole film. Both are answered here, and nothing else in the reel types a time for them:

- The voiceover is never stretched. It is held open in its own silences: each pause below sits between two of
  timing.py's measured speech segments and adds a whole number of frames there. A cut is moved by every pause before
  it; a pause placed exactly on a cut opens the new shot before its first word (warp_cut against warp_word).
- The music is cut on its own bars. Its beat was measured from the file (130 tracked beats from 22 s to 200 s, one
  grid, 9.7 ms rms), and every edit point sits 20 ms ahead of a bar line, where its notes start: the intro's four
  bars before the drop played twice, four bars of the groove before the thin section played twice, and two of the
  breakdown's eight bars left out so its two-bar phrases stay whole.
- The pauses are solved, not typed one by one: each has a length it should be near and limits, and a small dynamic
  programme picks whole frames so that the cuts after the drop land on a beat (a bar line where it can), while four
  anchors hold exactly: the brand's cut in the silence before the drop, the breakdown on "Let your own experience
  make the case.", each of the four statements' key words on a downbeat, the closing card on the music's re-entry.
"""
import json, math, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import timing  # noqa: E402

FPS = timing.FPS
SR = 44100
SPF = SR // FPS  # 1470 samples a frame: a pause of whole frames is a whole number of samples
OUT = HERE.parents[1] / "docs" / "brands" / "aurixa-reel-1" / "system-edition" / "pacing.json"

# ------------------------------------------------------------------------------------------------- the music
# National Treasures, the file the client named (272.300 s, 44.1 kHz stereo). Measured from it on 22 October 2026:
# the beat tracker's beats from 22 s to 200 s fit one grid at 0.465141 s (128.99 BPM, rms 9.7 ms, worst 26 ms), and
# its attacks (the onset-strength peak beside each tracked beat) lead the tracked beat by 40 ms (IQR 37 to 44 ms).
# Beat 0 is the drop. The intro (0 to 22.25 s) carries a note on every bar line and no drums; it falls silent from
# 21.0 s to the drop (-42 dB at 22.0 s). The groove runs bars 0 to 31 (-5 to -7 dB a bar), thins for bars 32 to 39,
# breaks down at bar 40 (-26 to -31 dB) with a faint figure at the end of every second bar, and comes back at bar 48.
PERIOD = 0.46514101885610903
DROP = 22.29489162418665 - 0.04004  # the drop's attack, in the file
SPLICE_LEAD = 0.02  # an edit point sits this far ahead of its bar line, before the bar's notes begin
XFADE = 0.03  # each edit point is an equal-power crossfade this long, centred on it


def music_attack(k):
    """Beat k of the file (0 is the drop): its attack, in the file's own seconds."""
    return DROP + k * PERIOD


# The edit, in the file's beats. Each entry plays the file from `from_beat` to `to_beat` (None: to the end); the
# film's beat grid runs on unbroken across every joint because every piece is a whole number of bars.
MUSIC_PIECES = [
    {"from_beat": None, "to_beat": -16, "why": "the intro to four bars before the drop"},
    {"from_beat": -32, "to_beat": 148, "why": "four bars of the intro again, the drop, the groove to the end of bar 36"},
    {"from_beat": 132, "to_beat": 176, "why": "bars 33 to 36 again (the bars most like what follows: 0.95), then on to the breakdown's bar 44"},
    {"from_beat": 184, "to_beat": None, "why": "the breakdown from bar 46: bars 44 and 45 left out, so its two-bar phrases stay whole"},
]
FILM_DROP_BEAT = 16  # the film's beat 0 is the drop; the intro's repeat puts it 16 beats later than in the file


def film_beat(n):
    """The film's beat n (0 is the drop, on the brand's reveal): its attack, in the film's seconds."""
    return music_attack(0) + FILM_DROP_BEAT * PERIOD + n * PERIOD


def film_bar(b):
    return film_beat(4 * b)


def music_pieces():
    """Each piece of the file in film time: (file from, file to, film at)."""
    out, t = [], 0.0
    for piece in MUSIC_PIECES:
        a = 0.0 if piece["from_beat"] is None else music_attack(piece["from_beat"]) - SPLICE_LEAD
        b = None if piece["to_beat"] is None else music_attack(piece["to_beat"]) - SPLICE_LEAD
        out.append({"file_from": round(a, 6), "file_to": None if b is None else round(b, 6), "film_at": round(t, 6),
                    "why": piece["why"]})
        if b is not None:
            t += b - a
    return out


# Moments the film is cut to, on the film's grid.
BREAKDOWN_BAR = 44  # the file's bar 40, four bars later for the intro's repeat and four for the groove's
STATEMENT_BARS = [46, 47, 48, 49]  # Fourteen / business / experience / decision
REENTRY_BAR = 50
CLOSE_BARS = {"operating": 51, "Start": 53}
FINAL_BAR = 54  # the downbeat after "today": the closing card's last accent
RING = 1.0  # the picture holds this long after the final downbeat while it rings out

# ------------------------------------------------------------------------------------------------- the voice
# Onsets the anchors are measured on: the voiceover's own energy (5 ms steps, 20 ms windows), at the stressed
# syllable's rise. The key words are the four statements' gold words and the closing card's lines.
KEY_ONSETS = {
    "Fourteen": 94.60,  # "Fourteen days." the vowel of four- rising from -36 to -10 dB
    "business": 96.19,  # "Your business." the b of bus- after the dip at 96.16
    "experience": 97.34,  # "Your experience." ex- after the dip at 97.32
    "decision": 98.63,  # "Your decision." de- after the dip at 98.62
    "operating": 101.36,  # "The operating system" op- after the dip at 101.35
    "Start": 104.47,  # "Start your free trial today." the vowel of start
}

# ------------------------------------------------------------------------------------------------- the pauses
# (where, in the voiceover's own seconds; the length it should be near, in frames; the least and most; why). A pause
# at a cut's own time opens the new shot; anywhere else it holds the shot it falls in. `fixed` pauses are solved
# from an anchor rather than chosen.
P = lambda at, near, lo, hi, why, group: {"at": at, "near": near, "lo": lo, "hi": hi, "why": why, "group": group}
PAUSES = [
    # Before the brand: the map, the question, the four tools, the pressure. Fixed in total by the brand's cut,
    # which lands where the music falls silent before the drop.
    P(0.000, 27, 21, 42, "the map and its pins before the first word", "open"),
    P(3.950, 12, 9, 24, "the property, popped up and held", "open"),
    P(6.390, 3, 0, 12, "after 'right for them,'", "open"),
    P(8.267, 12, 6, 18, "the tools open on a breath", "open"),
    P(10.000, 7, 3, 12, "after 'But before you can answer,'", "open"),
    P(11.960, 6, 3, 10, "after 'in one platform,'", "open"),
    P(13.460, 6, 3, 10, "after 'in another,'", "open"),
    P(17.600, 9, 4, 15, "the pressure opens", "open"),
    P(18.850, 6, 3, 10, "after 'What happens then'", "open"),
    P(25.600, 4, 0, 10, "the question alone, held as the music falls silent", "open"),
    # The brand and the journey: the drop to the breakdown, four bars longer than the file's own.
    P(25.867, 54, 45, 66, "the logo, on the drop, before 'Aurixa Systems'", "main"),
    P(30.867, 20, 9, 27, "the Command Centre becomes the hub", "main"),
    P(31.800, 24, 9, 30, "after 'We're here,': the first portal", "main"),
    P(33.900, 20, 6, 27, "after 'operating environment': the portals, one at a time", "main"),
    P(37.400, 14, 9, 24, "before 'Picture a property'", "main"),
    P(41.400, 12, 6, 21, "the report opens", "main"),
    P(45.000, 27, 15, 36, "the report's pages, still turning", "main"),
    P(46.750, 18, 3, 24, "after 'Picture communication,': the reply sent", "main"),
    P(50.700, 6, 3, 12, "before 'with Aurixa Agent'", "main"),
    P(53.540, 7, 0, 15, "the agent's draft, read", "main"),
    P(53.567, 9, 3, 15, "before 'Not to replace'", "main"),
    P(57.400, 6, 0, 12, "Approved, held", "main"),
    P(57.633, 9, 6, 15, "before 'Because clients'", "main"),
    P(60.400, 6, 0, 12, "Fulfilled, held", "main"),
    P(60.700, 11, 6, 18, "the report's pages again", "main"),
    P(63.380, 6, 3, 12, "after 'identify opportunities,'", "main"),
    P(65.000, 11, 3, 18, "the last page, held", "main"),
    P(66.900, 15, 3, 21, "the next decision, held", "main"),
    P(67.033, 12, 6, 18, "the disconnected tools", "main"),
    P(71.500, 24, 12, 30, "the light sweeps today's tools into Aurixa", "main"),
    P(73.200, 9, 3, 15, "the register, held", "main"),
    P(73.367, 6, 0, 12, "the horizon", "main"),
    P(76.000, 18, 9, 24, "the logo, at the viewer", "main"),
    P(77.100, 6, 0, 12, "after 'We've arrived,'", "main"),
    P(79.267, 11, 6, 21, "the button, pressed", "main"),
    P(80.700, 8, 0, 15, "the trial opens", "main"),
    P(82.750, 14, 6, 24, "the workspace, ready", "main"),
    P(82.933, 12, 6, 18, "before 'Explore the platform'", "main"),
    P(84.300, 21, 6, 27, "the marketplace, held", "main"),
    P(84.333, 9, 3, 15, "before 'put it alongside'", "main"),
    P(86.528, 7, 0, 15, "the floor plan, held", "main"),
    P(86.533, 12, 6, 21, "before 'and discover'", "main"),
    P(90.000, 25, 9, 33, "the business in sync, held", "main"),
    P(90.133, 9, 3, 15, "before 'Don't just take our word'", "main"),
    P(91.900, 9, 0, 18, "after 'Don't just take our word for it.'", "main"),
    # The breakdown: solved from the anchors, each statement's key word on its downbeat.
    P(94.200, None, 0, 60, "after 'make the case.': the music has fallen away", "close"),
    P(95.600, None, 0, 30, "'Your business' on its downbeat", "close"),
    P(96.800, None, 0, 30, "'Your experience' on its downbeat", "close"),
    P(98.100, None, 0, 30, "'Your decision' on its downbeat", "close"),
    P(99.300, None, 0, 45, "held before the music comes back", "close"),
    P(101.000, None, 0, 15, "'The operating system' on its downbeat", "close"),
    P(104.200, None, 0, 30, "'Start your free trial today.' on its downbeat", "close"),
]


def in_silence(at):
    """True when `at` falls between two measured speech segments (or before the first)."""
    for a, b in timing.speech:
        if a - 0.005 < at < b + 0.005:
            return False
    return True


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
        f = math.floor(film_beat(k) * FPS)
        if frame in (f - 1, f):
            best = min(best, 0.0 if k % 4 == 0 else 0.25)
        elif frame in (f - 2, f + 1):
            best = min(best, 0.6)
    return best


def solve(cuts, breakdown_old):
    """Whole frames for every pause: the open group to the brand's cut, the main group by a dynamic programme that
    lands its cuts on beats, the close group from the anchors. `cuts` are the film's shots and where each starts on
    the voiceover's clock (system_edition's SHOTS); `breakdown_old` is the beat before caption 45."""
    pauses = [dict(p, frames=None) for p in PAUSES]
    for p in pauses:
        if not in_silence(p["at"]):
            raise SystemExit(f"The pause at {p['at']} is inside a speech segment")
    cut_of = dict(cuts)

    # Open: the brand's cut where the music falls silent before the drop (21.0 to 22.1 s in the file, the film's
    # 28.44 to 29.54 s), 0.76 s ahead of the drop so the hairline draws in the silence.
    brand_frame = 868
    assert film_beat(-1.65) <= brand_frame / FPS <= film_beat(-1.5) + 0.05, brand_frame / FPS
    open_old = round(cut_of["04.1"] * FPS)
    _dp(pauses, [c for c in cuts if 0 < c[1] < cut_of["04.1"] - 1e-6], "open",
        anchor=(cut_of["04.1"], brand_frame - open_old))

    # Main: from the brand's cut to the breakdown, which falls on "Let your own experience make the case." (the
    # beat before caption 45 in shot 13.1) and on the film's bar 44.
    breakdown_frame = math.floor(film_bar(BREAKDOWN_BAR) * FPS)
    main_cuts = [c for c in cuts if cut_of["04.1"] < c[1] < breakdown_old]
    before = sum(p["frames"] for p in pauses if p["group"] == "open")
    _dp(pauses, main_cuts, "main", anchor=(breakdown_old, breakdown_frame - round(breakdown_old * FPS) - before))

    # Close: each key word on its downbeat, the closing card on the re-entry, the lines on theirs.
    close = [p for p in pauses if p["group"] == "close"]
    def place(i, old, target):
        """Set close pause i so that `old` (warped as a word) lands at `target` seconds."""
        close[i]["frames"] = 0
        now = old + sum(p["frames"] or 0 for p in pauses if p["at"] <= old + 1e-6) / FPS
        close[i]["frames"] = round((target - now) * FPS)
        lo, hi = close[i]["lo"], close[i]["hi"]
        if not lo <= close[i]["frames"] <= hi:
            raise SystemExit(f"{close[i]['why']}: {close[i]['frames']} frames is outside {lo} to {hi}")
    for p in close:
        p["frames"] = 0
    # The fourteen-days cut sits where 'Fourteen' lands on bar 46 (the cut keeps its 0.2 s lead on the word).
    place(0, KEY_ONSETS["Fourteen"], film_bar(STATEMENT_BARS[0]))
    place(1, KEY_ONSETS["business"], film_bar(STATEMENT_BARS[1]))
    place(2, KEY_ONSETS["experience"], film_bar(STATEMENT_BARS[2]))
    place(3, KEY_ONSETS["decision"], film_bar(STATEMENT_BARS[3]))
    # The closing card's cut on the re-entry: the attack in its first frame.
    reentry_frame = math.floor(film_bar(REENTRY_BAR) * FPS)
    close[4]["frames"] = 0
    now = round(cut_of["15.1"] * FPS) + sum(p["frames"] or 0 for p in pauses if p["at"] < cut_of["15.1"] - 1e-6)
    close[4]["frames"] = reentry_frame - now
    place(5, KEY_ONSETS["operating"], film_bar(CLOSE_BARS["operating"]))
    place(6, KEY_ONSETS["Start"], film_bar(CLOSE_BARS["Start"]))
    for p in pauses:
        if not p["lo"] <= p["frames"] <= p["hi"]:
            raise SystemExit(f"The pause at {p['at']} ({p['why']}) is {p['frames']} frames, outside {p['lo']} to {p['hi']}")
    globals()["SOLVED"] = pauses
    return pauses


def _dp(pauses, cuts, group, anchor):
    """Choose the group's pause frames: every cut in `cuts` as near a beat as it can be (the open group's cuts are
    before the drop and are only asked to land), each pause near its length, and the group's total fixed so that
    `anchor` (an old time, and the frames it must move by beyond the groups before) holds exactly."""
    mine = [p for p in pauses if p["group"] == group]
    # Intervals: the pauses each cut is moved by and the cut before it is not.
    edges = [c[1] for c in cuts] + [anchor[0]]
    intervals = []
    prev = -1.0
    for e in edges:
        intervals.append([p for p in mine if prev - 1e-6 <= p["at"] < e - 1e-6])
        prev = e
    tail = [p for p in mine if p["at"] >= anchor[0] - 1e-6]
    if tail:
        raise SystemExit(f"{group}: pauses after its anchor: {[p['at'] for p in tail]}")
    assigned = sum(len(i) for i in intervals)
    if assigned != len(mine):
        raise SystemExit(f"{group}: {len(mine) - assigned} pauses fall outside its cuts")
    total = anchor[1]
    base = sum(p["frames"] or 0 for p in pauses if p["group"] != group and p["at"] < cuts[0][1])
    weight = 1.0 if group == "main" else 0.6
    # State: frames added so far. Value: (cost, choices).
    states = {0: (0.0, [])}
    for k, (members, edge) in enumerate(zip(intervals, edges)):
        lo = sum(p["lo"] for p in members)
        hi = sum(p["hi"] for p in members)
        near = sum(p["near"] for p in members)
        nxt = {}
        for s, (cost, picks) in states.items():
            for x in range(lo, hi + 1):
                dev = 0.012 * (x - near) ** 2
                s2 = s + x
                if s2 > total:
                    break
                c = cost + dev
                if k < len(cuts):
                    frame = round(edge * FPS) + base + s2
                    c += weight * _beat_cost(frame)
                if s2 not in nxt or c < nxt[s2][0]:
                    nxt[s2] = (c, picks + [x])
        states = nxt
    if total not in states:
        raise SystemExit(f"{group}: no pause lengths reach its anchor ({total} frames)")
    picks = states[total][1]
    for members, x in zip(intervals, picks):
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


def end_frame(pauses=None):
    """The film's last frame: the final downbeat, then the ring."""
    return math.ceil((film_bar(FINAL_BAR) + RING) * FPS)


def table(cuts, pauses):
    rows = []
    for sid, old in cuts:
        new = warp_cut(old, pauses)
        f = round(new * FPS)
        n = (new - film_beat(0)) / PERIOD
        rows.append((sid, old, new, f, n, _beat_cost(f)))
    return rows


def write(pauses):
    data = {
        "fps": FPS, "sample_rate": SR,
        "voiceover": {"seconds": timing.END, "speech_end": timing.speech[-1][1]},
        "end": end_frame() / FPS,
        "pauses": [{"at": p["at"], "frames": p["frames"], "seconds": round(p["frames"] / FPS, 4), "why": p["why"],
                    "group": p["group"]} for p in pauses if p["frames"]],
        "music": {
            "file": "National Treasures (the client's track), 272.300 s, 44.1 kHz stereo",
            "period": PERIOD, "drop_in_file": round(DROP, 6), "splice_lead": SPLICE_LEAD, "crossfade": XFADE,
            "pieces": music_pieces(),
            "film_drop": round(film_beat(0), 6),
            "bars": {"breakdown": round(film_bar(BREAKDOWN_BAR), 6), "statements": [round(film_bar(b), 6) for b in STATEMENT_BARS],
                     "reentry": round(film_bar(REENTRY_BAR), 6), "final": round(film_bar(FINAL_BAR), 6)},
            "ring": RING,
        },
    }
    OUT.write_text(json.dumps(data, indent=1) + "\n")
    return data


def paced_voiceover(src, out):
    """The master voiceover held open: silence of each pause's length inserted at its place, sample for sample
    (a frame is 1470 samples at 44.1 kHz), and silence after the last word to the film's end."""
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
    import system_edition as se  # solves the pacing on its shots, on this module imported by name
    import pacing as P
    cuts = [(s["id"], se.moment(s["start"], 0)) for s in se.SHOTS]
    if sys.argv[1:2] == ["--voiceover"]:
        seconds = P.paced_voiceover(Path(sys.argv[2]), Path(sys.argv[3]))
        print(f"the voiceover held open: {seconds:.3f} s -> {sys.argv[3]}")
        return
    if sys.argv[1:] == ["--table"]:
        for p in P.SOLVED:
            print(f"{p['at']:8.3f} {p['frames']:3d}f {p['frames'] / FPS:5.2f}s  {p['group']:5}  {p['why']}")
        print()
        rows = P.table(cuts, P.SOLVED)
        for i, (sid, old, new, f, n, c) in enumerate(rows):
            nxt = rows[i + 1][2] if i + 1 < len(rows) else P.end_frame() / FPS
            print(f"{sid:5} {old:8.3f} -> {new:8.3f} ({nxt - new:5.2f} s)  frame {f:5d}  beat {n:7.2f}  "
                  f"{'bar' if c == 0 else 'beat' if c < 0.3 else 'near' if c < 1 else 'off'}")
        for k, v in P.KEY_ONSETS.items():
            print(f"{k:10} {v:8.3f} -> {P.warp_word(v):8.3f}")
        print(f"end {P.end_frame()} frames = {P.end_frame() / FPS:.3f} s; pauses {sum(p['frames'] for p in P.SOLVED) / FPS:.3f} s")
        return
    data = P.write(P.SOLVED)
    print(f"{len(data['pauses'])} pauses, {sum(p['frames'] for p in P.SOLVED) / FPS:.3f} s; the film ends at {data['end']:.3f} s; wrote {OUT}")


if __name__ == "__main__":
    main()
