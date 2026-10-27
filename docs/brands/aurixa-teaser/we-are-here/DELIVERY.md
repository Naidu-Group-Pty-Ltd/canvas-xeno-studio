# Aurixa Systems · Teaser · _We Are Here_ · delivery

The third teaser, the second version of _As One_, made on 27 October 2026 at the client's brief. It is one continuous
move through the system itself, in the brand's own navy, gold and ice, with the system's light in electric cyan. The
platform's five tiers work as one about its core, and the Aurixa Systems emblem arrives as the system's pulse. It
keeps _As One_'s script word for word and its voice and music ([`PLAN.md`](./PLAN.md) has the brief as it settled).

This is the final: **the fourth version, in electric cyan with the voice heard**, made the same day at the client's
note on the third version, which they called perfect. Everything the system draws is now electric cyan, so that it
stands out over the gold land: its threads, links and pulses, its rings, beams and waves, the panes of software, the
tags, the tiers' names and the turn of each line. The soundtrack is _As One_'s, mixed again by Xeno Studio's own mixer
as the reels' soundtracks are, the music dipped under the voice so that every word is heard. Nothing else changed.

The third version made the film's world, and it stands: from the first frame to the logo the world below the system is
Australia, a vibrant relief map of the continent lit from orbit, its ranges standing out in gold and steel, its coast
drawn by its own shelf seas against the navy ocean. The system's threads reach forty places in every state and
territory, and those places link up across the country into one network, along which the system's pulses race from
state to state. Everything in and about the orb, the words and the structure are as they were; the triangle gives way
to the logo, which stays as it is, and the logo's pulse runs out over the country.

## The final

Upload this file as it is: `aurixa-teaser-we-are-here-v4-1080x1920.mp4`. Don't export it again from an editor, and
don't compress it first. Each platform encodes it once on upload, and every encode before that softens it.

|           |                                                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File      | 92,251,594 bytes, SHA-256 `cc79bc8f3214482e8f0d0ab3b7db7ccd0c581ab91ece367ccec66eb17cd56950`                                                                                          |
| Picture   | 1080 x 1920 (9:16), 24 fps, 1,092 frames, 45.5 s; H.264 High, level 4.2, progressive, BT.709, 16.0 Mbit/s                                                                             |
| Sound     | AAC-LC, 48 kHz stereo, 256 kbit/s; -14.0 LUFS integrated, loudness range 3.2 LU, true peak -1.5 dBTP                                                                                  |
| Container | MP4 with its index at the front, so an upload page can read it while it is still arriving                                                                                             |
| Cover     | `cover-we-are-here-v4-44.5s.jpg`, the emblem and its name over the dawn on the limb, with its line and Australia below; the emblem, its name and the line hold in a 3:4 crop          |

Both are in the studio work _Aurixa Teaser_, under `files/delivery`, with `qc-we-are-here-v4.json`, beside _Three
Questions_' and _As One_'s files and the three versions delivered before (`aurixa-teaser-we-are-here-1080x1920.mp4`,
the city to the end; `aurixa-teaser-we-are-here-australia-1080x1920.mp4`, Australia at night from 21 s; and
`aurixa-teaser-we-are-here-v3-1080x1920.mp4`, Australia throughout with the system in gold), kept as they were.

Every spoken word is on screen as it is said, so the teaser reads with the sound off. Where a platform offers its own
automatic captions, leave them off, or the words appear twice.

The final was measured against its lossless reference before delivery (`scripts/aurixa-teaser/qc.py`):

- **The encode keeps 0.991 of the picture it was given**: SSIM against the reference as the encoder received it,
  converted to BT.709 4:2:0, in that format (Y 0.991, U 0.993, V 0.993), as the third version's did. Its lowest frame,
  at 26.3 s (the rush up to New South Wales under the network), keeps 0.988.
- **Against the RGB reference, the master scores SSIM 0.972 and PSNR 40.6 dB.** The same picture converted to 8-bit
  4:2:0 with no encoder at all scores 0.984, the most this format allows on the measure (the third version's was
  0.989). 4:2:0 carries colour at half the resolution each way, and the system's fine cyan lines over the gold land
  are a colour against its opposite, so their edges keep a little less of their colour, mostly in red (red 0.959,
  green 0.986, blue 0.970). Side by side with its reference, the lowest frame (26.5 s, 0.951) shows it only as a
  slightly softer edge to the cyan.
