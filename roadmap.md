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
