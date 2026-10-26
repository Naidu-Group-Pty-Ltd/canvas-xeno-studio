# _As One_: the second teaser's scripts

_As One_ ([`docs/brands/aurixa-teaser/as-one/PLAN.md`](../../../docs/brands/aurixa-teaser/as-one/PLAN.md)) is made
from the client's reference teaser (`docs/brands/aurixa-teaser/REFERENCE.md`):

- its script, word for word, spoken dry in the brand voice;
- _National Treasures_ as the reference uses it;
- a hall of black marble drawn in WebGL, where the five parts of the business become one system.

The tools come from _Three Questions_ (`../`): its master, encode and quality check, each now taking the film's length.

```
python3 -I scripts/aurixa-teaser/as-one/voice.py <work files>/sound-as-one/vo full
python3 -I scripts/aurixa-teaser/as-one/sound.py <work files>/sound-as-one <national treasures, 48 kHz wav>
python3 -I scripts/aurixa-teaser/master.py <work files>/sound-as-one/mix.wav <work files>/sound-as-one/master.wav
python3 -I scripts/aurixa-teaser/as-one/textures.py <textures dir>
python3 -I scripts/aurixa-teaser/as-one/film.py <work files> <textures dir>
node scripts/aurixa-teaser/as-one/render.cjs <work files>/film-as-one <scratch dir>
scripts/aurixa-teaser/encode.sh <scratch dir>/reference.mkv <work files>/sound-as-one/master.wav <out.mp4> 45.5
python3 -I scripts/aurixa-teaser/qc.py <out.mp4> <scratch dir>/reference.mkv <qc.json> 1365
```

Give the Python scripts numpy, scipy and Pillow. Give `render.cjs` Node with Playwright's Chromium: WebGL2 runs on
SwiftShader, so no GPU is needed. Decode _National Treasures_ (the studio's asset `221832d4…`) to 48 kHz WAV with FFmpeg
first.

| Script        | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `voice.py`    | The reference's 95 words as one take in the brand voice (Gabby, ElevenLabs), through Xeno Studio's `generate_voiceover`. Each take is asked for once: the same request id returns the first take.                                                                                                                                                                                                                                                                                                       |
| `sound.py`    | The soundtrack. _National Treasures_ runs from its first sample at the reference's measured gains and fade, with nothing ducked. The take is cut into its eleven sentences in its own silences and laid in three runs, each as read: "Powerful on their own." alone in the bar before the drop, and "one" on the bar. The voice is dry: a 70 Hz high-pass and nothing else. Writes the stems, `mix.wav` and `cues.json`, where every word falls.                                                        |
| `textures.py` | The hall's black marble (4096 px, tiling: long veins at one grain, coarse to hairline, faded along their length; its alpha says where the veins are, so the polish does not show through them) and the fog, from noise filtered in the frequency domain.                                                                                                                                                                                                                                                |
| `film.py`     | The film as one page. It holds the WebGL canvas and the spoken words, each word its own box, in _Three Questions_' styles. It keys the emblem and the supplied lettering out of their night for the end, cut as _Three Questions_ cuts them.                                                                                                                                                                                                                                                            |
| `gl.js`       | A small WebGL2 engine. One camera in metres, HDR targets, and the world drawn twice: once mirrored in the floor for the marble's polish. Lines are anti-aliased quads widened in the screen's own pixels, each end ramped so a polyline's segments meet at exactly one. It also does bloom and a filmic tone map.                                                                                                                                                                                       |
| `film.js`     | Every instant of the 45.5 seconds, from the time alone: the beam, the noise, the five cases and their holograms, the gold between them, the pulse and the context following it, the empty case, the triangle and the emblem, and the camera through it all. Its times are the voice's words and the track's bars. `window.setT(t, {n, shutter})` draws a frame as the average of n samples over the shutter, each moved by a fraction of a pixel, so it is blurred as it moves and smooth at its edges. |
| `render.cjs`  | Draws every frame in Chromium on two processes. The world is at the frame's size and the words at twice it. Each frame is kept once two captures agree, and the whole is joined into a lossless reference.                                                                                                                                                                                                                                                                                              |
| `helper.sh`   | A helper session's share, as Reels 2 and 3 were drawn across machines. It pulls the page's inputs from the teaser's work, builds the page, starts a work of its own under the teaser's, draws its frames (`RENDER_RANGE=first:last`) under `work.py run`, and saves them there for the joining session.                                                                                                                                                                                                 |
| `verify.py`   | Holds frames drawn on another machine against the same frames drawn here, pixel by pixel, before a share is spliced into the film.                                                                                                                                                                                                                                                                                                                                                                      |
