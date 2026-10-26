# The teaser's renderers

The teaser, _Three Questions_ (`docs/brands/aurixa-teaser/PLAN.md`), is drawn in code: the Earth's night side
from orbit, Sydney at night from above, and the lines, windows and type over them. These scripts draw its style
frames and storyboard now, and they're the base the film is drawn from once the plan is approved.

```
scripts/aurixa-teaser/style_frames.sh <cache dir> <render dir> <assets dir> <fonts dir>
```

It runs everything below in order. Give it a Python with numpy, scipy and Pillow (`PYTHON=...`), Node with
Playwright, and about 4 GB of memory. Keep the cache outside the work's folder: its packages are large, public,
and fetched again in a minute. The assets are the product's pieces the windows show and the supplied logo, listed under `frames.py` below, and the fonts
are the brand's Playfair Display and Inconsolata. The work _Aurixa Teaser_ keeps both in its `files/assets` and
`files/fonts`.

| Script                        | What it does                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fetch.py`                    | Fetches the public map data from the package registries into the cache, as Reel 1's `satellite.py` does. It reads the one file wanted out of each package and runs none of their code. The packages are GLOBE's land mask, NASA's Blue Marble and Natural Earth's relief (public domain), GSHHG's full-resolution shorelines (LGPL) and GeoNames' places (CC BY 4.0)              |
| `places.py`                   | Reads Australia's places out of GeoNames' `cities.pbf` with our own protobuf reader, writing `data/au-places.json` (name, population, feature code, point)                                                                                                                                                                                                                        |
| `orbit.py`                    | Beat 1: the Earth's night side from 900 km up, looking up the east coast. A ray to every pixel, the sphere it meets, the land and sea, the ground in moonlight, the airglow over the limb and the stars. Every place is a spread of lights in kilometres, projected through the same camera                                                                                       |
| `gshhs.py`                    | Reads GSHHG's shorelines out of basemap-data-hires' files                                                                                                                                                                                                                                                                                                                         |
| `citydata.py`                 | Puts the Sydney basin on a plane in kilometres around 14 Wattle Grove: a view (rotation, scale, centre), the land's share of each pixel from the shoreline, and people per square kilometre from GeoNames                                                                                                                                                                         |
| `city.py`                     | Beats 2 to 6: Sydney at night from above. The coast is real. The roads are drawn from where people live: the boundaries between neighbouring suburbs bent into wandering roads, with major roads between the largest suburbs and a street grid in each suburb. No real street is traced or named                                                                                  |
| `offices.py`                  | How the three offices were chosen: real suburbs whose points make a near-equilateral triangle with the property inside (South Windsor, Edensor Park and Hornsby, 28 to 30 km a side)                                                                                                                                                                                              |
| `frames.py`                   | The ten style frames as pages. The windows hold the product's own screens (`D.png`, the floor plan; `r2-pp-cmd-cover.png`, the Passport's cover, cropped below its maker's name so the brand stays back for the end; `r3-bc-card-empty.png`, the Borrowing Capacity card), and the logo is the supplied art (`logo-clean.png`, `logo-art.png`), placed and blended, never redrawn |
| `shoot.cjs`                   | Photographs each page at 1080 x 1920 once its fonts and images have settled                                                                                                                                                                                                                                                                                                       |
| `board.py`, `shoot_board.cjs` | The storyboard: each beat of `docs/brands/aurixa-teaser/script.json` with its frame, photographed whole                                                                                                                                                                                                                                                                           |

Every script that reads downloaded data reads it as data: the packages' code is never run, and Python runs with
`-I`.
