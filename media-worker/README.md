# Xeno media worker

A small, stateless rendering service for Xeno Studio: thumbnails, frame
extraction, trimming, transcoding, reframing, audio extraction/overlay and
timeline assembly. It is deliberately dumb — it renders what the app tells it
to and reports back. It holds no database access, no provider credentials and
no user session.

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
same scheme. Callback hosts have their own allow list, `CALLBACK_HOST_SUFFIXES`
(default `lovable.app,lovableproject.com`); add the app's custom domain there if it
uses one. The app's callback is idempotent, so the worker only repeats on
transport faults and `5xx`.

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

## Sizing

FFmpeg is CPU bound. Two vCPUs handle `CONCURRENCY=2` comfortably for short
social-length clips. Raise `TASK_TIMEOUT_SECONDS` before rendering long
timelines, and give the container a writable `/tmp` at least twice the size of
the largest job's sources plus outputs.
