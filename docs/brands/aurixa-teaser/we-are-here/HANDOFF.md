# Aurixa Systems · Teaser · _We Are Here_ · handoff: the Australia version

Written on 27 October 2026 by the Claude Code session that was making it
(claude.ai/code/session_01FBVSiSH8istozkpbKdw5MY), at the moment it stopped, so that a session in a new account
picks it up exactly here. Read all of it before changing anything. Every path is from the repository's root.

---

## 0. Start here

### 0.1 What the new account needs (the person sets these up, in the new account)

1. **GitHub.** Connect GitHub at https://claude.ai/connect-github. The Claude GitHub App must be installed on
   `naidu-group-pty-ltd/canvas-xeno-studio`. Start the new session on that repository.
2. **The studio's token.** In the new cloud environment's settings (the environment menu in the session's title
   bar, then Edit), add `XENO_STUDIO_TOKEN`: a personal token from the studio (canvas-xeno-studio.lovable.app,
   Settings, API access, with the read and edit scopes). Add it under Network secrets where that section is
   offered, otherwise as an environment variable. Never paste a token into the chat. `scripts/studio-work/work.py`
   reads it. In the old environment the network added it.
3. **Network access.** The package registries must be allowed: `pypi.org`, `files.pythonhosted.org` and
   `registry.npmjs.org` (the default "package managers" list). The map data comes only from them (section 5).
   These hosts were denied in the old environment and must not be retried: `gibs.earthdata.nasa.gov`, `unpkg.com`,
   `ows.dea.ga.gov.au`, `tiles.maps.eox.at`, `eoimages.gsfc.nasa.gov`, `naciscdn.org`, `huggingface.co`,
   `xeno-media-worker.fly.dev`.

### 0.2 The new session's first commands

```sh
git fetch origin claude/eager-bell-1y7y1m && git checkout claude/eager-bell-1y7y1m && git pull origin claude/eager-bell-1y7y1m
python3 scripts/studio-work/work.py resume 9dd41db4-0e2f-4f25-8a6f-0f7eb0c6a6a5      # the work's files, back here
python3 -I scripts/aurixa-teaser/fetch.py .xeno-work/9dd41db4-0e2f-4f25-8a6f-0f7eb0c6a6a5/cache   # the map data
python3 -m venv /tmp/wah && /tmp/wah/bin/pip install -q numpy opencv-python-headless              # the render Python
```

