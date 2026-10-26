# Aurixa Systems · Teaser · _As One_ · delivery

The second teaser, rendered on 27 October 2026 from the client's reference video ([`REFERENCE.md`](../REFERENCE.md)):
its script word for word in the brand voice, dry, under _National Treasures_ exactly as the reference uses it, over a
picture of its own ([`PLAN.md`](./PLAN.md)). This is the final, and how it goes to the platforms.

## The final

Upload this file as it is: `aurixa-teaser-as-one-1080x1920.mp4`. Don't export it again from an editor, and don't
compress it first. Each platform encodes it once on upload, and every encode before that softens it.

|           |                                                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------- |
| File      | 35,113,820 bytes, SHA-256 `305f01cdb5986cb183cfeeaa63b14a5b3076ef1c41a85113247bedf39bb0f903`                         |
| Picture   | 1080 x 1920 (9:16), 30 fps, 1,365 frames, 45.5 s; H.264 High, level 4.2, progressive, BT.709, 5.9 Mbit/s             |
| Sound     | AAC-LC, 48 kHz stereo, 257 kbit/s; -14.0 LUFS integrated, loudness range 3.7 LU, true peak -2.3 dBTP                 |
| Container | MP4 with its index at the front, so an upload page can read it while it is still arriving                            |
| Cover     | `cover-as-one-44.5s.jpg`, the emblem, the name and its line; the emblem and the name hold in a 3:4 and a square crop |

Both are in the studio work _Aurixa Teaser_, under `files/delivery`, with `qc-as-one.json`, beside _Three Questions_'
files.

Every spoken word is on screen as it is said, so the teaser reads with the sound off. Where a platform offers its own
automatic captions, leave them off, or the words appear twice.

The final was measured against its lossless reference before delivery (`scripts/aurixa-teaser/qc.py`):

- **The encode keeps 0.994 of the picture it was given**: SSIM against the reference as the encoder received it,
  converted to BT.709 4:2:0, in that format (Y 0.994, U and V 0.995). Its lowest frame is at 12.27 s, where the
  dashboards turn edge-on at speed: 0.946 there, and 1.1 code values from the reference on average. Side by side at
  full size, and brightened, the two can't be told apart.
- **Against the RGB reference, the master scores SSIM 0.931 and PSNR 41.9 dB.** That is under the 0.97 _Three
  Questions_ was held to, and the reason is the format, not the encode. The same picture converted to 8-bit 4:2:0 with
  no encoder at all scores 0.961. The loss is in the red of the near-black hall (red 0.815; green 0.992, blue 0.986):
  where red is 0 to 3, a change of a code value or two is invisible, but SSIM reads it as lost structure. In the fog
  of the opening, the master differs from the reference by 0.9 code values on average. The check now holds the
  encode to the picture it was given, and the colour tags to BT.709, and reports all three figures.
- No frame is drawn apart from its neighbours, and no frame is black.
- 1,365 frames, 45.5 s. Decoded from the file, the sound lines up with the mastered sound to the sample: at the
  first word (0.56 s), at the drop (22.25 s) and on "one".

## The picture

One room, one camera, no cut: a hall of black marble in the dark, with a single beam of light at its centre. Each
thing that happens is what the line over it says.

- **The noise.** Software fills the dark around the beam as the voice lists it: windows, then dashboards, then a strip
  of tabs, the last one "AI". On "At a certain level of ambition", every pane turns edge-on and is gone.
- **The five.** Five glass cases stand in a ring around the beam. Each lights as it is named, with a hologram of its
  work inside and its name over it: research, clients, reports, finance, communication. They are powerful on their
  own, each sealed in its own light.
- **As one.** On the drop, gold light leaps from case to case, and the glass lifts away. A pulse runs between them,
  and the client's and the property's tags follow it (the brand kit's demo record, Jordan Ellis and 14 Wattle Grove,
  as the reels show it). On "one", on the bar, all five light at once.
- **The system.** "The next tool" is a sixth case, apart and empty, and its light goes out. The five draw together
  into the emblem's triangle, which becomes the emblem over the beam. Its lettering rises letter by letter, and the
  line rises under it.

From the reference it takes the beam rising in fog, the glass cases on black marble with holograms in them, the gold
lines between them, the serif line with its turn in gold, and the emblem standing at the end. The reference shows
these as separate shots; here they are one world.

