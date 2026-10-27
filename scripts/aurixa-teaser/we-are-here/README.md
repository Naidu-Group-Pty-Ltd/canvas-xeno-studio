# _We Are Here_: the third teaser's scripts

_We Are Here_ ([`docs/brands/aurixa-teaser/we-are-here/PLAN.md`](../../../docs/brands/aurixa-teaser/we-are-here/PLAN.md))
is _As One_'s script and soundtrack over a city of property at the turn of night to dawn. It is cut on a thread of gold
light. Its pictures are generated: 4K keyframes, set in motion as 4K takes where Higgsfield's credit allows, otherwise
moved by a camera through their depth. The light, the panes of software, the five bands, the words and the end card
are drawn over the pictures in code.

Run them in this order, from the repository's root, with `<work>` the _Aurixa Teaser_ work's `files` folder. `$PY` is a
Python with numpy and OpenCV, and Node needs Playwright's Chromium.

```
python3 -I scripts/aurixa-teaser/we-are-here/gen.py still <shot>        # each shot's 4K keyframe (shots.json)
python3 -I scripts/aurixa-teaser/we-are-here/gen.py clip <shot>         # its 4K take, when there is credit
$PY -I scripts/aurixa-teaser/we-are-here/depth.py <model> <work>/we-are-here/depth <work>/we-are-here/stills/*-1.png
python3 -I scripts/aurixa-teaser/we-are-here/edit.py <work>             # we-are-here/edit.json
$PY -I scripts/aurixa-teaser/we-are-here/track.py <work>                # tracks/<take>.json
$PY -I scripts/aurixa-teaser/we-are-here/masks.py <work>                # masks/<shot>-<name>.png
$PY -I scripts/aurixa-teaser/we-are-here/plates.py <work> [shot ...]    # plates/<shot>.mkv, its masks, its points
node scripts/aurixa-teaser/we-are-here/textures.cjs <work>              # textures/*.png
python3 -I scripts/aurixa-teaser/we-are-here/type.py <work>             # type/type.html
node scripts/aurixa-teaser/we-are-here/type.cjs <work>                  # type/frames/<n>.png
scripts/aurixa-teaser/we-are-here/film.sh <work> $PY                    # the composite, the master, its measures
```

`comp.py <work> --frames n,n,...` draws single frames as PNGs, to judge a change before the whole film is drawn.

| Script         | What it does                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shots.json`   | The fourteen shots: each keyframe's description and its take's. The look is the brand's. No people, no lettering, no logo and no real landmark are in any generated picture                                                                                                                                                                                                                                  |
| `depth.py`     | Each keyframe's depth (Depth Anything V2 small, from fabio-sim's ONNX release, its hash in the script), aligned to the keyframe's edges by a guided filter                                                                                                                                                                                                                                                  |
| `gen.py`       | Asks Xeno Studio's API for each keyframe (Marketing Studio 2.5 Flare, 4K) and each take (Kling 3.0 4K), once per request id, and keeps what came back in the work (`book.json`)                                                                                                                                                                                                                              |
| `edit.py`      | The cut on the voice's words: each shot's frames, its camera, its look, the points the light is anchored to, what the light acts on, the five bands and the transitions. A shot with a take uses it, and a shot without one uses its keyframe                                                                                                                                                                |
| `camera.py`    | The camera over a keyframe (a zoom, a centre, a turn, a dolly and a truck through its depth) and over a take (its framing and retiming). Shared by `plates.py`, which draws through it, and by the anchors the light lands on                                                                                                                                                                                 |
| `track.py`     | Follows the light's points through a take: features about each point, followed forward and back and fitted to one motion, and a spire's tip found in each frame by climbing the spire                                                                                                                                                                                                                       |
| `masks.py`     | What the light acts on, found in each keyframe: the lots' edges, the home's windows, the model, the towers' lit windows, the motorway's trails and the streets (each with how far along it the light has come), the phone's screen and the wet road                                                                                                                                                         |
| `plates.py`    | Each shot's frames at 1080 x 1920 and 24 fps, graded to the brand's look: a take retimed and framed, or a keyframe drawn at twice the size through its camera, its small lights breathing, with motion blur where the camera is fast. Its masks are moved with it, and its points are kept frame by frame                                                                                                  |
| `textures.cjs` | _As One_'s panes of software, its tab strip and its one word ("AI"), and the client's and the property's tags, drawn at twice _As One_'s size                                                                                                                                                                                                                                                                |
| `type.py`, `type.js`, `type.cjs` | The words: every spoken word rising as it is heard, in _As One_'s styles, set low in the frame over a soft shade; the five chapters and the five bands' marks; "Scenes created with AI" throughout. Photographed with nothing behind them                                                                                                                                                 |
| `comp.py`      | Every frame: the plates, the light (drawn as points a fraction of a pixel apart, spread by Gaussians, in linear light and high range), the panes and the glass they break into, the five bands and their seam, the drop, the transitions and the end card (the emblem and its lettering placed from the supplied art, the beam drawn into the orb, the rings inside the A); bloom, a soft shoulder, the lens, grain; then the words |
| `film.sh`      | The composite in four runs at once, joined, laid on _As One_'s `master.wav` at 24 fps (`../encode.sh`), and measured (`../qc.py`)                                                                                                                                                                                                                                                                             |
