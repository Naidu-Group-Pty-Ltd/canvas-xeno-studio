# Xeno Studio API and MCP server

Scripts and agents can drive the studio without touching its database. The API does what a team
member does in the app, as that member, under the same rules:

- every generation passes the same spending checks (project, campaign and the member's monthly
  cap);
- only a run's owner, or an admin, can steer it;
- nothing returns a secret: files come back as links that work for an hour.

It is served two ways:

- **MCP** (Model Context Protocol, streamable HTTP): `POST /api/public/studio-mcp`. Connect Claude
  Code, Claude Desktop or any MCP client, and the operations below appear as tools.
- **Plain JSON over HTTP**: `GET /api/public/studio/tools` lists the operations, and
  `POST /api/public/studio/<operation>` runs one with its arguments as the JSON body. It answers
  `{"result": …}`, or `{"error": {"code", "message"}}` with a 4xx or 5xx status.

## Setup

1. An admin applies migration `drizzle/migrations/0019_studio_api.sql`.
2. In **Settings → API access**, make a token. Give it a name and the scopes it needs, and choose
   when it expires. The token (`xs_…`) is shown once. Only its SHA-256 hash is kept.
3. Send it with every request: `Authorization: Bearer xs_…`. Revoking it in Settings stops it at
   once.

| Scope      | Allows                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| `read`     | Reading models, library files, generations, long videos, edits, renders and brand kits; pricing.                       |
| `generate` | Queuing generations, starting and steering long videos, and the text check. These spend credits.                       |
| `edit`     | Edits, brand kits on them and renders; importing pictures and audio; saving characters; projects and work in progress. |

Claude Code (`.mcp.json` in a project):

```json
{
  "mcpServers": {
    "xeno-studio": {
      "type": "http",
      "url": "https://<your studio>/api/public/studio-mcp",
      "headers": { "Authorization": "Bearer xs_…" }
    }
  }
}
```

Plain HTTP:

```sh
curl -X POST https://<your studio>/api/public/studio/list_models \
  -H "Authorization: Bearer xs_…" -H "Content-Type: application/json" \
  -d '{"lipSync": true}'
```

## Operations

**Read** (`read` scope):