The logo is the supplied art, placed and never redrawn. The words are the brand's Playfair Display, with the turn of
each line in gold italic, and the labels its Inconsolata capitals.

**How it was drawn.** The world is WebGL2 in Chromium, without a GPU. It is drawn in high dynamic range, with the
marble's reflection, bloom and a filmic tone map. Each frame is the average of four to eight drawings over a
180-degree shutter, each moved by a fraction of a pixel, so it is blurred as it moves and smooth at its edges: 6,752
drawings in all. The words are drawn at twice the frame's size and scaled down. Each frame was kept only once two
captures of it agreed. No frame failed to settle, and in every run whose record was kept, every frame agreed at the
first try.

The film was drawn on five machines, as Reels 2 and 3 were. This session drew frames 0 to 921, and four helper
sessions drew 922 to 991, 992 to 1101, 1102 to 1233 and 1234 to 1364, each in a work of its own under _Aurixa Teaser_.
Two frames of each helper's share were drawn here as well and matched to the bit, and the joined film holds them in
their places, again to the bit.

## The sound

- **The voice.** Gabby, the studio's brand voice (ElevenLabs), reads the reference's 95 words in one take through Xeno
  Studio's `generate_voiceover`. The take is cut into its eleven sentences in its own silences and laid in three runs,
  each as read; only the silences between the runs are set:
  - sentences 1 to 5 end 0.2 s before the drop, so "Powerful on their own." is heard alone in the bar where the
    track falls silent;
  - sentence 6 starts 0.7 s after the drop;
  - sentences 7 to 11 are placed so that "one" lands on the bar.
- **Dry.** The voice has no reverb, no compression and no EQ but a 70 Hz high-pass. Its phrase ends fall 15.9 dB
  within 40 to 90 ms, as the take's own do (15.7 dB), and as the reference's voice does (15.0 dB). _Three Questions_'
  voice, through the reverb the client heard as too wet, fell 8 dB.
- **_National Treasures_, as the reference uses it.** It runs from its first sample, uncut and unstretched, every band
  at the same gain:
  - -1 dB to the drop at 22.25 s;
  - easing from -1.5 to -4 dB by 42 s;
  - faded out from 43.95 s at 12 dB a second, as the reference fades it.

  Nothing is ducked under the voice, as in the reference. The voice sits 4.9 LU over the music through the intro.

- **The master.** -14 LUFS integrated, with its true peak held under -1 dBTP; after AAC it measures -2.3 dBTP.

## Before it runs publicly

- **The music's licence.** _National Treasures_ is Drake's commercial recording. The studio records it as owned by the
  brand, and its licence for public use is still to confirm, as for the reels. Before the teaser is posted, confirm
  that Aurixa holds the right to use it in a promotional video on each platform it goes to. Without that, a platform
  may mute it or take the video down.
- **ElevenLabs' plan.** The voice is the client's ElevenLabs voice, so the account's plan must cover commercial use,
  including ads.
- **The compliance review**, if the teaser is held to it. It shows no figure: the finance hologram is a gauge with no
  number on it. It makes no claim beyond the reference's own words.

## Where things are

| What                                   | Where                                                                                                                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The final, cover and QC                | The studio work _Aurixa Teaser_ (`9dd41db4-0e2f-4f25-8a6f-0f7eb0c6a6a5`), `files/delivery`                                                                                   |
| The soundtrack                         | The same work, `files/sound-as-one`: the take, the stems, the mix, the master and `cues.json`                                                                                |
| The page and its textures              | The same work, `files/film-as-one` and `files/textures-as-one`                                                                                                               |
| The lossless film                      | This session's three runs, frames 0 to 921, in the same work under `files/runs-as-one` with the order to join them; the helpers' shares in their own works, `files/frames-*` |
| The helpers' works                     | Children of _Aurixa Teaser_: `80c9cfb3…`, `0f968b6e…`, `2e7eedd6…` and `b1910b14…`                                                                                           |
| The plan, the reference and its script | `docs/brands/aurixa-teaser/as-one/PLAN.md`, `docs/brands/aurixa-teaser/REFERENCE.md`, `reference-words.json`                                                                 |
| The renderers                          | `scripts/aurixa-teaser/as-one/`; its README says what each does                                                                                                              |