Then check that these exist under `.xeno-work/9dd41db4-0e2f-4f25-8a6f-0f7eb0c6a6a5/files` (call it `<work>`):
`sound-as-one/master.wav`, `sound-as-one/cues.json`, `film-as-one/{data.json,emblem.png,letters-key.png}`,
`fonts/*.ttf`, `we-are-here/textures/*.png`, `we-are-here/type/frames/00000.png` to `01091.png`,
`we-are-here/type/labels.json`, `we-are-here/film/part-00000.mkv`, `part-00290.mkv`, `part-00490.mkv`,
`we-are-here/australia/*` (this session's test frames) and `delivery/aurixa-teaser-we-are-here-1080x1920.mp4`.
Section 4.4 says what to do for any that is missing.

### 0.3 A message for the person to give the new session

> Read `docs/brands/aurixa-teaser/we-are-here/HANDOFF.md` in full, set up as its section 0 says, then carry on
> the Australia version of We Are Here from its section 9, step by step. Keep every rule in its section 3. Show me
> test frames before the full render, and only images in the brand's navy, gold and ice.

---

## 1. The job, in one paragraph

_We Are Here_ is Aurixa Systems' teaser: 45.5 s, 1080 x 1920, 24 fps, 1,092 frames, drawn entirely in code. It
was delivered on 27 October 2026 (section 4.2). The client then asked for one last change, and a second note:
**from 21 s to the end, replace the city's "checkered" background with an immersive, realistic 3D satellite view
of Australia**, with the threads still reaching from the orb to real places across Australia and a journey across
the country, **without changing anything about the orb, the five tiers, the threads, the words or the structure**;
and **at the very end the system's triangle must dissipate so the logo stays as it is**. The triangle is done
(section 6.3). The Earth renderer exists as a working prototype (section 6.1). What is left is to put the Earth
into the world from 21 s, tune it on test frames, draw frames 504 to 1,091 again, measure, document and deliver
(section 9).

---

## 2. The client's notes, verbatim, in order

The earliest notes (the connected platform, and realism) are recorded in
`docs/brands/aurixa-teaser/we-are-here/PLAN.md`, "The brief, as it settled". These are the client's own words since:

1. > okay i do also like the how you are using the architecture but with this next version ensure that you are
   > also focusing on the system and how it is connected , there needs to be a blend of 50 %/50% with the system
   > showcasing how it is being connected behind closed doors which opens the doors to new heights for businesses,
   > think outside the box show variation to different levels in the industry and finding the right balance You
   > need to be strategic and powerful with this message as this is the first opening out to the general market
   > nationally having an internation reach which is short coming - SO be intuitive and bridge the gap and think
   > outside the box to make a one of a kind Introduction to Aurixa Systems Teaser Trailer - Proceed with 1000%
   > maximum effort
2. > try to addres the property industry with visualisation but bring the attention back to the technology Systems
   > and how we are here to change the proerty environment and space - a little food for thought for you
3. > Also, where it indicates research, clients, reports, finance, communication, show how every single aspect is
   > interlinked with a Orixa systems, all working together simultaneously, not splitting it up into separate
   > frames and stages, but one cinematic view of the entire research, clients, reports, finance, and
   > communication factors all working together for us outcome.
4. (After an off-palette diagnostic image was shown: a rainbow depth map. Never show such an image again.)
   > I'm not happy with the images that you're generating. I don't know what this rainbow color is. Stick to the
   > current color scheme and palette itself. And let's go ahead and remove the building structures because you are
   > going on a tangent. And now think of everything that has been discussed and converted into one continuous
   > cinematic approach with the Aurixa Systems logo branding as a pulse at the end, coupled with the five tiers as
   > previously mentioned, such as the research, clients, reports, finance, and communication all together as one.
   > So come up with a solution and working together collaboratively for the ultimate solution for businesses.
   > Please note, we are at Arixa Systems, are a software as a service, so it needs to be tech space orientated with
   > minimalistic amount of buildings and structure incorporated. Now think outside the box, make this the final
   > prompt that I'm going to inject and finalize it to complete this 100% maximum effort.
5. > how is it tracking (twice; the final was then delivered)
6. **The current request:**
   > Thank you for providing this. We would like to make one final adjustment before completing the final version
   > of the teaser. From the 21-second mark onwards, please replace the existing checkered background with an
   > immersive, realistic 3D satellite view of Australia, creating a dynamic visual journey across the country.
   > Please retain all existing content and functionality within the central orb, including communications,
   > research, clients, and all interconnected elements, exactly as they are. The focus of this adjustment is solely
   > on enhancing the background environment, ensuring that the connecting lines continue to extend dynamically from
   > the orb to various geographical locations across Australia. The visualisation should convey a seamless sense of
   > motion, connectivity, and progression across the Australian landscape, bringing the entire journey to life
   > through realistic satellite imagery, depth, and fluid movement. The objective is to elevate the overall
   > cinematic impact without altering the existing content, messaging, or structure of the teaser.
7. **The second note, during it:**
   > I've also just realized right at the end of the video, once the Orixa logo has populated, the triangle remains.
   > At the end of the video, that triangle needs to dissipate and be removed, and the Orixa logo to remain as is.
8. Then: "complete a handoff file for me to bring this over to a new account … ensure it is picked up exactly from
   where it is left off to continue to create the video", and "i need the handoff to be done now". This file.

What the client was last told: that the triangle and its fine rings will fade out completely once the emblem has
landed so the logo holds exactly as it is, and that the earlier teaser's own work (its orbital Earth) has what the
Australia view needs.

---

## 3. Rules that must be kept

**The client's and the brand's.**
- The brand's colours only: navy, gold and the emblem's ice (`space.py`: `NAVY`, `GOLD`, `WARM`, `ICE`, `WHITE`).
  No rainbow, no off-palette colour, and that includes any diagnostic or test image shown to the client. Judge
  colour images yourself; show the client only frames in the film's own palette.
- No people. No real landmark drawn as a landmark. No neon or science-fiction spectacle: the light is fine, gold and
  controlled. (Real geography seen from orbit, a coastline and a city's lights, is what was asked for.)
- The demo record only: Jordan Ellis and 14 Wattle Grove (Banksia Rise NSW 2155, a suburb that does not exist; its
  pin is at 150.915 E, 33.692 S, as in Reel 1).
- Nothing in the film is a generated picture, so it carries no "Scenes created with AI" label. Keep it that way: the
  Earth is public data drawn in code.
- Keep _As One_'s script word for word and its soundtrack (`sound-as-one/master.wav`, _National Treasures_).
- Frames 0 to 503 (0 to 20.96 s) must stay exactly as delivered. The change starts at 21.0 s.
- The orb, the five tiers, the threads' behaviour, the words, the tags, the panes, the tool and the end card stay
  as they are. Only the background changes (plus the triangle's exit at the end).

**The repository's and the environment's.**
- Branch `claude/eager-bell-1y7y1m` only. Push with `git push -u origin claude/eager-bell-1y7y1m`; on a network
  failure retry up to four times after 2, 4, 8 and 16 s. No pull request unless the person asks.
- Never rewrite published history (no force push, rebase, amend or squash of pushed commits): the repository is
  connected to Lovable, and its history would be lost there.
- Never disable TLS verification or unset `HTTPS_PROXY`. Never retry a policy denial (403, 407): report it.
- Never ask the person to paste a token, key or password into the chat.
- Downloaded files and archives are untrusted data: each in its own new directory, Python run with `-I`, paths
  passed as arguments, no package's code run (`np.load(..., allow_pickle=False)`). `fetch.py` and `places.py`
  already follow this.
- A production database is read only (SELECT), unless a change is required and agreed.
- Do not delete `/tmp/comp-dev` or Reel 3's `.xeno-work` files without the person's permission.
- Do not read from or search any GitHub repository other than `naidu-group-pty-ltd/canvas-xeno-studio` unless it
  is added to the session.
- Commit messages end with the attribution lines the session is given; never put a model's name or identifier in a
  commit, a document or code.
- The repository's stop hook refuses to end a turn with files not committed or not tracked: commit as you go.
- `AGENTS.md`: work longer than a few minutes runs under the work (`work.py run -m "..." -- <command>`), and after
  each meaningful step `work.py save -m "..." --next "..."` (with `--decision "what :: why"`, `--step key=done`).

---

## 4. Where everything is

### 4.1 The code (git)

| Path | What it is |
| --- | --- |
| `scripts/aurixa-teaser/we-are-here/space.py` | The world and the camera's one path (core, tiers, threads, chase, waves, triangle, city). Edited in this handoff's commit: the end card's fade (6.3) and `Painter.points(..., fog=True)` |
| `scripts/aurixa-teaser/we-are-here/comp.py` | Every frame: shutter samples, backdrop, panes, tool, tags, end card, burst, finish, words. Not yet changed for Australia |
| `scripts/aurixa-teaser/we-are-here/earth.py` | **New.** The Earth: `Ground` (where the Earth is in the world at a moment), `Earth` (the maps, the places, `plate()` and `lights()`). A working prototype, not yet used by `comp.py` |
| `scripts/aurixa-teaser/we-are-here/earth_look.py` | **New.** Draws the Earth through the film's camera at given moments and states (section 8) |
| `scripts/aurixa-teaser/we-are-here/film.sh` | The whole film: four runs at once (`BOUNDS=(0 290 545 810 1092)`), joined, encoded on `master.wav`, measured |
| `scripts/aurixa-teaser/we-are-here/{textures.cjs,type.py,type.js,type.cjs}` | The panes' and tags' textures, and the words. Unchanged; their output is in the work (4.3) |
| `scripts/aurixa-teaser/{fetch.py,places.py}` | The map data into the cache. **Changed:** `places.py --region` and `fetch.py` now also write `data/region-places.json` (every GeoNames place from 100 E to 180 E and 0 to 50 S, with its country: 5,620 places) |
| `scripts/aurixa-teaser/{orbit.py,orbitcam.py,gshhs.py,citydata.py,city.py}` | The first teaser's orbital Earth and Sydney renderers. `earth.py` follows `orbit.py`; `gshhs.py` reads GSHHG's full-resolution shorelines (for a crisper coast, 9.4) |
| `scripts/aurixa-teaser/{encode.sh,qc.py}` | The delivery encode (x264 CRF 14, BT.709, faststart) and the measures |
| `docs/brands/aurixa-teaser/we-are-here/{PLAN.md,DELIVERY.md}` | The plan and the delivery note of the version delivered. Both need the Australia version written in (9.10) |
| `scripts/aurixa-teaser/we-are-here/README.md` | The scripts and their order. Needs `earth.py`, `earth_look.py` and the cache step added (9.10) |

Commits on the branch, newest first: `5fd9027` (this handoff, `earth.py`, the end card's fix); `3927209` (delivered: the final measured and its
delivery note); `f28cc65` (the review's fixes to the final); `4b951c7` (the final, one continuous move);
`4ff2c35` (the connected platform with its digital twin; the photographic versions' scripts are in its tree).

### 4.2 The version delivered (the one being changed)

`<work>/delivery/aurixa-teaser-we-are-here-1080x1920.mp4`: 72,379,327 bytes, SHA-256
`87988689f28cb3b62db1c155fa617027708daac2f1295f14d2cd778df4c8ae60`; cover `cover-we-are-here-44.5s.jpg`; measures
`qc-we-are-here.json`. Encoder SSIM 0.992 (lowest 0.989 at 27.5 s); master against the reference 0.978 (format's
ceiling 0.989), PSNR 43.2 dB; -14.0 LUFS, LRA 3.7, TP -2.3; sound in sync to the sample at 0.56, 22.25, 33.45 and
40.25 s. `we-are-here/australia/delivered-19.5-45s.png` is a sheet of its frames from 19.5 to 45 s.

### 4.3 The studio work

_Aurixa Teaser_, id `9dd41db4-0e2f-4f25-8a6f-0f7eb0c6a6a5` (project `5aab251e-737e-4142-8a89-d33578437ff8`) at
https://canvas-xeno-studio.lovable.app. Its roots: `records` = `docs/brands/aurixa-teaser`, `work` =
`.xeno-work/9dd41db4-0e2f-4f25-8a6f-0f7eb0c6a6a5/files` (outside git). What the Australia version uses from it:

| In `<work>` | What it is |
| --- | --- |
| `sound-as-one/master.wav`, `cues.json` | The soundtrack, and where every word and bar falls |
| `film-as-one/data.json`, `emblem.png`, `letters-key.png` | The end card's supplied art and its placement |
| `fonts/` | Playfair Display and Inconsolata (the words and the textures) |
| `we-are-here/textures/` | The panes, the tab strip, the tags (from `textures.cjs`) |
| `we-are-here/type/frames/00000.png` … `01091.png`, `type/labels.json` | The words, one transparent frame each (from `type.py` and `type.cjs`); unchanged by Australia |
| `we-are-here/film/part-00000.mkv` (frames 0–289), `part-00290.mkv` (290–489), `part-00490.mkv` (490–689) | The delivered film's runs (x264 CRF 4, 4:4:4). SHA-256 `f5c6264b…aa0a6f`, `aa41d2eb…2279`, `4845e012…054c`. The first two are the opening that stays; `part-00490`'s first 14 frames (490–503) too |
| `we-are-here/australia/` | This session's test frames (section 8), the end card before and after (6.3), the delivered sheet, and `rerender-v1.sh` (the script that redrew 290 to the end for the delivered version) |
| `delivery/` | Every teaser delivered |

Until this handoff the work kept no words, textures or film runs (its `.xenoignore` listed them, as they are drawn
again from code). This handoff changed `<work>/.xenoignore` so the studio keeps the words, the textures and runs
`part-00000`, `part-00290` and `part-00490`, and they are all kept now (section 10).

### 4.4 If something is missing after `resume`

- **The map data** (`<work>/../cache`): run `fetch.py` (0.2). It fetches global-land-mask 1.0.0, basemap-data 2.0.0
  and basemap-data-hires 2.0.0 from PyPI and all-the-cities 3.1.0 from npm, and writes `data/au-places.json` and
  `data/region-places.json`. About 130 MB.
- **The words** (`we-are-here/type/`): `$PY -I scripts/aurixa-teaser/we-are-here/comp.py <work> --labels`, then
  `python3 -I scripts/aurixa-teaser/we-are-here/type.py <work>` and `node scripts/aurixa-teaser/we-are-here/type.cjs <work>`
  (Node with Playwright's Chromium; in a Claude Code cloud container it is already installed: never run
  `playwright install`).
- **The textures**: `node scripts/aurixa-teaser/we-are-here/textures.cjs <work>`.
- **The opening's runs**: draw them again with `comp.py <work> 0:290` and `comp.py <work> 290:504` (section 7.3). The
  code before 21 s is unchanged, so they come out the same, to within a different OpenCV build's rounding.

---

## 5. The film as it is made now

```
node scripts/aurixa-teaser/we-are-here/textures.cjs <work>          # textures/*.png
$PY -I scripts/aurixa-teaser/we-are-here/comp.py <work> --labels    # type/labels.json
python3 -I scripts/aurixa-teaser/we-are-here/type.py <work>         # type/type.html
node scripts/aurixa-teaser/we-are-here/type.cjs <work>              # type/frames/<n>.png
scripts/aurixa-teaser/we-are-here/film.sh <work> $PY                # every frame, the master, its measures
$PY -I scripts/aurixa-teaser/we-are-here/comp.py <work> --frames 600,700 --out /tmp/look   # single frames as PNG
```

`$PY` is a Python with numpy and OpenCV. The delivered film was drawn with numpy 2.5.4 and OpenCV 5.0.0, FFmpeg
6.1.1, Node 22. The machine had 4 cores and 15 GB; frames take about 3 to 8 s each one to a core, so the whole film
took 37 minutes on four runs at once, and 290 to the end 25 minutes. Disk was the tightest resource (2.4 GB free):
each run is 65 to 90 MB, the joined `picture.mkv` 376 MB.

How a frame is made (`comp.Film.picture`): the world (`space.World.draw`) is drawn through 1 to 4 moments of a
half-frame shutter (`Film.samples`, by how fast the camera moves) into a `comp.Light` (points and lines of light,
gathered by width and spread by Gaussians); `space.backdrop(pose, glow, dawn)` is the navy sky and the dark ground
under it; the panes, the tool, the tags and the end card are laid on; the drop's burst; `Film.finish` (bloom, soft
shoulder, vignette, colour fringe, sRGB, grain); then `Film.words` lays the type frame over it.

The voice's times (s), from `cues.json`: Research 15.84, clients 16.72, reports 17.84, finance 18.80,
communication 19.76; Powerful 20.72, own 21.84; **the drop 22.2549** (bars every 1.86056 s from it; `bars[22]` =
40.8605, `bars[23]` = 42.7211); More 22.95, stop 24.23, separate 25.27, destinations 25.80; When 27.69,
intelligence 27.85, move 28.81, context 29.85, follow 30.81, business 32.01, one 33.45; So 34.25, tool 35.69,
is 35.93; Ask 36.73, becomes 38.57, system 39.21; Aurixa 40.25, Systems 40.81; coming 43.53. Length 45.5.

What the picture does from 21 s (PLAN.md has it all): the silent bar draws the five rings into the core; the drop
bursts and the five come out as one; threads leave for thirty places one after another (from 23.10 to 25.05, each
landing 0.85 s after it leaves) and flare on "destinations";
the chase (a pulse down thread 0, along the ground, up thread 1 with the two tags, in to the core: 27.85 to 31.91,
legs at 28.86, 29.80, 30.96); on "one" everything lights, a gold wave having crossed the ground from 31.81; the
tool (34.25 to 36.7); the rings stand up and the system draws the emblem's triangle (38.52 to 39.26); the emblem
and its lettering (40.25 on); the orb's pulses on the bars.

The camera from 21 s (`space.World._camera`, the core at the origin, y up): `orbit(62, 21, 14)` at 21.02;
`orbit(70, 14, 9.5)` at the drop; `orbit(76, 14, 19)` at drop + 0.45; (-3.5, 7, 21) looking at (0, -3, -3) at
drop + 1.15; (-7, 9, 24) at "stop"; (-12, 16, 30) looking at (0, -13, -18) at "destinations"; eight keys beside
the chased pulse (9 to its side, 5.5 up, 5 back, never under ground + 7); (-3, 8, 20) at "business"; (-9, 15, 33)
looking at (0, -14, -26) at "one"; (-3, 4, 24) at "so" + 0.3; (0, 1.6, 19) at "is"; (0, 1.4, 19.5) at "ask" + 0.2;
(0, 0, 27.5) with F 1663 and the axis at y 710.5 at "system", to (0, 0, 26.6) at 45.5. After the drop the camera
mostly looks along -z.

---

## 6. Where the Australia version stands, exactly

### 6.1 Done: `earth.py` (prototype, working)

- `Ground(lat, lon, bearing, km)`: the Earth's place in the world at one moment. Its surface lies `ORB = 30` units
  under the core (the city's ground), its centre straight below; `km` is kilometres a unit (the system's height is
  30 x km); `bearing` is the compass bearing the world's -z faces at the point under the core; world +x faces
  bearing + 90, +y is up. `world(g, lift)`, `to_geo(P)`, `direction(g)`, `hidden(P, cam)` (the Earth hides a point
  when its sight line meets the ground first; written to stay exact when R is huge), `height(cam)` (km).
- `Earth(cache)`: the GLOBE 30-arc-second land mask, the Blue Marble's brightness and Natural Earth's shaded relief,
  all cut to 100 E to 180 E, 0 to 50 S (Australia and New Zealand), each as mip levels (`Mips`) read at each
  pixel's own footprint, so the coast neither shimmers far off nor aliases at the limb. A slow swell texture for the
  sea. The places of `region-places.json` as spreads of lights in km (a great city's own entry, over 500,000 people,
  is taken as 220,000: its suburbs carry the rest), only on land: 117,563 lights.
- `Earth.plate(pose, ground, look, W, H)`: the sky and the ground as one linear-light picture. A ray to every pixel;
  the sky graded on each ray's angle above the limb, so the city's flat horizon (km tiny) and the orbit's curved
  limb are one sky and the old `space.backdrop` is matched when `detail` is 0; the airglow's line 92 km over the
  limb and the limb's thin bright edge (above 100 km of height); the land in moonlight (its brightness and relief, in
  ice over navy); the sea darker, with the moon's sheen broken by the swell; the air lifting along the limb; the
  dawn (a glow toward the sun under the limb, its first rim, and the first light on the ground); the limb's edge
  smooth across a pixel. `look` = `detail`, `moon`, `sun` (world directions), `dawn`, `haze`, and the colours.
- `Earth.lights(painter, ground, k, gold, cols, t)`: the towns' lights as points of the space (so they keep the lens
  and the shutter), those over the horizon left out, those near the limb dimmed by the air, each turned gold by its
  share of `gold`. It needs `Painter.points(..., fog=False)`, added to `space.py`.
- `place(name, country)`, and the helpers `geo`, `toward(lat, lon, bearing, km)`, `course(lat1, lon1, lat2, lon2)`.

### 6.2 Done: the data

`data/region-places.json` in the cache, written by `places.py --region` (and by `fetch.py` from now on). The old
environment's cache had everything else already.

### 6.3 Done and checked: the end card's triangle (the client's second note)

`space.py`: the system's triangle (`World._triangle`) now fades from full to nothing between "Aurixa" + 0.05 and
+ 0.9 s (40.30 to 41.15 s), where before it stayed at 15%; and the tiers' fine rings (`end` in `World._tiers`) fade
to nothing between + 0.15 and + 1.1 s, where before they stayed at 25%. The emblem is fully in by 40.8 s, so the
logo takes their place and then holds as it is. Frames 984 (41.0 s) and 1,056 (44.0 s) were drawn with it and set
beside the delivered ones (`we-are-here/australia/endcard-before-after.png`): the triangle's line along the logo's
edges and the rings' arcs are gone; the logo, its lettering, the light in the A, the orb's pulses and the words
are unchanged. It changes nothing before 40.3 s.

### 6.4 Not started

Everything in section 9: `space.py` and `comp.py` do not use `earth.py` yet. The film as it stands still draws the
city to the end (with the end-card fix).

---

## 7. The design, as decided, and why

### 7.1 What "realistic satellite view" means here: Australia at night, from orbit

- The film is navy, gold and ice; the client told us to keep exactly that palette. Daylight imagery of Australia is
  ochre, red and green. **Night from orbit** is real satellite imagery (as NASA's Black Marble and the space
  station's photographs are) and is already in the palette: the land in moonlight in ice-blue over navy, its relief
  and salt lakes showing; the sea darker with the moon's sheen; every town's lights in warm gold; the air's thin
  blue line on the limb. The first teaser (_Three Questions_) used the same look, from `orbit.py`, and the client
  accepted it.
- The imagery is about 3.7 km a cell (relief) and 7.4 km (Blue Marble), so it holds up from a few hundred km up and
  higher. The coast is sharp to 0.93 km (GLOBE), and the lights are points. Lower down the land must go dark (it
  does at night): `plate()` already fades the relief where a cell covers more than about 5 to 14 pixels.
- The dawn comes at the end: "A new operating standard is coming." The sun's glow and first rim on the limb ahead,
  behind the emblem, as the film's end already "warmed toward dawn".

### 7.2 The geometry

- The core stays at the origin and the ground 30 units under it, as the city's was, so the camera's whole path, the
  rings, the threads' shape and the labels stay as they are. The Earth moves instead: four keyed values through time
  (a `space.Track` of (lat, lon, bearing, log km)), in `space.World`.
- **The rise (21.0 to 22.25 s), the transition.** At 21.0 s the Earth is at the city's own scale (km about 0.03:
  the city's streets are about 100 m apart, 3 units). Through the silent bar km grows smoothly (exponentially, slow
  then fast) to about 20 at the drop: the system rises from the street into orbit, the city shrinking into a point
  of the Earth's lights while the Earth comes up round it. The city is drawn scaled by 0.03 / km about the point
  under the core (x and z, and its towers' heights), fading out as km passes about 0.3 to 1.5; the Earth's lights
  fade in from km 0.3 to 1; its land, coast and sea (`detail`) from km 2 to 6. Because the sky is graded on the
  angle above the limb, the horizon drops from eye level to the limb as it rises, with no seam. The drop's burst
  lands on its end.
- **The journey.** The camera looks along -z for most of what follows, and the Earth is turned so that -z faces
  NNE up the east coast: the coast with its lit cities (Wollongong, Sydney, Newcastle, up to the Gold Coast and
  Brisbane on the horizon), the inland on the left, the Tasman on the right with the moon's sheen. The point under
  the core travels NNE from Canberra, so the land flows toward the camera: progression across the country.
- **The proposed keys** (to be tuned on test frames; hold the point and bearing still through the chase):

  | t (s) | Moment | Point under the core | Bearing of -z | km a unit |
  | --- | --- | --- | --- | --- |
  | 21.00 | the rise begins | Canberra, 35.28 S 149.13 E | 29 | 0.03 |
  | 22.25 | the drop: in orbit | 35.0 S 149.2 E | 29 | 20 |
  | 25.80 | "destinations" | 33.9 S 149.6 E | 29 | 20 |
  | 27.85 | the chase begins, descending | 31.63 S 150.24 E | 29.2 | 14 |
  | 28.90 to 29.80 | the run along the ground | 31.63 S 150.24 E | 29.2 | 8 |
  | 31.00 | rising with the tags | 31.5 S 150.4 E | 32 | 14 |
  | 33.45 | "one" | 31.3 S 150.6 E | 40 | 22 |
  | 36.70 | turning toward the dawn | 31.2 S 150.8 E | 70 | 20 |
  | 39.20 to 45.50 | the end, looking east over the Tasman | 31.0 S 150.9 E | 95 | 20 |

- **The chase.** The pulse runs down a thread to **Bathurst** (33.42 S 149.58 E), along the ground east over the
  Blue Mountains into Sydney's lights to **Banksia Rise** (the demo property's pin, 33.692 S 150.915 E) where the
  two tags come in on "context", and up a thread from there with them. Worked out so the camera's choreography
  holds: in the delivered film the chase's two places sit at world (5.7, -30, 25.4) and (21.2, -30, 21.2) (26 and
  30 units from the point under the core, at 1.35 and 0.78 rad from +x toward +z), 16.06 units apart. Bathurst to
  Banksia Rise is 128 km on a bearing of about 104 degrees, so km = 128 / 16.06 = 8, and the bearing of -z is
  104 - 90 + 15.2 = 29.2 degrees; the point under the core is then 26.03 x 8 = 208 km from Bathurst on a bearing of
  16.6 degrees: 31.63 S 150.24 E. (`earth.course` and `earth.toward` do this arithmetic.) Open question: at km 8
  the camera, at ground + 7, is only about 56 km up; if the land looks soft there, raise the chase's floor and
  offsets for the Earth (for example 12 to the side, 9 up, ground + 11), or take Orange (km about 10.6) or Dubbo
  (km about 16.5) as the first place instead.
- **The threads' thirty places** (real, across the country, all inside the horizon from about 600 km over the
  south-east): Bathurst and Banksia Rise (the chase's, threads 0 and 1, tiers 4 and 1 as now), Sydney, Melbourne,
  Brisbane, Adelaide, Hobart, Canberra, Newcastle, Wollongong, Gold Coast, Geelong, Ballarat, Bendigo, Albury,
  Wagga Wagga, Orange, Dubbo, Tamworth, Port Macquarie, Coffs Harbour, Toowoomba, Launceston, Mildura, Broken Hill,
  Mount Gambier, Rockhampton, Townsville, Alice Springs, Cairns (check each is inside the horizon at its moment;
  Perth and Darwin are not, from the south-east). They fall in a sweep round the system as now (ordered by their
  angle about the core at 22.95 s), from "More" + 0.15 to "destinations" - 0.75.
- **The end.** The bearing turns from about 40 at "one" to 95 by "the system" (66 degrees over about 6 s, while
  the Earth fills only the bottom of the frame), so the end looks east over the coast's lights and the Tasman toward
  the sunrise. The sun sits just under the limb, straight ahead behind the emblem (its glow along the limb, a thin
  gold rim), rising a little to the end. Seen from about 600 km, the limb ahead is about 2,700 km away, so New
  Zealand's lights may show on it: that is why the data include New Zealand and the neighbours.
- **The lights and the gold.** The towns' lights warm to gold around each place a thread reaches (as the city's
  streets did: from the place outward, about 100 km a second), and the gold wave before "one" crosses the whole
  continent from the point under the core (0 to about 3,000 km between "business" - 0.2 and "one"), then on "one"
  everything flashes and a ring runs out over the Earth's surface.

