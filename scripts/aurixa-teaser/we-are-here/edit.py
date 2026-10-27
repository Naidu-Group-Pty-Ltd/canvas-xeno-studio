#!/usr/bin/env python3
"""We Are Here's edit: every shot's frames on As One's soundtrack, where its picture comes from, how the camera moves
over it, and its look. plates.py renders the pictures from it, light.js draws the light and the words on it, and
comp.py joins them (PLAN.md has the story).

  python3 -I scripts/aurixa-teaser/we-are-here/edit.py <work files dir>    # writes we-are-here/edit.json

A shot's picture is its 4K take (clips/<shot>-1.mp4) when it has one; until then, its 4K keyframe moved by a camera
over its depth (stills/<shot>-1.png, depth/<shot>-1-depth.png), so the film can be made and judged before every take
is in, and each take drops into its place.

Times are seconds on the soundtrack (sound-as-one/cues.json); the film runs at 24 frames a second, 1,092 frames.
"""
import json
import sys
from pathlib import Path

FPS = 24
LENGTH = 45.5
FRAMES = round(LENGTH * FPS)


def f(t):
    """The frame a time falls in."""
    return int(round(t * FPS))


# The cuts, on the words (cues.json): a cut lands on the frame the word begins in, so the picture changes with it.
CUT = {
    "open": 0,
    "office": f(4.458),  # between "differently." and "Not"
    "air": f(14.0),  # through the glass on "the question changes"
    "research": f(15.84),
    "clients": f(16.72),
    "reports": f(17.84),
    "finance": f(18.80),
    "comms": f(19.76),
    "bands": f(20.72),  # "Powerful on their own.": the track falls silent
    "drop": f(22.255),  # bar 0, the drop
    "pulse": f(27.69),  # "When intelligence can move"
    "grid": f(31.77),  # "when the business can act as one"
    "device": f(34.25),  # "So don't ask what the next tool is."
    "rise": f(36.73),  # "Ask what happens when the business becomes the system."
    "end": f(40.25),  # "Aurixa Systems."
}

# Each shot: its first and last frame (exclusive), its source, and the camera over it.
#   move: zoom (1 fits the frame's width), cx/cy (the source point at the frame's centre, as shares of the source),
#         spin (degrees), each from -> to over the shot, eased; dolly is how far the camera moves into a still's depth
#         (its parallax), orbit how far it moves sideways about the nearness `pivot` (as shares of the still's width,
#         nearer points sliding further), and nearness below `far` counts as far (camera.py).
#   blur: a still's frame is the average of this many moments over a half-frame shutter, where the camera is fast.
#   take: for a 4K take, the take's second the shot starts at, and its speed.
#   look: exposure (stops), contrast, saturation, and a tint toward the brand's navy (shadows) and gold (highlights).
#   anchors: named points on the still (as shares), carried to the frame for the light (plates/<shot>.json); a
#            take's points are tracked (track.py).
#   masks: what the light acts on (masks.py), moved with the picture.
LOT = dict(lot0=(0.462, 0.572), lot1=(0.578, 0.572), lot2=(0.578, 0.662), lot3=(0.462, 0.662))
RISE_NODES = dict(n1=(0.36, 0.40), n2=(0.12, 0.43), n3=(0.25, 0.52), n4=(0.47, 0.585), n5=(0.84, 0.535),
                  n6=(0.88, 0.62), n7=(0.18, 0.78), n8=(0.07, 0.70), n9=(0.72, 0.365), n10=(0.86, 0.445),
                  n11=(0.58, 0.66), n12=(0.30, 0.87), n13=(0.66, 0.50), n14=(0.42, 0.47))
