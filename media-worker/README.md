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
frame. The app sends one source per distinct asset (role `video`, `image` or
`audio`) and a timeline in `params`:

- `width`, `height`, `fps` (24, 25, 30 or 60), default `fit` (`cover`,
  `contain`, `blur_pad`)
- `clips[]`: `source_index`, `kind` (`video`/`image`), `trim_start`,
  `duration`, `speed` (0.25–4), `volume` (the clip's own sound, 0–2), `fit`,
  `focus_x` / `focus_y` (0–1, where a `cover` crop sits; the centre unless
  given), `motion` for stills (`zoom_in`, `zoom_out`, `pan_left`, `pan_right`,
  `pan_up`, `pan_down`), `transition` into the clip (`type` from the xfade
  set or `cut`, `duration` up to 3 s; shortened when the clips are too short),
  `match_previous` (see below). A trim that falls on a frame is honoured to
  the frame: the seek starts a millisecond early so rounding never skips it
- `audio[]`: `source_index`, `role` (`voiceover`, `music`, `sfx`), `start`,
  `trim_start`, `duration`, `volume`, `fade_in`, `fade_out`, and for music
  `loop` and `duck` / `duck_level` (music dips wherever the voiceover actually
  speaks, found with silence detection)
- `captions` (`segments[]` of `start`/`end`/`text`, `style`, `position`,
  `size`, `uppercase`) and `overlays[]` (titles, subtitles, call-to-action
  badges), burned in with the Inter typeface; text is written to an ASS file
  by the worker and stripped of markup
- `fade_in` / `fade_out` from and to black, and `normalize_loudness`
  (two-pass EBU R128 to `loudness_lufs`, default −14 LUFS)

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
  eases back to its own over 2.5 s. The match is made on the picture's own
  planes (`lutyuv`), so nothing is converted and the clip is bit for bit
  itself once it has eased off; only mid-tones are compared, shifts are
  capped, and nothing changes unless both frames show the same picture. The
  render's metadata lists the joins matched (`seams_matched`).

`probe` also reports `video_duration_seconds`, the picture's own length.
`/health` lists `last_frame` and `seam_match` among its `features`.

## Reframing

`reframe_video` (and `resize_image` with a `height`) lays a picture out in a
`width` × `height` frame without changing it: `mode` `cover` fills the frame,
cropping around `focus_x` / `focus_y` (0–1 across and down, the centre unless
given); `contain` shows it whole on `background` (a `#rrggbb` colour, black
unless given); `blur_pad` shows it whole on a blurred copy of itself.
`/health` lists `features` (`frame_focus`, `frame_background`) so the app only
offers what the deployed worker can do.

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

FFmpeg is CPU bound. Two vCPUs handle `CONCURRENCY=2` comfortably for short
social-length clips. Raise `TASK_TIMEOUT_SECONDS` before rendering long
timelines, and give the container a writable `/tmp` at least twice the size of
the largest job's sources plus outputs.

Each source file is capped at `MAX_DOWNLOAD_MB` (1024), and all of one task's
sources together at `MAX_TASK_DOWNLOAD_MB` (2048): an edit can name dozens of
files, so a task past its budget stops downloading and fails with
`SOURCES_TOO_LARGE`. Everything a task keeps on disk at once (sources,
intermediates, the sound mix and its outputs) is capped at
`MAX_TASK_WORKSPACE_MB` (4096): past it, the task's processes are stopped and it
fails with `WORKSPACE_TOO_LARGE`. Renders also delete their sources and
intermediates as soon as they're done with them. Size `/tmp` for `CONCURRENCY ×
MAX_TASK_WORKSPACE_MB`.