### 7.3 What stays exactly as delivered

Frames 0 to 503. Run `part-00000` (0 to 289) and `part-00290` (290 to 489) are kept as they are; frames 490 to 503
are drawn again (they must come out the same: the Earth starts at 21.0 s, frame 504) or cut from `part-00490`.

---

## 8. What the first test frames showed

`we-are-here/australia/test2-sheet.png` (and `a23.png`, `b258.png`, `c3345.png`, `d43.png`): the plate and the
lights alone (no orb or threads), through the film's own camera at 23.0, 25.8, 33.45 and 43.0 s, with the point
under the core at (35.0 S, 149.0 E), (34.4 S, 149.3 E), (31.8 S, 150.3 E), (31.0 S, 150.6 E), bearings 29, 29,
40 and 95, km 20, 20, 22, 20, the last with the dawn. Drawn with:

```sh
$PY -I scripts/aurixa-teaser/we-are-here/earth_look.py <work> /tmp/look '[{"t":23.0,"lat":-35.0,"lon":149.0,"bearing":29,"km":20,"name":"a23"},{"t":25.8,"lat":-34.4,"lon":149.3,"bearing":29,"km":20,"name":"b258"},{"t":33.45,"lat":-31.8,"lon":150.3,"bearing":40,"km":22,"name":"c3345"},{"t":43.0,"lat":-31.0,"lon":150.6,"bearing":95,"km":20,"dawn":1.0,"name":"d43"}]'
```