| Operation                   | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `whoami`                    | The member the token acts as, their role and the token's scopes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `list_models`               | The models the studio offers, filtered by `output`, `search` or `lipSync`. For each: the media inputs it takes (by role) and its parameters, with their options and defaults.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `list_assets`               | Library files, newest first, filtered by `kind`, `projectId` or `search`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `get_asset`                 | One file: what it is, a download link, its measured frame rate, any text check kept with it, and its privacy mark (`privacy`: layout only, or a screenshot's redacted copy; null for neither).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `get_generation`            | A generation's status and cost (with `cost_source`, see "Costs and stages"), and the files it made once it is done.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `get_long_video`            | A long video and every clip: status, piece of voiceover, lip score, framing and mouth-in-pause readings, character check, file and kept takes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `get_edit`                  | An edit's title and version, its latest render, and its timeline if `includeTimeline` is set.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `get_render`                | A render's progress, whether it was made for public use (`public_use`; null before the rights ledger exists) with what was confirmed for it (`rights_check`) and the credit lines it owes (`credit_lines`), and, once it is done, the video's library id and link, its `mix_report` (the voice's margin over the music in the speech band by section, and the mix's loudness), any `stems`, and how it measured against its own lossless reference (`quality`; `qualityNotes` says each pass and flag in words): SSIM of the picture's luma as the encoder was given it (a dark picture reads true there; RGB read As One's clean master as soft) and PSNR, frame by frame, edge contrast kept, CIEDE2000 on flat fields and on the brand kit's colours, banding, every caption and cut on its frames, the voiceover's sync and loudness. Once a review sheet is asked for (`make_review_sheet`), where it stands and, once made, its library id and link (`reviewSheet`). |
| `get_music_structure`       | A music track's tempo, beats a bar, where each bar starts and its sections (intro, build, drop, breakdown, reentry, outro), with each section's loudness, on the track's own clock, as found from its audio in the Editor's Music panel. `includeBeats` adds every beat.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `list_brand_voices`         | The studio's brand voices (name, provider and model, the project each is kept for, the studio default), for `generate_voiceover`. Archived voices are left out.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `measure_voice`             | How a recording speaks: its phrases, pace, pitch, how dry it is and how loud, alone or against a reference it must match (see "Measuring a voice"). Nothing is billed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `list_brand_kits`           | The team's brand kits, each with its mood, the style line generations in it carry, what kind of brand it is, and the formulas written for it by name (`get_brand_kit` has its whole DNA).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `get_brand_kit`             | One brand kit's whole design system: palette with roles, typefaces (`fontFiles` links each font file, an hour each), the look of its imagery, its voice and rules, the lines generations carry, its style reference images, its DNA (kind of brand, market, archetype, positioning, who it serves, what it sells, what buyers use instead, its guardrails, pillars, buying moments, proof, distinctive assets, channels, goal), the content formulas it works with (`writtenForBrand` for its own), the formulas written for it, and its `production` roles and motion with their sources and checks (`includeCss`: as CSS).                                                                                                                                                                                                                                                                                                                                               |
| `read_brand_code`           | Reads the styling code of up to six GitHub repositories together (`repos`; the first is the brand's own, a branch or folder can be named in its address), as text and never run: each colour with the tokens that name it and the repository, file and line each is declared on; the typefaces and how they load; the radius, shadow, motion, blur and gradient scales; where the repositories disagree. `includeCss` adds `tokensCss`, the tokens as one stylesheet. Nothing is kept. Private repositories need the studio's `GITHUB_TOKEN`, or a `githubToken` for this read only.                                                                                                                                                                                                                                                                                                                                                                                       |
| `list_brand_formulas`       | The content formulas (proven structures for videos and posts, each with its research), ranked for a brand's DNA with `brandKitId` and for a `goal`, `channel` and `seconds`; with `brandKitId`, the formulas written for the brand come first (`writtenForBrand`, with the `audience` each is for). Each says why it fits, what to watch for, and how strong its evidence is (`A` measured, `B` platform guidance or research, `C` convention).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `get_brand_formula`         | One formula written out for a length and channel: its beats timed (what each must do, show and say), its rules with the channel's own, its guardrails, why it works and its sources, plus a `brief` to plan or script from. A formula written for a brand needs its `brandKitId`, and says what it was written after (`basedOn`), who it is for and how often it runs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `list_characters`           | The team's characters: their look, how many reference images they have, and their Soul IDs (one per Soul model) with each likeness score and approval.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `get_character`             | One character: their reference sheet and training photos (with links), Soul IDs and the state of their latest Soul ID training.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `estimate_generation`       | The provider's price for a generation without making it: the same `modelId`, `parameters`, `inputs`, `characterIds` and `brandKitId` as `queue_generation`, priced as they would be sent. Its `warnings` say what the prompt asks that models are known to get wrong (lettering, screens and documents, naming what goes on top), and when a brand kit's never-show line had no room in the prompt. Nothing is billed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `get_clean_plate`           | A clean-plate recipe (see below) and its six steps: each one's status, the library file it made, what was measured, and what happens next in words. Reading it moves it on: a finished job's file is taken up, and a step the media service does starts when its turn comes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `estimate_clean_plate_step` | The provider's price for a recipe's `edit` or its `animate` take, as `queue_clean_plate_step` would send it. Nothing is billed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `get_redaction`             | A screenshot imported with `import_image`'s `reference` choice: where it stands (`review` while a person checks its boxes, `applying`, `completed`), the boxes to blur as shares of the picture (each with its kind and a label that hides most of what it covers) and, once made, the copy's library id. Only who imported it, or an admin, can read it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `list_review_gates`         | A project's review gates in order (see below): each gate's state, whether it is held until the one before is approved, its versions newest first (their files, render or storyboard), the latest decision on each (who, when, its note and on whose behalf), the comments (counted, or whole with `includeComments`), and the notes given on it with their shots and whether each is done.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `get_asset_rights`          | Library files' rights (`assetIds`): each one's source, licence and status for public use (`cleared`, `to_confirm` or `not_cleared`), the credit line owed, and who set and confirmed it and when (see "Rights and credits").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `get_edit_credits`          | An edit's credits: every file it uses and how, each one's licence and status, the credit lines owed, and which files aren't cleared.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `list_works`                | Work in progress, latest first (see "Work in progress"): each one's status, who holds it now (`held`, `lapsed` or `free`), its plan's progress, what was last done and what comes next. Finished ones with `includeFinished`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `get_work`                  | Everything about a work, and its `brief` in Markdown for whoever picks it up: its goal, plan, record (at `stateVersion`), latest journal entries (`before` for earlier ones), files as they stand, what it made in the studio and the code it last ran on.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `get_work_files`            | A work's files as they stand (or one path's `version`), each with its SHA-256 and its parts' download links, an hour each: fetch them, join them, check the file. A page at a time (`after`, `more`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `get_work_file_history`     | Every version of one of a work's files, latest first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `estimate_stage`            | Prices a list of `generations` together (each as `estimate_generation` would, every one of its `takes`), adds `retakeAllowance` (a fifth again unless given), and checks the total against the Higgsfield API balance and the spending limit that applies. Says whether it `fits`, and why not, with each item's price and `costSource`. Nothing is billed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

**Generate** (`generate` scope; spends credits):

