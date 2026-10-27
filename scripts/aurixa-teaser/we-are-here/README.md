# _We Are Here_: the third teaser's scripts

_We Are Here_ ([`docs/brands/aurixa-teaser/we-are-here/PLAN.md`](../../../docs/brands/aurixa-teaser/we-are-here/PLAN.md))
is _As One_'s script and soundtrack as one continuous move of one camera through the system itself. The film is set in
the emblem's own navy, gold and ice. A core of ice light carries the platform's five tiers as rings about it, and far
below lies a city drawn as its streets of light; from 21 s, in the Australia version, the world below is Australia at
night seen from orbit. Nothing in it is generated: the world is drawn in code from public map data, and the emblem is
the supplied art.

Run them in this order, from the repository's root, with `<work>` the _Aurixa Teaser_ work's `files` folder. `$PY` is a
Python with numpy and OpenCV, and Node needs Playwright's Chromium.

```
python3 -I scripts/aurixa-teaser/fetch.py <work>/../cache             # the map data (once): Australia from 21 s
node scripts/aurixa-teaser/we-are-here/textures.cjs <work>            # textures/*.png: the panes, the tabs, the tags
$PY -I scripts/aurixa-teaser/we-are-here/comp.py <work> --labels      # type/labels.json: where the tiers' names go
python3 -I scripts/aurixa-teaser/we-are-here/type.py <work>           # type/type.html
node scripts/aurixa-teaser/we-are-here/type.cjs <work>                # type/frames/<n>.png
scripts/aurixa-teaser/we-are-here/film.sh <work> $PY                  # every frame, the master, its measures
```

`australia.sh <work> $PY` draws only frames 490 to the end again and joins them to the opening's two runs as delivered
(`part-00000`, `part-00290`), which is how the Australia version was made: frames 0 to 503 are the delivered film's,
bit for bit. With a third argument it writes into that folder instead, a draft to review.

`comp.py <work> --frames n,n,...` draws single frames as PNGs, to judge a change before the whole film is drawn.
`comp.py` needs the map data in `<work>/../cache` (or `--cache <dir>`); `--city` draws the city to the end instead, as
the version delivered first did.

| Script                           | What it does                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `space.py`                       | The world and the camera's one path through it, on the voice's words. The core, the five tiers' rings (each with its own life, apart, then as one, then standing as the emblem's rings), the threads, the pulse that is chased and the street it lights, the waves and the emblem's pulses, and the city itself (districts of streets, a harbour, a river, roads with their traffic, a few towers). From 21 s, Australia: the rise out of the city into orbit, the Earth's journey on keys of its own, the thirty towns the threads reach, the chase from Dubbo to Banksia Rise, the gold as the system reaches the towns. It draws them as points and lines of light through a lens with depth of field, hides what the Earth hides, and says where the tiers' names go |
| `earth.py`                       | The Earth: where it lies under the system at a moment (`Ground`: the point under the core, the bearing, km a unit; the flat picture about that point and the bend onto the sphere), and how it is drawn (`Earth`: the land mask, the Blue Marble and the shaded relief as maps read at each pixel's footprint; the towns' lights from GeoNames; `plate()`, the sky and the ground as one picture, with the moon's sheen and the dawn's rim; `lights()`, the towns' lights as points of the space) |
| `earth_look.py`                  | Draws the Earth alone through the film's camera at given moments, to judge its look. A tool, not part of the film's run                                                                                                                                                                                                                                                         |
| `textures.cjs`                   | _As One_'s panes of software, its tab strip and its one word ("AI"), and the client's and the property's tags, drawn at twice _As One_'s size in the brand's colours                                                                                                                                                                                                                 |
| `type.py`, `type.js`, `type.cjs` | The words: every spoken word rising as it is heard, in _As One_'s styles, set low in the frame over a soft shade; the five tiers' names on their rings as they are said. Photographed with nothing behind them                                                                                                                                                                  |
| `comp.py`                        | Every frame: the space through as many moments of the shutter as the camera's speed needs (the Earth's lights through as many as their own motion needs), the city's backdrop or, from 21 s, the Earth's plate, the panes and the glass they break into, the one tool that comes apart, the tags following the pulse, and the end card (the emblem and its lettering placed from the supplied art, the rings inside the A, the logo's beat); bloom, a soft shoulder, the lens, grain; then the words |
| `film.sh`                        | The composite in four runs at once, joined, laid on _As One_'s `master.wav` at 24 fps (`../encode.sh`), and measured (`../qc.py`)                                                                                                                                                                                                                                                  |
| `australia.sh`                   | The Australia version as it was made: frames 490 to the end in four runs, joined to the opening's two delivered runs, laid on `master.wav` and measured                                                                                                                                                                                                                          |

The map data is fetched once by `../fetch.py` from the package registries into the work's cache, outside the work's
files, and read as data (no package's code is run): GLOBE's land mask (NOAA, public domain), NASA's Blue Marble Next
Generation and Natural Earth's shaded relief (public domain), and GeoNames' places (CC BY 4.0), with
`data/region-places.json` (every place from 100 E to 180 E and 0 to 50 S) written by `../places.py --region`.

The photographic versions before this one, a harbour city at dawn and then that city with its digital twin, were
made from generated keyframes and takes. Their scripts are in the history at `4ff2c35`
(`git show 4ff2c35:scripts/aurixa-teaser/we-are-here/<file>`). Their keyframes and takes are in the studio's library,
and the work's `we-are-here/book.json` names each one.
