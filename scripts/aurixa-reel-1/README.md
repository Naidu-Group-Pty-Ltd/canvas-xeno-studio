# Aurixa Reel 1: spec and plates

These scripts build Aurixa's Reel 1 generation spec and typeset its screen plates. The spec is
[docs/brands/aurixa-reel-1](../../docs/brands/aurixa-reel-1).

| File                | What it does                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timing.py`         | Cut points from the voiceover's measured words and speech segments (the studio's lip-sync preparation of the master recording), snapped to 30 fps. Writes a timing JSON.                                                                                                                                                                                                                                                           |
| `build_spec.py`     | Writes `spec.json` (every still, set, plate, frame and clip, with models, parameters, inputs and prompts) and adds any new keys to `assets.json`, the ledger of approved library asset ids.                                                                                                                                                                                                                                        |
| `render_readme.py`  | Writes the spec's README from `spec.json`.                                                                                                                                                                                                                                                                                                                                                                                         |
| `plates.cjs`        | Typesets the 41 screen plates, Block 14 phrases and the closing card, and the system edition's 22 pages (`NEW-*`), and renders them to PNG with Playwright. Playfair Display and Inconsolata come from Google Fonts; Selawik from the assets folder.                                                                                                                                                                               |
| `selawik.py`        | Builds Selawik, the open stand-in for Segoe UI (the portals' font on Windows), from Microsoft's UFO sources, with the standard library alone.                                                                                                                                                                                                                                                                                      |
| `mascot.cjs`        | Renders the Aurixa Agent's presence (the mascot on her button and in her header) from the portals' own markup, stylesheet and art, to `mascot.png`.                                                                                                                                                                                                                                                                                |
| `portals.cjs`       | The portal plates (used by `plates.cjs`), built on the shells of the portal screenshots and, where none was supplied, on the portals' own code; with the browser window and PDF viewer the file scenes need.                                                                                                                                                                                                                       |
| `kit.cjs`           | The graphics kit as code: the plain windows, inbox, listing card and notifications the before-plates share, and the frame kit the style frames are drawn with (the frame and its zones, the journey rail, the camera and the fixed window it moves in, the pointer and its press, focus corners, the marker, links, the record card, the team, documents, the map, the clock).                                                     |
| `helvetica.cjs`     | Helvetica's advance widths (Liberation Sans is its metric twin), so the report's pages break their lines where the product's PDF code breaks them.                                                                                                                                                                                                                                                                                 |
| `frames.cjs`        | Draws the system edition's 15 style frames, one 1080 x 1920 still per block at its key beat and under its caption, from the plates' own HTML at the camera's zoom and the kit; a marker goes under the words a frame marks, where the browser set them. Writes `frames.json`. Also holds the animatic's 21 further stills, and `drawAll`, which both scripts draw with.                                                            |
| `animatic.cjs`      | The animatic (review gate 2): every shot as its stills on the master voiceover, each from the brief beat it starts on, with the captions; cut where a still or a caption changes, at whole frames of 30 fps, and encoded frame by frame with the voiceover. Writes `animatic.mp4`, its stills, `animatic.json` (every segment) and `shots.png` (each shot's first still).                                                          |
| `render.cjs`        | The film: draws the scenes in `scenes/` at 2x, averages each frame over a 180-degree shutter, scales it with Lanczos and encodes BT.709 4:2:0 with dither, x264 CRF 12 with the voiceover. A layer a scene would make the browser redraw on every drawing is baked to a picture once (`OUT/bake`). Writes `film.mp4`, `reference.mkv` (lossless RGB) and `film.json` (every frame's shot and caption words).                       |
| `motion.cjs`        | The toolkit the scenes are written in: the brief's beats, the brand's own curves and durations (`aurixa-reel.css`), a frame's state, G-WINDOW moving, the pointer and its press, focus corners, the captions and the rail.                                                                                                                                                                                                         |
| `scenes/`           | One file a scene, in film order (`scenes/index.cjs`): each the shots it draws, its page, what it measures on it and its state at any time t, on the brief's beats; a scene not yet written is left out, so a range can be drawn while the rest is made.                                                                                                                                                                            |
| `captions.cjs`      | The captions in the brand's type: Playfair Display Medium in the site's silver headline gradient, a phrase a line in its italic (gold once the brand has arrived, with a hairline and one pass of light), each word rising into focus on its spoken time (`voiceover-words.json`); a white card of today's tools before the brand, the site's glass after, the one leaving and the other arriving at each cut between them.        |
| `logo.cjs`          | Where 04.1 stands the supplied logo, the frames a video model starts and ends on (drawn on the renderer's own ground), and the cards' logo that takes the model's footage, with the art's own lettering laid over it.                                                                                                                                                                                                              |
| `logo_motion.py`    | The logo's clean plate (the art without its lettering, from one image edit blended back only where the lettering was) and lettering overlay, the takes through the studio API (`logo-takes.json`), and their ingest: each take aligned and colour-matched to the exact picture it must end on, at 30 fps, into the assets folder.                                                                                                  |
| `film_qc.py`        | Measures `render.cjs`'s master against its reference, decoded as a player decodes it: SSIM and PSNR, CIEDE2000 on flat fields and the brand's colours, sharpness, banding, every frame's caption, the cuts and the voiceover's sync; `--export` does it again after the studio's own export. Writes `qc/qc.json`.                                                                                                                  |
| `replace_frames.py` | Puts frames drawn again (`RENDER_FRAMES`) into a finished render in their places and encodes the master again with the renderer's own chain, so a change that touches a few frames costs those frames, not the film.                                                                                                                                                                                                               |
| `studio.py`         | Runs the spec against the studio API: imports the plates (`import_image`, ids into `assets.json`), prices a stage (`estimate_generation`) and runs one (`queue_generation`, only with `--confirm`; takes into `takes.json`); Stage 5's clips take `--model` (`clip_cinema`: Cinema Studio 4.0, its frames sent as reference images the way the studio's long videos send them).                                                    |
| `cast.py`           | The cast as studio characters with Soul IDs (Soul 2), from the approved assets alone: each sheet cut into its panels (one face per image) and each person's clear faces cut from the approved frames; saves them, trains, reads their state and makes a likeness still each. Paints the studio's own training pack where those give too few faces, and adds the good ones. Ids in `characters.json`.                               |
| `edit.py`           | Lays the reel out in the studio's Editor as a draft edit (`create_edit`, then `update_edit` on the same one): the 26 shots cut from one take of every clip on the voiceover's clock, the Demo workspace cut, the Block 14 phrases and the closing card as full-frame pictures, the voiceover and the captions in the brand kit's look. Its id in `edit.json`.                                                                      |
| `system_edition.py` | The system edition's content brief (no people, no generated video): its 29 shots and their beats computed from the voiceover's measured words with `timing.py`'s cut rule and checked, the design system read from the four Aurixa repositories, and the graphics kit. Writes `docs/brands/aurixa-reel-1/system-edition/` (BRIEF.md and brief.json), and the SQL that keeps it in the studio as a creative brief (`--studio-sql`). |
| `reel_css.ts`       | The graphics kit's stylesheet, `aurixa-reel.css`, written by Xeno Studio's code scanner from the four Aurixa repositories: every role in the brief's token table as a custom property with the repository, file and line it is declared on, each checked against the brief (`--check` exits 1 if a value disagrees or the files are stale). Also writes `aurixa-reel.json`.                                                        |
| `reel_preview.cjs`  | Draws `aurixa-reel-tokens.png` from `aurixa-reel.css` alone: the swatches, the type, and the kit's devices (the glass window, the record card in its focus corners, the rail and its traveller, the document, the pointer's press).                                                                                                                                                                                                |
| `contact-sheet.cjs` | One picture of every rendered plate, for review.                                                                                                                                                                                                                                                                                                                                                                                   |

```sh
python3 scripts/aurixa-reel-1/timing.py /tmp/reel-1-timing.json
python3 scripts/aurixa-reel-1/build_spec.py docs/brands/aurixa-reel-1 /tmp/reel-1-timing.json
python3 scripts/aurixa-reel-1/render_readme.py docs/brands/aurixa-reel-1/spec.json docs/brands/aurixa-reel-1/README.md
npx prettier --write docs/brands/aurixa-reel-1