| Operation                | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queue_generation`       | One image or video. Takes `modelId`, `parameters` and `inputs` (`[{assetId, role}]`) plus a `clientRequestId`. With `characterIds` the characters keep their likeness: on a Soul model their Soul ID is used, elsewhere their reference sheet goes in as reference images and their look into the prompt. With `brandKitId` it is made in that brand's look (its style line in the prompt, and what it never shows in the negative prompt, or in the prompt as a "Never show" line on a model with none, such as GPT Image; left out only when the model's prompt limit has no room for it). Poll it with `get_generation`. |
| `queue_stage`            | A whole stage, or none of it: priced and checked as `estimate_stage` checks it, and refused with nothing queued when it doesn't fit, an item can't be sent, or part of it can't be priced (unless `allowUnpriced`). Then every take is queued through `queue_generation`'s checks. The same `clientRequestId` returns its generations.                                                                                                                                                                                                                                                                                      |
| `make_soul_still`        | One photographic still of a character from their Soul ID, in the `scene` described, at an `aspectRatio`: their truest likeness, and the best start frame for a video of them. Takes a `brandKitId` too.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `train_soul_id`          | Trains a character's Soul ID for one Soul model (`v2`, `cinema` or `v1`) on at least 5 of their images. Started once: an unclear answer from Higgsfield is never retried unless you pass `confirmUncertain`. Only the character's maker or an admin can train it.                                                                                                                                                                                                                                                                                                                                                           |
| `start_presenter_video`  | A presenter speaking a prepared voiceover, with lip sync (see below).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `steer_long_video`       | `continue`, `stop` or `check` a run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `steer_clip`             | `redo` a clip (optionally from another `startFrame`), `retry` it, `hold` or `release` it, `keep` it, or set its `start_frame`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `choose_take`            | Puts a clip's kept take back in use.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `set_cutaway_fill`       | Chooses the B-roll for one of a presenter video's cutaways.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `check_text`             | Reads the lettering in a generated picture or video and says whether it is garbled. Names that may appear (`expected`, or a `brandKitId` for the kit's name and terms) are read as spelt so, not as misspellings. A video answers `"sampling"` at first: ask again a few seconds later.                                                                                                                                                                                                                                                                                                                                     |
| `transcribe_audio`       | A recording's words as said, each one timed, with the brand's names spelt as the brand spells them and each correction listed (see "Transcribing a recording"). Billed to the studio's OpenAI account.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `queue_clean_plate_step` | Makes a clean-plate recipe's `edit` (an image model takes the lettering out of the art) or its `animate` take (a video model moves the clean plate, told never to draw a letter; `end` says whether the take ends on the plate, starts on it or both). Through the same spending checks as `queue_generation`, with your `estimatedCostUsd`. The steps after it run by themselves.                                                                                                                                                                                                                                          |

**Edit** (`edit` scope):

| Operation                     | What it does                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `save_character`              | Makes a character from library images, or changes one (`characterId`): name, look, sheet images by view, training photos.                                                                                                                                                                                                                                                                                |
| `import_image`                | Puts a PNG, JPEG, WebP or GIF (up to 15 MB) into the library, from base64 `data` or an https `url`. With `reference` (a client's screen, say) its names, emails, phone numbers and addresses are found and it stays out of the library until `apply_redaction` (`redact`, on by default), and it is marked layout only (`layoutOnly`, on by default).                                                    |
| `align_take`                  | Puts a take on the exact picture it must end on (or start on, with `anchor: "first"`): the media service registers that frame on the picture, matches its colour and crosses to the picture itself (`crossSeconds`), which holds (`holdSeconds`). The aligned take joins the library with what was measured. It answers `"processing"` at first: ask again with the same `clientRequestId` to follow it. |
| `start_clean_plate`           | Starts a clean-plate recipe for a picture (`artAssetId`): its lettering's mask proposed from a transparent file of it (`lettering`, its alpha), from `boxes` you give, or from the studio's AI reading where the lettering is. Nothing is made until the mask is used.                                                                                                                                   |
| `set_clean_plate_mask`        | Uses the recipe's mask, as proposed or changed (`boxes`, `lettering`, `grow` and `feather` in the art's pixels, `letters`): it is drawn into the library, and what was made from an older mask is made again.                                                                                                                                                                                            |
| `retry_clean_plate_step`      | Tries a recipe's failed `mask`, `blend`, `align` or `overlay` step again.                                                                                                                                                                                                                                                                                                                                |
| `apply_redaction`             | Blurs a screenshot's boxes in a copy, as proposed or as you give them (`boxes`): the copy joins the library marked layout only unless `layoutOnly` is false, and the original is deleted unless `keepOriginal` (then only admins can open it). With no box at all it joins the library as it is. Follow it with `get_redaction`.                                                                         |
| `cancel_redaction`            | Drops a screenshot whose copy isn't made yet: its original is deleted and nothing joins the library.                                                                                                                                                                                                                                                                                                     |
| `set_layout_only`             | Marks a library file layout only: no generation, estimate, edit, render or copy may place it in a frame, and each refusal says why. Only an admin may lift the mark (`layoutOnly: false`).                                                                                                                                                                                                               |
| `import_audio`                | Puts a WAV, MP3, M4A or FLAC into the library as music, a sound effect or an edit's voiceover (see "Importing audio").                                                                                                                                                                                                                                                                                   |
| `import_video`                | Puts an MP4, QuickTime or WebM (up to 50 MB) into the library, its bytes sent straight to storage, so a review gate can hold it (see "Importing a video").                                                                                                                                                                                                                                               |
| `generate_music`              | Makes a track with Eleven Music into the music library, from a prompt or from a composition plan that fixes where each part falls (see "Making music").                                                                                                                                                                                                                                                  |
| `change_music_tempo`          | Makes a library track again at another tempo, its pitch kept, as a new track with its licence, for a cut paced to another beat (see "A track at another tempo").                                                                                                                                                                                                                                         |
| `generate_voiceover`          | Speaks a script in a brand voice into the library, as the Voice tab does, with every word's timing (see "Speaking a script").                                                                                                                                                                                                                                                                            |
| `open_in_editor`              | Lays a long video out as an edit. Takes captions from the script, titles on the voiceover's clock, music, and the brand kit's look.                                                                                                                                                                                                                                                                      |
| `create_edit` / `update_edit` | Makes an edit from a timeline, or changes one. An update is accepted only at the version you read. Pauses: below.                                                                                                                                                                                                                                                                                        |
| `apply_brand_kit`             | Applies a kit's fonts, colours and title motion to the edit's text, and can add its end card inside a platform's safe area.                                                                                                                                                                                                                                                                              |
| `fit_music`                   | Fits the edit's music to a length on its bars, with sections landed on times; `apply: false` only plans it. Fitted to the edit (no `seconds`), the item keeps `fittedTo`, the seconds it was fitted to, so the Editor can say when the edit's length has changed since.                                                                                                                                  |
| `render_edit`                 | Renders the edit at a version, its credits with it. Poll it with `get_render`. `publicUse` holds it until every file is cleared.                                                                                                                                                                                                                                                                         |
| `make_review_sheet`           | A finished render's every shot as one labelled picture, kept in the library. Poll it with `get_render` (`reviewSheet`).                                                                                                                                                                                                                                                                                  |
| `import_storyboard_brief`     | Makes a storyboard from a brief in brief.json's shape: a scene a block, a shot a shot, each keeping its record and its cue.                                                                                                                                                                                                                                                                              |
| `add_review_gate`             | Adds a review gate to a project, last in its order; with `heldUntilPrevious` it waits for the gate before to be approved.                                                                                                                                                                                                                                                                                |
| `add_review_version`          | Puts library stills or videos (`assetIds`), a finished render or a storyboard up for review in a gate, as its next version.                                                                                                                                                                                                                                                                              |
| `comment_on_review`           | Comments on a version, pinned to a time (`at`) or `frame`, a `point` on the picture, one of its files or a storyboard's shot.                                                                                                                                                                                                                                                                            |
| `decide_review`               | Approves a gate's latest version, or asks for changes, as the token's owner; `onBehalfOf` names a client who decided.                                                                                                                                                                                                                                                                                    |
| `create_project`              | Makes a project, so what you make isn't left unassigned. The same name from you within ten minutes returns that project.                                                                                                                                                                                                                                                                                 |
| `start_work`                  | Starts a work: its title, goal, plan (`steps`), record (`state`) and the `roots` its files sit under, in a project of its own unless you name one. With `session`, you hold it from the start.                                                                                                                                                                                                           |
| `claim_work`                  | Takes a work up for your `session`, or says who holds it; `takeOver` takes it from a session that has stopped, and `renew` only renews your own hold (a heartbeat). Answers with its brief.                                                                                                                                                                                                              |
| `release_work`                | Lets go of a work your session holds, saying why.                                                                                                                                                                                                                                                                                                                                                        |
| `save_work`                   | Keeps progress in one transaction: what was done, what comes next, decisions and why, questions for a person, plan changes, a merge patch to the record (refused with `CONFLICT` if made from an old `baseVersion`), files, links, the code it ran on, and changes to the work (title, goal, status, roots).                                                                                             |
| `upload_work_files`           | Where to send files' parts: each part's SHA-256 and size (and MD5), and for those the work doesn't hold yet an address to PUT the bytes to, straight to storage.                                                                                                                                                                                                                                         |
| `attach_to_work`              | Attaches things in the studio to a work, each with what it is to it; `adopt` puts files and generations in no project in the work's.                                                                                                                                                                                                                                                                     |
| `set_asset_rights`            | Records a file's rights: its `status` and any `source`, `licence`, `licenceUrl`, `creditLine` or `notes`; `clear` forgets them.                                                                                                                                                                                                                                                                          |

Every operation that spends or makes something takes your own `clientRequestId` (8 to 64
characters). Sending the same request again returns the first result, so a retry never bills
twice.

Every operation that makes something also takes a `workId`. What it makes goes in the work's
project (unless you name another) and is attached to the work, and the answer says so
(`work.attached`).

## Work in progress

A job that runs over many sessions is a work, kept in the studio as it goes so that whoever picks
it up next carries on from where the last session stopped ([work.md](work.md)). Take it up with
`claim_work` (or `start_work` a new one), then `save_work` after every meaningful step and before
stopping: a session can end at any moment, and what wasn't saved is lost. Pass `workId` to the
operations that make things. A save is kept even while another session holds the work; its answer
says who does.

Files go in parts: cut each every 32 MiB, offer the parts with `upload_work_files`, PUT the bytes
of those not stored yet to the addresses it gives, then name the files and their parts in
`save_work`, which checks each part is there. `scripts/studio-work/work.py` does all of it for a
checkout, and this repository's Claude Code hooks run it by themselves.

## A voiceover held open in its silences

A voiceover item in a timeline can carry `pauses`: `[{"at": 3.95, "frames": 12}, …]`. Each puts
`frames` whole frames (of the edit's `fps`) of silence into the recording at `at`, in seconds on
the recording's own clock (as `trimStart` is), so the picture gets room to breathe and no word is
stretched. The item plays that much longer: its `duration`, when set, is its length on the edit
with its pauses in it. Time captions and titles on the held voice: a word moves by the pauses at
or before it, a cut by those strictly before it, so a pause exactly on a cut opens the new shot
before its first word. At most 200 pauses a voiceover, each 1 to 300 frames.

A pause goes only where nobody speaks, as measured when the voiceover was prepared (in the Editor,
select the voiceover and choose **Measure its silences** under Pauses). `create_edit` and
`update_edit` move a pause just off a silence into it (`pausesSnapped` says how many) and refuse
one inside a word, saying where. A voiceover not yet measured keeps its pauses as sent and is
listed by item id in `pausesUnmeasured`: it can't be rendered until it is measured.

## Stems and the mix report

Every render reports how its sound sits, in `get_render`'s `mix_report`: the voice's margin over
the music in the speech band (300 Hz to 4 kHz) where the voice speaks, in each music item's span
(`sections`, with `margin_db` over them), and the finished mix's integrated loudness, loudness
range and true peak (`loudness`). A music item, or a sound effect, with `duck: false` is never
dipped under the voice; music dips unless told not to, an effect only when told to. Set
`stems: true` in a timeline and its render also hands back the voiceover, music and effects (each
bus heard in the edit, as mixed into it before its loudness is evened out) as WAV files in the
library, listed with links in `get_render`'s `stems`.

## Importing audio

`import_audio` takes a WAV, MP3, M4A (AAC) or FLAC from base64 `data` (up to 20 MB) or an https
`url` (up to 40 MB) into the same library and the same records as the app's own upload. The
file's structure is checked before anything is recorded, and its length is read from the file
(a FLAC's exactly, from its STREAMINFO).

- **Music or a sound effect** (`use: "music"` or `"sound_effect"`) joins the music library with
  its `licence`: `"licensed"`, with its `rights` (`licensor` and `scopes`, and any `reference`,
  `territories`, `expiresOn` and `notes`), or `"owned"`. `projectId` and `campaignId` file it.
- **A voiceover** (`use: "voiceover"`) becomes a take in an edit's Voice tab (`sequenceId`), with
  any `transcript`, and renders like a take made there.
- `confirmed: true` is your confirmation, as the token's owner: of the licence as stated, or that
  the voiceover was recorded by or for the brand with the speaker's permission to use their
  voice. It is recorded with who gave it and when.

The answer has the file's `assetId`, its `trackId` or `voiceoverId`, its `mimeType` and
`durationSeconds`, and `imported: false` when the same `clientRequestId` had imported it already.

## Importing a video

`import_video` puts a finished video (an animatic, a proof, a film made elsewhere) into the
library, so a review gate can hold it (`add_review_version`) and the Editor can place it. MP4,
QuickTime and WebM are taken, up to 50 MB: the file goes to storage in one upload, so a longer
master goes in as a review copy and stays with the work.

It takes two calls with the same `clientRequestId`:

1. The first, with the file's `title`, `mimeType` and exact `byteSize` (and any `width`,
   `height`, `durationSeconds`, `fps` and `sha256`), answers `status: "upload"`: an address to
   `PUT` the whole file to, with its headers, good for two hours.
2. Once the file is there, the next answers `status: "imported"` with its `assetId`. The stored
   file must be a video of the size declared. One that isn't is removed, and the next call
   offers the upload again. The media service then measures its length, size and frame rate
   (`measuring: true`), which replace the figures given.

Asked again, it returns the first import (`imported: false`). Like every upload, it is
`to_confirm` for public use until its rights are recorded.

## Speaking a script

`generate_voiceover` speaks a script (up to 4,000 characters) in one of the studio's brand voices,
as the Voice tab's Generate does: the voice's own provider voice, model, settings and
pronunciations every time, so a voice sounds the same from take to take. `list_brand_voices`
gives their ids. Name the voice with `voiceId`, or leave it out and the work's voice speaks: the
campaign's, then the project's, then the studio default. A voice kept for one project speaks only
for that project's work.

The take is kept in an edit's Voice tab (`sequenceId`) and that edit's project, or in the project
named (`projectId`), or with no project. The call waits for it (seconds; a long script a minute or
so) and answers with its `voiceoverId`, `status`, `assetId` (for `get_asset`), `durationSeconds`
and `words`, each word's `text`, `start` and `end` as spoken. It is billed in the account's
provider credits and recorded before it is asked for. The same `clientRequestId` returns the first
take (`duplicate: true`) instead of paying again, and a take whose answer was lost is settled as
`submission_uncertain` and never made again by itself. The take's file is marked as an AI voice
(`ai_generated_voice`).

## Measuring a voice

`measure_voice` says how a recording speaks, from its sound (an audio file or a video in the
library), as the teasers were judged: the client heard Three Questions' voice as too wet, and its
phrase ends were found to fall half as far as a dry voice's. The media service finds where the
voice speaks (`phrases`, with `phrase_spans`), its pace (`syllables_per_second`), its pitch
(`pitch_hz`: the median and the middle half), and how far each phrase end falls in the 40 to 90 ms
after it, where quiet follows (`phrase_end_drop_db`). That fall is how dry the voice is
(`dryness`): 13 dB or more is `dry`, 9 to 13 `some_room`, less `wet` (a reverb or a live room
holds the ends up), and `unknown` with fewer than three such ends. Three Questions' voice fell
8 dB; As One's, dry, 16. `loudness` has its integrated loudness, range and true peak.

With `referenceAssetId` the reference is measured the same way and the two are compared
(`compared`): `pitch_semitones` (positive when the voice is higher), `pace_ratio` (above 1 when it
is faster), and the fall and the loudness as differences (`phrase_end_drop_db_difference`,
positive when its ends fall further; `loudness_lu_difference`, positive when it is louder), so a
take can be held against the voice it must match. As One's voice was matched to the client's
reference this way. `start` and `end` (`referenceStart` and `referenceEnd`) measure a stretch, in
seconds; at most 20 minutes of each is read. `summary` says it all in words. Nothing is billed. A
long file answers `"measuring"` at first: ask again with the same `clientRequestId`, which follows
the measurement already started. A media service too old to measure a voice is refused with a
message saying so.

## Transcribing a recording

`transcribe_audio` reads a recording's words as they are said (an audio file or a video in the
library): `text`, punctuated, and `words`, each word's `text`, `start` and `end` in seconds, with
the brand's names spelt as the brand spells them. A recogniser hears a name as words it knows: the
two that read As One's reference spelt the client's name "Arixa" and "Erixus". So it is told the
names to listen for, and a word it hears within a couple of letters of a name is put right, in
`words` and where it stands in `text`; `corrections` lists each one, what was `heard`, what is
`written` and when (`at`). A word further from the name than that is left as heard. The names
(`terms` in the answer) are the brand kit's terms (`brandKitId`, else the studio's default kit)
and any `terms` given. `language` (two letters, ISO 639-1: `"en"`) saves it guessing; the answer's
`language` is the one it heard.

The media service first takes the speech out (mono at 16 kHz, kept out of the library), then
OpenAI hears it (whisper-1), billed to the studio's OpenAI account at its price a minute. A
recording of up to about an hour fits. When taking the speech out takes longer than the call waits
(40 seconds), it answers `"extracting"`: ask again with the same `clientRequestId`. One call
hears it: a call made while another with the same `clientRequestId` is being heard waits for that
transcript (answering `"transcribing"` if it isn't ready in time), so overlapping calls pay once.
Once heard,
the transcript is kept with its task, so the same `clientRequestId` reads it again instead of
paying for another (with the names and language it was first asked with). A refusal from OpenAI
says why and keeps nothing, and the same `clientRequestId` asks it again. The studio needs
`OPENAI_API_KEY` set, and a media service new enough to take the speech out; without either it
says so before anything starts.

## Making music

`generate_music` makes a track with Eleven Music into the music library, as the Music page does,
and waits for it (a minute or two; up to five). It is billed in the account's ElevenLabs
credits and recorded before it is asked for. The same `clientRequestId` returns the first track
(made, failed or uncertain) instead of paying again. A track whose answer was lost is settled as
uncertain and never made again by itself.

- **From a prompt**: `prompt` with its length in `seconds`. `instrumental` (on by default) rules
  out vocals.
- **From a composition plan** (`plan`, Eleven Music v2 and v2.5): the song as `chunks` of fixed
  lengths, 3 to 120 s each and up to 10 minutes in all. Each chunk has its `text` (its section's
  name in square brackets, then any lyrics), its `positiveStyles` and any `negativeStyles` and
  `contextAdherence`. The plan fixes where each part starts, which is how a film's drops are made
  to land on its cuts. It takes a `seed`, and the `prompt` is kept as the track's description,
  with the plan's outline (each part and where it falls) and a fingerprint, so another plan or
  seed is never taken for the same music. The whole plan is kept with the track's file. For an
  instrumental, give no lyrics and put `vocals` among the negative styles.

The answer has the track's `trackId` and `assetId`, its `status`, `durationSeconds`, `model`,
ElevenLabs' `songId`, and `duplicate: true` when the request had made it already. Its licence is
the library's AI music licence. Its bars are found in the Editor's Music panel, and then
`get_music_structure` and `fit_music` work on it.

### A track at another tempo

`change_music_tempo` makes a library track again at another tempo, its pitch kept, as a new
track in the music library (the Music page's **Change tempo**). It is for a track whose tempo
isn't the cut's: Reel 2's cut was paced to a 120 BPM score and approved, then put under Reel 1's
track, which runs at 129. That track was slowed 7.0% and cut on its own bar lines, and every cut
and anchor stayed on its beat.

- `bpm` is the tempo it is to play at. `fromBpm` is the tempo it plays at now: the track's own
  (from its bars) unless given.
- Name the track by `trackId`, or by its library file (`assetId`).
- The media service makes it with Rubber Band (or FFmpeg's `atempo` where Rubber Band is
  missing), as lossless FLAC. Nothing is billed.
- The call waits for it, a minute or so. The same `clientRequestId` returns the same track.
- The new track keeps the original's licence, credit and rights, and its notes say how far its
  tempo was moved. A tempo can be halved or doubled at most.
- Past about 12% a change of tempo can be heard, and the answer's `note` says so.
- Find its bars in the Editor's Music panel before `fit_music` plans it on them.

### How a fitted piece comes in

`fit_music` joins its pieces 20 ms ahead of a bar line, under a 30 ms crossfade centred on the
join. Where the music runs on through the join, the crossfade is the blend. It plays the last
35 ms of the bar before the new piece's own, though, and a piece cut out of quiet onto a bar its
track is already loud in (a stop's bass hit, the middle of the biggest section) then arrives 35
ms early. Reel 2's four statements, each cut onto a bass hit, were measured 35 to 40 ms ahead of
their cuts, and so were the score's stabs.

So such a piece comes in on its bar line instead. Its `enter` says how far past its start the
bar line is (20 ms for a fit's splice). The piece before fades out over the 30 ms ending on that
bar line, and this one comes in over the last 3 ms of it, whole on the bar. A fit chooses it from
the level either side of each bar line, measured when a track's bars are found:

- the piece's track is more than 6 dB louder over the 35 ms before its bar line than the piece
  before it is over its own;
- and those 35 ms are within 12 dB of the bar's first 100 ms (music, not the quiet before an
  attack).

A track whose bars were found before these levels were measured is fitted under crossfades as
before; find its bars again in the Music panel to have them. A media service older than this
plays such a join as an ordinary crossfade (its health lists `music_pieces_on_the_bar` when it
can do it).

## Costs and stages

Every generation has a price. It is the charge Higgsfield reported (`actual_cost_usd`, with
`cost_source: "provider"`), or, when its result carried none, its estimate
(`estimated_cost_usd`), marked by where it came from:

- `provider_estimate`: Higgsfield's quote for the request;
- `metered_estimate`: its metered rate (per 1,000 video tokens) for the request's size and length;
- `unit_estimate`: a price per image, per request or per second that its pricing states, with
  credits at 16 to the dollar;
- `list_price`: for pricing the studio doesn't follow, the list price an admin set for the model
  on the Usage page.

A run with none of these is unpriced, never given a made-up figure; the Usage page lists its
model for an admin to price. List prices need migration `0028_generation_costs`.

A stage (`estimate_stage`, `queue_stage`) is checked whole before any of it is queued. Its total
(every take of every item) with `retakeAllowance` must fit what is left on the Higgsfield API
balance (the figure an admin recorded from the Console, less what was spent and is held since)
and the spending limit that applies: the project's or campaign's, else your monthly cap for work
outside both.

## Rights and credits

Every library file has a source, a licence and a status for public use: `cleared`, `to_confirm`
or `not_cleared`, with the credit line owed where there is one. Until someone records them
(`set_asset_rights`, or the file's details in the library) they are worked out:

- music from the library takes its track's licence and credit, read from the music library;
- what the studio made is under its provider's terms, said by name (Higgsfield's for a
  generation or a Katana video, ElevenLabs' for a voiceover made in the Voice tab), and is
  `to_confirm` when a file it was made from isn't cleared;
- what the studio rendered or cut from a file follows what it was made from;
- uploads and imports (`import_image`, `import_audio`, `import_video`) are `to_confirm`.

What is recorded stands instead, with who set it and when, and who confirmed it (`cleared` or
`not_cleared`) and when. A music track's licence and credit stay the music library's: only its
status and notes are recorded. A licence that has run out is never cleared.

`render_edit` takes the edit's credits with it, to the rendered video. With `publicUse: true` it
is held, and nothing starts, until every file the edit uses is cleared, or you confirm the files
that aren't as exceptions (`confirmExceptions: true`, or their asset ids). Who confirmed them, and
when, is kept with the render. Recording rights and rendering for public use need migration
`0027_asset_rights`; until it is applied, rights are worked out and can be read.

## A presenter video, end to end

The flow that made the Aurixa "Janice presents" video:

1. **Prepare the voiceover.** In the app, attach it in Create, confirm the speaker's consent and
   press "Prepare for lip sync". Its preparation id is in the page's address and in
   `get_long_video`.
2. **Start the video** with `start_presenter_video`:

   ```json
   {
     "title": "Aurixa: Janice presents",
     "modelId": "<Wan 2.7 image-to-video, from list_models>",
     "startImageAssetId": "<the approved chest-up still>",
     "voiceoverPreparationId": "<the preparation>",
     "presenter": { "who": "The woman", "where": "her office at dusk" },
     "values": { "resolution": "720p" },
     "brollLines": [1, 3, 5],
     "lipCheck": true,
     "takes": 3,
     "clientRequestId": "aurixa-janice-run-1"
   }
   ```

   The voiceover is cut on the 30 fps grid where nobody is speaking. Every clip starts from the
   still, and no clip is made for the lines in `brollLines` (or for the stretches given in
   `cutaways`). The prompt locks the camera.

   Each clip's lips are scored with SyncNet. Real speech scores about 6 to 8. A clip under 4 is
   made again, up to `takes` takes, and a clip under 6.5 is flagged. A lip lead of a frame or two
   is taken out when the clip is laid in the edit.

3. **Follow it** with `get_long_video`. For a weak clip, `steer_clip` with `action: "redo"` makes
   another take, and `choose_take` swaps between the takes kept.
4. **Fill the B-roll.** Generate it with `queue_generation`, check it with `check_text`, then call
   `set_cutaway_fill` for each cutaway.
5. **Lay it out** with `open_in_editor`. Pass `script` and the brand's names in `terms` for exact
   captions, and add `titles` and `musicAssetId`. The project's brand kit (else the team's
   default) styles the titles and captions.
6. **Brand and render.** `apply_brand_kit` with `endCard: {"seconds": 3, "area": "tiktok"}`, then
   `render_edit`, and poll `get_render` for the link.

## A storyboard from a brief

`import_storyboard_brief` takes a brief written as data, in the shape Reel 1's
`scripts/aurixa-reel-1/system_edition.py` writes `brief.json`: shots, each with its block, title,
sources, beats, on-screen text, times and voiceover lines. Each block becomes a scene and each shot
a shot, keeping everything the brief says about it in its spec, with its cue (the words it starts
on). In Storyboards, **Time from the voice** then cuts each shot in the pause before its cue, from
a prepared voiceover's measured words.

## Review gates

A project's reviews (the Reviews tab on its page) are gates in order, such as Style frames,
Animatic, Proof and Film. Each holds versions of what is being reviewed (library stills or videos,
a render, a storyboard), comments pinned to a time or a frame and optionally a point on the
picture, and decisions. An admin applies migration `drizzle/migrations/0030_review_gates.sql`
first.

- **Who may approve.** Any active team member: in the app as themselves, or through the API as
  the token's owner, with a token that has the `edit` scope. Every decision records who made it,
  when, and whether it came through the app or the API. `onBehalfOf` names someone outside the
  team who decided, such as a client who approved on a call. A decision is never changed or
  removed: a new one supersedes it.
- **What is decided.** Only a gate's latest version. A new version puts the gate back in review.
- **Holds.** A gate held until the one before it is approved takes no version, and can't be
  approved, until then. A new version in the gate before holds it again.

A script runs them like this:

1. `add_review_gate` for each stage (`heldUntilPrevious` after the first), or add them in the app.
2. `add_review_version` with the stills, the render (once `get_render` says it is complete) or the
   storyboard.
3. `comment_on_review` for each point, pinned where it applies, and `decide_review` once the client
   has answered.
4. `list_review_gates` shows where every gate stands.

## Motion graphics

Motion graphics are drawn from the studio's templates in a brand kit (see `docs/compositions.md`):
the graphics kit Reel 1 was built from, brand cards, and product pages drawn from the kit's demo
record. Drawing one costs no credits, so these need the `edit` scope (reading them, `read`). An
admin applies migration `drizzle/migrations/0034_compositions.sql` first.

| Operation               | What it does                                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_motion_templates` | The templates: each one's `id`, `version`, what it draws, how long it may run (`seconds`), its `settings` (kind, limits, meaning) and its `defaults`.     |
| `draw_motion_graphic`   | Draws one: a `template` with its `params` and `seconds`, in a `brandKitId`, as a `draft` or `final`. `sequenceId` draws it at that edit's frame and rate. |
| `get_motion_graphic`    | A drawing's status, progress and estimate; once completed, the library video (`assetId`) a clip plays, and what was drawn (`spec`, kit, frame, `hash`).   |
| `set_demo_record`       | Sets the fictional record a kit's product screens show (its people, records, figures and lists). `null` goes back to the studio's own.                    |

