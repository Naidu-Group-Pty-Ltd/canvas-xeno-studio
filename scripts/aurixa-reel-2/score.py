"""Reel 2's score: composed bar by bar to the film's cuts with Eleven Music's composition plan, made in the studio.

  python3 -I scripts/aurixa-reel-2/score.py plan [a|b]                  # a composition plan, as the studio sends it
  python3 -I scripts/aurixa-reel-2/score.py make <seed> <out dir> [a|b]  # one take, made in the studio and fetched
  python3 -I scripts/aurixa-reel-2/score.py measure <take.mp3>     # how a take keeps the plan's bars and sections

Reel 1 was cut to a track that already existed, so its film was fitted to the music's bars. Reel 2's music is made
for it, so the two are designed together. pacing.py's anchors decided how many bars lie between the moments the
music has to meet, each found from the voice with every hold at its natural length (PLAN.md section 7):

- the brand's cut (03.1), after "paperwork.", is the first drop;
- eleven bars later, the Passport's cut (04.1), after "And here's where it gets exciting.", is the second, with two
  bars of build under the press before it;
- fifteen bars after that, "The result?" (06.1) is a breakdown to pads for two bars, and the groove comes back,
  lighter, on 06.2;
- eleven bars on, the four statements are four stabs, one a bar, with silence between (08.1);
- the closing card (09.1) is the full return, a bar after the last statement; "the operating system" is a bar
  later, "Start your free trial today." two more, and the press is the final downbeat, which rings for two seconds.

That is 58 bars at 120 BPM (116 s) and the ring, about 1:58: the plan's window was 1:45 to 1:58. Each section is
a chunk of the plan, a whole number of bars long, and Eleven Music v2 and v2.5 keep a chunk's length exactly, so
the sections land on the bars the film needs. Whether a take keeps the tempo, and where its downbeats really fall,
is measured afterwards (`measure`): the Editor's own bar finder (structure.ts), and the loudness of each bar
against what the plan asked of it. pacing.py is then solved on the chosen take's measured grid, not on this one.
"""
import json
import math
import os
import subprocess
import sys
import hashlib
import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
PROJECT = "7402838f-bcc6-4ca8-b085-adbd1c160b30"  # Aurixa Reel 2
WORK = "29ad590c-1f57-4a84-92de-f2652b78f3a3"

BPM = 120
BAR = 4 * 60 / BPM  # 2.0 s

