# Aurixa Reel 3: scripts

The scripts behind [Reel 3's plan](../../docs/brands/aurixa-reel-3/PLAN.md). Reel 2's scripts
([`scripts/aurixa-reel-2`](../aurixa-reel-2/README.md)) and Reel 1's are copied in here as the
reel's pages, scenes and render are built.

| Script              | What it does                                                                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transcribe.py`     | The voiceover's words and times, from NVIDIA's Parakeet TDT 0.6B v2 (int8) in sherpa-onnx, run locally                                                                                                                |
| `refine.py`         | Each word's end clipped to the silence measured in the audio, and the sentences; writes `voiceover-words.json`                                                                                                        |
| `second_opinion.py` | A second recogniser's reading, sentence by sentence: Whisper small.en (int8) in sherpa-onnx. Where the two disagree, the word is heard again before it becomes a caption                                              |
| `same_voice.py`     | Whether two recordings are one voice: speaker embeddings (WeSpeaker ResNet34, VoxCeleb) of 10-second windows, compared across the two files and within each                                                           |
| `shot_times.py`     | The shots on the voice's clock: each cut from the voiceover's words, by Reel 1's rule, with each shot's words as the script spells them. Fails if the script and the voice disagree                                   |
| `pacing.py`         | The voiceover held open in its silences so the cuts land on _National Treasures_' beats and its anchors on the track's own bars, at its own 128.99 BPM; writes `pacing.json`, the music's pieces, and the paced voice |

## Running them

`shot_times.py` and `pacing.py` need only Python 3:

```sh
python3 -I scripts/aurixa-reel-3/shot_times.py
python3 -I scripts/aurixa-reel-3/pacing.py --table    # every pause, and where every cut lands on the music
python3 -I scripts/aurixa-reel-3/pacing.py            # writes docs/brands/aurixa-reel-3/pacing.json
```

The speech scripts need sherpa-onnx and three models, kept outside the repository. In a virtual
environment with `sherpa-onnx`, `numpy` and `soundfile`:

- the recogniser, `sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2`, from sherpa-onnx's
  `asr-models` release on GitHub;
- the second recogniser, `sherpa-onnx-whisper-small.en.tar.bz2`, from the same release;
- the speaker model, `wespeaker_en_voxceleb_resnet34_LM.onnx`, from its
  `speaker-recongition-models` release (the tag's spelling).

Each reads 16 kHz mono WAV:

```sh
ffmpeg -i voiceover.mp3 -ac 1 -ar 16000 -c:a pcm_s16le voiceover-16k.wav
python -I transcribe.py <parakeet dir> voiceover-16k.wav transcript.json
ffmpeg -hide_banner -nostats -i voiceover-16k.wav -af silencedetect=noise=-38dB:d=0.18 -f null - 2>&1 \
  | grep -E "silence_(start|end)" | sed 's/.*silencedetect @ [^]]*\] //' | paste - - > silences.txt
python -I refine.py transcript.json silences.txt voiceover-words.json
python -I second_opinion.py <whisper dir> voiceover-16k.wav voiceover-words.json second-opinion.json
python -I same_voice.py wespeaker_en_voxceleb_resnet34_LM.onnx reel1-16k.wav voiceover-16k.wav
```

These times are provisional. Once the voiceover is imported into the studio, its own preparation
measures the words, they replace `voiceover-words.json`, and `shot_times.py` and `pacing.py` are
run again on them.

## The music

The final is cut to Reel 1's _National Treasures_, as the client asked for Reel 3. Reel 2's cut was
paced to a 120 BPM score and the track slowed 7.0% to fit it afterwards; this cut is paced to the
track itself, so nothing in the music is stretched. Its beat was measured for Reel 1
(`scripts/aurixa-reel-1/pacing.py`: one grid from 22 s to 200 s, 0.465141 s, rms 9.7 ms) and its
sections bar by bar for Reel 2 (`scripts/aurixa-reel-2/national_treasures.py`). `pacing.py` lays
the film on ten pieces of the track, each a whole number of bars, and holds the voiceover open in
its own silences until every anchor lands on its bar: both drops, the breakdown, the stop, the
biggest section, the three statements on the stop's bass hit, the closing card and the final
press. Each edit point sits 20 ms ahead of its bar's attack, and every clear attack where the fit
cuts the track is within 18.4 ms of the grid. Where a piece comes in out of quiet onto a bar the track
is already sounding, it enters on its bar line (the studio's `enter`), as Reel 2 learned.

## Rendering the film

`render.cjs` is Reel 2's renderer, unchanged except for its brief and scenes (`scenes/index.cjs`, in film order).
Each frame is drawn eight times over a 180-degree shutter at twice its size, and each drawing is kept once two
captures of it agree. `render_queue.sh` draws the film one scene's run at a time. `draw_runs.sh` draws the runs it is
given, then puts a sample of each run's frames to the vote. The sample is every frame the check captured again,
its neighbours and 5% of the rest, drawn again independently (`verify_run.py pick`, then `settle`), and drawn once
more where a vote is unresolved:

```sh
scripts/aurixa-reel-3/draw_runs.sh <runs dir> <assets dir> <fonts dir> 05.1:05.2 05.3:05.5
python3 scripts/aurixa-reel-1/assemble.py <film dir> <soundtrack.wav> <runs dir>/*/
```

### On more than one machine

A helper session in the same environment can draw a share of the film:

1. It pulls the render assets and the fonts from the work, without resuming it:
   `work.py pull --work <id> --only work/assets --only work/fonts`.
2. It starts a work of its own with `work.py start ... --parent <id>`.
3. It draws its runs into that work's folder with `draw_runs.sh`, under `work.py run`, and saves the work as done.

The fonts are the six web fonts plates.cjs caches in `os.tmpdir()`. `draw_runs.sh` copies them into the helper's
cache, so every machine sets the type from the same files. The joining session pulls each helper's runs back. It
then draws three frames of each run itself and holds them against that run with `verify_run.py compare <run dir>
<png dir>`. That shows one renderer drew the film, whichever machine drew each run.

### A change after a run was drawn

A change that reaches only some frames of a run already drawn is spliced in rather than drawn again whole. Those
frames are drawn two or more times on one machine, each draw its own render (`RENDER_FRAMES`), and
`verify_run.py splice <run dir> <first>-<last> <why> <draw dir> <draw dir>` replaces the run's frames with the answer
the draws agree on. It writes nothing unless every frame has one, keeps the run as it was beside the new reference,
and records the splice and its commit in the run's `film.json`. The frames either side of the splice are held
against the run with `compare`, which shows the change reached nothing else.

The covers over words the brand keeps out of frame (`scenes/page.cjs` COVERS, the agent card's "✓ Approved" in
`scenes/platform.cjs`) were spliced in this way. `ground_fit.py` fits each one to the screen's own ground.
