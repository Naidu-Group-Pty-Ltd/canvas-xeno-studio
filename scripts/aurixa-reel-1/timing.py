"""Cut points for Reel 1 from the voiceover's measured words and speech segments."""
import json, math, sys

FPS = 30
END = 106.031
speech = [[0.05,1.33],[1.43,2.96],[3.05,3.77],[4.36,6.32],[6.46,7.91],[8.44,8.61],[8.77,9.86],[10.15,11.4],[11.49,11.87],[12.06,13.13],[13.26,13.4],[13.53,15.24],[15.36,17.19],[17.75,18.63],[19.13,19.68],[19.78,20.66],[21.09,21.88],[21.96,22.45],[22.55,23.52],[24.04,24.73],[24.85,25.41],[26.02,27.46],[27.57,28.93],[29.2,30.57],[31.03,31.69],[31.93,33.82],[33.96,36.01],[36.2,36.91],[37.58,41.39],[41.56,44.88],[45.41,46.67],[46.88,48.09],[48.2,49.31],[49.4,49.73],[49.81,50.67],[50.82,50.93],[51.07,53.52],[54.07,55.58],[55.84,57.34],[57.79,60.31],[60.85,63.28],[63.49,64.91],[65.26,66.72],[67.19,68.84],[68.92,71.33],[71.65,71.82],[71.9,73.03],[73.55,74.52],[74.61,75.78],[76.18,77.03],[77.32,78.3],[78.39,79],[79.42,80.37],[80.45,80.68],[80.76,81],[81.08,82.58],[83.09,84.23],[84.51,86.52],[86.64,88.32],[88.41,89.72],[90.31,91.75],[92.13,94.09],[94.57,95.46],[95.87,96.71],[96.98,98],[98.27,99.15],[99.62,100.74],[101.25,104.03],[104.45,105.88]]

# The pack's 28 cues with the word each starts on (measured), and the pack's estimate.
cues = [
 (1, 0.000, 0.000, "Somewhere in Australia, a property opportunity has just appeared."),
 (2, 4.440, 3.518, "A client wants to know if it's right for them, while there's still time to act."),
 (3, 8.500, 9.758, "But before you can answer, the research is in one platform, the numbers in another, the client details somewhere else, and the report hasn't even begun."),
 (4, 17.780, 19.685, "WHAT HAPPENS THEN - The market keeps moving."),
 (5, 21.120, 22.466, "Your attention is pulled in every direction."),
 (6, 23.680, 25.247, "And the client is waiting."),
 (7, 26.000, 27.430, "Aurixa Systems was built by property professionals for property professionals"),
 (8, 31.260, 31.458, "We're here, with a connected operating environment designed around how property professionals actually work."),
 (9, 37.740, 36.960, "Picture a property moving from research into financial analysis, then into a professional report your client can understand."),
 (10, 45.680, 43.797, "Picture communication, client relationships and property partners connected to that journey, with Aurixa Agent supporting the work behind it."),
 (11, 53.720, 51.142, "Not to replace your judgement, but to give it room to lead."),
 (12, 58.040, 55.907, "Because clients don't pay you to manage software."),
 (13, 60.920, 59.057, "They trust you to identify opportunities, make sense of complexity and guide the next decision."),
 (14, 67.260, 64.928, "You can keep asking your team to bridge the gaps between disconnected systems."),
 (15, 71.680, 69.921, "But why should they have to?"),
 (16, 73.620, 72.473, "Aurixa Systems isn't on the horizon."),
 (17, 76.200, 74.886, "We've arrived, and the invitation is open."),
 (18, 79.600, 77.807, "Experience what we've built with a 14-day free trial."),
 (19, 83.140, 81.694, "Explore the platform, put it alongside the way you work today, and discover what a more connected business could feel like."),
 (20, 90.420, 89.777, "Don't just take our word for it."),
 (21, 92.240, 92.558, "Let your own experience make the case."),
 (22, 94.980, 95.479, "Fourteen days."),
 (23, 95.980, 96.537, "Your business."),
 (24, 97.080, 97.594, "Your experience."),
 (25, 98.420, 98.651, "Your decision."),
 (26, 99.940, 99.729, "Aurixa Systems."),
 (27, 101.220, 100.666, "The operating system for modern property professionals."),
 (28, 104.700, 103.587, "Start your free trial today."),
]

