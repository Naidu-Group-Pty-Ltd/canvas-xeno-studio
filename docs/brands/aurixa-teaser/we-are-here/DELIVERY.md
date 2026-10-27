# Aurixa Systems · Teaser · _We Are Here_ · delivery

The third teaser, the second version of _As One_, made on 27 October 2026 at the client's brief. It is one continuous
move through the system itself, in the brand's own navy, gold and ice. The platform's five tiers work as one about
its core, and the Aurixa Systems emblem arrives as the system's pulse. It keeps _As One_'s script word for word and
its soundtrack as mixed ([`PLAN.md`](./PLAN.md) has the brief as it settled).

This is the final: **the Australia version**, made the same day at the client's last notes. From 21 s the world below
the system is Australia at night, seen from orbit, where the version delivered first had its city of streets; the
threads reach thirty towns across the country, and the journey runs up the east coast. At the end the system's
triangle gives way to the logo, which stays as it is, and the logo's pulse carries out over the country. Everything in
and about the orb, the words and the structure are as they were, and the first 21 seconds are the delivered film's.

## The final

Upload this file as it is: `aurixa-teaser-we-are-here-australia-1080x1920.mp4`. Don't export it again from an editor,
and don't compress it first. Each platform encodes it once on upload, and every encode before that softens it.

|           |                                                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File      | 64,127,760 bytes, SHA-256 `a4bdc54c6c8dc87dd229475c872f989b1625d0fc51a0eefe73c3d5a24e3d0020`                                                                                          |
| Picture   | 1080 x 1920 (9:16), 24 fps, 1,092 frames, 45.5 s; H.264 High, level 4.2, progressive, BT.709, 11.0 Mbit/s                                                                             |
| Sound     | AAC-LC, 48 kHz stereo, 257 kbit/s; -14.0 LUFS integrated, loudness range 3.7 LU, true peak -2.3 dBTP                                                                                  |
| Container | MP4 with its index at the front, so an upload page can read it while it is still arriving                                                                                             |
| Cover     | `cover-we-are-here-australia-44.5s.jpg`, the emblem and its name over the dawn on the limb, with its line and the coast's towns below; the emblem, its name and the line hold in a 3:4 crop, and a square crop clips the triangle's tip and the line |

Both are in the studio work _Aurixa Teaser_, under `files/delivery`, with `qc-we-are-here-australia.json`, beside
_Three Questions_' and _As One_'s files and the version delivered first (`aurixa-teaser-we-are-here-1080x1920.mp4`,
kept as it was).

Every spoken word is on screen as it is said, so the teaser reads with the sound off. Where a platform offers its own
automatic captions, leave them off, or the words appear twice.

The final was measured against its lossless reference before delivery (`scripts/aurixa-teaser/qc.py`):

- **The encode keeps 0.993 of the picture it was given**: SSIM against the reference as the encoder received it,
  converted to BT.709 4:2:0, in that format (Y 0.992, U 0.994, V 0.994). Its lowest frame, at 27.7 s (the camera's
  swoop into the chase), keeps 0.989. The version delivered first scored 0.992.
- **Against the RGB reference, the master scores SSIM 0.980 and PSNR 43.6 dB.** The same picture converted to 8-bit
  4:2:0 with no encoder at all scores 0.990, the most this format allows on the measure. The loss is in red and blue
  near black (red 0.976, green 0.989, blue 0.976).
- No frame is drawn apart from its neighbours, and no frame is black.
- 1,092 frames, 45.5 s. Decoded from the file, the sound lines up with the mastered sound to the sample: at the first
  word (0.56 s), at the drop (22.25 s), on "one" (33.45 s) and on "Aurixa" (40.25 s).
- **The first 21 seconds are the delivered film's.** Frames 0 to 503 are its pictures, drawn by the same code (frames
  490 to 503 were drawn again and checked equal to it, bit for bit): in the new master 454 of them are identical to the
  first master's, and the 50 just before 21 s match it at 49 dB PSNR or better (the encoder's look-ahead now sees the
  new frames after them), a difference no eye can see.

## The picture

One camera, one world, no cut. The world is the emblem's own: navy space, fine gold lines, an orb of ice light. Below
it lies, to 21 s, a city at night drawn as its streets of light; from 21 s, Australia at night from orbit, the land in
moonlight, every town's lights in gold. Each beat is what the line over it says.

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
- **Powerful on their own** (20.7 to 22.25 s). The track falls silent. The rings drift apart, each on its own tilt. From
  21 s the system rises out of the city into orbit: the city shrinks into Canberra's lights, the horizon falls into
  the curve of the Earth's limb, and Sydney's lights, the coast and the moon's sheen on the Tasman come up. Just
  before the drop the rings are drawn into the core.
- **The drop** (22.25 s). The core bursts over the coast. The five come out of it as one, in one plane and turning
  together, with a flash and a ring of light through the space.
- **Separate destinations** (22.95 to 27.7 s). Threads of gold fall from the rings to thirty towns across Australia,
  from Sydney, Melbourne, Brisbane, Adelaide and Hobart to Broken Hill, Alice Springs and Cairns, the far ones arcing
  over the horizon. Each answers with a ring of light on the ground, and the lights about it turn gold. On
  "destinations" every thread flares, and the land flows toward the camera as the system travels north.