git clone --depth 1 https://github.com/microsoft/Selawik /tmp/selawik
python3 scripts/aurixa-reel-1/selawik.py "/tmp/selawik/Source files/UFO" assets
node scripts/aurixa-reel-1/mascot.cjs <npc-client-dashboard checkout> assets/mascot.png 240
node scripts/aurixa-reel-1/plates.cjs /tmp/reel-1-plates assets   # assets: P.png, D.png, emblem.png, wordmark.png, logo-art.png, mascot.png, bn-mark.png, Selawik-*.ttf
PLATES_ONLY=PL-09B-a,PL-12A-a node scripts/aurixa-reel-1/plates.cjs /tmp/reel-1-plates assets   # just those, to look at a change
node scripts/aurixa-reel-1/contact-sheet.cjs /tmp/reel-1-plates /tmp/reel-1-plates.png
node scripts/aurixa-reel-1/frames.cjs /tmp/reel-1-frames assets   # the 15 style frames and frames.json
FRAMES_ONLY=F07 FRAMES_ZONES=1 node scripts/aurixa-reel-1/frames.cjs /tmp/reel-1-frames assets   # one, with the frame's zones drawn over it
node scripts/aurixa-reel-1/animatic.cjs /tmp/reel-1-animatic assets voiceover.wav   # the animatic; voiceover.wav: studio asset 84c0abf7 (get_asset)
python3 scripts/aurixa-reel-1/logo_motion.py clean assets edit.png   # logo-clean.png and logo-letters.png
python3 scripts/aurixa-reel-1/logo_motion.py frames assets /tmp/reel-1-logo   # the model's input frames
python3 scripts/aurixa-reel-1/logo_motion.py run /tmp/reel-1-logo --only A1 --confirm   # a take (billed), then ingest it:
python3 scripts/aurixa-reel-1/logo_motion.py ingest /tmp/reel-1-logo assets A1-take1 A
node scripts/aurixa-reel-1/render.cjs /tmp/reel-1-film assets voiceover.wav 01.1 15.1   # the film, every shot
RENDER_FRAMES=1072,1300 node scripts/aurixa-reel-1/render.cjs /tmp/reel-1-film assets voiceover.wav 04.1 05.2   # just those frames, to PNG
python3 scripts/aurixa-reel-1/film_qc.py /tmp/reel-1-film --voiceover voiceover.wav --export   # measures it
python3 scripts/aurixa-reel-1/cast.py save /tmp/reel-1-cast && python3 scripts/aurixa-reel-1/cast.py train   # then: status, proof
python3 scripts/aurixa-reel-1/cast.py pack --only JAMIE && python3 scripts/aurixa-reel-1/cast.py fetch-pack /tmp/reel-1-pack   # then: keep JAMIE=2,3, train --only JAMIE
python3 scripts/aurixa-reel-1/studio.py price 5 --model clip_cinema && python3 scripts/aurixa-reel-1/studio.py run 5 --model clip_cinema --takes 1 --confirm
python3 scripts/aurixa-reel-1/studio.py run 5 --model clip_cinema --takes 1 --retry-refused --confirm   # takes refused for the balance
python3 scripts/aurixa-reel-1/edit.py plan --stand-ins && python3 scripts/aurixa-reel-1/edit.py save --stand-ins   # the same draft each time
python3 scripts/aurixa-reel-1/system_edition.py docs/brands/aurixa-reel-1/system-edition && npx prettier --write docs/brands/aurixa-reel-1/system-edition
python3 scripts/aurixa-reel-1/system_edition.py --check   # every shot and beat on the clock
python3 scripts/aurixa-reel-1/system_edition.py --studio-sql /tmp/system-edition.sql   # the brief as the studio's creative brief
bun scripts/aurixa-reel-1/reel_css.ts Naidu-Group-Pty-Ltd/aurixa-systems=<checkout> Naidu-Group-Pty-Ltd/aurixa-builders=<checkout> Naidu-Group-Pty-Ltd/npc-client-dashboard=<checkout> Naidu-Group-Pty-Ltd/aurixa-mission-control-12b89885=<checkout>   # or no arguments: from GitHub
bun scripts/aurixa-reel-1/reel_css.ts <the same> --check   # every role still holds the brief's value, and the files are fresh
node scripts/aurixa-reel-1/reel_preview.cjs   # docs/brands/aurixa-reel-1/system-edition/aurixa-reel-tokens.png
```

The plates are v2:

- The Solicitor, Accountant, Finance, Client and Builder / Developer plates are built on those
  portals' screenshots: their shell and layout, with the reel's fictional people and records.
- The Command Centre plates are built on its Reports page screenshot (REF-CC-REPORTS), drawn at 125% zoom; the
  pages past Reports are made from that page's components.
- The portal plates are set in the portals' own fonts, read from their code: Segoe UI (drawn in Selawik), the brand
  serif Playfair Display Medium, and Consolas for code labels (drawn in Inconsolata). See `docs/brands/aurixa-reel-1/QC.md`.
- The pages no screenshot covers are built from the portals' own code (`npc-client-dashboard`, and `aurixa-builders`
  for the Builder / Developer portal, both read only): Jamie's purchase file and its Finance Decisions, Jordan's My
  property team, Mia's client file and its Requests, Priya's matter (Overview, Docs, Notes) and Daniel's Stock List
  in the Builders Network's own look, with its mark (`bn-mark.png`, its `public/brand/aurixa-symbol-192.webp`).
  A file opens in the browser's own tab in these portals, so the floor plan (12A, 12B) and the client's report (08B,
  its exported PDF's cover, after `investmentPdfCover.ts`) are drawn in a browser window and its PDF viewer.
- The trial card and the closing card carry the supplied logo whole (`logo-art.png`). In the film (`render.cjs`)
  the logo lives on both cards: the card take's footage (`logo-takes.json`, B1) over the art, under the art's own
  lettering (`logo-letters.png`), so the letters are the supplied ones, pixel for pixel; 04.1 reveals it from the
  reveal take (A1), and the exact emblem and wordmark take over from the footage before they move.
- The property image (P), the floor plan (D), the emblem and the wordmark come from the assets folder
  (P and D the approved Stage 1 picks; the emblem and wordmark keyed from the supplied logo, REF-LOGO), and
  are marked placeholders without it.
- The plates go on the screens inside the frames, not in the edit: the studio's editor lays only flat, still
  pictures over video. The Block 14 phrases, the Demo workspace cut and the closing card are flat and full
  frame, so those are laid on in the edit.

Rendered plates go into the library with the studio API's `import_image`, and their ids into
`assets.json`. An import is keyed on the plate and its file's content, so a re-rendered plate imports
anew and an unchanged one returns its earlier import; `--only` imports the plates that are final.