The same composition is never drawn twice: drawing it again (the same template, settings, kit,
demo record, frame, rate and quality) returns the drawing already made, with `cached: true`. A
script puts one in an edit like this:

1. `draw_motion_graphic` with the edit's `sequenceId`, then `get_motion_graphic` until it is
   `completed`.
2. `update_edit` with a video clip playing its `assetId`, its `composition` set to
   `{ "spec": <the drawing's spec>, "brandKitId": <its kit>, "renderId": <its renderId>, "quality": "draft", "renderedKey": null }`,
   and its `duration` the drawing's length.
3. `render_edit`: the render draws each motion graphic final at the edit's frame first (or reuses
   one drawn before), and the render's `stage` says how many are drawn while it waits.

A template's text can name the demo record as `{{entity.field}}` (`{{record.title}}`,
`{{client.name}}`). `set_demo_record` changes what every one of them says the next time it is
drawn; a field the record lacks is left blank, and `get_motion_graphic` lists it in `missing`.

## A logo in motion, end to end

Video models garble lettering, so Reel 1's logo was moved without a model ever drawing a letter
(the clean-plate recipe). Every step's result is a file in the library.

1. **Start it** with `start_clean_plate` and the logo's `artAssetId`. The studio's AI proposes
   boxes over the lettering; or pass `lettering`, a transparent file of it, whose alpha is the
   mask.
