# Aurixa Reel 1: spec and plates

These scripts build Aurixa's Reel 1 generation spec and typeset its screen plates. The spec is
[docs/brands/aurixa-reel-1](../../docs/brands/aurixa-reel-1).

| File                | What it does                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timing.py`         | Cut points from the voiceover's measured words and speech segments (the studio's lip-sync preparation of the master recording), snapped to 30 fps. Writes a timing JSON.                                                                                                                                                                                                                                                           |
| `build_spec.py`     | Writes `spec.json` (every still, set, plate, frame and clip, with models, parameters, inputs and prompts) and adds any new keys to `assets.json`, the ledger of approved library asset ids.                                                                                                                                                                                                                                        |
| `render_readme.py`  | Writes the spec's README from `spec.json`.                                                                                                                                                                                                                                                                                                                                                                                         |
| `plates.cjs`        | Typesets the 41 screen plates, Block 14 phrases and the closing card, and renders them to PNG with Playwright. Playfair Display and Inconsolata come from Google Fonts; Selawik from the assets folder.                                                                                                                                                                                                                            |
| `selawik.py`        | Builds Selawik, the open stand-in for Segoe UI (the portals' font on Windows), from Microsoft's UFO sources, with the standard library alone.                                                                                                                                                                                                                                                                                      |
| `mascot.cjs`        | Renders the Aurixa Agent's presence (the mascot on her button and in her header) from the portals' own markup, stylesheet and art, to `mascot.png`.                                                                                                                                                                                                                                                                                |
| `portals.cjs`       | The portal plates (used by `plates.cjs`), built on the shells of the portal screenshots and, where none was supplied, on the portals' own code; with the browser window and PDF viewer the file scenes need.                                                                                                                                                                                                                       |
| `studio.py`         | Runs the spec against the studio API: imports the plates (`import_image`, ids into `assets.json`), prices a stage (`estimate_generation`) and runs one (`queue_generation`, only with `--confirm`; takes into `takes.json`); Stage 5's clips take `--model` (`clip_cinema`: Cinema Studio 4.0, its frames sent as reference images the way the studio's long videos send them).                                                    |
| `cast.py`           | The cast as studio characters with Soul IDs (Soul 2), from the approved assets alone: each sheet cut into its panels (one face per image) and each person's clear faces cut from the approved frames; saves them, trains, reads their state and makes a likeness still each. Paints the studio's own training pack where those give too few faces, and adds the good ones. Ids in `characters.json`.                               |
| `edit.py`           | Lays the reel out in the studio's Editor as a draft edit (`create_edit`, then `update_edit` on the same one): the 26 shots cut from one take of every clip on the voiceover's clock, the Demo workspace cut, the Block 14 phrases and the closing card as full-frame pictures, the voiceover and the captions in the brand kit's look. Its id in `edit.json`.                                                                      |
| `system_edition.py` | The system edition's content brief (no people, no generated video): its 29 shots and their beats computed from the voiceover's measured words with `timing.py`'s cut rule and checked, the design system read from the four Aurixa repositories, and the graphics kit. Writes `docs/brands/aurixa-reel-1/system-edition/` (BRIEF.md and brief.json), and the SQL that keeps it in the studio as a creative brief (`--studio-sql`). |
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
python3 scripts/aurixa-reel-1/cast.py save /tmp/reel-1-cast && python3 scripts/aurixa-reel-1/cast.py train   # then: status, proof
python3 scripts/aurixa-reel-1/cast.py pack --only JAMIE && python3 scripts/aurixa-reel-1/cast.py fetch-pack /tmp/reel-1-pack   # then: keep JAMIE=2,3, train --only JAMIE
python3 scripts/aurixa-reel-1/studio.py price 5 --model clip_cinema && python3 scripts/aurixa-reel-1/studio.py run 5 --model clip_cinema --takes 1 --confirm
python3 scripts/aurixa-reel-1/studio.py run 5 --model clip_cinema --takes 1 --retry-refused --confirm   # takes refused for the balance
python3 scripts/aurixa-reel-1/edit.py plan --stand-ins && python3 scripts/aurixa-reel-1/edit.py save --stand-ins   # the same draft each time
python3 scripts/aurixa-reel-1/system_edition.py docs/brands/aurixa-reel-1/system-edition && npx prettier --write docs/brands/aurixa-reel-1/system-edition
python3 scripts/aurixa-reel-1/system_edition.py --check   # every shot and beat on the clock
python3 scripts/aurixa-reel-1/system_edition.py --studio-sql /tmp/system-edition.sql   # the brief as the studio's creative brief
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
- The trial card and the closing card carry the supplied logo whole (`logo-art.png`).
- The property image (P), the floor plan (D), the emblem and the wordmark come from the assets folder
  (P and D the approved Stage 1 picks; the emblem and wordmark keyed from the supplied logo, REF-LOGO), and
  are marked placeholders without it.
- The plates go on the screens inside the frames, not in the edit: the studio's editor lays only flat, still
  pictures over video. The Block 14 phrases, the Demo workspace cut and the closing card are flat and full
  frame, so those are laid on in the edit.

Rendered plates go into the library with the studio API's `import_image`, and their ids into
`assets.json`. An import is keyed on the plate and its file's content, so a re-rendered plate imports
anew and an unchanged one returns its earlier import; `--only` imports the plates that are final.
