# Xeno media worker

A small, stateless rendering service for Xeno Studio: thumbnails, frame
extraction, trimming, transcoding, reframing, audio extraction/overlay,
timeline assembly and full sequence rendering for the Editor. It is
deliberately dumb — it renders what the app tells it to and reports back. It
holds no database access, no provider credentials and no user session.

## Security model

- **Signed both ways.** Every request and every callback carries
  `x-xeno-timestamp` and `x-xeno-signature: sha256=<hex>`, where the signature
  is `HMAC-SHA256(MEDIA_WORKER_SHARED_SECRET, "<timestamp>.<raw body>")`.
  Signatures older than five minutes are refused.
- **No shell, ever.** FFmpeg is invoked with an argument array built by the
  worker from typed, range-checked values. A task body cannot supply FFmpeg
  flags, file paths or shell fragments.
- **Closed task catalogue.** Unknown task types are rejected before anything is
  downloaded.
- **No SSRF.** Sources and upload destinations must be `https` on an
  allow-listed host, and must not resolve to a private address. Redirects are
  re-checked.
- **Bounded.** Download size, output size, per-task wall clock, concurrency and
  queue depth are all capped; over-depth requests get `429`.
- **Idempotent.** A repeated `task_id` is acknowledged, never rendered twice.
- **No storage credentials.** The app mints short-lived signed read URLs for
  sources and pre-signed upload URLs for results.

## Endpoints

| Method | Path     | Purpose                                                  |
| ------ | -------- | -------------------------------------------------------- |
| GET    | `/health`| Liveness, FFmpeg version, task catalogue, queue depth     |
| POST   | `/tasks` | Submit a signed task; returns `202` immediately           |

Results are reported to the `callback.url` supplied in the task, signed with the
same scheme. A task that sets `"report_progress": true` also receives
best-effort `{"status": "progress", "progress": 0.42, "stage": "…"}` reports
while it renders (at most one every few seconds, never retried), and a
`{"status": "heartbeat", "stage": "…"}` every `HEARTBEAT_SECONDS` (default 60)
while it waits in the queue or works, so the app can tell a long queue from a
lost task. The final `completed` or `failed` report is the only one that
matters; an app that opts in must treat any other status as informational. Callback hosts have their own allow list, `CALLBACK_HOST_SUFFIXES`
(default `lovable.app,lovableproject.com`); add the app's custom domain there if it
uses one. The app's callback is idempotent, so the worker only repeats on
transport faults, `5xx` and a request that hangs (each try is abandoned after
`REPORT_TIMEOUT_SECONDS`, default 30). The final report is signed afresh for
each try and repeated until the app answers: after four tries it goes on in the
background (backing off to a minute apart) for `REPORT_RETRY_SECONDS` (default
six hours), so the next task isn't held up. A render's video and poster are
uploaded before it reports, so the app can also finish a render from them if
the report never arrives.