2. **Use the mask** with `set_clean_plate_mask`, changing `boxes`, `grow` or `feather` first if
   they need it. The mask is drawn into the library.
3. **Take the lettering out.** Price it with `estimate_clean_plate_step`, then
   `queue_clean_plate_step` with `step: "edit"` and an image model that takes a picture. Once the
   edit is in the library it is blended into the art by itself: only inside the mask, so every
   other pixel is the art's own.
4. **Animate the clean plate.** `queue_clean_plate_step` with `step: "animate"`, a video model, a
   prompt and `end` (`"last"` needs a model with an end frame). The prompt always ends by asking
   for no lettering.
5. **Follow it** with `get_clean_plate`. The take is aligned and colour-matched to the plate
   (`align_take`), then the art's own letters are laid back over it. The last step's file is the
   finished shot.

## A client's screen as a reference

A screenshot of a real client's screen shows how it is laid out, and may show real people's
names, emails, phone numbers and addresses. Imported as a reference it is kept private:

1. **Import it** with `import_image` and `reference: {}`. It goes into a private store, never the
   library, and is read for what it must not show: emails and phone numbers by their pattern,
   names and addresses by the studio's AI. What it says is never kept, only the boxes.
2. **Check the boxes** with `get_redaction`. Each box's label hides most of what it covers.
3. **Blur them** with `apply_redaction`, giving `boxes` to add one the reading missed or leave one
   out. The media service blurs them in a copy, every other pixel as it was. The copy joins the
   library marked layout only, and the original is deleted (`keepOriginal` keeps it where only
   admins can open it).

A layout-only file stays in the library to look at and build from, but nothing can place it in a
frame: a generation, an estimate, an edit made or changed here, a render or a copy made from it is
refused, and the refusal names the file and what to do. Only an admin can lift the mark
(`set_layout_only`). The studio needs a database update (migration 0035_reference_privacy) for
any of this; until then `import_image` with `reference` says so.