SHOTS = [
    dict(key="open", a=CUT["open"], b=CUT["office"],
         move=dict(zoom=(1.0, 1.06), cx=(0.5, 0.5), cy=(0.52, 0.5)),
         take=dict(start=0.2, speed=1.0),
         look=dict(exposure=-0.15, contrast=1.08, saturation=0.95)),
    dict(key="office", a=CUT["office"], b=CUT["air"] + 6,
         move=dict(zoom=(1.0, 1.32), cx=(0.5, 0.5), cy=(0.5, 0.42), dolly=0.10, far=0.1),
         take=dict(start=0.0, speed=1.0),
         look=dict(exposure=-0.1, contrast=1.06, saturation=0.9),
         anchors=dict(crown=(0.530, 0.2617))),
    dict(key="night-air", a=CUT["air"] - 6, b=CUT["research"], blur=3,
         move=dict(zoom=(1.0, 1.18), cx=(0.5, 0.5), cy=(0.47, 0.45), dolly=0.16, far=0.3),
         take=dict(start=0.6, speed=1.2),
         look=dict(exposure=0.0, contrast=1.08, saturation=1.0),
         anchors=dict(crown=(0.497, 0.1215), glow=(0.497, 0.146))),
    dict(key="research", a=CUT["research"], b=CUT["drop"],
         move=dict(zoom=(1.12, 1.24), cx=(0.5, 0.52), cy=(0.5, 0.48), dolly=0.02, spin=(0.0, 3.0)),
         take=dict(start=0.0, speed=1.0), look=dict(exposure=0.0, contrast=1.06),
         anchors=LOT, masks=["edges"]),
    dict(key="clients", a=CUT["clients"], b=CUT["drop"],
         move=dict(zoom=(1.0, 1.12), cx=(0.47, 0.47), cy=(0.62, 0.6), dolly=0.07),
         take=dict(start=0.0, speed=1.0), look=dict(exposure=0.0, contrast=1.05),
         anchors=dict(door=(0.58, 0.50)), masks=["windows"]),
    dict(key="reports", a=CUT["reports"], b=CUT["drop"],
         move=dict(zoom=(1.0, 1.1), cx=(0.53, 0.5), cy=(0.6, 0.58), dolly=0.08, orbit=(-0.05, 0.05), pivot=0.25),
         take=dict(start=0.0, speed=1.0), look=dict(exposure=0.0, contrast=1.05),
         anchors=dict(top=(0.65, 0.14)), masks=["model"]),
    dict(key="finance", a=CUT["finance"], b=CUT["drop"],
         move=dict(zoom=(1.0, 1.14), cx=(0.5, 0.5), cy=(0.55, 0.45), dolly=0.06, spin=(0.0, -4.0)),
         take=dict(start=0.0, speed=1.0), look=dict(exposure=0.0, contrast=1.06),
         masks=["lights"]),
    dict(key="comms", a=CUT["comms"], b=CUT["drop"],
         move=dict(zoom=(1.0, 1.1), cx=(0.5, 0.52), cy=(0.52, 0.5), dolly=0.05),
         take=dict(start=0.0, speed=1.0), look=dict(exposure=0.0, contrast=1.06),
         masks=["trails", "phase"]),
    dict(key="sunrise", a=CUT["drop"], b=CUT["pulse"],
         move=dict(zoom=(1.0, 1.0), cx=(0.5, 0.5), cy=(0.5, 0.5), dolly=0.18),
         take=dict(start=0.0, speed=1.1),
         look=dict(exposure=0.0, contrast=1.06, saturation=1.02)),
    dict(key="pulse", a=CUT["pulse"], b=CUT["grid"], blur=3,
         move=dict(zoom=(1.0, 1.0), cx=(0.5, 0.5), cy=(0.5, 0.5), dolly=0.30, far=0.15),
         take=dict(start=0.0, speed=1.2), look=dict(exposure=0.0, contrast=1.06),
         anchors=dict(vp=(0.507, 0.31), road=(0.506, 1.0), left=(0.30, 1.0), right=(0.75, 1.0)), masks=["road"]),
    dict(key="grid", a=CUT["grid"], b=CUT["device"],
         move=dict(zoom=(1.05, 1.22), cx=(0.5, 0.5), cy=(0.5, 0.5), dolly=0.04, spin=(0.0, 8.0)),
         take=dict(start=0.0, speed=1.0), look=dict(exposure=0.0, contrast=1.06),
         anchors=dict(centre=(0.5, 0.5)), masks=["streets", "lights", "phase"]),
    dict(key="device", a=CUT["device"], b=CUT["rise"],
         move=dict(zoom=(1.0, 1.1), cx=(0.5, 0.5), cy=(0.62, 0.6), dolly=0.05),
         take=dict(start=0.0, speed=1.0), look=dict(exposure=-0.1, contrast=1.06),
         masks=["screen", "spill"]),
    dict(key="rise", a=CUT["rise"], b=CUT["end"] + 4, blur=2,
         move=dict(zoom=(1.18, 1.0), cx=(0.5, 0.5), cy=(0.5, 0.5), dolly=-0.12, far=0.3),
         take=dict(start=0.0, speed=1.0), look=dict(exposure=0.0, contrast=1.05),
         anchors=dict(crown=(0.549, 0.217), base=(0.545, 0.47), **RISE_NODES)),
    dict(key="sky", a=CUT["end"] - 12, b=FRAMES,
         move=dict(zoom=(1.0, 1.05), cx=(0.5, 0.5), cy=(0.5, 0.52), dolly=0.03),
         take=dict(start=0.0, speed=0.8), look=dict(exposure=-0.05, contrast=1.04),
         anchors=dict(sun=(0.5, 0.689))),
]

# "Powerful on their own.": the five worlds side by side in five bands of the frame, each its own world's picture,
# from the bands' cut until they close on the frame's centre line just before the drop (comp.py draws them, type.py
# marks them).
GUTTER = 10
_bw = (1080 - 4 * GUTTER) / 5
BANDS = dict(strips=[dict(key=k, x0=round(i * (_bw + GUTTER)), x1=round(i * (_bw + GUTTER) + _bw))
                     for i, k in enumerate(["research", "clients", "reports", "finance", "comms"])],
             open=CUT["bands"], close=CUT["drop"] - 7, drop=CUT["drop"])

# How each shot hands over to the next: "cut" on the frame, or a transition of its own (see comp.py).
TRANSITIONS = {
    ("office", "night-air"): dict(kind="through-glass", a=CUT["air"] - 6, b=CUT["air"] + 6),
    ("comms", "sunrise"): dict(kind="bands-then-drop", bands=CUT["bands"], drop=CUT["drop"]),
    ("rise", "sky"): dict(kind="dissolve", a=CUT["end"] - 12, b=CUT["end"] + 4),
}


def main():
    work = Path(sys.argv[1]).resolve()
    root = work / "we-are-here"
    cues = json.loads((work / "sound-as-one" / "cues.json").read_text())
    shots = []
    for s in SHOTS:
        clip = root / "clips" / f"{s['key']}-1.mp4"
        still = root / "stills" / f"{s['key']}-1.png"
        depth = root / "depth" / f"{s['key']}-1-depth.png"
        shots.append({**s, "source": "take" if clip.exists() else "still", "clip": str(clip), "still": str(still),
                      "depth": str(depth)})
    edit = {"fps": FPS, "length": LENGTH, "frames": FRAMES, "cut": CUT, "shots": shots, "bands": BANDS,
            "transitions": [dict(pair=list(k), **v) for k, v in TRANSITIONS.items()], "cues": cues}
    (root / "edit.json").write_text(json.dumps(edit, indent=1))
    for s in shots:
        print(f"{s['key']:10s} {s['a']:5d}-{s['b']:5d}  {s['source']}")


if __name__ == "__main__":
    main()