Signed URLs expire, a task can wait in the queue, and a task sent twice (its
acknowledgement lost) can reach two instances behind one address. A task that
also gives a `credentials_url` (same host allow list) checks in there when it
starts and again before it uploads: the worker posts a signed
`{"task_id": "…", "worker_id": "…"}`, naming this instance (`FLY_MACHINE_ID`,
else `WORKER_ID`, else an id for the process). The app claims the task for the
first instance to check in and answers with
`{"sources": [{"url"}], "uploads": [{"url"}], "expires_at": "…"}` in the order
first sent (each URL is checked like the originals), `202` with no links if the
claim holds but the links couldn't be renewed just then (the instance goes on
with the ones it has), or `410` if the task is
closed or another instance has it; the task is then dropped without a report,
so it never runs (or uploads) twice. Timeouts, `429` and `5xx` are retried a
few times. Nothing starts without the claim, and the claim keeps retrying (up
to 30 seconds apart) until the app answers or the task's links are past use,
so a short outage doesn't strand a task. If the app refuses, or never answers
in that time, the task is left alone, neither run nor reported, because
another instance may hold it; the app closes it as stalled if none does. Once claimed,
a later check-in that gets no fresh URLs uses the old ones only while they are
valid (the task's `credentials_expire_at`, less five minutes); after that the
task fails with `CREDENTIALS_EXPIRED` rather than attempting a transfer that
can't succeed.

## Sequence rendering

`render_sequence` turns an edited timeline into a finished video plus a poster
frame. The app sends one source per distinct asset (role `video`, `image`,
`audio`, or `font` for a brand's font file) and a timeline in `params`:

- `width`, `height`, `fps` (24, 25, 30 or 60), default `fit` (`cover`,
  `contain`, `blur_pad`)
- `clips[]`: `source_index`, `kind` (`video`/`image`), `trim_start`,
  `duration`, `speed` (0.25–4), `volume` (the clip's own sound, 0–2), `fit`,
  `focus_x` / `focus_y` (0–1, where a `cover` crop sits; the centre unless
  given), `motion` for stills (`zoom_in`, `zoom_out`, `pan_left`, `pan_right`,
  `pan_up`, `pan_down`), `transition` into the clip (`type` from the xfade
  set or `cut`, `duration` up to 3 s; shortened when the clips are too short),
  `match_previous` and `join` (see below). A trim that falls on a frame is honoured to
  the frame: the seek starts a millisecond early so rounding never skips it
- `audio[]`: `source_index`, `role` (`voiceover`, `music`, `sfx`), `start`,
  `trim_start`, `duration`, `volume`, `fade_in`, `fade_out`, and for music
  `loop` and `duck` / `duck_level` (music dips wherever the voiceover actually
  speaks, found with silence detection)
- `captions` (`segments[]` of `start`/`end`/`text`, `style`, `position`,
  `size`, `uppercase`) and `overlays[]` (titles, subtitles, call-to-action
  badges), burned in with the Inter typeface; text is written to an ASS file
  by the worker and stripped of markup. With feature `overlay_layout`, an
  overlay can also give `y` (0.04–0.96, the height of its centre in the frame,
  in place of `position`) and `backing`: `outline` (the default, as before),
  `halo` (a soft dark glow that keeps text readable over busy footage) or
  `box` (a solid panel; a call-to-action badge keeps its own)
- a brand's look (feature `brand_text`): `fonts[]` of `source_index` (a
  TrueType or OpenType file in role `font`) and `family`; the file is put in a
  fonts directory the subtitle renderer reads and the text is set in the family
  the file names itself by. `captions` and each overlay can then give `font`
  (one of those families; Inter without), `color` (#rrggbb, the text) and
  `accent` (#rrggbb: a box's colour, a call to action's badge, bold captions'
  text). A brand font is set as it was drawn, never made bolder
- `images[]` (feature `image_overlays`): pictures laid over the edit, such as
  a logo: `source_index` (an `image` source), `start`, `end`, `x` / `y` (0–1,
  where its centre sits), `width` (0.03–1 of the frame's width; its height
  follows its shape), `opacity` and `fade` (seconds in and out; 0 shows it
  from its first frame to its last). A PNG keeps its transparency; a GIF is
  read for its first frame. Each is decoded and scaled once, then held. They
  go under the text and the edit's fades
- `frame_rate_conversion` (feature `frame_rate_conversion`): how a clip made
  at another rate (24 fps B-roll in a 30 fps edit) is brought to the edit's:
  `duplicate` (frames repeated, as before), `blend` (neighbouring frames
  mixed) or `motion` (frames made from the movement between them, at the
  source's own size, no larger than the edit's frame; several times slower).
  Only a clip with fewer frames than the edit needs is given new ones: one
  at the edit's rate (or within 1.5% of it) or above is only re-timed. `upscale: "sharp"` scales pictures with Lanczos and a
  light unsharp mask, for 720p clips in a 1080p edit
- `mix` (feature `channel_mix`): channel levels, each 0–2 and 1 when left
  out, that scale a whole sound bus before the final mix on top of the items'
  own volumes: `picture` (the clips' own sound), `voiceover`, `music` and
  `sfx`. A channel at 0 is left out of the render altogether
- `fade_in` / `fade_out` from and to black, and `normalize_loudness`
  (two-pass EBU R128 to `loudness_lufs`, default −14 LUFS). Loudness is
  evened out after the mix, so channel levels set the balance between the
  channels, not the final loudness

Timings are snapped to the frame grid, so the output has exactly the planned
number of frames. Clips are normalised one at a time, which keeps memory flat
for long timelines.

## Long videos: true last frames and seamless joins

A long video chains generated clips: each clip after the first is generated
from the frame the one before ends on, and the Editor joins them back into
one shot. Two capabilities make the joins seamless:

- **`extract_frames` with `"frame": "last"`** takes a clip's true last frame,
  found by decoding and counting its frames (never from the container's
  duration or a timestamp, which can be offset, rounded, or run on with the
  sound). It is lossless PNG unless `"format": "jpg"` is asked for, at the
  clip's own size unless `width` differs. A tail frozen on one picture (after
  a clip that was moving) or fading to black or white is left out, up to
  0.75 s. The result's `metadata` reports `frame_mode: "last"`, `frame_count`,
  `frame_index` (0-based, the frame taken), `frozen_frames`, `faded_frames`,
  `fps`, `clip_duration_seconds` (frames ÷ rate) and `motion`: how the camera
  was moving over the clip's last second (`moves` such as `push_in`,
  `pull_out`, `pan_left`, `pan_right`, `tilt_up`, `tilt_down`, each `slow`,
  `steady` or `fast`), which the app tells the next clip so it carries the
  move on instead of starting from rest. An app sends `times_seconds` with it
  too, so a worker without this mode still takes a frame (by time).
- **`render_sequence` clips with `"match_previous": true`** carry straight on
  from the clip before. The clip's colour is matched to the last frame the
  clip before shows, compared with this clip's frame of the same moment (the
  one before its first, when it skips its copy of the handoff frame), and
  eases back to its own over 2.5 s, in steps too small to see. The match is
  made on the picture's own planes (`lutyuv`, rounded), so nothing is
  converted, and only the frames it eases over are touched: the rest of the
  clip is bit for bit itself. Only mid-tones are compared, shifts are capped,
  and nothing changes unless both frames show the same picture. The render's
  metadata lists the joins matched (`seams_matched`).
- **`render_sequence` clips with `"join": "smart"`** (feature `smart_join`;
  send `match_previous` too, so a worker without it still matches colour)
  put the join back in register. A clip generated from the frame another
  ends on re-renders that frame, and video models fit their start image to
  their own working size, so the picture comes back stretched by a few
  percent from a corner (showing a little more on one side), lighter or
  darker, and softer. The two frames of the shared moment are compared once
  in register (`src/align.js`: an affine map with a gain and offset, fitted
  coarse to fine by Gauss-Newton with robust weights, on frames about 480 px
  along their longer side), and each difference is put right:
  - framing: the clip is warped onto the frame before (`perspective`) and
    the warp eases off over 1.5–8 s, slowly enough not to be seen drifting
    (at most 0.8% of the frame a second). A warp only samples picture its
    clip has: where the clip lacks part of the one before, the clip before
    eases into the framing they share over its last moments instead (in the
    final pass)
  - colour: matched as above, on the frames in register
  - detail: the clip's first frame shown is sharpened (or softened) to the
    clip before's (`unsharp`, the amount solved from a Laplacian measure of
    the frames as they will be shown), easing off with the colour
  - sound: the clips' own sound meets at a cut with a 10 ms fade each side

  Nothing changes unless the frames are the same picture once in register,
  and a fit that doesn't clearly improve how alike they are, or that is
  larger than a re-render can be, is not used. The render's metadata lists
  each smart join (`smart_joins`: `matched`, `likeness_before` /
  `likeness_after`, `framing` with the measured `scale_x`, `scale_y`,
  `shift_x`, `shift_y`, how much of the frame it `moved` and the ease
  seconds each side, `colour`, `detail`, or `left` with why nothing was
  done).

