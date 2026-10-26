# Aurixa Systems · Teaser · the client's reference video

On 27 October 2026 the client sent a reference teaser and asked for a new one: a slightly different concept that takes what
it can from the reference's pictures, under _National Treasures_ exactly as the reference uses it, in the brand voice
made dry, speaking the reference's script word for word. This note records what the reference holds, measured with
`scripts/aurixa-teaser/reference/`.

The reference: 45.5 s, 478 x 850 (9:16), 30 fps, H.264, with AAC at 48 kHz stereo.

## Its soundtrack

- **_National Treasures_ (instrumental), from 0.000 s, uncut.** The track as the reels use it (asset `221832d4…`) lines
  up with the reference at a lag of 0 samples. Cancelled bin by bin (`separate.py`), it leaves -45 to -72 dB wherever
  only the music plays, so nothing in it was cut, stretched or replaced.
- **Its level** (`ntgain.py`, the reference's gain against the track itself, each band alike, so no EQ):
  - -1 dB until the drop at 22.25 s;
  - from the drop, a steady ease from -1.5 to -4 dB by 42 s;
  - a fade over the last 1.5 s (-7 dB at 44.2 s, -11 dB at 44.6 s, about -18 dB at 45.1 s).
- **No ducking.** The track's level does not dip under the voice.

## Its voice

- **One continuous voiceover**, female, from 0.02 to 44.10 s: 23 phrases, 31 s of speech and about 141 syllables, which
  is roughly 100 to 120 words (`phrases.py`).
- **Very likely Gabby, the voice the studio already uses.** Its pitch (median 235 Hz, middle half 216 to 267 Hz) and
  pace (4.49 syllables a second while speaking) are within 2% of Gabby's takes for _Three Questions_ (239 Hz, 219 to
  267 Hz; 4.52 a second).
- **Dry.** Its phrase ends fall 15 dB within 40 to 90 ms, a figure held up by what is left of the music under it.
  - Gabby's dry takes fall 19 dB.
  - _Three Questions_' voice stem falls only 8 dB, because `sound.py` put the voice through a reverb (RT60 0.9 s,
    12% wet).
  - The client heard that reverb as too wet. The new teaser's voice has none, like the reels.

| #   | From (s) | To (s) | Length (s) | Syllables (approx.) | What is known of it                                       |
| --- | -------- | ------ | ---------- | ------------------- | --------------------------------------------------------- |
| 1   | 0.02     | 2.72   | 2.70       | 10                  |                                                           |
| 2   | 2.91     | 4.29   | 1.38       | 6                   |                                                           |
| 3   | 4.84     | 6.72   | 1.88       | 7                   |                                                           |
| 4   | 6.90     | 7.02   | 0.12       | 1                   |                                                           |
| 5   | 7.25     | 9.14   | 1.89       | 8                   |                                                           |
| 6   | 9.52     | 11.83  | 2.31       | 10                  |                                                           |
| 7   | 12.41    | 14.22  | 1.81       | 7                   | "At a certain level of ambition," (on screen, 12.5 s)     |
| 8   | 14.42    | 15.56  | 1.14       | 4                   | "the question changes." (on screen, 14.5 s)               |
| 9   | 16.29    | 17.02  | 0.73       | 3                   |                                                           |
| 10  | 17.35    | 17.99  | 0.64       | 4                   |                                                           |
| 11  | 18.27    | 18.71  | 0.44       | 2                   |                                                           |
| 12  | 19.28    | 19.99  | 0.71       | 2                   |                                                           |
| 13  | 20.31    | 21.19  | 0.88       | 3                   |                                                           |
| 14  | 21.59    | 22.90  | 1.31       | 3                   |                                                           |
| 15  | 23.42    | 27.03  | 3.61       | 16                  |                                                           |
| 16  | 27.48    | 29.36  | 1.88       | 5                   |                                                           |
| 17  | 29.69    | 31.28  | 1.59       | 7                   |                                                           |
| 18  | 31.76    | 33.76  | 2.00       | 8                   |                                                           |
| 19  | 34.35    | 36.47  | 2.12       | 7                   | begins as "NOT ANOTHER TOOL" appears (34.5 s)             |
| 20  | 36.78    | 38.53  | 1.75       | 7                   | begins as "BUILT FOR WHAT COMES NEXT." appears (37.3 s)   |
| 21  | 38.73    | 39.96  | 1.23       | 6                   |                                                           |
| 22  | 40.32    | 41.42  | 1.10       | 5                   | "Aurixa Systems." (on screen, 40.4 s)                     |
| 23  | 41.79    | 44.10  | 2.31       | 8                   | "A new operating standard is coming." (on screen, 41.9 s) |

Syllables are counted as peaks in the speech band's level, which runs a little under the true count.

## Its words on screen

Every third frame was read at twice its size (`ocr_ref.py`). This is all the text it shows:

| From   | Text                                                                                       | Set in                                    |
| ------ | ------------------------------------------------------------------------------------------ | ----------------------------------------- |
| 12.5 s | "At a certain level of ambition," / "the question changes." (the second line at 14.5 s)    | serif, the second line gold; until 17.0 s |
| 34.5 s | "NOT ANOTHER TOOL"                                                                         | small spaced gold capitals; until 36.8 s  |
| 37.3 s | "BUILT FOR / WHAT COMES NEXT." / "The operating system for modern property professionals." | white sans capitals over a small line     |
| 40.4 s | "Aurixa Systems."                                                                          | serif                                     |
| 41.9 s | "A new operating standard is coming."                                                      | small sans                                |

The logo art (the emblem with AURIXA SYSTEMS) is on screen in a display case from 14.7 to 20.2 s, and on a pedestal on the
end card from 37.3 s.

## Its pictures

| Time           | Picture                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 0 to 2.5 s     | a single vertical beam of light rising in fog out of the dark                                                                         |
| 2.5 to 12 s    | glass display cases on black marble, each holding a hologram: a wireframe cube, a constellation sphere, stacked layers, a glass globe |
| 12 to 17.5 s   | dark obelisks between the cases; the first words; the logo inside a case                                                              |
| 17 to 22.5 s   | gold laser lines crossing between the cases and obelisks                                                                              |
| 23 to 25.5 s   | the drop: dark pillars, a gold vertical light, clouds below                                                                           |
| 26 s           | black                                                                                                                                 |
| 26.5 to 34.5 s | a corridor of glass pavilions with holographic dashboards, over a gold grid of lines and nodes in the floor                           |
| 34.5 to 37 s   | "NOT ANOTHER TOOL" in the dark; a beam, and the emblem rising                                                                         |
| 37.5 to 45.5 s | the end card: the emblem on a pedestal before a city of light, the words above and below it                                           |

## What is still needed

The spoken script, word for word. Only phrases 7, 8, 22 and 23 are certain from the screen, and 19 and 20 begin with
the words that appear as they are spoken. The other 17 phrases, roughly 85 words, can only be taken from the sound. The
reels' voiceovers were transcribed on this machine with NVIDIA's Parakeet in sherpa-onnx
(`scripts/aurixa-reel-3/transcribe.py`). This time, installing it was refused as code from outside the project, so the
script waits on either:

- the client's word to install it again; or
- the script's text from the client.