# Each cue's (or split's) first word with the end of the word before it, as measured.
PREV_END = {0.000: 0.0, 4.440: 3.720, 8.500: 8.000, 17.780: 17.100, 21.120: 20.560, 23.680: 23.380,
            26.000: 25.480, 31.260: 30.440, 37.740: 37.340, 45.680: 44.840, 53.720: 53.720, 58.040: 57.680,
            60.920: 60.260, 67.260: 66.680, 71.680: 71.180, 73.620: 73.080, 76.200: 75.640, 79.600: 78.940,
            83.140: 82.500, 90.420: 89.920, 92.240: 91.860, 94.980: 94.080, 95.980: 95.400, 97.080: 96.620,
            98.420: 97.900, 99.940: 99.100, 101.220: 100.520, 104.700: 103.820,
            40.080: 39.680, 42.500: 42.240, 50.980: 50.600, 61.900: 61.660, 86.800: 86.500}

def onset(word_start):
    """Where the word's sound begins: the start of a speech segment that opens after the word
    before it ended (word timings are rough), else the word's own start."""
    before = PREV_END.get(round(word_start, 3), word_start)
    for a, b in speech:
        if before - 0.1 <= a <= word_start + 0.15:
            return a
    return word_start

def cut_before(word_start):
    """A cut a few frames before the word: in the pause before it, or (mid-phrase) 0.1 s ahead."""
    on = onset(word_start)
    prev_end = max([b for a, b in speech if b <= on + 1e-6] or [0.0])
    if on - prev_end < 0.05:
        t = on - 0.1
    else:
        t = max(prev_end + 0.04, on - 0.15)
    return round(math.floor(t * FPS) / FPS, 3)

# Shot boundaries: (shot, starts at a cue or a word time, note)
# A shot starts on a cue (cut_before the cue's first word) or on a word inside a cue.
words_inside = {
 "05B": 40.080,  # "financial analysis"
 "05C": 42.500,  # "professional report"
 "06B": 50.980,  # "with Aurixa Agent supporting"
 "08B": 61.900,  # "identify opportunities" (08A runs briefly into the second sentence)
 "12B": 86.800,  # "and discover what a more connected business"
}
starts = [
 ("01A", "cue", 1), ("01B", "cue", 2), ("02A", "cue", 3), ("03A", "cue", 4), ("03B", "cue", 5),
 ("03C", "cue", 6), ("04A", "cue", 7), ("04B", "cue", 8), ("05A", "cue", 9), ("05B", "word", None),
 ("05C", "word", None), ("06A", "cue", 10), ("06B", "word", None), ("07A", "cue", 11), ("08A", "cue", 12),
 ("08B", "word", None), ("09A", "cue", 14), ("09B", "cue", 15), ("10A", "cue", 16), ("10B", "cue", 17),
 ("11A", "cue", 18), ("12A", "cue", 19), ("12B", "word", None), ("13A", "cue", 20), ("14A", "cue", 22),
 ("15A", "cue", 26),
]
cue_at = {n: (t, est, text) for n, t, est, text in cues}
rows = []
for shot, kind, n in starts:
    if shot == "01A":
        t = 0.0
    elif kind == "cue":
        t = cut_before(cue_at[n][0])
    else:
        t = cut_before(words_inside[shot])
    rows.append([shot, t])
for i, row in enumerate(rows):
    end = rows[i + 1][1] if i + 1 < len(rows) else END
    row.append(round(end, 3))
    row.append(round(end - row[1], 3))

blocks = {"01": ["01A","01B"], "02": ["02A"], "03": ["03A","03B","03C"], "04": ["04A","04B"], "05": ["05A","05B","05C"],
          "06": ["06A","06B"], "07": ["07A"], "08": ["08A","08B"], "09": ["09A","09B"], "10": ["10A","10B"], "11": ["11A"],
          "12": ["12A","12B"], "13": ["13A"], "14": ["14A"], "15": ["15A"]}
by = {r[0]: r for r in rows}
out = {"fps": FPS, "end": END, "speech_end": 105.88,
       "cues": [{"n": n, "start": t, "pack_estimate": est, "drift": round(t - est, 3), "text": text} for n, t, est, text in cues],
       "shots": [{"shot": s, "in": a, "out": b, "seconds": d} for s, a, b, d in rows],
       "blocks": [{"block": k, "in": by[v[0]][1], "out": by[v[-1]][2], "seconds": round(by[v[-1]][2] - by[v[0]][1], 3), "shots": v} for k, v in blocks.items()]}
json.dump(out, open(sys.argv[1], "w"), indent=1)
for r in rows: print(f"{r[0]}  {r[1]:7.3f} → {r[2]:7.3f}  {r[3]:5.2f}s")
print()
for b in out["blocks"]: print(b["block"], b["in"], b["out"], b["seconds"])
print("sum", round(sum(r[3] for r in rows), 3))
