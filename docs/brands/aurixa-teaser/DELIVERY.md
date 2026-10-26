# Aurixa Systems · Teaser · _Three Questions_ · delivery

The teaser as rendered on 26 October 2026 from the approved script (v3), with its eight lines spoken in the brand
voice and "Soon." at the end, under the synthwave score the client asked for in place of the first, ambient one. This
is the final, and how it goes to the platforms.

## The final

Upload this file as it is: `aurixa-teaser-three-questions-synthwave-1080x1920.mp4`. Don't export it again from an
editor, and don't compress it first. Each platform encodes it once on upload, and every encode before that softens it.

|           |                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------- |
| File      | 31,563,036 bytes, SHA-256 `9821d4a0359bc5d6705f44dcec8ed5a85a64514542923d79bf6e12d0f2e281d7`             |
| Picture   | 1080 x 1920 (9:16), 30 fps, 1,125 frames, 37.5 s; H.264 High, level 4.2, progressive, BT.709, 6.5 Mbit/s |
| Sound     | AAC-LC, 48 kHz stereo, 261 kbit/s; -14.0 LUFS integrated, loudness range 3.5 LU, true peak -1.2 dBTP     |
| Container | MP4 with its index at the front, so an upload page can read it while it is still arriving                |
| Cover     | `cover-34.6s.jpg`, the name and its line, for platforms that take a cover image                          |

Both are in the studio work _Aurixa Teaser_, under `files/delivery`, with `qc-synthwave.json`. The first delivery,
the same picture under the ambient score (`aurixa-teaser-three-questions-1080x1920.mp4`), is kept beside it; it is
superseded.

Every spoken word is on screen as it is said, so the teaser reads with the sound off. Where a platform offers its own
automatic captions, leave them off, or the words appear twice.

The final was measured against its lossless reference before delivery (`scripts/aurixa-teaser/qc.py`):

- SSIM 0.979 and PSNR 40.9 dB over the film. The lowest frames are in the dive, where thousands of street lines move
  at once; the lowest, at 7.07 s, differs from its reference by 1.25 code values on average, and an encode at three
  times the size scores the same there. SSIM reads small differences in a frame that dark as structure;
- no frame drawn apart from its neighbours, and no black frame;
- 1,125 frames, 37.5 s, the sound on the same clock as the picture from frame 0. Decoded from the file itself, the
  score's first drop rises 24 ms after the first question's frame (7.5 s), the breath before the answer is silent
  (-69 dB), and the answer's hit rises at 30.000 s.

## The picture

Everything is drawn in code from data and the product's own pieces (`scripts/aurixa-teaser/`, its README says how):

- **The night and the city.** The Earth's night side from 900 km up, and Sydney at night in three plates of the
  same streets at 2.5, 7 and 18 px a km, all drawn from public data (below). One camera falls from the orbit to
  Banksia Rise without a cut: the orbit's picture is turned and sheared onto the city plates as it falls, so the
  streets that resolve are the ones it was falling toward.
- **The windows** hold the product's own screens on the demo record (Jordan Ellis, 14 Wattle Grove): the floor
  plan, the Compliance Passport closed and cropped below its maker's name, and the Borrowing Capacity card with the
  pointer waiting and nothing calculated. Both product screens carry DEMO WORKSPACE.
- **The logo** is the supplied art, placed and blended, never redrawn: Reel 1's living take of it (B1) under the
  supplied lettering. The letters rise one by one; each settles into the supplied letter, pixel for pixel.

Every frame was drawn at twice its size in Chromium and scaled down, with motion blur from drawings spread over a
180-degree shutter: eight a frame through the dive, one where the picture holds. All 3,612 drawings were kept only
once two captures of each agreed, and every one agreed at the first try.

## The sound

- **The voice.** The eight lines spoken by the studio's brand voice, Gabby (ElevenLabs, _Soft Young Australian_),
  through Xeno Studio's `generate_voiceover`, each placed on its beat and timed word by word.
- **The score.** Dark synthwave in the spirit of the reels' _National Treasures_, made in the studio with Eleven
  Music (`score_plan.py`, seed 2155). _National Treasures_ was measured first: B flat minor, a quiet intro of keys, then
  a drop about 15 dB louder whose weight is nearly all sub-bass. The score is in the same key at 96 BPM, so its bar is
  the picture's 2.5 s, and it was made long, in clear sections, then cut on its own bar lines under the picture as
  the reels cut _National Treasures_, nothing stretched:

  | Teaser         | The score                                                                                                                    |
  | -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
  | 0 to 22.5 s    | 12.5 to 35 s: the intro's build and riser, its drop (20 s) on the first question, its groove                                 |
  | 22.5 to 27.5 s | 40.625 s: the breakdown, under the gap                                                                                       |
  | 27.5 to 35 s   | 48.125 s: the second build's peak, its beat of silence as the held breath, the biggest drop (50.625 s) on the answer at 30 s |
  | 35 to 37.5 s   | 70 s: the beat stopped dead, its tail, under "Soon."                                                                         |

  Each join is a 30 ms crossfade ending 5 ms before its bar line, so each bar's attack is whole. The intro's build is
  3 dB nearer than the score has it, as the opening is the hook. Under each spoken line the score steps back, its mids
  10 dB and its bass 4, so the voice stays 10 to 19 dB clear of it where speech is heard.

- **The motif and the hits**, drawn on their frames in synthwave's own voice, with no bells: a pluck through a ping-pong
  echo as the pin's beam pulses; the three questions' notes as plucks as each line lands (B flat, D flat, F: the B flat
  minor chord, one note a question); a fall as the groove cuts out for the gap; gated stabs climbing as the triangle
  closes; an 808 hit on each drop; the chord struck on the answer; and the chord left ringing dark under "Soon.".
- **The master.** -14 LUFS integrated with its true peak at -1 dBTP: gain, and a look-ahead limiter at four times the
  sample rate that touches only the peaks of a few spoken consonants and the hits.

## Before it runs publicly

- **The map's credits**, in the post's description: _Map data: GeoNames (CC BY 4.0); GSHHG shorelines (Wessel and
  Smith, LGPL)._ NASA's Blue Marble, Natural Earth and NOAA's GLOBE land mask are public domain, and crediting them
  is courteous.
- **ElevenLabs' plan** must cover commercial use, for the voice and the score.
- **The compliance review**, if the teaser is held to it. It makes no claim and shows no figure, but it names the
  Compliance Passport and shows the Borrowing Capacity card.

## Where things are

| What                    | Where                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| The final, cover and QC | The studio work _Aurixa Teaser_ (`9dd41db4-0e2f-4f25-8a6f-0f7eb0c6a6a5`), `files/delivery`    |
| The plan and script     | `docs/brands/aurixa-teaser/PLAN.md`, `script.json`                                            |
| The renderers           | `scripts/aurixa-teaser/` (`film.sh` runs the film end to end; its README says what each does) |
