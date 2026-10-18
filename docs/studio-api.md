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
| `read`     | Reading models, library files, generations, long videos, edits, renders and brand kits.          |
| `generate` | Queuing generations, starting and steering long videos, and the text check. These spend credits. |
| `edit`     | Making and changing edits, applying brand kits, and rendering.                                   |

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

| Operation         | What it does                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `whoami`          | The member the token acts as, their role and the token's scopes.                                                                                                              |
| `list_models`     | The models the studio offers, filtered by `output`, `search` or `lipSync`. For each: the media inputs it takes (by role) and its parameters, with their options and defaults. |
| `list_assets`     | Library files, newest first, filtered by `kind`, `projectId` or `search`.                                                                                                     |
| `get_asset`       | One file: what it is, a download link, its measured frame rate and any text check kept with it.                                                                               |
| `get_generation`  | A generation's status and cost, and the files it made once it is done.                                                                                                        |
| `get_long_video`  | A long video and every clip: status, piece of voiceover, lip score, framing and mouth-in-pause readings, character check, file and kept takes.                                |
| `get_edit`        | An edit's title and version, its latest render, and its timeline if `includeTimeline` is set.                                                                                 |
| `get_render`      | A render's progress and, once it is done, the video's library id and link.                                                                                                    |
| `list_brand_kits` | The team's brand kits.                                                                                                                                                        |
| `list_characters` | The team's characters: their look, how many reference images they have, and their Soul IDs (one per Soul model) with each likeness score and approval.                        |
| `get_character`   | One character: their reference sheet and training photos (with links), Soul IDs and the state of their latest Soul ID training.                                               |

**Generate** (`generate` scope; spends credits):

| Operation               | What it does                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queue_generation`      | One image or video. Takes `modelId`, `parameters` and `inputs` (`[{assetId, role}]`) plus a `clientRequestId`. With `characterIds` the characters keep their likeness: on a Soul model their Soul ID is used, elsewhere their reference sheet goes in as reference images and their look into the prompt. Poll it with `get_generation`. |
| `make_soul_still`       | One photographic still of a character from their Soul ID, in the `scene` described, at an `aspectRatio`: their truest likeness, and the best start frame for a video of them.                                                                                                                                                            |
| `train_soul_id`         | Trains a character's Soul ID for one Soul model (`v2`, `cinema` or `v1`) on at least 5 of their images. Started once: an unclear answer from Higgsfield is never retried unless you pass `confirmUncertain`. Only the character's maker or an admin can train it.                                                                        |
| `start_presenter_video` | A presenter speaking a prepared voiceover, with lip sync (see below).                                                                                                                                                                                                                                                                    |
| `steer_long_video`      | `continue`, `stop` or `check` a run.                                                                                                                                                                                                                                                                                                     |
| `steer_clip`            | `redo` a clip (optionally from another `startFrame`), `retry` it, `hold` or `release` it, `keep` it, or set its `start_frame`.                                                                                                                                                                                                           |
| `choose_take`           | Puts a clip's kept take back in use.                                                                                                                                                                                                                                                                                                     |
| `set_cutaway_fill`      | Chooses the B-roll for one of a presenter video's cutaways.                                                                                                                                                                                                                                                                              |
| `check_text`            | Reads the lettering in a generated picture or video and says whether it is garbled. A video answers `"sampling"` at first: ask again a few seconds later.                                                                                                                                                                                |

**Edit** (`edit` scope):

| Operation                     | What it does                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `open_in_editor`              | Lays a long video out as an edit. Takes captions from the script, titles on the voiceover's clock, music, and the brand kit's look. |
| `create_edit` / `update_edit` | Makes an edit from a timeline, or changes one. An update is accepted only at the version you read.                                  |
| `apply_brand_kit`             | Applies a kit's fonts and colours to the edit's text, and can add its end card inside a platform's safe area.                       |
| `render_edit`                 | Renders the edit at a version. Poll it with `get_render`.                                                                           |

Every operation that spends or makes something takes your own `clientRequestId` (8 to 64
characters). Sending the same request again returns the first result, so a retry never bills
twice.

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
