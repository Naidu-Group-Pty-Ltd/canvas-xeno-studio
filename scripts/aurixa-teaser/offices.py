#!/usr/bin/env python3
"""Where the three offices stand: three real suburbs around 14 Wattle Grove whose points make a near-equilateral
triangle with the property inside it, each in lit suburbs.

  python3 -I scripts/aurixa-teaser/offices.py <cache dir>

The property sits on Sydney's north-western edge, so no triangle with it at the centre keeps all three corners in
the lit city; this lists the best that hold it inside instead (sides within 25% of each other, 14 to 34 km, the
property at least 12% in from every side, every corner where people live). The teaser takes the first: South
Windsor (01), Edensor Park (02) and Hornsby (03). None is named on screen."""
import itertools
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
import citydata as cd  # noqa: E402

C = Path(sys.argv[1])
g = dict(cx=480, cy=480, up=0, s=4.0, w=960, h=960)  # 240 km square around the property, 0.25 km a pixel
L = cd.land(g, C / "pkgs/bmdh/basemap_data_hires-2.0.0-py3-none-any.whl", ss=2)
places = cd.places(C)
D = cd.density(g, places, L)
cands = [p for p in places if p["p"] >= 5000 and 4 < np.hypot(p["e"], p["nn"]) < 36]
for p in cands:
    x, y = cd.km_to_px(g, p["e"], p["nn"])
    p["d"] = float(ndimage.map_coordinates(D, [[y], [x]], order=1)[0])
cands = [p for p in cands if p["d"] > 900]
res = []
for a, b, c in itertools.combinations(cands, 3):
    P = np.array([[a["e"], a["nn"]], [b["e"], b["nn"]], [c["e"], c["nn"]]])
    sides = np.array([np.linalg.norm(P[0] - P[1]), np.linalg.norm(P[1] - P[2]), np.linalg.norm(P[2] - P[0])])
    if sides.max() / sides.min() > 1.25 or not 14 < sides.mean() < 34:
        continue
    T = np.array([[P[0, 0] - P[2, 0], P[1, 0] - P[2, 0]], [P[0, 1] - P[2, 1], P[1, 1] - P[2, 1]]])
    l1, l2 = np.linalg.solve(T, -P[2])
    bary = np.array([l1, l2, 1 - l1 - l2])  # the property's place in the triangle
    if bary.min() < 0.12:
        continue
    score = (-2.5 * (sides.max() / sides.min() - 1) + 0.6 * np.log(min(a["d"], b["d"], c["d"])) + 1.5 * bary.min()
             + 0.25 * np.log(a["p"] + b["p"] + c["p"]))
    res.append((round(score, 2), [x["n"] for x in (a, b, c)], sides.round(1).tolist(), bary.round(2).tolist()))
for r in sorted(res, reverse=True)[:10]:
    print(r)
