# Aurixa Systems · Reel 2 · delivery

Reel 2, the AML/CTF Compliance Passport, as rendered on 24 October 2026. This is the final, and how it goes to the platforms.

## The final

Upload this file as it is: `aurixa-systems-reel-2-final-1080x1920.mp4`. Don't export it again from an editor, and don't compress it first. Each platform encodes it once on upload, and every encode before that softens it.

|            |                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| File       | 147,362,327 bytes, SHA-256 `294529468de77f8953b78684b00407a1412dbb3fe2e158bfd72b35d8cd8c8474`                                  |
| What it is | The renderer's master: twelve stretches drawn at final quality, each verified, joined frame for frame, the soundtrack under it |
| Picture    | 1080 x 1920 (9:16), 30 fps, 3,541 frames, 118.03 s; H.264 High, level 4.2, progressive, BT.709, 9.7 Mbit/s                     |
| Sound      | AAC-LC, 48 kHz stereo, 261 kbit/s; -14.1 LUFS integrated, loudness range 4.7 LU, true peak -1.3 dBTP                           |
| Container  | MP4 with its index at the front, so an upload page can read it while it is still arriving                                      |

Every word is captioned in the picture. Where a platform offers its own automatic captions, leave them off, or the words appear twice.

## The cover

`cover-1080x1920.png` (lossless) and `cover-1080x1920.jpg`: frame 1,446 (48.2 s), the Passport face-on, its holder's name on it and its own name in the caption under it. Everything on it sits between y 192 and 1,500. Instagram's profile grid shows a reel's cover cropped to 3:4 (1,440 px tall); centred, that crop starts at y 240 and trims the top 48 px of the Passport's border. Moved up to start at about y 126, it keeps the whole Passport and its caption.

## The platforms

What the published guides said on 23 October 2026, checked for Reel 1 the day before this was rendered. They are third-party guides, and they disagree in places, so each platform's upload screen is the final word.

| Platform        | Length                                                       | File                                                                                      | Notes                                                                           |
| --------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Instagram Reels | Up to 3 minutes for most accounts                            | Up to 4 GB                                                                                | Upload in the app or Meta Business Suite; choose the cover from the camera roll |
| Facebook Reels  | No fixed length since mid-2025                               | Fits                                                                                      |                                                                                 |
| YouTube Shorts  | Up to 3 minutes for a vertical video (since 15 October 2024) | Fits                                                                                      | A vertical video up to 3 minutes is a Short                                     |
| TikTok          | Up to 10 minutes in the app, longer from TikTok Studio       | About 72 MB from the Android app, about 287.6 MB from the iPhone app, more from a desktop | Post it from a desktop (TikTok Studio) or an iPhone: the file is 147.4 MB       |
| LinkedIn        | Up to 15 minutes from a desktop, 10 from the app             | Up to 5 GB                                                                                | A desktop feed may show a vertical video with bars beside it                    |
| X               | 140 seconds for a free account                               | Up to 512 MB                                                                              | 118.0 s fits, with 22.0 s to spare                                              |

Checked against: [Kontentino](https://www.kontentino.com/q-and-a/how-long-can-instagram-reels-be/) and [Argil](https://argil.ai/blog/instagram-reel-size-e350f) (Instagram); [Postfast](https://postfa.st/sizes/facebook/reels) (Facebook); [Gigazine](https://gigazine.net/gsc_news/en/20241004-youtube-short-video-length-3-minutes) (YouTube); [Postpone](https://help.postpone.app/platforms/tiktok/media-limits) and [Stack Influence](https://stackinfluence.com/blog/tiktok-video-sizes-the-ultimate-guide) (TikTok); [Brandwatch](https://www.brandwatch.com/blog/linkedin-video-specs/) (LinkedIn); [Postfast](https://postfa.st/sizes/x/video) (X).

## Before it runs publicly

- **ElevenLabs' plan.** Both the score and the voice come from the client's ElevenLabs account. The score was made with Eleven Music, which is cleared for commercial use, including ads, on a paid plan; film, TV and broadcast need its Enterprise plan. The voiceover is Reel 1's ElevenLabs voice, so the same plan must cover commercial use. Confirm the account's plan.
- **The voiceover.** The client confirmed the studio's consent statement ("Recorded by or for the brand, with the speaker's permission to use their voice in its content.") when it was imported, and again on 24 October 2026. The studio's rights ledger keeps it as to confirm until the plan is.
- **The free trial.** The film offers a 14-day free trial, in the voice and on the closing card, as Reel 1 does. On 13 October the site's pricing page answered "Is there a free trial?" with a sandbox set up on request. Confirm that the 14-day trial is the offer when it runs (the brand's guardrail 9).

## Where it is kept

The studio keeps all of it with the work _Aurixa Reel 2_ (`29ad590c-1f57-4a84-92de-f2652b78f3a3`):

- the final, its covers and the Film gate's review copy, under `work/delivery/`;
- the film's twelve stretches, each with its lossless reference and its record (how its drawings settled, and how it was verified), under `work/runs/`. The four drawn by helper sessions are also kept with the works that drew them, linked from this one;
- the joined film's record, its measures and its review sheets, under `work/film/`;
- these records.

`python3 scripts/studio-work/work.py resume 29ad590c-1f57-4a84-92de-f2652b78f3a3` puts them all back on any machine.
