# Aurixa Reel 2: scripts

The scripts behind [Reel 2's plan](../../docs/brands/aurixa-reel-2/PLAN.md). Reel 1's scripts
([`scripts/aurixa-reel-1`](../aurixa-reel-1/README.md)) are copied in here as the reel's pages,
scenes and render are built.

| Script            | What it does                                                                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shot_times.py`   | The shots on the voice's clock: each cut from the voiceover's words, by Reel 1's rule, with each shot's words as the script spells them. Fails if the script and the voice disagree                                                  |
| `transcribe.py`   | The voiceover's words and times, from NVIDIA's Parakeet TDT 0.6B v2 (int8) in sherpa-onnx, run locally                                                                                                                               |
| `refine.py`       | Each word's end clipped to the silence measured in the audio, and the sentences; writes `voiceover-words.json`                                                                                                                       |
| `same_voice.py`   | Whether two recordings are one voice: speaker embeddings (WeSpeaker ResNet34, VoxCeleb) of 10-second windows, compared across the two files and within each                                                                          |
| `score.py`        | The score's bars, and the composition plans that ask Eleven Music for them; makes a take through the studio's `generate_music`, and measures how a take keeps the plan's bars                                                        |
| `structure.ts`    | A take's beats, bars and sections, found by the Editor's own analysis (`src/lib/music/structure.ts`, the Music panel's "Find bars and sections")                                                                                     |
| `pacing.py`       | The voiceover held open in its silences so the cuts land on the score's beats and its anchors on their bars; writes `pacing.json`, and the paced voiceover                                                                           |
| `soundtrack.ts`   | The soundtrack, laid out as a studio edit's audio and mixed by the media worker's own code to -14 LUFS, with the studio's own mix report; writes `soundtrack.json`                                                                   |
| `render.cjs`      | The film, a run of shots at a time: each frame drawn eight times over a 180-degree shutter at twice its size, each drawing kept once two captures of it agree; writes the master, a lossless reference and `film.json`               |
| `render_queue.sh` | The whole film through `render.cjs`, one scene's run at a time, carrying on after a restart                                                                                                                                          |
| `verify_run.py`   | A run settled by agreement: frames drawn again independently, further draws voting where two disagree, the run's lossless reference rewritten where a vote replaces a frame; `compare` checks another machine's frames against a run |
| `film_qc.py`      | A rendered stretch measured against its own lossless reference: streams, SSIM and PSNR, colour (CIEDE2000), sharpness, banding, caption and cut timing, the sound's offset; Reel 1's, on Reel 2's brief                              |
| `review_sheet.py` | Contact sheets of a render, one row a shot: each beat half a second in, and the shot's last frame                                                                                                                                    |

## Running them

`shot_times.py` needs only Python 3:

```sh
python3 -I scripts/aurixa-reel-2/shot_times.py
```

The other three need sherpa-onnx and two models, kept outside the repository. In a virtual
environment with `sherpa-onnx`, `numpy` and `soundfile`:

- the recogniser,
  `sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2` from sherpa-onnx's `asr-models` release on
  GitHub;
- the speaker model, `wespeaker_en_voxceleb_resnet34_LM.onnx` from its
  `speaker-recongition-models` release (the tag's spelling).

Each reads 16 kHz mono WAV:

```sh
ffmpeg -i voiceover.mp3 -ac 1 -ar 16000 -c:a pcm_s16le voiceover-16k.wav
python -I transcribe.py <parakeet dir> voiceover-16k.wav transcript.json
ffmpeg -hide_banner -nostats -i voiceover-16k.wav -af silencedetect=noise=-38dB:d=0.18 -f null - 2>&1 \
  | grep -E "silence_(start|end)" | sed 's/.*silencedetect @ [^]]*\] //' | paste - - > silences.txt
python -I refine.py transcript.json silences.txt voiceover-words.json
python -I same_voice.py wespeaker_en_voxceleb_resnet34_LM.onnx reel1-16k.wav voiceover-16k.wav
```

These times are provisional. Once the voiceover is imported into the studio, its own preparation
measures the words, they replace `voiceover-words.json`, and `shot_times.py` is run again on them.

## The music and the sound

The score was made for the film with Eleven Music v2.5, through the studio's own `generate_music`,
as a composition plan: eleven sections, each a whole number of bars at 120 BPM, starting on the
bars the film needs (`score.py`'s `LANDMARKS`). Each take is measured by the Editor's own bar
finder before anything is chosen:

```sh
python3 -I scripts/aurixa-reel-2/score.py plan b                      # the plan, as the studio sends it
python3 -I scripts/aurixa-reel-2/score.py make 33 <takes dir> b       # one take (billed in ElevenLabs credits)
python3 -I scripts/aurixa-reel-2/score.py measure <takes dir>/take-seed-33.mp3
```

Three takes were made on 24 October 2026. Plan A's (seed 11) kept the tempo but spent its short
sections on the way in: its drop came a bar late and its breakdown ran on for seven bars. Plan B
says each change on its section's first beat; both its takes drop exactly on bar 11, and take 33
(120.005 BPM, its 239 beats on one grid to 0.3 ms) is the score. None played the stabs, so
`pacing.py` builds them from the take's own ending.

The film is paced to the take, the voiceover held open to match, and the soundtrack mixed:

```sh
python3 -I scripts/aurixa-reel-2/pacing.py                    # pacing.json; then brief.py for the paced brief
python3 -I scripts/aurixa-reel-2/pacing.py --table            # where every cut and anchor lands
python3 -I scripts/aurixa-reel-2/pacing.py --voiceover <voiceover 44.1 kHz 16-bit WAV> <dir>/voiceover-paced.wav
ffmpeg -i take-seed-33.mp3 -ar 48000 -ac 2 -c:a pcm_f32le <dir>/music.wav
bun scripts/aurixa-reel-2/soundtrack.ts <dir>                 # soundtrack.wav, stems, and soundtrack.json
```

The voiceover is decoded from the client's MP3 by ffmpeg, as it was for its word times.

## Rendering the film

`render.cjs` draws a run of shots at final quality: each frame drawn eight times over the open half of
its 1/30 s (a 180-degree shutter) at twice the frame's size, then scaled down. It writes the master
(`film.mp4`), the same frames losslessly (`reference.mkv`) and `film.json`.

Each drawing is kept only once two captures of it in a row agree. Chromium can hand back a capture a
moment before every tile in it is painted, even with every compositor stage run before drawing. The first
proof showed it as the camera pushed in on the Passport's closed cover (04.2): the leaves beneath showed
through the cover in hard-edged rectangles on about half of fifty frames, and once a caption word was
caught a step behind. Which drawings it hits changes from run to run, and a larger tile budget does not
stop it. `film.json`'s `settle` names the frames whose drawings had to be captured again, and any that
never settled.

`render_queue.sh` draws the film one scene's run at a time, so a restart loses one run at most; run it
again and it carries on. Reel 1's `assemble.py` joins the runs frame for frame and encodes the master
once from the joined reference, with the soundtrack under it:

```sh
scripts/aurixa-reel-2/render_queue.sh <runs dir> <assets dir> <soundtrack.wav> [04.1:04.3 ...]
python3 scripts/aurixa-reel-1/assemble.py <film dir> <soundtrack.wav> <runs dir>/*/
python3 scripts/aurixa-reel-2/film_qc.py <film dir> --voiceover <soundtrack.wav> [--export]
python3 scripts/aurixa-reel-2/review_sheet.py <film dir> <sheets dir>
```

One run on its own, or a few frames to look at (`RENDER_FRAMES`, PNGs; `none` draws without sound):

```sh
NODE_PATH=/opt/node-tools/node_modules node scripts/aurixa-reel-2/render.cjs <dir> <assets dir> <soundtrack.wav> 04.1 04.3
RENDER_FRAMES=1500,1520 NODE_PATH=/opt/node-tools/node_modules node scripts/aurixa-reel-2/render.cjs <dir> <assets dir> none 04.1 04.3
```

Most of a drawing's time is Chromium's software compositor, and the check adds a capture to each: on a 4-CPU
machine the Passport scene, the heaviest, draws at about 12 s a frame.

`RENDER_WORKERS` (default 3) browsers draw side by side, and each is started again every `RENDER_RECYCLE`
(default 40) of its frames. In the platform scene's tilt (03.3) a browser grows to 4.4 GB, and one left to
run was ended for memory part-way through the scene.

### Verifying a run

The check makes a capture race unlikely; agreement shows a run is free of one. `verify_run.py pick` names
every frame the check had to capture again, its neighbours and a seeded sample of the rest, to be drawn
again independently. `settle` puts each of them to the vote, and replaces a frame only where two draws
agree and the run is not one of them. Two sound draws differ at most where Chromium painted a scaled page
at a different scale: letter and image edges, measured at up to 708 pixels off by more than 12 code values.
A caption word a step behind measured over a thousand, and a hole over 175,000, so `verify_run.py` draws
the line at 900.

```sh
python3 -I scripts/aurixa-reel-2/verify_run.py pick <run dir>
RENDER_FRAMES=<those frames> NODE_PATH=/opt/node-tools/node_modules node scripts/aurixa-reel-2/render.cjs <redraw dir> <assets dir> none <first> <last>
python3 -I scripts/aurixa-reel-2/verify_run.py settle <run dir> - 0 <redraw dir> [<another redraw dir> ...]
```

### On more than one machine

Another session in the same environment can draw a run. It pulls the render assets from the work
(`work.py pull --work <id> --only work/reel2-assets`; it never resumes the work), draws and verifies its
run, and keeps it in a work of its own (`work.py start ... --parent <id>`). The session that joins the
film pulls it back from there. The helper also draws three frames of a run already drawn here, and
`verify_run.py compare <run dir> <png dir>` holds them against that run, so the film is shown to be drawn
by one renderer whichever machine drew each scene.
