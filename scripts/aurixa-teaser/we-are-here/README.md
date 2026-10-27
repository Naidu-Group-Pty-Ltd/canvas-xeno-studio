# _We Are Here_: the third teaser's scripts

_We Are Here_ ([`docs/brands/aurixa-teaser/we-are-here/PLAN.md`](../../../docs/brands/aurixa-teaser/we-are-here/PLAN.md))
is _As One_'s script and soundtrack as one continuous move of one camera through the system itself. The film is set in
the emblem's own navy, gold and ice. A core of ice light carries the platform's five tiers as rings about it, and
below it, from the first frame to the last, lies Australia, a relief map lit from orbit in the brand's colours: the
system's threads reach forty places in every state and territory, which link up across the country into one network.
Nothing in it is generated: the world is drawn in code from public map data, and the emblem is the supplied art.

Run them in this order, from the repository's root, with `<work>` the _Aurixa Teaser_ work's `files` folder. `$PY` is a
Python with numpy and OpenCV, and Node needs Playwright's Chromium.

```
python3 -I scripts/aurixa-teaser/fetch.py <work>/../cache             # the map data (once)
$PY -I scripts/aurixa-teaser/terrain.py <work>/../cache               # the terrain tiles laid on grids (once)
node scripts/aurixa-teaser/we-are-here/textures.cjs <work>            # textures/*.png: the panes, the tabs, the tags
$PY -I scripts/aurixa-teaser/we-are-here/comp.py <work> --labels      # type/labels.json: where the tiers' names go
python3 -I scripts/aurixa-teaser/we-are-here/type.py <work>           # type/type.html
node scripts/aurixa-teaser/we-are-here/type.cjs <work>                # type/frames/<n>.png
scripts/aurixa-teaser/we-are-here/film.sh <work> $PY [name]           # every frame, the master, its measures
```

`comp.py <work> --frames n,n,...` draws single frames as PNGs, to judge a change before the whole film is drawn, and
`earth_look.py <work> <out> t,t,...` the Earth alone at those moments. `comp.py` needs the map data in `<work>/../cache`
(or `--cache <dir>`). Each run loads the map data and works out the relief's light at every level, about 40 s; it
peaks near 2.8 GB while it loads and holds about 1.7 GB after, so `film.sh` draws four at a time (six at once ran out
of memory on a 16 GB machine).

The versions delivered before this one are drawn by the code as it was then: the city to the end and the Australia
version (the city to 21 s, Australia at night after it) by `ad68d85`'s scripts (`film.sh`, `australia.sh`).

| Script                           | What it does                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `space.py`                       | The world and the camera's one path through it, on the voice's words. The core, the five tiers' rings (each with its own life, apart, then as one, then standing as the emblem's rings), the threads to forty places in every state and territory, the national network between them and the pulses that race it from state to state, the pulse that is chased and the ground it lights, the waves and the emblem's pulses. The beats: where the camera is and where the Earth is under the system, from the continent seen from orbit to the chase over the ranges and back. It draws them as points and lines of light through a lens with depth of field, hides what the Earth hides, and says where the tiers' names go |
| `earth.py`                       | The Earth: where it lies under the system at a moment (`Ground`: the point under the core, the bearing, km a unit; the flat picture about that point and the bend onto the sphere), its relief's light at every level of every terrain grid (`Relief`: the key light's shading, the shadows its ranges cast, the sky's light, how rugged the ground is), and how it is drawn (`Earth`: the land mask and the Blue Marble's colours in the palette, read at each pixel's footprint; the towns' lights from GeoNames; `plate()`, the sky and the ground as one picture, the land lit as a relief map, the shelf seas over their bathymetry, the air on the limb and the dawn's rim; `lights()`, the towns' lights as points of the space) |
| `earth_look.py`                  | Draws the Earth alone through the film's camera at given moments, to judge its look. A tool, not part of the film's run                                                                                                                                                                                                                                                         |
| `textures.cjs`                   | _As One_'s panes of software, its tab strip and its one word ("AI"), and the client's and the property's tags, drawn at twice _As One_'s size in the brand's colours                                                                                                                                                                                                                 |
| `type.py`, `type.js`, `type.cjs` | The words: every spoken word rising as it is heard, in _As One_'s styles, set low in the frame over a soft shade; the five tiers' names on their rings as they are said. Photographed with nothing behind them                                                                                                                                                                  |
| `comp.py`                        | Every frame: the space through as many moments of the shutter as the camera's speed needs (the Earth's lights, and its land where it moves fast, through as many as their own motion needs), the Earth's plate behind it, the panes and the glass they break into, the one tool that comes apart, the tags following the pulse, and the end card (the emblem and its lettering placed from the supplied art, the rings inside the A, the logo's beat); bloom, a soft shoulder, the lens, grain; then the words |
| `film.sh`                        | The composite in twelve runs, four at a time, joined, laid on _As One_'s `master.wav` at 24 fps (`../encode.sh`), and measured (`../qc.py`)                                                                                                                                                                                                                                         |

The map data is fetched once by `../fetch.py` into the work's cache, outside the work's files, and read as data (no
package's code is run): GLOBE's land mask (NOAA, public domain) and NASA's Blue Marble Next Generation (public domain)
from the package registries; GeoNames' places (CC BY 4.0), with `data/region-places.json` (every place from 100 E to
180 E and 0 to 50 S) written by `../places.py --region`; and Mapzen's terrain tiles from AWS Open Data (SRTM and
GMTED2010 from the USGS, ETOPO1 from NOAA, Geoscience Australia's and LINZ's models: each asks for credit), which
`../terrain.py` lays on grids of latitude and longitude (`data/terrain-<zoom>.npy`).

The photographic versions before this one, a harbour city at dawn and then that city with its digital twin, were
made from generated keyframes and takes. Their scripts are in the history at `4ff2c35`
(`git show 4ff2c35:scripts/aurixa-teaser/we-are-here/<file>`). Their keyframes and takes are in the studio's library,
and the work's `we-are-here/book.json` names each one.
