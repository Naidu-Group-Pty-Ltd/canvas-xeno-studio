"""Reel 3's screens, from the screens harness's captures and the Snapshot's pages into the film's assets folder, and
screens.json.

  python3 -I scripts/aurixa-reel-3/assets.py <assetsDir> <sharedDir>[,<sharedDir>] <snapshotDir> <capturesDir> [...]

- Each <capturesDir> holds what screens/capture.cjs drew, with its manifest.json ({ shot: { file, css, scale, regions
  } }): the Borrowing Capacity screens, the client screens, the portals, the Aurixa Agent. Every picture is copied as
  r3-<shot>.png, and screens.json records its size in the product's CSS px, the device scale it was drawn at and the
  regions measured on it, so a scene points at "Calculate Capacity" rather than at a number typed in.
- <snapshotDir> holds the Borrowing Capacity Snapshot drawn by the product's own route and render container
  (screens/engine/run_snapshot.ts), its pages at 300 dpi (pages/page-<n>.png) and their regions (manifest.json, in PDF
  points from the page's top-left corner). Each page is a screen, snap-p<n>, measured in points.
- <sharedDir> is Reel 1's and Reel 2's assets folders (comma-separated): the logo's footage and lettering, the emblem, the fonts and the
  listing photographs Reel 3 draws as they are. They are linked into <assetsDir>, not copied.
"""

import json
import os
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_JSON = HERE.parents[1] / "docs" / "brands" / "aurixa-reel-3" / "screens.json"
# What Reel 3 draws from Reel 1's and Reel 2's assets: the logo's two takes (frame sequences) and its lettering, the
# marks, the fonts, the property's photograph (P) and the pointer's desk (D).
SHARED = (
    "logo-A-",
    "logo-B1-",
    "logo-art",
    "logo-clean",
    "logo-letters",
    "wordmark",
    "emblem",
    "mascot",
    "Selawik-",
    "P.png",
    "D.png",
    "listing-",
)

dst, snap = Path(sys.argv[1]), Path(sys.argv[3])
shared = [Path(p) for p in sys.argv[2].split(",")]
caps = [Path(p) for p in sys.argv[4:]]
dst.mkdir(parents=True, exist_ok=True)
screens = {}

linked = 0
for f in sorted(f for d in shared for f in d.iterdir()):
    if f.name.startswith(SHARED) and not (dst / f.name).exists():
        os.link(f, dst / f.name)
        linked += 1

for d in caps:
    manifest = json.loads((d / "manifest.json").read_text())
    for shot, info in manifest.items():
        if shot in screens:
            sys.exit(f"{shot} is in two capture folders")
        name = f"r3-{shot}.png"
        shutil.copyfile(d / info["file"], dst / name)
        screens[shot] = {
            "file": name,
            "css": [round(v, 2) for v in info["css"]],
            "scale": info["scale"],
            "regions": info.get("regions", {}),
            "from": d.name,
        }

sm = json.loads((snap / "manifest.json").read_text())
for page in sm["pages"]:
    n = page["page"]
    key = f"snap-p{n}"
    name = f"r3-{key}.png"
    shutil.copyfile(snap / "pages" / f"page-{n}.png", dst / name)
    x0, y0, x1, y1 = page["covers_pt"]
    screens[key] = {
        "file": name,
        "css": [round(x1 - x0, 2), round(y1 - y0, 2)],
        "scale": round(page["dpi"] / 72, 6),
        "regions": {
            r["id"]: [
                r["pt"][0],
                r["pt"][1],
                round(r["pt"][2] - r["pt"][0], 2),
                round(r["pt"][3] - r["pt"][1], 2),
            ]
            for r in page["regions"]
        },
        "ground": page.get("ground"),
        "role": page.get("role"),
        "section": page.get("section"),
        "from": "snapshot",
        "units": "PDF points",
    }

OUT_JSON.write_text(
    json.dumps(
        {
            "note": "Written by scripts/aurixa-reel-3/assets.py from the screens harness's captures and the Snapshot's pages: each picture's file in the assets folder, its size in the product's CSS px (a Snapshot page's in PDF points), the device scale it was drawn at, and the regions measured on it.",
            "avoid": sm.get("avoid", []),
            "screens": dict(sorted(screens.items())),
        },
        indent=1,
        ensure_ascii=False,
    )
    + "\n"
)
print(
    f"{len(screens)} screens into {dst} ({linked} shared files linked); {OUT_JSON.name} written"
)
