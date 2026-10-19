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
- [ ] Open the sources read via search and mark them read in full: needs their 44 hosts allowed in the environment's network access settings (listed in the doc)
- [ ] Pinterest and Snapchat guidance, and Australia's TGA and Ahpra rules for health brands' testimonials and before-and-after content
