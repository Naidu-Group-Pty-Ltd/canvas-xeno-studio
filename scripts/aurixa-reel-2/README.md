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
