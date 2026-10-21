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
- [ ] Uploads for Reel 1: image(9) and image(10), the Command Center screenshot, the emblem and wordmark at full size; then the plates again with P, D and the emblem, imported as v2 (the 31 v1 imports, and the five whose plates were split, can then be deleted from the library)
- [x] Allow opukzrutzdcqrlmlpigs.supabase.co in the environment's network access, so a session can look at library files (references and results)
- [x] #44 merged and published; the three API operations answer on the live app (31 operations)
- [x] Reel 1's 36 plates (v1) imported into the library with import_image; their ids are in docs/brands/aurixa-reel-1/assets.json
- [ ] Re-analyse the Reel 1 brief (Brief panel → Re-analyse)
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
- [ ] Reel 1 stage 5, clips: test 01A and 04B on both clip models, choose one, then block by block (needs approval and spend)
- [ ] The studio records no price for metered GPT Image runs: Higgsfield's result carries none, so a run's cost and the balance countdown miss them (the Console's balance is the only record)