- No frame is drawn apart from its neighbours, and no frame is black.
- 1,092 frames, 45.5 s. Decoded from the file, the sound lines up with the soundtrack to the sample: at the start of
  each of the eleven sentences, at the drop (22.25 s), on "one" (33.45 s) and on "Aurixa" (40.25 s).

## The picture

One camera, one world, no cut. The world is the emblem's own: navy space and an orb of ice light, and in it the
system's fine lines of light in electric cyan. Below it, from the first frame, lies Australia seen from orbit as a
relief map: its real topography drawn taller than it stands and lit by a key light from the north-north-east with the
shadows its ranges cast; the deserts in the brand's gold, the green in a deep steel, pale ground sand, the salt lakes
white; the shelf seas lifting toward the ice over the navy ocean; every town's lights in gold, turning cyan where the
system reaches them. The cyan stands out against the gold land wherever the two meet. Each beat is what the line over
it says.

- **The core** (0 to 4.5 s). The whole continent from orbit, about 6,400 km up, its towns' lights along the east coast.
  The camera comes down toward it, and on "operate" a core of ice light kindles over the country, a ring of cyan light
  goes out from it and a thread of light climbs into the sky.
- **The noise** (4.5 to 13.3 s). Panes of software, navy glass lit in electric cyan, crowd the space before the core
  as the voice names them: windows, dashboards, a strip of tabs, the fourth "AI". By "ambition" they have hidden it, and behind them the system has come
  down over the east coast.
- **The question changes** (13.3 to 15.8 s). The panes break, and their glass blows past the lens. On "the question
  changes" the core flares, a wave of light goes out from it, and five faint rings appear about it.
- **The five as one** (15.8 to 20.7 s). One view, the camera circling the core over the Sydney basin, the Blue
  Mountains and the coast, about 540 km up. Each tier lights on its word, its name on its ring. Research is a scan
  reading its ring. Clients are a constellation of points, joined. Reports are pages gathering. Finance is a rise of
  light. Communication is pulses running its ring, and the spokes that join every ring to every other and to the core.
  By "communication" all five work at once.
- **Powerful on their own** (20.7 to 22.25 s). The track falls silent. The rings drift apart, each on its own tilt,
  and the system rises over the country. Just before the drop the rings are drawn into the core.
- **The drop** (22.25 s). The core bursts over the country. The five come out of it as one, in one plane and turning
  together, with a flash and a ring of light through the space, and the camera is thrown back and up until the whole
  of Australia lies below, north up the frame, the system over its heart.
- **Separate destinations, one network** (22.95 to 27.7 s). Threads of cyan light fall in a fast cascade from the rings to
  forty places in every state and territory: the eight capitals, Sydney, Melbourne, Brisbane, Perth, Adelaide, Hobart,
  Darwin and Canberra, and regional cities from Cairns and Broome to Albany and Launceston. Each answers with a ring
  of light on the ground, and the lights about it turn cyan. As each pair of neighbouring places is reached, the link
  between them runs out across the country, fast: fifty-four links, the east coast's chain, the Hume, Bass Strait to
  Tasmania, the Nullarbor to Perth, the west coast to Darwin, the Stuart and the Barkly up the middle. Pulses race
  along them from one state or territory to another, Perth to Sydney, Darwin to Melbourne, Hobart to Cairns and more,
  at 4,200 km a second. On "destinations" everything flares; then the Earth comes up to New South Wales.
- **Intelligence, context** (27.7 to 31.8 s). A pulse leaves the rings and runs down a thread to Dubbo, the camera
  beside it, then 269 km along the ground over the Blue Mountains into Sydney, lighting its way. On "context",
  at Banksia Rise, the client's and the property's tags (the brand kit's demo record, Jordan Ellis and 14 Wattle
  Grove) come in beside it and ride with it back up to the system. The network's pulses run on below.
- **As one** (31.8 to 34.25 s). The system rises over the whole country again, and a wave of light crosses it, each
  town and link flaring as it is reached, the pulses racing the network; on "one", on the bar, everything lights at
  once and a ring runs out over the land.
