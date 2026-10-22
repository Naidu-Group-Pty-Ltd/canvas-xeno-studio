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

| Scope      | Allows                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------ |
| `read`     | Reading models, library files, generations, long videos, edits, renders and brand kits; pricing. |
| `generate` | Queuing generations, starting and steering long videos, and the text check. These spend credits. |
| `edit`     | Edits, brand kits on them and renders; importing pictures and audio; saving characters.          |

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

| Operation             | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `whoami`              | The member the token acts as, their role and the token's scopes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `list_models`         | The models the studio offers, filtered by `output`, `search` or `lipSync`. For each: the media inputs it takes (by role) and its parameters, with their options and defaults.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `list_assets`         | Library files, newest first, filtered by `kind`, `projectId` or `search`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `get_asset`           | One file: what it is, a download link, its measured frame rate and any text check kept with it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `get_generation`      | A generation's status and cost (with `cost_source`, see "Costs and stages"), and the files it made once it is done.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `get_long_video`      | A long video and every clip: status, piece of voiceover, lip score, framing and mouth-in-pause readings, character check, file and kept takes.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `get_edit`            | An edit's title and version, its latest render, and its timeline if `includeTimeline` is set.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `get_render`          | A render's progress and, once it is done, the video's library id and link, its `mix_report` (the voice's margin over the music in the speech band by section, and the mix's loudness) and any `stems`.                                                                                                                                                                                                                                                                                                                                                                               |
| `list_brand_kits`     | The team's brand kits, each with its mood, the style line generations in it carry, what kind of brand it is, and the formulas written for it by name (`get_brand_kit` has its whole DNA).                                                                                                                                                                                                                                                                                                                                                                                            |
| `get_brand_kit`       | One brand kit's whole design system: palette with roles, typefaces, the look of its imagery, its voice and rules, the lines generations carry, its style reference images, its DNA (kind of brand, market, archetype, positioning, who it serves, what it sells, what buyers use instead, its guardrails, pillars, buying moments, proof, distinctive assets, channels, goal), the content formulas it works with (`writtenForBrand` for its own), the formulas written for it, and its `production` roles and motion with their sources and checks (`includeCss`: as CSS).          |
| `read_brand_code`     | Reads the styling code of up to six GitHub repositories together (`repos`; the first is the brand's own, a branch or folder can be named in its address), as text and never run: each colour with the tokens that name it and the repository, file and line each is declared on; the typefaces and how they load; the radius, shadow, motion, blur and gradient scales; where the repositories disagree. `includeCss` adds `tokensCss`, the tokens as one stylesheet. Nothing is kept. Private repositories need the studio's `GITHUB_TOKEN`, or a `githubToken` for this read only. |
| `list_brand_formulas` | The content formulas (proven structures for videos and posts, each with its research), ranked for a brand's DNA with `brandKitId` and for a `goal`, `channel` and `seconds`; with `brandKitId`, the formulas written for the brand come first (`writtenForBrand`, with the `audience` each is for). Each says why it fits, what to watch for, and how strong its evidence is (`A` measured, `B` platform guidance or research, `C` convention).                                                                                                                                      |
| `get_brand_formula`   | One formula written out for a length and channel: its beats timed (what each must do, show and say), its rules with the channel's own, its guardrails, why it works and its sources, plus a `brief` to plan or script from. A formula written for a brand needs its `brandKitId`, and says what it was written after (`basedOn`), who it is for and how often it runs.                                                                                                                                                                                                               |
| `list_characters`     | The team's characters: their look, how many reference images they have, and their Soul IDs (one per Soul model) with each likeness score and approval.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `get_character`       | One character: their reference sheet and training photos (with links), Soul IDs and the state of their latest Soul ID training.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `estimate_generation` | The provider's price for a generation without making it: the same `modelId`, `parameters`, `inputs`, `characterIds` and `brandKitId` as `queue_generation`, priced as they would be sent. Nothing is billed.                                                                                                                                                                                                                                                                                                                                                                         |
| `list_review_gates`   | A project's review gates in order (see below): each gate's state, whether it is held until the one before is approved, its versions newest first (their files, render or storyboard), the latest decision on each (who, when, its note and on whose behalf), the comments (counted, or whole with `includeComments`), and the notes given on it with their shots and whether each is done.                                                                                                                                                                                           |
| `get_asset_rights`    | Library files' rights (`assetIds`): each one's source, licence and status for public use (`cleared`, `to_confirm` or `not_cleared`), the credit line owed, and who set and confirmed it and when (see "Rights and credits").                                                                                                                                                                                                                                                                                                                                                         |
| `get_edit_credits`    | An edit's credits: every file it uses and how, each one's licence and status, the credit lines owed, and which files aren't cleared.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `estimate_stage`      | Prices a list of `generations` together (each as `estimate_generation` would, every one of its `takes`), adds `retakeAllowance` (a fifth again unless given), and checks the total against the Higgsfield API balance and the spending limit that applies. Says whether it `fits`, and why not, with each item's price and `costSource`. Nothing is billed.                                                                                                                                                                                                                          |

**Generate** (`generate` scope; spends credits):

| Operation               | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queue_generation`      | One image or video. Takes `modelId`, `parameters` and `inputs` (`[{assetId, role}]`) plus a `clientRequestId`. With `characterIds` the characters keep their likeness: on a Soul model their Soul ID is used, elsewhere their reference sheet goes in as reference images and their look into the prompt. With `brandKitId` it is made in that brand's look (its style line in the prompt, what it never shows in the negative prompt). Poll it with `get_generation`. |
| `queue_stage`           | A whole stage, or none of it: priced and checked as `estimate_stage` checks it, and refused with nothing queued when it doesn't fit, an item can't be sent, or part of it can't be priced (unless `allowUnpriced`). Then every take is queued through `queue_generation`'s checks. The same `clientRequestId` returns its generations.                                                                                                                                 |
| `make_soul_still`       | One photographic still of a character from their Soul ID, in the `scene` described, at an `aspectRatio`: their truest likeness, and the best start frame for a video of them. Takes a `brandKitId` too.                                                                                                                                                                                                                                                                |
| `train_soul_id`         | Trains a character's Soul ID for one Soul model (`v2`, `cinema` or `v1`) on at least 5 of their images. Started once: an unclear answer from Higgsfield is never retried unless you pass `confirmUncertain`. Only the character's maker or an admin can train it.                                                                                                                                                                                                      |
| `start_presenter_video` | A presenter speaking a prepared voiceover, with lip sync (see below).                                                                                                                                                                                                                                                                                                                                                                                                  |
| `steer_long_video`      | `continue`, `stop` or `check` a run.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `steer_clip`            | `redo` a clip (optionally from another `startFrame`), `retry` it, `hold` or `release` it, `keep` it, or set its `start_frame`.                                                                                                                                                                                                                                                                                                                                         |
| `choose_take`           | Puts a clip's kept take back in use.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `set_cutaway_fill`      | Chooses the B-roll for one of a presenter video's cutaways.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `check_text`            | Reads the lettering in a generated picture or video and says whether it is garbled. A video answers `"sampling"` at first: ask again a few seconds later.                                                                                                                                                                                                                                                                                                              |

**Edit** (`edit` scope):

| Operation                     | What it does                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `save_character`              | Makes a character from library images, or changes one (`characterId`): name, look, sheet images by view, training photos.           |
| `import_image`                | Puts a PNG, JPEG, WebP or GIF (up to 15 MB) into the library, from base64 `data` or an https `url`.                                 |
| `import_audio`                | Puts a WAV, MP3, M4A or FLAC into the library as music, a sound effect or an edit's voiceover (see "Importing audio").              |
| `open_in_editor`              | Lays a long video out as an edit. Takes captions from the script, titles on the voiceover's clock, music, and the brand kit's look. |
| `create_edit` / `update_edit` | Makes an edit from a timeline, or changes one. An update is accepted only at the version you read. Pauses: below.                   |
| `apply_brand_kit`             | Applies a kit's fonts, colours and title motion to the edit's text, and can add its end card inside a platform's safe area.         |
| `render_edit`                 | Renders the edit at a version, its credits with it. Poll it with `get_render`. `publicUse` holds it until every file is cleared.    |
| `import_storyboard_brief`     | Makes a storyboard from a brief in brief.json's shape: a scene a block, a shot a shot, each keeping its record and its cue.         |
| `add_review_gate`             | Adds a review gate to a project, last in its order; with `heldUntilPrevious` it waits for the gate before to be approved.           |
| `add_review_version`          | Puts library stills or videos (`assetIds`), a finished render or a storyboard up for review in a gate, as its next version.         |
| `comment_on_review`           | Comments on a version, pinned to a time (`at`) or `frame`, a `point` on the picture, one of its files or a storyboard's shot.       |
| `decide_review`               | Approves a gate's latest version, or asks for changes, as the token's owner; `onBehalfOf` names a client who decided.               |
| `set_asset_rights`            | Records a file's rights: its `status` and any `source`, `licence`, `licenceUrl`, `creditLine` or `notes`; `clear` forgets them.     |

Every operation that spends or makes something takes your own `clientRequestId` (8 to 64
characters). Sending the same request again returns the first result, so a retry never bills
twice.

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
- uploads and imports (`import_image`, `import_audio`) are `to_confirm`.

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