- **It reads as Australia's east coast from orbit at night**: the coast sharp, Sydney, Newcastle and the coast's
  towns as clusters of light, the Gold Coast and Brisbane toward the horizon, the inland with its relief in moonlit
  slate blue, the sea dark, the limb's haze and the airglow's line above it. The Earth fills the frame's lower half
  to two thirds while the camera looks down, and the bottom third at the end. This is the look to keep.
- **To fix:**
  1. The moon's sheen on the sea does not show. At 25.8 s the glint's centre falls at pixel (504, 1292) of the frame
     (computed: the moon at bearing 40 and 35 degrees up), so the sheen is too faint or too tight there: widen it
     (lower exponents) and raise it, and make sure that point is sea.
  2. The dawn lays a brownish veil over the whole sky above the limb at 43 s. Keep the glow close to the limb and
     toward the sun, more gold than grey (the old film's veil came from wide gold glows too); keep the thin rim.
  3. The lights read white. Pull them toward the brand's gold (more `GOLD`, less `WARM`), and let only the great
     cities' hearts bloom.
  4. The land is slightly grey; a touch more navy, and perhaps a little more of its relief.
  5. Speed: `plate()` takes 1.7 to 3.1 s a frame (the first version took 4 to 5). Plan: draw everything but the coast
     at half size (540 x 960) and bring it up; at full size, only each pixel's latitude and longitude brought up
     from the half-size ones (longitude counted 0 to 360 so it never wraps in view), the land mask read from them,
     the limb's cover and the dawn's rim. Expect about 0.4 s. Draw the plate once a frame (not per shutter moment)
     unless the camera or the Earth moves fast (the rise, the chase); add the Earth's own motion to `Film.samples`.
- `test1-sheet.png` was the first try (inland NSW looking north-west from 34 S 146 E): dark and featureless. It is why
  the view turned to the coast and the land's moonlight was raised.

---

## 9. What is left, step by step

1. **Set up** (section 0), resume the work, fetch the cache, make the venv. Mark task "Australia" in the work:
   `work.py save -m "Taken up from the handoff" --step au-earth=doing` (add the steps below with `--step` keys).
2. **Finish `earth.py`'s look** with `earth_look.py` on the views of section 8: the five fixes there. Keep every test
   image in the palette. Commit.
3. **The Earth in the world (`space.py`).**
   - In `World.__init__`, take an `Earth` (or `None`: the film without the cache stays drawable) and build the
     journey `Track` of section 7.2. `World.ground(t)` returns the `earth.Ground` at t (None before 21.0 s).
     `World.look(t)` returns the plate's `look`: `detail` (0 until km 2, 1 by km 6), `haze` (as `sky()`: 1 + 0.6 on
     "one"), `dawn` (0 until "Aurixa" - 0.6, then up to 1 by 45.5), `moon` (fixed to the Earth, NNE and about 35
     degrees up), `sun` (fixed to the Earth, just under the eastern limb at the end).
   - **The occluder.** Give `Painter` an optional `ground` and hide what the Earth hides: in `points()` with
     `ground.hidden(P, cam)`; in `segments()` rebuild each drawn point's world position from its camera position
     (x = (X - cx) z / F, y = -(Y - cy) z / F, then `pos + c @ R`) and hide those. Leave the core, the rings and the
     glows alone (always above the ground).
   - **The stars below the horizontal.** The Earth's limb lies 25 to 35 degrees under the horizontal, and `Stars`
     has none there. Add a second set over the whole sphere, faded in with the rise, hidden by the Earth.
   - **The rise.** In `_city`, scale everything by 0.03 / km about the point under the core, fade it out as km passes
     0.3 to 1.5, and stop drawing it after 22.3 s. Draw `Earth.lights` from 21.0 s, faded in as km passes 0.3 to 1.
   - **The threads.** Replace `_destinations` with the thirty real places (section 7.2), held as the Earth's unit
     vectors (`dest_g`), their world points taken from `World.ground(t)` at every use. `thread()` and `dest_th` then
     move with the Earth. The landing rings: lay them on the Earth's surface (a small circle round the place).
   - **The chase.** `pulse_at(t)` builds its four legs at t from the moving Earth (thread 0 down; the ground leg as a
     great circle from Bathurst to Banksia Rise, lifted 0.15 units; thread 1 up; the spoke), so the camera's chase
     keys, the tail and the tags follow. The wake (the line lit gold behind it) is kept in the Earth's own axes.
     Keep the leg times as they are.
   - **The gold.** For each of the Earth's lights, its nearest reached place and when the gold reaches it (within
     about 80 km of a place); the wave before "one" by the great-circle distance from the point under the core; on
     "one" the flash, and the ground's ring as a small circle on the sphere about the point under the core. Feed this
     to `Earth.lights(..., gold=...)`.
   - Check the camera's keys still hold everything in frame; where the chase is too close to the ground for the
     imagery, change only the chase's offsets for the Earth (section 7.2).
