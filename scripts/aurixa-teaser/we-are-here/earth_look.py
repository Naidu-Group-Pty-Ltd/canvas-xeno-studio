"""Draws the Earth alone (earth.py) through the film's own camera at given moments, finished as the film is (bloom,
shoulder, vignette, grain), with nothing of the system over it: to judge the land's look at a moment without its
motion blur, the system's light or the words. A tool, not part of the film's run.

  $PY -I earth_look.py <work files dir> <out dir> 0.5,16.0,29.3,44.5

Writes <frame>.png for each moment (in seconds) and sheet.png beside them. The map data is read from the work's cache
(<work>/../cache: ../fetch.py, then ../terrain.py)."""
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import comp  # noqa: E402
import space  # noqa: E402

work = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
t0 = time.time()
film = comp.Film(work)
print("film and earth load", round(time.time() - t0, 1), "s")
w = film.world
names = []
for t in (float(v) for v in sys.argv[3].split(",")):
    n = int(round(t * space.FPS))
    t1 = time.time()
    img = film.earth.plate(w.pose(t), w.ground(t), w.look(t), space.W, space.H)
    srgb = film.finish(img, n)
    cv2.imwrite(str(out / f"{n:05d}.png"), (srgb[..., ::-1] * 255 + 0.5).astype(np.uint8))
    g = w.ground(t)
    print(f"{t:.2f} s: plate {time.time() - t1:.1f} s; under the core {g.lat:.2f}, {g.lon:.2f}, {g.km:.1f} km a unit; "
          f"the camera {g.height(w.pose(t).pos):.0f} km up")
    names.append(n)
ims = [cv2.resize(cv2.imread(str(out / f"{n:05d}.png")), (432, 768), interpolation=cv2.INTER_AREA) for n in names]
cv2.imwrite(str(out / "sheet.png"), np.hstack(ims))