# ------------------------------------------------------------------------------------------- the bars
# (section, bars, what the film does there, styles, styles to avoid, context adherence)
STYLE = ["modern cinematic corporate", "instrumental", "120 BPM", "4/4", "steady tempo throughout"]
CLEAR = "mid-range left clear for a spoken voiceover"
QUALITY = "great production quality"
NEVER = ["vocals", "singing", "choir", "humming", "spoken word", "ominous", "dark", "horror", "aggressive", "distorted"]
SECTIONS_A = [
    ("Intro", 9, "the messenger and the requests (01.1 to 02.2)",
     STYLE + ["warm and optimistic", "sparse and curious", "muted plucks", "soft ticking clock pulse", "light pizzicato",
              "gradually getting busier", "light and never ominous", "no drums yet", "clean modern production", QUALITY,
              CLEAR], NEVER, None),
    ("Pre-Drop", 2, "'Suddenly, progress feels like paperwork.': the bar stalls and the frame cools (02.3)",
     ["the plucks stop", "a single held note", "tension held", "a soft reverse swell", "near silence on the last beat",
      "120 BPM", "4/4", QUALITY], NEVER, "medium"),
    ("Drop", 9, "the brand arrives: one connected system (03.1 to 03.3)",
     ["warm drop on the first beat", "warm analogue pads", "confident groove", "soft punchy kick",
      "shimmering arpeggio", "uplifting and bright", "modern cinematic corporate", "120 BPM", "4/4", QUALITY, CLEAR],
     NEVER, "medium"),
    ("Build", 2, "'And here's where it gets exciting.': the press on AML/CTF Compliance (03.4)",
     ["a short build", "rising synth riser", "snare roll building", "anticipation", "lifting into a bigger drop",
      "120 BPM", "4/4", QUALITY], NEVER, "medium"),
    ("Drop 2", 8, "the Passport rises and opens (04.1 to 04.3)",
     ["fuller and wider second drop on the first beat", "assured, not aggressive", "big warm pads", "wide stereo",
      "confident groove", "shimmering arpeggio", "subtle strings", "120 BPM", "4/4", QUALITY, CLEAR],
     NEVER, "medium"),
    ("Groove", 7, "the Passport shared, with consent, across the network (05.1 to 05.3)",
     ["steady and confident", "the same groove continues", "a little simpler", "warm pads", "plucked arpeggio",
      "120 BPM", "4/4", QUALITY, CLEAR], NEVER, "high"),
    ("Breakdown", 2, "'The result?': the Passport alone on the navy (06.1)",
     ["breakdown to warm pads only", "no drums", "no bass", "suspended, waiting", "soft and spacious", "120 BPM",
      QUALITY], NEVER, "medium"),
    ("Groove Returns", 11, "the result, one part of Aurixa, the trial (06.2 to 07.2)",
     ["the groove returns on the first beat, lighter", "light percussion", "warm pads", "plucked arpeggio",
      "optimistic", "less dense than the second drop", "120 BPM", "4/4", QUALITY, CLEAR], NEVER, "medium"),
    ("Stabs", 4, "Fourteen days. Your business, your experience, your decision. (08.1)",
     ["four short orchestral stabs, one on the first beat of each bar", "silence between the stabs", "no drums",
      "no pads between the stabs", "dramatic but warm", "120 BPM", "4/4", QUALITY], NEVER, "medium"),
    ("Finale", 4, "the closing card (09.1)",
     ["full return on the first beat", "the whole groove and pads together", "triumphant and warm", "confident",
      "120 BPM", "4/4", QUALITY, CLEAR], NEVER, "medium"),
]
# The final downbeat (the press), then its ring: a chunk is at least 3 s long, so it is a bar and a half.
OUTRO_A = ("Outro", 1.5, "the press, and the ring",
         ["one final big hit on the first beat", "its reverb ringing out", "nothing after the hit",
          "natural decay to silence", QUALITY], NEVER, "medium")


