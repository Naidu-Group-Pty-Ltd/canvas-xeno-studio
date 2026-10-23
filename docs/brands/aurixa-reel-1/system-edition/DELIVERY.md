# Aurixa Systems · Reel 1 · delivery

The revised third cut was approved on 23 October 2026. This is the final, and how it goes to the platforms.

## The final

Upload this file as it is: `aurixa-systems-reel-1-final-1080x1920.mp4`. Don't export it again from an editor, and don't compress it first. Each platform encodes it once on upload, and every encode before that softens it (the Editor's export, measured on the proof, came out softer than the renderer's master).

|            |                                                                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File       | 199,593,310 bytes, SHA-256 `d07725545be361ef603dadb346f7f8bc174486157f444d495523fcfe1dd04d95`                                                                   |
| What it is | The renderer's master: the third cut of 22 October with 12.1's listing photographs and 03.1's waiting clock spliced in (`splice-12.1.json`, `splice-03.1.json`) |
| Picture    | 1080 x 1920 (9:16), 30 fps, 3,936 frames, 131.2 s; H.264 High, level 4.2, progressive, BT.709, 11.9 Mbit/s                                                      |
| Sound      | AAC-LC, 48 kHz stereo, 255 kbit/s; -14.1 LUFS integrated, loudness range 5.1 LU, true peak -1.3 dBTP                                                            |
| Container  | MP4 with its index at the front, so an upload page can read it while it is still arriving                                                                       |

Every word is captioned in the picture. Where a platform offers its own automatic captions, leave them off, or the words appear twice.

## The cover

`cover-1080x1920.png` (lossless) and `cover-1080x1920.jpg`: frame 3,780 (126.0 s), the closing card settled before the pointer arrives. Everything on it sits between y 300 and 1,485, inside the centre 1,440 px that a 3:4 crop keeps (Instagram's profile grid shows a reel's cover that way).

## The platforms

What the published guides say on 23 October 2026. They are third-party guides, and they disagree in places, so each platform's upload screen is the final word.

| Platform        | Length                                                       | File                                                                                      | Notes                                                                           |
| --------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Instagram Reels | Up to 3 minutes for most accounts                            | Up to 4 GB                                                                                | Upload in the app or Meta Business Suite; choose the cover from the camera roll |
| Facebook Reels  | No fixed length since mid-2025                               | Fits                                                                                      |                                                                                 |
| YouTube Shorts  | Up to 3 minutes for a vertical video (since 15 October 2024) | Fits                                                                                      | A vertical video up to 3 minutes is a Short                                     |
| TikTok          | Up to 10 minutes in the app, longer from TikTok Studio       | About 72 MB from the Android app, about 287.6 MB from the iPhone app, more from a desktop | Post it from a desktop (TikTok Studio) or an iPhone: the file is 199.6 MB       |
| LinkedIn        | Up to 15 minutes from a desktop, 10 from the app             | Up to 5 GB                                                                                | A desktop feed may show a vertical video with bars beside it                    |
| X               | 140 seconds for a free account                               | Up to 512 MB                                                                              | 131.2 s fits, with 8.8 s to spare                                               |

Checked against: [Kontentino](https://www.kontentino.com/q-and-a/how-long-can-instagram-reels-be/) and [Argil](https://argil.ai/blog/instagram-reel-size-e350f) (Instagram); [Postfast](https://postfa.st/sizes/facebook/reels) (Facebook); [Gigazine](https://gigazine.net/gsc_news/en/20241004-youtube-short-video-length-3-minutes) (YouTube); [Postpone](https://help.postpone.app/platforms/tiktok/media-limits) and [Stack Influence](https://stackinfluence.com/blog/tiktok-video-sizes-the-ultimate-guide) (TikTok); [Brandwatch](https://www.brandwatch.com/blog/linkedin-video-specs/) (LinkedIn); [Postfast](https://postfa.st/sizes/x/video) (X).

## Before it runs publicly

- **The music.** Drake's _National Treasures_ (instrumental) is the client's choice. The brief leaves its licence for paid or public use to the client to confirm. The studio's rights ledger records it as owned by the brand, confirmed when it was uploaded on 10 October, but a released recording is normally licensed from its label and publishers. Without a licence that covers advertising, a platform may mute the film, claim it or take it down. Confirm which holds before it runs.
- **The voiceover.** The master voiceover was made with ElevenLabs (the Gabby voice). The studio records no licence for it. Confirm that the account's plan covers commercial use.

## Where it is kept

The studio keeps all of it with the work _Aurixa Reel 1_ (`e9b6fa24-2571-4cbb-83c8-18b7aabd2c9e`):

- the final and its covers, under `work/delivery/`;
- both masters, under `work/masters/`;
- 12.1 and 03.1 as drawn again, each with its lossless reference, under `work/shots/`;
- these records.

`python3 scripts/studio-work/work.py resume e9b6fa24-2571-4cbb-83c8-18b7aabd2c9e` puts them all back on any machine.
