# Motion graphics: compositions

Every frame of Reel 1's system edition was a composition the Editor couldn't hold: a page drawn
in the brand's colours and type, moved by a function of time, drawn as a camera would. It was
built beside the studio (`scripts/aurixa-reel-1/render.cjs`, `motion.cjs` and its scenes). This
is that renderer inside the studio: the handover's A1 (compositions in the Editor), A2
(camera-quality drawing), A3 (drawing in stretches, cached), A5 (WebGL on a GPU), D3 (product
pages from a demo record) and I2 (an edit's render waits for its motion graphics, finals first).

An admin applies `drizzle/migrations/0034_compositions.sql`, and the media worker is deployed with
its browser (the image installs Chromium). Until then the Editor says what is missing.

## In the Editor

**Media bin → Motion graphic** opens the templates. Pick one, set it up in the form beside it,
choose the brand kit it is drawn in, and watch it play live: the preview builds the same scene the
server compiles and sets its page the way the media worker does, so what plays is what is drawn
(without the final drawing's motion blur and 2x detail). Scrub it by hand; the marks under the
scrubber are its beats (the press, the result held, the arrival).

**Add to the edit** has the media worker draw it, as a draft by default (once a frame, at the
frame's size: quick). The clip goes in the moment it is drawn, after the clip that was selected;
a composition drawn before goes in at once. Drawings under way show above the transport.

A motion graphic's clip is a video clip that plays its drawing, with its composition beside it.
Its Inspector section changes it (the same dialog), draws it again, or draws it final now so the
edit's render needn't wait. Trim, transitions and placement work as on any clip.

The Editor works out the hash the server would draw a clip under. When its drawing no longer
matches it (its settings, its brand kit, the kit's demo record, or the edit's frame or rate
changed), the Inspector says so and the preview plays it live until it is drawn again. A drawn
motion graphic added from the library keeps its composition.

## The templates

| Template           | Group         | What it draws                                                                                                   |
| ------------------ | ------------- | --------------------------------------------------------------------------------------------------------------- |
| Product window     | Graphics kit  | A screen in the brand's glass window: the camera pushes in, the pointer presses, the result is held in corners. |
| Journey rail       | Graphics kit  | A journey's stages on a rail: the traveller moves from one to the next, each passed checked off.                |
| Record card        | Graphics kit  | A record from the demo record: its fields arrive one by one, its grade lands in a ring drawn to the score.      |
| Document           | Graphics kit  | A page lands flat, its lines arrive in reading order, a signature is drawn and a stamp pressed.                 |
| Pages running past | Graphics kit  | A run of pages passes the camera in depth, each held square to it, then carried away.                           |
| Notifications      | Graphics kit  | Notifications drop in, the newest on top, each from someone in the demo record; the last can be pressed.        |
| Call to action     | Graphics kit  | The call to action on a living button: its light runs on the music's bars and beats; the pointer presses it.    |
| Title card         | Brand cards   | The logo with one pass of light across it, the headline word by word and the tagline.                           |
| Big number         | Brand cards   | One figure counts up to its value, a ring draws round to its share, and its label follows.                      |
| Product dashboard  | Product pages | The dashboard from the demo record: its figures count up, its records arrive, and one is selected.              |
| Report page        | Product pages | A report page: its grade in a ring and a bar chart growing bar by bar.                                          |
| Record list        | Product pages | The list of records: a status filter is pressed, the rest fold away, and the match is selected.                 |
| Client file        | Product pages | A client's file: who they are and its overview, then Documents is pressed and its files arrive.                 |

Each has settings with defaults (`{}` is always a valid start) and a range of lengths. The studio
API's `list_motion_templates` lists them with their settings.

## The brand

A composition is drawn in a brand kit (or the studio's own look):

- **Colours.** The kit's production roles first (its ground, surface, raised, ink, muted ink,
  line, accent and signature, read from its code: see `docs/brand-code-import.md`), then its
  colours and palette, then mixed from those. A translucent role is seen over what it is drawn on.
  Aurixa's gold is its signature, drawn as the highlight.
- **Type.** The kit's heading and body fonts, with the kit's own font files loaded into the page.
- **Logo, tagline, call to action and website**, for the brand cards and the call to action.
- **Motion.** The kit's move and settle curves and its press time (D2). Without them, the studio's
  (the emphasised ease, ease-out, a 320 ms press).
- **The demo record** (D3): the fictional people, records, figures and lists its product screens
  show, so a reel never shows a real client. A template's text names a field as `{{entity.field}}`
  (`{{record.title}}`, `{{client.company}}`); a list by its key. It is edited in the kit's **Demo
  record** section on the Brand page (or with the API's `set_demo_record`), so renaming the record
  renames it in every motion graphic the next time each is drawn. A field the record lacks is left
  blank, never shown as a placeholder, and the Editor says which.

## Drawing as a camera would (A2)

| Quality | Drawn at  | Drawings a frame       | Use                                        |
| ------- | --------- | ---------------------- | ------------------------------------------ |
| Draft   | the frame | 1                      | Editing: quick.                            |
| Final   | twice it  | 8, over a 180° shutter | The edit's render, and anything published. |

Drawing j of n for frame f is taken at (f + ((j + 0.5) / n − 0.5) × shutter / 360) / fps: evenly
over the half of the frame the shutter is open, centred on it. The drawings are averaged (FFmpeg's
`tmix`) and scaled down with Lanczos (`zscale`), so a fast move smears as a camera's would, and a
still frame, its drawings all alike, stays exactly as sharp. A drawing whose state hasn't changed
reuses the one before: a held result costs one drawing, not eight a frame.

Each drawing keeps a lossless master (FFV1, `bgr0`) beside a playable copy (H.264, BT.709, CRF 16,
dithered from the master). The Editor plays the copy; an edit's render reads the master, so the
motion graphic's frames are encoded once, in the render's own final pass.

## Every drawing kept only once it has settled

Reel 2 found that Chromium can hand back a capture a moment before every tile in it is painted,
even with every compositor stage run before it draws. As the camera pushed in on the Passport's
closed cover, about half of fifty frames caught the leaves beneath it through the cover in
hard-edged rectangles, and one caught a caption word a step behind. Which drawings it hits changes
from run to run, and a larger tile budget did not stop it. So the media worker
(`media-worker/src/settle.js`) captures every drawing again, after two of the page's own frames,
until two captures in a row agree. Agreeing means one of three things:

- the same bytes;
- the capture before last again: a drawing at rest between two paintings, as a thin rotated line
  was, drawn at two scales on alternate frames;
- no value more than 16 apart: a hairline that jitters on every capture.

A race is tens to hundreds of values out, on a hole or a word.

Two more things the reel taught:

- **Browsers are started again.** Each one is started again every `COMPOSITION_RECYCLE_FRAMES`
  (default 40) of its frames, its page brought up to its frame from the track. In the reel's 3D
  tilt one browser grew past 4 GB and was ended for memory.
- **A final drawing is shown free of a race by agreement.** Its frames are put to the vote: every
  frame the check had to capture again, its neighbours, and a seeded 5% of the rest (`verify`, 0
  to 0.5). Each is drawn again by a browser of its own, and both draws are made into frames by the
  master's own filter. Two sound draws differ at most at letter and image edges: up to 708 pixels
  of a 1080 x 1920 frame off by more than 12, where a word a step behind is 1,113 or more and a
  hole 175,000 or more. So frames within 2 everywhere, or off by more than 12 on no more than 900
  pixels of a 1080 x 1920 frame (in proportion for other sizes), are one answer. Where two
  disagree, a third browser draws it, and the drawings two agree on are the ones kept.

A drawing's metadata says how it went: `settle` (the frames captured again and how many times,
any that never settled, every capture and its mean time), `verified` (the frames put to the vote,
those that disagreed, replaced or unresolved, and the votes) and `browser_launches`. The settle
check's second capture is in the time a drawing is measured to take, so the Editor's estimate
includes it.

## Never drawn twice, and long ones in stretches (A3)

The server compiles a composition into a bundle: its page (one HTML document) and its track (each
drawing's style changes, worked out by running the template's state function here, so the media
service never runs code from an edit). A composition is kept under the SHA-256 of its bundle and
the files it reads (`compositionIdentity`): asking for the same composition again, in the Editor,
in an edit's render or through the API, returns the drawing already made.

A final composition longer than 360 frames (twelve seconds at 30 fps) is drawn in stretches of
about 240 frames,
all sent at once, so as many media workers as there are draw them side by side. Each stretch is
kept under its own hash (the page, its files, the state it starts from and its own drawings), so a
change to one part of a long composition draws only the stretches it touches. They are joined
frame for frame without encoding again (`join_stretches`).

Before drawing, the Editor shows an estimate: the drawings that change, times what one drawing has
been measured to take on this media service at that quality (the median of its latest drawings;
until it has measured any, Reel 1's 0.25 s for a 2x drawing of a 1080 × 1920 frame), shared
between the browsers that draw at once.

## An edit's render (I2)

When an edit with motion graphics is rendered, each one's final drawing is found or started, at
the edit's own frame and rate, ahead of any draft in the media workers' queues. The render is
recorded but not sent while they are drawn, says how many are done (`Drawing motion graphics (1
of 2 done)`), and goes the moment the last is in. A drawing that fails fails the render, saying
why. Two clips playing the same drawing with different settings are refused: draw the changed one
again first.

## WebGL and a GPU (A5)

A template that draws with WebGL says so (`webgl: true` on its scene). Without a GPU, Chromium
draws WebGL in software (SwiftShader), which is slow for a heavy scene: Reel 1's satellite globe
took 16 to 23 s a drawing at first. A media worker run on a machine with a GPU, with
`MEDIA_WORKER_GPU=1`, draws WebGL on it; the app sends WebGL compositions there when
`MEDIA_WORKER_GPU_URL` names it (with the same `MEDIA_WORKER_SHARED_SECRET`), and to the usual
worker otherwise.

Where there is no GPU, the globe's own techniques brought it to 0.6 s a drawing:

- **Plain textures.** RGBA8, with the sRGB decode done in the shader, not sRGB or float formats
  that send software rendering down slow paths.
- **Resolution per layer.** Each layer drawn at the resolution it shows at (the Earth at the
  frame's), not at the largest any layer needs.
- **A quantised clock.** The scene's own clock steps at a fixed rate (the globe's, 120 drawings a
  second), so most of a final frame's eight drawings are the same and are reused.

## Writing a template

Templates live in `src/lib/compositions/templates/`, each made with `defineTemplate`:

- `schema`: its settings (zod), every one with a default; `fields`: how the Editor shows them.
- `duration`: its default, shortest and longest.
- `build(input)`: returns the scene's markup and stylesheet, `state(t)` and its `beats`. The
  input has the brand, its curves ready to call (`motion.move`, `motion.settle`), the frame and
  its unit `u` (1 at 1080 on the short side), `image(assetId)` for a library picture's address in
  this page, `imageSize(assetId)` and `fill(text)` for the demo record.

`state(t)` is a pure function of time that sets every property it animates at every moment, on a
`CompositionState`: a frame never depends on the one before, so frames can be drawn in any order,
in stretches, on several machines. Only what changed since the last drawing is sent to a page.
Text changes go in `$text`, an image's address in `$src`. The kit (`../kit.ts`) has the graphics
Reel 1 was built from: the ground, the pointer and its press, the focus corners, the demo label,
rising in, and beats spread across a length. CSS transitions and animations are switched off in
every page: everything that moves is in `state(t)`.

A change to what a template draws raises its `version`, so drawings made before are not reused
for it. A template's id never changes once used.

## Where things are

- `src/lib/compositions/`: specs and keys, the state contract, the brand, the demo record, the
  compiler and stretches, the templates, the server's drawing and its callbacks, and edits.
- `src/components/editor/Composition*.tsx`, `DrawingTray.tsx`, `src/hooks/useCompositions.ts`:
  the Editor. `src/components/brand/DemoRecordEditor.tsx`: the Brand page.
- `media-worker/src/composition.js`, `chromium.js`: `render_composition` and `join_stretches`.
- `src/lib/studio-api/compositions.server.ts`: `list_motion_templates`, `draw_motion_graphic`,
  `get_motion_graphic` and `set_demo_record` (see `docs/studio-api.md`).

Limits: a composition runs up to 60 s at 24, 25, 30 or 60 fps, at most 3,600 frames and 3840 ×
3840 drawn at twice its size; its page up to 8 MB; up to 64 stretches.
