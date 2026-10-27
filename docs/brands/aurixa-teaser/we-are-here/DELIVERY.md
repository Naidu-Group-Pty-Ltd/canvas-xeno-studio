# Aurixa Systems · Teaser · _We Are Here_ · delivery

The third teaser, the second version of _As One_, made on 27 October 2026 at the client's brief. It is one continuous
move through the system itself, in the brand's own navy, gold and ice. The platform's five tiers work as one about
its core, and the Aurixa Systems emblem arrives as the system's pulse. It keeps _As One_'s script word for word and
its soundtrack as mixed ([`PLAN.md`](./PLAN.md) has the brief as it settled). This is the final, and how it goes to
the platforms.

## The final

Upload this file as it is: `aurixa-teaser-we-are-here-1080x1920.mp4`. Don't export it again from an editor, and don't
compress it first. Each platform encodes it once on upload, and every encode before that softens it.

|           |                                                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File      | 72,379,327 bytes, SHA-256 `87988689f28cb3b62db1c155fa617027708daac2f1295f14d2cd778df4c8ae60`                                                                              |
| Picture   | 1080 x 1920 (9:16), 24 fps, 1,092 frames, 45.5 s; H.264 High, level 4.2, progressive, BT.709, 12.5 Mbit/s                                                                 |
| Sound     | AAC-LC, 48 kHz stereo, 257 kbit/s; -14.0 LUFS integrated, loudness range 3.7 LU, true peak -2.3 dBTP                                                                      |
| Container | MP4 with its index at the front, so an upload page can read it while it is still arriving                                                                                 |
| Cover     | `cover-we-are-here-44.5s.jpg`, the emblem over the system, with its name and line; the emblem and its name hold in a 3:4 crop, and a square crop clips the triangle's tip |

Both are in the studio work _Aurixa Teaser_, under `files/delivery`, with `qc-we-are-here.json`, beside _Three
Questions_' and _As One_'s files.

Every spoken word is on screen as it is said, so the teaser reads with the sound off. Where a platform offers its own
automatic captions, leave them off, or the words appear twice.

The final was measured against its lossless reference before delivery (`scripts/aurixa-teaser/qc.py`):

- **The encode keeps 0.992 of the picture it was given**: SSIM against the reference as the encoder received it,
  converted to BT.709 4:2:0, in that format (Y 0.992, U 0.994, V 0.993). Its lowest frame, at 27.5 s, keeps 0.989.
- **Against the RGB reference, the master scores SSIM 0.978 and PSNR 43.2 dB.** The same picture converted to 8-bit
  4:2:0 with no encoder at all scores 0.989, the most this format allows on the measure. The loss is in red and blue
  near black (red 0.974, green 0.988, blue 0.972).
- No frame is drawn apart from its neighbours, and no frame is black.
- 1,092 frames, 45.5 s. Decoded from the file, the sound lines up with the mastered sound to the sample: at the first
  word (0.56 s), at the drop (22.25 s), on "one" (33.45 s) and on "Aurixa" (40.25 s).

## The picture

One camera, one world, no cut. The world is the emblem's own: navy space, fine gold lines, an orb of ice light. Far
below lies a city at night drawn as its streets of light, the property world, there as little as the story needs.
Each beat is what the line over it says.

- **The core** (0 to 4.5 s). Low over the city toward the few towers at its heart. On "operate" a core of ice light
  kindles above them, a ring of gold goes out from it and a thread climbs into the sky.
- **The noise** (4.5 to 13.3 s). Panes of software crowd the space before the core as the voice names them: windows,
  dashboards, a strip of tabs, the fourth "AI". By "ambition" they have hidden it.
- **The question changes** (13.3 to 15.8 s). The panes break, and their glass blows past the lens. On "the question
  changes" the core flares, a wave of light goes out from it, and five faint rings appear about it.
- **The five as one** (15.8 to 20.7 s). One view, the camera circling the core. Each tier lights on its word, its name
  on its ring. Research is a scan reading its ring. Clients are a constellation of points, joined. Reports are pages
  gathering. Finance is a rise of light. Communication is pulses running its ring, and the spokes that join every ring
  to every other and to the core. By "communication" all five work at once.