# Plan B, after take 1 (plan A, seed 11): the tempo and the sections' lengths held exactly, but a short section was
# spent on its way in (the drop's first bar was a riser, the full groove came a bar late, the breakdown ran on for
# seven bars, and the stabs were the groove). B says the change itself, on the section's first beat, and lets a
# section that must break from the one before follow it less (contextAdherence "low"); "high" keeps a groove going.
SECTIONS_B = [
    ("Intro", 9, "the messenger and the requests (01.1 to 02.2)",
     STYLE + ["warm and optimistic", "sparse and curious", "muted plucks", "soft ticking clock pulse", "light pizzicato",
              "gradually getting busier", "light and never ominous", "no drums", "no bass", "clean modern production",
              QUALITY, CLEAR], NEVER, None),
    ("Pre-Drop", 2, "'Suddenly, progress feels like paperwork.': the bar stalls and the frame cools (02.3)",
     ["everything drops out on the first beat", "only a soft reverse swell rising into the drop",
      "almost silent", "tension held", "no drums", "no plucks", "120 BPM", "4/4", QUALITY], NEVER, "low"),
    ("Drop", 9, "the brand arrives: one connected system (03.1 to 03.3)",
     ["the full groove starts exactly on the first beat", "kick and bass from the very first beat",
      "warm analogue pads", "confident groove", "shimmering arpeggio", "uplifting and bright",
      "modern cinematic corporate", "120 BPM", "4/4", QUALITY, CLEAR], NEVER, "low"),
    ("Build", 2, "'And here's where it gets exciting.': the press on AML/CTF Compliance (03.4)",
     ["the kick drops out on the first beat", "a rising riser", "snare roll building", "tension rising",
      "lifting into a bigger drop", "120 BPM", "4/4", QUALITY], NEVER, "low"),
    ("Drop 2", 8, "the Passport rises and opens (04.1 to 04.3)",
     ["a bigger, fuller drop exactly on the first beat", "kick, bass, pads and strings together from the first beat",
      "assured, not aggressive", "wide stereo", "confident groove", "shimmering arpeggio", "120 BPM", "4/4", QUALITY,
      CLEAR], NEVER, "low"),
    ("Groove", 7, "the Passport shared, with consent, across the network (05.1 to 05.3)",
     ["the same groove continues", "steady and confident", "a little simpler", "warm pads", "plucked arpeggio",
      "120 BPM", "4/4", QUALITY, CLEAR], NEVER, "high"),
    ("Breakdown", 2, "'The result?': the Passport alone on the navy (06.1)",
     ["drums and bass stop on the first beat", "only soft warm pads", "quiet and spacious", "suspended, waiting",
      "120 BPM", QUALITY], NEVER, "low"),
    ("Groove Returns", 11, "the result, one part of Aurixa, the trial (06.2 to 07.2)",
     ["drums and bass return exactly on the first beat", "the groove is back, lighter", "light percussion",
      "warm pads", "plucked arpeggio", "optimistic", "120 BPM", "4/4", QUALITY, CLEAR], NEVER, "low"),
    ("Stabs", 4, "Fourteen days. Your business, your experience, your decision. (08.1)",
     ["the groove stops", "four short loud orchestral stabs, one on the first beat of each bar",
      "silence between the stabs", "no drums", "no pads", "no bass between the stabs", "120 BPM", "4/4", QUALITY],
     NEVER, "low"),
    ("Finale", 4, "the closing card (09.1)",
     ["the full groove returns exactly on the first beat with a big hit", "the whole groove and pads together",
      "triumphant and warm", "confident", "120 BPM", "4/4", QUALITY, CLEAR], NEVER, "low"),
]
OUTRO_B = ("Outro", 1.5, "the press, and the ring",
           ["one final big hit on the first beat", "then nothing but its reverb ringing out", "no drums after the hit",
            "natural decay to silence", QUALITY], NEVER, "low")
PLANS = {"a": (SECTIONS_A, OUTRO_A), "b": (SECTIONS_B, OUTRO_B)}
SECTIONS, OUTRO = PLANS["b"]

PROMPT = (
    "The score for Aurixa Reel 2, the AML/CTF Compliance Passport: modern cinematic corporate at 120 BPM in 4/4, "
    "instrumental, composed bar by bar to the film's cuts. A sparse, curious intro under the messenger and the "
    "requests stalls before the first drop on the brand's arrival (bar 11); two bars of build lead to a fuller "
    "second drop on the Passport (bar 22); steady through the Passport shared; a two-bar breakdown on 'The result?' "
    "(bar 37); the groove returns lighter (bar 39); four stabs, one a bar, under the four statements (bars 50 to "
    "53); the full return on the closing card (bar 54); a final hit on bar 58 and its ring. Room is left for a "
    "spoken voice between 300 Hz and 4 kHz."
)


def sections(variant: str = "b"):
    """Each section with the bar it starts on and its time on the music's own clock."""
    rows, outro = PLANS[variant]
    out, bar = [], 0.0
    for name, bars, film, *_ in rows + [outro]:
        out.append({"name": name, "bar": bar, "bars": bars, "at": bar * BAR, "seconds": bars * BAR, "film": film})
        bar += bars
    return out


def plan(variant: str = "b"):
    """The composition plan as the studio's generate_music takes it (its own names; the studio sends ElevenLabs')."""
    rows, outro = PLANS[variant]
    chunks = []
    for name, bars, _film, positive, negative, adherence in rows + [outro]:
        chunk = {"text": f"[{name}]", "durationMs": round(bars * BAR * 1000), "positiveStyles": positive,
                 "negativeStyles": negative}
        if adherence:
            chunk["contextAdherence"] = adherence
        chunks.append(chunk)
    return {"chunks": chunks}