- **Intelligence, context** (27.7 to 31.8 s). A pulse leaves the rings and runs down a thread to Dubbo, the camera
  beside it, then 269 km along the ground over the ranges into Sydney's lights, lighting its way gold. On "context",
  at Banksia Rise, the client's and the property's tags (the brand kit's demo record, Jordan Ellis and 14 Wattle
  Grove) come in beside it and ride with it back up to the system.
- **As one** (31.8 to 34.25 s). The system rises over the country, and a wave of gold crosses it, each town flaring as
  it is reached; on "one", on the bar, everything lights at once and a ring runs out over the land.
- **The next tool** (34.25 to 36.7 s). Stillness: one pane before the core, the Earth's limb low in the frame. On "is"
  it comes apart into light that drifts into the system.
- **The system** (36.7 to 40.25 s). The Earth turns east under the system. The threads are drawn up out of the
  country, and the rings stand to face us as the emblem's rings. On "becomes" three bars of light draw the emblem's
  triangle about the core, and on "the system" it locks with a pulse.
- **Aurixa Systems** (40.25 to 45.5 s). The emblem takes the system's place, the core its orb, and a pulse goes out
  from the orb as it lands. The triangle and the rings' fine lines dissipate, and the logo stays as it is. Its
  lettering rises letter by letter, AURIXA and then SYSTEMS on the bar. The light circles inside the A in three rings
  until the orb keeps it, as on _As One_'s end card. On "Systems" and on every bar to the end (40.86, 42.72 and
  44.58 s, the music's own hits) the logo beats: its light swells, its orb flares, a ring goes through the space with
  a fine echo behind it, and the beat runs out over the northern coast's towns at the foot of the frame, each flaring
  as it passes. Beyond them the Tasman runs out to the limb, where the dawn comes up, a thin gold rim behind the
  emblem.

The logo is the supplied art, placed and never redrawn. The words are the brand's Playfair Display, with the turn of
each line in gold italic, and the tiers' names and the tags are its Inconsolata capitals. No person appears.

**How it was made** (`scripts/aurixa-teaser/we-are-here/README.md`).

- **Nothing in it is generated.** The world is drawn in code (`space.py`), Australia from public map data
  (`earth.py`), and the emblem is the supplied art. So it needs no "Scenes created with AI" label, and carries none.
- **Australia is map data, drawn as night from orbit**: GLOBE's land mask for the coast, NASA's Blue Marble and Natural
  Earth's shaded relief for the land in moonlight, and GeoNames' places for every town's lights and the thirty towns.
  Each map is read at each pixel's own footprint, so the coast neither shimmers far off nor aliases at the limb, and
  each town keeps its brightness on the frame from orbit down to the chase.
- **Light as a lens records it.** Every point and line is drawn in linear light and high range. The lens has a focus,
  so a near mote is a wide faint disc and a far one a fine point. The air dims what is far, and where the camera moves
  fast a frame is the average of up to four moments of a half-frame shutter (over the Earth, up to eight, and the
  towns' lights as many as their motion needs, so they streak). The whole is bloomed, given a soft shoulder, a lens's
  slight colour fringe at the edges, a vignette and fine grain. The words are laid over the finished picture.
- **The panes** are _As One_'s, redrawn in the brand's colours, and they break into Voronoi shards that fly at the
  lens.

## The sound

_As One_'s soundtrack, unchanged: `sound-as-one/master.wav`. That is Gabby's single dry take of the 95 words, under
_National Treasures_ from its first sample, as the reference uses it, at -14 LUFS. Every move, light and pulse in the
film is placed on its words and bars (`sound-as-one/cues.json`): "Powerful on their own." and the rise into orbit in
the silent bar, the drop at 22.25 s, "one" on the bar, and the logo's beats on the bars at the end.

## Before it runs publicly

- **The music's licence**, as for _As One_. _National Treasures_ is Drake's commercial recording. Before the teaser is
  posted, confirm that Aurixa holds the right to use it in a promotional video on each platform it goes to.
- **ElevenLabs' plan.** The voice is the client's ElevenLabs voice, so the account's plan must cover commercial use,
  including ads.
- **GeoNames' credit.** Where the towns' lights are, and the thirty towns, come from GeoNames, whose data is licensed
  CC BY 4.0, which asks for credit. Wherever the post's description or credits allow, add: "Map data: GeoNames
  (geonames.org, CC BY 4.0); NASA Blue Marble; Natural Earth; NOAA GLOBE." The other three are public domain and need
  no credit; naming them is a courtesy.

## Where things are

| What                    | Where                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| The final, cover and QC | The studio work _Aurixa Teaser_ (`9dd41db4-0e2f-4f25-8a6f-0f7eb0c6a6a5`), `files/delivery`                             |
| The version first delivered | The same folder: `aurixa-teaser-we-are-here-1080x1920.mp4`, the city to the end                                    |
| The film's runs         | `files/we-are-here/film`: the opening's two as first delivered, and the four from frame 490 (`australia.sh`)          |
| The soundtrack          | `files/sound-as-one`, as _As One_ delivered it                                                                         |
| The map data            | The work's cache, beside `files` (`scripts/aurixa-teaser/fetch.py` fills it), outside what the studio keeps           |
| The plan                | `docs/brands/aurixa-teaser/we-are-here/PLAN.md`                                                                        |
| The scripts             | `scripts/aurixa-teaser/we-are-here/`; its README says what each does and in what order, and draws every frame again |
