# Aurixa Systems · Teaser · _Three Questions_ · delivery

The teaser as rendered on 26 October 2026 from the approved script (v3), with its eight lines spoken in the brand
voice and "Soon." at the end. This is the final, and how it goes to the platforms.

## The final

Upload this file as it is: `aurixa-teaser-three-questions-1080x1920.mp4`. Don't export it again from an editor, and
don't compress it first. Each platform encodes it once on upload, and every encode before that softens it.

|           |                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------- |
| File      | 31,544,508 bytes, SHA-256 `3a9cca1a2c2c869b9d1ccc5a04aa089075516631935905598b05465ea296f311`             |
| Picture   | 1080 x 1920 (9:16), 30 fps, 1,125 frames, 37.5 s; H.264 High, level 4.2, progressive, BT.709, 6.5 Mbit/s |
| Sound     | AAC-LC, 48 kHz stereo, 257 kbit/s; -14.1 LUFS integrated, loudness range 4.9 LU, true peak -1.2 dBTP     |
| Container | MP4 with its index at the front, so an upload page can read it while it is still arriving                |
| Cover     | `cover-34.6s.jpg`, the name and its line, for platforms that take a cover image                          |

Both are in the studio work _Aurixa Teaser_, under `files/delivery`, with `qc.json`.

Every spoken word is on screen as it is said, so the teaser reads with the sound off. Where a platform offers its own
automatic captions, leave them off, or the words appear twice.

The final was measured against its lossless reference before delivery (`scripts/aurixa-teaser/qc.py`):

- SSIM 0.979 and PSNR 40.9 dB over the film. The lowest frames are in the dive, where thousands of street lines move
  at once; the lowest, at 7.07 s, differs from its reference by 1.25 code values on average, and an encode at three
  times the size scores the same there. SSIM reads small differences in a frame that dark as structure;
- no frame drawn apart from its neighbours, and no black frame;
- 1,125 frames, 37.5 s, the sound on the same clock as the picture from frame 0.

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
- **The score.** An original score made in the studio with Eleven Music to the plan's composition (96 BPM, D major)
  as the bed up to the held breath at 29.4 s. The three-note motif (D, F sharp, A: one note a question), the gap's
  unresolved notes, the riser, the hit and the chord that answers them are drawn on their exact frames.
- **The master.** -14 LUFS integrated with its true peak at -1 dBTP: gain, and a look-ahead limiter at four times the
  sample rate that touches only the peaks of a few spoken consonants and bell strikes.

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