# The moments the film needs, in the plan's bars (pacing.py reads them from here).
LANDMARKS = {
    "drop": 11,  # 03.1: the brand
    "drop2": 22,  # 04.1: the Passport
    "breakdown": 37,  # 06.1: "The result?"
    "return": 39,  # 06.2: the groove, lighter
    "stabs": [50, 51, 52, 53],  # 08.1: Fourteen days / business / experience / decision
    "reentry": 54,  # 09.1: the closing card
    "operating": 55,
    "start": 57,
    "final": 58,  # the press
}


def check_plan(variant: str = "b"):
    """The bars the sections start on are the ones the landmarks name."""
    starts = {s["name"]: s["bar"] for s in sections(variant)}
    assert starts["Drop"] == LANDMARKS["drop"], starts
    assert starts["Drop 2"] == LANDMARKS["drop2"], starts
    assert starts["Breakdown"] == LANDMARKS["breakdown"], starts
    assert starts["Groove Returns"] == LANDMARKS["return"], starts
    assert starts["Stabs"] == LANDMARKS["stabs"][0], starts
    assert starts["Finale"] == LANDMARKS["reentry"], starts
    assert starts["Outro"] == LANDMARKS["final"], starts
    for chunk in plan(variant)["chunks"]:
        assert 3000 <= chunk["durationMs"] <= 120000, chunk
        assert len(chunk["positiveStyles"]) <= 24 and all(len(s) <= 120 for s in chunk["positiveStyles"]), chunk


# ------------------------------------------------------------------------------------------- the studio
def studio():
    spec = importlib.util.spec_from_file_location("work", REPO / "scripts/studio-work/work.py")
    work = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(work)
    return work


def make(seed: int, out_dir: Path, variant: str = "b"):
    """One take: made in the studio (one billable generation, kept once per request id) and fetched."""
    work = studio()
    check_plan(variant)
    body = {
        "title": f"Aurixa Reel 2 score, seed {seed}",
        "prompt": PROMPT,
        "plan": plan(variant),
        "seed": seed,
        "model": "music_v2_5",
        "genres": ["cinematic", "corporate"],
        "moods": ["confident", "optimistic"],
        "bpm": BPM,
        "projectId": PROJECT,
        "workId": WORK,
    }
    body["clientRequestId"] = "r2-score-" + hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()[:40]
    try:
        made = work.call("generate_music", body, timeout=600, tries=1)
    except work.StudioError as failure:
        if failure.code != "NETWORK" and (failure.status or 0) < 500:
            raise
        # The answer was lost, not the request: the same request id returns the track as it stands.
        print(f"seed {seed}: {failure}; asking again for the same request")
        made = work.call("generate_music", body, timeout=600, tries=3)
    print(json.dumps(made, indent=1))
    if made.get("status") != "ready" or not made.get("assetId"):
        sys.exit(f"seed {seed}: not ready ({made.get('status')}: {made.get('errorMessage')})")
    asset = work.call("get_asset", {"assetId": made["assetId"]})
    data = work.transfer(asset["url"], timeout=300)
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"take-seed-{seed}.mp3"
    path.write_bytes(data)
    (out_dir / f"take-seed-{seed}.json").write_text(json.dumps({"made": made, "asset": {
        k: asset.get(k) for k in ("id", "title", "mimeType", "fileSize", "durationSeconds")}, "seed": seed,
        "sha256": hashlib.sha256(data).hexdigest(), "plan": variant,
        "request": {k: v for k, v in body.items() if k != "plan"}},
        indent=1) + "\n")
    print(f"seed {seed}: {len(data):,} bytes -> {path}")
    return path


# ------------------------------------------------------------------------------------------- measuring a take
def decode(take: Path) -> Path:
    wav = take.with_suffix(".wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(take), "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le",
                    str(wav)], check=True)
    return wav


