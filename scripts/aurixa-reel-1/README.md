# Aurixa Reel 1: spec and plates

These scripts build Aurixa's Reel 1 generation spec and typeset its screen plates. The spec is
[docs/brands/aurixa-reel-1](../../docs/brands/aurixa-reel-1).

| File                | What it does                                                                                                                                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timing.py`         | Cut points from the voiceover's measured words and speech segments (the studio's lip-sync preparation of the master recording), snapped to 30 fps. Writes a timing JSON.                                                     |
| `build_spec.py`     | Writes `spec.json` (every still, set, plate, frame and clip, with models, parameters, inputs and prompts) and adds any new keys to `assets.json`, the ledger of approved library asset ids.                                  |
| `render_readme.py`  | Writes the spec's README from `spec.json`.                                                                                                                                                                                   |
| `plates.cjs`        | Typesets the 41 screen plates, Block 14 phrases and the closing card, and renders them to PNG with Playwright. Playfair Display, Plus Jakarta Sans and JetBrains Mono come from Google Fonts.                                |
| `portals.cjs`       | The portal plates (used by `plates.cjs`), built on the shells of the portal screenshots.                                                                                                                                     |
| `studio.py`         | Runs the spec against the studio API: imports the plates (`import_image`, ids into `assets.json`), prices a stage (`estimate_generation`) and runs one (`queue_generation`, only with `--confirm`; takes into `takes.json`). |
| `contact-sheet.cjs` | One picture of every rendered plate, for review.                                                                                                                                                                             |

```sh
python3 scripts/aurixa-reel-1/timing.py /tmp/reel-1-timing.json
python3 scripts/aurixa-reel-1/build_spec.py docs/brands/aurixa-reel-1 /tmp/reel-1-timing.json
python3 scripts/aurixa-reel-1/render_readme.py docs/brands/aurixa-reel-1/spec.json docs/brands/aurixa-reel-1/README.md
npx prettier --write docs/brands/aurixa-reel-1

node scripts/aurixa-reel-1/plates.cjs /tmp/reel-1-plates [assets]   # assets: a folder with P.png, D.png, emblem.png, wordmark.png
node scripts/aurixa-reel-1/contact-sheet.cjs /tmp/reel-1-plates /tmp/reel-1-plates.png
```

The plates are v2:

- The Solicitor, Accountant, Finance, Client and Builder / Developer plates are built on those
  portals' screenshots: their shell and layout, with the reel's fictional people and records.
- The Command Center plates follow the same family until its screenshot is supplied.
- The property image (P), the floor plan (D), the emblem and the wordmark come from the assets folder
  (P and D the approved Stage 1 picks; the emblem and wordmark keyed from the supplied logo, REF-LOGO), and
  are marked placeholders without it.
- The plates go on the screens inside the frames, not in the edit: the studio's editor lays only flat, still
  pictures over video. The Block 14 phrases, the Demo workspace cut and the closing card are flat and full
  frame, so those are laid on in the edit.

Rendered plates go into the library with the studio API's `import_image`, and their ids into
`assets.json`. An import is keyed on the plate and its file's content, so a re-rendered plate imports
anew and an unchanged one returns its earlier import; `--only` imports the plates that are final.
