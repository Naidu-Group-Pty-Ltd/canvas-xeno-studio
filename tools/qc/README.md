# Quality checks for generated video

Tools for checking a cut by hand, the same way the studio checks it.

## Lip sync: SyncNet

The scorer is `media-worker/lipcheck/syncnet_score.py`. The media worker runs it for the
`lip_check` task (see `media-worker/src/lipcheck.js`), and it runs on its own for a person.

It scores how well a clip's lips follow a sound with SyncNet (Chung and Zisserman): the
best offset in frames at 25 fps (negative means the lips lead the sound), and the
confidence at that offset and at 0, where the clip actually sits. Real, well-synced speech
scores about 6 to 8; under about 3 the lips don't follow at all. The studio flags a clip
under 6.5 and makes it again under 4 (`src/lib/lip-sync/lip-check.ts`).

### Setup

- Python 3.11 with `torch` (CPU), `mediapipe`, `scipy`, `numpy` and `python_speech_features`.
  On Linux, MediaPipe also needs the `libgl1`, `libegl1` and `libglib2.0-0` packages.
- From [joonson/syncnet_python](https://github.com/joonson/syncnet_python) (MIT):
  `SyncNetModel.py`, and the weights `syncnet_v2.model` from its `download_model.sh`.
  Fetch the weights over https and follow redirects; plain http returns a redirect page.
- MediaPipe's `face_landmarker.task`:
  `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`

The media worker's `Dockerfile` installs all of this (and checks the files' checksums).
Point the scorer at the files with `SYNCNET_DIR` (holding `SyncNetModel.py` and
`syncnet_v2.model`) and `FACE_MODEL`, or lay them out next to it:
`../syncnet/` and `../models/face_landmarker.task`.

### Usage

```sh
# Each clip against its own sound, one line per clip:
python syncnet_score.py self c1=clip1.mp4 c2=clip2.mp4

# Each clip against a voiceover:
python syncnet_score.py voice.wav c1=clip1.mp4

# One clip as JSON (what lip_check reports), its first 8.2 s, in 3 s windows:
python syncnet_score.py --json --video clip.mp4 --audio piece.wav --duration 8.2 --window 3
```

Always check a metric with controls before trusting it. Two that worked: the same clip with
its audio delayed 320 ms should be found about 8 frames off at a similar confidence, and a
different line's audio should score about 1.

## Other checks worth doing by eye

- **Framing:** the presenter's eye span in pixels should stay steady across clips (it was
  136–153 px at 720p in the Aurixa job).
- **Text in generated frames:** dashboards and reports often come back with gibberish text.
  Step through B-roll frame by frame, or prompt for no text at all.
- **Mouth in silences:** the mouth should be closed and still wherever the voice pauses.

## Rendering an edit locally with the worker's own code

`renderSequence` in `media-worker/src/sequence.js` runs anywhere with FFmpeg. Give each
source a `role`, pass copies of the media (the worker deletes picture sources after the
first pass), and call `ffmpeg -nostdin` inside shell read loops.