def bar_loudness(wav: Path, origin: float, bars: int):
    """Each bar's loudness (dB, RMS), and how much of its energy sits on its downbeat's first 200 ms."""
    import wave
    import numpy as np
    with wave.open(str(wav)) as w:
        sr = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), np.int16).reshape(-1, w.getnchannels()).astype(float)
    x = x.mean(axis=1) / 32768
    out = []
    for b in range(bars):
        a = int((origin + b * BAR) * sr)
        z = int((origin + (b + 1) * BAR) * sr)
        seg = x[max(0, a):max(0, z)]
        if len(seg) < sr // 10:
            out.append((None, None))
            continue
        head = seg[: int(0.2 * sr)]
        db = 10 * math.log10(float(np.mean(seg ** 2)) + 1e-12)
        share = float(np.sum(head ** 2) / (np.sum(seg ** 2) + 1e-12))
        out.append((round(db, 1), round(share, 2)))
    return out


def measure(take: Path):
    wav = decode(take)
    found = json.loads(subprocess.run(["bun", str(HERE / "structure.ts"), str(wav)], check=True, capture_output=True,
                                      text=True, cwd=REPO).stdout)
    if not found["found"]:
        print(json.dumps(found))
        return found
    beats = found["beats"]
    # One grid through every beat: its period and phase, and how far each beat strays from it.
    n = [round((b - beats[0]) / (60 / BPM)) for b in beats]
    import numpy as np
    A = np.vstack([np.array(n, float), np.ones(len(n))]).T
    (period, phase), *_ = np.linalg.lstsq(A, np.array(beats), rcond=None)
    resid = np.array(beats) - (np.array(n) * period + phase)
    print(f"{take.name}: {found['seconds']:.3f} s, the Editor finds {found['bpm']} BPM, {found['beatsPerBar']} beats a bar, "
          f"confidence {found['confidence']}")
    print(f"  one grid: period {period:.5f} s ({60 / period:.3f} BPM), beats {len(beats)}, rms {1000 * np.sqrt(np.mean(resid ** 2)):.1f} ms, "
          f"worst {1000 * np.max(np.abs(resid)):.0f} ms")
    # Where the plan's bar 0 falls on the take's own grid: the downbeat nearest 0 s, and every section's start.
    downs = found["downbeats"]
    print(f"  first downbeats: {[round(d, 3) for d in downs[:4]]}")
    origin = min(downs, key=lambda d: abs(d - round(d / BAR) * BAR)) % BAR
    origin = origin if origin < BAR / 2 else origin - BAR
    print(f"  the downbeats' phase: {origin:+.3f} s from the plan's bar lines")
    for s in sections():
        near = min(downs, key=lambda d: abs(d - s["at"])) if downs else None
        print(f"  {s['name']:15} bar {s['bar']:5.1f} at {s['at']:6.1f} s: nearest downbeat {near:7.3f} "
              f"({1000 * (near - s['at']):+5.0f} ms)")
    loud = bar_loudness(wav, 0.0, int(sections()[-1]["bar"] + 2))
    marks = {int(s["bar"]): s["name"] for s in sections()}
    for b, (db, share) in enumerate(loud):
        if db is None:
            continue
        print(f"  bar {b:3d} {db:6.1f} dB  head {share:4.2f}  {marks.get(b, '')}")
    return found


def main():
    if sys.argv[1:2] == ["plan"]:
        variant = sys.argv[2] if len(sys.argv) > 2 else "b"
        check_plan(variant)
        print(json.dumps({"sections": sections(variant), "plan": plan(variant), "landmarks": LANDMARKS}, indent=1))
        return
    if sys.argv[1:2] == ["make"]:
        make(int(sys.argv[2]), Path(sys.argv[3]), sys.argv[4] if len(sys.argv) > 4 else "b")
        return
    if sys.argv[1:2] == ["measure"]:
        measure(Path(sys.argv[2]))
        return
    sys.exit(__doc__)


if __name__ == "__main__":
    main()
