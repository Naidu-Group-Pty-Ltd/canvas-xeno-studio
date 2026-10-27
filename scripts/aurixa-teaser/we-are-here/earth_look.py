"""Draws the Earth (earth.py) through the film's own camera at a few moments, to judge its look before the world uses
it: the plate, the towns' lights, the finish. A tool for the Australia version, not part of the film's run.

  $PY -I earth_look.py <work files dir> <out dir> '[{"t": 25.8, "lat": -34.4, "lon": 149.3, "bearing": 29, "km": 20, "name": "b"}]'

Each view: t (the film's time: its camera), the point under the core (lat, lon), the bearing the camera's -z faces
(degrees), km a unit; optional moon_az and moon_el (degrees, at that point), dawn (0 to 1) with sun_dep and sun_az
(degrees below the horizontal and right of -z), detail (0 to 1), k (the lights' brightness). Writes <name>.png
and sheet.png. The map data is read from the work's cache (<work>/../cache, ../fetch.py)."""
import sys, time, json, math
from pathlib import Path
import numpy as np, cv2
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import comp, space, earth
work = Path(sys.argv[1]).resolve()
cache = work.parent / 'cache'
out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
film = comp.Film(work)
t0 = time.time(); E = earth.Earth(cache); print('earth load', round(time.time()-t0, 1), 's', len(E.light_k), 'lights')
views = json.loads(sys.argv[3])
for v in views:
    t = v['t']
    pose = film.world.pose(t)
    gr = earth.Ground(v['lat'], v['lon'], v['bearing'], v['km'])
    ml = earth.toward(v['lat'], v['lon'], v.get('moon_az', 40.0), (90 - v.get('moon_el', 35.0)) * 111.2)
    moon = gr.direction(earth.geo(*ml))
    e = math.radians(v.get('sun_dep', 26.0)); a = math.radians(v.get('sun_az', 0.0))
    sun = np.array([math.sin(a) * math.cos(e), -math.sin(e), -math.cos(a) * math.cos(e)])
    look = dict(detail=v.get('detail', 1.0), moon=moon, sun=sun, dawn=v.get('dawn', 0.0), haze=1.0, navy=space.NAVY, ice=space.ICE, gold=space.GOLD, warm=space.WARM)
    t1 = time.time()
    img = E.plate(pose, gr, look, space.W, space.H)
    t2 = time.time()
    L = comp.Light()
    pt = space.Painter(L, pose)
    E.lights(pt, gr, v.get('k', 0.05), cols=(space.WARM, space.ICE, space.GOLD), t=t)
    if L.used: img = img + L.resolve()
    t3 = time.time()
    n = int(round(t * 24))
    srgb = film.finish(img, n)
    cv2.imwrite(str(out / f"{v.get('name', n)}.png"), (srgb[..., ::-1] * 255 + 0.5).astype(np.uint8))
    print(v.get('name', n), 'plate', round(t2-t1, 2), 's lights', round(t3-t2, 2), 's height', round(gr.height(pose.pos)), 'km')
names = [v.get('name') for v in views]
ims = [cv2.resize(cv2.imread(str(out / f'{n}.png')), (540, 960), interpolation=cv2.INTER_AREA) for n in names]
cv2.imwrite(str(out / 'sheet.png'), np.hstack(ims))
