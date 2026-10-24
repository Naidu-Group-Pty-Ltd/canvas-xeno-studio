# Aurixa Reel 2: scripts

The scripts behind [Reel 2's plan](../../docs/brands/aurixa-reel-2/PLAN.md). Reel 1's scripts
([`scripts/aurixa-reel-1`](../aurixa-reel-1/README.md)) are copied in here as the reel's pages,
scenes and render are built.

| Script          | What it does                                                                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shot_times.py` | The shots on the voice's clock: each cut from the voiceover's words, by Reel 1's rule, with each shot's words as the script spells them. Fails if the script and the voice disagree |
| `transcribe.py` | The voiceover's words and times, from NVIDIA's Parakeet TDT 0.6B v2 (int8) in sherpa-onnx, run locally                                                                              |
| `refine.py`     | Each word's end clipped to the silence measured in the audio, and the sentences; writes `voiceover-words.json`                                                                      |
| `same_voice.py` | Whether two recordings are one voice: speaker embeddings (WeSpeaker ResNet34, VoxCeleb) of 10-second windows, compared across the two files and within each                         |
| `score.py`      | The score's bars, and the composition plans that ask Eleven Music for them; makes a take through the studio's `generate_music`, and measures how a take keeps the plan's bars       |
| `structure.ts`  | A take's beats, bars and sections, found by the Editor's own analysis (`src/lib/music/structure.ts`, the Music panel's "Find bars and sections")                                    |
| `pacing.py`     | The voiceover held open in its silences so the cuts land on the score's beats and its anchors on their bars; writes `pacing.json`, and the paced voiceover                          |
| `soundtrack.ts` | The soundtrack, laid out as a studio edit's audio and mixed by the media worker's own code to -14 LUFS, with the studio's own mix report; writes `soundtrack.json`                  |

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