- **The next tool** (34.25 to 36.7 s). Stillness: one pane before the core, the land low in the frame. On "is" it comes
  apart into light that drifts into the system.
- **The system** (36.7 to 40.25 s). The Earth turns east under the system, over inland Queensland. The threads are
  drawn up out of the country, and the rings stand to face us as the emblem's rings. On "becomes" three bars of light
  draw the emblem's triangle about the core, and on "the system" it locks with a pulse.
- **Aurixa Systems** (40.25 to 45.5 s). The emblem takes the system's place, the core its orb, and a pulse goes out
  from the orb as it lands. The triangle and the rings' fine lines dissipate, and the logo stays as it is. Its
  lettering rises letter by letter, AURIXA and then SYSTEMS on the bar. The light circles inside the A in three rings
  until the orb keeps it, as on _As One_'s end card. On "Systems" and on every bar to the end (40.86, 42.72 and
  44.58 s, the music's own hits) the logo beats: its light swells, its orb flares, a ring goes through the space with
  a fine echo behind it, and the beat runs out over the country below along the network, each town flaring as it
  passes. The land runs to the coast and the Tasman at the limb, where the dawn comes up, a thin gold rim behind the
  emblem.

The logo is the supplied art, placed and never redrawn, in its own gold and ice. The words are the brand's Playfair
Display, with the turn of each line in italic in the system's electric cyan, and the tiers' names and the tags are its
Inconsolata capitals, in the same cyan. No person appears.

**How it was made** (`scripts/aurixa-teaser/we-are-here/README.md`).

- **Nothing in it is generated.** The world is drawn in code (`space.py`), Australia from public map data
  (`earth.py`), and the emblem is the supplied art. So it needs no "Scenes created with AI" label, and carries none.
- **Australia is map data, drawn as a relief map lit from orbit.** Its shape is Mapzen's terrain tiles (0.3 km a cell
  over the chase's ranges, 0.6 km over Australia, 2.4 km over the region), drawn about five times taller than it
  stands at the chase's height and up to about eighty times from orbit; its light is worked out for every level of
  every grid: the key light on each slope, the shadows the ranges cast, the sky in the valleys. Its colours are NASA's
  Blue Marble carried into the palette, the green laid on the rugged ground close in so the colour follows the relief;
  the shelf seas are the bathymetry's. GLOBE's land mask draws the coast, and GeoNames' places every town's lights and
  the forty places. Each map is read at each pixel's own footprint, so the coast and the relief neither shimmer far
  off nor alias at the limb.
- **Light as a lens records it.** Every point and line is drawn in linear light and high range. The lens has a focus,
  so a near mote is a wide faint disc and a far one a fine point. The air dims what is far, and where the camera moves
  fast a frame is the average of up to eight moments of a half-frame shutter, the towns' lights at as many as their
  motion needs and the land at up to ten, so they streak and blur rather than strobe. The whole is bloomed, given a
  soft shoulder, a lens's slight colour fringe at the edges, a vignette and fine grain. The words are laid over the
  finished picture.
- **The panes** are _As One_'s, redrawn in navy glass and electric cyan, and they break into Voronoi shards that fly
  at the lens.
- **The colours.** The system's light is electric cyan (#0FF0FC) with paler cores that go to white where they are
  brightest, and it carries 1.6 times the light the gold did: a dim cyan line reads as teal where a dim gold one read
  as gold. The land, the sky, the core's ice and the logo keep their own colours.

## The sound

_As One_'s soundtrack, mixed again by Xeno Studio's own mixer, as the reels' soundtracks are
(`scripts/aurixa-teaser/we-are-here/soundtrack.ts`; its record is [`soundtrack.json`](./soundtrack.json)). The voice
and the music are _As One_'s: Gabby's single dry take of the 95 words, and _National Treasures_ from its first sample
at the reference's gains and fade. They are laid out as a studio edit's audio, the voice on the Editor's Voiceover
channel and the music on Music & FX, and the studio's own media worker code mixes them as a studio render does: it
listens to the voice for speech, dips the music under it, and brings the mix to the studio's loudness.

