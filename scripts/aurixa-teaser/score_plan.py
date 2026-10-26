#!/usr/bin/env python3
"""The teaser's score as asked of Eleven Music: generate_music's request (docs/studio-api.md, "Making music").

  python3 -I scripts/aurixa-teaser/score_plan.py <seed> > request.json

A dark synthwave track in the spirit of the reels' National Treasures (measured: B flat minor, a quiet intro of keys,
then a drop about 15 dB louder whose weight is nearly all sub-bass): B flat minor, at 96 BPM so its bar is the
picture's 2.5 s. It is made long, in clear sections (intro, build, drop, breakdown, a build that stops dead, the
biggest drop, the stop), so sound.py can cut it on its own bar lines under the picture as the reels cut National
Treasures, its drops on the picture's. The teaser's score is seed 2155: its drop lands at 20.0 s, and its second
build stops dead for one beat (50.0 to 50.625 s) before the biggest drop.
"""
import json
import sys

NEG = ["vocals", "singing", "choir", "bells", "chimes", "singing bowl", "gong", "flute", "meditation", "new age",
       "ambient drone only", "acoustic guitar", "orchestral strings", "piano ballad", "lo-fi"]
CORE = ["dark synthwave", "darksynth", "96 BPM", "B flat minor", "retro 80s analog synthesizers", "cinematic"]


def chunk(name, seconds, styles, extra_neg=()):
    return {"text": f"[{name}]", "durationMs": int(seconds * 1000), "positiveStyles": CORE + styles,
            "negativeStyles": NEG + list(extra_neg), "contextAdherence": "high"}


plan = {"chunks": [
    chunk("Intro", 10.0, ["brooding analog synth pads", "a filtered 16th-note synth arpeggio pulsing", "deep sub-bass swells",
                          "tense and mysterious, the filter slowly opening", "no drums"], ["drums", "kick"]),
    chunk("Build", 5.0, ["a rising white-noise riser", "a snare roll building faster", "the arpeggio filter opening wide",
                         "tension rising toward a drop"]),
    chunk("Drop", 20.0, ["a hard-hitting drop", "punchy kick on every beat", "big gated-reverb snare on beats 2 and 4",
                         "driving 16th-note analog bassline", "heavy 808 sub bass", "retro poly-synth stabs",
                         "energetic, dark, confident, like a trap beat played on 80s synthesizers"]),
    chunk("Breakdown", 10.0, ["the drums drop out", "filtered dark synth pads", "a low pulsing sub-bass drone",
                              "sparse muted synth pulses", "suspense, holding its breath"], ["drums", "kick", "snare"]),
    chunk("Build", 5.0, ["a second build", "a rising arpeggio climbing", "a snare roll accelerating",
                         "a riser peaking, then a sudden hard stop into silence"]),
    chunk("Final drop", 15.0, ["the biggest section", "massive 808 sub-bass hits", "a soaring retro lead synth melody",
                               "huge gated-reverb snares", "driving bassline", "epic, triumphant and dark"]),
    chunk("Outro", 7.5, ["the beat stops on one final heavy hit", "a dark sustained synth chord and an 808 tail ring out",
                         "fading to silence"], ["drums"]),
]}
seed = int(sys.argv[1])
print(json.dumps({
    "title": f"Aurixa Teaser · synthwave score · seed {seed}",
    "prompt": ("A dark, hard-hitting synthwave score in B flat minor at 96 BPM for a cinematic tech teaser, in the spirit "
               "of a heavy hip-hop instrumental with 808 sub bass and big drops, played on retro 80s analog synthesizers: "
               "a tense filtered intro, a build, a hard drop with gated snares and a driving bassline, a breakdown, a "
               "second build that stops dead, then the biggest drop and a final hit. Instrumental."),
    "plan": plan,
    "instrumental": True,
    "genres": ["Synthwave", "Electronic"],
    "moods": ["Dark", "Epic", "Energetic"],
    "bpm": 96,
    "seed": seed,
    "projectId": "5aab251e-737e-4142-8a89-d33578437ff8",
    "clientRequestId": f"aurixa-teaser-synthwave-v1-seed-{seed}",
}, indent=1))