- **Powerful on their own** (20.7 to 22.25 s). The track falls silent. The rings drift apart, each on its own tilt, and
  just before the drop they are drawn into the core.
- **The drop** (22.25 s). The core bursts. The five come out of it as one, in one plane and turning together, with a
  flash and a ring of light through the space.
- **Separate destinations** (22.95 to 27.7 s). Threads of gold fall from the rings to thirty places across the city.
  Each place answers with a ring of light, and the streets about it warm to gold. On "destinations" every thread
  flares.
- **Intelligence, context** (27.7 to 31.8 s). A pulse leaves the rings and runs down a thread into the city, the camera
  beside it, and lights a street gold as it runs. On "context" the client's and the property's tags (the brand kit's
  demo record, Jordan Ellis and 14 Wattle Grove) ride with it back up to the system.
- **As one** (31.8 to 34.25 s). A wave of gold crosses the city, and on "one", on the bar, everything lights at once.
- **The next tool** (34.25 to 36.7 s). Stillness: one pane before the core. On "is" it comes apart into light that
  drifts into the system.
- **The system** (36.7 to 40.25 s). The threads are drawn up out of the city, and the rings stand to face us as the
  emblem's rings. On "becomes" three bars of light draw the emblem's triangle about the core, and on "the system" it
  locks with a pulse.
- **Aurixa Systems** (40.25 to 45.5 s). The emblem takes the system's place, the core its orb, and a pulse goes out
  from the orb as it lands. Its lettering rises letter by letter, AURIXA and then SYSTEMS on the bar, with a second
  pulse. The light circles inside the A in three rings until the orb keeps it, as on _As One_'s end card. The orb
  beats on the bars to the end, and the horizon warms toward dawn.

The logo is the supplied art, placed and never redrawn. The words are the brand's Playfair Display, with the turn of
each line in gold italic, and the tiers' names and the tags are its Inconsolata capitals. No person appears.

**How it was made** (`scripts/aurixa-teaser/we-are-here/README.md`).

- **Nothing in it is generated.** The world is drawn in code (`space.py`), and the emblem is the supplied art. So it
  needs no "Scenes created with AI" label, and carries none.
- **Light as a lens records it.** Every point and line is drawn in linear light and high range. The lens has a focus,
  so a near mote is a wide faint disc and a far one a fine point. The air dims what is far, and where the camera moves
  fast a frame is the average of up to four moments of a half-frame shutter. The whole is bloomed, given a soft
  shoulder, a lens's slight colour fringe at the edges, a vignette and fine grain. The words are laid over the
  finished picture.
- **The panes** are _As One_'s, redrawn in the brand's colours, and they break into Voronoi shards that fly at the
  lens.

## The sound

_As One_'s soundtrack, unchanged: `sound-as-one/master.wav`. That is Gabby's single dry take of the 95 words, under
_National Treasures_ from its first sample, as the reference uses it, at -14 LUFS. Every move, light and pulse in the
film is placed on its words and bars (`sound-as-one/cues.json`): "Powerful on their own." in the silent bar, the
drop at 22.25 s, "one" on the bar, and the emblem's pulses on the bars at the end.

## Before it runs publicly

- **The music's licence**, as for _As One_. _National Treasures_ is Drake's commercial recording. Before the teaser is
  posted, confirm that Aurixa holds the right to use it in a promotional video on each platform it goes to.
- **ElevenLabs' plan.** The voice is the client's ElevenLabs voice, so the account's plan must cover commercial use,
  including ads.

## Where things are

| What                    | Where                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| The final, cover and QC | The studio work _Aurixa Teaser_ (`9dd41db4-0e2f-4f25-8a6f-0f7eb0c6a6a5`), `files/delivery`                             |
| The soundtrack          | `files/sound-as-one`, as _As One_ delivered it                                                                         |
| The plan                | `docs/brands/aurixa-teaser/we-are-here/PLAN.md`                                                                        |
| The scripts             | `scripts/aurixa-teaser/we-are-here/`; its README says what each does and in what order, and draws every frame again |