- **The music dips under the voice.** In _As One_'s mix the voice stood 5 dB over the music in the speech band through
  the intro and 6.1 dB through the groove, under the 8 dB the studio flags as hard to follow on a phone's speaker. Now
  it stands 12.5 dB over it through the intro and 12.7 dB through the groove, as the reels' approved mixes do (Reel
  3's sections stand 10 to 20 dB over theirs). The music plays at _As One_'s own level wherever the voice is silent,
  and dips 7.5 dB under it in the intro and 6.5 dB in the groove. The sentences come closer together than the
  studio's 1.2 seconds, so the music stays down under all of them rather than pumping between them.
- **The drop still lands.** Its first hit sounds before the voice comes back, undipped, about 2.3 dB over the line
  after it, as it stood in _As One_, and settles under the voice in the 0.15 s before the first word. After the last
  word the music comes back up for the last bar's hit as it fades.
- **Every word is where it was**, to the sample at the start of each of the eleven sentences, so every move, light
  and pulse stays on its words and bars (`sound-as-one/cues.json`): "Powerful on their own." and the rise in the
  silent bar, the drop at 22.25 s, "one" on the bar, and the logo's beats on the bars at the end.
- **Its loudness is the studio's own pass**: -14.0 LUFS integrated on FFmpeg's EBU R128 meter (the studio's report,
  on its loudness filter's own estimate, reads -14.2), true peak -1.5 dBTP. With the music dipped, the mix's peaks
  (the voice's) stand 14.6 dB over its loudness, more than one even gain can bring to -14 LUFS under that peak, so
  the pass holds those few peaks and rides the gain gently, as a studio render of this mix would: within about 0.9 dB
  through the film, the first three seconds about 1.2 dB lower.

## Before it runs publicly

- **The music's licence**, as for _As One_. _National Treasures_ is Drake's commercial recording. Before the teaser is
  posted, confirm that Aurixa holds the right to use it in a promotional video on each platform it goes to.
- **ElevenLabs' plan.** The voice is the client's ElevenLabs voice, so the account's plan must cover commercial use,
  including ads.
- **The map data's credit.** GeoNames' data (where the towns' lights and the forty places are) is licensed CC BY 4.0,
  and the terrain tiles' sources ask for credit in their own words (Geoscience Australia's model is CC BY 4.0, LINZ's
  CC BY 3.0 NZ, and the USGS and NOAA ask for their data to be named). Wherever the post's description or credits
  allow, add: "Map data: GeoNames (geonames.org, CC BY 4.0). Terrain: Mapzen Terrain Tiles (AWS Open Data); Australia
  terrain data © Commonwealth of Australia (Geoscience Australia) 2017; New Zealand terrain data Copyright 2011 Crown
  copyright (c) Land Information New Zealand and the New Zealand Government (All rights reserved); Global ETOPO1
  terrain data U.S. National Oceanic and Atmospheric Administration; GMTED2010 and SRTM terrain data courtesy of the
  U.S. Geological Survey. Imagery: NASA Blue Marble. Land mask: NOAA GLOBE." The Blue Marble and GLOBE are public
  domain and need no credit; naming them is a courtesy.

## Where things are

| What                    | Where                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| The final, cover and QC | The studio work _Aurixa Teaser_ (`9dd41db4-0e2f-4f25-8a6f-0f7eb0c6a6a5`), `files/delivery`                             |
| The versions before     | The same folder: `aurixa-teaser-we-are-here-1080x1920.mp4` (the city to the end), `aurixa-teaser-we-are-here-australia-1080x1920.mp4` (Australia at night from 21 s) and `aurixa-teaser-we-are-here-v3-1080x1920.mp4` (Australia throughout, the system in gold) |
| The film's runs         | `files/we-are-here/film-v4`: twelve runs of 91 frames (`film.sh`), so a later change draws only the runs it touches   |
| The soundtrack          | `files/sound-we-are-here/soundtrack.wav`, mixed by `soundtrack.ts` from _As One_'s stems (`files/sound-as-one`); its record, [`soundtrack.json`](./soundtrack.json) |
| The map data            | The work's cache, beside `files` (`scripts/aurixa-teaser/fetch.py` fills it, `terrain.py` lays its terrain on grids), outside what the studio keeps |
| The plan                | `docs/brands/aurixa-teaser/we-are-here/PLAN.md`                                                                        |
| The scripts             | `scripts/aurixa-teaser/we-are-here/`; its README says what each does and in what order, and draws every frame again |
