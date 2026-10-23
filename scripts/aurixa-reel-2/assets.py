"""Reel 2's screens, from the screens harness's captures into the film's assets folder, and screens.json.

  python3 -I scripts/aurixa-reel-2/assets.py <capturesDir> <assetsDir>

<capturesDir> holds what screens/capture.cjs drew (passport/) and screens/capture-portals.cjs drew (portals/), each
with its manifest.json. Every picture is copied under a name the scenes use (r2-...), and screens.json records each
one's size in the product's CSS px, the device scale it was drawn at and the regions measured on it, so a scene
points at "Send the Passport" on Shah Legal's row rather than at a number typed in. The Client Portal's consents
are kept from the end of their card only (the part the film shows): the card is 3,600 px tall in CSS px.
"""

import json
import shutil
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
OUT_JSON = HERE.parents[1] / "docs" / "brands" / "aurixa-reel-2" / "screens.json"
CONSENT_KEEP = 1400  # CSS px from the foot of the consent card

src, dst = Path(sys.argv[1]), Path(sys.argv[2])
dst.mkdir(parents=True, exist_ok=True)
screens = {}


def put(key, file, css, scale, regions=None, **extra):
    name = f"r2-{key}.png"
    shutil.copyfile(file, dst / name)
    screens[key] = {
        "file": name,
        "css": [round(v, 1) for v in css],
        "scale": scale,
        "regions": regions or {},
        **extra,
    }


# ---------------------------------------------------------------- the Passport: both audiences, and the stamps
pp = json.loads((src / "passport" / "manifest.json").read_text())
for audience, short in (("command", "cmd"), ("partner", "par")):
    a = pp["audiences"][audience]
    for shot in a["shots"]:
        key = shot["shot"].replace("leaf-", "")
        put(
            f"pp-{short}-{key}",
            src / "passport" / f"{audience}-{shot['shot']}.png",
            [shot["w"], shot["h"]],
            5,
        )
    seals = a.get("seals")
    if seals:
        earned = [s for s in seals["slots"] if not s["pending"]]
        layers = []
        for s in earned:
            name = f"r2-pp-{short}-seal-{s['n']}.png"
            shutil.copyfile(
                src / "passport" / f"{audience}-{seals['shot']}-slot-{s['n']}.png",
                dst / name,
            )
            layers.append(
                {
                    "file": name,
                    "die": [round(v, 2) for v in s["die"]],
                    "caption": s["caption"],
                }
            )
        put(
            f"pp-{short}-seals-unstruck",
            src / "passport" / f"{audience}-{seals['shot']}-unstruck.png",
            [470, 648],
            5,
            seals=layers,
            pending=[
                {"die": [round(v, 2) for v in s["die"]], "caption": s["caption"]}
                for s in seals["slots"]
                if s["pending"]
            ],
        )
for shot in pp["stamps"]:
    put(
        shot["shot"]
        .replace("stamp-stamp-", "stamp-")
        .replace("stamp-pending-", "pending-"),
        src / "passport" / f"stamp-{shot['shot']}.png",
        [shot["w"], shot["h"]],
        5,
    )

# ---------------------------------------------------------------- the portals
pt = json.loads((src / "portals" / "manifest.json").read_text())
for key, info in pt.items():
    file = src / "portals" / f"{key}.png"
    regions = {k: v for k, v in info["named"].items()}
    css = info["size"]
    if key.startswith("consent-"):
        # Only the foot of the card: crop the picture, and the regions with it.
        keep = min(CONSENT_KEEP, css[1])
        top = css[1] - keep
        with Image.open(file) as im:
            s = info["scale"]
            im.crop((0, round(top * s), im.width, im.height)).save(
                dst / f"r2-{key}.png"
            )
        regions = {
            k: [x, y - top, w, h] for k, (x, y, w, h) in regions.items() if y + h > top
        }
        screens[key] = {
            "file": f"r2-{key}.png",
            "css": [css[0], keep],
            "scale": info["scale"],
            "regions": regions,
            "cropped_from": css[1],
        }
        continue
    put(key, file, css, info["scale"], regions)

OUT_JSON.write_text(
    json.dumps(
        {
            "note": "Written by scripts/aurixa-reel-2/assets.py from the screens harness's captures: each picture's file in the assets folder, its size in the product's CSS px, the device scale it was drawn at, and the regions measured on it.",
            "screens": dict(sorted(screens.items())),
        },
        indent=1,
        ensure_ascii=False,
    )
    + "\n"
)
print(f"{len(screens)} screens into {dst}; {OUT_JSON.name} written")