`probe` also reports `video_duration_seconds`, the picture's own length.
`/health` lists `last_frame`, `seam_match` and `smart_join` among its
`features`.

## Reframing

`reframe_video` (and `resize_image` with a `height`) lays a picture out in a
`width` × `height` frame without changing it: `mode` `cover` fills the frame,
cropping around `focus_x` / `focus_y` (0–1 across and down, the centre unless
given); `contain` shows it whole on `background` (a `#rrggbb` colour, black
unless given); `blur_pad` shows it whole on a blurred copy of itself.
`/health` lists `features` (`frame_focus`, `frame_background`) so the app only
offers what the deployed worker can do.

## Voiceovers that drive lip sync

A clip generated from a voiceover (Wan's "driving audio") moves its lips to
that sound, so the edit has to put the same sound under it at the same moment.
Three things make that exact rather than close:

- `prepare_audio` (one audio or video source, two outputs) turns any voiceover
  into the canonical file every time is then measured in: 48 kHz mono 16-bit
  PCM WAV with nothing in its header but format and sound (a WAV has no encoder
  delay or priming, which MP3 and M4A each handle their own way). The second
  output is a 16 kHz mono copy for transcription. `metadata` has the exact
  length (`samples`, `sample_rate`, `duration_seconds`), where the speech is
  and the pauses between (`speech`, `pauses`, as `[start, end]` seconds,
  found against the recording's own noise floor; `clear_pauses` is false when
  speech can't be told from the rest), levels, and a 25-per-second waveform.
  A voiceover runs at most ten minutes, an edit's length.
- `measure_sync` (a `video` source and an `audio` source, no output) matches a
  generated clip's own sound against the voiceover piece it was made from and
  reports where the speech landed: `offset_seconds` (positive: later in the
  clip, counted from the clip's first picture), `confidence`, `margin` (how far
  the match stands out), `waveform_correlation` (high when the clip kept the
  sound as given, low when the model voiced it anew) and `drift_seconds`
  (first against last third). `status` is `measured`, `unclear`, `no_audio` or
  `no_speech`. Speech envelopes are matched to the millisecond, then the
  waveforms to the sample where they still agree. `max_lag_seconds` (default
  1, at most 2) bounds how far either way it looks.
- `extract_frames` with `frame: "index"` and `index` takes a frame by its
  number (counted by decoding, as for `frame: "last"`): where a clip is cut at
  its piece of the voiceover, the next clip starts from the frame that would
  have come next.

`/health` lists them as `audio_prepare`, `audio_sync` and `frame_index`.

## Lip scores

`lip_check` (a `video` source and, optionally, the `audio` piece it was made
from; no output) scores how well a clip's lips follow the voice with SyncNet
(`lipcheck/syncnet_score.py`, run in its own Python; see `tools/qc/README.md`
to run it by hand). `params`: `duration_seconds` (score only the clip's first
part, the length of its piece of the voiceover) and `window_seconds` (1–30,
default 3). `metadata.status` is `scored`, `no_face` or `no_speech`; a scored
clip has `offset_frames` (at 25 fps; negative: the lips lead the sound),
`confidence` at that offset and `confidence_at_zero` (where the clip actually
sits), `min_distance`, and the same per window in `windows[]`. From the same
face landmarks (`lipcheck/face_qc.py`) it reports `framing` (`eye_span_px`
and `eye_span_frac`, the span between the outer eye corners; `eye_span_spread`,
how much it changes within the clip; `face_x` / `face_y`, where the face sits)
and `silence` (`silent_seconds` judged and `mouth_open_fraction`, the share of
those frames whose mouth is open, with the worst `spans`). The app flags a clip
framed unlike the run's first, a camera that pushes in, and a mouth moving
through the pauses. Real,
well-synced speech scores about 6 to 8; under about 3 the lips don't follow at
all. The app flags a clip under 6.5, makes it again under 4, and takes out a
confident lead of up to three frames when it lays the clip.

The scorer is optional. The image builds it by default (`LIP_CHECK=1`); build
with `--build-arg LIP_CHECK=0` to leave it out (a much smaller image). The
SyncNet weights must match the checksum of the copy first deployed
(`SYNCNET_SHA256`; the build prints the one it fetched, and
`--build-arg SYNCNET_SHA256=` takes any). If anything it needs can't be
fetched or doesn't match, the build still succeeds without it and prints
"lip_check could not be installed". A worker without its files doesn't list `lip_check`
in its features, and the app makes clips without scores.

## Takes that land on a picture, and a logo's clean plate

A video model re-renders the picture it is given, so a take that must land on an exact
picture (a logo's reveal ending on the logo) comes back a pixel or two off and a shade off
in colour. And it garbles lettering, so a logo is moved without its letters and they are
laid back over the footage. These tasks do both (the app runs them as its clean-plate
recipe; Reel 1's logo was made this way).

- `align_take` (sources: the take, as `video`, and the picture it must land on; one MP4)
  registers the take's last frame on the picture (`anchor: "first"` for its first frame;
  an affine fit, as a smart join is put in register), then fits a gain and offset on each
  of the picture's planes (Y, U, V) from 24-pixel block averages of the two, never pixel
  against pixel, since the take is softer than the picture. Both are made on every frame;
  then the take crosses to the picture itself (`cross_seconds`, default 0.5, at most 3),
  which holds for `hold_seconds` (at least a frame after a cross). The picture sets the
  frame, so the take must be its shape (within 12%); `fps` re-times it; the take's sound is
  left out. `metadata.alignment` has the likeness before and after, the framing it undid
  (`scale_x`, `scale_y`, `shift_x`, `shift_y`), the colour match per plane, and how far the
  anchor frame was from the picture in levels of light, `before` and `after`. A frame that
  isn't the picture at all is left unmoved (`left: "different_pictures"`).
- `clean_plate` (sources: the art, and for the plate its image edit as `edit`; a
  transparent file of the lettering as `lettering`; one PNG) draws the lettering's mask
  from `boxes` (`[{x, y, w, h}]` in the art's pixels) and from the lettering file's alpha
  (placed at `lettering_rect`, the whole art unless given; alpha above `threshold`, 6),
  grown by `grow` pixels and feathered over `feather` (each 2% of the art's shorter side
  unless given). `output: "mask"` gives the mask; `"plate"` (the default) puts the edit in
  register with the art (fitted only where the lettering isn't) and lays it into the art
  only inside the mask, so every other pixel is the art's own, bit for bit. Its
  `metadata` reports the registration and `kept_difference_levels`: how far the edit
  strayed from the art where it was told to keep it.
- `lay_lettering` (sources: the take, in the art's framing, as `video`; the art; the
  lettering file as `lettering`; one MP4) lays the art's own letters back over every frame
  (`letters: "art"`: the art's pixels inside a tighter mask of the same `boxes` or the
  file's alpha) or the lettering file itself by its own alpha (`letters: "file"`), from
  `start_seconds`, fading in over `fade_seconds`. The take's sound is kept.

`/health` lists `align_take` and `clean_plate` (for both `clean_plate` and
`lay_lettering`) among its features.

## Screenshots with what they must not show blurred

A screenshot supplied as a reference (a client's portal, say) can show real people's
names, emails, phone numbers and addresses. The app finds them and a person checks the
boxes; this task blurs them in a copy.

- `redact_image` (source: the screenshot, PNG, JPEG or WebP, at most 8000 pixels a side;
  one PNG, or `format: "jpg"`) blurs inside each of `boxes` (`[{x, y, w, h}]` in the
  picture's pixels, at most 200): the picture there is broken into blocks most of the
  tallest box's height (`metadata.redaction.block`, at least 12 pixels), then blurred, so
  no letter survives to be read or recovered. Every pixel outside the boxes comes out
  exactly as it was. The boxes are numbers only: the text they cover never reaches the
  worker. `metadata.redaction.boxes` says how many were blurred.

`/health` lists `redact_image` among its features. It is a quick task, so a screenshot
isn't kept waiting behind a render.

## Configuration

Copy `.env.example`. The only required variable is
`MEDIA_WORKER_SHARED_SECRET` (minimum 16 characters), which must be identical
to the secret stored in the app's backend.

## Run

```bash
docker build -t xeno-media-worker .
docker run --rm -p 8080:8080 \
  -e MEDIA_WORKER_SHARED_SECRET="<same secret as the app>" \
  xeno-media-worker
```

Self-test the renderers (no network, no app required):

```bash
docker run --rm -e MEDIA_WORKER_SHARED_SECRET=0123456789abcdef \
  xeno-media-worker npm run selftest
```

Deploy anywhere that runs a container with FFmpeg and gives it a public HTTPS
address (Fly.io, Render, Railway, Cloud Run, a VM behind a proxy). Then set, in
the app's backend secrets:

- `MEDIA_WORKER_URL` — e.g. `https://media.example.com`
- `MEDIA_WORKER_SHARED_SECRET` — the same secret the worker runs with

Settings → Media service will then report the service as reachable and list the
tasks it offers.

On Fly.io (`fly.toml`), every push to `main` that changes `media-worker/` is
deployed by GitHub Actions (`.github/workflows/deploy-media-worker.yml`): the
image is built, self-tested and checked to start, and only then rolled out;
the job ends by checking the live worker reports the tested image's
`features`. It needs the repository secret `FLY_API_TOKEN`, a deploy token for
the app (`fly tokens create deploy -a xeno-media-worker`). Run it by hand from
the Actions tab (Deploy media worker → Run workflow). A machine restarted from
Fly's dashboard keeps the image it had; only a deploy brings new code.

## Sizing

FFmpeg is CPU bound. On Fly the worker runs on a `performance-4x` machine (four
dedicated vCPUs, 8 GB): Fly's shared vCPUs are throttled to a sixteenth of a
core each once their burst balance (at most about nine minutes of full speed)
is spent, which made long renders some fifteen times slower. Give the container
a writable `/tmp` at least twice the size of the largest job's sources plus
outputs.

**Not always on.** The worker exits after `IDLE_STOP_SECONDS` (600 on Fly, 0
elsewhere: keep running) with nothing running, queued or still being reported,
and its machine stops: a stopped machine is billed for its disk only. Fly's
proxy starts it again for the next request (`auto_start_machines = true`), in a
couple of seconds. Fly's own auto-stop stays off (`auto_stop_machines = "off"`),
because tasks are acknowledged with `202` and rendered afterwards, so the proxy
would take a machine mid-render for idle. A clean exit leaves the machine
stopped under the `on-failure` restart policy; a crash restarts it. While it
stops, a task is turned away with `503 WORKER_STOPPING`, and the app sends it
again a few seconds later, which starts the machine afresh. `/health` reports
`idle_stop_seconds`. The app remembers what the worker last said it can do
(its `/health`, or its answer to a task), so pages that only need its features
don't wake it; Settings → Media service → Re-check asks it live.

**Two lanes.** Renders and the other tasks that encode video run
`HEAVY_CONCURRENCY` (2) at once; probes, thumbnails, frames, image resizes and
audio run in their own lane, `QUICK_CONCURRENCY` (2) at once, so the frame a
long video's next clip starts from never waits behind a render. `/health`
reports both `lanes`. (`CONCURRENCY`, the old single setting, is still read as
the heavy lane's default.)

**Encoding.** A render's final pass is x264 `veryfast` at CRF 17. On a real
1080×1920 reel that looks the same as `medium` at CRF 19, the old setting for
edits up to 90 seconds (SSIM 0.9948 against 0.9947), in 2.65 times less time,
for files about a sixth bigger. Other video tasks encode MP4 with `veryfast` two
CRF steps below the one asked for. A render's intermediates, encoded again in
the final pass, are `superfast` at CRF 14 for edits up to five minutes (0.6 of
the time of `veryfast`, for files 1.7 times bigger) and `veryfast` beyond, to
stay within the task's disk. A render's clips that aren't joined to the one
before are prepared `CLIP_PARALLELISM` at a time (2 with four or more CPUs,
else 1); a joined clip waits for the one before it, which it is measured
against. The output is the same, bit for bit, either way.

Each FFmpeg step of a task may take `TASK_TIMEOUT_SECONDS` (900), except an
Editor render's (`render_sequence`), which may take `RENDER_TIMEOUT_SECONDS`
(43200, twelve hours): an edit runs up to ten minutes at up to 60 fps, two
renders at once, and the limit also covers a worker on throttled shared vCPUs.
A render's step that writes its output as it goes and writes nothing new for
`RENDER_STALL_SECONDS` (1200) has hung, and is stopped (`TASK_STALLED`), so a
stuck render doesn't hold its edit for the whole limit. `/health` reports these
`limits`.

Each source file is capped at `MAX_DOWNLOAD_MB` (1024), and all of one task's
sources together at `MAX_TASK_DOWNLOAD_MB` (2048): an edit can name dozens of
files, so a task past its budget stops downloading and fails with
`SOURCES_TOO_LARGE`. Everything a task keeps on disk at once (sources,
intermediates, the sound mix and its outputs) is capped at
`MAX_TASK_WORKSPACE_MB` (4096): past it, the task's processes are stopped and it
fails with `WORKSPACE_TOO_LARGE`. Renders also delete their sources and
intermediates as soon as they're done with them. Size `/tmp` for
`(HEAVY_CONCURRENCY + QUICK_CONCURRENCY) × MAX_TASK_WORKSPACE_MB`.
