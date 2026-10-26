# Roadmap

## Avatar Studio V1

- [x] Database, private storage, server logic, recovery hookup, 9 pages, Creative/Avatar switcher
- [x] Security check: provider secrets unreachable by members; recovery/webhook endpoints reject unauthorised callers
- [ ] Signed-in end-to-end test — blocked: no user account exists yet (user must sign up in preview)
- [ ] Live HeyGen / LiveAvatar tests — blocked: HEYGEN_API_KEY / LIVEAVATAR_API_KEY (user will say when ready)
- [ ] Register HeyGen completion notices — blocked: needs HeyGen key, then one click in Avatar Settings
- [ ] Custom-brain live personas — needs a separate realtime orchestrator service (not deployed)

## Presenter videos (from the Aurixa "Janice presents" findings)

- [x] Voiceover placement: a clip measured on the frame is no longer pushed a frame late; a confident SyncNet lip lead is taken out when the clip is laid
- [x] Every clip from one still (anchor mode, the default for voiced runs), up to three clips made at once
- [x] B-roll cutaways: lines ticked in Create get no presenter clip and a placeholder in the Editor, each with a 0.5 s lead-in
- [x] Lip scores (media worker `lip_check`, SyncNet) with automatic retakes under 4, flags under 6.5, and every take kept to swap in
- [x] Presenter recipe (locked camera, negative prompt) and warnings for prompts that would weaken lip sync
- [x] Presenter + B-roll edit straight from a run; captions timed from the transcript and worded from the script, with a spellings list for brand names
- [x] Run controls: redo a clip (from another start frame), hold or release it, choose a take, fill a cutaway
- [x] Budgets: a run's estimate checked against the workspace and the member's monthly cap (Settings) before it starts; out of credits pauses a run cleanly, and Continue picks it up
- [x] Rate limits and provider busy errors retried automatically, with fresh idempotency keys; a one-minute tick moves running videos on
- [x] Titles at any height with a halo or box behind them; generated videos measured for their exact length, size and frame rate
- [x] QC beyond lips: framing drift (eye span) and the mouth in pauses from the lip check; an AI check for garbled text in generated pictures and videos
- [x] Brand kits (Settings): fonts, colours, logo, end-card background, tagline, call to action and caption spellings; applied in the Editor, with the end card composed inside TikTok/Reels/Shorts safe areas, and to voiced runs opened in the Editor
- [x] 24 to 30 fps conversion (blend or motion interpolation) and sharper upscaling in renders
- [x] Headless studio API and MCP server (docs/studio-api.md), with personal tokens in Settings
- [x] A warning in Create before work would run out of Higgsfield credits part-way, and a run's worst case with retakes
- [x] Apply migrations 0017_presenter_runs, 0018_brand_kits and 0019_studio_api
- [x] Deploy the media worker with brand_text, image_overlays and frame_rate_conversion; the SyncNet weights pinned to the checksum that build fetched
- [x] Deploy the media worker with lip_check (#32): the image upgrades pip and fixes torch's dependencies (the first build left it out), and the scorer finds its files beside it
- [ ] Lip-sync post-process: blocked. Higgsfield's catalog has no video-to-video lip-sync model (its video-edit models take audio only as a loose reference, and Seedance replaced the voice in the bake-off), and HeyGen belongs to Avatar Studio, which Creative Studio must not share provider code with. Revisit when a model that re-syncs an existing video's mouth to given audio is offered

## Soul IDs, brand design systems and the Supercomputer agent

- [x] Soul ID studio: a Soul ID per Soul model, trained on a checked set (the AI checks each image and the set as a whole), training packs for characters who exist only as AI images, likeness proofs scored and approved by a person, and Soul IDs trained elsewhere taken in
- [x] Soul IDs in every workflow: long-video openings painted from the character's Soul ID, Create start frames from a Soul ID, the Supercomputer, and the studio API (list_characters, get_character, train_soul_id, make_soul_still)
- [x] Brand design systems: a brand read from its website or its guidelines (PDF, Word, PowerPoint) into a palette with roles, typefaces (Google fonts installed for titles), imagery, voice and rules, reviewed and kept as a brand kit on the Brand page
- [x] Brands in generation: Create's brand picker, long videos, beats, the prompt assistant, the Director, voiceover scripts and the studio API work in a brand's look and voice
- [x] Supercomputer agent on Claude (docs/supercomputer-agent.md): streams its thinking, words and tool calls; generates, looks at what it made and refines it; researches the web; writes documents; remembers; asks before it spends; server-side fallback, so a request one Claude model declines is answered by another
- [x] Agent conversations: edit and redo, stop from any page, approvals one by one or all at once, a model, effort, brand and spending allowance per conversation, pinned chats, and the Made here and Memory panels
- [x] Apply migrations 0020_soul_ids, 0021_brand_design_systems and 0022_supercomputer_agent
- [x] The ANTHROPIC_API_KEY backend secret that turns the agent on (already set for Katana)
- [x] Signed-in test of the agent against Claude and Higgsfield on the live app: five of five checks passed after the fixes it found (#36, #37)

## Brand design systems from code

- [x] A design system read from the brand's code (docs/brand-code-import.md): up to six GitHub repositories read together, the first the brand's own, as text and never run. It yields every colour with the tokens that name it and the file and line each is declared on, the typefaces and how each is loaded, the radius, shadow, motion, blur and gradient scales, and where the repositories disagree. It powers the Brand page's Code import (with a Code tab in the review, tokens.css and JSON downloads, and Re-read), the agent's `import_brand_code`, the studio API's `read_brand_code` and `scripts/brand/scan-repos.ts`
- [x] Updating a kit from code takes its colours and type and keeps the kit's look, voice, rules and style references
- [x] Apply migration 0026_brand_code_imports
- [x] The studio's `GITHUB_TOKEN` backend secret (a fine-grained token with Contents: read on the brand's repositories), so private repositories are read without typing a token on each import. Set by the client on 21 October 2026; checked on 22 October, when the live studio's `read_brand_code` read all four Aurixa repositories with no token in the request (two of them GitHub will not show without one)
- [x] Deploy: merged to main in #45 and published

## Brand DNA and content formulas

- [x] Aurixa Systems is the studio's default brand kit, saved from its website (logo, palette, typefaces, imagery, voice and rules)
- [x] Brand DNA (docs/brand-dna-and-formulas.md): the kind of brand (SaaS, product, personal brand or creator, UGC-led, services, local, coaching and education), who it sells to, its archetype, positioning, content pillars, buying moments, proof, distinctive assets, who fronts it, channels and goal; read by the AI on import or suggested for a kit, reviewed by a person, and carried in the brand brief
- [x] Content formulas: 40 proven structures with timed beats, rules, guardrails, why they work and an evidence grade, built on 96 sources (platform guidance, effectiveness research, regulators and the frameworks' originators), ranked for a brand's DNA, with the content mix after Binet & Field
- [x] Formulas in the Director (brand and formula pickers), long-video beats, the Supercomputer agent and the studio API (list_brand_formulas, get_brand_formula)
- [x] Apply migration 0023_brand_dna
- [x] Director plans and revisions stream past the gateway's 30-second limit (the live check found a plan took about a minute, so it was kept but never reached the page), and a revision keeps the plan's brand and formula
- [x] Brand DNA says who the brand serves (each audience with the job it hires it for and what holds it back), what it sells, what buyers use instead, and the brand's own guardrails, which the AI reads first
- [x] A brand's own formulas: a library formula rewritten for the brand by the studio's AI (for a person to look over) or by hand, keeping its guardrails, sources and evidence grade; listed first on the Brand page and used by the Director, long videos, the agent and the studio API (migration 0024_brand_formulas)
- [x] A brand brief keeps what the brand needs most when it says more than fits: who it is, its guardrails, proof, call to action and spellings first, the look in detail last (the look first for the prompt assistant)
- [x] Aurixa Systems' DNA and twelve formulas, from its own site and research into its market, its regulators and what content works (docs/brands/aurixa-systems.md)
- [x] Apply migration 0024_brand_formulas
- [x] Load Aurixa's DNA and formulas into its kit, then check them signed in on the live app: the Brand page, the DNA editor, the AI writing a formula, a Director plan on one of Aurixa's formulas and the agent (20 of 20 checks)
- [ ] Before Aurixa publishes: the open items in docs/brands/aurixa-systems.md (whose security certifications, a named founder, how a shared Compliance Passport is described, Centre or Center, what is live, outbound calls, licensed data, which ad rules apply, the external sources opened)
- [ ] Open the sources read via search and mark them read in full: needs their 51 hosts allowed in the environment's network access settings (listed in the doc)
- [ ] Pinterest and Snapchat guidance, and Australia's TGA and Ahpra rules for health brands' testimonials and before-and-after content

## Aurixa Reel 1 (the 47-page prompt pack)

- [x] The agent reads a brief's own text, a few pages at a time (`read_brief`), and is told to whenever a brief says more than its summary; it was only ever shown the summary, cut at 8,000 characters, so it never saw a prompt pack's shots
- [x] Briefs are analysed in full: only the first 60,000 characters were read, so the pack's summary reported pages 27–47 missing
- [x] Drafts take `modelId` and a prompt written among the settings, and one with no model says so: before, both were dropped as "a model that is not active", and the agent fell back from GPT Image to Soul Cinema
- [x] A model's description (get_model) says when a required setting only applies in a mode (Marketing Studio's preset only in preset mode)
- [x] Marketing Studio 2.5 Flare and Sunburst say they render with GPT Image 2.5, the ChatGPT image model (migration 0025_gpt_image_models)
- [x] Apply migration 0025_gpt_image_models
- [x] Studio API: `estimate_generation` (a price without a generation), `import_image` (a picture into the library from base64 or an https address), `save_character` (a character from library images)
- [x] Reel 1 generation spec (docs/brands/aurixa-reel-1): cuts timed from the voiceover's measured words (the pack's estimates drift by up to 2.6 s); every still, set, frame and clip with its model, settings, inputs in order and prompt; the ledger of approved assets
- [x] Reel 1 screen plates v1, typeset (scripts/aurixa-reel-1/plates.cjs): 36 plates, Block 14 phrases and the closing card
- [x] Reel 1 loaded into Storyboards (storyboard e6f6907f-ea31-4a35-840b-a20278f11085): 15 blocks as scenes, 26 shots with their timing, frames, clip and motion prompt
- [x] Reel 1 decisions: START YOUR FREE TRIAL on the closing card (not the kit's Book Your Free Demo), and Demo workspace on recreated screens (not Concept)
- [x] Reel 1 plates v2 (scripts/aurixa-reel-1/portals.cjs): 41 plates, the portal ones built on the Solicitor, Accountant, Finance, Client and Builder / Developer screenshots; five plates split into before and after, and the storyboard's shots list them
- [x] ~~Uploads for Reel 1: image(9) and image(10), the Command Center screenshot, the emblem and wordmark at full size; then the plates again with P, D and the emblem, imported as v2 (the 31 v1 imports, and the five whose plates were split, can then be deleted from the library)~~ Settled as the items below record it: the console world stands in for image(9) and image(10), the supplied logo gave the emblem and wordmark, and the Command Centre's pages were supplied. The superseded plates are kept in Reel 1's project rather than deleted (23 October 2026)
- [x] Allow opukzrutzdcqrlmlpigs.supabase.co in the environment's network access, so a session can look at library files (references and results)
- [x] #44 merged and published; the three API operations answer on the live app (31 operations)
- [x] Reel 1's 36 plates (v1) imported into the library with import_image; their ids are in docs/brands/aurixa-reel-1/assets.json
- [x] ~~Re-analyse the Reel 1 brief (Brief panel → Re-analyse)~~ Not needed for Reel 1: the system edition's brief (1ebd06fc) replaced every picture in the pack, and is current in the studio (23 October 2026). The pack's own brief (848af668) still carries its first page marker, "--- Page 1 ---", as its title
- [x] Reel 1 stage 1 made (Marketing Studio 2.5 Sunburst, `studio.py run 1 --confirm`): three property images, three sheets per person, two floor plans, all completed and none blocked; the cast in their mid-to-late 20s, and the four women told apart by heritage, complexion, face and hair (their sheets revision 2, 12 more takes). Every take is in docs/brands/aurixa-reel-1/takes.json
- [x] Reel 1 stage 1 approved (`studio.py pick`, into assets.json): P take1, D take1, Alex r2-take2, Jordan take3, Jamie r2-take1, Priya r2-take3, Daniel take1, Mia r3-take1 (her sheet's revision 3 makes her more glamorous)
- [x] Reel 1 stage 2, the three sets that need no uploads: S-HOME, S-OFFICE and S-SITE, two takes each, all completed (recommended: S-HOME take1, S-OFFICE take2, S-SITE take2)
- [x] Reel 1 console world, made in place of the pack's image(9) and image(10), which can't be found: CW-9 (wide view) and CW-10 (doorway view), three takes each on Sunburst's image edit from two Aurixa brand images cropped to their rooms and Daniel's site office (S-SITE take2, approved)
- [x] Reel 1 picks: CW-9 take1, CW-10 take1, S-HOME take1, S-OFFICE take2, S-SITE take2; the Sydney views stay
- [x] Reel 1 stage 2, the seven Aurixa-world sets from the console world: two takes each, all completed (recommended: take1 of each)
- [x] Reel 1 set picks: S-ALEX, S-MEETING, S-JAMIE, S-CLIENT, S-MIA, S-PRIYA and S-REVEAL, take1 of each
- [x] Reel 1: Jordan and Daniel look professional (their sheets' revision 2, six takes); Jordan r2-take3 and Daniel r2-take3 are picked
- [x] Reel 1 plates re-rendered with the approved P and D (the emblem a marked placeholder until its file comes)
- [x] Reel 1 F-01A-in (the only frame with no screen): two takes, take1 picked
- [x] Reel 1: option 1 chosen (the frames carry their screen plates); the supplied logo gives the emblem and wordmark; 16 final plates imported, the 31 stale v1 plate ids cleared
- [x] Reel 1 stage 4, the 19 frames that don't depend on the Command Center: made and picked (blocks 01, 02, 03, 05B, 06A, 12, 13), screens reproduced exactly; F-01B-in and F-03B-in re-prompted once (no person in the opening close-up; Alex not looking at the camera)
- [x] Reel 1: the Command Centre's Reports page supplied; Alex's 11 Command Centre plates (04B, 05A, 05C, 06B, 07A, 11A-c) rebuilt on it, the other 30 unchanged
- [x] Reel 1 stage 4, the other 23 frames: made and picked in dependency order (04A to 11A); F-04A-in, F-04A-out and F-06B-in re-prompted once (the doorway frame at the mullion's place and a colleague unlike Jordan; the door frame close in the foreground for the concealed cut; the Aurixa Agent button kept on screen). All 42 frames are in the ledger
- [x] Reel 1 quality check (docs/brands/aurixa-reel-1/QC.md): the portal plates set in the portals' own fonts (Selawik for Segoe UI, Playfair Display Medium, Inconsolata for Consolas), the trial and closing cards rebuilt on the supplied logo, the 12A-b plan fitted; frame defects listed
- [x] Reel 1: the four further Command Centre pages supplied (Generated Reports, an investment report, the agent, Overview) and its plates rebuilt on them; the 13 frames they and the fonts changed screen-swapped and picked
- [x] Reel 1: the other portals' pages built from the products' code at the client's direction (Finance Decisions, My property team, the accountant's Requests, the solicitor's matter, the Builders Network's Stock List, the report's PDF); their 16 frames screen-swapped, made again after the click, or (08B) reframed so the display fits
- [x] Reel 1's cast saved as studio characters (Alex, Jordan, Jamie, Priya, Daniel, Mia) with Soul IDs on Soul 2, trained on the approved assets alone: each sheet cut into its panels and each person's clear faces cut from the approved frames (scripts/aurixa-reel-1/cast.py; ids in characters.json); a likeness still each
- [x] Reel 1: training packs for Jamie, Daniel and Mia (the studio's own: 8 photos each from the sheet), the good ones added to their training photos (7, 5 and 7)
- [x] Reel 1: Jamie's Soul ID trained again on 12 images (sheet, frames and her pack), closer to her sheet than the first; all six Soul IDs in use approved in the studio (likeness sheet: docs/brands/aurixa-reel-1/soul-ids.jpg)
- [x] Reel 1: Daniel's and Mia's Soul IDs trained again on their packs (10 and 12 images) once Higgsfield was topped up, closer to their sheets, and approved
- [x] Reel 1 stage 5, clips: one take on Cinema Studio 4.0 (the client's choice) of 15 of the 24, checked frame by frame (QC.md), and the reel laid out in the Editor as a draft (scripts/aurixa-reel-1/edit.py; its id in edit.json), the 9 not made held by their frames
- [x] ~~Reel 1: the 9 clips Higgsfield refused for its balance~~ Not needed: the client rejected the generated clips (21 October 2026) and asked for a reel about the system itself; the live-action edition stops here

## Aurixa Reel 1, system edition (screens, workflows, deliverables and brand graphics)

- [x] The content brief, extending brief 848af668 (docs/brands/aurixa-reel-1/system-edition: BRIEF.md and brief.json, written by scripts/aurixa-reel-1/system_edition.py): 29 continuous compositions on the master voiceover's clock, every beat computed from the measured speech and checked; no people and no generated video; the design system read from the four Aurixa repositories' code, every value with the file it is declared in; the supplied screenshots used as layouts only
- [x] The brief in Xeno Studio, beside 848af668: creative brief 1ebd06fc-9e5f-5d7b-b7b6-be9a9a86bef0 (27 pages, its summary in the studio's brief shape, `analysis.extends` naming the pack), written with `system_edition.py --studio-sql`
- [x] The client's three decisions, recorded in the brief (23 October 2026):
  - Real product footage and the opening palette are decided as the approved third cut has them: the code-built pages, and Blocks 01 to 03 unbranded and light, with 03.1's waiting clock the one exception.
  - The sound was settled by the third cut too (National Treasures). Its licence stays the client's to confirm, and the brief now says that the studio's rights ledger records the track as owned by the brand.
  - The studio's copy of the brief (1ebd06fc) had not been written since 22 October, before the third cut. It is current again: written from files kept with the work, fetched by the database itself (pg_net) and checked by MD5. Its summary is fitted to the 8,000 characters the agent is shown, by cutting the longest keeps to their first sentence.
- [x] The graphics kit's stylesheet (docs/brands/aurixa-reel-1/system-edition/aurixa-reel.css), written by the studio's code scanner from the four repositories (`scripts/aurixa-reel-1/reel_css.ts`): 58 custom properties, each with the repository, file and line it is declared on. The 35 roles that name code all hold the brief's value, and the token sheet (`aurixa-reel-tokens.png`) draws every one
- [x] The six pages still to build, from the products' code (NEW-INBOX, NEW-NOTIFICATIONS, NEW-MESSAGE-HUB, NEW-CLIENT-REPORTS, NEW-DASHBOARDS, NEW-REPORT-PAGES): 22 plates. The report's own pages are the standard Investment PDF as the product draws it for an issuer with no brand colour, set line for line in Helvetica's metrics (`scripts/aurixa-reel-1/helvetica.cjs`)
- [x] Style frames, one per block at its key beat, under its caption (`scripts/aurixa-reel-1/frames.cjs` with the graphics kit, `kit.cjs`): 15 stills at 1080 x 1920 drawn from the plates' own HTML, sent to the client on 22 October 2026 (contact sheet: docs/brands/aurixa-reel-1/system-edition/style-frames.jpg)
- [x] PL-08B, the report's PDF in the viewer at its cover, drawn with the product's own viewer, pages and colours (it still showed the navy it was approved in, and a floor-plan page the PDF no longer prints)
- [x] The animatic (review gate 2): the 29 shots as timed stills on the master voiceover with the captions (`scripts/aurixa-reel-1/animatic.cjs`; 21 further stills in `frames.cjs` for the shots with no style frame and the pictures that change partway), cut on the brief's beats at whole frames; every one of its 3,181 frames checked against its schedule, and every shot and caption against the brief and the spec. Sent to the client on 22 October 2026 (storyboard: docs/brands/aurixa-reel-1/system-edition/animatic-shots.jpg)
- [x] The motion renderer (`scripts/aurixa-reel-1/render.cjs`) and a proof of the final look, shots 04.1 to 05.2 (19.4 s), sent to the client on 22 October 2026: the shots animated on the brief's beats from the style frames' own plates, kit, camera and stylesheet, on the brand's own curves; drawn at twice the frame's size, averaged over a 180-degree shutter, and encoded as the delivery master (H.264 High, BT.709 4:2:0, CRF 12) with the voiceover. Measured against its lossless frames as a player decodes it (`scripts/aurixa-reel-1/film_qc.py`): SSIM 0.990 and PSNR 44.3 dB, no frame below 40.7 dB; 99.9% of the edge contrast kept; CIEDE2000 0.41 on average over 105 million flat pixels, 95% of them below 1, and the brand's colours on their hex values (the ground, the selection blue, the page and the caption white exact, the report's cover one level off at 0.05); every caption on its frames, both cuts on theirs, and the voiceover 0 ms from the picture (detail at 100%: docs/brands/aurixa-reel-1/system-edition/proof-detail.jpg)
- [x] How the final is delivered: the renderer's master straight to the platforms, as recommended (23 October 2026). The Editor's export re-encodes twice (the proof through it: SSIM 0.988 and PSNR 42.6 dB, no frame below 39.0 dB, CIEDE2000 0.51 on average: clean, but measurably softer than the master)
- [x] The client's approval of the style frames and of the animatic's timing, then the renders and the edit: the proof reviewed on 22 October 2026 ("we can proceed using this method"), with two changes: the captions in the brand's own type and animated, and the logo made with a video generation model
- [x] Captions in the brand's type (`scripts/aurixa-reel-1/captions.cjs`): Playfair Display Medium in the site's silver headline gradient, each word rising into focus on its spoken time (265 words measured from the master voiceover, `voiceover-words.json`), a phrase a line in its italic, gold with a hairline and one pass of light once the brand has arrived; the panel today's white card before the brand and the site's glass after, the one leaving and the other arriving at each cut between them
- [x] The logo from a video generation model (`scripts/aurixa-reel-1/logo_motion.py`, Kling 3.0 Pro through the studio API, takes in `logo-takes.json`): the supplied art cleaned of its lettering (one image edit, blended back only where the lettering was) so the model never redraws a letter; two takes, the reveal (A1, 5 s) and the living card (B1, 10 s), each aligned and colour-matched to the exact picture it must end on. 04.1 reveals the logo out of the night and the exact emblem and wordmark take over before they move; the trial card (10.2) and the closing card (15.1) carry the living logo under the art's own lettering. The 4K takes and the reversed dissolve (A2) were refused for the provider's balance before anything was made
- [x] All 29 shots animated on the brief's beats (`scripts/aurixa-reel-1/scenes/`, one file a scene, 25 scenes), each matched to its style frame or still and every cut checked on both sides
- [x] The film, sent to the client on 22 October 2026: all 29 shots, 3,181 frames on the master voiceover (106.03 s), drawn by `render.cjs` in one pass (24,524 drawings, 2 h 05 m), then the 86 frames a caption fix touched drawn again and put in their places (`replace_frames.py`). Measured against its lossless frames as a player decodes it (`film_qc.py`): SSIM 0.989 and PSNR 43.9 dB, no frame below 39.2 dB; 99.7% of the edge contrast kept (no frame below 98.3%); CIEDE2000 0.41 on average over 559 million flat pixels, 94.5% of them below 1, and the brand's colours on their values; 22 cuts each on its frame and 6 boundaries carried through in one move, none off its frame; every caption where the record puts it (the 23 frames the test flags are a line's first short word still coming into focus); the voiceover 0 ms from the picture. H.264 High, BT.709 4:2:0, 99.96 MB (shots: docs/brands/aurixa-reel-1/system-edition/film-shots.jpg; detail at 100%: film-detail.jpg)
- [x] The handover brief (docs/brands/aurixa-reel-1/HANDOVER.md): the formula Reel 1 was made by, step by step with its scripts, settings and numbers, and 29 proposals for Xeno Studio from what the reel had to build beside it, in the order to build them
- [x] The third cut, to the client's 14 notes of 22 October 2026, sent the same day:
  - Paced to Drake's National Treasures (instrumental, 128.99 BPM; `pacing.py`). The music is edited in four pieces on its bar lines. The voiceover is held open in its silences by whole frames, never stretched (51 pauses, 23.8 s), so the cuts land on the music's beats and bars, and Block 14's four statements on the breakdown's downbeats. The film runs 131.2 s, from 106.03 s.
  - The opening from orbit: Australia in satellite colour and relief, traced in WebGL in the renderer's own browser (`globe.cjs`, textures from public data by `satellite.py`). 599 white pins rain where Australians live, and one north-west of Sydney turns gold as the camera falls to it and the property springs out of its head. Today's tools follow as one room in depth (`desk.cjs`).
  - The brand bursts on the drop. The five portals come forward one at a time, each named and lit, then gather into the orbit (`stage.cjs`).
  - The client's report as chart pages run past the camera: the Financial Analysis in 05.2 and the Compass's grade, area and risk pages in 08.2 (`pages/reportCharts.cjs`, `reportDeck.cjs`).
  - The workflow shots staged in depth (`scenes/workflowStage.cjs`), with the light sweep across the system's screens.
  - The property is 14 Wattle Grove, Banksia Rise NSW 2155 (a suburb that does not exist), graded A+ (84, STRONG BUY) on every surface.
  - The sunrise, then the logo leaps out of it at the viewer. The call to action is the site's prismatic gradient, quickened to a cycle a bar and pulsing on the beats; its press opens the trial (`pages/cta.cjs`, `light.cjs`, `trialSetup.cjs`).
  - The explore phase: the Property Marketplace, a new A3 floor plan drawn in SVG, and three devices updating in sync.
  - The closing card slams in on the music's re-entry and is pressed on its last downbeat.
  - The soundtrack is mixed by the studio's own mixer (`soundtrack.ts`, the Editor's timeline schema and the media worker's code): the music ducked under speech, normalised to -14 LUFS.
  - Drawn in five stretches side by side and joined losslessly (`assemble.py`): 19,538 drawings where a count was kept, 3 h 23 m; one stretch was stopped at the session's two-hour limit and its 1,229 frames kept, and 71 frames were drawn again when the sea's sun glint was removed (`replace_frames.py`). Measured against its lossless frames as a player decodes it (`film_qc.py`): SSIM 0.989 and PSNR 43.8 dB, no frame below 36.6 dB (the Key figures page at full frame, indistinguishable from its source at 100%) and the lowest SSIM a near-black frame at 52.7 dB; 99.6% of the edge contrast kept (no frame below 97.5%); CIEDE2000 0.46 on average over 646 million flat pixels, 91.7% of them below 1, and the brand's colours on their values; 12 cuts each on its frame and 14 boundaries carried through in one move, none off its frame; every caption where the record puts it (the 12 frames the test flags are the word "to" alone on a white card, its few edges just under the film's threshold, and an empty panel over the trial card's grid); the soundtrack 0 ms from the picture. H.264 High, BT.709 4:2:0, 198.54 MB (shots: docs/brands/aurixa-reel-1/system-edition/third-cut-shots.jpg; detail at 100%: third-cut-detail.jpg)
- [x] The marketplace's listing photographs in the third cut (23 October 2026). Shot 12.1's eleven invented listings each carry their own photograph, where they had the product's drawn cover. The photographs were made on 22 October and are now the spec's Stage 6, with prompts matching the studio's record. As 14 Wattle Grove is chosen, the page around it eases back. The assets folder was rebuilt from the ledger (`studio.py fetch`), and 12.1 drawn as it was matches the delivered master's own frames within its encoding error (46.9 to 54.4 dB). The new 12.1 was spliced into the delivered master (`splice_shot.py`): only frames 2949 to 3065 were encoded again, between the master's keyframes. Every other frame and the whole soundtrack are bit-identical. The frames taken from the master measure 55.2 to 56.7 dB, and timestamps, keyframes and parameter sets are unchanged. 3,936 frames, 131.2 s, 199.39 MB (record: docs/brands/aurixa-reel-1/system-edition/splice-12.1.json; before and after: third-cut-12.1-listing-photos.jpg)
- [x] The waiting clock made prominent in the third cut, from 0:19 to 0:26 (23 October 2026, at the client's direction). Today's desktop clock was a small white pill, and the urgency did not come across. G-CLOCK is now the one thing in 03.1's room in the brand's colours: navy glass with a gold edge and glow, the weekday in the brand's mono capitals and the time in large gold figures. A ring in the trial ring's gradient fills as the wait grows, the hands spin faster and faster, a "Client waiting" count runs, and the card flares each new day. Its words change only between frames; the old pill printed two times over each other whenever a tick fell inside a frame's shutter. 03.1 drawn as it was matches the delivered frames (mean 53.7 dB). The exceptions are four frames as the room falls dark, where the delivered film carries raster glitches that the new 03.1 removes. The shot was spliced into the master with 12.1's photographs: only frames 593 to 879 were encoded again. Against the delivered third cut, 404 frames differ, all inside the two shots' stretches; every other frame, the soundtrack, the keyframes and the timestamps are identical. 199.59 MB (record: docs/brands/aurixa-reel-1/system-edition/splice-03.1.json; before and after: third-cut-03.1-waiting-clock.jpg)
- [x] Approved, and delivered (23 October 2026). The revised third cut is the final:
  - The renderer's master, byte for byte (SHA-256 d0772554…, 199.59 MB), uploaded as it is. Its index is at the front of the file, and it plays at -14.1 LUFS with a true peak of -1.3 dB.
  - Its cover is the closing card at 126.0 s (frame 3,780), inside the centre a 3:4 crop keeps.
  - The delivery note (docs/brands/aurixa-reel-1/system-edition/DELIVERY.md) gives each platform's limits as the published guides have them. 131.2 s fits Instagram Reels, Facebook Reels, YouTube Shorts, LinkedIn, X's free 140 s, and TikTok from a desktop or an iPhone.
  - It also says what to settle before the film runs publicly: the music's licence, and the voiceover's.
  - Kept with the work under work/delivery. The work is done.
- [x] The studio records a price for metered runs whose result carries none (GPT Image's on Higgsfield): a stated unit price, or an admin's list price, never an invented one (E3 below)

## Aurixa Reel 1's handover, built into the studio (its 29 proposals)

Built from docs/brands/aurixa-reel-1/HANDOVER.md, part 2, each proposal tested on Reel 1's own records where it has them. Its migrations are applied to the live database; nothing has yet been run in a browser against it.

- [x] A1. Motion graphics (compositions) in the Editor: a page in the brand's colours and type, moved by a function of time, previewed live in the Editor and drawn by the media worker's own browser; on the studio API as `list_motion_templates`, `draw_motion_graphic` and `get_motion_graphic` (docs/compositions.md; migration 0034_compositions)
- [x] A2. Drawn as a camera would, as settings: at twice the frame's size, averaged over the shutter, kept as a lossless master with a BT.709 copy to play; a draft first, the final when asked
- [x] A3. Never drawn twice: each drawing is known by what it is made of (its page, pictures and fonts); a long final is drawn in stretches of about 240 frames, side by side on as many media workers as there are, each stretch kept on its own and joined frame for frame
- [x] A4. A mastering export (`quality: "master"`): lossless intermediates and one encode (x264 slow at CRF 12, aq-mode 3, AAC 256 kb/s), and an edit that is one finished master passed through untouched
- [x] A5. WebGL on a GPU: a media worker run with `MEDIA_WORKER_GPU=1` draws WebGL motion graphics when `MEDIA_WORKER_GPU_URL` names it, and the globe's own techniques (plain textures, a resolution per layer, a quantised clock) where there is none
- [x] B1. `import_audio` on the studio API: WAV, MP3, M4A or FLAC, from base64 or an https address, as music, an effect, or a voiceover with its consent
- [x] B2. A voiceover held open in its silences: pauses of whole frames, only where the measured speech isn't, captions, titles and (if asked) cuts moving with the words; on Reel 1's records all 51 pauses pass and all 27 shots land on their frames
- [x] B3. A track's bars, downbeats and sections, found in the app (migration 0033_music_structure)
- [x] B4. Music edited on its bars: a track played as pieces, fitted to the edit by whole groups of bars with its landmarks exact (`fit_music`); on Reel 1, the drop, breakdown and re-entry land where pacing.py put them
- [x] B5. One solver for cuts, voice and music (pacing.py's, over the whole edit): Reel 1's 52 pauses and 26 cuts reproduced
- [x] B6. Ducking by section, a mix report (the voice against the music where it speaks, and the finished file's loudness) and stems (migration 0032_mix_reports)
- [x] C1. Captions word by word in the brand's type: Reel 1's captions.cjs in the render and the preview, frame for frame
- [x] C2. Captions that stay legible: a panel that follows the picture's lightness behind each line (auto, light, dark, solid or none)
- [x] C3. Up to 12 font files in an edit, a family's regular and italic each its own
- [x] D1. A production stylesheet from the Brand page: 27 roles (colour, type, radius, shadow, blur and motion), each with the file and line it came from (migration 0029_brand_production)
- [x] D2. Motion in the brand kit: titles move on the brand's own curves and durations, in the render as in the preview
- [x] D3. Product pages as templates with a demo record: the fictional people, records and figures on the Brand page that every product screen's motion graphic reads, so a reel never shows a real client
- [x] E1. Reference screenshots redacted, and a picture marked layout-only held out of frames, motion graphics included (migration 0035_reference_privacy)
- [x] E2. A licence and credits ledger, and a render's public-use check (migration 0027_asset_rights)
- [x] E3. Every generation's cost recorded, and the balance checked before a stage is queued (migration 0028_generation_costs)
- [x] F1. Review gates in a project: versions, comments pinned to a time, frame or point, decisions in the app or over the API, versions side by side (migration 0030_review_gates)
- [x] F2. Notes to tasks: a client's notes matched to the shots they're about, with the evidence shown
- [x] G1. Every render measured against its own lossless reference: fidelity, edges, colour, banding, captions, cuts, sync and loudness, each judged (migration 0031_render_quality)
- [x] G2. Review sheets of a render's shots, from the Render panel, the Reviews tab and the API
- [x] H1. Storyboards timed from the measured voice, and a brief in brief.json's shape imported as a storyboard
- [x] I1. The agent's work in sections: each worker on its own shots with a step limit, merged into one edit and its joins checked (migration 0036_agent_sections). The sections run one after another, not side by side: the app's requests can't outlive the page, nor run many at once
- [x] I2. Render-aware scheduling: an edit's render starts its motion graphics' finals ahead of any draft in the media workers' queues, says how many are done, and goes the moment the last is in
- [x] J1. A clean-plate recipe for logos and lettering (`clean_plate`, `lay_lettering`, and "Logo in motion" in an image's details)
- [x] J2. A take aligned to its end frame (`align_take`): registered on the picture, colour-matched, then crossed to it
- [x] Render colours in BT.709 (found by G1): pictures brought in by BT.709's matrix, colours drawn into the picture handed over to FFmpeg's own, every render tagged, and frames taken out read as a player shows them; brand colours within a CIEDE2000 of 0.75, where they were off by up to 8.6 (media-worker/README.md, Colour)
- [x] Migrations 0027 to 0036 in the journal, with a test that keeps it in step with the files
- [x] Migrations 0027 to 0036 run on a scratch Postgres 16 built as the live database was (Lovable's migrations, then 0000 to 0026, on stand-ins for Supabase's auth, storage, cron and net): each applies, alone or all ten in one transaction, and can run again; they only add to the tables the live app uses, so it runs on as it is; the 15 new tables have row security with nothing for the signed-out; the review gates' triggers and functions behave as members use them; and the generated types, the values the code writes and the functions it calls match what they make
- [x] Migrations 0027 to 0036 applied to the live database, in order, each in a transaction with its ledger entry (and 0026's, which the ledger lacked); what they made matches a database built from the files: every table, column, constraint, index, policy, trigger, grant, function and the storage bucket (the functions' grants as Supabase grants every function)
- [x] Transitions keep every frame on the worker's own FFmpeg (5.1, Debian bookworm's; found when the production image was self-tested): its xfade ended a transition at the clip before's end with frames of it still waiting, so the next clip played a frame late and the encoder repeated one. The clip before now reports its end only once the transition has used its last frame, and the frames are FFmpeg 6.1's
- [x] slideup and slideleft draw only the picture: FFmpeg's xfade (5.1 and 6.1 alike) drew their first frame's top row (slideup) and each row's first pixel (slideleft) from past the picture, a line of green or of noise that changed from one render to the next. Each is drawn as its mirror image (slidedown on pictures turned upside down, slideright mirrored), frame for frame FFmpeg's own but for that line, and a self-test fails without it
- [x] The media worker deployed with its browser (23 October): GitHub refused to start the deploy while it used an outside action, so it installs flyctl from Fly's own release, checked against the release's checksums; the live worker reports all 29 of the tested image's features
- [ ] A media worker on a GPU for WebGL motion graphics (`MEDIA_WORKER_GPU=1`, its address in `MEDIA_WORKER_GPU_URL`): a cost decision; the GPU path hasn't been run on a GPU
- [ ] Check the new pages and panels signed in on the live app: none has been run in a browser against the live database
- [ ] Set list prices for the models whose results carry no price: Higgsfield's Marketing Studio 2.5 Sunburst, text-to-image and image edit (242 runs). Its price varies with resolution and quality, so an admin sets it from Higgsfield's own table (its site can't be reached from the build sessions)
- [x] Aurixa's brand kit carries its production stylesheet (27 roles, the 30 disagreements decided in writing) and its demo record (14 Wattle Grove and its people, listings, documents and grade), written to the live database for Reels 2 and 3 (docs/brands/aurixa-reels-2-and-3/PLAN.md)
- [x] Drawing the templates in Aurixa's kit showed lines no record held, now the record's own: a report page with no bars draws its grade, with how it was reached under the chart (the Compass's own page) and the verdict fitted inside the ring; a client's file lists the record's documents, not a "Signed approval.pdf" it never had; a notification names the client (docs/brands/aurixa-reels-2-and-3/motion-templates.jpg)
- [x] The Editor asks a picture's privacy mark before it lays it on a timeline (a clip, the brand's logo, a picture over the video), and refuses a layout-only one as the render does
- [ ] The Editor's preview shows an auto caption panel unmeasured (measuring needs pixel reads the browser's cross-origin rules allow)
- [x] A brand imported from its site gets its headings' italic too, where Google has one, for brand captions' emphasis
- [x] Music fitted to the edit records what it was fitted to, and the Music panel says when the edit's length has changed since and fits it again; dragging the start of music in pieces trims into its first piece, the rest staying where it plays
- [ ] The preview's crossfades between pieces of music are approximate
- [x] A render recovered from storage keeps its stems, and `get_render` reports `public_use`, its `rights_check` and the `credit_lines` it owes
- [x] An effect ducks under the voice only when told to, as before effects could (a timeline written through the API without a duck field had made it dip)
- [ ] A brief per beat (H1's shape), for review sheets to describe each shot from; until then they come from the shots, drafts and image notes

## Work kept as it goes, picked up from anywhere (docs/work.md)

- [x] Why: Reel 1's working state lived only in its session's container (its assets, renders, references, film.json, soundtrack, uncommitted spec and takes, and the decisions behind them), and its generations were filed under no project, because the API had no project, job, checkpoint or file to keep them in. A session stopped by a usage limit would have left nothing saying where it stood
- [x] A work: goal, plan, an append-only journal (what was done, what comes next, decisions and why, questions for a person, and who wrote it), a versioned record changed by merge patch, every version of its files (parts of 32 MiB, stored once a work by SHA-256 in the private work-files bucket), the code it ran on, what it made in the studio, and the session holding it (migration 0037_work_journal)
- [x] Each save one transaction, kept once by its request id, never refused for another's hold; a heartbeat renews only its own hold
- [x] Migration 0037 checked on a scratch Postgres 16 built as the live database is (tests/sql/work.sql: saves, conflicts, holds, heartbeats, files, links, who may read and write)
- [x] The studio API: start_work, list_works, get_work, claim_work, release_work, save_work, upload_work_files (parts straight to storage), get_work_files, get_work_file_history, attach_to_work, create_project; and a workId on every operation that makes something, so what it makes is attached and never unassigned
- [x] Supercomputer conversations on a work: told its brief first and what others wrote since, holding it for each turn, every turn's end in its journal, what they make attached
- [x] Work pages: every work with who is on it; a work's journal (live), plan, notes, files and their versions, what it made, record and brief; Continue in Supercomputer, Copy for Claude Code, let go of a stuck hold
- [x] Claude Code: scripts/studio-work/work.py and this repository's hooks, which take a checkout's work up as a session starts, keep its files and code every few minutes, save each turn's words as it ends, and when a usage limit or an error cuts a turn short say what it was asked, said last and used, then let the work go for the next session
- [x] The code kept with every save: the commits no remote holds as a bundle, the changes not committed as a patch, put back by resume (or restore-code, or restore-code --here onto another branch)
- [x] Words kept on the machine while the studio can't be reached, and sent first by the next save; files changed on both sides kept both ways
- [x] Tested end to end: the script against the studio's own API code over HTTP, two checkouts for two machines, a work cut short by a usage limit and carried on elsewhere from exactly there (tests/work/cli.test.ts)
- [x] Migration 0037_work_journal applied to the live database (23 October 2026), in one transaction with its ledger row (38 entries). Its tables, columns, constraints, indexes, policies, triggers, grants, bucket and realtime publication match the same file built on a scratch Postgres 16
- [x] Merged (#51) and published: the live studio lists the 11 work operations
- [x] Reel 1 is the first work (e9b6fa24-2571-4cbb-83c8-18b7aabd2c9e, in its own project, Aurixa Reel 1). It keeps:
  - its records and scripts;
  - the third cut as delivered on 22 October and the revised master of 23 October;
  - 12.1 and 03.1 drawn again, each with its lossless reference;
  - the previews the client was sent;
  - 633 MB in all, in 26 parts.

  308 generations and 442 library files were adopted into its project from unassigned. They are the ledger's own, plus 65 superseded plates, the Soul ID retries and the logo attempts that were made beside it. The brand's looks, the music (uploaded before the reel began), the cast, both briefs, the storyboard and the draft edit are attached where they are. Nothing else moved. Its record says where each master is and how to splice in a shot drawn again. From a fresh clone, `work.py resume` put every file back byte for byte, the revised master included

- [x] Found by registering Reel 1, and fixed: a brief now lists the files only the work holds first, says where its own folder is on a machine, and counts what it has in the studio by kind; `resume` prints the folder too

## Aurixa Reel 2 (the AML/CTF Compliance Passport)

- [x] Started as a work (29ad590c-1f57-4a84-92de-f2652b78f3a3, in its own project, Aurixa Reel 2), with eleven steps from the voice to delivery
- [x] The client's voiceover timed (99.97 s, 193 words in 19 sentences), each word's end clipped to the pauses measured in the audio. Measured as Reel 1's voice: speaker embeddings score the same across the two recordings as within each
- [x] The script checked against the voice word for word, shot by shot (`scripts/aurixa-reel-2/shot_times.py`), in the brand's Australian spelling
- [x] The plan (`docs/brands/aurixa-reel-2/PLAN.md`): 21 shots in nine blocks. Every screen is built from the product's code (the Passport, the Command Centre's Stage 9, the Client Portal's consent, the Solicitor & Conveyancer Portal). There is no generated video, and the music is made in the studio
- [x] The client's decisions (the plan's section 8), as recommended: the voice's consent statement (confirmed again on 24 October 2026), the responsibility line, the captions, the demo record's additions, the six roles and Reel 1's close. The music was made in the studio, and then the client asked for Reel 1's track, National Treasures
- [x] The voiceover imported into the studio and its words measured there; the shots timed again from them
- [x] The brief as data, the pages and graphics, Gate 1, Gate 2 (the animatic) and Gate 3 (the proof), each approved; the music and pacing; the film, 3,541 frames drawn from code in twelve stretches, each verified, and measured against its lossless reference (SSIM 0.988, PSNR 43.0 dB, ΔE2000 0.45, every cut on its frame, the sound in sync to the millisecond)
- [x] Delivered (`docs/brands/aurixa-reel-2/DELIVERY.md`): the Film gate's first version with the score, and its second with National Treasures under the same picture, packet for packet: slowed 7.0% to the cut's beat, its pitch kept, cut on its own bar lines, every hit on its cut to the millisecond, -14.1 LUFS
- [ ] The client's decision on the Film gate's second version; and before it runs publicly (the delivery note), the music's licence for public use, ElevenLabs' plan, and that the 14-day free trial is the offer

## What Reel 2 taught the studio

- [x] Every drawing settled. Chromium handed back a capture before every tile in it was painted, so a composition's drawing is kept only once two captures agree. Each browser is started again every 40 frames, because one grew past 4 GB and was ended for memory. A final render is verified by agreement: a sample drawn again independently, and a third drawing votes where two disagree. The Compositions panel says what was captured again and verified
- [x] Long jobs held: `work.py run` renews a work's hold and keeps its files while a long command runs (Reel 2's hold lapsed under its renders), and `work.py gate list|post|decide` posts a review copy to a project's review gates from a session (on a checkout attached to a work, its project's gates, without naming it)
- [x] A track at another tempo, its pitch kept: Change tempo in the music library and `change_music_tempo` (the media service's `stretch_audio`, Rubber Band), a new track with the original's licence. Reel 2's cut was paced to a 120 BPM score, then put under a 129 BPM track
- [x] A piece of music cut out of quiet onto a bar its track is already loud in comes in on its bar line (`enter`), not 35 ms early under the join's crossfade. A fit chooses it from the level either side of each bar line, measured when the track's bars are found
- [x] Measured renders read the music's attack at each cut on its beat, flagged past 20 ms: the measure that found Reel 2's early hits, made part of every render (`music_at_cuts`)
- [x] A cover frame checked in the Render panel against a profile grid's 3:4 crop: what the centred crop cuts of what is on it, and where to move the crop to keep it all (Reel 2's cover lost the top of its Passport centred), with the frame to download
- [x] Checked, and already so in the studio's own measures: frames paired by index, never by time stamp; the master decoded from its start; and words in the picture between phrases never flagged as a caption out of place (Reel 2's check flagged 64 such frames)
- [x] The tempo test asks the real feature check and task queue: two media tests stand in for them for the rest of a run, which failed it whenever the suite ran together, as CI runs it
- [x] Merged (#55) and live (24 October 2026): the media worker deployed, its self-test passed in the production image, and the live worker reports `audio_stretch`, `music_pieces_on_the_bar` and `music_at_cuts`; the app published, the live studio serving `change_music_tempo` and the Editor's cover check

## Aurixa Reel 3 (Borrowing Capacity)

- [x] Started as a work; the client's voiceover timed, and the cut paced to _National Treasures_ at its own tempo, cut on its own bar lines, every cut and anchor within 14 ms of its bar
- [x] Every screen the product's own, its pages run on its own functions by a harness (`scripts/aurixa-reel-3/screens`), every figure the product's engine's own on the demo record. Thirteen things found in the product along the way are recorded for its team (the plan's section 10); two, a target verdict that was never "achievable" and a payoff counted twice, were fixed in the product at the owner's request and carried to its copies
- [x] Drawn in nineteen stretches on twelve machines at final quality, each verified by agreement; the words the brand keeps out of frame covered, and five stretches a browser drew at another raster scale drawn again, found by a scan of every frame (`flicker_check.py`)
- [x] Delivered (`docs/brands/aurixa-reel-3/DELIVERY.md`) and measured against its lossless reference: SSIM 0.989, PSNR 43.7 dB, ΔE2000 0.46, every cut on its frame, the sound 0 ms from the picture, -14.1 LUFS. All four review gates approved
- [ ] Before it runs publicly (the delivery note): a compliance review of its modelled borrowing figures, the music's licence, ElevenLabs' plan, and that the 14-day free trial is the offer

## The teaser (_Three Questions_, then _As One_)

- [x] _Three Questions_ (26 October 2026): an original concept, eight lines in the brand voice under a synthwave score in the spirit of _National Treasures_ (`docs/brands/aurixa-teaser/DELIVERY.md`)
- [x] _As One_ (27 October 2026), from the client's reference video: its script read word for word (95 words, two recognisers), spoken in the brand voice, dry, under _National Treasures_ exactly as the reference uses it, over one camera in a hall drawn in WebGL (`docs/brands/aurixa-teaser/as-one`). Revised at the client's note the same day: the beam is drawn into the emblem's orb and circles inside the A, so no line crosses the logo. The client is satisfied with it

## What Reel 3 and the teasers taught the studio

- [x] Render fidelity judged in the encoder's own planes: SSIM of the luma of the 4:2:0 picture the encoder was given, against the master decoded (`ssim_measure: "luma"`, each plane's mean in `ssim_planes`), passing at 0.992, from clean and softened encodes of dark film frames and bright product pages. In RGB, As One's clean master read 0.956 and every frame but one under the old 0.98: in a near-black picture SSIM reads a code value's change in a channel near zero as lost structure, and RGB's black is 0 where the encoder's is 16. Its luma read 0.995. PSNR and the pixel measures stay in RGB, and a report made before reads as it was
- [x] `measure_voice`: how a recording speaks (its phrases, pace, pitch, how far its phrase ends fall, so how dry it is, and its loudness), alone or against a reference it must match. The client heard Three Questions' voice as too wet: a reverb put on it after its take held its phrase ends to an 8 dB fall, where As One's dry voice falls 16. The teasers' own measure, ported to the media worker (`voicemeter.js`, `voice_measure`) and agreeing with it on both teasers' voices and the client's reference to within 0.7 dB
- [x] `transcribe_audio`: a library recording's words, each one timed, with the brand's names spelt as the brand spells them and each correction listed. The two recognisers that read As One's reference spelt the client's name "Arixa" and "Erixus": it is told the names to listen for, and a word within a couple of letters of a name is put right where it was heard. The media service takes the speech out first (`extract_audio`'s `speech`, mono at 16 kHz, `speech_audio`), so an hour fits the transcription service's 25 MB, and a transcript is kept with its task so the same request never pays twice
- [x] The teaser's own check pairs frames by index: its lossless reference keeps time stamps in milliseconds, and pairing by time stamp matched fast-moving frames with a neighbour and read a false low of 0.946. As One's delivery note was corrected. The studio's own measures already paired by index (Reel 2)
- [x] The voice tests ask the real member check: a stand-in for it outlived its file and failed the screenshot and layout-only tests whenever the suite ran together
