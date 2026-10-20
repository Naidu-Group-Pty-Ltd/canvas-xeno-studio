# Aurixa Systems · Reel 1 working master: generation spec

A plan only: nothing in it has been generated. It was built from the 47-page prompt pack (Final Cinematic Edition, Revision 2).
Every still and clip in [`spec.json`](spec.json) is ready to queue: its model, parameters, prompt, and inputs in order.

**How the keys work.** An input is named by a key: `P` and `D` are the property image and floor plan; `C-…` is a cast sheet; `S-…` is a set; `UP-…` is an upload; `F-…-in` and `F-…-out` are a shot's first and last frames; `V-…` is a clip.
A key becomes a library asset id once its stage is approved. The ids are recorded in [`assets.json`](assets.json), which a rebuild only adds keys to.
Each prompt names its inputs as "image 1", "image 2" and so on, in the order sent. That's why cast sheets go in as explicit inputs, never as `characterIds`, which would add images in an order of their own.

**Models.**

- **Stills:** GPT Image 2.5 Sunburst (the studio's _Marketing Studio 2.5 Sunburst_, and its _Image edit_), at 2K, quality High, with Preset mode off.
- **Clips:** first and last frame to video, silent, 1080p. The test on 01A and 04B decides between _Seedance 2.5 (Image to video)_ and _Kling 3.0 Pro (Image to video)_.
- **Brand kit:** not passed to any generation. The kit's night-office look and avoid line would override the pack's afternoon-to-blue-hour progression and its unbranded problem scenes; the pack's own direction is written into every prompt.

## Timing: measured from the recording

The pack's cue times are proportional estimates. These are measured instead, from the voiceover's audio_preparations c47a30e0-edcd-4389-b98f-6c3fa11887d7 (265 measured words and speech segments). Each cut sits in the pause before the cue's first word (0.15 s ahead of its speech onset), or 0.1 s ahead of a word mid-phrase, snapped to 30 fps.
Speech ends at 105.88 s and the file at 106.031 s.

| Cue | Measured  | Pack      | Drift   | Words                                                                                                                                                    |
| --- | --------- | --------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | 00:00.000 | 00:00.000 | +0.00 s | Somewhere in Australia, a property opportunity has just appeared.                                                                                        |
| 02  | 00:04.440 | 00:03.518 | +0.92 s | A client wants to know if it's right for them, while there's still time to act.                                                                          |
| 03  | 00:08.500 | 00:09.758 | -1.26 s | But before you can answer, the research is in one platform, the numbers in another, the client details somewhere else, and the report hasn't even begun. |
| 04  | 00:17.780 | 00:19.685 | -1.91 s | WHAT HAPPENS THEN - The market keeps moving.                                                                                                             |
| 05  | 00:21.120 | 00:22.466 | -1.35 s | Your attention is pulled in every direction.                                                                                                             |
| 06  | 00:23.680 | 00:25.247 | -1.57 s | And the client is waiting.                                                                                                                               |
| 07  | 00:26.000 | 00:27.430 | -1.43 s | Aurixa Systems was built by property professionals for property professionals                                                                            |
| 08  | 00:31.260 | 00:31.458 | -0.20 s | We're here, with a connected operating environment designed around how property professionals actually work.                                             |
| 09  | 00:37.740 | 00:36.960 | +0.78 s | Picture a property moving from research into financial analysis, then into a professional report your client can understand.                             |
| 10  | 00:45.680 | 00:43.797 | +1.88 s | Picture communication, client relationships and property partners connected to that journey, with Aurixa Agent supporting the work behind it.            |
| 11  | 00:53.720 | 00:51.142 | +2.58 s | Not to replace your judgement, but to give it room to lead.                                                                                              |
| 12  | 00:58.040 | 00:55.907 | +2.13 s | Because clients don't pay you to manage software.                                                                                                        |
| 13  | 01:00.920 | 00:59.057 | +1.86 s | They trust you to identify opportunities, make sense of complexity and guide the next decision.                                                          |
| 14  | 01:07.260 | 01:04.928 | +2.33 s | You can keep asking your team to bridge the gaps between disconnected systems.                                                                           |
| 15  | 01:11.680 | 01:09.921 | +1.76 s | But why should they have to?                                                                                                                             |
| 16  | 01:13.620 | 01:12.473 | +1.15 s | Aurixa Systems isn't on the horizon.                                                                                                                     |
| 17  | 01:16.200 | 01:14.886 | +1.31 s | We've arrived, and the invitation is open.                                                                                                               |
| 18  | 01:19.600 | 01:17.807 | +1.79 s | Experience what we've built with a 14-day free trial.                                                                                                    |
| 19  | 01:23.140 | 01:21.694 | +1.45 s | Explore the platform, put it alongside the way you work today, and discover what a more connected business could feel like.                              |
| 20  | 01:30.420 | 01:29.777 | +0.64 s | Don't just take our word for it.                                                                                                                         |
| 21  | 01:32.240 | 01:32.558 | -0.32 s | Let your own experience make the case.                                                                                                                   |
| 22  | 01:34.980 | 01:35.479 | -0.50 s | Fourteen days.                                                                                                                                           |
| 23  | 01:35.980 | 01:36.537 | -0.56 s | Your business.                                                                                                                                           |
| 24  | 01:37.080 | 01:37.594 | -0.51 s | Your experience.                                                                                                                                         |
| 25  | 01:38.420 | 01:38.651 | -0.23 s | Your decision.                                                                                                                                           |
| 26  | 01:39.940 | 01:39.729 | +0.21 s | Aurixa Systems.                                                                                                                                          |
| 27  | 01:41.220 | 01:40.666 | +0.55 s | The operating system for modern property professionals.                                                                                                  |
| 28  | 01:44.700 | 01:43.587 | +1.11 s | Start your free trial today.                                                                                                                             |

| Shot | In        | Out       | Edit s | Source clip           | Clip s | Cast         | Set       |
| ---- | --------- | --------- | ------ | --------------------- | ------ | ------------ | --------- |
| 01A  | 00:00.000 | 00:04.200 | 4.20   | V-01A                 | 6      | –            | –         |
| 01B  | 00:04.200 | 00:08.267 | 4.07   | V-01B                 | 6      | Jordan       | S-HOME    |
| 02A  | 00:08.267 | 00:17.600 | 9.33   | V-02A                 | 11     | Alex         | S-OFFICE  |
| 03A  | 00:17.600 | 00:20.933 | 3.33   | V-03A                 | 5      | Alex         | S-OFFICE  |
| 03B  | 00:20.933 | 00:23.533 | 2.60   | V-03B                 | 5      | Alex         | S-OFFICE  |
| 03C  | 00:23.533 | 00:25.867 | 2.33   | V-03C                 | 4      | Jordan       | S-HOME    |
| 04A  | 00:25.867 | 00:30.867 | 5.00   | V-04A                 | 7      | Alex         | S-ALEX    |
| 04B  | 00:30.867 | 00:37.400 | 6.53   | V-04B                 | 9      | Alex         | S-ALEX    |
| 05A  | 00:37.400 | 00:39.900 | 2.50   | V-05A                 | 4      | Alex         | S-ALEX    |
| 05B  | 00:39.900 | 00:42.333 | 2.43   | V-05B                 | 4      | Jamie        | S-JAMIE   |
| 05C  | 00:42.333 | 00:45.233 | 2.90   | V-05C                 | 5      | Alex         | S-ALEX    |
| 06A  | 00:45.233 | 00:50.700 | 5.47   | V-06A                 | 7      | Jordan       | S-CLIENT  |
| 06B  | 00:50.700 | 00:53.567 | 2.87   | V-06B                 | 9      | Alex         | S-ALEX    |
| 07A  | 00:53.567 | 00:57.633 | 4.07   | cut from the 06B take | –      | Alex         | S-ALEX    |
| 08A  | 00:57.633 | 01:01.733 | 4.10   | V-08A                 | 6      | Mia          | S-MIA     |
| 08B  | 01:01.733 | 01:07.033 | 5.30   | V-08B                 | 7      | Alex, Jordan | S-MEETING |
| 09A  | 01:07.033 | 01:11.500 | 4.47   | V-09A                 | 6      | Priya        | S-PRIYA   |
| 09B  | 01:11.500 | 01:13.367 | 1.87   | V-09B                 | 4      | Priya        | S-PRIYA   |
| 10A  | 01:13.367 | 01:16.000 | 2.63   | V-10A                 | 5      | Priya, Alex  | S-REVEAL  |
| 10B  | 01:16.000 | 01:19.267 | 3.27   | V-10B                 | 5      | Alex         | S-ALEX    |
| 11A  | 01:19.267 | 01:22.933 | 3.67   | V-11A                 | 6      | Alex         | S-ALEX    |
| 12A  | 01:22.933 | 01:26.533 | 3.60   | V-12A                 | 6      | Daniel       | S-SITE    |
| 12B  | 01:26.533 | 01:30.133 | 3.60   | V-12B                 | 6      | Priya        | S-PRIYA   |
| 13A  | 01:30.133 | 01:34.400 | 4.27   | V-13A                 | 11     | Jamie        | S-JAMIE   |
| 14A  | 01:34.400 | 01:39.467 | 5.07   | cut from the 13A take | –      | Jamie        | S-JAMIE   |
| 15A  | 01:39.467 | 01:46.031 | 6.56   | V-15A                 | 9      | –            | –         |

06B and 07A are one take, cut at the narration boundary, and so are 13A and 14A. Each clip runs `ceil(edit + 1.5)` seconds (at least 4), which leaves handles at both ends.

## Stage 1: lock the look

Pick one P, one sheet per person and one D. Three takes of each, two of the plan.

### P · Residence 014: the one property image (9:16)

Used by: 01A's last frame and every later thumbnail, report, dossier and project tile (the P anchor).

> Photorealistic architectural photograph, vertical 9:16. A newly built contemporary two-storey Australian townhouse: warm light brick, timber detailing, dark metal-framed windows, a small landscaped front garden, and a eucalyptus gum tree at the street edge. Near-frontal view from human height across a quiet residential street, the facade sitting in the upper-middle of the frame (its centre near 52% of the width and 42% of the height), with the garden and footpath below. Warm late-afternoon sunlight on the brick and timber, a trace of warm interior light, bright natural window reflections without clipping, detailed navy-toned shade. No people, cars, house numbers, letterbox lettering, signs, for-sale boards, prices or text of any kind.

### C-ALEX · Alex Morgan: character sheet (3:2)

Used by: Property professional and main guide. Trousers and shoes are additions so the full-length view agrees; the pack locks the upper half.

> Photographic character reference sheet of one fictional person for a premium Australian property-services film. Seamless warm mid-grey studio backdrop, soft even key light with gentle fill, natural skin texture and true-to-life colour. Four views side by side, left to right: full-length standing front view; waist-up three-quarter view; head-and-shoulders profile; a close-up of both hands resting on a desk. The same face, hair, build and wardrobe in every view. Calm, competent, relaxed expression, not posing; visible eyes; believable fingers. No jewellery or watch. No text, labels, logos or watermarks. The person: a woman in her late 30s with shoulder-length dark brown hair, wearing a navy tailored jacket over an ivory blouse, with slim charcoal trousers and dark low-heeled shoes.

### C-JORDAN · Jordan Ellis: character sheet (3:2)

Used by: Prospective client. Trousers and shoes are additions so the full-length view agrees; the pack locks the upper half.

> Photographic character reference sheet of one fictional person for a premium Australian property-services film. Seamless warm mid-grey studio backdrop, soft even key light with gentle fill, natural skin texture and true-to-life colour. Four views side by side, left to right: full-length standing front view; waist-up three-quarter view; head-and-shoulders profile; a close-up of both hands resting on a desk. The same face, hair, build and wardrobe in every view. Calm, competent, relaxed expression, not posing; visible eyes; believable fingers. No jewellery or watch. No text, labels, logos or watermarks. The person: a man in his late 30s with short curly dark hair, wearing a light blue open-collar shirt, with dark chinos and brown leather shoes.

### C-JAMIE · Jamie Chen: character sheet (3:2)

Used by: Finance professional. Trousers and shoes are additions so the full-length view agrees; the pack locks the upper half.

> Photographic character reference sheet of one fictional person for a premium Australian property-services film. Seamless warm mid-grey studio backdrop, soft even key light with gentle fill, natural skin texture and true-to-life colour. Four views side by side, left to right: full-length standing front view; waist-up three-quarter view; head-and-shoulders profile; a close-up of both hands resting on a desk. The same face, hair, build and wardrobe in every view. Calm, competent, relaxed expression, not posing; visible eyes; believable fingers. No jewellery or watch. No text, labels, logos or watermarks. The person: a woman in her early 40s with a straight dark bob, wearing a teal blouse and a navy jacket, with navy trousers.

### C-PRIYA · Priya Shah: character sheet (3:2)

Used by: Solicitor. Trousers and shoes are additions so the full-length view agrees; the pack locks the upper half.

> Photographic character reference sheet of one fictional person for a premium Australian property-services film. Seamless warm mid-grey studio backdrop, soft even key light with gentle fill, natural skin texture and true-to-life colour. Four views side by side, left to right: full-length standing front view; waist-up three-quarter view; head-and-shoulders profile; a close-up of both hands resting on a desk. The same face, hair, build and wardrobe in every view. Calm, competent, relaxed expression, not posing; visible eyes; believable fingers. No jewellery or watch. No text, labels, logos or watermarks. The person: a woman in her 40s with tied-back dark hair, wearing a charcoal jacket and a pale blouse, with charcoal trousers.

### C-DANIEL · Daniel Reed: character sheet (3:2)

Used by: Builder and developer representative. Trousers and shoes are additions so the full-length view agrees; the pack locks the upper half.

> Photographic character reference sheet of one fictional person for a premium Australian property-services film. Seamless warm mid-grey studio backdrop, soft even key light with gentle fill, natural skin texture and true-to-life colour. Four views side by side, left to right: full-length standing front view; waist-up three-quarter view; head-and-shoulders profile; a close-up of both hands resting on a desk. The same face, hair, build and wardrobe in every view. Calm, competent, relaxed expression, not posing; visible eyes; believable fingers. No jewellery or watch. No text, labels, logos or watermarks. The person: a man in his late 40s with short greying hair, wearing a navy polo shirt, with grey work trousers and work boots.

### C-MIA · Mia Patel: character sheet (3:2)

Used by: Accountant. Trousers and shoes are additions so the full-length view agrees; the pack locks the upper half.

> Photographic character reference sheet of one fictional person for a premium Australian property-services film. Seamless warm mid-grey studio backdrop, soft even key light with gentle fill, natural skin texture and true-to-life colour. Four views side by side, left to right: full-length standing front view; waist-up three-quarter view; head-and-shoulders profile; a close-up of both hands resting on a desk. The same face, hair, build and wardrobe in every view. Calm, competent, relaxed expression, not posing; visible eyes; believable fingers. No jewellery or watch. No text, labels, logos or watermarks. The person: a woman in her early 40s with dark hair and subtle thin-framed glasses, wearing a slate-blue blouse, with dark trousers.

### D · Residence 014: the floor plan (1:1)

Used by: 12A, 12B and the printed plans in 04A and 12A (the D anchor).

> A crisp fictional architectural floor plan of a two-storey townhouse, ground floor and first floor side by side on a clean white sheet. Fine dark-navy line work showing walls, doors, windows, stairs and a few furniture outlines. Flat, square-on, evenly lit, like a high-quality printed plan. No room names, dimensions, numbers, text, logos or north arrow.

## Stage 2: sets

Empty rooms with every screen a blank glowing panel. Each Aurixa-world set is drawn from `image(9)` and `image(10)` once they're uploaded.

| Set                                                         | Model                                      | Inputs                      | Used by                                |
| ----------------------------------------------------------- | ------------------------------------------ | --------------------------- | -------------------------------------- |
| S-HOME · Jordan's home desk                                 | Marketing Studio 2.5 Sunburst              | –                           | 01B, 03C                               |
| S-OFFICE · Alex's ordinary office (before Aurixa)           | Marketing Studio 2.5 Sunburst              | –                           | 02A, 03A, 03B                          |
| S-ALEX · Alex's Aurixa glass workspace                      | Marketing Studio 2.5 Sunburst (Image edit) | UP-CONSOLE-9, UP-CONSOLE-10 | 04A, 04B, 05A, 05C, 06B, 07A, 10B, 11A |
| S-MEETING · Meeting table in the Aurixa world               | Marketing Studio 2.5 Sunburst (Image edit) | UP-CONSOLE-9, UP-CONSOLE-10 | 08B                                    |
| S-JAMIE · Jamie's finance workplace                         | Marketing Studio 2.5 Sunburst (Image edit) | UP-CONSOLE-9, UP-CONSOLE-10 | 05B, 13A, 14A                          |
| S-CLIENT · Jordan's client workspace (glass module)         | Marketing Studio 2.5 Sunburst (Image edit) | UP-CONSOLE-9, UP-CONSOLE-10 | 06A                                    |
| S-MIA · Mia's quiet accountant office                       | Marketing Studio 2.5 Sunburst (Image edit) | UP-CONSOLE-9, UP-CONSOLE-10 | 08A                                    |
| S-PRIYA · Priya's solicitor desk (gold-framed glass module) | Marketing Studio 2.5 Sunburst (Image edit) | UP-CONSOLE-9, UP-CONSOLE-10 | 09A, 09B, 12B, 10A                     |
| S-SITE · Daniel's site office                               | Marketing Studio 2.5 Sunburst              | –                           | 12A                                    |
| S-REVEAL · The occupied consoles (ecosystem reveal)         | Marketing Studio 2.5 Sunburst (Image edit) | UP-CONSOLE-9, UP-CONSOLE-10 | 10A                                    |

## Stage 3: screen plates (typeset, never generated)

Every readable screen, sign, phrase and the end card is typeset in Aurixa's palette (navy `#0A192F`/`#10233D`, gold `#C89B3C`, teal `#00A8B5`, selection blue `#1238E8`, white).
The type is Playfair Display for headings and Plus Jakarta Sans for interface text, as on the portals; the Builder / Developer portal adds JetBrains Mono for its labels. Plates are composited in the edit, and the generic problem-scene plates carry no Aurixa branding.

| Plate    | Shot     | Kind    | What                                                    | Text                                                                                                                                                                                                                                     |
| -------- | -------- | ------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PL-01B-a | 01B      | generic | Enquiry composer, before Send                           | Project Banksia / Residence 014 (property thumbnail P) · From: Jordan Ellis · To: Alex Morgan · Can we review whether this suits my plans? · Send (under the cursor)                                                                     |
| PL-01B-b | 01B      | generic | Enquiry sent                                            | The same enquiry · Sent                                                                                                                                                                                                                  |
| PL-02A   | 02A      | generic | Four separate unbranded windows, in the order spoken    | Research · Financial worksheet · Client details · Report draft (blank: intentional)                                                                                                                                                      |
| PL-03A   | 03A      | generic | Incoming item beside the empty report                   | Floor plan received — Residence 014 · Report draft (still empty)                                                                                                                                                                         |
| PL-03B   | 03B      | generic | The original enquiry card behind Alex's hand            | Can we review whether this suits my plans? · Jordan Ellis · Residence 014                                                                                                                                                                |
| PL-03C   | 03C      | generic | Jordan's conversation, still unanswered                 | Can we review whether this suits my plans? · (no reply yet) · Optional emphasis caption: WHAT HAPPENS THEN                                                                                                                               |
| PL-SIGN  | 04A      | aurixa  | Architectural sign on the glass                         | Approved triangular emblem · AURIXA SYSTEMS                                                                                                                                                                                              |
| PL-04B-a | 04B      | aurixa  | Command Center · Reports, before the selection          | Sidebar: AURIXA SYSTEMS (grouped navigation) · Banner eyebrow: AURIXA REPORTING COMMAND CENTER · Page: Reports · Tabs: Manual (active) · URL Extraction · PDF Upload · Cards: Existing Property · New Build · Land Only · Demo workspace |
| PL-04B-b | 04B      | aurixa  | Command Center · Reports, New Build selected            | New Build card in saturated blue (#1238E8) · Context: Project Banksia / Residence 014 · BK-014 (thumbnail P) · Demo workspace                                                                                                            |
| PL-05A-a | 05A      | aurixa  | Research brief, before the click                        | Prepared context: Project Banksia / Residence 014 (P) · Research brief (under the cursor) · Next: Financial analysis · Demo workspace                                                                                                    |
| PL-05A-b | 05A      | aurixa  | Location overview, the result                           | Research brief · Location overview (large, selected) · Property characteristics · Questions for review                                                                                                                                   |
| PL-05B-a | 05B      | aurixa  | Finance · purchase file, before the click               | Welcome back, Jamie · Active purchase file: Project Banksia / Residence 014 (P) · Tabs: Overview (active) · Scenario comparison (under the cursor) · Documents · Demo workspace                                                          |
| PL-05B-b | 05B      | aurixa  | Finance · Scenario comparison                           | Scenario comparison (active tab) · Base case · Alternative case · Illustrative scenario · Questions for discussion                                                                                                                       |
| PL-05C-a | 05C      | aurixa  | Client summary preview control                          | Client summary · Open preview (under the cursor) · thumbnail P · Demo workspace                                                                                                                                                          |
| PL-05C-b | 05C      | aurixa  | The prepared report (white reading surface)             | Project Banksia / Residence 014 (image P) · Client summary (navy heading) · Key considerations · Questions for discussion · fine gold dividers                                                                                           |
| PL-06A-a | 06A      | aurixa  | Client Portal dashboard, before the click               | Welcome back, Jordan Ellis · Your property team · 5 professionals working on Residence 014 · My Property Team (under the cursor) · Demo workspace                                                                                        |
| PL-06A-b | 06A      | aurixa  | Client Portal · Your property team                      | My Property Team (selected) · Your property team: Property · Finance · Legal · Builder / Developer · Accounting · Residence 014 · Next discussion: Client summary · Optional: one framed-glass enlargement of the team strip             |
| PL-06B-a | 06B      | aurixa  | Command Center record with the Aurixa Agent launcher    | Prepared context: Residence 014 · Questions for review · Aurixa Agent (launcher, under the cursor) · Demo workspace                                                                                                                      |
| PL-06B-b | 06B      | aurixa  | Aurixa Agent panel open                                 | Aurixa Agent · Draft client summary: Discuss the next step · Review required · Question to verify                                                                                                                                        |
| PL-07A-a | 07A      | aurixa  | Draft before Alex's edit                                | Questions for review · Draft: Discuss the next step                                                                                                                                                                                      |
| PL-07A-b | 07A      | aurixa  | Draft after the edit, saved                             | Draft: Review the remaining questions together · Save draft → Draft saved (restrained teal)                                                                                                                                              |
| PL-08A-a | 08A      | aurixa  | Accountant Portal · Needs you next                      | Needs you next · Supporting information · Jordan Ellis · Residence 014 · Mark reviewed · Demo workspace                                                                                                                                  |
| PL-08A-b | 08A      | aurixa  | Reviewed                                                | Supporting information · Reviewed (teal)                                                                                                                                                                                                 |
| PL-08B   | 08B      | aurixa  | Client summary on the mounted display                   | Client summary · Residence 014 · Key considerations · Questions for discussion                                                                                                                                                           |
| PL-09A   | 09A      | generic | Two generic document lists with duplicate references    | Residence 014 — documents (list A) · Residence 014 — documents (list B, duplicates) · No Aurixa branding                                                                                                                                 |
| PL-09B-a | 09B      | aurixa  | Solicitor Portal · Open matters, before the click       | Open matters (active) · Project Banksia / Residence 014 (under the cursor) · Demo workspace                                                                                                                                              |
| PL-09B-b | 09B      | aurixa  | Solicitor Portal · the matter opened                    | Project Banksia / Residence 014 (selected, blue) · Document review: Contract of sale (draft) · Floor plan · Building specification · Next discussion                                                                                     |
| PL-11A-a | 10B, 11A | aurixa  | Campaign trial invitation                               | Approved emblem · AURIXA SYSTEMS · 14-DAY FREE TRIAL · Start your free trial (saturated blue CTA)                                                                                                                                        |
| PL-11A-b | 11A      | aurixa  | CTA selected state                                      | Start your free trial (pressed state)                                                                                                                                                                                                    |
| PL-11A-c | 11A      | aurixa  | Demo workspace                                          | Demo workspace · Explore your workspace · Project tile: Residence 014 (image P)                                                                                                                                                          |
| PL-12A-a | 12A      | aurixa  | Builder / Developer Portal · Stock List                 | AURIXA SYSTEMS · BUILDER / DEVELOPER PORTAL · Projects · Stock List · Project Banksia · Residence 014 (row, under the cursor) · Demo workspace                                                                                           |
| PL-12A-b | 12A      | aurixa  | Floor plan preview                                      | Floor plan (image D) · Residence 014                                                                                                                                                                                                     |
| PL-12B-a | 12B      | aurixa  | Solicitor matter view with the plan and a prepared note | Floor plan (image D) · Note: Discuss the remaining document questions. · Save note                                                                                                                                                       |
| PL-12B-b | 12B      | aurixa  | Note saved                                              | Note saved (small teal confirmation) · Matter remains under review                                                                                                                                                                       |
| PL-13A-a | 13A      | aurixa  | Finance scenario view                                   | Active Purchase Files · Project Banksia / Residence 014 · Scenario comparison · Base case · Alternative case · Illustrative scenario · Questions for discussion · Demo workspace                                                         |
| PL-13A-b | 13A      | aurixa  | Alternative case selected                               | Alternative case (selected, blue) · Illustrative scenario                                                                                                                                                                                |
| PL-14A-1 | 14A      | overlay | Editorial phrase, one at a time in one clear area       | Fourteen days.                                                                                                                                                                                                                           |
| PL-14A-2 | 14A      | overlay | Editorial phrase, one at a time in one clear area       | Your business.                                                                                                                                                                                                                           |
| PL-14A-3 | 14A      | overlay | Editorial phrase, one at a time in one clear area       | Your experience.                                                                                                                                                                                                                         |
| PL-14A-4 | 14A      | overlay | Editorial phrase, one at a time in one clear area       | Your decision.                                                                                                                                                                                                                           |
| PL-15A   | 15A      | endcard | Closing card (from the start of Block 15)               | Approved emblem · AURIXA SYSTEMS · The operating system for modern property professionals. · 14-DAY FREE TRIAL · START YOUR FREE TRIAL · aurixasystems.com.au                                                                            |

## Stage 4: shot frames

Block by block, each first frame built from the approved frame before it. Two takes of each.

| Frame     | Inputs, in order                       |
| --------- | -------------------------------------- |
| F-01A-in  | P                                      |
| F-01B-in  | P, S-HOME                              |
| F-01B-out | C-JORDAN, S-HOME, P                    |
| F-02A-in  | C-ALEX, S-OFFICE                       |
| F-02A-out | C-ALEX, S-OFFICE                       |
| F-03A-in  | F-02A-out, C-ALEX                      |
| F-03B-in  | C-ALEX, S-OFFICE, F-03A-in             |
| F-03C-in  | C-JORDAN, S-HOME, F-01B-out            |
| F-03C-out | C-JORDAN, S-HOME, F-03C-in             |
| F-04A-in  | S-ALEX, C-ALEX, F-03C-out              |
| F-04A-out | S-ALEX, C-ALEX, F-04A-in               |
| F-04B-in  | C-ALEX, S-ALEX, F-04A-out              |
| F-04B-out | C-ALEX, S-ALEX, F-04B-in               |
| F-05A-in  | C-ALEX, F-04B-out                      |
| F-05B-in  | C-JAMIE, S-JAMIE                       |
| F-05C-in  | C-ALEX, F-05A-in                       |
| F-06A-in  | C-JORDAN, S-CLIENT                     |
| F-06A-out | C-JORDAN, S-CLIENT, F-06A-in           |
| F-06B-in  | C-ALEX, S-ALEX, F-04B-out              |
| F-06B-out | C-ALEX, S-ALEX, F-06B-in               |
| F-08A-in  | C-MIA, S-MIA, F-06B-out                |
| F-08A-out | C-MIA, S-MIA, F-08A-in                 |
| F-08B-in  | C-ALEX, C-JORDAN, S-MEETING, F-08A-out |
| F-08B-out | C-ALEX, C-JORDAN, S-MEETING, F-08B-in  |
| F-09A-in  | C-PRIYA, S-PRIYA, P, F-08B-out         |
| F-09A-out | C-PRIYA, S-PRIYA, F-09A-in             |
| F-09B-in  | C-PRIYA, F-09A-out                     |
| F-10A-in  | S-REVEAL, C-PRIYA, F-09B-in            |
| F-10A-out | S-REVEAL, C-ALEX, F-10A-in             |
| F-10B-in  | C-ALEX, S-ALEX, F-10A-out              |
| F-10B-out | C-ALEX, S-ALEX, F-04B-out              |
| F-12A-in  | C-DANIEL, S-SITE, D                    |
| F-12A-out | C-DANIEL, S-SITE, D, F-12A-in          |
| F-12B-in  | C-PRIYA, S-PRIYA                       |
| F-13A-in  | C-JAMIE, S-JAMIE                       |
| F-13A-out | C-JAMIE, S-JAMIE, F-13A-in             |

## Stage 5: clips

Test 01A and 04B on both clip models, choose one, then block by block.

| Clip  | Shot    | First frame | Last frame | Edit s | Clip s |
| ----- | ------- | ----------- | ---------- | ------ | ------ |
| V-01A | 01A     | F-01A-in    | P          | 4.20   | 6      |
| V-01B | 01B     | F-01B-in    | F-01B-out  | 4.07   | 6      |
| V-02A | 02A     | F-02A-in    | F-02A-out  | 9.33   | 11     |
| V-03A | 03A     | F-03A-in    | –          | 3.33   | 5      |
| V-03B | 03B     | F-03B-in    | –          | 2.60   | 5      |
| V-03C | 03C     | F-03C-in    | F-03C-out  | 2.33   | 4      |
| V-04A | 04A     | F-04A-in    | F-04A-out  | 5.00   | 7      |
| V-04B | 04B     | F-04B-in    | F-04B-out  | 6.53   | 9      |
| V-05A | 05A     | F-05A-in    | –          | 2.50   | 4      |
| V-05B | 05B     | F-05B-in    | –          | 2.43   | 4      |
| V-05C | 05C     | F-05C-in    | –          | 2.90   | 5      |
| V-06A | 06A     | F-06A-in    | F-06A-out  | 5.47   | 7      |
| V-06B | 06B+07A | F-06B-in    | F-06B-out  | 6.93   | 9      |
| V-08A | 08A     | F-08A-in    | F-08A-out  | 4.10   | 6      |
| V-08B | 08B     | F-08B-in    | F-08B-out  | 5.30   | 7      |
| V-09A | 09A     | F-09A-in    | F-09A-out  | 4.47   | 6      |
| V-09B | 09B     | F-09B-in    | –          | 1.87   | 4      |
| V-10A | 10A     | F-10A-in    | F-10A-out  | 2.63   | 5      |
| V-10B | 10B     | F-10B-in    | F-10B-out  | 3.27   | 5      |
| V-11A | 11A     | F-10B-out   | –          | 3.67   | 6      |
| V-12A | 12A     | F-12A-in    | F-12A-out  | 3.60   | 6      |
| V-12B | 12B     | F-12B-in    | –          | 3.60   | 6      |
| V-13A | 13A+14A | F-13A-in    | F-13A-out  | 9.33   | 11     |
| V-15A | 15A     | F-13A-out   | –          | 6.56   | 9      |

Handoffs (the pack's transition ledger, by shot):

- **01A**: 01A to 01B, direct property-image match: the last frame is the P image itself.
- **01B**: 01B to 02A, inquiry-card graphic match: the sent card and its property thumbnail stay in the same screen position.
- **02A**: 02A to 03A, ordinary continuity cut: the screen layout, cursor area, screen perspective and desk stay fixed.
- **03A**: 03A to 03B, same-desk match on the phone and document edge before the vibration.
- **03B**: 03B to 03C, inquiry-card match back to Jordan's unchanged conversation.
- **03C**: 03C to 04A, matched architectural edge: the mullion's position, width and motion match the gold doorway frame that opens 04A.
- **04A**: 04A to 04B, concealed doorway cut behind the foreground mullion.
- **04B**: 04B to 05A, selected-property match: the property image settles at the same upper-middle position.
- **05A**: 05A to 05B, direct property-image match into Jamie's Finance view.
- **05B**: 05B to 05C, direct property-image match back to Alex's report context.
- **05C**: 05C to 06A, report-card match into Jordan's Client Portal.
- **06A**: 06A to 06B, record-and-panel-edge match into Alex's Command Center.
- **06B**: 06B to 07A, continuous-camera passage (one source take); 07A to 08A, hand-and-paper action match.
- **07A**: Cut from the 06B take at the narration boundary.
- **08A**: 08A to 08B, pale document-edge match.
- **08B**: 08B to 09A, property-dossier match on the folder edge.
- **09A**: 09A to 09B, same-monitor comparison cut.
- **09B**: 09B to 10A, monitor-edge to console-edge match.
- **10A**: 10A to 10B, nearby doorway occlusion.
- **10B**: 10B to 11A, same-monitor continuity.
- **11A**: 11A to 12A, demo-project match on the Residence 014 tile.
- **12A**: 12A to 12B, exact floor-plan match.
- **12B**: 12B to 13A, record-and-card graphic match into Jamie's finance view.
- **13A**: 13A to 14A, uninterrupted observation (one source take); 14A to 15A, gold-frame graphic match into the closing card.
- **14A**: Cut from the 13A take at the narration boundary.
- **15A**: End on the complete stable closing frame through the final word and audio tail.

## The edit

- The voiceover is the only spoken track and is never stretched.
- Captions at most two lines, worded from the script (spellings: Aurixa Systems, Aurixa Agent, judgement).
- No captions over the Block 14 phrases or the end card.
- Render 1080x1920 at 30 fps.
- The end card (PL-15A) runs from 01:39.467 to 01:46.031. Visible from the first frame of Block 15 through the last word (105.88 s) and the audio tail. No captions over it: its words would duplicate the card.

| Start     | End       | Caption                                                   |
| --------- | --------- | --------------------------------------------------------- |
| 00:00.000 | 00:01.630 | Somewhere in Australia,                                   |
| 00:01.680 | 00:04.220 | a property opportunity has just appeared.                 |
| 00:04.440 | 00:06.470 | A client wants to know if it's right for them,            |
| 00:06.520 | 00:08.450 | while there's still time to act.                          |
| 00:08.500 | 00:10.170 | But before you can answer,                                |
| 00:10.220 | 00:11.970 | the research is in one platform,                          |
| 00:12.020 | 00:13.390 | the numbers in another,                                   |
| 00:13.440 | 00:15.270 | the client details somewhere else,                        |
| 00:15.320 | 00:17.600 | and the report hasn't even begun.                         |
| 00:17.780 | 00:19.090 | WHAT HAPPENS THEN –                                       |
| 00:19.140 | 00:21.060 | The market keeps moving.                                  |
| 00:21.120 | 00:23.880 | Your attention is pulled in every direction.              |
| 00:24.040 | 00:25.950 | And the client is waiting.                                |
| 00:26.000 | 00:28.750 | Aurixa Systems was built by property professionals        |
| 00:28.800 | 00:30.940 | for property professionals                                |
| 00:31.260 | 00:32.010 | We're here,                                               |
| 00:32.060 | 00:33.770 | with a connected operating environment                    |
| 00:33.820 | 00:37.690 | designed around how property professionals actually work. |
| 00:37.740 | 00:39.630 | Picture a property moving from research                   |
| 00:39.680 | 00:41.600 | into financial analysis,                                  |
| 00:41.660 | 00:43.330 | then into a professional report                           |
| 00:43.380 | 00:45.340 | your client can understand.                               |
| 00:45.410 | 00:47.000 | Picture communication,                                    |
| 00:47.180 | 00:49.230 | client relationships and property partners                |
| 00:49.280 | 00:50.770 | connected to that journey,                                |
| 00:50.820 | 00:54.020 | with Aurixa Agent supporting the work behind it.          |
| 00:54.070 | 00:55.870 | Not to replace your judgement,                            |
| 00:55.920 | 00:57.740 | but to give it room to lead.                              |
| 00:57.790 | 01:00.760 | Because clients don't pay you to manage software.         |
| 01:00.850 | 01:03.630 | They trust you to identify opportunities,                 |
| 01:03.680 | 01:05.230 | make sense of complexity                                  |
| 01:05.280 | 01:07.140 | and guide the next decision.                              |
| 01:07.190 | 01:08.590 | You can keep asking your team                             |
| 01:08.640 | 01:11.600 | to bridge the gaps between disconnected systems.          |
| 01:11.650 | 01:13.500 | But why should they have to?                              |
| 01:13.550 | 01:16.130 | Aurixa Systems isn't on the horizon.                      |
| 01:16.180 | 01:19.370 | We've arrived, and the invitation is open.                |
| 01:19.420 | 01:20.610 | Experience what we've built                               |
| 01:20.660 | 01:23.000 | with a 14-day free trial.                                 |
| 01:23.090 | 01:24.460 | Explore the platform,                                     |
| 01:24.510 | 01:26.590 | put it alongside the way you work today,                  |
| 01:26.640 | 01:28.910 | and discover what a more connected business               |
| 01:28.960 | 01:30.260 | could feel like.                                          |
| 01:30.310 | 01:32.080 | Don't just take our word for it.                          |
| 01:32.130 | 01:34.350 | Let your own experience make the case.                    |
| 01:34.570 | 01:35.820 | _Overlay:_ Fourteen days.                                 |
| 01:35.870 | 01:36.930 | _Overlay:_ Your business.                                 |
| 01:36.980 | 01:38.220 | _Overlay:_ Your experience.                               |
| 01:38.270 | 01:39.400 | _Overlay:_ Your decision.                                 |

## Still needed

- **UP-CONSOLE-9**: image(9).png, the principal physical-world reference
- **UP-CONSOLE-10**: image(10).png, the principal physical-world reference
- **UP-PORTALS**: the Command Center screenshot (CC), the last of the six portals; the CC plates follow the other five portals' shell until then
- **UP-EMBLEM**: the approved emblem and AURIXA SYSTEMS wordmark at full size (SVG or a PNG at least 2000 px wide); the library's logo is 720 px

Decisions:

- Confirmed 20 October 2026: the closing CTA is the pack's START YOUR FREE TRIAL, not the brand kit's Book Your Free Demo (the kit's automatic end card is not used).
- Confirmed 20 October 2026: the small label on recreated screens is the pack's Demo workspace, not the brand rules' Concept.
- The colleague in 04A is unnamed and seen from behind, so no seventh face needs locking.
