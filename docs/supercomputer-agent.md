# The Supercomputer agent

With Claude connected, the Supercomputer works as an agent: it thinks a request through, looks
things up (the library, the models, the team's characters and brands, the web), makes images and
videos, looks at what came back and refines it, and writes scripts and plans beside the
conversation. Everything it does is shown as it happens, and nothing that spends Higgsfield credits
runs without a person's say-so, unless the conversation allows it up to an amount.

Without it, the Supercomputer keeps its one-answer mode (ideas and ready-to-run drafts from the
studio's own AI), and every conversation from before stays readable.

## Setup

1. An admin adds an `ANTHROPIC_API_KEY` backend secret.
2. An admin applies migration `drizzle/migrations/0022_supercomputer_agent.sql`, after 0020 and
   0021 (migrations go in order). It adds a conversation's settings and pin, the states an answer
   can be in (streaming, waiting for an approval, stopped), and the memories table.

The page switches over by itself once both are in. Until then admins see a note on the page
saying what is missing (it can be hidden).

Working in sections (below) also needs migration `drizzle/migrations/0036_agent_sections.sql`: a
plan's tables and a worker's conversation. Until it is in, everything else runs as before and the
agent says its sections need the update.

## In a conversation

- **Models.** Claude Opus 5.5 (the default), Sonnet 5.5 or Haiku 5.5, chosen per conversation,
  with how hard it thinks (Quick to Maximum, Thorough by default). A new conversation starts with
  the last model and effort chosen in that browser.
- **Fallback.** On Opus and Sonnet, server-side fallback is on (`fallbacks: "default"`): if
  Claude's safety checks decline a request, it is run again on the model Anthropic recommends for
  that kind of decline, and the answer says which model took over. If that happens part-way, what
  the first model had started (its thinking and tool calls) isn't run or sent on; its words stay.
  Fallback doesn't cover an overloaded or rate-limited model: the answer says so, and Try again
  redoes it.
- **What it shows.** Its thinking (folded, summarised), its words in markdown, every tool call with
  what it was asked and what came back, web searches with their sources, and what it made: pictures
  and videos as they finish, documents, brand imports, characters, edits and memories.
- **Spending.** A call that spends credits (a generation, a Soul ID still or training, a presenter
  video, continuing a long video, redoing a clip) waits as a card showing what it would do and the
  provider's estimate. Approve or Decline; Approve all when several wait at once. The answer then
  carries on from where it was. The coin button lets a conversation go ahead on its own with
  actions up to $0.50 to $10 each (never more than $25); anything without an estimate always asks.
  Sending a new message instead declines what was waiting.
- **Editing and redoing.** Editing an earlier message replaces it and everything after it, and the
  conversation picks up from there. Try again gives a fresh answer to the last message. The
  replaced messages are kept in the database but are no longer part of the conversation.
- **Stopping.** The stop button or Esc stops an answer part-way. An answer can also be stopped from
  another page or tab: the server notices within a few seconds. Closing the page stops the answer
  too.
- **Context.** A conversation's project, campaign, brief and brand go with every message: in full
  when they are new to the conversation, and the memories with its first message. A brief goes as
  its summary; the agent reads the document itself, page by page, with `read_brief`.
- **Made here.** The documents a conversation wrote (to read, copy, or download as markdown) and
  everything it generated, in one panel.
- **Memory.** What it keeps between conversations: a person's own preferences, or the team's. It
  keeps them itself when asked ("remember that…") and they can be added and forgotten by hand
  (Memory, top right). Only whoever kept a memory, or an admin, can forget it.
- **Slash commands.** `/make`, `/brainstorm`, `/drafts`, `/film`, `/research`, `/critique`,
  `/script`, `/brand` and `/remember` start a message.

Anyone on the team can read a conversation (Team in the sidebar); only whoever started it, or an
admin, can continue it. Chats can be pinned to the top.

## What it can use

| Tools                                      | What they do                                                                                                                                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_models`, `get_model`                 | The generation models, compactly, then one in full.                                                                                                                                                                   |
| `estimate_generation`                      | The provider's price for a generation, without making it.                                                                                                                                                             |
| `queue_generation`                         | Makes an image, video or audio (asks first), with references, characters (their Soul IDs on Soul models) and the conversation's brand.                                                                                |
| `wait_for_generation`                      | Waits up to two and a half minutes for one to finish.                                                                                                                                                                 |
| `view_media`                               | Looks at library files (videos by their poster frame), up to six at once.                                                                                                                                             |
| `propose_drafts`                           | Ready-to-run drafts, ideas and an edit plan for the person to look over and run themselves.                                                                                                                           |
| `write_document`                           | A script, shot list, plan or report shown beside the conversation.                                                                                                                                                    |
| `read_brief`                               | The conversation's brief in its own words, a few pages at a time: the context carries only its summary, so a long prompt pack's shots, cast and timings are read from here.                                           |
| `import_brand`                             | Reads a brand's design system from its website, for review on the Brand page.                                                                                                                                         |
| `import_brand_code`                        | Reads a brand's design system from the code of its GitHub repositories (every token with the file and line it is declared on), for review on the Brand page. Private repositories need the studio's `GITHUB_TOKEN`.   |
| `remember`, `forget`                       | Memories kept between conversations.                                                                                                                                                                                  |
| `web_search`, `web_fetch`                  | Searches the web and reads pages.                                                                                                                                                                                     |
| `list_brand_formulas`, `get_brand_formula` | The content formulas ranked for the brand's DNA, then one written out with its beats timed to the length and channel (docs/brand-dna-and-formulas.md). Content made in a brand follows one, and the agent says which. |
| The studio API's operations                | The library, generations, long videos, characters and Soul IDs, brand kits, presenter videos, edits and renders (docs/studio-api.md), as the person.                                                                  |
| `plan_sections`, `start_sections`          | Splits an edit, a long video or a storyboard into sections and makes their integration edit; gives sections to workers (below).                                                                                       |
| `get_sections`                             | Where a plan stands: every section's state, steps and work, and every join's check. A worker sees its own brief again, with its neighbours' frames.                                                                   |
| `check_joins`, `fix_join`                  | Checks the joins between sections on both sides, and puts one right (a smart blend or colour match on the edit, or a section's shot made again).                                                                      |
| `save_section`, `finish_section`           | A worker saves its shots as each is right (straight into the integration edit), and ends its section.                                                                                                                 |

A turn takes at most 32 steps (it says so and stops; "go on" continues it), and each step writes
at most 32,000 tokens. A section's worker takes what its section's limit leaves (below).

## Working in sections

For a reel too large for one run, the agent works the way Reel 1's third cut was built by six
workers: one owner per run of shots, one integration edit, every join between owners checked on
both sides, and each shot saved as soon as it is right.

- **Planning.** Asked to build an edit, a long video or a storyboard in sections, the agent splits
  it into runs of whole shots (`plan_sections`): as many as the work needs (at most 10), of even
  work, breaking between scenes first, then at cuts, and only last where one shot carries straight
  on across the cut. The split can be chosen by hand (the shot numbers sections start at). It makes
  the integration edit every section merges into: an edit copied whole, a long video laid out as
  its own edit does it (smart-blended joins), a storyboard compiled from its takes.
- **Step limits from the work.** Each section's limit is set from its shots: a shot already made is
  looked at and saved (2 steps), a still to make is priced, generated, waited for, looked at and
  saved (5), a video the same with a second wait (6), a section opening on a continuous join one
  more to match it, and every section two of its own (its brief and its finish), with a quarter's
  room to redo a shot, at least 6 and at most a turn's 32.
- **Workers.** `start_sections` queues sections, and the conversation's page gives each to its
  worker in turn: a conversation of its own (seen from the plan, not listed with the others), in
  the same project, brief, brand and spending settings, sent a brief from the studio that names its
  shots and carries its neighbours' last and first frames (stills taken from the reel's media by
  the media service, shown to it as pictures), so it starts and ends where they meet it.
- **Saving before the limit.** A worker saves each shot as soon as it is right (`save_section`),
  straight into the integration edit, and ends with `finish_section`. A fifth of its steps before
  its limit (two at least) it is warned, in the next message it reads, and the studio keeps what it
  made but didn't save; at the limit the studio does so again and stops it. Nothing done is lost:
  saved shots are in the edit, and anything made but not placed is kept with its section and named
  in its next brief. Carry on raises a spent limit by what its unsaved shots need.
- **Spending.** A worker asks before it spends exactly as any conversation does, within the
  planning conversation's own allowance; its approvals are answered in the Sections panel.
- **Joins.** As sections finish, the frames either side of each join are taken from the
  integration edit's clips, and checked (by the page on its own once no section is queued, or with
  `check_joins`, or Check the joins in the panel) by the studio's AI for framing, colour and
  continuity, with the last render's smart-join measurement and the character and lettering
  checks. A join holds to what it is: one shot carrying straight on
  must be the same picture either side; a cut within a scene keeps its grade and continuity; a cut
  to another scene only its cast and lettering. What doesn't match is said, with its fixes: a smart
  blend or colour match on the edit (free; the next render does it), or the section on one side
  queued to make its shot again, with a note.
- **The panel.** Sections (top right, or the plan's card) shows each section's state, its steps
  against its limit, what its worker saved and said, and its worker's conversation live; and each
  join's two frames, its check and its fixes. Run all, Stop, Stop after this one, Check the joins.

**One after another, not side by side.** The agent's runtime gives a request to one open page, with
six connections at once, and a turn its 32 steps, so workers don't run concurrently inside one
request. Each worker's turn is its own request instead, and the page starts the next queued
section when one ends (while the conversation's own turn isn't streaming), so a plan carries on
across requests: closing the page stops the worker working then, and the rest wait, queued, until
the page is open again.

## For developers

The page talks to `POST /api/public/supercomputer-agent` with the person's session
(`Authorization: Bearer <Supabase access token>`) and reads a `text/event-stream` back. The body:

| Field                                | Meaning                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `threadId`                           | The conversation (left out or null: a new one).                                          |
| `text`                               | The message.                                                                             |
| `attachmentAssetIds`                 | Up to 16 library files.                                                                  |
| `projectId`, `campaignId`, `briefId` | The conversation's context (left out: it keeps its own).                                 |
| `settings`                           | `{model, effort, autoApproveUsd, brandKitId}`, any of them; kept with the conversation.  |
| `editMessageId`                      | An earlier message of the person's that this one replaces.                               |
| `regenerate`                         | `true`: a fresh answer to the last message.                                              |
| `approval`                           | `{messageId, decisions: {<tool use id>: "approve" or "deny"}}` for an answer that waits. |
| `section`                            | `{sectionId, extend?, note?}`: starts or carries on a section's worker (its own turn).   |
| `joins`                              | `{planId, again?}`: checks a plan's joins (no turn; `status` events only).               |

Each event is a JSON object (`src/lib/supercomputer/agent-events.ts`): `turn` first (the
conversation and the message ids), then `block`, `text`, `thinking`, `update`, `end` and `drop` to
build what is shown, `model`, `usage` and `title` as they happen, and `status` (`streaming`,
`awaiting_approval`, `complete`, `stopped` or `failed`) last. The same picture is saved with the
answer, so a page opened later shows exactly what streamed. Each answer also keeps its transcript
as Claude wrote it, which the page doesn't read; pictures in it are kept as references to the
library and signed again for each request.

The loop is `src/lib/supercomputer/agent-loop.server.ts`, its tools
`agent-tools.server.ts`, and the endpoint `agent-turn.server.ts`. Sections are
`sections.ts` (the sectioning, step limits, briefs, merge and join verdicts, pure),
`sections.server.ts` and `section-tools.server.ts`; a worker's turn is held by the loop's
`TurnBudget`.
