# _We Are Here_: the third teaser's scripts

_We Are Here_ ([`docs/brands/aurixa-teaser/we-are-here/PLAN.md`](../../../docs/brands/aurixa-teaser/we-are-here/PLAN.md))
is _As One_'s script and soundtrack as one continuous move of one camera through the system itself. The film is set in
the emblem's own navy, gold and ice. A core of ice light carries the platform's five tiers as rings about it, and far
below lies a city drawn as its streets of light. Nothing in it is generated: the world is drawn in code, and the
emblem is the supplied art.

Run them in this order, from the repository's root, with `<work>` the _Aurixa Teaser_ work's `files` folder. `$PY` is a
Python with numpy and OpenCV, and Node needs Playwright's Chromium.

```
node scripts/aurixa-teaser/we-are-here/textures.cjs <work>            # textures/*.png: the panes, the tabs, the tags
$PY -I scripts/aurixa-teaser/we-are-here/comp.py <work> --labels      # type/labels.json: where the tiers' names go
python3 -I scripts/aurixa-teaser/we-are-here/type.py <work>           # type/type.html
node scripts/aurixa-teaser/we-are-here/type.cjs <work>                # type/frames/<n>.png
scripts/aurixa-teaser/we-are-here/film.sh <work> $PY                  # every frame, the master, its measures
```

`comp.py <work> --frames n,n,...` draws single frames as PNGs, to judge a change before the whole film is drawn.

| Script                           | What it does                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `space.py`                       | The world and the camera's one path through it, on the voice's words. The core, the five tiers' rings (each with its own life, apart, then as one, then standing as the emblem's rings), the threads to the city, the pulse that is chased and the street it lights, the waves and the emblem's pulses, and the city itself (districts of streets, a harbour, a river, roads with their traffic, a few towers). It draws them as points and lines of light through a lens with depth of field, and says where the tiers' names go |
| `textures.cjs`                   | _As One_'s panes of software, its tab strip and its one word ("AI"), and the client's and the property's tags, drawn at twice _As One_'s size in the brand's colours                                                                                                                                                                                                                 |
| `type.py`, `type.js`, `type.cjs` | The words: every spoken word rising as it is heard, in _As One_'s styles, set low in the frame over a soft shade; the five tiers' names on their rings as they are said. Photographed with nothing behind them                                                                                                                                                                  |
| `comp.py`                        | Every frame: the space through as many moments of the shutter as the camera's speed needs, the panes and the glass they break into, the one tool that comes apart, the tags following the pulse, and the end card (the emblem and its lettering placed from the supplied art, the rings inside the A); bloom, a soft shoulder, the lens, grain; then the words |
| `film.sh`                        | The composite in four runs at once, joined, laid on _As One_'s `master.wav` at 24 fps (`../encode.sh`), and measured (`../qc.py`)                                                                                                                                                                                                                                                  |

The photographic versions before this one, a harbour city at dawn and then that city with its digital twin, were
made from generated keyframes and takes. Their scripts are in the history at `4ff2c35`
(`git show 4ff2c35:scripts/aurixa-teaser/we-are-here/<file>`). Their keyframes and takes are in the studio's library,
and the work's `we-are-here/book.json` names each one.