4. **The compositor (`comp.py`).** `Film` loads `Earth(work.parent / "cache")` (or a `--cache` path); from frame 504
   `picture()` draws `earth.plate(pose, world.ground(t), world.look(t), W, H)` in place of `space.backdrop`. Keep the
   burst, the panes, the tool, the tags, the card and the words as they are. `samples()` counts the Earth's own
   motion as well as the camera's.
5. **The continuity check.** Frames 490 to 503 drawn with the new code must equal the delivered ones (decode
   `part-00490.mkv`'s first 14 frames and compare; any difference is a bug before 21 s). Frame 504 must look like
   503 (the rise has just begun).
6. **Test frames** at 21.0, 21.5, 22.0, 22.25, 22.6, 23.0, 24.5, 25.8, 27.0, 28.5, 29.3, 30.0, 30.8, 31.8, 33.45,
   35.0, 37.5, 39.5, 41.0, 43.0 and 45.0 s with `comp.py --frames`; review them as a sheet; fix; repeat. Things to
   look for: the rise reads as rising, not as a cross-fade; the threads land on the right lights and never cross the
   Earth; nothing shimmers (draw a few frames in a row and compare); the tags stay in frame; the end's dawn sits
   behind the emblem and the words stay legible over it.
7. **Draw 504 to the end** under the work, four runs at once, in the manner of `we-are-here/australia/rerender-v1.sh`:
   bounds such as (490 640 790 940 1092), keep `part-00000` and `part-00290`, write `parts.txt`, join with FFmpeg's
   concat, check 1,092 frames, `../encode.sh picture.mkv master.wav out.mp4 45.5 24`, then
   `../qc.py out.mp4 picture.mkv qc.json 1092 24`. Watch the disk: delete the old `part-00690`/`part-00890` and the
   old `picture.mkv` first (they are drawn again).
8. **Measure**: encoder SSIM at or above the delivered film's (about 0.99), no flicker or black frame, -14 LUFS, the
   sound in sync to the sample at 0.56, 22.25, 33.45 and 40.25 s. The Earth's fine detail costs encoder headroom:
   check the bitrate (the delivered film is 12.5 Mbit/s) and the lowest SSIM frame.
9. **A new cover** from the end card (44.5 s as before), checked in 3:4 and square crops.
10. **The documents.** `PLAN.md` (the brief's note 6 and 7, the world from 21 s, the data and its credits),
    `DELIVERY.md` (the new file's size and SHA-256, the measures, the picture's beats from 21 s, the credits),
    `we-are-here/README.md` (`earth.py`, `earth_look.py`, the cache step `fetch.py <work>/../cache`). Credits: GLOBE
    (NOAA, public domain), NASA's Blue Marble Next Generation (public domain), Natural Earth's relief (public
    domain), GeoNames (CC BY 4.0: credit "GeoNames" wherever the film's credits or description allow; put that in
    the delivery note's "Before it runs publicly"), and GSHHG (LGPL) if used.
11. **Deliver**: the file to `<work>/delivery/` beside the old one (keep the old one), the cover and the QC; commit and
    push; `work.py save` with the steps done and the decision; send the file to the person with a short note of what
    changed.

---

## 10. State at the moment of this handoff

- **Git**: everything above is committed and pushed on `claude/eager-bell-1y7y1m` (`5fd9027`, and the commit that
  adds this line).
- **The studio**: the work is saved with this handoff as its next step (journal entries 403 and 412), and it now
  keeps 1,309 files (2.2 GB), among them all 1,092 frames of the words, `type/labels.json`, the 16 textures, the
  opening's runs `part-00000`, `part-00290` and `part-00490`, and the 9 files of `we-are-here/australia/`. The last
  save found nothing left to send. (One upload failed on the way with the storage's error 520 and went through in
  smaller batches: `XENO_WORK_FILES_PER_SAVE=150 XENO_WORK_PARTS_PER_OFFER=60 work.py push`.)
- **Nothing is running.** No render was left half done; the delivered film and its files are untouched.

---

## 11. Gotchas met so far

- OpenCV's `remap` takes no side of 32,767 or more: `earth._grid_sample` lays any list of samples out in rows of
  4,096.
- The GLOBE mask's rows run from 90 N southward (row = (90 - lat) x 120), and `True` is water.
- GeoNames gives a great city's whole metropolitan population on its centre's entry and again on its suburbs: cap
  the centre (done), or the city is a white blob.
- `Painter`'s fog (`exp(-z / 160)`) would wipe out the Earth's lights hundreds of units away: they are drawn with
  `fog=False` and their own dimming by the air.
- Keep the intersection's arithmetic in float64: during the rise the Earth's radius is over 200,000 units, and
  `Ground._c` avoids subtracting two huge squares.
- A wide gold glow lays a brown-grey veil over the navy (it happened with the core's glow and again with the first
  dawn). Keep gold light narrow or near the limb.
- Never show the person an image in false colour (a depth map, a heat map): it upset the client. Look at those
  yourself only, or map them to navy, ice and gold.
- The words are photographed by Chromium; if they are ever drawn again, wait for the fonts (the scripts do).
- `.xeno-work/` is outside git; the work's `.xenoignore` decides what the studio keeps.
